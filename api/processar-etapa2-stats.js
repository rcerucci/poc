const { Redis } = require('@upstash/redis');

// =============================================================================
// CONFIGURAÇÃO REDIS
// =============================================================================

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// =============================================================================
// ENDPOINT: ESTATÍSTICAS DO CACHE
// =============================================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({
        status: 'Erro',
        mensagem: 'Método não permitido'
    });
    
    try {
        // Buscar todas as estatísticas
        const [
            buscasNovas,
            cotacoesAceitas,
            tokensGastos,
            tokensEconomizaveis
        ] = await Promise.all([
            redis.get('stats:buscas_novas').catch(() => 0),
            redis.get('stats:cotacoes_aceitas').catch(() => 0),
            redis.get('stats:tokens_gastos').catch(() => 0),
            redis.get('stats:tokens_economizaveis').catch(() => 0)
        ]);
        
        const stats = {
            buscas_novas: parseInt(buscasNovas) || 0,
            cotacoes_aceitas: parseInt(cotacoesAceitas) || 0,
            tokens_gastos: parseInt(tokensGastos) || 0,
            tokens_economizaveis: parseInt(tokensEconomizaveis) || 0
        };
        
        // Calcular economia potencial
        const cacheHits = stats.cotacoes_aceitas;
        const cacheMisses = stats.buscas_novas;
        const total = cacheHits + cacheMisses;
        const taxaCache = total > 0 ? ((cacheHits / total) * 100).toFixed(1) : 0;
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: {
                estatisticas: stats,
                metricas: {
                    total_requisicoes: total,
                    cache_hits: cacheHits,
                    cache_misses: cacheMisses,
                    taxa_aproveitamento_cache: `${taxaCache}%`,
                    tokens_economizados_potencial: stats.tokens_economizaveis,
                    economia_estimada_reais: (stats.tokens_economizaveis * 0.00013).toFixed(2) // R$ 0.13 por 1k tokens
                }
            }
        });
        
    } catch (error) {
        console.error('❌ [STATS] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message
        });
    }
};  