const { Redis } = require('@upstash/redis');

// =============================================================================
// CONFIGURAÇÃO REDIS
// =============================================================================

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// =============================================================================
// NORMALIZAÇÃO DE TERMO
// =============================================================================

function normalizarTermo(termo) {
    return termo
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .split(/\s+/)
        .filter(p => p.length > 0)
        .sort()
        .join('_');
}

// =============================================================================
// ENDPOINT: ACEITAR COTAÇÃO E SALVAR NO CACHE
// =============================================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({
        status: 'Erro',
        mensagem: 'Método não permitido'
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('💾 [ACEITAR-COTAÇÃO] SALVAR NO CACHE');
    console.log('='.repeat(70) + '\n');
    
    try {
        const {
            termo_busca_comercial,
            numero_patrimonio,
            operador_id,
            dados_cotacao // Todos os dados da cotação (produtos, avaliacao, etc)
        } = req.body;
        
        if (!termo_busca_comercial || !dados_cotacao) {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Campos obrigatórios: termo_busca_comercial, dados_cotacao'
            });
        }
        
        const termo = termo_busca_comercial.trim();
        const termoNormalizado = normalizarTermo(termo);
        const cacheKey = `cotacao:${termoNormalizado}`;
        
        console.log('📦 Patrimônio:', numero_patrimonio);
        console.log('🔍 Termo original:', termo);
        console.log('🔑 Termo normalizado:', termoNormalizado);
        console.log('🔑 Cache key:', cacheKey);
        
        // Preparar dados para cache
        const dadosParaSalvar = {
            termo_original: termo,
            termo_normalizado: termoNormalizado,
            data_cotacao: new Date().toISOString(),
            ...dados_cotacao,
            patrimonio: numero_patrimonio || 'N/A',
            aceito_por: operador_id || 'sistema'
        };
        
        // Salvar no Redis com TTL de 7 dias
        await redis.setex(
            cacheKey,
            7 * 24 * 60 * 60, // 7 dias em segundos
            JSON.stringify(dadosParaSalvar)
        );
        
        console.log('✅ [CACHE] Cotação salva com sucesso');
        console.log('⏰ [CACHE] Expira em: 7 dias');
        
        // Incrementar estatísticas
        await redis.incr('stats:cotacoes_aceitas');
        
        const tokensEconomizados = dados_cotacao.tokens?.total || 0;
        if (tokensEconomizados > 0) {
            await redis.incrby('stats:tokens_economizaveis', tokensEconomizados);
        }
        
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: 'Cotação aceita e salva no cache por 7 dias',
            dados: {
                cache_key: termoNormalizado,
                expira_em_dias: 7,
                data_cotacao: dadosParaSalvar.data_cotacao,
                tokens_economizaveis: tokensEconomizados
            }
        });
        
    } catch (error) {
        console.error('❌ [ACEITAR-COTAÇÃO] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message
        });
    }
};