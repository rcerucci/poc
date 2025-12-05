const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Redis } = require('@upstash/redis');

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite';
const genAI = new GoogleGenerativeAI(API_KEY);

// Configurar Redis (Upstash)
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// =============================================================================
// NORMALIZAR TERMO (CHAVE CONSISTENTE)
// =============================================================================

function normalizarTermo(termo) {
    // Remove espaços extras, converte para minúsculas e remove caracteres especiais
    return termo
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Espaços → hífens
        .replace(/[^\w\-]/g, '')        // Remove caracteres especiais
        .substring(0, 100);             // Limita tamanho
}

// =============================================================================
// CACHE (REDIS)
// =============================================================================

async function verificarCache(termo) {
    try {
        const termoNormalizado = normalizarTermo(termo);
        const cacheKey = `cotacao:${termoNormalizado}`;
        
        console.log('🔍 [CACHE] Verificando:', cacheKey);
        console.log('🔑 [CACHE] Termo original:', termo);
        console.log('🔑 [CACHE] Termo normalizado:', termoNormalizado);
        
        const cached = await redis.get(cacheKey);
        
        if (!cached) {
            console.log('❌ [CACHE] Não encontrado');
            return { 
                encontrado: false,
                chave_usada: cacheKey 
            };
        }
        
        const dados = typeof cached === 'string' ? JSON.parse(cached) : cached;
        const dataCotacao = new Date(dados.data_cotacao);
        const idadeDias = (Date.now() - dataCotacao.getTime()) / (1000 * 60 * 60 * 24);
        
        console.log('✅ [CACHE] Encontrado!');
        console.log('📅 [CACHE] Idade:', idadeDias.toFixed(1), 'dias');
        console.log('📦 [CACHE] Produtos:', dados.avaliacao?.total_produtos || 0);
        
        return {
            encontrado: true,
            idade_dias: parseFloat(idadeDias.toFixed(1)),
            data_cotacao: dados.data_cotacao,
            dados: dados,
            chave_usada: cacheKey
        };
        
    } catch (error) {
        console.error('❌ [CACHE] Erro ao verificar:', error.message);
        console.error('❌ [CACHE] Stack:', error.stack);
        return { encontrado: false };
    }
}

async function salvarCache(termo, dadosCotacao, patrimonio, operadorId) {
    try {
        const termoNormalizado = normalizarTermo(termo);
        const cacheKey = `cotacao:${termoNormalizado}`;
        
        console.log('💾 [CACHE] Salvando:', cacheKey);
        console.log('🔑 [CACHE] Termo original:', termo);
        console.log('🔑 [CACHE] Termo normalizado:', termoNormalizado);
        
        const dadosParaSalvar = {
            termo_original: termo,
            termo_normalizado: termoNormalizado,
            data_cotacao: new Date().toISOString(),
            ...dadosCotacao,
            patrimonio: patrimonio,
            aceito_por: operadorId || 'sistema'
        };
        
        // Salvar com TTL de 7 dias (604800 segundos)
        const resultado = await redis.setex(
            cacheKey,
            7 * 24 * 60 * 60,
            JSON.stringify(dadosParaSalvar)
        );
        
        console.log('✅ [CACHE] Salvo com sucesso (TTL: 7 dias)');
        console.log('✅ [CACHE] Resultado Redis:', resultado);
        
        // Verificar se realmente salvou
        const verificacao = await redis.get(cacheKey);
        if (verificacao) {
            console.log('✅ [CACHE] Verificação OK - Dados encontrados após salvar');
        } else {
            console.error('❌ [CACHE] AVISO - Dados NÃO encontrados após salvar!');
        }
        
        // Incrementar contadores
        await redis.incr('stats:cache_salvos');
        
        return { 
            sucesso: true,
            chave: cacheKey,
            termo_normalizado: termoNormalizado
        };
        
    } catch (error) {
        console.error('❌ [CACHE] Erro ao salvar:', error.message);
        console.error('❌ [CACHE] Stack:', error.stack);
        return { sucesso: false, erro: error.message };
    }
}

// =============================================================================
// RESOLVER REDIRECTS
// =============================================================================

async function resolverRedirect(url) {
    console.log('🔄 [REDIRECT] Resolvendo:', url.substring(0, 80) + '...');
    
    if (!url.includes('vertexaisearch.cloud.google.com') && 
        !url.includes('google.com/url') &&
        !url.includes('google.com/search')) {
        console.log('✅ [REDIRECT] URL direto, sem redirect');
        return url;
    }
    
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow'
        });
        
        const urlFinal = response.url;
        console.log('✅ [REDIRECT] Resolvido:', urlFinal.substring(0, 80) + '...');
        return urlFinal;
        
    } catch (error) {
        console.warn('⚠️ [REDIRECT] Falha ao resolver:', error.message);
        return url;
    }
}

// =============================================================================
// EXTRAIR LINKS DO TEXTO MARKDOWN
// =============================================================================

function extrairLinksDoMarkdown(textoMarkdown) {
    const links = [];
    const linksVistos = new Set();
    
    console.log('🔗 [FALLBACK MARKDOWN] Tamanho do texto:', textoMarkdown.length, 'caracteres');
    
    const regexMarkdown = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let match;
    
    while ((match = regexMarkdown.exec(textoMarkdown)) !== null) {
        const titulo = match[1];
        const url = match[2];
        
        if (!linksVistos.has(url)) {
            linksVistos.add(url);
            links.push({
                uri: url,
                title: titulo,
                domain: extrairDominio(url),
                origem: 'markdown-pattern'
            });
        }
    }
    
    const regexUrlSimples = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    
    while ((match = regexUrlSimples.exec(textoMarkdown)) !== null) {
        const url = match[0];
        const urlLimpa = url.replace(/[.,;:!?)]$/, '');
        
        if (!linksVistos.has(urlLimpa)) {
            linksVistos.add(urlLimpa);
            links.push({
                uri: urlLimpa,
                title: 'Produto',
                domain: extrairDominio(urlLimpa),
                origem: 'url-simples'
            });
        }
    }
    
    console.log('📊 [FALLBACK] Total de links extraídos:', links.length);
    return links;
}

function extrairDominio(url) {
    try {
        const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
        return match ? match[1] : 'desconhecido';
    } catch (e) {
        return 'desconhecido';
    }
}

// =============================================================================
// BUSCAR COM GROUNDING
// =============================================================================

async function buscarComGrounding(termo) {
    console.log('🔍 [GROUNDING] Termo:', termo);
    
    if (!API_KEY) {
        throw new Error('API Key não configurada');
    }
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        });
        
        const prompt = `Busque informações sobre: ${termo}

Retorne produtos com preços em reais (R$).`;
        
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }]
        });
        
        const response = result.response;
        const texto = response.text();
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        
        const usage = result.response.usageMetadata;
        const tokensInput = usage?.promptTokenCount || 0;
        const tokensOutput = usage?.candidatesTokenCount || 0;
        const tokensTotal = usage?.totalTokenCount || 0;
        
        console.log('✅ [GROUNDING] Sucesso');
        console.log('📊 Tokens - Input:', tokensInput, '| Output:', tokensOutput, '| Total:', tokensTotal);
        
        return {
            sucesso: true,
            texto,
            groundingMetadata,
            tokens: {
                input: tokensInput,
                output: tokensOutput,
                total: tokensTotal
            }
        };
        
    } catch (error) {
        console.error('❌ [GROUNDING] Erro:', error.message);
        return {
            sucesso: false,
            erro: error.message
        };
    }
}

// =============================================================================
// PROCESSAR GROUNDING METADATA
// =============================================================================

async function processarGroundingMetadata(metadata, textoMarkdown) {
    const queries = metadata?.webSearchQueries || [];
    const chunks = metadata?.groundingChunks || [];
    const supports = metadata?.groundingSupports || [];
    
    let linksParaResolver = [];
    
    if (chunks.length > 0) {
        console.log('📦 [METADATA] Processando', chunks.length, 'chunks');
        linksParaResolver = chunks
            .filter(chunk => chunk.web)
            .map(chunk => ({
                uri: chunk.web.uri,
                title: chunk.web.title || 'Sem título',
                domain: extrairDominio(chunk.web.uri),
                origem: 'grounding-metadata'
            }));
    }
    
    if (linksParaResolver.length === 0) {
        console.log('⚠️ [METADATA] Nenhum link nos chunks, usando fallback');
        linksParaResolver = extrairLinksDoMarkdown(textoMarkdown);
    }
    
    if (linksParaResolver.length === 0) {
        console.warn('❌ [METADATA] Nenhum link encontrado');
        return {
            tem_resultados: false,
            total_chunks: chunks.length,
            total_queries: queries.length,
            queries_realizadas: queries,
            links_encontrados: [],
            suportes: [],
            search_entry_point: metadata?.searchEntryPoint || null
        };
    }
    
    const linksResolvidos = await Promise.all(
        linksParaResolver.map(async (link) => {
            const uriResolvido = await resolverRedirect(link.uri);
            return {
                ...link,
                uri_original: link.uri,
                uri: uriResolvido,
                domain: extrairDominio(uriResolvido)
            };
        })
    );
    
    const suportes = supports.map(support => ({
        texto: support.segment?.text || '',
        indices_chunks: support.groundingChunkIndices || [],
        confianca: support.confidenceScores || []
    }));
    
    return {
        tem_resultados: linksResolvidos.length > 0,
        total_chunks: chunks.length,
        total_queries: queries.length,
        queries_realizadas: queries,
        links_encontrados: linksResolvidos,
        suportes,
        search_entry_point: metadata?.searchEntryPoint || null
    };
}

// =============================================================================
// EXTRAIR DADOS ESTRUTURADOS
// =============================================================================

async function extrairDadosEstruturados(textoMarkdown) {
    console.log('📊 [EXTRAÇÃO] Estruturando dados...');
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        });
        
        const prompt = `Extraia produtos do texto em JSON.

TEXTO:
${textoMarkdown}

Retorne:

{
  "produtos": [
    {
      "nome": "nome completo do produto",
      "preco": 9666.00,
      "classificacao": "match"
    }
  ]
}

REGRAS:
- Preço: número decimal ou null se não houver
- "match" = exatamente o produto buscado | "similar" = marca/spec diferente  
- Extraia NA ORDEM que aparecem no texto`;
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();
        
        const usage = response.usageMetadata;
        const tokensExtracao = {
            input: usage?.promptTokenCount || 0,
            output: usage?.candidatesTokenCount || 0,
            total: usage?.totalTokenCount || 0
        };
        
        console.log('📊 Tokens Extração - Input:', tokensExtracao.input, '| Output:', tokensExtracao.output);
        
        const dadosFinais = JSON.parse(jsonText);
        
        if (!dadosFinais.produtos) {
            dadosFinais.produtos = [];
        }
        
        dadosFinais.produtos.forEach(p => {
            p.link = null;
            p.loja = null;
        });
        
        // Calcular média ponderada
        let somaMatch = 0, countMatch = 0;
        let somaSimilar = 0, countSimilar = 0;
        let precoMin = null, precoMax = null;
        let countComPreco = 0;
        
        dadosFinais.produtos.forEach(p => {
            if (p.preco !== null && p.preco !== undefined && !isNaN(p.preco)) {
                const preco = parseFloat(p.preco);
                countComPreco++;
                
                if (precoMin === null || preco < precoMin) precoMin = preco;
                if (precoMax === null || preco > precoMax) precoMax = preco;
                
                if (p.classificacao === 'match') {
                    somaMatch += preco;
                    countMatch++;
                } else if (p.classificacao === 'similar') {
                    somaSimilar += preco;
                    countSimilar++;
                }
            }
        });
        
        const denominador = (countMatch * 2) + countSimilar;
        const numerador = (somaMatch * 2) + somaSimilar;
        const mediaPonderada = denominador > 0 ? numerador / denominador : null;
        
        dadosFinais.avaliacao = {
            media_ponderada: mediaPonderada ? parseFloat(mediaPonderada.toFixed(2)) : null,
            total_produtos: dadosFinais.produtos.length,
            produtos_com_preco: countComPreco,
            produtos_match: countMatch,
            produtos_similar: countSimilar,
            preco_minimo: precoMin,
            preco_maximo: precoMax
        };
        
        console.log('✅ [EXTRAÇÃO] Encontrados:', dadosFinais.produtos.length, 'produtos');
        console.log('💰 [CÁLCULO] Média ponderada:', mediaPonderada?.toFixed(2) || 'N/A');
        
        return {
            sucesso: true,
            produtos: dadosFinais.produtos,
            avaliacao: dadosFinais.avaliacao,
            tokens: tokensExtracao
        };
        
    } catch (error) {
        console.error('❌ [EXTRAÇÃO] Erro:', error.message);
        return {
            sucesso: false,
            erro: error.message,
            produtos: [],
            avaliacao: {},
            tokens: { input: 0, output: 0, total: 0 }
        };
    }
}

// =============================================================================
// ENDPOINT PRINCIPAL
// =============================================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({
        status: 'Erro',
        mensagem: 'Método não permitido',
        dados: {}
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('🚀 [ETAPA2-V5.2] BUSCA COM GROUNDING + CACHE REDIS');
    console.log('='.repeat(70) + '\n');
    
    try {
        const {
            termo_busca_comercial,
            numero_patrimonio,
            nome_produto,
            marca,
            modelo,
            especificacoes,
            estado_conservacao,
            categoria_depreciacao,
            forcar_nova_busca
        } = req.body;
        
        if (!termo_busca_comercial || termo_busca_comercial.trim() === '') {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Campo "termo_busca_comercial" é obrigatório',
                dados: {}
            });
        }
        
        const termo = termo_busca_comercial.trim();
        
        console.log('📦 Patrimônio:', numero_patrimonio);
        console.log('📦 Produto:', nome_produto);
        console.log('🔍 Termo:', termo);
        console.log('🔄 Forçar nova busca:', forcar_nova_busca ? 'SIM' : 'NÃO');
        
        // VERIFICAR CACHE
        if (!forcar_nova_busca) {
            const cache = await verificarCache(termo);
            
            if (cache.encontrado) {
                console.log('✅ [CACHE] Retornando dados em cache');
                console.log('='.repeat(70) + '\n');
                
                return res.status(200).json({
                    status: 'Sucesso',
                    mensagem: `Cotação em cache (${cache.idade_dias} dia(s) atrás)`,
                    em_cache: true,
                    data_cotacao: cache.data_cotacao,
                    idade_dias: cache.idade_dias,
                    dados: cache.dados
                });
            }
        }
        
        // BUSCAR NOVA COTAÇÃO
        console.log('🔍 [BUSCA] Executando nova busca...');
        
        const resultado = await buscarComGrounding(termo);
        
        if (!resultado.sucesso) {
            return res.status(200).json({
                status: 'Erro',
                mensagem: 'Falha na busca com grounding',
                dados: {
                    produto: {
                        numero_patrimonio: numero_patrimonio || 'N/A',
                        nome_produto: nome_produto || 'N/A'
                    },
                    erro: resultado.erro
                }
            });
        }
        
        const metadataProcessada = await processarGroundingMetadata(
            resultado.groundingMetadata,
            resultado.texto
        );
        
        const dadosEstruturados = await extrairDadosEstruturados(
            resultado.texto
        );
        
        // Mapear links aos produtos
        if (dadosEstruturados.produtos && metadataProcessada.links_encontrados) {
            const links = metadataProcessada.links_encontrados;
            
            dadosEstruturados.produtos.forEach((produto, idx) => {
                if (idx < links.length) {
                    produto.link = links[idx].uri;
                    produto.loja = links[idx].domain.replace('www.', '');
                    console.log(`🔗 [MAP] Produto ${idx+1} → ${produto.loja}`);
                }
            });
        }
        
        const tokensTotal = {
            grounding: resultado.tokens,
            extracao: dadosEstruturados.tokens,
            total: resultado.tokens.total + dadosEstruturados.tokens.total
        };
        
        const dadosCompletos = {
            produto: {
                numero_patrimonio: numero_patrimonio || 'N/A',
                nome_produto: nome_produto || 'N/A',
                marca: marca || 'N/A',
                modelo: modelo || 'N/A',
                especificacoes: especificacoes || 'N/A',
                estado_conservacao: estado_conservacao || 'N/A',
                categoria_depreciacao: categoria_depreciacao || 'N/A'
            },
            
            busca: {
                termo_utilizado: termo,
                metodo: 'Grounding + Fallback URLs + JSON Extraction',
                queries_realizadas: metadataProcessada.queries_realizadas,
                total_queries: metadataProcessada.total_queries,
                total_links: metadataProcessada.links_encontrados.length
            },
            
            produtos_encontrados: dadosEstruturados.produtos || [],
            total_produtos: (dadosEstruturados.produtos || []).length,
            
            avaliacao: dadosEstruturados.avaliacao || {
                media_ponderada: null,
                total_produtos: (dadosEstruturados.produtos || []).length,
                produtos_com_preco: 0,
                produtos_match: 0,
                produtos_similar: 0,
                preco_minimo: null,
                preco_maximo: null
            },
            
            links_grounding: metadataProcessada.links_encontrados,
            
            meta: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '5.2-Cache-Normalizado',
                modelo_llm: MODEL,
                queries: metadataProcessada.total_queries,
                tokens_grounding: resultado.tokens.total,
                tokens_extracao: dadosEstruturados.tokens.total,
                tokens_total: tokensTotal.total
            }
        };
        
        console.log('\n✅ [ETAPA2-V5.2] CONCLUÍDO');
        console.log('📊 Queries realizadas:', metadataProcessada.total_queries);
        console.log('📊 Links encontrados:', metadataProcessada.links_encontrados.length);
        console.log('📊 Produtos estruturados:', (dadosEstruturados.produtos || []).length);
        console.log('💰 Média ponderada:', dadosCompletos.avaliacao.media_ponderada || 'N/A');
        console.log('📊 Tokens TOTAL:', tokensTotal.total);
        console.log('='.repeat(70) + '\n');
        
        // Incrementar stats
        try {
            await redis.incr('stats:buscas_novas');
            await redis.incrby('stats:tokens_gastos', tokensTotal.total);
        } catch (error) {
            console.warn('⚠️ Erro ao incrementar stats:', error.message);
        }
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: dadosCompletos.avaliacao.media_ponderada 
                ? `Média ponderada: R$ ${dadosCompletos.avaliacao.media_ponderada.toFixed(2)}`
                : `${(dadosEstruturados.produtos || []).length} produto(s) encontrado(s)`,
            em_cache: false,
            dados: dadosCompletos
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2-V5.2] ERRO:', error.message);
        console.error('❌ [STACK]:', error.stack);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};