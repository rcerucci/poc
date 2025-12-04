const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite';
const genAI = new GoogleGenerativeAI(API_KEY);

// Custom Search API
const CUSTOM_SEARCH_CX_ID = process.env.CUSTOM_SEARCH_CX_ID;

// --- Fatores de Depreciação ---
const FATORES_DEPRECIACAO = {
    Excelente: {
        'Computadores e Informática': 0.9,
        'Ferramentas': 0.85,
        'Instalações': 0.8,
        'Máquinas e Equipamentos': 0.85,
        'Móveis e Utensílios': 0.8,
        'Veículos': 0.85,
        'Outros': 0.75
    },
    Bom: {
        'Computadores e Informática': 0.75,
        'Ferramentas': 0.7,
        'Instalações': 0.65,
        'Máquinas e Equipamentos': 0.7,
        'Móveis e Utensílios': 0.65,
        'Veículos': 0.7,
        'Outros': 0.6
    },
    Regular: {
        'Computadores e Informática': 0.55,
        'Ferramentas': 0.5,
        'Instalações': 0.45,
        'Máquinas e Equipamentos': 0.5,
        'Móveis e Utensílios': 0.45,
        'Veículos': 0.5,
        'Outros': 0.4
    },
    Ruim: {
        'Computadores e Informática': 0.35,
        'Ferramentas': 0.3,
        'Instalações': 0.25,
        'Máquinas e Equipamentos': 0.3,
        'Móveis e Utensílios': 0.25,
        'Veículos': 0.3,
        'Outros': 0.2
    }
};

// =============================================================================
// FILTROS E DETECÇÃO
// =============================================================================

const PALAVRAS_EXCLUIR = [
    // Kits e combos
    'kit', 'combo', 'conjunto', 'pack', 'pacote',
    'par', 'pares', 'unidades', '2x', '3x', '4x', '5x',
    
    // Promoções
    'promoção', 'promocao', 'oferta', 'desconto',
    'queima', 'liquida', 'black friday', 'cyber monday',
    
    // Indicadores de preço promocional
    'de:', 'de r$', 'era:', 'era r$', 'por:', 'por r$',
    'agora:', 'agora r$', 'antes:', 'economize'
];

// Padrões que indicam página de CATEGORIA (não produto específico)
const PADROES_CATEGORIA = [
    '/s?k=',           // Busca Amazon
    '/lista',          // Listagem Mercado Livre
    '/busca',          // Busca genérica
    '/search',         // Search
    '/categoria',      // Categoria
    '/categorias',     // Categorias
    '/colecao',        // Coleção
    '/colecoes',       // Coleções
    '/produtos',       // Listagem de produtos (plural)
    '/catalogo',       // Catálogo
    '?q=',            // Query parameter
    '?search=',       // Query parameter
    '/filtro',        // Página de filtros
];

// Padrões que indicam produto ESPECÍFICO
const PADROES_PRODUTO = [
    '/p/mlb',         // Mercado Livre produto
    '/dp/',           // Amazon produto
    '-sku-',          // SKU
    '-cod-',          // Código
    '-ref-',          // Referência
    '/produto/',      // Produto específico
    '/item/',         // Item específico
];

function contemPalavrasExcluir(texto) {
    const textoLower = texto.toLowerCase();
    return PALAVRAS_EXCLUIR.some(palavra => textoLower.includes(palavra));
}

function ehPaginaCategoria(url) {
    const urlLower = url.toLowerCase();
    
    // Verificar padrões de produto ESPECÍFICO (tem prioridade)
    const ehProdutoEspecifico = PADROES_PRODUTO.some(padrao => urlLower.includes(padrao));
    if (ehProdutoEspecifico) {
        return false; // É produto específico, não é categoria
    }
    
    // Verificar padrões de categoria
    const ehCategoria = PADROES_CATEGORIA.some(padrao => urlLower.includes(padrao));
    if (ehCategoria) {
        return true; // É categoria
    }
    
    // Verificar se URL é muito curta/genérica (provável categoria)
    // Ex: site.com.br/cadeiras (apenas 1 nível após domínio)
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
        
        // Se tiver apenas 1 parte no path e não tiver números, provavelmente é categoria
        if (pathParts.length === 1 && !/\d/.test(pathParts[0])) {
            return true;
        }
    } catch (e) {
        // Erro ao parsear URL, considera suspeito
    }
    
    return false; // Não detectou como categoria
}

function extrairPrecosDoTexto(texto) {
    const padroes = [
        /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,
        /(\d{1,3}(?:\.\d{3})*,\d{2})\s*reais?/gi,
        /por\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi,
        /preço:?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi,
        /valor:?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi
    ];
    
    const precosEncontrados = new Set();
    
    padroes.forEach(padrao => {
        const matches = texto.matchAll(padrao);
        for (const match of matches) {
            const precoStr = match[1] || match[0];
            const precoLimpo = precoStr.replace(/[^\d,]/g, '');
            if (precoLimpo && precoLimpo.includes(',')) {
                precosEncontrados.add(precoLimpo);
            }
        }
    });
    
    const precos = Array.from(precosEncontrados)
        .map(p => parseFloat(p.replace(/\./g, '').replace(',', '.')))
        .filter(p => !isNaN(p) && p > 10 && p < 1000000)
        .sort((a, b) => a - b);
    
    return precos;
}

function identificarFonte(url) {
    const fontes = {
        'mercadolivre.com': 'Mercado Livre',
        'mercadolibre.com': 'Mercado Livre',
        'americanas.com': 'Americanas',
        'magazineluiza.com': 'Magazine Luiza',
        'amazon.com': 'Amazon',
        'leroymerlin.com': 'Leroy Merlin',
        'madeiramadeira.com': 'Madeira Madeira',
        'casasbahia.com': 'Casas Bahia',
        'carrefour.com': 'Carrefour',
        'shopee.com': 'Shopee',
        'aliexpress.com': 'AliExpress',
        'kabum.com': 'KaBuM',
        'ponto.com': 'Ponto',
        'fastshop.com': 'Fast Shop',
        'extra.com': 'Extra',
        'submarino.com': 'Submarino',
        'mobly.com': 'Mobly'
    };
    
    for (const [dominio, nome] of Object.entries(fontes)) {
        if (url.includes(dominio)) return nome;
    }
    
    try {
        const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
        if (match && match[1]) {
            const dominio = match[1].split('.')[0];
            return dominio.charAt(0).toUpperCase() + dominio.slice(1);
        }
    } catch (e) {
        // Ignora
    }
    
    return 'Site Desconhecido';
}

// =============================================================================
// BUSCAR E PROCESSAR
// =============================================================================

async function buscarCustomSearch(termo, numResultados = 20) {
    console.log('🔍 Termo:', termo);
    console.log('🔍 Resultados solicitados:', numResultados);
    
    if (!API_KEY || !CUSTOM_SEARCH_CX_ID) {
        throw new Error('Custom Search não configurado');
    }
    
    const resultados = [];
    const maxPorChamada = 10;
    const chamadas = Math.ceil(numResultados / maxPorChamada);
    
    try {
        for (let i = 0; i < chamadas; i++) {
            const startIndex = (i * maxPorChamada) + 1;
            
            console.log(`📡 Chamada ${i + 1}/${chamadas} - startIndex: ${startIndex}`);
            
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: API_KEY,
                    cx: CUSTOM_SEARCH_CX_ID,
                    q: termo,
                    num: maxPorChamada,
                    start: startIndex,
                    gl: 'br',
                    lr: 'lang_pt'
                },
                timeout: 15000
            });
            
            if (response.data.items && response.data.items.length > 0) {
                resultados.push(...response.data.items);
                console.log(`✅ ${response.data.items.length} resultados obtidos`);
            } else {
                console.log(`⚠️ Nenhum resultado na chamada ${i + 1}`);
                break;
            }
            
            if (i < chamadas - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        console.log(`✅ Total: ${resultados.length} resultados\n`);
        return { sucesso: true, resultados };
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        return { sucesso: false, resultados: [], erro: error.message };
    }
}

function processarResultados(resultadosBrutos) {
    console.log('🔄 Processando resultados...\n');
    
    const processados = [];
    const excluidos = [];
    
    resultadosBrutos.forEach((item, index) => {
        const link = item.link;
        const fonte = identificarFonte(link);
        const titulo = item.title;
        const snippet = item.snippet || '';
        
        // Verificar se é página de categoria
        const isPaginaCategoria = ehPaginaCategoria(link);
        
        // Verificar se contém palavras de exclusão
        const textoCompleto = `${titulo} ${snippet}`.toLowerCase();
        const temPalavrasExcluir = contemPalavrasExcluir(textoCompleto);
        
        // Extrair preços do snippet
        const precosSnippet = extrairPrecosDoTexto(snippet);
        
        let deveExcluir = false;
        let motivoExclusao = null;
        
        if (isPaginaCategoria) {
            deveExcluir = true;
            motivoExclusao = 'Página de categoria/listagem (não é produto específico)';
        } else if (temPalavrasExcluir) {
            deveExcluir = true;
            motivoExclusao = 'Contém palavras de promoção/kit';
        }
        
        const resultado = {
            posicao: index + 1,
            link,
            fonte,
            titulo,
            snippet,
            preco_no_snippet: precosSnippet.length > 0,
            precos_snippet: precosSnippet,
            excluido: deveExcluir,
            motivo_exclusao: motivoExclusao
        };
        
        if (deveExcluir) {
            console.log(`❌ [${index + 1}] EXCLUÍDO - ${fonte}`);
            console.log(`   Motivo: ${motivoExclusao}`);
            console.log(`   URL: ${link.substring(0, 70)}...`);
            excluidos.push(resultado);
        } else {
            console.log(`✅ [${index + 1}] ${fonte}${precosSnippet.length > 0 ? ' 💰 ' + precosSnippet.length + ' preço(s)' : ''}`);
            console.log(`   ${titulo.substring(0, 60)}...`);
            console.log(`   URL: ${link.substring(0, 70)}...`);
            processados.push(resultado);
        }
    });
    
    console.log(`\n📊 Processados: ${processados.length}`);
    console.log(`📊 Excluídos: ${excluidos.length}\n`);
    
    return { processados, excluidos };
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
    console.log('🚀 [ETAPA2] BUSCA DE PREÇOS');
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
            categoria_depreciacao
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
        
        const resultado = await buscarCustomSearch(termo, 20);
        
        if (!resultado.sucesso || resultado.resultados.length === 0) {
            return res.status(200).json({
                status: 'Sem Resultados',
                mensagem: 'Nenhum resultado encontrado',
                dados: {
                    produto: {
                        numero_patrimonio: numero_patrimonio || 'N/A',
                        nome_produto: nome_produto || 'N/A'
                    },
                    busca: {
                        termo_utilizado: termo,
                        total_resultados: 0,
                        erro: resultado.erro || null
                    }
                }
            });
        }
        
        // Processar resultados (filtrar promoções/kits e extrair preços)
        const { processados, excluidos } = processarResultados(resultado.resultados);
        
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
                total_brutos: resultado.resultados.length,
                total_processados: processados.length,
                total_excluidos: excluidos.length,
                com_preco_snippet: processados.filter(r => r.preco_no_snippet).length
            },
            
            resultados_validos: processados,
            
            resultados_excluidos: excluidos,
            
            metadados: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '2.2-Filtro-Categorias',
                api_busca: 'Google Custom Search API',
                filtros_aplicados: [
                    'Exclusão de páginas de categoria/listagem',
                    'Exclusão de kits/combos',
                    'Exclusão de promoções',
                    'Extração de preços do snippet'
                ]
            }
        };
        
        console.log('✅ [ETAPA2] CONCLUÍDO');
        console.log('📊 Válidos:', processados.length);
        console.log('📊 Excluídos:', excluidos.length);
        console.log('📊 Com preço no snippet:', dadosCompletos.busca.com_preco_snippet);
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: `${processados.length} resultado(s) válido(s) de ${resultado.resultados.length}`,
            dados: dadosCompletos
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};