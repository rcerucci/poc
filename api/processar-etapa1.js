const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

const PROMPT_SISTEMA = `Você é um especialista em inventário de ativos industriais e comerciais. Analise as imagens fornecidas e extraia informações PRECISAS seguindo RIGOROSAMENTE a ordem de preenchimento abaixo.

Retorne APENAS um JSON válido (sem markdown, sem explicações):

{
  "numero_patrimonio": "número da placa",
  "nome_produto": "nome genérico curto",
  "marca": "fabricante",
  "modelo": "código/número do modelo",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "categoria_depreciacao": "categoria",
  "descricao": "descrição técnica completa"
}

═══════════════════════════════════════════════════════════════
ORDEM DE PREENCHIMENTO (SIGA RIGOROSAMENTE ESTA SEQUÊNCIA):
═══════════════════════════════════════════════════════════════

1️⃣ numero_patrimonio:
   - Procure por plaquetas/etiquetas com números de patrimônio
   - Se não houver placa visível: "N/A"

2️⃣ nome_produto:
   - Nome GENÉRICO e CURTO do tipo de equipamento (máximo 3 palavras)
   - Exemplos: "Controlador de Velocidade", "Notebook", "Torno CNC", "Cadeira Executiva"
   - NÃO inclua marca, modelo ou especificações aqui

3️⃣ marca:
   - Nome do FABRICANTE apenas (uma ou duas palavras)
   - Exemplos: "NAKANISHI", "Dell", "HP", "Tramontina"
   - Se não identificar marca visível: "N/A"
   - NÃO coloque descrições, especificações ou modelos aqui

4️⃣ modelo:
   - Código/número ESPECÍFICO do modelo se visível
   - Exemplos: "iSpeed3", "Latitude 5420", "GT 26 III"
   - Se não houver modelo específico visível: "N/A"
   - NÃO coloque descrições longas aqui

5️⃣ estado_conservacao:
   - Avalie visualmente: "Excelente", "Bom", "Regular", ou "Ruim"
   - Base-se em: arranhões, desgaste, limpeza, oxidação

6️⃣ categoria_depreciacao:
   - Escolha UMA categoria (use EXATAMENTE estes nomes):
     • "Equipamentos de Informática"
     • "Ferramentas"
     • "Instalações"
     • "Máquinas e Equipamentos"
     • "Móveis e Utensílios"
     • "Veículos"
     • "Outros"

7️⃣ descricao (PREENCHER POR ÚLTIMO - AQUI VAI TUDO):
   ⚠️ REGRA CRÍTICA: Consolide TODAS as informações técnicas aqui
   
   ESTRUTURA DA DESCRIÇÃO (nesta ordem):
   
   a) TIPO/FUNÇÃO do equipamento
   b) MARCA (repita aqui mesmo que já preenchida acima)
   c) MODELO (repita aqui mesmo que já preenchida acima)
   d) ESPECIFICAÇÕES TÉCNICAS (voltagem, potência, capacidade, etc)
   e) CARACTERÍSTICAS VISÍVEIS (display digital, botões, conexões, etc)
   f) ANO DE FABRICAÇÃO (se visível)
   g) APLICAÇÃO/USO (para que serve)
   
   Exemplo CORRETO de descrição:
   "Controlador eletrônico de velocidade marca NAKANISHI modelo iSpeed3. Display digital LCD, botões de ajuste fino de velocidade (RUN/STOP), controle de direção, indicadores de status LED. Tensão 220V/50-60Hz. Utilizado para controle preciso de velocidade de motores e spindles em aplicações industriais."
   
   MÁXIMO: 300 caracteres
   NÃO mencione ambiente, localização ou dados externos às imagens

═══════════════════════════════════════════════════════════════
REGRAS CRÍTICAS:
═══════════════════════════════════════════════════════════════

✅ Preencha os campos na ORDEM acima (1→7)
✅ Use "N/A" se não tiver certeza absoluta
✅ NÃO duplique informações entre campos
✅ SEMPRE repita marca e modelo na descrição (mesmo que já preenchidos)
✅ Use linguagem FACTUAL (sem "provavelmente", "aparentemente", "parece ser")
✅ A descrição deve ser AUTOCONTIDA (pessoa lendo só ela deve entender tudo)
✅ Retorne APENAS JSON, sem texto adicional`;

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