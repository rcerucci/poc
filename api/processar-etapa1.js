const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

// Prompt de identificação
const PROMPT_SISTEMA = `
Analise as imagens e extraia informações PRECISAS do ativo. Responda APENAS com JSON (sem markdown):

{
  "numero_patrimonio": "",
  "nome_produto": "",
  "marca": "",
  "modelo": "",
  "estado_conservacao": "",
  "categoria_depreciacao": "",
  "descricao": ""
}

ORDEM DE PREENCHIMENTO:
1. numero_patrimonio: Ler plaquetas/etiquetas. Se não houver: "N/A".
2. nome_produto: Nome genérico e curto (máx 3 palavras) em PT-BR. Traduza nomes ingleses para o genérico em português.
3. marca: Apenas fabricante. Se incerto: "N/A".
4. modelo: Código/número específico visível. Se não houver: "N/A".
5. estado_conservacao: Excelente | Bom | Regular | Ruim.
6. categoria_depreciacao: "Equipamentos de Informática" | "Ferramentas" | "Instalações" | "Máquinas e Equipamentos" | "Móveis e Utensílios" | "Veículos" | "Outros".
7. descricao (máx 300 chars): Texto autônomo incluindo:
   - Função/tipo
   - Marca e modelo (repita aqui)
   - Especificações visíveis (V, W, Hz etc.)
   - Características físicas (botões, visor, conexões)
   - Ano se aparecer
   - Aplicação/uso

REGRAS:
✅ Use "N/A" se incerto
✅ NÃO duplique entre campos (exceto marca/modelo na descrição)
✅ Descrição AUTOCONTIDA (compreensível sozinha)
✅ Linguagem FACTUAL (sem "provavelmente")
✅ Retorne APENAS JSON

EXEMPLO:
{
  "numero_patrimonio": "01815",
  "nome_produto": "Controlador de Velocidade",
  "marca": "NAKANISHI",
  "modelo": "iSpeed3",
  "estado_conservacao": "Bom",
  "categoria_depreciacao": "Máquinas e Equipamentos",
  "descricao": "Controlador eletrônico NAKANISHI iSpeed3. Display LCD, botões RUN/STOP e ajuste de velocidade. 220V 50/60Hz. Usado para acionar spindles industriais."
}
`;

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
        
        if (!API_KEY) {
            console.error('❌ [ETAPA1] GOOGLE_API_KEY não configurada!');
            return res.status(500).json({
                status: 'Falha',
                mensagem: 'API Key não configurada',
                dados: {}
            });
        }
        
        console.log('🤖 [ETAPA1] Inicializando modelo:', MODEL);
        
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json'
            }
        });
        
        console.log('🖼️ [ETAPA1] Preparando', imagens.length, 'imagens...');
        
        const imageParts = imagens.map((img, index) => ({
            inlineData: {
                data: img.data,
                mimeType: 'image/jpeg'
            }
        }));
        
        console.log('📤 [ETAPA1] Enviando para Gemini...');
        
        const result = await model.generateContent([
            PROMPT_SISTEMA,
            ...imageParts
        ]);
        
        console.log('📥 [ETAPA1] Resposta recebida');
        
        const response = result.response;
        const text = response.text();
        
        console.log('📝 [ETAPA1] Texto recebido (primeiros 300 chars):', text.substring(0, 300));
        
        // Parse JSON com validação reforçada
        let dadosExtraidos;
        try {
            let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // 💡 Isola o bloco JSON para lidar com texto antes/depois
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0]; // Pega o primeiro e único bloco JSON
                console.log('🎯 [ETAPA1] JSON isolado do texto');
            }
            
            console.log('🧹 [ETAPA1] Texto limpo para parse:', jsonText.substring(0, 200));
            
            dadosExtraidos = JSON.parse(jsonText);
            console.log('✅ [ETAPA1] JSON parseado com sucesso');
            console.log('📊 [ETAPA1] Dados extraídos:', JSON.stringify(dadosExtraidos, null, 2));
            
        } catch (parseError) {
            console.error('❌ [ETAPA1] Erro ao parsear JSON:', parseError.message);
            console.error('📋 [ETAPA1] Texto completo recebido:', text);
            throw new Error(`Resposta da IA não é um JSON válido: ${parseError.message}`);
        }
        
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
        
        console.log('✅ [ETAPA1] Processamento concluído!');
        
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