const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// --- Configuração ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
const genAI = new GoogleGenerativeAI(API_KEY);

// Custom Search API (usa mesma chave do Gemini)
const CUSTOM_SEARCH_CX_ID = process.env.CUSTOM_SEARCH_CX_ID;

// --- Fatores de Depreciação ---
const FATORES_DEPRECIACAO = {
    Excelente: {
        'Computadores e Informática': 0.9,
        'Ferramentas': 0.85,
        'Instalações': 0.8,
        'Máquinas e Equipamentos': 0.85,
        'Móveis e Utensílios': 0.8,
        'Veículos': 0.85,
        'Outros': 0.75
    },
    Bom: {
        'Computadores e Informática': 0.75,
        'Ferramentas': 0.7,
        'Instalações': 0.65,
        'Máquinas e Equipamentos': 0.7,
        'Móveis e Utensílios': 0.65,
        'Veículos': 0.7,
        'Outros': 0.6
    },
    Regular: {
        'Computadores e Informática': 0.55,
        'Ferramentas': 0.5,
        'Instalações': 0.45,
        'Máquinas e Equipamentos': 0.5,
        'Móveis e Utensílios': 0.45,
        'Veículos': 0.5,
        'Outros': 0.4
    },
    Ruim: {
        'Computadores e Informática': 0.35,
        'Ferramentas': 0.3,
        'Instalações': 0.25,
        'Máquinas e Equipamentos': 0.3,
        'Móveis e Utensílios': 0.25,
        'Veículos': 0.3,
        'Outros': 0.2
    }
};

// =============================================================================
// MÓDULO 1: CONSTRUIR TERMO DE BUSCA
// =============================================================================

function construirTermoBusca(dados) {
    console.log('🔍 [TERMO] Construindo termo de busca...');
    
    let partes = [];
    
    // Marca e modelo
    if (dados.marca && dados.marca !== 'N/A') partes.push(dados.marca);
    if (dados.modelo && dados.modelo !== 'N/A') partes.push(dados.modelo);
    
    // Nome do produto
    partes.push(dados.nome_produto);
    
    // Extrair specs importantes (potência, capacidade, tamanho)
    if (dados.especificacoes && dados.especificacoes !== 'N/A') {
        const specs = dados.especificacoes;
        const padroes = [
            /(\d+\.?\d*)\s*(kva|kw|hp|w)\b/gi,
            /(\d+)\s*(gb|tb)\b/gi,
            /(\d+\.?\d*)\s*(polegadas?|pol|")\b/gi
        ];
        
        padroes.forEach(padrao => {
            const match = specs.match(padrao);
            if (match) partes.push(match[0]);
        });
    }
    
    // Adicionar contexto de busca
    partes.push('novo', 'preço', 'Brasil');
    
    const termo = partes.join(' ');
    console.log('✅ [TERMO]', termo);
    
    return termo;
}

// =============================================================================
// MÓDULO 2: BUSCAR COM CUSTOM SEARCH API
// =============================================================================

async function buscarCustomSearch(termo) {
    console.log('🌐 [SEARCH] Iniciando busca...');
    console.log('🔑 [SEARCH] API_KEY existe:', !!API_KEY);
    console.log('🔑 [SEARCH] CX_ID:', CUSTOM_SEARCH_CX_ID);
    console.log('🔍 [SEARCH] Termo:', termo);
    
    if (!API_KEY || !CUSTOM_SEARCH_CX_ID) {
        throw new Error('Custom Search não configurado (verifique GOOGLE_API_KEY e CUSTOM_SEARCH_CX_ID)');
    }
    
    try {
        const params = {
            key: API_KEY,
            cx: CUSTOM_SEARCH_CX_ID,
            q: termo,
            num: 10,
            gl: 'br',
            lr: 'lang_pt'
        };
        
        console.log('📡 [SEARCH] Chamando API...');
        
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params,
            timeout: 10000
        });
        
        console.log('📥 [SEARCH] Status:', response.status);
        console.log('📥 [SEARCH] searchInformation:', response.data.searchInformation);
        console.log('📥 [SEARCH] Itens:', response.data.items?.length || 0);
        
        if (response.data.error) {
            console.error('❌ [SEARCH] API Error:', response.data.error);
            throw new Error('Custom Search Error: ' + response.data.error.message);
        }
        
        if (!response.data.items || response.data.items.length === 0) {
            console.log('⚠️ [SEARCH] Nenhum resultado (verifique CX_ID)');
            return { sucesso: false, resultados: [] };
        }
        
        // Simplificar resultados para reduzir tokens
        const resultados = response.data.items.map((item, i) => ({
            id: i + 1,
            title: item.title,
            snippet: item.snippet,
            link: item.link,
            site: item.displayLink
        }));
        
        return { sucesso: true, resultados };
        
    } catch (error) {
        console.error('❌ [SEARCH] Erro:', error.message);
        console.error('❌ [SEARCH] Status:', error.response?.status);
        console.error('❌ [SEARCH] Data:', JSON.stringify(error.response?.data || {}));
        return { sucesso: false, resultados: [] };
    }
}

// =============================================================================
// MÓDULO 3: ANALISAR RESULTADOS COM LLM
// =============================================================================

const PROMPT_ANALISAR_PRECOS = (produto, resultados) => {
    return `Extraia preços de produtos NOVOS dos resultados de busca.

PRODUTO: ${produto.nome_produto} ${produto.marca || ''} ${produto.modelo || ''}

RESULTADOS (${resultados.length} sites):
${resultados.map(r => `${r.id}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join('\n\n')}

TAREFA:
1. Encontre preços em BRL (R$)
2. Apenas produtos NOVOS
3. Mínimo 3 preços

RESPONDA APENAS JSON:
{
  "ok": true,
  "precos": [
    {"valor": 299.90, "fonte": "Loja X", "match": "Exato", "produto": "Cadeira Y", "link": "url", "justificativa": "novo preço visível"}
  ]
}

Sem preços: {"ok": false, "motivo": "nenhum preço encontrado"}

IMPORTANTE: JSON válido, SEM markdown, SEM texto extra.`;
};

async function analisarComLLM(produto, resultados) {
    console.log('🤖 [LLM] Analisando', resultados.length, 'resultados...');
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 800
            }
        });
        
        const prompt = PROMPT_ANALISAR_PRECOS(produto, resultados);
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        const usage = result.response.usageMetadata;
        const tokIn = usage?.promptTokenCount || 0;
        const tokOut = usage?.candidatesTokenCount || 0;
        const custoIn = tokIn * 0.0000016;
        const custoOut = tokOut * 0.0000133;
        const custoTot = custoIn + custoOut;
        
        console.log('📊 [LLM] Tokens:', tokIn, '/', tokOut, '| R$', custoTot.toFixed(6));
        
        // Verificar se resposta está vazia
        if (!text || text.trim().length === 0) {
            console.error('❌ [LLM] Resposta vazia');
            return {
                sucesso: false,
                precos: [],
                meta: { tokens: { in: tokIn, out: tokOut }, custo: custoTot }
            };
        }
        
        console.log('📄 [LLM] Resposta (primeiros 200 chars):', text.substring(0, 200));
        
        console.log('📄 [LLM] Resposta (primeiros 200 chars):', text.substring(0, 200));
        
        // Parse JSON
        let jsonText = text.trim()
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '');
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('❌ [LLM] Nenhum JSON encontrado na resposta');
            console.error('❌ [LLM] Texto completo:', text);
            return {
                sucesso: false,
                precos: [],
                meta: { tokens: { in: tokIn, out: tokOut }, custo: custoTot }
            };
        }
        jsonText = jsonMatch[0];
        
        let resultado;
        try {
            resultado = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('❌ [LLM] Erro ao parsear JSON:', parseError.message);
            console.error('❌ [LLM] JSON text:', jsonText.substring(0, 300));
            return {
                sucesso: false,
                precos: [],
                meta: { tokens: { in: tokIn, out: tokOut }, custo: custoTot }
            };
        }
        
        if (!resultado.ok) {
            console.log('⚠️ [LLM]', resultado.motivo || 'Nenhum preço encontrado');
            return {
                sucesso: false,
                precos: [],
                meta: { tokens: { in: tokIn, out: tokOut }, custo: custoTot }
            };
        }
        
        console.log('✅ [LLM]', resultado.precos.length, 'preços extraídos');
        
        return {
            sucesso: true,
            precos: resultado.precos,
            meta: { tokens: { in: tokIn, out: tokOut }, custo: custoTot }
        };
        
    } catch (error) {
        console.error('❌ [LLM]', error.message);
        return {
            sucesso: false,
            precos: [],
            meta: { tokens: { in: 0, out: 0 }, custo: 0 }
        };
    }
}

// =============================================================================
// MÓDULO 4: CALCULAR MÉDIA PONDERADA
// =============================================================================

function calcularMediaPonderada(precos) {
    console.log('📊 [MEDIA] Calculando...');
    
    if (!precos || precos.length === 0) {
        return { sucesso: false, motivo: 'Nenhum preço' };
    }
    
    // Caso 1: Apenas 1 preço
    if (precos.length === 1) {
        const p = precos[0];
        return {
            sucesso: true,
            valor_mercado: p.valor,
            estatisticas: {
                num: 1,
                min: p.valor,
                max: p.valor,
                desvio: 0,
                coef_var: 0,
                confianca: 30
            },
            precos: [{
                valor: p.valor,
                fonte: p.fonte,
                match: p.match,
                peso: 1.0,
                produto: p.produto,
                link: p.link
            }]
        };
    }
    
    // Caso 2: 2+ preços - Média ponderada
    const precosComPeso = precos.map(p => {
        let pesoMatch = 1.0;
        if (p.match === 'Exato') pesoMatch = 2.0;
        else if (p.match === 'Equivalente') pesoMatch = 1.5;
        else if (p.match === 'Substituto') pesoMatch = 1.3;
        
        const pesoFonte = p.fonte.toLowerCase().includes('oficial') ? 1.3 : 1.0;
        const pesoTotal = pesoMatch * pesoFonte;
        
        return { ...p, peso_total: pesoTotal };
    });
    
    const somaPonderada = precosComPeso.reduce((acc, p) => acc + (p.valor * p.peso_total), 0);
    const somaPesos = precosComPeso.reduce((acc, p) => acc + p.peso_total, 0);
    const mediaPonderada = somaPonderada / somaPesos;
    
    const media = precosComPeso.reduce((acc, p) => acc + p.valor, 0) / precosComPeso.length;
    const variancia = precosComPeso.reduce((acc, p) => acc + Math.pow(p.valor - media, 2), 0) / precosComPeso.length;
    const desvioPadrao = Math.sqrt(variancia);
    const coefVariacao = (desvioPadrao / media) * 100;
    
    let scoreBase = 100 - coefVariacao;
    if (precosComPeso.length === 2) scoreBase *= 0.7;
    else if (precosComPeso.length === 3) scoreBase *= 0.85;
    
    const scoreConfianca = Math.max(0, Math.min(100, scoreBase));
    
    console.log('💰 [MEDIA] R$', mediaPonderada.toFixed(2), '| Conf:', scoreConfianca.toFixed(0) + '%');
    
    return {
        sucesso: true,
        valor_mercado: parseFloat(mediaPonderada.toFixed(2)),
        estatisticas: {
            num: precosComPeso.length,
            min: Math.min(...precosComPeso.map(p => p.valor)),
            max: Math.max(...precosComPeso.map(p => p.valor)),
            desvio: parseFloat(desvioPadrao.toFixed(2)),
            coef_var: parseFloat(coefVariacao.toFixed(2)),
            confianca: parseFloat(scoreConfianca.toFixed(1))
        },
        precos: precosComPeso.map(p => ({
            valor: p.valor,
            fonte: p.fonte,
            match: p.match,
            peso: parseFloat(p.peso_total.toFixed(2)),
            produto: p.produto,
            link: p.link
        }))
    };
}

// =============================================================================
// ENDPOINT PRINCIPAL
// =============================================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('🔍 [ETAPA2-CUSTOM] Iniciando...');

    try {
        const {
            nome_produto,
            modelo,
            marca,
            especificacoes,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio
        } = req.body;

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Nome do produto é obrigatório',
                dados: {}
            });
        }

        const dadosProduto = { nome_produto, marca, modelo, especificacoes };

        // ========== PASSO 1: CONSTRUIR TERMO ==========
        const termo = construirTermoBusca(dadosProduto);

        // ========== PASSO 2: BUSCAR (CUSTOM SEARCH API) ==========
        const resultadoBusca = await buscarCustomSearch(termo);

        if (!resultadoBusca.sucesso || resultadoBusca.resultados.length === 0) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'Nenhum resultado encontrado na busca',
                dados: {
                    preco_encontrado: false,
                    termo_utilizado: termo
                },
                meta: {
                    tokens: { in: 0, out: 0 },
                    custo: 0,
                    versao: 'v4-custom-search'
                }
            });
        }

        // ========== PASSO 3: ANALISAR COM LLM ==========
        const analise = await analisarComLLM(dadosProduto, resultadoBusca.resultados);

        if (!analise.sucesso || analise.precos.length === 0) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'LLM não encontrou preços válidos nos resultados',
                dados: {
                    preco_encontrado: false,
                    termo_utilizado: termo,
                    resultados_busca: resultadoBusca.resultados.length
                },
                meta: {
                    tokens: analise.meta.tokens,
                    custo: parseFloat(analise.meta.custo.toFixed(6)),
                    versao: 'v4-custom-search'
                }
            });
        }

        // ========== PASSO 4: CALCULAR MÉDIA ==========
        const resultadoEMA = calcularMediaPonderada(analise.precos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: resultadoEMA.motivo,
                dados: { preco_encontrado: false },
                meta: {
                    tokens: analise.meta.tokens,
                    custo: parseFloat(analise.meta.custo.toFixed(6)),
                    versao: 'v4-custom-search'
                }
            });
        }

        // ========== PASSO 5: APLICAR DEPRECIAÇÃO ==========
        let valorMercado = resultadoEMA.valor_mercado;
        let metodo = 'Média Ponderada';
        const { coef_var, num } = resultadoEMA.estatisticas;

        if (num === 1) {
            metodo = 'Preço Único';
        } else if (coef_var > 40 && num > 1) {
            const valores = resultadoEMA.precos.map(p => p.valor).sort((a, b) => a - b);
            valorMercado = valores[Math.floor(valores.length / 2)];
            metodo = 'Mediana (alta variação)';
            console.log('⚠️ Alta variação:', coef_var.toFixed(1) + '% - usando mediana');
        }

        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';
        const fatorDep = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDep;

        // ========== RESPOSTA FINAL ==========
        const dadosCompletos = {
            numero_patrimonio,
            nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            especificacoes: especificacoes || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            
            valores: {
                mercado: parseFloat(valorMercado.toFixed(2)),
                atual: parseFloat(valorAtual.toFixed(2)),
                depreciacao: fatorDep,
                percentual_dep: ((1 - fatorDep) * 100).toFixed(0) + '%',
                metodo: metodo,
                confianca: resultadoEMA.estatisticas.confianca
            },
            
            stats: {
                num: num,
                min: resultadoEMA.estatisticas.min,
                max: resultadoEMA.estatisticas.max,
                desvio: resultadoEMA.estatisticas.desvio,
                coef_var: resultadoEMA.estatisticas.coef_var,
                confianca: resultadoEMA.estatisticas.confianca
            },
            
            precos: resultadoEMA.precos.map(p => ({
                v: p.valor,
                f: p.fonte,
                m: p.match,
                p: p.produto,
                u: p.link
            })),
            
            busca: {
                termo: termo,
                resultados_encontrados: resultadoBusca.resultados.length,
                precos_extraidos: num
            },
            
            meta: {
                data: new Date().toISOString(),
                modelo: MODEL,
                versao: 'v4-custom-search',
                tokens: analise.meta.tokens,
                custo: parseFloat(analise.meta.custo.toFixed(6))
            }
        };

        console.log('✅ R$', valorMercado.toFixed(2), '| Atual: R$', valorAtual.toFixed(2), '| ' + num + ' preço(s)');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: num + ' preço(s) | ' + resultadoEMA.estatisticas.confianca.toFixed(0) + '% conf'
        });

    } catch (error) {
        console.error('❌ [ETAPA2-CUSTOM] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: { preco_encontrado: false }
        });
    }
};