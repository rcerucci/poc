const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');

// --- Configuração ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
const genAI = new GoogleGenerativeAI(API_KEY);

// Custom Search API
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
    
    if (dados.marca && dados.marca !== 'N/A') partes.push(dados.marca);
    if (dados.modelo && dados.modelo !== 'N/A') partes.push(dados.modelo);
    
    partes.push(dados.nome_produto);
    
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
    
    partes.push('comprar', 'preço');
    
    const termo = partes.join(' ');
    console.log('✅ [TERMO]', termo);
    
    return termo;
}

// =============================================================================
// MÓDULO 2: BUSCAR COM CUSTOM SEARCH API
// =============================================================================

async function buscarCustomSearch(termo) {
    console.log('🌐 [SEARCH] Buscando...');
    
    if (!API_KEY || !CUSTOM_SEARCH_CX_ID) {
        throw new Error('Custom Search não configurado');
    }
    
    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: API_KEY,
                cx: CUSTOM_SEARCH_CX_ID,
                q: termo,
                num: 10,
                gl: 'br',
                lr: 'lang_pt'
            },
            timeout: 10000
        });
        
        console.log('📥 [SEARCH] Status:', response.status);
        console.log('📥 [SEARCH] Itens:', response.data.items?.length || 0);
        
        if (!response.data.items || response.data.items.length === 0) {
            return { sucesso: false, links: [] };
        }
        
        const links = response.data.items.map(item => item.link);
        
        return { sucesso: true, links };
        
    } catch (error) {
        console.error('❌ [SEARCH]', error.message);
        return { sucesso: false, links: [] };
    }
}

// =============================================================================
// MÓDULO 3: SCRAPING DIRETO
// =============================================================================

function extrairPrecoDaPagina(html, url) {
    console.log('🔍 [SCRAPER] Analisando:', url.substring(0, 50) + '...');
    
    try {
        const $ = cheerio.load(html);
        
        $('script, style, noscript').remove();
        const textoCompleto = $('body').text();
        
        const padroes = [
            /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,
            /(\d{1,3}(?:\.\d{3})*,\d{2})\s*reais?/gi,
            /por\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi,
            /preço:?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi
        ];
        
        const precosEncontrados = new Set();
        
        padroes.forEach(padrao => {
            const matches = textoCompleto.matchAll(padrao);
            for (const match of matches) {
                const precoStr = match[1] || match[0];
                const precoLimpo = precoStr.replace(/[^\d,]/g, '');
                if (precoLimpo) precosEncontrados.add(precoLimpo);
            }
        });
        
        const precos = Array.from(precosEncontrados)
            .map(p => parseFloat(p.replace(',', '.')))
            .filter(p => !isNaN(p) && p > 10 && p < 1000000)
            .sort((a, b) => a - b);
        
        if (precos.length === 0) {
            console.log('⚠️ [SCRAPER] Nenhum preço encontrado');
            return null;
        }
        
        const titulo = $('title').text().trim().substring(0, 100) || 
                      $('h1').first().text().trim().substring(0, 100) ||
                      'Produto';
        
        let fonte = 'Site';
        if (url.includes('mercadolivre.com') || url.includes('mercadolibre.com')) fonte = 'Mercado Livre';
        else if (url.includes('americanas.com')) fonte = 'Americanas';
        else if (url.includes('magazineluiza.com')) fonte = 'Magazine Luiza';
        else if (url.includes('amazon.com')) fonte = 'Amazon';
        else if (url.includes('leroymerlin.com')) fonte = 'Leroy Merlin';
        else if (url.includes('madeiramadeira.com')) fonte = 'MadeiraMadeira';
        else if (url.includes('flexform.com')) fonte = 'Flexform';
        else if (url.includes('novoambiente.com')) fonte = 'Novo Ambiente';
        else if (url.includes('hermanmiller.com')) fonte = 'Herman Miller';
        else if (url.includes('casasbahia.com')) fonte = 'Casas Bahia';
        else if (url.includes('shoppingmatriz.com')) fonte = 'Shopping Matriz';
        else if (url.includes('comfy.com')) fonte = 'Comfy';
        else if (url.includes('carrefour.com')) fonte = 'Carrefour';
        else {
            // Extrair domínio principal como fallback
            try {
                const domain = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
                if (domain && domain[1]) {
                    fonte = domain[1].split('.')[0];
                    fonte = fonte.charAt(0).toUpperCase() + fonte.slice(1);
                }
            } catch (e) {
                fonte = 'Site';
            }
        }
        
        const precoFinal = precos.length === 1 ? precos[0] : precos[Math.floor(precos.length / 2)];
        
        console.log('✅ [SCRAPER] Preço encontrado: R$', precoFinal);
        
        return {
            valor: precoFinal,
            fonte: fonte,
            produto: titulo,
            link: url,
            precos_encontrados: precos.length
        };
        
    } catch (error) {
        console.error('❌ [SCRAPER] Erro:', error.message);
        return null;
    }
}

async function scrapearLinks(links, limite = 5) {
    console.log('🕷️ [SCRAPER] Iniciando scraping de', links.length, 'links...');
    
    const precos = [];
    const linksProcessar = links.slice(0, limite);
    const BATCH_SIZE = 5; // Aumentado de 3 para 5
    
    for (let i = 0; i < linksProcessar.length; i += BATCH_SIZE) {
        const batch = linksProcessar.slice(i, i + BATCH_SIZE);
        
        const resultados = await Promise.allSettled(
            batch.map(async (link) => {
                try {
                    console.log('📡 [SCRAPER] Fetching:', link.substring(0, 60) + '...');
                    
                    const response = await axios.get(link, {
                        timeout: 8000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'text/html,application/xhtml+xml',
                            'Accept-Language': 'pt-BR,pt;q=0.9',
                        },
                        maxRedirects: 5
                    });
                    
                    return extrairPrecoDaPagina(response.data, link);
                    
                } catch (error) {
                    console.error('❌ [SCRAPER] Erro ao buscar', link.substring(0, 40), ':', error.message);
                    return null;
                }
            })
        );
        
        resultados.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                precos.push(result.value);
            }
        });
        
        if (i + BATCH_SIZE < linksProcessar.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log('✅ [SCRAPER] Concluído:', precos.length, 'preços extraídos');
    
    return precos;
}

// =============================================================================
// MÓDULO 4: REFINAR PREÇOS COM LLM (FILTRO SEMÂNTICO)
// =============================================================================

async function refinarPrecosComLLM(produto, precosBrutos) {
    console.log('🤖 [LLM-REFINAR] Analisando', precosBrutos.length, 'preços brutos...');
    
    if (precosBrutos.length === 0) {
        return { sucesso: false, precos: precosBrutos, removidos: [], custo: 0 };
    }
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048 // Aumentado muito
            }
        });
        
        // Prompt ULTRA simplificado
        const prompt = `Produto: ${produto.nome_produto}

Preços:
${precosBrutos.map((p, i) => `${i+1}. R$ ${p.valor.toFixed(2)} - ${p.fonte}`).join('\n')}

Mantenha apenas preços similares. Remova:
- Categorias diferentes (presidente, gamer, luxo)
- Kits/conjuntos
- Premium (Herman Miller, >R$ 5000)

JSON (IDs dos válidos):
{"ok":true,"validos":[1,2,3]}

Sem válidos:
{"ok":false}

APENAS JSON.`;
        
        console.log('📤 [LLM-REFINAR] Enviando...');
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        const usage = result.response.usageMetadata;
        const tokIn = usage?.promptTokenCount || 0;
        const tokOut = usage?.candidatesTokenCount || 0;
        const custo = (tokIn * 0.0000016) + (tokOut * 0.0000133);
        
        console.log('📊 [LLM-REFINAR] Tokens:', tokIn, '/', tokOut, '| R$', custo.toFixed(6));
        console.log('📄 [LLM-REFINAR] Resposta:', text.substring(0, 200));
        
        if (!text || text.trim().length === 0) {
            console.error('❌ [LLM-REFINAR] Resposta vazia - usando fallback');
            return { sucesso: false, precos: precosBrutos, removidos: [], custo };
        }
        
        // Parse JSON
        let jsonText = text.trim()
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '');
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('❌ [LLM-REFINAR] Nenhum JSON - usando fallback');
            return { sucesso: false, precos: precosBrutos, removidos: [], custo };
        }
        jsonText = jsonMatch[0];
        
        let resultado;
        try {
            resultado = JSON.parse(jsonText);
        } catch (parseError) {
            console.error('❌ [LLM-REFINAR] Erro JSON - usando fallback');
            return { sucesso: false, precos: precosBrutos, removidos: [], custo };
        }
        
        if (!resultado.ok || !resultado.validos || resultado.validos.length === 0) {
            console.log('⚠️ [LLM-REFINAR] Nenhum preço aprovado - usando fallback');
            return { sucesso: false, precos: precosBrutos, removidos: [], custo };
        }
        
        // Separar válidos e removidos
        const precosValidos = [];
        const precosRemovidos = [];
        
        precosBrutos.forEach((preco, index) => {
            const id = index + 1;
            if (resultado.validos.includes(id)) {
                precosValidos.push(preco);
            } else {
                precosRemovidos.push({
                    ...preco,
                    motivo_llm: 'filtrado pela LLM'
                });
                console.log('🚫 [LLM-REFINAR] Removido:', preco.fonte, 'R$', preco.valor);
            }
        });
        
        console.log('✅ [LLM-REFINAR] Válidos:', precosValidos.length, '| Removidos:', precosRemovidos.length);
        
        return {
            sucesso: true,
            precos: precosValidos,
            removidos: precosRemovidos,
            custo
        };
        
    } catch (error) {
        console.error('❌ [LLM-REFINAR] Erro:', error.message);
        return { sucesso: false, precos: precosBrutos, removidos: [], custo: 0 };
    }
}

// =============================================================================
// MÓDULO 5: REMOVER OUTLIERS ESTATÍSTICOS (FILTRO NUMÉRICO)
// =============================================================================

function removerOutliersEstatisticos(precos) {
    console.log('📊 [OUTLIERS] Análise estatística final de', precos.length, 'preços...');
    
    if (precos.length < 4) {
        console.log('⚠️ [OUTLIERS] Poucos preços (<4), mantendo todos');
        return { precos: precos, removidos: [] };
    }
    
    const valores = precos.map(p => p.valor).sort((a, b) => a - b);
    const mediana = valores[Math.floor(valores.length / 2)];
    
    // Apenas remover extremos óbvios (>4x ou <0.25x mediana)
    const limiteSupMediana = mediana * 4;
    const limiteInfMediana = mediana * 0.25;
    
    console.log('📐 [OUTLIERS] Mediana:', mediana.toFixed(2));
    console.log('📐 [OUTLIERS] Limites: [', limiteInfMediana.toFixed(2), '-', limiteSupMediana.toFixed(2), ']');
    
    const normais = [];
    const removidos = [];
    
    precos.forEach(preco => {
        if (preco.valor >= limiteInfMediana && preco.valor <= limiteSupMediana) {
            normais.push(preco);
        } else {
            removidos.push(preco);
            console.log('🚫 [OUTLIERS] Removido: R$', preco.valor, '-', preco.fonte, '(' + (preco.valor / mediana).toFixed(1) + 'x mediana)');
        }
    });
    
    console.log('✅ [OUTLIERS] Mantidos:', normais.length, '| Removidos:', removidos.length);
    
    // Se remover todos, manter pelo menos 3 centrais
    if (normais.length < 3) {
        console.log('⚠️ [OUTLIERS] Muitos removidos, mantendo 3 centrais');
        const sorted = [...precos].sort((a, b) => a.valor - b.valor);
        const start = Math.max(0, Math.floor(sorted.length / 2) - 1);
        return { 
            precos: sorted.slice(start, start + 3),
            removidos: []
        };
    }
    
    return { precos: normais, removidos };
}

// =============================================================================
// MÓDULO 5: CALCULAR MÉDIA PONDERADA
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
                confianca: 40
            },
            precos: [{
                valor: p.valor,
                fonte: p.fonte,
                match: 'Scraping',
                peso: 1.0,
                produto: p.produto,
                link: p.link
            }]
        };
    }
    
    // Caso 2: 2+ preços - Média ponderada
    const precosComPeso = precos.map(p => {
        // Dar peso maior para fontes conhecidas
        let pesoFonte = 1.0;
        if (p.fonte.includes('Mercado Livre')) pesoFonte = 1.5;
        else if (p.fonte.includes('Americanas') || p.fonte.includes('Magazine')) pesoFonte = 1.3;
        
        return { ...p, peso_total: pesoFonte, match: 'Scraping' };
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
    else if (precosComPeso.length >= 5) scoreBase *= 1.1; // Bonus por muitos preços
    
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

    console.log('🔍 [ETAPA2-SCRAPER] Iniciando...');

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

        if (!resultadoBusca.sucesso || resultadoBusca.links.length === 0) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'Nenhum resultado encontrado na busca',
                dados: {
                    preco_encontrado: false,
                    termo_utilizado: termo
                },
                meta: {
                    custo: 0,
                    versao: 'v5-scraper'
                }
            });
        }

        // ========== PASSO 3: SCRAPING ==========
        const precos = await scrapearLinks(resultadoBusca.links, 10);

        if (!precos || precos.length === 0) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'Scraping não extraiu preços válidos',
                dados: {
                    preco_encontrado: false,
                    termo_utilizado: termo,
                    links_tentados: resultadoBusca.links.length
                },
                meta: {
                    custo: 0,
                    versao: 'v6-llm-refinar'
                }
            });
        }

        // ========== PASSO 4: REFINAMENTO COM LLM (FILTRO SEMÂNTICO) ==========
        const resultadoLLM = await refinarPrecosComLLM(dadosProduto, precos);
        let precosRefinados = resultadoLLM.precos;
        const precosRemovidosLLM = resultadoLLM.removidos;
        const custoLLM = resultadoLLM.custo;

        if (!resultadoLLM.sucesso || precosRefinados.length === 0) {
            console.log('⚠️ [ETAPA2] LLM não aprovou nenhum preço, usando todos');
            precosRefinados = precos; // Fallback: usar todos
        }

        // ========== PASSO 5: OUTLIERS ESTATÍSTICOS (FILTRO NUMÉRICO) ==========
        const resultadoOutliers = removerOutliersEstatisticos(precosRefinados);
        const precosLimpos = resultadoOutliers.precos;
        const outliersRemovidos = resultadoOutliers.removidos;

        if (precosLimpos.length === 0) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'Todos os preços foram filtrados',
                dados: {
                    preco_encontrado: false,
                    termo_utilizado: termo,
                    precos_encontrados: precos.length
                },
                meta: {
                    custo: custoLLM,
                    versao: 'v6-llm-refinar'
                }
            });
        }

        // ========== PASSO 6: CALCULAR MÉDIA ==========
        const resultadoEMA = calcularMediaPonderada(precosLimpos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: resultadoEMA.motivo,
                dados: { preco_encontrado: false },
                meta: {
                    custo: custoLLM,
                    versao: 'v6-llm-refinar'
                }
            });
        }

        // ========== PASSO 7: APLICAR DEPRECIAÇÃO ==========
        let valorMercado = resultadoEMA.valor_mercado;
        let metodo = 'Média Ponderada';
        const { coef_var, num } = resultadoEMA.estatisticas;

        if (num === 1) {
            metodo = 'Preço Único';
        } else if (coef_var > 40 && num > 1) {
            const valores = resultadoEMA.precos.map(p => p.valor).sort((a, b) => a - b);
            valorMercado = valores[Math.floor(valores.length / 2)];
            metodo = 'Mediana (alta variação)';
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
                links_encontrados: resultadoBusca.links.length,
                precos_scraping: precos.length,
                removidos_llm: precosRemovidosLLM.length,
                removidos_outliers: outliersRemovidos.length,
                precos_finais: num
            },
            
            filtros: {
                llm: precosRemovidosLLM.length > 0 ? precosRemovidosLLM.map(p => ({
                    valor: p.valor,
                    fonte: p.fonte,
                    produto: p.produto.substring(0, 60),
                    motivo: p.motivo_llm
                })) : undefined,
                outliers: outliersRemovidos.length > 0 ? outliersRemovidos.map(o => ({
                    valor: o.valor,
                    fonte: o.fonte,
                    motivo: 'Outlier estatístico'
                })) : undefined
            },
            
            meta: {
                data: new Date().toISOString(),
                versao: 'v6-llm-refinar',
                custo_llm: parseFloat(custoLLM.toFixed(6)),
                custo_total: parseFloat(custoLLM.toFixed(6))
            }
        };

        console.log('✅ R$', valorMercado.toFixed(2), '| Atual: R$', valorAtual.toFixed(2), '| ' + num + ' preço(s)');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: num + ' preço(s) | ' + resultadoEMA.estatisticas.confianca.toFixed(0) + '% conf'
        });

    } catch (error) {
        console.error('❌ [ETAPA2-SCRAPER] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: { preco_encontrado: false }
        });
    }
};