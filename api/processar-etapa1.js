const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuração
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

// Prompt de identificação
const PROMPT_SISTEMA = `Analise as imagens e extraia informações PRECISAS do ativo. Retorne APENAS JSON (sem markdown):

{
  "numero_patrimonio": "número da placa ou N/A",
  "nome_produto": "nome genérico do produto",
  "marca": "fabricante ou N/A",
  "modelo": "código do modelo ou N/A",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "categoria_depreciacao": "categoria",
  "descricao": "descrição técnica completa"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÕES POR CAMPO (LEIA COM ATENÇÃO):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ numero_patrimonio:
   - Procure plaquetas/etiquetas de patrimônio
   - Se NÃO estiver CLARAMENTE visível: "N/A"
   - Exemplo: "02128", "PAT-5432"

2️⃣ nome_produto:
   - Nome GENÉRICO e CURTO (máximo 4 palavras)
   - Use terminologia técnica/comercial padrão
   - Exemplos: "Cadeira de Escritório", "Notebook", "Carrinho Porta-Ferramentas"
   - ❌ NÃO use descrições longas aqui

3️⃣ marca:
   - APENAS o nome do FABRICANTE
   - Exemplos válidos: "NAKANISHI", "Dell", "HP", "Tramontina"
   - ❌ NÃO use: características físicas, cores, materiais
   - ❌ NÃO use: partes da descrição como "alça lateral", "metal azul"
   - Se NÃO identificar marca: "N/A"

4️⃣ modelo:
   - APENAS código/número ESPECÍFICO do modelo
   - Exemplos válidos: "iSpeed3", "Latitude 5420", "PRO-X500"
   - ❌ NÃO use: descrições, características, tamanhos
   - ❌ NÃO use: "carrinho móvel azul" ou similar
   - Se NÃO houver código visível: "N/A"

5️⃣ estado_conservacao:
   - Avalie visualmente: arranhões, desgaste, limpeza, pintura
   - Escolha UMA opção: "Excelente", "Bom", "Regular", "Ruim"

6️⃣ categoria_depreciacao:
   - Escolha UMA categoria:
     • "Equipamentos de Informática" (PCs, notebooks, impressoras)
     • "Ferramentas" (chaves, furadeiras, alicates)
     • "Instalações" (ar-condicionado, portas, janelas)
     • "Máquinas e Equipamentos" (tornos, fresadoras, spindles)
     • "Móveis e Utensílios" (mesas, cadeiras, armários, carrinhos)
     • "Veículos" (carros, motos, empilhadeiras)
     • "Outros" (itens que não se encaixam acima)

7️⃣ descricao:
   - Descrição COMPLETA e TÉCNICA (máximo 300 caracteres)
   - ⚡ INICIE SEMPRE com o nome do produto (repita "nome_produto" no começo)
   - Inclua TUDO relevante:
     ✓ Nome do produto (OBRIGATÓRIO no início)
     ✓ Material e cor
     ✓ Dimensões aproximadas (se relevante)
     ✓ Características físicas (prateleiras, gavetas, rodízios, etc)
     ✓ Especificações técnicas (voltagem, potência, RPM, etc)
     ✓ Marca e modelo (se identificados, repita aqui também)
     ✓ Sinônimos/nomes alternativos
     ✓ Aplicação/uso típico
   - Seja FACTUAL (sem "provavelmente", "parece")
   - A descrição deve ser compreensível SOZINHA, sem precisar ler outros campos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGRAS CRÍTICAS - NÃO QUEBRE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Use "N/A" quando informação NÃO estiver CLARAMENTE visível
✅ NÃO coloque descrições nos campos "marca" ou "modelo"
✅ NÃO coloque características físicas (cor, tamanho, material) em "marca"
✅ Cada campo tem propósito específico - respeite isso
✅ SEMPRE inicie a descrição com o nome do produto
✅ Descrição deve ser autocontida (compreensível sem outros campos)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 EXEMPLOS CORRETOS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXEMPLO 1 - Carrinho sem marca identificada:
{
  "numero_patrimonio": "02128",
  "nome_produto": "Carrinho Porta-Ferramentas",
  "marca": "N/A",
  "modelo": "N/A",
  "estado_conservacao": "Bom",
  "categoria_depreciacao": "Móveis e Utensílios",
  "descricao": "Carrinho Porta-Ferramentas móvel de metal na cor azul com duas prateleiras principais e uma gaveta lateral. Projetado para armazenamento e transporte de ferramentas de usinagem ou spindles, possui múltiplos orifícios com anéis de borracha para encaixe de cones. Equipado com alça lateral e rodízios para mobilidade. Também conhecido como carrinho porta-mandris ou porta-cones."
}

EXEMPLO 2 - Notebook com marca/modelo:
{
  "numero_patrimonio": "15432",
  "nome_produto": "Notebook",
  "marca": "Dell",
  "modelo": "Latitude 5420",
  "estado_conservacao": "Excelente",
  "categoria_depreciacao": "Equipamentos de Informática",
  "descricao": "Notebook Dell Latitude 5420 com tela 14 polegadas, processador Intel Core i5, 8GB RAM, 256GB SSD. Carcaça preta em policarbonato, teclado retroiluminado, webcam HD integrada. Usado para trabalho de escritório e desenvolvimento."
}

EXEMPLO 3 - Spindle com marca:
{
  "numero_patrimonio": "N/A",
  "nome_produto": "Spindle de Alta Rotação",
  "marca": "NAKANISHI",
  "modelo": "iSpeed3",
  "estado_conservacao": "Bom",
  "categoria_depreciacao": "Máquinas e Equipamentos",
  "descricao": "Spindle de Alta Rotação NAKANISHI modelo iSpeed3 para operações de usinagem de precisão. Potência 400W, rotação máxima 60.000 RPM, refrigeração a ar. Display digital integrado, corpo em alumínio anodizado. Aplicação em fresamento CNC e gravação."
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ RETORNE APENAS O JSON, SEM TEXTO ADICIONAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

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