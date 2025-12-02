const axios = require('axios');

/**
 * ENDPOINT DE TESTE V2: /api/buscar-mercadolivre
 * Com logging detalhado para debug no Vercel
 */

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const logs = []; // Coletar todos os logs
    const log = (msg) => {
        console.log(msg);
        logs.push(msg);
    };
    
    log('🔍 [ML-TEST] Início da requisição');
    log(`🔍 [ML-TEST] Método: ${req.method}`);
    
    try {
        // Aceitar GET ou POST
        let termo, limite;
        
        if (req.method === 'GET') {
            termo = req.query.termo || 'notebook';
            limite = parseInt(req.query.limite) || 5;
        } else {
            termo = req.body?.termo || 'notebook';
            limite = req.body?.limite || 5;
        }
        
        log(`📝 Termo: ${termo}`);
        log(`🔢 Limite: ${limite}`);
        
        const resultados = {
            termo_buscado: termo,
            tentativas: [],
            logs: logs
        };
        
        // ===== ESTRATÉGIA 1: Básica =====
        log('\n🔄 [ESTRATÉGIA 1] Iniciando...');
        
        const url1 = 'https://api.mercadolibre.com/sites/MLB/search';
        const params1 = { q: termo, limit: limite };
        
        try {
            log(`🌐 URL: ${url1}`);
            log(`📋 Params: ${JSON.stringify(params1)}`);
            
            const response1 = await axios.get(url1, {
                params: params1,
                timeout: 10000,
                validateStatus: () => true // Aceitar qualquer status
            });
            
            log(`📊 Status HTTP: ${response1.status}`);
            log(`📦 Headers resposta: ${JSON.stringify(response1.headers)}`);
            log(`📦 Data keys: ${Object.keys(response1.data || {}).join(', ')}`);
            
            resultados.tentativas.push({
                estrategia: 'basica',
                status: response1.status,
                headers: response1.headers,
                data_keys: Object.keys(response1.data || {}),
                sucesso: response1.status === 200 && response1.data?.results
            });
            
            if (response1.status === 200 && response1.data?.results) {
                log(`✅ SUCESSO! ${response1.data.results.length} resultados`);
                
                const produtos = response1.data.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .slice(0, limite)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        estoque: item.available_quantity,
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
                    logs: logs
                });
            } else {
                log(`⚠️  Status ${response1.status} ou sem results`);
                if (response1.data?.message) {
                    log(`💬 Mensagem API: ${response1.data.message}`);
                }
                if (response1.data?.error) {
                    log(`❌ Erro API: ${response1.data.error}`);
                }
            }
            
        } catch (error1) {
            log(`❌ [ESTRATÉGIA 1] Exception: ${error1.message}`);
            
            if (error1.response) {
                log(`📊 Error Status: ${error1.response.status}`);
                log(`📋 Error Data: ${JSON.stringify(error1.response.data)}`);
            } else if (error1.request) {
                log(`⚠️  Sem resposta do servidor`);
                log(`🔧 Request enviado: ${error1.request._header ? 'sim' : 'não'}`);
            } else {
                log(`⚠️  Erro de configuração: ${error1.message}`);
            }
            
            resultados.tentativas.push({
                estrategia: 'basica',
                erro: error1.message,
                tipo_erro: error1.response ? 'response' : error1.request ? 'request' : 'config'
            });
        }
        
        // ===== ESTRATÉGIA 2: Com Headers Completos =====
        log('\n🔄 [ESTRATÉGIA 2] Com headers...');
        
        try {
            const response2 = await axios.get(url1, {
                params: params1,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'pt-BR,pt;q=0.9'
                },
                validateStatus: () => true
            });
            
            log(`📊 Status HTTP: ${response2.status}`);
            
            resultados.tentativas.push({
                estrategia: 'com_headers',
                status: response2.status,
                sucesso: response2.status === 200 && response2.data?.results
            });
            
            if (response2.status === 200 && response2.data?.results) {
                log(`✅ SUCESSO! ${response2.data.results.length} resultados`);
                
                const produtos = response2.data.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .slice(0, limite)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        estoque: item.available_quantity,
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
                    logs: logs
                });
            }
            
        } catch (error2) {
            log(`❌ [ESTRATÉGIA 2] Exception: ${error2.message}`);
            resultados.tentativas.push({
                estrategia: 'com_headers',
                erro: error2.message
            });
        }
        
        // ===== ESTRATÉGIA 3: Fetch Nativo =====
        log('\n🔄 [ESTRATÉGIA 3] Usando fetch nativo...');
        
        try {
            const url3 = `${url1}?q=${encodeURIComponent(termo)}&limit=${limite}`;
            log(`🌐 URL completa: ${url3}`);
            
            const response3 = await fetch(url3, {
                method: 'GET',
                headers: {
                    'User-Agent': 'PatriGestor/1.0',
                    'Accept': 'application/json'
                }
            });
            
            log(`📊 Status HTTP: ${response3.status}`);
            log(`📦 Headers: ${JSON.stringify([...response3.headers])}`);
            
            const data3 = await response3.json();
            log(`📦 Data keys: ${Object.keys(data3).join(', ')}`);
            
            resultados.tentativas.push({
                estrategia: 'fetch_nativo',
                status: response3.status,
                sucesso: response3.status === 200 && data3?.results
            });
            
            if (response3.status === 200 && data3?.results) {
                log(`✅ SUCESSO! ${data3.results.length} resultados`);
                
                const produtos = data3.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .slice(0, limite)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        estoque: item.available_quantity,
                        url: item.permalink,
                        thumbnail: item.thumbnail
                    }));
                
                return res.status(200).json({
                    sucesso: true,
                    estrategia: 'fetch_nativo',
                    termo_buscado: termo,
                    total_encontrado: data3.paging?.total || 0,
                    total_retornado: produtos.length,
                    produtos: produtos,
                    logs: logs
                });
            } else {
                log(`⚠️  Status ${response3.status} ou sem results`);
                if (data3?.message) log(`💬 Mensagem: ${data3.message}`);
                if (data3?.error) log(`❌ Erro: ${data3.error}`);
            }
            
        } catch (error3) {
            log(`❌ [ESTRATÉGIA 3] Exception: ${error3.message}`);
            resultados.tentativas.push({
                estrategia: 'fetch_nativo',
                erro: error3.message
            });
        }
        
        // ===== ESTRATÉGIA 4: HTTPS Direto =====
        log('\n🔄 [ESTRATÉGIA 4] HTTPS módulo nativo...');
        
        try {
            const https = require('https');
            const urlParsed = new URL(`${url1}?q=${encodeURIComponent(termo)}&limit=${limite}`);
            
            const data4 = await new Promise((resolve, reject) => {
                const options = {
                    hostname: urlParsed.hostname,
                    path: urlParsed.pathname + urlParsed.search,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Node.js'
                    }
                };
                
                log(`🌐 Hostname: ${options.hostname}`);
                log(`🌐 Path: ${options.path}`);
                
                const req = https.request(options, (res) => {
                    log(`📊 Status: ${res.statusCode}`);
                    
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            resolve({
                                status: res.statusCode,
                                data: JSON.parse(body)
                            });
                        } catch (e) {
                            reject(new Error(`Parse error: ${e.message}`));
                        }
                    });
                });
                
                req.on('error', reject);
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
                req.end();
            });
            
            log(`📦 Data keys: ${Object.keys(data4.data).join(', ')}`);
            
            resultados.tentativas.push({
                estrategia: 'https_nativo',
                status: data4.status,
                sucesso: data4.status === 200 && data4.data?.results
            });
            
            if (data4.status === 200 && data4.data?.results) {
                log(`✅ SUCESSO! ${data4.data.results.length} resultados`);
                
                const produtos = data4.data.results
                    .filter(item => item.price > 0 && item.available_quantity > 0)
                    .slice(0, limite)
                    .map(item => ({
                        titulo: item.title,
                        preco: item.price,
                        estoque: item.available_quantity,
                        url: item.permalink,
                        thumbnail: item.thumbnail
                    }));
                
                return res.status(200).json({
                    sucesso: true,
                    estrategia: 'https_nativo',
                    termo_buscado: termo,
                    total_encontrado: data4.data.paging?.total || 0,
                    total_retornado: produtos.length,
                    produtos: produtos,
                    logs: logs
                });
            }
            
        } catch (error4) {
            log(`❌ [ESTRATÉGIA 4] Exception: ${error4.message}`);
            resultados.tentativas.push({
                estrategia: 'https_nativo',
                erro: error4.message
            });
        }
        
        // Todas falharam
        log('\n❌ Todas as estratégias falharam');
        
        return res.status(500).json({
            sucesso: false,
            mensagem: 'Todas as 4 estratégias falharam',
            termo_buscado: termo,
            resultados: resultados,
            logs: logs
        });
        
    } catch (error) {
        log(`❌ [ML-TEST] Erro fatal: ${error.message}`);
        log(`Stack: ${error.stack}`);
        
        return res.status(500).json({
            sucesso: false,
            mensagem: 'Erro fatal',
            erro: error.message,
            stack: error.stack,
            logs: logs
        });
    }
};