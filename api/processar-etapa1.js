const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

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
    
    console.log('🔍 [ETAPA1] Iniciando processamento...');
    
    try {
        const { imagens } = req.body;
        
        console.log('📥 [ETAPA1] Recebidas', imagens?.length, 'imagens');
        
        if (!imagens || imagens.length < 2) {
            console.log('⚠️ [ETAPA1] Mínimo de imagens não atingido');
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Mínimo de 2 imagens necessárias',
                dados: {}
            });
        }
        
        // Verificar API Key
        if (!API_KEY) {
            console.error('❌ [ETAPA1] GOOGLE_API_KEY não configurada!');
            return res.status(500).json({
                status: 'Falha',
                mensagem: 'API Key não configurada',
                dados: {}
            });
        }
        
        console.log('🤖 [ETAPA1] Inicializando modelo:', MODEL);
        
        // Inicializar modelo
        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [classificacaoTool],
            generationConfig: {
                temperature: 0.1,
            }
        });
        
        console.log('🖼️ [ETAPA1] Preparando', imagens.length, 'imagens...');
        
        // Preparar imagens
        const imageParts = imagens.map(img => ({
            inlineData: {
                data: img.data,
                mimeType: 'image/jpeg'
            }
        }));
        
        // Preparar conteúdo
        const contents = [
            { text: PROMPT_SISTEMA },
            ...imageParts
        ];
        
        console.log('📤 [ETAPA1] Enviando para Gemini...');
        
        // Chamar Gemini
        const result = await model.generateContent(contents);
        
        console.log('📥 [ETAPA1] Resposta recebida do Gemini');
        
        const response = result.response;
        
        console.log('🔍 [ETAPA1] Procurando function call...');
        
        // Verificar function call
        const functionCall = response.candidates?.[0]?.content?.parts?.find(
            part => part.functionCall
        );
        
        if (!functionCall) {
            console.error('❌ [ETAPA1] Nenhum function call encontrado');
            console.log('📋 [ETAPA1] Resposta completa:', JSON.stringify(response, null, 2));
            throw new Error('IA não retornou function call esperado');
        }
        
        console.log('✅ [ETAPA1] Function call encontrado!');
        
        const dadosExtraidos = functionCall.functionCall.args;
        
        console.log('📊 [ETAPA1] Dados extraídos:', dadosExtraidos);
        
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
        
        console.log('✅ [ETAPA1] Processamento concluído com sucesso!');
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Dados extraídos com sucesso'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA1] Erro:', error);
        console.error('❌ [ETAPA1] Stack:', error.stack);
        
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