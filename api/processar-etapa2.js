const { VertexAI } = require('@google-cloud/vertexai');

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'gemini-1.5-pro';

const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
    googleAuthOptions: {
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}')
    }
});

// Dicionário de depreciação (exemplo simplificado)
const FATORES_DEPRECIACAO = {
    'Excelente': { 'Equipamentos de Informática': 0.90 },
    'Bom': { 'Equipamentos de Informática': 0.80 },
    'Regular': { 'Equipamentos de Informática': 0.60 },
    'Ruim': { 'Equipamentos de Informática': 0.40 },
    'Péssimo': { 'Equipamentos de Informática': 0.20 }
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { nome_produto, modelo, marca, estado, numero_patrimonio } = req.body;
        
        // Construir query de busca
        const queryBusca = [nome_produto, marca, modelo]
            .filter(x => x && x !== 'N/A')
            .join(' ') + ' preço Brasil';
        
        // Prompt para Grounding
        const promptGrounding = `Busque na web o preço de reposição atual do seguinte produto no Brasil:

Produto: ${nome_produto}
Marca: ${marca || 'N/A'}
Modelo: ${modelo || 'N/A'}
Estado: ${estado}

Retorne APENAS um JSON no seguinte formato:
{
  "preco_encontrado": true,
  "valor_mercado": 4200.50,
  "fonte": "Mercado Livre, Amazon",
  "query_utilizada": "string da busca"
}

Se não encontrar preço confiável, retorne:
{
  "preco_encontrado": false,
  "motivo": "explicação breve"
}`;
        
        const generativeModel = vertexAI.getGenerativeModel({
            model: MODEL,
            tools: [{
                googleSearchRetrieval: {
                    disableAttribution: false
                }
            }]
        });
        
        const request = {
            contents: [{
                role: 'user',
                parts: [{ text: promptGrounding }]
            }],
            generationConfig: {
                maxOutputTokens: 1024,
                temperature: 0.2,
            }
        };
        
        const response = await generativeModel.generateContent(request);
        const resultText = response.response.candidates[0].content.parts[0].text;
        
        // Parse resultado
        let jsonText = resultText.trim();
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const resultadoGrounding = JSON.parse(jsonText);
        
        if (!resultadoGrounding.preco_encontrado) {
            return res.status(200).json({
                status: 'Falha_Grounding',
                mensagem: 'Não foi possível encontrar preço. Insira manualmente.',
                dados: {}
            });
        }
        
        // Calcular depreciação
        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.['Equipamentos de Informática'] || 0.70;
        const valorMercado = resultadoGrounding.valor_mercado;
        const valorAtual = valorMercado * fatorDepreciacao;
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: {
                numero_patrimonio,
                nome_produto,
                modelo,
                marca,
                valores_estimados: {
                    valor_mercado_estimado: valorMercado,
                    valor_atual_estimado: parseFloat(valorAtual.toFixed(2)),
                    fator_depreciacao: fatorDepreciacao,
                    fonte_preco: 'Grounding - Google Search',
                    query_utilizada: queryBusca
                },
                metadados: {
                    data_grounding: new Date().toISOString(),
                    status_grounding: 'Sucesso'
                }
            },
            mensagem: 'Valores calculados com sucesso'
        });
        
    } catch (error) {
        console.error('Erro na Etapa 2:', error);
        
        return res.status(500).json({
            status: 'Falha_Grounding',
            mensagem: 'Erro ao buscar preço: ' + error.message,
            dados: {}
        });
    }
};
