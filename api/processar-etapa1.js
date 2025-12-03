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

const PROMPT_SISTEMA = `Analise as fotos e extraia dados do ativo em JSON puro (sem markdown):

{
  "numero_patrimonio": "número da plaqueta PATRIMÔNIO",
  "nome_produto": "tipo específico do equipamento",
  "termo_busca_comercial": "como buscar no Mercado Livre (max 6 palavras)",
  "marca": "fabricante",
  "modelo": "código do modelo",
  "especificacoes": "tensão, potência, frequência, corrente, peso (dados técnicos puros)",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição completa 180-200 caracteres"
}

REGRAS ESSENCIAIS:

1. numero_patrimonio: Extrair APENAS do campo "PATRIMÔNIO" (não PINF, S/N, etc)

2. nome_produto: IDENTIFICAR o tipo específico:
   - Compressor de refrigeração → "Compressor de Fluido Refrigerante"
   - Torno → "Torno Mecânico"
   - Centro usinagem → "Centro de Usinagem CNC"
   - Injetora → "Injetora de Plástico"
   - Gerador → "Gerador Diesel"
   - Se incerto: usar categoria + marca

3. especificacoes: APENAS dados técnicos (tensão, potência, etc). NÃO incluir PINF, S/N, DATA

4. descricao: Incluir nome, marca, modelo, resumo specs, S/N, PINF, data fabricação, aplicação. Usar 180-200 chars.

Exemplos:

Compressor MachSystem:
{
  "numero_patrimonio": "02023",
  "nome_produto": "Compressor de Fluido Refrigerante",
  "termo_busca_comercial": "Compressor Industrial MachSystem 9kW Trifásico",
  "marca": "MachSystem",
  "modelo": "SAP 14025TS L4",
  "especificacoes": "380V trifásico, 60Hz, potência 9.0kW, corrente 20.7A, peso 260kg",
  "estado_conservacao": "Excelente",
  "motivo_conservacao": "N/A",
  "categoria_depreciacao": "Máquinas e Equipamentos",
  "descricao": "Compressor de Fluido Refrigerante MachSystem SAP 14025TS L4. Equipamento industrial trifásico 380V, 9.0kW, 20.7A, 260kg. S/N: 1368. PINF: 8396. Fabricação Agosto/2023. Para sistemas HVAC."
}

Gaveteiro:
{
  "numero_patrimonio": "02149",
  "nome_produto": "Armário de Gavetas",
  "termo_busca_comercial": "Gaveteiro Industrial 5 Gavetas Metal",
  "marca": "N/A",
  "modelo": "N/A",
  "especificacoes": "Metal pintado, 5 gavetas corrediças, rodízios, fechadura inferior",
  "estado_conservacao": "Regular",
  "motivo_conservacao": "desgaste visível",
  "categoria_depreciacao": "Móveis e Utensílios",
  "descricao": "Armário de Gavetas industrial. Metal, 5 gavetas corrediças, rodízios, fechadura. Para armazenamento de ferramentas em oficinas e almoxarifados."
}`;

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
                temperature: 0,
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
                versao_sistema: '3.0-Minimalista',
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