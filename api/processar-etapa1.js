const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuração ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(API_KEY);

/*
// --- Prompt Otimizado (450 tokens) ***VALIDADO***---
const PROMPT_SISTEMA = `Extraia informações do ativo em JSON (sem markdown):

{
  "numero_patrimonio": "placa/etiqueta ou N/A",
  "nome_produto": "nome genérico (max 4 palavras)",
  "marca": "fabricante ou N/A",
  "modelo": "código ou N/A",
  "especificacoes": "specs técnicas da placa ou N/A",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim (max 3 palavras) ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição técnica completa (max 200 chars)"
}

***REGRAS CRÍTICAS:***

1. numero_patrimonio: Plaqueta visível ou N/A
2. nome_produto: Genérico, técnico, curto
3. marca/modelo: Exatos da etiqueta ou N/A
4. especificacoes: Da PLACA (ex: "220V, 60Hz, 20kVA") ou N/A
5. estado_conservacao: Avaliação visual
6. motivo_conservacao: Só se Regular/Ruim. Max 3 palavras
7. categoria_depreciacao: UM valor exato da lista

8. ***descricao (FORMATO OBRIGATÓRIO):***
   - SEMPRE inicie com o nome do produto
   - SEMPRE inclua marca e modelo (se identificados)
   - SEMPRE inclua especificacoes (se identificadas)
   - Formato: "[Nome] [Marca] [Modelo], [specs técnicas], [características físicas]"
   - Exemplo: "Monitor LCD Samsung S24F350, 24 polegadas Full HD, painel IPS, montado em braço articulado."
   - NÃO inclua: cor, localização, estado de conservação
   - Max 200 caracteres

***EXEMPLOS CORRETOS:***

Carrinho: {"numero_patrimonio":"02128","nome_produto":"Carrinho Porta-Ferramentas","marca":"N/A","modelo":"N/A","especificacoes":"N/A","estado_conservacao":"Bom","motivo_conservacao":"N/A","categoria_depreciacao":"Móveis e Utensílios","descricao":"Carrinho metal com prateleiras, gaveta, orifícios para mandris, rodízios"}

Notebook: {"numero_patrimonio":"15432","nome_produto":"Notebook","marca":"Dell","modelo":"Latitude 5420","especificacoes":"Intel i5, 8GB, 256GB SSD","estado_conservacao":"Excelente","motivo_conservacao":"N/A","categoria_depreciacao":"Computadores e Informática","descricao":"14 polegadas, carcaça alumínio, teclado retroiluminado, webcam HD"}

Gerador: {"numero_patrimonio":"N/A","nome_produto":"Gerador Diesel","marca":"Cummins","modelo":"C22D5","especificacoes":"220V, 60Hz, 22kVA, 0.8FP","estado_conservacao":"Regular","motivo_conservacao":"Desgaste pintura","categoria_depreciacao":"Máquinas e Equipamentos","descricao":"Gerador trifásico, tanque 100L, automático, silenciado"}
`;
*/

const PROMPT_SISTEMA = `Extraia informações do ativo em JSON (sem markdown):

{
  "numero_patrimonio": "placa/etiqueta ou N/A",
  "nome_produto": "nome genérico (max 4 palavras)",
  "marca": "fabricante ou N/A",
  "modelo": "código ou N/A",
  "especificacoes": "specs técnicas da placa ou N/A",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim (max 3 palavras) ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição técnica completa (max 200 chars)"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUÇÕES DE CHAVEAMENTO DE ANÁLISE (Otimização de Custo e Rigor):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

***REGRA GERAL:*** A IA DEVE analisar TODAS as imagens em busca dos dados necessários.

1.  **MÓDULO OCR (PRIORIDADE MÁXIMA):**
    -   Sempre que uma imagem for um **close-up de texto** (plaquetas, etiquetas, painéis), a IA deve **chavear para o modo OCR**, ignorando o contexto visual da cena e focando apenas na leitura direta de caracteres.
    -   Isto se aplica a: **numero_patrimonio**, **marca**, **modelo** e **especificacoes**. Use a leitura direta de qualquer foto que torne o texto legível.

2.  **MÓDULO VLM (ANÁLISE ESPACIAL E CONTEXTUAL):**
    -   Sempre que uma imagem mostrar a **visão geral** do ativo (o item inteiro), a IA deve **chavear para o modo VLM (Vision-Language)** para análise de contexto e condição.
    -   Isto se aplica a: **estado_conservacao** e **nome_produto**.

3.  **RESOLUÇÃO DE CONFLITOS E DADOS FALTANTES:**
    -   Se uma foto de close-up estiver ausente (falha do operador), o MÓDULO VLM deve tentar extrair o **numero_patrimonio** ou **especificacoes** da foto de visão geral, mas o **nível de confiança cai**.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

***REGRAS CRÍTICAS DE CONTEÚDO:***

1. **numero_patrimonio:** Plaqueta visível ou N/A
2. **nome_produto:** Genérico, técnico, curto (Max 4 palavras)
3. **marca/modelo:** Exatos da etiqueta ou N/A
4. **especificacoes:** Da PLACA (ex: "220V, 60Hz, 20kVA") ou N/A
5. **estado_conservacao:** Avaliação visual
6. **motivo_conservacao:** Só se Regular/Ruim. Max 3 palavras
7. **categoria_depreciacao:** UM valor exato da lista fornecida
8. **descricao (FORMATO OBRIGATÓRIO):** Formato: "[Nome] [Marca] [Modelo], [specs técnicas], [características físicas]". Max 200 caracteres. NÃO inclua cor, localização ou estado de conservação.

***EXEMPLOS CORRETOS:***

Carrinho: {"numero_patrimonio":"02128","nome_produto":"Carrinho Porta-Ferramentas","marca":"N/A","modelo":"N/A","especificacoes":"N/A","estado_conservacao":"Bom","motivo_conservacao":"N/A","categoria_depreciacao":"Móveis e Utensílios","descricao":"Carrinho metal com prateleiras, gaveta, orifícios para mandris, rodízios"}

Notebook: {"numero_patrimonio":"15432","nome_produto":"Notebook","marca":"Dell","modelo":"Latitude 5420","especificacoes":"Intel i5, 8GB, 256GB SSD","estado_conservacao":"Excelente","motivo_conservacao":"N/A","categoria_depreciacao":"Computadores e Informática","descricao":"14 polegadas, carcaça alumínio, teclado retroiluminado, webcam HD"}

Gerador: {"numero_patrimonio":"N/A","nome_produto":"Gerador Diesel","marca":"Cummins","modelo":"C22D5","especificacoes":"220V, 60Hz, 22kVA, 0.8FP","estado_conservacao":"Regular","motivo_conservacao":"Desgaste pintura","categoria_depreciacao":"Máquinas e Equipamentos","descricao":"Gerador trifásico, tanque 100L, automático, silenciado"}
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
    
    console.log('🔍 [ETAPA1] Iniciando extração...');
    
    try {
        const { imagens } = req.body;
        
        console.log('📥 [ETAPA1] Recebidas ' + (imagens?.length || 0) + ' imagens');
        
        if (!imagens || imagens.length < 2) {
            console.log('⚠️ [ETAPA1] Mínimo de imagens não atingido');
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Mínimo de 2 imagens necessárias',
                dados: {}
            });
        }
        
        if (!API_KEY) {
            console.error('❌ [ETAPA1] GOOGLE_API_KEY não configurada');
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
        
        console.log('🖼️ [ETAPA1] Preparando ' + imagens.length + ' imagens...');
        
        const imageParts = imagens.map(img => ({
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
        
        console.log('📝 [ETAPA1] Texto (primeiros 300 chars):', text.substring(0, 300));
        
        // Parse JSON
        let dadosExtraidos;
        try {
            let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
                console.log('🎯 [ETAPA1] JSON isolado');
            }
            
            console.log('🧹 [ETAPA1] Parseando JSON...');
            
            dadosExtraidos = JSON.parse(jsonText);
            console.log('✅ [ETAPA1] JSON parseado com sucesso');
            console.log('📊 [ETAPA1] Dados:', JSON.stringify(dadosExtraidos, null, 2));
            
        } catch (parseError) {
            console.error('❌ [ETAPA1] Erro ao parsear:', parseError.message);
            console.error('📋 [ETAPA1] Texto completo:', text);
            throw new Error('JSON inválido: ' + parseError.message);
        }
        
        // Validação básica dos campos obrigatórios
        const camposObrigatorios = [
            'numero_patrimonio',
            'nome_produto',
            'marca',
            'modelo',
            'especificacoes',
            'estado_conservacao',
            'motivo_conservacao',
            'categoria_depreciacao',
            'descricao'
        ];
        
        const camposFaltando = camposObrigatorios.filter(campo => 
            dadosExtraidos[campo] === undefined
        );
        
        if (camposFaltando.length > 0) {
            console.warn('⚠️ [ETAPA1] Campos faltando:', camposFaltando);
            // Preencher com N/A
            camposFaltando.forEach(campo => {
                dadosExtraidos[campo] = 'N/A';
            });
        }
        
        // Validação do estado de conservação
        const estadosValidos = ['Excelente', 'Bom', 'Regular', 'Ruim'];
        if (!estadosValidos.includes(dadosExtraidos.estado_conservacao)) {
            console.warn('⚠️ [ETAPA1] Estado inválido:', dadosExtraidos.estado_conservacao);
            dadosExtraidos.estado_conservacao = 'Bom'; // Default
        }
        
        // Validação do motivo_conservacao
        if (['Excelente', 'Bom'].includes(dadosExtraidos.estado_conservacao)) {
            dadosExtraidos.motivo_conservacao = 'N/A';
        }
        
        // Validação da categoria
        const categoriasValidas = [
            'Computadores e Informática',
            'Ferramentas',
            'Instalações',
            'Máquinas e Equipamentos',
            'Móveis e Utensílios',
            'Veículos',
            'Outros'
        ];
        
        if (!categoriasValidas.includes(dadosExtraidos.categoria_depreciacao)) {
            console.warn('⚠️ [ETAPA1] Categoria inválida:', dadosExtraidos.categoria_depreciacao);
            dadosExtraidos.categoria_depreciacao = 'Outros'; // Default
        }
        
        // Adicionar metadados
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ia: 95,
                total_imagens_processadas: imagens.length,
                modelo_ia: MODEL,
                versao_sistema: '2.0-Otimizado'
            }
        };
        
        console.log('✅ [ETAPA1] Extração concluída!');
        console.log('📦 [ETAPA1] Produto:', dadosExtraidos.nome_produto);
        console.log('🏷️ [ETAPA1] Marca/Modelo:', dadosExtraidos.marca + ' ' + dadosExtraidos.modelo);
        console.log('⚙️ [ETAPA1] Specs:', dadosExtraidos.especificacoes);
        
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
                marca: 'N/A',
                modelo: 'N/A',
                especificacoes: 'N/A',
                estado_conservacao: 'N/A',
                motivo_conservacao: 'N/A',
                categoria_depreciacao: 'N/A',
                descricao: 'N/A'
            }
        });
    }
};