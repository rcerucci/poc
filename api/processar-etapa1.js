const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(API_KEY);

const TAXA_CAMBIO_USD_BRL = 6.00;
const USD_INPUT_POR_MILHAO = 0.15;
const USD_OUTPUT_POR_MILHAO = 0.60;
const CUSTO_INPUT_POR_TOKEN = (USD_INPUT_POR_MILHAO / 1_000_000) * TAXA_CAMBIO_USD_BRL;
const CUSTO_OUTPUT_POR_TOKEN = (USD_OUTPUT_POR_MILHAO / 1_000_000) * TAXA_CAMBIO_USD_BRL;
const TOKENS_POR_IMAGEM_512PX = 1610;

const PROMPT_SISTEMA = `Você é especialista em identificação de ativos industriais. Analise as fotos e extraia dados em JSON puro (sem markdown):

{
  "numero_patrimonio": "número da etiqueta PATRIMÔNIO",
  "nome_produto": "nome técnico padronizado em PORTUGUÊS",
  "termo_busca_comercial": "termo otimizado para busca (max 6 palavras)",
  "marca": "fabricante",
  "modelo": "código",
  "especificacoes": "specs técnicas",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim ou N/A",
  "categoria_depreciacao": "categoria de depreciação",
  "descricao": "180-200 caracteres",
  "observacao_validada": "Confirmada|Provável|Conflitante|N/A",
  "nota_observacao": "comentário sobre validação ou N/A"
}

REGRA CRÍTICA DE PADRONIZAÇÃO:

**nome_produto deve SEMPRE:**
1. Estar em PORTUGUÊS (nunca inglês/outros idiomas)
2. Descrever a FUNÇÃO do equipamento, não a marca
3. Usar nomenclatura técnica brasileira padrão

**Metodologia de nomenclatura:**

PASSO 1: Identifique a FUNÇÃO PRINCIPAL
- O que ele FAZ? (transporta, filtra, comprime, transforma, resfria, etc)
- O que ele PROCESSA? (cavacos, óleo, ar, fluido, dados, etc)

PASSO 2: Monte o nome: "[AÇÃO] de [OBJETO]" ou "[TIPO] [APLICAÇÃO]"

Exemplos:
- "Chip Conveyor" → "Transportador de Cavacos"
- "Oil Skimmer" → "Coletor de Óleo"
- "Transformer" → "Transformador Industrial"
- "CNC Lathe" → "Torno CNC"

INSTRUÇÕES:

1. **numero_patrimonio:** Campo "PATRIMÔNIO" (ignorar PINF, S/N, CNPJ)

2. **nome_produto:** Termo técnico português (máximo 4 palavras)

3. **termo_busca_comercial (ESTRATÉGIA ADAPTATIVA):**
   - Equipamentos industriais → termos B2B técnicos
   - Itens comuns (móveis, etc) → termos B2C genéricos
   - Max 6 palavras

4. **marca (NÃO CONFUNDIR PROPRIETÁRIO COM FABRICANTE):**
   - NUNCA use nome da etiqueta de patrimônio com CNPJ (é o proprietário)
   - Procure placa metálica, serigrafia, gravação, adesivo, pintura no equipamento
   - Se não houver: "N/A"
   
   EXEMPLOS DE ERRO:
   - ❌ Etiqueta "TECHIMPORT CNPJ..." → marca: "TECHIMPORT" (ERRADO!)
   
   EXEMPLOS CORRETOS:
   - ✅ Placa "MachSystem" → marca: "MachSystem"
   - ✅ Sem identificação → marca: "N/A"

5. **especificacoes:** Apenas dados técnicos (não PINF, S/N, DATA)

6. **descricao:** "[nome] [marca] [modelo]. [Função]. [Specs]. S/N: [n]. PINF: [p]. Fab: [data]." (180-200 chars)

7. **categoria_depreciacao:**
   - "Computadores e Informática" / "Ferramentas" / "Instalações" / "Máquinas e Equipamentos" / "Móveis e Utensílios" / "Veículos" / "Outros"

8. **observacao_validada (SE HOUVER OBSERVAÇÃO DO OPERADOR):**
   
   **METODOLOGIA DE VALIDAÇÃO:**
   
   PASSO 1: Detecte o NÍVEL DE CONFIANÇA:
   - **SUSPEIÇÃO:** "parece", "acho que", "pode ser", "talvez", "provavelmente"
   - **CERTEZA:** "é", "com certeza", "definitivamente", "sempre foi", "sabemos que"
   
   PASSO 2: Analise as IMAGENS para VALIDAR:
   - A forma/estrutura é compatível?
   - Os componentes visíveis fazem sentido?
   - O contexto confirma o uso sugerido?
   
   PASSO 3: Classifique:
   - **"Confirmada":** Imagens confirmam claramente (use mesmo que seja suspeição)
   - **"Provável":** Imagens compatíveis mas não conclusivas
   - **"Conflitante":** Imagens contradizem a observação (use análise visual)
   - **"N/A":** Sem observação
   
   EXEMPLOS:
   
   Obs: "Chamávamos de desencrustador. Parece cuba de limpeza ultrassônica."
   Imgs: Cuba metálica, painel controle
   → observacao_validada: "Confirmada"
   → nota_observacao: "Estrutura de cuba metálica com painel de controle compatível com limpeza ultrassônica"
   → nome_produto: "Cuba de Limpeza Ultrassônica"
   
   Obs: "Isto é uma cuba ultrassônica sem especificações"
   Imgs: Cuba retangular, painel
   → observacao_validada: "Confirmada"
   → nota_observacao: "Operador confirma função, estrutura visual compatível"
   → nome_produto: "Cuba de Limpeza Ultrassônica"
   
   Obs: "Acho que é um compressor de ar"
   Imgs: Esteira transportadora
   → observacao_validada: "Conflitante"
   → nota_observacao: "Estrutura mostra sistema de transporte, não compressor"
   → nome_produto: "Transportador de Cavacos"
   
   **IMPORTANTE:** 
   - Se CONFIRMADA ou PROVÁVEL → use para nome_produto
   - Se CONFLITANTE → ignore e use análise visual
   - Sempre explique em nota_observacao

9. **nota_observacao:**
   - Comentário breve (20-50 palavras) sobre validação
   - Se sem observação: "N/A"`;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    console.log('🔍 [ETAPA1] Iniciando extração...');
    
    try {
        const { imagens, observacao_operador } = req.body;  // ✅ NOVO CAMPO
        
        if (!imagens || imagens.length < 2) {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Mínimo de 2 imagens necessárias',
                dados: {}
            });
        }
        
        if (!API_KEY) {
            return res.status(500).json({
                status: 'Falha',
                mensagem: 'API Key não configurada',
                dados: {}
            });
        }
        
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json'
            }
        });
        
        const imageParts = imagens.map(img => ({
            inlineData: {
                data: img.data,
                mimeType: 'image/jpeg'
            }
        }));
        
        // ✅ ADICIONAR OBSERVAÇÃO AO PROMPT SE FORNECIDA
        let promptFinal = PROMPT_SISTEMA;
        
        if (observacao_operador && observacao_operador.length > 0) {
            console.log('💡 [ETAPA1] Observação do operador recebida:', observacao_operador.substring(0, 50) + '...');
            
            promptFinal += `\n\n═══════════════════════════════════════════════════════
📝 OBSERVAÇÃO DO OPERADOR (pessoa que conhece o histórico do equipamento):
"${observacao_operador}"

INSTRUÇÕES CRÍTICAS:
1. DETECTE se é suspeição ou certeza
2. VALIDE cruzando com as imagens
3. CLASSIFIQUE em: Confirmada / Provável / Conflitante
4. EXPLIQUE brevemente em nota_observacao
5. Se CONFIRMADA ou PROVÁVEL: use para nome_produto
6. Se CONFLITANTE: ignore e use apenas análise visual
═══════════════════════════════════════════════════════`;
        }
        
        const result = await model.generateContent([
            promptFinal,
            ...imageParts
        ]);
        
        const usage = result.response.usageMetadata;
        const tokensInput = usage?.promptTokenCount || 0;
        const tokensOutput = usage?.candidatesTokenCount || 0;
        const tokensTotal = tokensInput + tokensOutput;
        
        const custoInput = tokensInput * CUSTO_INPUT_POR_TOKEN;
        const custoOutput = tokensOutput * CUSTO_OUTPUT_POR_TOKEN;
        const custoTotal = custoInput + custoOutput;
        
        console.log('📊 [ETAPA1]', tokensInput, 'in +', tokensOutput, 'out = R$', custoTotal.toFixed(4));
        
        const text = result.response.text();
        
        let dadosExtraidos;
        try {
            let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonText = jsonMatch[0];
            dadosExtraidos = JSON.parse(jsonText);
        } catch (parseError) {
            throw new Error('JSON inválido: ' + parseError.message);
        }
        
        const camposObrigatorios = [
            'numero_patrimonio', 'nome_produto', 'termo_busca_comercial',
            'marca', 'modelo', 'especificacoes', 'estado_conservacao',
            'motivo_conservacao', 'categoria_depreciacao', 'descricao',
            'observacao_validada', 'nota_observacao'  // ✅ NOVOS CAMPOS
        ];
        
        camposObrigatorios.forEach(campo => {
            if (dadosExtraidos[campo] === undefined) {
                dadosExtraidos[campo] = 'N/A';
            }
        });
        
        const estadosValidos = ['Excelente', 'Bom', 'Regular', 'Ruim'];
        if (!estadosValidos.includes(dadosExtraidos.estado_conservacao)) {
            dadosExtraidos.estado_conservacao = 'Bom';
        }
        
        if (['Excelente', 'Bom'].includes(dadosExtraidos.estado_conservacao)) {
            dadosExtraidos.motivo_conservacao = 'N/A';
        }
        
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
            dadosExtraidos.categoria_depreciacao = 'Outros';
        }
        
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ia: 95,
                total_imagens_processadas: imagens.length,
                modelo_ia: MODEL,
                versao_sistema: '5.0-Observacao-Validada',
                tokens_input: tokensInput,
                tokens_output: tokensOutput,
                tokens_total: tokensTotal,
                tokens_imagem_estimados: imagens.length * TOKENS_POR_IMAGEM_512PX,
                custo_input: parseFloat(custoInput.toFixed(4)),
                custo_output: parseFloat(custoOutput.toFixed(4)),
                custo_total: parseFloat(custoTotal.toFixed(4)),
                taxa_cambio: TAXA_CAMBIO_USD_BRL,
                observacao_fornecida: observacao_operador ? true : false  // ✅ Flag
            }
        };
        
        console.log('✅ [ETAPA1]', dadosExtraidos.nome_produto);
        
        if (dadosExtraidos.observacao_validada !== 'N/A') {
            console.log('💡 [ETAPA1] Validação:', dadosExtraidos.observacao_validada);
            console.log('📝 [ETAPA1] Nota:', dadosExtraidos.nota_observacao);
        }
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Dados extraídos com sucesso'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA1]', error.message);
        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao processar: ' + error.message,
            dados: {}
        });
    }
};