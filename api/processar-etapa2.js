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
// CACHE (REDIS)
// =============================================================================

async function verificarCache(termo) {
    try {
        // Usar termo DIRETO como chave (Etapa 1 já é consistente)
        const cacheKey = `cotacao:${termo}`;
        
        console.log('🔍 [CACHE] Verificando:', cacheKey);
        
        const cached = await redis.get(cacheKey);
        
        if (!cached) {
            console.log('❌ [CACHE] Não encontrado');
            return { encontrado: false };
        }
        
        const dados = typeof cached === 'string' ? JSON.parse(cached) : cached;
        const dataCotacao = new Date(dados.data_cotacao);
        const idadeDias = (Date.now() - dataCotacao.getTime()) / (1000 * 60 * 60 * 24);
        
        console.log('✅ [CACHE] Encontrado!');
        console.log('📅 [CACHE] Idade:', idadeDias.toFixed(1), 'dias');
        
        return {
            encontrado: true,
            idade_dias: parseFloat(idadeDias.toFixed(1)),
            data_cotacao: dados.data_cotacao,
            dados: dados
        };
        
    } catch (error) {
        console.error('❌ [CACHE] Erro ao verificar:', error.message);
        return { encontrado: false };
    }
}

async function salvarCache(termo, dadosCotacao, patrimonio, operadorId) {
    try {
        // Usar termo DIRETO como chave
        const cacheKey = `cotacao:${termo}`;
        
        console.log('💾 [CACHE] Salvando:', cacheKey);
        
        const dadosParaSalvar = {
            termo_original: termo,
            data_cotacao: new Date().toISOString(),
            ...dadosCotacao,
            patrimonio: patrimonio,
            aceito_por: operadorId || 'sistema'
        };
        
        // Salvar com TTL de 7 dias (604800 segundos)
        await redis.setex(
            cacheKey,
            7 * 24 * 60 * 60,
            JSON.stringify(dadosParaSalvar)
        );
        
        console.log('✅ [CACHE] Salvo com sucesso (TTL: 7 dias)');
        
        // Incrementar contadores
        await redis.incr('stats:cache_salvos');
        
        return { sucesso: true };
        
    } catch (error) {
        console.error('❌ [CACHE] Erro ao salvar:', error.message);
        return { sucesso: false, erro: error.message };
    }
}

// =============================================================================
// RESOLVER REDIRECTS (usando fetch nativo do Node 18+)
// =============================================================================

async function resolverRedirect(url) {
    console.log('🔄 [REDIRECT] Resolvendo:', url.substring(0, 80) + '...');
    
    // Se não for um redirect do Google, retornar o URL original
    if (!url.includes('vertexaisearch.cloud.google.com') && 
        !url.includes('google.com/url') &&
        !url.includes('google.com/search')) {
        console.log('✅ [REDIRECT] URL direto, sem redirect');
        return url;
    }
    
    try {
        // Node 18+ tem fetch nativo
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow'
        });
        
        const urlFinal = response.url;
        console.log('✅ [REDIRECT] Resolvido:', urlFinal.substring(0, 80) + '...');
        return urlFinal;
        
    } catch (error) {
        console.warn('⚠️ [REDIRECT] Falha ao resolver:', error.message);
        return url; // Fallback para URL original
    }
}

// =============================================================================
// EXTRAIR LINKS DO TEXTO MARKDOWN (FALLBACK)
// =============================================================================

function extrairLinksDoMarkdown(textoMarkdown) {
    const links = [];
    const linksVistos = new Set(); // Evitar duplicatas
    
    console.log('==================================================');
    console.log('🔗 [FALLBACK MARKDOWN] INICIANDO');
    console.log('==================================================');
    console.log('📝 Tamanho do texto:', textoMarkdown.length, 'caracteres');
    
    // Regex 1: Links em formato Markdown: [texto](url)
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
            console.log('📎 [MARKDOWN] Encontrado:', url.substring(0, 60) + '...');
        }
    }
    
    // Regex 2: URLs simples (http://... ou https://...)
    // Pega URLs que estão sozinhas no texto, mesmo sem []()
    const regexUrlSimples = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    
    while ((match = regexUrlSimples.exec(textoMarkdown)) !== null) {
        const url = match[0];
        
        // Limpar caracteres finais indesejados
        const urlLimpa = url.replace(/[.,;:!?)]$/, '');
        
        if (!linksVistos.has(urlLimpa)) {
            linksVistos.add(urlLimpa);
            
            // Tentar extrair título do contexto (linha anterior)
            const posicao = textoMarkdown.indexOf(url);
            const linhaAnterior = textoMarkdown.substring(Math.max(0, posicao - 200), posicao);
            const matchTitulo = linhaAnterior.match(/Nome completo do produto:\*\*\s*([^\n]+)/);
            const titulo = matchTitulo ? matchTitulo[1].trim() : 'Produto';
            
            links.push({
                uri: urlLimpa,
                title: titulo,
                domain: extrairDominio(urlLimpa),
                origem: 'url-simples'
            });
            console.log('🔗 [URL-SIMPLES] Encontrado:', urlLimpa.substring(0, 60) + '...');
        }
    }
    
    console.log('📊 [FALLBACK] Total de links extraídos:', links.length);
    console.log('==================================================');
    
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
// BUSCAR COM GROUNDING (ETAPA 1 - MARKDOWN COM CITAÇÕES)
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
        
        // IMPORTANTE: Pedir em MARKDOWN para preservar grounding metadata
        const prompt = `Busque informações sobre: ${termo}

Retorne os produtos encontrados em formato MARKDOWN com preços em reais (R$).
Para cada produto inclua:
- Nome completo do produto
- Preço à vista (se disponível)
- Preço parcelado (se disponível)
- Nome da loja
- Link COMPLETO do produto (URL clicável)

Use listas numeradas e SEMPRE inclua o link do produto.`;
        
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            tools: ['google_search_retrieval']
        });
        
        const response = result.response;
        const texto = response.text();
        
        // Extrair metadata de grounding
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        
        // Extrair usage metadata
        const usage = result.response.usageMetadata;
        const tokensInput = usage?.promptTokenCount || 0;
        const tokensOutput = usage?.candidatesTokenCount || 0;
        const tokensTotal = usage?.totalTokenCount || 0;
        
        console.log('✅ [GROUNDING] Sucesso');
        console.log('📊 Tokens - Input:', tokensInput, '| Output:', tokensOutput, '| Total:', tokensTotal);
        
        if (groundingMetadata) {
            console.log('🌐 Web searches:', groundingMetadata.webSearchQueries?.length || 0);
            console.log('📦 Grounding chunks:', groundingMetadata.groundingChunks?.length || 0);
        }
        
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
// PROCESSAR GROUNDING METADATA COM RESOLUÇÃO DE REDIRECTS
// =============================================================================

async function processarGroundingMetadata(metadata, textoMarkdown) {
    const queries = metadata?.webSearchQueries || [];
    const chunks = metadata?.groundingChunks || [];
    const supports = metadata?.groundingSupports || [];
    
    let linksParaResolver = [];
    
    // PRIORIDADE 1: Tentar extrair dos chunks do grounding
    if (chunks.length > 0) {
        console.log('📦 [METADATA] Processando', chunks.length, 'chunks');
        linksParaResolver = chunks
            .filter(chunk => chunk.web)
            .map(chunk => ({
                uri: chunk.web.uri,
                title: chunk.web.title || 'Sem título',
                domain: chunk.web.domain || extrairDominio(chunk.web.uri),
                origem: 'grounding-metadata'
            }));
    }
    
    // FALLBACK: Se não houver links nos chunks, extrair do Markdown
    if (linksParaResolver.length === 0) {
        console.log('⚠️ [METADATA] Nenhum link nos chunks, usando fallback');
        linksParaResolver = extrairLinksDoMarkdown(textoMarkdown);
    }
    
    if (linksParaResolver.length === 0) {
        console.warn('❌ [METADATA] Nenhum link encontrado em nenhuma fonte');
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
    
    console.log('🔄 [REDIRECT] Resolvendo', linksParaResolver.length, 'links...');
    
    // Resolver todos os redirects em paralelo
    const linksResolvidos = await Promise.all(
        linksParaResolver.map(async (link) => ({
            ...link,
            uri_original: link.uri,
            uri: await resolverRedirect(link.uri)
        }))
    );
    
    // Processar supports (liga texto às fontes)
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
// MASCARAR URLS (PROTEÇÃO CONTRA CORRUPÇÃO)
// =============================================================================

function mascararUrls(texto, links) {
    if (!links || links.length === 0) {
        console.warn('⚠️ [MASK] Nenhum link para mascarar');
        return { textoMascarado: texto, mapaUrls: {} };
    }
    
    let textoMascarado = texto;
    const mapaUrls = {};
    
    links.forEach((link, idx) => {
        const placeholder = `<<URL_${idx + 1}>>`;
        mapaUrls[placeholder] = link.uri;
        
        // Substituir URLs no texto
        textoMascarado = textoMascarado.replace(new RegExp(escapeRegex(link.uri), 'g'), placeholder);
        if (link.uri_original && link.uri_original !== link.uri) {
            textoMascarado = textoMascarado.replace(new RegExp(escapeRegex(link.uri_original), 'g'), placeholder);
        }
    });
    
    console.log('🎭 [MASK] URLs mascaradas:', Object.keys(mapaUrls).length);
    return { textoMascarado, mapaUrls };
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function desmascararUrls(texto, mapaUrls) {
    if (!mapaUrls || Object.keys(mapaUrls).length === 0) {
        console.warn('⚠️ [UNMASK] Nenhum mapa de URLs disponível');
        return texto;
    }
    
    let textoFinal = texto;
    
    Object.entries(mapaUrls).forEach(([placeholder, url]) => {
        textoFinal = textoFinal.replace(new RegExp(escapeRegex(placeholder), 'g'), url);
    });
    
    console.log('🎭 [UNMASK] URLs restauradas:', Object.keys(mapaUrls).length);
    return textoFinal;
}

// =============================================================================
// EXTRAIR DADOS ESTRUTURADOS (ETAPA 2 - JSON COM URLS PROTEGIDAS)
// =============================================================================

async function extrairDadosEstruturados(textoMarkdown, mapaUrls) {
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
        
        const prompt = `Converta o seguinte texto Markdown em JSON estruturado.

TEXTO MARKDOWN:
${textoMarkdown}

Retorne um JSON com esta estrutura EXATA:

{
  "produtos": [
    {
      "nome": "nome completo do produto",
      "preco": 999.99,
      "link": "URL_placeholder_ou_URL_completa",
      "loja": "nome da loja",
      "classificacao": "match" ou "similar"
    }
  ],
  "avaliacao": {
    "media_ponderada": 0,
    "total_produtos": 0,
    "produtos_com_preco": 0,
    "produtos_match": 0,
    "produtos_similar": 0,
    "preco_minimo": 0,
    "preco_maximo": 0
  }
}

REGRAS PARA PREÇOS:
- Extraia TODOS os preços mencionados no texto
- Converta "R$ 9.666,00" para 9666.00 (número decimal)
- Se houver múltiplos preços (à vista/parcelado), use o MENOR (à vista)
- Se não houver preço, use null

REGRAS PARA CLASSIFICAÇÃO:
- "match" = produto da MESMA marca E especificação (ex: Minuzzi 25kVA)
- "similar" = marca diferente OU especificação diferente
- Se não puder determinar, use "similar"

REGRAS PARA MÉDIA PONDERADA:
- Calcule usando: (soma_match * 2 + soma_similar * 1) / (count_match * 2 + count_similar * 1)
- Match tem peso 2, Similar tem peso 1
- Se não houver preços, média = null
- Arredonde para 2 casas decimais

REGRAS PARA LINKS:
- Se o link estiver em formato <<URL_N>>, preserve EXATAMENTE
- Se for URL completa (https://...), preserve também
- Não invente ou altere links`;
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();
        
        // Extrair tokens desta chamada
        const usage = response.usageMetadata;
        const tokensExtracao = {
            input: usage?.promptTokenCount || 0,
            output: usage?.candidatesTokenCount || 0,
            total: usage?.totalTokenCount || 0
        };
        
        console.log('📊 Tokens Extração - Input:', tokensExtracao.input, '| Output:', tokensExtracao.output, '| Total:', tokensExtracao.total);
        
        const dados = JSON.parse(jsonText);
        
        // Desmascarar URLs no JSON (se houver mapa)
        const jsonComUrls = mapaUrls && Object.keys(mapaUrls).length > 0
            ? desmascararUrls(JSON.stringify(dados), mapaUrls)
            : JSON.stringify(dados);
        const dadosFinais = JSON.parse(jsonComUrls);
        
        console.log('✅ [EXTRAÇÃO] Encontrados:', dadosFinais.produtos?.length || 0, 'produtos');
        console.log('💰 [EXTRAÇÃO] Média ponderada:', dadosFinais.avaliacao?.media_ponderada || 'N/A');
        console.log('📊 [EXTRAÇÃO] Match:', dadosFinais.avaliacao?.produtos_match || 0, '| Similar:', dadosFinais.avaliacao?.produtos_similar || 0);
        
        return {
            sucesso: true,
            produtos: dadosFinais.produtos || [],
            avaliacao: dadosFinais.avaliacao || {},
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
    console.log('🚀 [ETAPA2-V5.1] BUSCA COM GROUNDING');
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
            forcar_nova_busca // ← Nova flag opcional
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
        
        // VERIFICAR CACHE (se não forçar nova busca)
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
        
        // BUSCAR NOVA COTAÇÃO (cache não encontrado ou forçada nova busca)
        console.log('🔍 [BUSCA] Executando nova busca...');
        
        // ETAPA 1: Buscar com grounding (Markdown)
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
        
        // Processar metadata e resolver redirects (COM FALLBACK PARA MARKDOWN)
        const metadataProcessada = await processarGroundingMetadata(
            resultado.groundingMetadata,
            resultado.texto  // 🆕 Passar o texto Markdown para fallback
        );
        
        // Mascarar URLs no texto Markdown
        const { textoMascarado, mapaUrls } = mascararUrls(
            resultado.texto,
            metadataProcessada.links_encontrados
        );
        
        // ETAPA 2: Extrair dados estruturados (JSON)
        const dadosEstruturados = await extrairDadosEstruturados(textoMascarado, mapaUrls);
        
        // Calcular tokens totais
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
            
            // Dados estruturados extraídos
            produtos_encontrados: dadosEstruturados.produtos || [],
            total_produtos: (dadosEstruturados.produtos || []).length,
            
            // Avaliação com média ponderada e classificações
            avaliacao: dadosEstruturados.avaliacao || {
                media_ponderada: null,
                total_produtos: (dadosEstruturados.produtos || []).length,
                produtos_com_preco: 0,
                produtos_match: 0,
                produtos_similar: 0,
                preco_minimo: null,
                preco_maximo: null
            },
            
            // Links do grounding
            links_grounding: metadataProcessada.links_encontrados,
            
            // Tokens detalhados
            meta: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '5.1-Cache-Direto-URLs',
                modelo_llm: MODEL,
                queries: metadataProcessada.total_queries,
                tokens_grounding: resultado.tokens.total,
                tokens_extracao: dadosEstruturados.tokens.total,
                tokens_total: tokensTotal.total
            }
        };
        
        console.log('\n✅ [ETAPA2-V5.1] CONCLUÍDO');
        console.log('📊 Queries realizadas:', metadataProcessada.total_queries);
        console.log('📊 Links encontrados:', metadataProcessada.links_encontrados.length);
        console.log('📊 Produtos estruturados:', (dadosEstruturados.produtos || []).length);
        console.log('💰 Média ponderada:', dadosCompletos.avaliacao.media_ponderada || 'N/A');
        console.log('📊 Match:', dadosCompletos.avaliacao.produtos_match, '| Similar:', dadosCompletos.avaliacao.produtos_similar);
        console.log('📊 Tokens TOTAL:', tokensTotal.total);
        console.log('='.repeat(70) + '\n');
        
        // Incrementar contador de buscas novas
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
        console.error('❌ [ETAPA2-V5.1] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};