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

const PROMPT_SISTEMA = `Você é um especialista em identificação de ativos industriais. Analise CUIDADOSAMENTE as fotos e extraia dados em JSON puro (sem markdown):

{
  "numero_patrimonio": "número da etiqueta PATRIMÔNIO",
  "nome_produto": "tipo técnico específico do equipamento",
  "termo_busca_comercial": "termo para Mercado Livre (max 6 palavras)",
  "marca": "fabricante",
  "modelo": "código do modelo",
  "especificacoes": "especificações técnicas",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição completa 180-200 caracteres"
}

INSTRUÇÕES CRÍTICAS:

1. **numero_patrimonio:** 
   - Extrair do campo "PATRIMÔNIO" na etiqueta
   - Ignorar PINF, S/N, CNPJ

2. **nome_produto:**
   - ANALISE A FUNÇÃO DO EQUIPAMENTO observando:
     * Formato físico e construção
     * Painéis de controle visíveis
     * Conexões e tubulações
     * Contexto do ambiente
   - Use nomenclatura técnica precisa
   - Exemplos de categorias: Coletor, Separador, Filtro, Compressor, Torno, Injetora, Gerador, Prensa, etc.
   - Se incerto: "[Tipo Geral] [Marca]"

3. **termo_busca_comercial:**
   - Como buscar o produto NOVO no marketplace
   - Incluir: tipo + característica + marca
   - Max 6 palavras

4. **especificacoes:**
   - APENAS: tensão, potência, frequência, corrente, peso, dimensões
   - NÃO incluir: PINF, S/N, DATA, códigos administrativos

5. **descricao:**
   - Estrutura: "[nome] [marca] [modelo]. [Função/aplicação]. [Specs]. S/N: [num]. PINF: [cod]. Fab: [data]."
   - 180-200 caracteres
   - Incluir S/N, PINF e data de fabricação da placa

6. **categoria_depreciacao:**
   - Computadores/impressoras → "Computadores e Informática"
   - Ferramentas manuais/elétricas → "Ferramentas"
   - Ar condicionado/elétrica → "Instalações"
   - Equipamentos industriais pesados → "Máquinas e Equipamentos"
   - Móveis → "Móveis e Utensílios"
   - Veículos → "Veículos"

IMPORTANTE: Analise REALMENTE as imagens. Não assuma que o equipamento é algo específico sem confirmar visualmente.`;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    console.log('🔍 [ETAPA1] Iniciando extração...');
    
    try {
        const { imagens } = req.body;
        
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
        
        const result = await model.generateContent([
            PROMPT_SISTEMA,
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
            'motivo_conservacao', 'categoria_depreciacao', 'descricao'
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
            'Computadores e Informática', 'Ferramentas', 'Instalações',
            'Máquinas e Equipamentos', 'Móveis e Utensílios', 'Veículos', 'Outros'
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
                versao_sistema: '3.1-Sem-Vies',
                tokens_input: tokensInput,
                tokens_output: tokensOutput,
                tokens_total: tokensTotal,
                tokens_imagem_estimados: imagens.length * TOKENS_POR_IMAGEM_512PX,
                custo_input: parseFloat(custoInput.toFixed(4)),
                custo_output: parseFloat(custoOutput.toFixed(4)),
                custo_total: parseFloat(custoTotal.toFixed(4)),
                taxa_cambio: TAXA_CAMBIO_USD_BRL
            }
        };
        
        console.log('✅ [ETAPA1]', dadosExtraidos.nome_produto);
        
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