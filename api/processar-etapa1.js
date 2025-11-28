const { VertexAI } = require('@google-cloud/vertexai');

// Configuração Vertex AI
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_MODEL || 'gemini-1.5-pro';

// Inicializar Vertex AI
const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: LOCATION,
    googleAuthOptions: {
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}')
    }
});

// Prompt Sistema para Etapa 1
const PROMPT_SISTEMA = `Você é um especialista em inventário de ativos corporativos. Sua tarefa é extrair dados de ativos a partir de imagens e retornar os resultados em formato JSON.

REGRAS OBRIGATÓRIAS:

1. LINGUAGEM:
   - Use linguagem estritamente FACTUAL
   - NUNCA use adjetivos de incerteza: "provavelmente", "aparentemente", "possivelmente"
   - Se incerto, retorne "N/A"

2. ESCOPO DA DESCRIÇÃO:
   - Foque APENAS nas características técnicas e função do ativo
   - EXCLUA completamente o entorno: mesas, paredes, salas, pessoas
   - Máximo 200 caracteres
   - Exemplo BOM: "Notebook Dell Latitude 5420, 14 polegadas, teclado ABNT2"
   - Exemplo RUIM: "Notebook sobre mesa de madeira em sala de reunião"

3. FALHA/CONFIANÇA:
   - Se o OCR de um campo primário falhar: retorne "N/A"
   - Se a confiança na leitura for < 80%: retorne "N/A"

4. RETORNO ESPERADO (JSON):
{
  "numero_patrimonio": "string (leia da placa)",
  "nome_produto": "string (ex: Notebook, Cadeira)",
  "modelo": "string (modelo específico ou N/A)",
  "marca": "string (fabricante ou N/A)",
  "descricao": "string (descrição técnica objetiva)",
  "classificacao_automatica": {
    "estado_conservacao": "Excelente|Bom|Regular|Ruim|Péssimo",
    "categoria_depreciacao": "Equipamentos de Informática|Móveis e Utensílios|Veículos|Outros",
    "justificativa_estado": "string (breve justificativa)",
    "justificativa_categoria": "string (breve justificativa)"
  }
}`;

module.exports = async (req, res) => {
    // CORS Headers
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
        
        // Preparar conteúdo para Gemini
        const generativeModel = vertexAI.getGenerativeModel({
            model: MODEL,
        });
        
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
                    ...imageParts,
                    { text: 'Analise as imagens e retorne APENAS o JSON solicitado, sem markdown ou texto adicional.' }
                ]
            }],
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.1,
            }
        };
        
        // Chamar Gemini
        const response = await generativeModel.generateContent(request);
        const resultText = response.response.candidates[0].content.parts[0].text;
        
        // Parse JSON (remover markdown se houver)
        let jsonText = resultText.trim();
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        
        const dadosExtraidos = JSON.parse(jsonText);
        
        // Adicionar metadados
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ocr: 85, // Placeholder - calcular baseado em campos N/A
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
            mensagem: 'Erro ao processar imagens: ' + error.message,
            dados: {
                numero_patrimonio: 'N/A',
                nome_produto: 'N/A',
                modelo: 'N/A',
                marca: 'N/A',
                descricao: '',
                classificacao_automatica: {
                    estado_conservacao: 'N/A',
                    categoria_depreciacao: 'N/A'
                }
            }
        });
    }
};
