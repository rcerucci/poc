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
// CACHE (REDIS) - ÚNICA ADIÇÃO À VERSÃO CONGELADA
// =============================================================================

async function verificarCache(termo) {
    try {
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

// =============================================================================
// BUSCAR COM GROUNDING - CÓDIGO ORIGINAL CONGELADO
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
            contents: prompt,
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
// PROCESSAR GROUNDING METADATA - CÓDIGO ORIGINAL CONGELADO
// =============================================================================

function processarGroundingMetadata(metadata) {
    if (!metadata) {
        return {
            tem_resultados: false,
            total_chunks: 0,
            total_queries: 0
        };
    }
    
    const chunks = metadata.groundingChunks || [];
    const queries = metadata.webSearchQueries || [];
    const supports = metadata.groundingSupports || [];
    
    // Extrair links únicos dos chunks
    const links = chunks
        .filter(chunk => chunk.web)
        .map(chunk => ({
            uri: chunk.web.uri,
            title: chunk.web.title,
            domain: chunk.web.domain || extrairDominio(chunk.web.uri)
        }));
    
    // Processar supports (liga texto às fontes)
    const suportes = supports.map(support => ({
        texto: support.segment?.text || '',
        indices_chunks: support.groundingChunkIndices || [],
        confianca: support.confidenceScores || []
    }));
    
    return {
        tem_resultados: chunks.length > 0,
        total_chunks: chunks.length,
        total_queries: queries.length,
        queries_realizadas: queries,
        links_encontrados: links,
        suportes,
        search_entry_point: metadata.searchEntryPoint || null
    };
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
// ENDPOINT PRINCIPAL - VERSÃO CONGELADA + CACHE
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
    console.log('🚀 [ETAPA2-GROUNDING+CACHE] BUSCA DE PREÇOS');
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
            forcar_nova_busca // Flag para forçar nova busca
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
        
        // 🆕 VERIFICAR CACHE (se não forçar nova busca)
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
        
        // Buscar com grounding (CÓDIGO ORIGINAL CONGELADO)
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
        
        // Processar metadata do grounding (CÓDIGO ORIGINAL CONGELADO)
        const metadataProcessada = processarGroundingMetadata(resultado.groundingMetadata);
        
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
                metodo: 'Grounding with Google Search',
                queries_realizadas: metadataProcessada.queries_realizadas,
                total_queries: metadataProcessada.total_queries,
                total_links: metadataProcessada.total_chunks
            },
            
            // Resposta da LLM (TEXTO RAW - SEM EXTRAÇÃO JSON)
            resposta_llm: resultado.texto,
            
            // Links encontrados pelo grounding
            links_grounding: metadataProcessada.links_encontrados,
            
            // Suportes (conexão texto -> fontes)
            suportes: metadataProcessada.suportes,
            
            // Metadata bruta completa (para análise)
            grounding_metadata_completo: resultado.groundingMetadata,
            
            tokens: resultado.tokens,
            
            metadados: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '3.0-Grounding+Cache',
                modelo_llm: MODEL,
                metodo_busca: 'Grounding with Google Search',
                thinking_mode: 'desabilitado'
            }
        };
        
        console.log('\n✅ [ETAPA2-GROUNDING+CACHE] CONCLUÍDO');
        console.log('📊 Queries realizadas:', metadataProcessada.total_queries);
        console.log('📊 Links encontrados:', metadataProcessada.total_chunks);
        console.log('📊 Tokens:', resultado.tokens.total);
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: `${metadataProcessada.total_chunks} link(s) encontrado(s) via grounding`,
            em_cache: false,
            dados: dadosCompletos
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2-GROUNDING+CACHE] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};