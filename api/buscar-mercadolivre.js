const axios = require('axios');

/**
 * ENDPOINT DE TESTE: /api/buscar-mercadolivre
 * 
 * TESTE NO VERCEL:
 * POST https://seu-projeto.vercel.app/api/buscar-mercadolivre
 * Body: { "termo": "notebook dell", "limite": 5 }
 */

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    console.log('🔍 [ML-TEST] Método:', req.method);
    console.log('🔍 [ML-TEST] Body:', JSON.stringify(req.body));
    
    try {
        // Aceitar GET ou POST
        let termo, limite, filtros;
        
        if (req.method === 'GET') {
            termo = req.query.termo || 'notebook';
            limite = parseInt(req.query.limite) || 5;
            filtros = req.query.filtros || 'basico';
        } else {
            termo = req.body.termo || 'notebook';
            limite = req.body.limite || 5;
            filtros = req.body.filtros || 'basico';
        }
        
        console.log('📝 Termo:', termo);
        console.log('🔢 Limite:', limite);
        console.log('⚙️  Filtros:', filtros);
        
        // ===== ESTRATÉGIA 1: Tentativa básica =====
        console.log('\n🔄 [ESTRATÉGIA 1] Tentativa básica...');
        
        const url1 = 'https://api.mercadolibre.com/sites/MLB/search';
        const params1 = {
            q: termo,
            limit: limite
        };
        
        console.log('🌐 URL:', url1);
        console.log('📋 Params:', JSON.stringify(params1));
        
        try {
            const response1 = await axios.get(url1, {
                params: params1,
                timeout: 8000,
                validateStatus: function (status) {
                    return status < 500; // Aceitar qualquer status < 500
                }
            });
            
            console.log('📊 Status:', response1.status);
            console.log('📦 Resultados:', response1.data.results?.length || 0);
            
            if (response1.status === 200 && response1.data.results) {
                const produtos = response1.data.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        moeda: item.currency_id,
                        estoque: item.available_quantity,
                        condicao: item.condition,
                        vendedor: item.seller?.nickname || 'N/A',
                        loja_oficial: item.official_store_id ? true : false,
                        url: item.permalink,
                        thumbnail: item.thumbnail
                    }));
                
                return res.status(200).json({
                    sucesso: true,
                    estrategia: 'basica',
                    termo_buscado: termo,
                    total_encontrado: response1.data.paging?.total || 0,
                    total_retornado: produtos.length,
                    produtos: produtos,
                    debug: {
                        url: url1,
                        params: params1,
                        status: response1.status,
                        headers_resposta: response1.headers
                    }
                });
            }
            
            // Se chegou aqui, status não foi 200 ou sem resultados
            console.log('⚠️  Status não-200 ou sem resultados');
            console.log('📋 Data:', JSON.stringify(response1.data));
            
        } catch (error1) {
            console.error('❌ [ESTRATÉGIA 1] Erro:', error1.message);
            
            if (error1.response) {
                console.error('📊 Status:', error1.response.status);
                console.error('📋 Data:', JSON.stringify(error1.response.data));
                console.error('🔧 Headers:', JSON.stringify(error1.response.headers));
            }
        }
        
        // ===== ESTRATÉGIA 2: Com User-Agent e headers =====
        console.log('\n🔄 [ESTRATÉGIA 2] Tentativa com headers...');
        
        try {
            const response2 = await axios.get(url1, {
                params: params1,
                timeout: 8000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': 'https://www.mercadolivre.com.br/'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            console.log('📊 Status:', response2.status);
            console.log('📦 Resultados:', response2.data.results?.length || 0);
            
            if (response2.status === 200 && response2.data.results) {
                const produtos = response2.data.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        moeda: item.currency_id,
                        estoque: item.available_quantity,
                        condicao: item.condition,
                        vendedor: item.seller?.nickname || 'N/A',
                        loja_oficial: item.official_store_id ? true : false,
                        url: item.permalink,
                        thumbnail: item.thumbnail
                    }));
                
                return res.status(200).json({
                    sucesso: true,
                    estrategia: 'com_headers',
                    termo_buscado: termo,
                    total_encontrado: response2.data.paging?.total || 0,
                    total_retornado: produtos.length,
                    produtos: produtos,
                    debug: {
                        url: url1,
                        params: params1,
                        status: response2.status
                    }
                });
            }
            
        } catch (error2) {
            console.error('❌ [ESTRATÉGIA 2] Erro:', error2.message);
        }
        
        // ===== ESTRATÉGIA 3: URL alternativa =====
        console.log('\n🔄 [ESTRATÉGIA 3] Tentativa com URL alternativa...');
        
        const url3 = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&limit=${limite}`;
        
        console.log('🌐 URL completa:', url3);
        
        try {
            const response3 = await axios.get(url3, {
                timeout: 8000,
                headers: {
                    'User-Agent': 'PatriGestor/1.0',
                    'Accept': 'application/json'
                },
                validateStatus: function (status) {
                    return status < 500;
                }
            });
            
            console.log('📊 Status:', response3.status);
            console.log('📦 Resultados:', response3.data.results?.length || 0);
            
            if (response3.status === 200 && response3.data.results) {
                const produtos = response3.data.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        moeda: item.currency_id,
                        estoque: item.available_quantity,
                        condicao: item.condition,
                        vendedor: item.seller?.nickname || 'N/A',
                        loja_oficial: item.official_store_id ? true : false,
                        url: item.permalink,
                        thumbnail: item.thumbnail
                    }));
                
                return res.status(200).json({
                    sucesso: true,
                    estrategia: 'url_alternativa',
                    termo_buscado: termo,
                    total_encontrado: response3.data.paging?.total || 0,
                    total_retornado: produtos.length,
                    produtos: produtos,
                    debug: {
                        url: url3,
                        status: response3.status
                    }
                });
            }
            
        } catch (error3) {
            console.error('❌ [ESTRATÉGIA 3] Erro:', error3.message);
        }
        
        // Se chegou aqui, todas as estratégias falharam
        return res.status(500).json({
            sucesso: false,
            mensagem: 'Todas as estratégias de busca falharam',
            termo_buscado: termo,
            tentativas: 3
        });
        
    } catch (error) {
        console.error('❌ [ML-TEST] Erro geral:', error.message);
        console.error('Stack:', error.stack);
        
        return res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao buscar no Mercado Livre',
            erro: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};