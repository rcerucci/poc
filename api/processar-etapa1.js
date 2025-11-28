const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

const PROMPT_SISTEMA = `Você é um especialista em inventário de ativos. Analise as imagens fornecidas e retorne APENAS um JSON válido (sem markdown, sem explicações) com os seguintes campos:

{
  "numero_patrimonio": "número da placa de patrimônio ou N/A se não visível",
  "nome_produto": "nome genérico do produto",
  "modelo": "modelo específico ou N/A",
  "marca": "fabricante ou N/A",
  "descricao": "descrição técnica objetiva com máximo 200 caracteres",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros"
}

REGRAS:
1. Use linguagem FACTUAL (sem "provavelmente", "aparentemente")
2. Se incerto: retorne "N/A"
3. Descrição: APENAS características técnicas, SEM mencionar ambiente
4. Responda APENAS com o JSON, nada mais`;

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
        
        // Inicializar modelo SEM function calling
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json'
            }
        });
        
        console.log('🖼️ [ETAPA1] Preparando', imagens.length, 'imagens...');
        
        // Preparar imagens
        const imageParts = imagens.map((img, index) => {
            console.log(`  📷 Imagem ${index + 1}: ${img.data.substring(0, 30)}...`);
            return {
                inlineData: {
                    data: img.data,
                    mimeType: 'image/jpeg'
                }
            };
        });
        
        console.log('📤 [ETAPA1] Enviando para Gemini...');
        
        // Chamar Gemini
        const result = await model.generateContent([
            PROMPT_SISTEMA,
            ...imageParts
        ]);
        
        console.log('📥 [ETAPA1] Resposta recebida do Gemini');
        
        const response = result.response;
        const text = response.text();
        
        console.log('📝 [ETAPA1] Texto recebido:', text.substring(0, 200));
        
        // Parse JSON
        let dadosExtraidos;
        try {
            // Remover markdown se existir
            const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            dadosExtraidos = JSON.parse(jsonText);
            console.log('✅ [ETAPA1] JSON parseado com sucesso');
        } catch (parseError) {
            console.error('❌ [ETAPA1] Erro ao parsear JSON:', parseError.message);
            console.log('📋 [ETAPA1] Texto completo:', text);
            throw new Error('Resposta da IA não é um JSON válido');
        }
        
        console.log('📊 [ETAPA1] Dados extraídos:', JSON.stringify(dadosExtraidos, null, 2));
        
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
        console.error('❌ [ETAPA1] Erro:', error.message);
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