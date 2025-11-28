const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

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
    
    console.log('🔍 [ETAPA2] Iniciando busca de preços...');
    
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
            .join(' ') + ' preço novo Brasil 2024';
        
        console.log('🔎 [ETAPA2] Query de busca:', queryBusca);
        
        // Prompt para busca de preços
        const promptBuscaPreco = `Pesquise na web o preço de mercado atual (2024/2025) para o seguinte produto NOVO no Brasil:

Produto: ${nome_produto}
Marca: ${marca || 'qualquer marca'}
Modelo: ${modelo || 'modelo similar'}

Busque em sites confiáveis como Mercado Livre, Amazon, Magazine Luiza, Americanas, ou lojas especializadas.

Retorne APENAS um JSON válido com o seguinte formato:

{
  "preco_encontrado": true,
  "valor_mercado": 1500.00,
  "fonte": "Mercado Livre",
  "observacoes": "Baseado em produto similar novo"
}

Se NÃO encontrar preço confiável, retorne:

{
  "preco_encontrado": false,
  "motivo": "Produto muito específico sem referências de preço online"
}

IMPORTANTE: 
- Retorne APENAS JSON, sem markdown
- valor_mercado deve ser em reais (R$)
- Procure por produtos NOVOS para ter referência de mercado`;

        console.log('🤖 [ETAPA2] Inicializando modelo com Google Search...');
        
        // Modelo COM Google Search (grounding)
        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{
                googleSearchRetrieval: {
                    dynamicRetrievalConfig: {
                        mode: 'MODE_DYNAMIC',
                        dynamicThreshold: 0.3
                    }
                }
            }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json'
            }
        });
        
        console.log('📤 [ETAPA2] Enviando para Gemini com Google Search...');
        
        // Chamar Gemini com grounding
        const result = await model.generateContent(promptBuscaPreco);
        const response = result.response;
        const text = response.text();
        
        console.log('📥 [ETAPA2] Resposta recebida:', text.substring(0, 200));
        
        // Parse JSON
        let resultadoBusca;
        try {
            const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado:', resultadoBusca);
        } catch (parseError) {
            console.error('❌ [ETAPA2] Erro ao parsear JSON:', parseError.message);
            throw new Error('Resposta da busca não é um JSON válido');
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
                fonte_preco: resultadoBusca.fonte || 'Google Search',
                observacoes: resultadoBusca.observacoes || 'Valor estimado'
            },
            metadados: {
                data_busca: new Date().toISOString(),
                query_utilizada: queryBusca,
                modelo_ia: MODEL
            }
        };
        
        console.log('✅ [ETAPA2] Processamento concluído com sucesso!');
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores calculados com sucesso via Google Search'
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