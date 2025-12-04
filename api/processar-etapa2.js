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
// BUSCAR COM GROUNDING (ETAPA 1)
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
// PROCESSAR GROUNDING METADATA
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
// EXTRAIR DADOS ESTRUTURADOS (ETAPA 2)
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

REGRAS:
- Preço: número decimal ou null se não houver
- "match" = produto exato | "similar" = marca/spec diferente  
- Média ponderada: (match*2 + similar) / (count_match*2 + count_similar)
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
        
        console.log('📊 Tokens Extração - Input:', tokensExtracao.input, '| Output:', tokensExtracao.output, '| Total:', tokensExtracao.total);
        
        const dadosFinais = JSON.parse(jsonText);
        
        // Adicionar campos vazios para link e loja (serão preenchidos depois)
        if (dadosFinais.produtos) {
            dadosFinais.produtos.forEach(p => {
                p.link = null;
                p.loja = null;
            });
        }
        
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
    console.log('🚀 [ETAPA2-V5.1-CACHE] BUSCA COM GROUNDING + EXTRAÇÃO');
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
        
        // Processar metadata
        const metadataProcessada = processarGroundingMetadata(resultado.groundingMetadata);
        
        // ETAPA 2: Extrair dados estruturados (JSON)
        const dadosEstruturados = await extrairDadosEstruturados(resultado.texto);
        
        // Mapear links aos produtos por ORDEM
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
                metodo: 'Grounding + JSON Extraction',
                queries_realizadas: metadataProcessada.queries_realizadas,
                total_queries: metadataProcessada.total_queries,
                total_links: metadataProcessada.links_encontrados.length
            },
            
            // Dados estruturados extraídos
            produtos_encontrados: dadosEstruturados.produtos || [],
            total_produtos: (dadosEstruturados.produtos || []).length,
            
            // Avaliação com média ponderada
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
            
            // Metadata de suporte (opcional)
            suportes: metadataProcessada.suportes,
            
            // Tokens detalhados
            meta: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '5.1-Cache+2Etapas',
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
        
        // Incrementar estatísticas
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