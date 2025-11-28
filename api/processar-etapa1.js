const { VertexAI } = require('@google-cloud/vertexai');

// Configuração
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Parse das credenciais
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');

// Inicializar Vertex AI
const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
    googleAuthOptions: {
        credentials: credentials
    }
});

// Function Calling Tool
const classificacaoTool = {
    functionDeclarations: [{
        name: 'classificar_ativo',
        description: 'Retorna dados extraídos e classificados de um ativo',
        parameters: {
            type: 'object',
            properties: {
                numero_patrimonio: {
                    type: 'string',
                    description: 'Número da placa de patrimônio (N/A se não visível)'
                },
                nome_produto: {
                    type: 'string',
                    description: 'Nome genérico do produto'
                },
                modelo: {
                    type: 'string',
                    description: 'Modelo específico'
                },
                marca: {
                    type: 'string',
                    description: 'Fabricante'
                },
                descricao: {
                    type: 'string',
                    description: 'Descrição técnica objetiva (máx 200 caracteres)'
                },
                estado_conservacao: {
                    type: 'string',
                    enum: ['Excelente', 'Bom', 'Regular', 'Ruim'],
                    description: 'Estado visual do ativo'
                },
                categoria_depreciacao: {
                    type: 'string',
                    enum: [
                        'Computadores e Informática',
                        'Ferramentas',
                        'Instalações',
                        'Máquinas e Equipamentos',
                        'Móveis e Utensílios',
                        'Veículos',
                        'Outros'
                    ],
                    description: 'Categoria contábil'
                }
            },
            required: ['numero_patrimonio', 'nome_produto', 'estado_conservacao', 'categoria_depreciacao']
        }
    }]
};

const PROMPT_SISTEMA = `Você é um especialista em inventário de ativos. Analise as imagens e extraia os dados usando a função 'classificar_ativo'.

REGRAS:
1. Use linguagem FACTUAL (sem "provavelmente", "aparentemente")
2. Se incerto: retorne "N/A"
3. Descrição: APENAS características técnicas, SEM mencionar ambiente
4. Máximo 200 caracteres na descrição
5. DEVE chamar a função classificar_ativo`;

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
    
    try {
        const { imagens } = req.body;
        
        if (!imagens || imagens.length < 2) {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Mínimo de 2 imagens necessárias',
                dados: {}
            });
        }
        
        const generativeModel = vertexAI.getGenerativeModel({
            model: MODEL,
        });
        
        // Preparar imagens
        const imageParts = imagens.map(img => ({
            inlineData: {
                data: img.data,
                mimeType: 'image/jpeg'
            }
        }));
        
        const request = {
            contents: [{
                role: 'user',
                parts: [
                    { text: PROMPT_SISTEMA },
                    ...imageParts
                ]
            }],
            tools: [classificacaoTool],
            generationConfig: {
                temperature: 0.1,
            }
        };
        
        // Chamar Gemini
        const response = await generativeModel.generateContent(request);
        const result = response.response;
        
        // Verificar function call
        const functionCall = result.candidates?.[0]?.content?.parts?.find(
            part => part.functionCall
        );
        
        if (!functionCall) {
            throw new Error('IA não retornou function call esperado');
        }
        
        const dadosExtraidos = functionCall.functionCall.args;
        
        // Adicionar metadados
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ia: 95,
                total_imagens_processadas: imagens.length,
                modelo_ia: MODEL,
                versao_sistema: '1.0-POC'
            }
        };
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Dados extraídos com sucesso'
        });
        
    } catch (error) {
        console.error('Erro na Etapa 1:', error);
        
        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao processar: ' + error.message,
            dados: {
                numero_patrimonio: 'N/A',
                nome_produto: 'N/A',
                modelo: 'N/A',
                marca: 'N/A',
                descricao: 'N/A',
                estado_conservacao: 'N/A',
                categoria_depreciacao: 'N/A'
            }
        });
    }
};
