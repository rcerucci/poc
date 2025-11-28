const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuração da IA e Autenticação ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

// --- Dicionário de Fatores de Depreciação ---
const FATORES_DEPRECIACAO = {
    Excelente: {
        'Equipamentos de Informática': 0.9,
        Ferramentas: 0.85,
        Instalações: 0.8,
        'Máquinas e Equipamentos': 0.85,
        'Móveis e Utensílios': 0.8,
        Veículos: 0.85,
        Outros: 0.75
    },
    Bom: {
        'Equipamentos de Informática': 0.75,
        Ferramentas: 0.7,
        Instalações: 0.65,
        'Máquinas e Equipamentos': 0.7,
        'Móveis e Utensílios': 0.65,
        Veículos: 0.7,
        Outros: 0.6
    },
    Regular: {
        'Equipamentos de Informática': 0.55,
        Ferramentas: 0.5,
        Instalações: 0.45,
        'Máquinas e Equipamentos': 0.5,
        'Móveis e Utensílios': 0.45,
        Veículos: 0.5,
        Outros: 0.4
    },
    Ruim: {
        'Equipamentos de Informática': 0.35,
        Ferramentas: 0.3,
        Instalações: 0.25,
        'Máquinas e Equipamentos': 0.3,
        'Móveis e Utensílios': 0.25,
        Veículos: 0.3,
        Outros: 0.2
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
        const {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio
        } = req.body;

        console.log('📥 [ETAPA2] Dados recebidos:', {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao
        });

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Nome do produto é obrigatório para buscar preço',
                dados: {}
            });
        }

        const queryBusca = [nome_produto, marca, modelo]
            .filter(x => x && x !== 'N/A')
            .join(' ') + ' preço novo Brasil 2024';

        console.log('🔎 [ETAPA2] Query de busca:', queryBusca);

        const promptBuscaPreco = `Pesquise na web o preço de mercado atual (2024/2025) para o seguinte produto NOVO no Brasil:

Produto: ${nome_produto}
Marca: ${marca || 'qualquer marca confiável'}
Modelo: ${modelo || 'modelo padrão'}

Busque em sites brasileiros confiáveis (Mercado Livre, Amazon, Magazine Luiza, etc.).

Retorne sua resposta APENAS em formato JSON válido (sem markdown, sem texto adicional):

{
  "preco_encontrado": true,
  "valor_mercado": 1500.00,
  "fonte": "site onde encontrou",
  "observacoes": "detalhes do produto"
}

Se não encontrar preço confiável:

{
  "preco_encontrado": false,
  "motivo": "explicação breve"
}

CRÍTICO: Retorne APENAS o JSON, nada mais.`;

        console.log('🤖 [ETAPA2] Inicializando modelo com Google Search...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.2
                // NÃO usar responseMimeType com tools!
            }
        });

        console.log('📤 [ETAPA2] Enviando requisição para Gemini...');

        const result = await model.generateContent(promptBuscaPreco);
        const response = result.response;
        const text = response.text();

        console.log('📥 [ETAPA2] Resposta BRUTA recebida:');
        console.log('═══════════════════════════════════════');
        console.log(text);
        console.log('═══════════════════════════════════════');

        let resultadoBusca;

        try {
            // Limpar o texto
            let jsonText = text.trim();
            
            // Remover markdown
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            
            // Remover texto antes e depois do JSON
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
            
            jsonText = jsonText.trim();
            
            console.log('🧹 [ETAPA2] Texto limpo para parse:', jsonText);

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado:', JSON.stringify(resultadoBusca, null, 2));
            
        } catch (parseError) {
            console.error('❌ [ETAPA2] ERRO ao parsear JSON:', parseError.message);
            console.error('❌ [ETAPA2] Texto original:', text);
            
            throw new Error(`Resposta não é um JSON válido: ${parseError.message}`);
        }

        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado');
            return res.status(200).json({
                status: 'Falha',
                mensagem: `Não foi possível encontrar preço: ${resultadoBusca.motivo || 'Motivo não especificado'}`,
                dados: { preco_encontrado: false }
            });
        }

        console.log('💰 [ETAPA2] Preço encontrado:', resultadoBusca.valor_mercado);

        const valorMercado = parseFloat(resultadoBusca.valor_mercado);
        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';

        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        console.log('📉 [ETAPA2] Depreciação:', fatorDepreciacao, 'Valor atual:', valorAtual);

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

        console.log('✅ [ETAPA2] Processamento concluído!');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores calculados com sucesso via Google Search'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);
        console.error('❌ [ETAPA2] Stack:', error.stack);

        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao buscar preço: ' + error.message,
            dados: { preco_encontrado: false }
        });
    }
};