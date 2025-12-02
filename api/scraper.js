const axios = require('axios');
const cheerio = require('cheerio');

// =============================================================================
// SCRAPER - EXTRAI PREÇOS DE PÁGINAS HTML
// =============================================================================

/**
 * Extrai preços de uma página HTML usando cheerio e regex
 */
function extrairPrecoDaPagina(html, url) {
    console.log('🔍 [SCRAPER] Analisando:', url.substring(0, 50) + '...');
    
    try {
        const $ = cheerio.load(html);
        
        // Remover scripts e styles para limpar o HTML
        $('script, style, noscript').remove();
        
        // Pegar texto visível da página
        const textoCompleto = $('body').text();
        
        // Padrões de preço em BRL
        const padroes = [
            /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,
            /(\d{1,3}(?:\.\d{3})*,\d{2})\s*reais?/gi,
            /por\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi,
            /preço:?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi
        ];
        
        const precosEncontrados = new Set();
        
        // Buscar com todos os padrões
        padroes.forEach(padrao => {
            const matches = textoCompleto.matchAll(padrao);
            for (const match of matches) {
                const precoStr = match[1] || match[0];
                // Limpar e normalizar
                const precoLimpo = precoStr.replace(/[^\d,]/g, '');
                if (precoLimpo) {
                    precosEncontrados.add(precoLimpo);
                }
            }
        });
        
        // Converter para números
        const precos = Array.from(precosEncontrados)
            .map(p => parseFloat(p.replace(',', '.')))
            .filter(p => !isNaN(p) && p > 10 && p < 1000000) // Filtrar valores válidos
            .sort((a, b) => a - b);
        
        if (precos.length === 0) {
            console.log('⚠️ [SCRAPER] Nenhum preço encontrado');
            return null;
        }
        
        // Pegar título da página
        const titulo = $('title').text().trim().substring(0, 100) || 
                      $('h1').first().text().trim().substring(0, 100) ||
                      'Produto';
        
        // Detectar fonte (site)
        let fonte = 'Site';
        if (url.includes('mercadolivre.com') || url.includes('mercadolibre.com')) {
            fonte = 'Mercado Livre';
        } else if (url.includes('americanas.com')) {
            fonte = 'Americanas';
        } else if (url.includes('magazineluiza.com')) {
            fonte = 'Magazine Luiza';
        } else if (url.includes('amazon.com')) {
            fonte = 'Amazon';
        } else if (url.includes('leroymerlin.com')) {
            fonte = 'Leroy Merlin';
        } else if (url.includes('madeiramadeira.com')) {
            fonte = 'MadeiraMadeira';
        }
        
        // Usar preço mais frequente ou mediana
        const precoFinal = precos.length === 1 ? precos[0] : 
                          precos[Math.floor(precos.length / 2)]; // Mediana
        
        console.log('✅ [SCRAPER] Preço encontrado: R$', precoFinal);
        
        return {
            valor: precoFinal,
            fonte: fonte,
            produto: titulo,
            link: url,
            precos_encontrados: precos.length
        };
        
    } catch (error) {
        console.error('❌ [SCRAPER] Erro ao processar HTML:', error.message);
        return null;
    }
}

/**
 * Faz scraping de múltiplas URLs
 */
async function scrapearLinks(links, limite = 5) {
    console.log('🕷️ [SCRAPER] Iniciando scraping de', links.length, 'links...');
    
    const precos = [];
    const linksProcessar = links.slice(0, limite);
    
    // Processar em paralelo (máximo 3 simultâneos para não sobrecarregar)
    const BATCH_SIZE = 3;
    
    for (let i = 0; i < linksProcessar.length; i += BATCH_SIZE) {
        const batch = linksProcessar.slice(i, i + BATCH_SIZE);
        
        const resultados = await Promise.allSettled(
            batch.map(async (link) => {
                try {
                    console.log('📡 [SCRAPER] Fetching:', link.substring(0, 60) + '...');
                    
                    const response = await axios.get(link, {
                        timeout: 8000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'text/html,application/xhtml+xml',
                            'Accept-Language': 'pt-BR,pt;q=0.9',
                        },
                        maxRedirects: 5
                    });
                    
                    return extrairPrecoDaPagina(response.data, link);
                    
                } catch (error) {
                    console.error('❌ [SCRAPER] Erro ao buscar', link.substring(0, 40), ':', error.message);
                    return null;
                }
            })
        );
        
        // Coletar resultados bem-sucedidos
        resultados.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                precos.push(result.value);
            }
        });
        
        // Delay entre batches para não sobrecarregar
        if (i + BATCH_SIZE < linksProcessar.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log('✅ [SCRAPER] Concluído:', precos.length, 'preços extraídos');
    
    return precos;
}

// =============================================================================
// ENDPOINT
// =============================================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('🕷️ [SCRAPER-API] Iniciando...');

    try {
        const { links, limite } = req.body;

        if (!links || !Array.isArray(links) || links.length === 0) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Array de links é obrigatório',
                precos: []
            });
        }

        console.log('📥 [SCRAPER-API] Recebido:', links.length, 'links');

        const precos = await scrapearLinks(links, limite || 5);

        if (precos.length === 0) {
            return res.status(200).json({
                sucesso: false,
                mensagem: 'Nenhum preço extraído das páginas',
                precos: []
            });
        }

        return res.status(200).json({
            sucesso: true,
            mensagem: precos.length + ' preço(s) extraído(s)',
            precos: precos
        });

    } catch (error) {
        console.error('❌ [SCRAPER-API] ERRO:', error.message);
        return res.status(500).json({
            sucesso: false,
            mensagem: error.message,
            precos: []
        });
    }
};