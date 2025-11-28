const { VertexAI } = require('@google-cloud/vertexai');

// Configuração
const PROJECT_ID = 'gestech-imobilizados'; // seu project ID
const LOCATION = 'us-central1';
const MODEL = 'gemini-2.5-flash';

// Parse das credenciais da variável de ambiente
const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}');

// Inicializar Vertex AI
const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
    googleAuthOptions: {
        credentials: credentials
    }
});

// Dicionário de depreciação
const FATORES_DEPRECIACAO = {
    'Excelente': {
        'Equipamentos de Informática': 0.90,
        'Ferramentas': 0.85,
        'Instalações': 0.80,
        'Máquinas e Equipamentos': 0.85,
        'Móveis e Utensílios': 0.80,
        'Veículos': 0.85,
        'Outros': 0.75
    },
    'Bom': {
        'Equipamentos de Informática': 0.75,
        'Ferramentas': 0.70,
        'Instalações': 0.65,
        'Máquinas e Equipamentos': 0.70,
        'Móveis e Utensílios': 0.65,
        'Veículos': 0.70,
        'Outros': 0.60
    },
    'Regular': {
        'Equipamentos de Informática': 0.55,
        'Ferramentas': 0.50,
        'Instalações': 0.45,
        'Máquinas e Equipamentos': 0.50,
        'Móveis e Utensílios': 0.45,
        'Veículos': 0.50,
        'Outros': 0.40
    },
    'Ruim': {
        'Equipamentos de Informática': 0.35,
        'Ferramentas': 0.30,
        'Instalações': 0.25,
        'Máquinas e Equipamentos': 0.30,
        'Móveis e Utensílios': 0.25,
        'Veículos': 0.30,
        'Outros': 0.20
    }
};

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    console.log('🔍 [ETAPA2] Iniciando busca de preços com Grounding...');
    
    try {
        const { nome_produto, modelo, marca, estado_conservacao, categoria_depreciacao, numero_patrimonio } = req.body;
        
        console.log('📥 [ETAPA2] Dados recebidos:', { nome_produto, modelo, marca, estado_conservacao, categoria_depreciacao });
        
        // Validar campos obrigatórios
        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Nome do produto é obrigatório para buscar preço',
                dados: {}
            });
        }
        
        // Construir query de busca
        const queryBusca = [nome_produto, marca, modelo]
            .filter(x => x && x !== 'N/A')
            .join(' ') + ' preço novo Brasil 2024 site:mercadolivre.com.br OR site:amazon.com.br';
        
        console.log('🔎 [ETAPA2] Query de busca:', queryBusca);
        
        // Prompt para Google Search Grounding
        const promptGrounding = `Pesquise na web o preço de mercado atual para o seguinte produto NOVO no Brasil:

Produto: ${nome_produto}
Marca: ${marca || 'qualquer marca confiável'}
Modelo: ${modelo || 'modelo padrão'}

Busque em sites brasileiros como Mercado Livre, Amazon Brasil, Magazine Luiza, Americanas.

Retorne APENAS um JSON válido:

{
  "preco_encontrado": true,
  "valor_mercado": 1500.00,
  "fonte": "nome do site onde encontrou",
  "observacoes": "detalhes sobre o produto encontrado"
}

Se não encontrar preço confiável:

{
  "preco_encontrado": false,
  "motivo": "explicação breve"
}

IMPORTANTE: valor_mercado deve ser em reais (R$) e representar produto NOVO.`;

        console.log('🤖 [ETAPA2] Inicializando Vertex AI com Google Search...');
        
        const generativeModel = vertexAI.getGenerativeModel({
            model: MODEL,
        });
        
        const request = {
            contents: [{
                role: 'user',
                parts: [{ text: promptGrounding }]
            }],
            tools: [{
                googleSearch: {}
            }],
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.2,
                responseMimeType: 'application/json'
            }
        };
        
        console.log('📤 [ETAPA2] Enviando para Vertex AI com Google Search...');
        
        const response = await generativeModel.generateContent(request);
        const result = response.response;
        
        console.log('📥 [ETAPA2] Resposta recebida do Vertex AI');
        
        const resultText = result.candidates[0].content.parts[0].text;
        
        console.log('📝 [ETAPA2] Texto bruto:', resultText.substring(0, 200));
        
        // Parse JSON
        let resultadoBusca;
        try {
            const jsonText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado:', resultadoBusca);
        } catch (parseError) {
            console.error('❌ [ETAPA2] Erro ao parsear JSON:', parseError.message);
            console.log('📋 [ETAPA2] Texto completo:', resultText);
            throw new Error('Resposta não é um JSON válido');
        }
        
        // Verificar se encontrou preço
        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado:', resultadoBusca.motivo);
            return res.status(200).json({
                status: 'Falha',
                mensagem: `Não foi possível encontrar preço online. ${resultadoBusca.motivo || 'Insira manualmente.'}`,
                dados: {
                    preco_encontrado: false
                }
            });
        }
        
        // Calcular depreciação
        const valorMercado = resultadoBusca.valor_mercado;
        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';
        
        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.70;
        const valorAtual = valorMercado * fatorDepreciacao;
        
        console.log('💰 [ETAPA2] Valores calculados:', {
            valorMercado,
            fatorDepreciacao,
            valorAtual
        });
        
        const dadosCompletos = {
            numero_patrimonio,
            nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            valores_estimados: {
                valor_mercado_estimado: parseFloat(valorMercado.toFixed(2)),
                valor_atual_estimado: parseFloat(valorAtual.toFixed(2)),
                fator_depreciacao: fatorDepreciacao,
                percentual_depreciacao: `${((1 - fatorDepreciacao) * 100).toFixed(0)}%`,
                fonte_preco: resultadoBusca.fonte || 'Google Search via Vertex AI',
                observacoes: resultadoBusca.observacoes || 'Preço encontrado via busca na web'
            },
            metadados: {
                data_busca: new Date().toISOString(),
                query_utilizada: queryBusca,
                modelo_ia: MODEL,
                metodo: 'Google Search Grounding (Vertex AI)'
            }
        };
        
        console.log('✅ [ETAPA2] Processamento concluído com sucesso!');
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores encontrados via Google Search'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2] Erro:', error.message);
        console.error('❌ [ETAPA2] Stack:', error.stack);
        
        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao buscar preço: ' + error.message,
            dados: {
                preco_encontrado: false
            }
        });
    }
};