const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuração da IA e Autenticação ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

// --- Dicionário de Fatores de Depreciação ---
const FATORES_DEPRECIACAO = {
    Excelente: {
        'Equipamentos de Informática': 0.9,
        'Ferramentas': 0.85,
        'Instalações': 0.8,
        'Máquinas e Equipamentos': 0.85,
        'Móveis e Utensílios': 0.8,
        'Veículos': 0.85,
        'Outros': 0.75
    },
    Bom: {
        'Equipamentos de Informática': 0.75,
        'Ferramentas': 0.7,
        'Instalações': 0.65,
        'Máquinas e Equipamentos': 0.7,
        'Móveis e Utensílios': 0.65,
        'Veículos': 0.7,
        'Outros': 0.6
    },
    Regular: {
        'Equipamentos de Informática': 0.55,
        'Ferramentas': 0.5,
        'Instalações': 0.45,
        'Máquinas e Equipamentos': 0.5,
        'Móveis e Utensílios': 0.45,
        'Veículos': 0.5,
        Outros: 0.4
    },
    Ruim: {
        'Equipamentos de Informática': 0.35,
        'Ferramentas': 0.3,
        'Instalações': 0.25,
        'Máquinas e Equipamentos': 0.3,
        'Móveis e Utensílios': 0.25,
        'Veículos': 0.3,
        Outros: 0.2
    }
};

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

    console.log('🔍 [ETAPA2] Iniciando busca de preços B2B...');

    try {
        const {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio
        } = req.body;

        console.log('📥 [ETAPA2] Dados recebidos:', {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao
        });

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Nome do produto é obrigatório para buscar preço',
                dados: {}
            });
        }

        const queryBusca = [nome_produto, marca, modelo]
            .filter(x => x && x !== 'N/A')
            .join(' ');

        console.log('🔎 [ETAPA2] Query de busca:', queryBusca);

        const promptBuscaPreco = `Você tem acesso à ferramenta Google Search. Use-a para encontrar o preço de AQUISIÇÃO CORPORATIVA (B2B) do seguinte ativo:

PRODUTO: ${nome_produto}
MARCA: ${marca || 'qualquer marca confiável'}
MODELO: ${modelo || 'modelo padrão'}
CATEGORIA: ${categoria_depreciacao}

CONTEXTO: Este é um sistema de gestão patrimonial CORPORATIVO. Precisamos do preço que uma EMPRESA pagaria para ADQUIRIR este ativo NOVO.

ESTRATÉGIA DE BUSCA (execute nesta ordem até obter sucesso):

1️⃣ PRIMEIRA TENTATIVA - Fornecedores B2B/Corporativos Brasileiros:
   Busque em:
   - Sites de fabricantes oficiais (ex: Dell, HP, Lenovo para TI)
   - Distribuidores autorizados e atacadistas
   - Fornecedores industriais especializados
   - Cotações B2B de grandes fornecedores
   Use o preço B2B em reais (R$)
   ⚠️ PRIORIZE esta fonte! Preços B2B são mais realistas para patrimônio corporativo.

2️⃣ SEGUNDA TENTATIVA - Varejo B2C Brasileiro:
   Se não encontrar canais B2B, busque em varejistas:
   - Mercado Livre (anúncios de lojas oficiais, não pessoas físicas)
   - Amazon.com.br
   - Magazine Luiza, Americanas (seção empresarial se houver)
   Use o preço de varejo em reais (R$)
   💡 Mencione que é preço de varejo, não B2B

3️⃣ TERCEIRA TENTATIVA - Fornecedores Internacionais:
   Busque em sites B2B internacionais:
   - Alibaba, Global Sources (para equipamentos industriais)
   - Sites de fabricantes internacionais
   - Amazon.com, eBay (seção business)
   Conversões: 1 USD = 5.00 BRL | 1 EUR = 5.40 BRL
   💡 Adicione 15-20% sobre o preço convertido (importação + impostos)

4️⃣ QUARTA TENTATIVA - Produto Similar B2B ou Estimativa Técnica:
   Se modelo específico não existir:
   - Busque equipamento SIMILAR da mesma categoria em canais B2B
   - Use conhecimento de mercado corporativo para estimar
   - Base a estimativa em produtos da mesma faixa de complexidade
   
   Referências de preço B2B por categoria:
   - Equipamentos industriais especializados: R$ 8.000 - R$ 150.000
   - Máquinas CNC/Tornos: R$ 50.000 - R$ 500.000
   - Equipamentos de TI corporativos: R$ 3.000 - R$ 25.000
   - Móveis corporativos: R$ 800 - R$ 8.000
   - Ferramentas industriais: R$ 500 - R$ 15.000
   - Veículos corporativos: R$ 50.000 - R$ 300.000

FORMATO DE RESPOSTA (retorne APENAS este JSON):

{
  "preco_encontrado": true,
  "valor_mercado": 15000.00,
  "fonte": "Nome do Fornecedor B2B / Fabricante / Distribuidor / Varejo (se B2C)",
  "observacoes": "Tipo: [B2B/B2C]. Origem: [Brasil/Internacional convertido]. Detalhes: [informações relevantes sobre a cotação]",
  "tipo_fonte": "B2B"
}

OU se realmente não conseguir estimar:

{
  "preco_encontrado": false,
  "motivo": "explicação muito breve"
}

REGRAS CRÍTICAS:
✅ PRIORIZE fontes B2B! São mais adequadas para gestão patrimonial
✅ NÃO desista facilmente! Use todas as 4 estratégias
✅ Para equipamentos industriais, é MELHOR estimar baseado em similar B2B do que retornar false
✅ Sempre mencione se é preço B2B ou B2C no campo "observacoes"
✅ Para preços internacionais, SEMPRE adicione custo de importação (15-20%)
✅ Seja realista com valores corporativos (empresas pagam mais que consumidores)
✅ Retorne APENAS JSON puro, sem markdown`;

        console.log('🤖 [ETAPA2] Inicializando modelo com Google Search (foco B2B)...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.3
            }
        });

        console.log('📤 [ETAPA2] Enviando requisição para Gemini...');

        const result = await model.generateContent(promptBuscaPreco);
        const response = result.response;
        const text = response.text();

        console.log('📥 [ETAPA2] Resposta BRUTA:');
        console.log('═══════════════════════════════════════');
        console.log(text);
        console.log('═══════════════════════════════════════');

        let resultadoBusca;

        try {
            let jsonText = text.trim();
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
            
            jsonText = jsonText.trim();
            console.log('🧹 [ETAPA2] Texto limpo:', jsonText);

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado:', JSON.stringify(resultadoBusca, null, 2));
            
        } catch (parseError) {
            console.error('❌ [ETAPA2] ERRO ao parsear JSON:', parseError.message);
            throw new Error(`Resposta não é um JSON válido: ${parseError.message}`);
        }

        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado após todas as estratégias');
            return res.status(200).json({
                status: 'Falha',
                mensagem: `Não foi possível encontrar preço B2B: ${resultadoBusca.motivo || 'Produto muito específico'}. Insira valor manualmente.`,
                dados: { preco_encontrado: false }
            });
        }

        console.log('💰 [ETAPA2] Preço B2B encontrado:', resultadoBusca.valor_mercado);
        console.log('📊 [ETAPA2] Tipo de fonte:', resultadoBusca.tipo_fonte || 'Não especificado');

        const valorMercado = parseFloat(resultadoBusca.valor_mercado);
        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';

        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        console.log('📉 [ETAPA2] Depreciação:', fatorDepreciacao, 'Valor atual:', valorAtual);

        const dadosCompletos = {
            numero_patrimonio,
            nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            valores_estimados: {
                valor_mercado_estimado: parseFloat(valorMercado.toFixed(2)),
                valor_atual_estimado: parseFloat(valorAtual.toFixed(2)),
                fator_depreciacao: fatorDepreciacao,
                percentual_depreciacao: `${((1 - fatorDepreciacao) * 100).toFixed(0)}%`,
                fonte_preco: resultadoBusca.fonte || 'Google Search B2B',
                tipo_fonte: resultadoBusca.tipo_fonte || 'Não especificado',
                observacoes: resultadoBusca.observacoes || 'Valor estimado para aquisição corporativa'
            },
            metadados: {
                data_busca: new Date().toISOString(),
                query_utilizada: queryBusca,
                modelo_ia: MODEL,
                estrategia: 'Busca B2B prioritária com fallback B2C'
            }
        };

        console.log('✅ [ETAPA2] Processamento concluído com sucesso!');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores B2B encontrados via busca corporativa'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);

        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao buscar preço: ' + error.message,
            dados: { preco_encontrado: false }
        });
    }
};