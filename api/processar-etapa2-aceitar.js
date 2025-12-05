const { Redis } = require('@upstash/redis');

// =============================================================================
// CONFIGURAÇÃO REDIS
// =============================================================================

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// =============================================================================
// NORMALIZAR TERMO (MESMA FUNÇÃO DA ETAPA 2)
// =============================================================================

function normalizarTermo(termo) {
    return termo
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]/g, '')
        .substring(0, 100);
}

// =============================================================================
// SALVAR CACHE
// =============================================================================

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
            aceito_por: operadorId || 'sistema',
            timestamp_aceite: new Date().toISOString()
        };
        
        // Salvar com TTL de 7 dias
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
            
            // Log dos dados salvos
            const dadosVerificacao = typeof verificacao === 'string' ? JSON.parse(verificacao) : verificacao;
            console.log('📊 [CACHE] Produtos salvos:', dadosVerificacao.avaliacao?.total_produtos || 0);
            console.log('💰 [CACHE] Média ponderada:', dadosVerificacao.avaliacao?.media_ponderada || 'N/A');
        } else {
            console.error('❌ [CACHE] AVISO - Dados NÃO encontrados após salvar!');
        }
        
        // Incrementar contador de cache salvos
        await redis.incr('stats:cache_salvos');
        
        // Salvar também em histórico (opcional - para auditoria)
        const historicoKey = `historico:${patrimonio}:${Date.now()}`;
        await redis.setex(
            historicoKey,
            30 * 24 * 60 * 60, // 30 dias
            JSON.stringify({
                ...dadosParaSalvar,
                tipo: 'aceite_cotacao'
            })
        );
        console.log('📝 [HISTÓRICO] Salvo:', historicoKey);
        
        return { 
            sucesso: true,
            chave: cacheKey,
            termo_normalizado: termoNormalizado,
            data_salva: dadosParaSalvar.data_cotacao
        };
        
    } catch (error) {
        console.error('❌ [CACHE] Erro ao salvar:', error.message);
        console.error('❌ [CACHE] Stack:', error.stack);
        return { 
            sucesso: false, 
            erro: error.message 
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
    console.log('✅ [ACEITAR COTAÇÃO] SALVANDO NO CACHE');
    console.log('='.repeat(70) + '\n');
    
    try {
        const {
            termo_busca_comercial,
            numero_patrimonio,
            operador_id,
            dados_cotacao
        } = req.body;
        
        // Validações
        if (!termo_busca_comercial || termo_busca_comercial.trim() === '') {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Campo "termo_busca_comercial" é obrigatório',
                dados: {}
            });
        }
        
        if (!dados_cotacao) {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Campo "dados_cotacao" é obrigatório',
                dados: {}
            });
        }
        
        const termo = termo_busca_comercial.trim();
        
        console.log('📦 Patrimônio:', numero_patrimonio);
        console.log('🔍 Termo:', termo);
        console.log('👤 Operador:', operador_id || 'não informado');
        console.log('📊 Produtos na cotação:', dados_cotacao.avaliacao?.total_produtos || 0);
        console.log('💰 Média ponderada:', dados_cotacao.avaliacao?.media_ponderada || 'N/A');
        
        // Salvar no cache
        const resultado = await salvarCache(
            termo,
            dados_cotacao,
            numero_patrimonio,
            operador_id
        );
        
        if (!resultado.sucesso) {
            throw new Error(`Falha ao salvar no cache: ${resultado.erro}`);
        }
        
        console.log('\n✅ [ACEITAR COTAÇÃO] CONCLUÍDO');
        console.log('🔑 Chave do cache:', resultado.chave);
        console.log('📅 Data da cotação:', resultado.data_salva);
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: 'Cotação aceita e salva no cache com sucesso',
            dados: {
                termo_original: termo,
                termo_normalizado: resultado.termo_normalizado,
                chave_cache: resultado.chave,
                data_cotacao: resultado.data_salva,
                patrimonio: numero_patrimonio,
                operador: operador_id || 'sistema',
                produtos_salvos: dados_cotacao.avaliacao?.total_produtos || 0,
                media_ponderada: dados_cotacao.avaliacao?.media_ponderada || null
            }
        });
        
    } catch (error) {
        console.error('❌ [ACEITAR COTAÇÃO] ERRO:', error.message);
        console.error('❌ [STACK]:', error.stack);
        
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};