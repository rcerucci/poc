const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

const PROMPT_SISTEMA = `Você é um especialista em inventário de ativos industriais e comerciais. Analise as imagens fornecidas e extraia informações PRECISAS.

Retorne APENAS um JSON válido (sem markdown, sem explicações) com os seguintes campos:

{
  "numero_patrimonio": "número visível na placa de patrimônio, ou N/A se não visível",
  "nome_produto": "nome GENÉRICO e CURTO do produto (ex: Torno CNC, Notebook, Cadeira)",
  "modelo": "modelo/número de série ESPECÍFICO se visível, ou N/A",
  "marca": "nome do FABRICANTE apenas (ex: Tornos, Dell, HP), ou N/A",
  "descricao": "descrição técnica OBJETIVA com características principais (máximo 200 caracteres)",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "categoria_depreciacao": "Equipamentos de Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros"
}

REGRAS CRÍTICAS:
1. nome_produto: Use APENAS o nome genérico (1-3 palavras). Exemplo: "Controlador de Velocidade", "Notebook", "Mesa"
2. marca: Use APENAS o nome do fabricante. Se não souber, use "N/A". NÃO coloque descrições aqui.
3. modelo: Use APENAS número/código de modelo se visível na placa. Se não souber, use "N/A".
4. descricao: Aqui sim, coloque detalhes técnicos completos (voltagem, capacidade, características).
5. Use linguagem FACTUAL, sem "provavelmente" ou "aparentemente".
6. Se não tiver certeza de algum campo, use "N/A".
7. Responda APENAS com JSON puro, sem texto adicional.

EXEMPLOS CORRETOS:
- nome_produto: "Torno CNC"
- marca: "Tornos"
- modelo: "Swiss GT 26 III"
- descricao: "Torno CNC tipo suíço, fabricado em 2022, capacidade 26mm"

EXEMPLOS INCORRETOS:
- marca: "com display digital" ❌ (isso vai na descrição)
- modelo: "Unidade de controle eletrônico..." ❌ (isso vai na descrição)
- nome_produto: "Torno CNC tipo suíço Swiss GT 26 III fabricado em 2022" ❌ (muito longo)`;

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