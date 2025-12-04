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
// NORMALIZAÇÃO DE TERMO (PARA CACHE)
// =============================================================================

function normalizarTermo(termo) {
    return termo
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^\w\s]/g, '') // Remove pontuação
        .trim()
        .split(/\s+/)
        .filter(p => p.length > 0)
        .sort()
        .join('_');
}

// =============================================================================
// CACHE (REDIS)
// =============================================================================

async function verificarCache(termo) {
    try {
        const termoNormalizado = normalizarTermo(termo);
        const cacheKey = `cotacao:${termoNormalizado}`;
        
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
        const termoNormalizado = normalizarTermo(termo);
        const cacheKey = `cotacao:${termoNormalizado}`;
        
        console.log('💾 [CACHE] Salvando:', cacheKey);
        
        const dadosParaSalvar = {
            termo_original: termo,
            termo_normalizado: termoNormalizado,
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
            redirect: 'follow',
            timeout: 5000 // 5 segundos de timeout
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
// EXTRAIR LINKS DO TEXTO MARKDOWN
// =============================================================================

function extrairLinksDoMarkdown(textoMarkdown) {
    const links = [];
    const urlsEncontradas = new Set();
    
    console.log('\n' + '='.repeat(50));
    console.log('🔗 [MARKDOWN] EXTRAINDO LINKS');
    console.log('='.repeat(50));
    console.log('📝 Tamanho do texto:', textoMarkdown.length, 'caracteres');
    
    // Regex para capturar links Markdown: [texto](url)
    const regexMarkdown = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let match;
    
    while ((match = regexMarkdown.exec(textoMarkdown)) !== null) {
        const titulo = match[1];
        const url = match[2];
        
        if (!urlsEncontradas.has(url)) {
            urlsEncontradas.add(url);
            console.log(`  ✅ Link ${urlsEncontradas.size}: ${titulo.substring(0, 40)}...`);
            console.log(`     URL: ${url}`);
            
            links.push({
                uri: url,
                title: titulo,
                domain: extrairDominio(url),
                origem: 'markdown'
            });
        }
    }
    
    console.log('📊 [MARKDOWN] Total de links extraídos:', links.length);
    console.log('='.repeat(50) + '\n');
    
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
            tools: [{ googleSearch: {} }]
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
// PROCESSAR GROUNDING METADATA - USANDO MARKDOWN COMO FONTE PRIMÁRIA
// =============================================================================

async function processarGroundingMetadata(metadata, textoMarkdown) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 [PROCESSAMENTO] EXTRAÇÃO DE LINKS');
    console.log('='.repeat(70));
    
    const queries = metadata?.webSearchQueries || [];
    const chunks = metadata?.groundingChunks || [];
    const supports = metadata?.groundingSupports || [];
    
    console.log('📊 Queries realizadas:', queries.length);
    console.log('📊 Grounding chunks:', chunks.length);
    console.log('📊 Grounding supports:', supports.length);
    
    // 🆕 NOVA ESTRATÉGIA: SEMPRE usar Markdown como fonte primária
    // porque a LLM gera links diretos dos produtos no texto
    console.log('\n🎯 [ESTRATÉGIA] Extraindo links do MARKDOWN (fonte primária)');
    const linksDoMarkdown = extrairLinksDoMarkdown(textoMarkdown);
    
    // Se não encontrou nenhum link no Markdown, tentar dos chunks
    let linksParaResolver = linksDoMarkdown;
    
    if (linksParaResolver.length === 0 && chunks.length > 0) {
        console.log('⚠️ [FALLBACK] Nenhum link no Markdown, tentando chunks...');
        
        linksParaResolver = chunks
            .filter(chunk => chunk.web)
            .map(chunk => ({
                uri: chunk.web.uri,
                title: chunk.web.title || 'Sem título',
                domain: chunk.web.domain || extrairDominio(chunk.web.uri),
                origem: 'grounding-chunks'
            }));
        
        console.log('📦 [CHUNKS] Links extraídos:', linksParaResolver.length);
    }
    
    if (linksParaResolver.length === 0) {
        console.warn('\n❌ [ERRO] NENHUM LINK ENCONTRADO!');
        console.warn('='.repeat(70) + '\n');
        
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
    
    console.log('\n🔄 [REDIRECT] Resolvendo', linksParaResolver.length, 'links...\n');
    
    // Resolver redirects apenas dos links que precisam
    const linksResolvidos = await Promise.all(
        linksParaResolver.map(async (link, idx) => {
            console.log(`  🔄 [${idx + 1}/${linksParaResolver.length}]`, link.uri.substring(0, 60) + '...');
            const uriResolvida = await resolverRedirect(link.uri);
            
            return {
                ...link,
                uri_original: link.uri,
                uri: uriResolvida
            };
        })
    );
    
    // Processar supports (liga texto às fontes)
    const suportes = supports.map(support => ({
        texto: support.segment?.text || '',
        indices_chunks: support.groundingChunkIndices || [],
        confianca: support.confidenceScores || []
    }));
    
    console.log('\n✅ [PROCESSAMENTO] Concluído');
    console.log('📊 Links finais:', linksResolvidos.length);
    console.log('📊 Suportes:', suportes.length);
    console.log('='.repeat(70) + '\n');
    
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
      "preco_a_vista": 999.99,
      "preco_parcelado": 1099.99,
      "link": "<<URL_N>>",
      "loja": "nome da loja"
    }
  ]
}

REGRAS IMPORTANTES:
- Extraia TODOS os produtos mencionados
- Se não houver preço à vista, use null
- Se não houver preço parcelado, use null
- PRESERVE os placeholders <<URL_N>> EXATAMENTE como estão no texto
- Converta valores como "R$ 866,98" para 866.98 (número)
- Se a loja não for mencionada, use null
- Retorne apenas o JSON, sem texto adicional`;
        
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
        
        // Desmascarar URLs no JSON
        const jsonComUrls = desmascararUrls(JSON.stringify(dados), mapaUrls);
        const dadosFinais = JSON.parse(jsonComUrls);
        
        console.log('✅ [EXTRAÇÃO] Encontrados:', dadosFinais.produtos?.length || 0, 'produtos');
        
        return {
            sucesso: true,
            produtos: dadosFinais.produtos || [],
            tokens: tokensExtracao
        };
        
    } catch (error) {
        console.error('❌ [EXTRAÇÃO] Erro:', error.message);
        return {
            sucesso: false,
            erro: error.message,
            produtos: [],
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
    console.log('🚀 [ETAPA2-V5.2] BUSCA COM GROUNDING (MARKDOWN PRIORITY)');
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
        
        // BUSCAR NOVA COTAÇÃO
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
        
        // Processar metadata (MARKDOWN PRIORITY)
        const metadataProcessada = await processarGroundingMetadata(
            resultado.groundingMetadata,
            resultado.texto
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
                metodo: 'Grounding + Markdown Link Extraction + JSON',
                queries_realizadas: metadataProcessada.queries_realizadas,
                total_queries: metadataProcessada.total_queries,
                total_links: metadataProcessada.links_encontrados.length
            },
            
            produtos_encontrados: dadosEstruturados.produtos,
            total_produtos: dadosEstruturados.produtos.length,
            
            resposta_llm_original: resultado.texto,
            links_grounding: metadataProcessada.links_encontrados,
            suportes: metadataProcessada.suportes,
            tokens: tokensTotal,
            
            metadados: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '5.2-Markdown-Priority',
                modelo_llm: MODEL,
                metodo_busca: 'Grounding + Markdown Priority + Redirect Resolution',
                thinking_mode: 'desabilitado',
                extracao_json: dadosEstruturados.sucesso ? 'sucesso' : 'falha',
                redirects_resolvidos: metadataProcessada.links_encontrados.length
            }
        };
        
        console.log('\n✅ [ETAPA2-V5.2] CONCLUÍDO');
        console.log('📊 Queries realizadas:', metadataProcessada.total_queries);
        console.log('📊 Links encontrados:', metadataProcessada.links_encontrados.length);
        console.log('📊 Produtos estruturados:', dadosEstruturados.produtos.length);
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
            mensagem: `${dadosEstruturados.produtos.length} produto(s) encontrado(s) de ${metadataProcessada.links_encontrados.length} fonte(s)`,
            em_cache: false,
            dados: dadosCompletos
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2-V5.2] ERRO:', error.message);
        console.error('Stack:', error.stack);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};