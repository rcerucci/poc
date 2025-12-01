const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// --- Configuração ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
const genAI = new GoogleGenerativeAI(API_KEY);

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
// MÓDULO 1: CLASSIFICAÇÃO COM GEMINI (SEM GROUNDING)
// =============================================================================

const PROMPT_CLASSIFICAR = (dados) => {
    return `Classifique este produto e crie termos de busca otimizados.

PRODUTO:
Nome: ${dados.nome_produto}
Marca: ${dados.marca || 'N/A'}
Modelo: ${dados.modelo || 'N/A'}
Specs: ${dados.especificacoes || 'N/A'}

REGRAS PARA TERMO DE BUSCA:
- Se tem marca+modelo: use "Marca Modelo"
- Se só tem nome genérico: adicione característica chave das specs
- Remova palavras como "N/A", "não informado"
- Máximo 5-6 palavras

EXEMPLOS:
- Cadeira, N/A, N/A, "Giratória rodas" → termo: "Cadeira Escritório Giratória"
- Notebook, Dell, Inspiron 15, "i5 8GB" → termo: "Dell Inspiron 15"
- Gerador, Honda, N/A, "5500W gasolina" → termo: "Gerador Honda 5500W"

RESPONDA APENAS ESTE JSON (sem texto adicional):
{
  "categoria": "moveis",
  "termo_busca": "Cadeira Escritório Giratória",
  "termo_alternativo": "Cadeira Escritório",
  "api_sugerida": "mercadolivre",
  "confianca": 85,
  "justificativa": "breve"
}

CATEGORIAS: equipamento_industrial | informatica | moveis | veiculo | ferramenta | eletrodomestico | outro
API: mercadolivre_b2b | mercadolivre | fipe | nenhuma`;
};

async function classificarProduto(dados) {
    console.log('🤖 [CLASSIFICAR] Analisando produto...');
    
    let text = ''; // Declarar aqui para estar acessível no catch
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: { 
                temperature: 0.1,
                maxOutputTokens: 300 // LIMITAR tokens
            }
        });

        const result = await model.generateContent(PROMPT_CLASSIFICAR(dados));
        text = result.response.text();
        
        const usage = result.response.usageMetadata;
        const tokIn = usage?.promptTokenCount || 0;
        const tokOut = usage?.candidatesTokenCount || 0;
        const custoIn = tokIn * 0.0000016;
        const custoOut = tokOut * 0.0000133;
        const custoTot = custoIn + custoOut;
        
        console.log('📊 Classificação - Tokens:', tokIn, '/', tokOut, '| R$', custoTot.toFixed(6));
        console.log('📄 Resposta Gemini:', text.substring(0, 200));

        let jsonText = text.trim()
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Nenhum JSON encontrado na resposta: ' + text.substring(0, 100));
        }
        jsonText = jsonMatch[0];
        
        const classificacao = JSON.parse(jsonText);
        
        return {
            sucesso: true,
            dados: classificacao,
            meta: { tokens: { in: tokIn, out: tokOut }, custo: custoTot }
        };

    } catch (error) {
        console.error('❌ Erro na classificação:', error.message);
        if (text) {
            console.error('📄 Resposta completa:', text);
        }
        
        // Fallback: usar classificação padrão baseada no nome
        const nomeLower = dados.nome_produto.toLowerCase();
        let categoriaFallback = 'outro';
        let apiFallback = 'mercadolivre';
        
        if (nomeLower.includes('cadeira') || nomeLower.includes('mesa') || nomeLower.includes('armario') || nomeLower.includes('estante')) {
            categoriaFallback = 'moveis';
        } else if (nomeLower.includes('computador') || nomeLower.includes('notebook') || nomeLower.includes('monitor') || nomeLower.includes('impressora')) {
            categoriaFallback = 'informatica';
        } else if (nomeLower.includes('carro') || nomeLower.includes('caminhao') || nomeLower.includes('veiculo') || nomeLower.includes('moto')) {
            categoriaFallback = 'veiculo';
            apiFallback = 'fipe';
        } else if (nomeLower.includes('maquina') || nomeLower.includes('gerador') || nomeLower.includes('equipamento') || nomeLower.includes('compressor')) {
            categoriaFallback = 'equipamento_industrial';
            apiFallback = 'mercadolivre_b2b';
        } else if (nomeLower.includes('furadeira') || nomeLower.includes('serra') || nomeLower.includes('chave') || nomeLower.includes('martelo')) {
            categoriaFallback = 'ferramenta';
            apiFallback = 'mercadolivre_b2b';
        }
        
        console.log('⚠️ Usando fallback:', categoriaFallback, '/', apiFallback);
        
        // Construir termo de busca inteligente
        let termoBusca = [];
        
        // Adicionar marca e modelo se não forem N/A
        if (dados.marca && dados.marca !== 'N/A' && dados.marca.toLowerCase() !== 'não informado') {
            termoBusca.push(dados.marca);
        }
        if (dados.modelo && dados.modelo !== 'N/A' && dados.modelo.toLowerCase() !== 'não informado') {
            termoBusca.push(dados.modelo);
        }
        
        // Adicionar nome do produto
        termoBusca.push(dados.nome_produto);
        
        // Extrair palavras-chave das especificações
        if (dados.especificacoes && dados.especificacoes !== 'N/A') {
            const specs = dados.especificacoes.toLowerCase();
            const palavrasChave = [];
            
            // Padrões importantes: potência, tamanho, capacidade
            const padroes = [
                /(\d+\.?\d*)\s*(kva|kw|hp|w|gb|tb|litros?|pol|polegadas?|m[²³]?|v|a|btu)/gi,
                /\b(giratória?|elétrica?|manual|automática?|portátil|fixo|móvel)\b/gi
            ];
            
            padroes.forEach(padrao => {
                const matches = specs.match(padrao);
                if (matches) {
                    palavrasChave.push(...matches.slice(0, 2)); // Max 2 por padrão
                }
            });
            
            if (palavrasChave.length > 0) {
                termoBusca.push(...palavrasChave.slice(0, 2)); // Max 2 palavras-chave
            }
        }
        
        const termoFinal = termoBusca.join(' ').trim();
        console.log('🔎 Termo construído:', termoFinal);
        
        return {
            sucesso: true,
            dados: {
                categoria: categoriaFallback,
                termo_busca: termoFinal,
                termo_alternativo: dados.nome_produto,
                api_sugerida: apiFallback,
                confianca: 50,
                justificativa: 'Classificação automática (fallback)'
            },
            meta: { tokens: { in: 0, out: 0 }, custo: 0 }
        };
    }
}

// =============================================================================
// MÓDULO 2: APIS DE BUSCA
// =============================================================================

// --- API Mercado Livre ---
async function buscarMercadoLivre(termo, limite = 10, b2b = false) {
    console.log('🛒 [ML] Buscando:', termo, b2b ? '(B2B)' : '');
    
    try {
        const params = {
            q: termo,
            limit: limite,
            condition: 'new',
            sort: 'price_asc'
        };
        
        // Filtros B2B
        if (b2b) {
            params.shipping = 'fulfillment';
            params.official_store = 'all';
        }
        
        console.log('📡 [ML] URL:', 'https://api.mercadolibre.com/sites/MLB/search');
        console.log('📡 [ML] Params:', JSON.stringify(params));
        
        const response = await axios.get(
            'https://api.mercadolibre.com/sites/MLB/search',
            { params, timeout: 8000 }
        );
        
        console.log('📥 [ML] Status:', response.status);
        console.log('📥 [ML] Total encontrado:', response.data.results?.length || 0);
        
        if (!response.data.results || response.data.results.length === 0) {
            console.log('⚠️ [ML] Nenhum resultado retornado pela API');
            return { sucesso: false, precos: [], total: 0 };
        }
        
        const produtos = response.data.results
            .filter(item => {
                const temEstoque = item.available_quantity > 0;
                const temPreco = item.price > 0;
                console.log('🔍 [ML]', item.title.substring(0, 50), '| Estoque:', item.available_quantity, '| Preço:', item.price);
                return temEstoque && temPreco;
            })
            .slice(0, limite)
            .map(item => ({
                valor: item.price,
                fonte: item.official_store_id ? 'ML Loja Oficial' : 'Mercado Livre',
                match: calcularMatch(termo, item.title),
                produto: item.title.substring(0, 60),
                url: item.permalink,
                estoque: item.available_quantity,
                vendedor: item.seller.nickname
            }));
        
        console.log('✅ [ML] ' + produtos.length + ' produtos filtrados');
        
        return {
            sucesso: produtos.length > 0,
            precos: produtos,
            total: produtos.length
        };
        
    } catch (error) {
        console.error('❌ [ML] Erro:', error.message);
        if (error.response) {
            console.error('❌ [ML] Status:', error.response.status);
            console.error('❌ [ML] Data:', error.response.data);
        }
        return { sucesso: false, precos: [], total: 0 };
    }
}

// --- API FIPE (Veículos) ---
async function buscarFIPE(marca, modelo, ano = new Date().getFullYear()) {
    console.log('🚗 [FIPE] Buscando:', marca, modelo, ano);
    
    try {
        // Simplificado - na prática precisa de vários endpoints
        const baseURL = 'https://parallelum.com.br/fipe/api/v1/carros';
        
        // 1. Buscar marca
        const marcasResp = await axios.get(`${baseURL}/marcas`);
        const marcaObj = marcasResp.data.find(m => 
            m.nome.toLowerCase().includes(marca.toLowerCase())
        );
        
        if (!marcaObj) {
            console.log('⚠️ [FIPE] Marca não encontrada');
            return { sucesso: false, precos: [], total: 0 };
        }
        
        // 2. Buscar modelo
        const modelosResp = await axios.get(`${baseURL}/marcas/${marcaObj.codigo}/modelos`);
        const modeloObj = modelosResp.data.modelos.find(m => 
            m.nome.toLowerCase().includes(modelo.toLowerCase())
        );
        
        if (!modeloObj) {
            console.log('⚠️ [FIPE] Modelo não encontrado');
            return { sucesso: false, precos: [], total: 0 };
        }
        
        // 3. Buscar ano
        const anosResp = await axios.get(
            `${baseURL}/marcas/${marcaObj.codigo}/modelos/${modeloObj.codigo}/anos`
        );
        const anoObj = anosResp.data.find(a => a.nome.includes(String(ano)));
        
        if (!anoObj) {
            console.log('⚠️ [FIPE] Ano não encontrado');
            return { sucesso: false, precos: [], total: 0 };
        }
        
        // 4. Buscar preço
        const precoResp = await axios.get(
            `${baseURL}/marcas/${marcaObj.codigo}/modelos/${modeloObj.codigo}/anos/${anoObj.codigo}`
        );
        
        const valor = parseFloat(
            precoResp.data.Valor.replace(/[^\d,]/g, '').replace(',', '.')
        );
        
        console.log('✅ [FIPE] Valor encontrado: R$', valor);
        
        return {
            sucesso: true,
            precos: [{
                valor: valor,
                fonte: 'Tabela FIPE',
                match: 'Exato',
                produto: `${precoResp.data.Marca} ${precoResp.data.Modelo} ${precoResp.data.AnoModelo}`,
                url: 'https://veiculos.fipe.org.br',
                referencia: precoResp.data.MesReferencia
            }],
            total: 1
        };
        
    } catch (error) {
        console.error('❌ [FIPE] Erro:', error.message);
        return { sucesso: false, precos: [], total: 0 };
    }
}

// --- Calcular Match ---
function calcularMatch(busca, titulo) {
    const palavrasBusca = busca.toLowerCase()
        .split(' ')
        .filter(p => p.length > 2); // Ignorar palavras muito curtas
    
    const tituloLower = titulo.toLowerCase();
    
    const matches = palavrasBusca.filter(p => tituloLower.includes(p)).length;
    const percentual = (matches / palavrasBusca.length) * 100;
    
    if (percentual >= 80) return 'Exato';
    if (percentual >= 50) return 'Equivalente';
    return 'Substituto';
}

// =============================================================================
// MÓDULO 3: ORQUESTRADOR DE BUSCAS
// =============================================================================

async function buscarPrecos(dados, classificacao) {
    console.log('🔍 [BUSCA] Iniciando busca - API:', classificacao.api_sugerida);
    
    let resultados = { sucesso: false, precos: [], total: 0 };
    
    // Estratégia baseada na classificação
    switch (classificacao.api_sugerida) {
        
        case 'fipe':
            // Veículos - Usar FIPE
            resultados = await buscarFIPE(
                dados.marca || '', 
                dados.modelo || ''
            );
            
            // Fallback: tentar ML também
            if (!resultados.sucesso || resultados.total < 2) {
                const mlResults = await buscarMercadoLivre(
                    classificacao.termo_busca,
                    5
                );
                if (mlResults.sucesso) {
                    resultados.precos.push(...mlResults.precos);
                    resultados.total += mlResults.total;
                    resultados.sucesso = true;
                }
            }
            break;
        
        case 'mercadolivre_b2b':
            // Equipamentos industriais - ML B2B
            resultados = await buscarMercadoLivre(
                classificacao.termo_busca,
                10,
                true // B2B mode
            );
            
            // Tentar termo alternativo se falhar
            if (!resultados.sucesso && classificacao.termo_alternativo) {
                resultados = await buscarMercadoLivre(
                    classificacao.termo_alternativo,
                    10,
                    true
                );
            }
            break;
        
        case 'mercadolivre':
            // Produtos comuns - ML regular
            resultados = await buscarMercadoLivre(
                classificacao.termo_busca,
                10
            );
            
            // Tentar termo alternativo se poucos resultados
            if (resultados.total < 3 && classificacao.termo_alternativo) {
                const mlAlt = await buscarMercadoLivre(
                    classificacao.termo_alternativo,
                    10
                );
                if (mlAlt.sucesso) {
                    resultados.precos.push(...mlAlt.precos);
                    resultados.total += mlAlt.total;
                    resultados.sucesso = true;
                }
            }
            break;
        
        case 'nenhuma':
        default:
            // Produto muito específico ou sem mercado online
            console.log('⚠️ [BUSCA] Produto sem API adequada');
            break;
    }
    
    return resultados;
}

// =============================================================================
// MÓDULO 4: CÁLCULO DE MÉDIA
// =============================================================================

function calcularMediaPonderada(precos) {
    console.log('📊 [EMA] Calculando média...');
    
    if (!precos || precos.length === 0) {
        return { sucesso: false, motivo: 'Nenhum preço encontrado' };
    }

    // Remover outliers extremos (opcional)
    const valores = precos.map(p => p.valor).sort((a, b) => a - b);
    const q1 = valores[Math.floor(valores.length * 0.25)];
    const q3 = valores[Math.floor(valores.length * 0.75)];
    const iqr = q3 - q1;
    const limiteInf = q1 - (1.5 * iqr);
    const limiteSup = q3 + (1.5 * iqr);
    
    const precosFiltrados = precos.filter(p => 
        p.valor >= limiteInf && p.valor <= limiteSup
    );
    
    if (precosFiltrados.length === 0) {
        return { sucesso: false, motivo: 'Todos os preços foram outliers' };
    }
    
    console.log('✅ [EMA] ' + precosFiltrados.length + ' preço(s) válido(s)');

    // CASO 1: Apenas 1 preço
    if (precosFiltrados.length === 1) {
        const p = precosFiltrados[0];
        return {
            sucesso: true,
            valor_mercado: p.valor,
            estatisticas: {
                num: 1,
                min: p.valor,
                max: p.valor,
                desvio: 0,
                coef_var: 0,
                confianca: 30
            },
            precos: [{
                valor: p.valor,
                fonte: p.fonte,
                match: p.match,
                peso: 1.0,
                produto: p.produto,
                url: p.url
            }]
        };
    }

    // CASO 2: 2+ preços - Média ponderada
    const precosComPeso = precosFiltrados.map(p => {
        let pesoMatch = 1.0;
        if (p.match === 'Exato') pesoMatch = 2.0;
        else if (p.match === 'Equivalente') pesoMatch = 1.5;
        else if (p.match === 'Substituto') pesoMatch = 1.3;
        
        const pesoFonte = p.fonte.includes('Oficial') ? 1.3 : 1.0;
        const pesoTotal = pesoMatch * pesoFonte;

        return { ...p, peso_total: pesoTotal };
    });

    const somaPonderada = precosComPeso.reduce((acc, p) => acc + (p.valor * p.peso_total), 0);
    const somaPesos = precosComPeso.reduce((acc, p) => acc + p.peso_total, 0);
    const mediaPonderada = somaPonderada / somaPesos;

    const media = precosComPeso.reduce((acc, p) => acc + p.valor, 0) / precosComPeso.length;
    const variancia = precosComPeso.reduce((acc, p) => acc + Math.pow(p.valor - media, 2), 0) / precosComPeso.length;
    const desvioPadrao = Math.sqrt(variancia);
    const coefVariacao = (desvioPadrao / media) * 100;
    
    let scoreBase = 100 - coefVariacao;
    if (precosComPeso.length === 2) scoreBase *= 0.7;
    else if (precosComPeso.length === 3) scoreBase *= 0.85;
    
    const scoreConfianca = Math.max(0, Math.min(100, scoreBase));

    console.log('💰 R$', mediaPonderada.toFixed(2), '| Conf:', scoreConfianca.toFixed(0) + '%');

    return {
        sucesso: true,
        valor_mercado: parseFloat(mediaPonderada.toFixed(2)),
        estatisticas: {
            num: precosComPeso.length,
            min: Math.min(...precosComPeso.map(p => p.valor)),
            max: Math.max(...precosComPeso.map(p => p.valor)),
            desvio: parseFloat(desvioPadrao.toFixed(2)),
            coef_var: parseFloat(coefVariacao.toFixed(2)),
            confianca: parseFloat(scoreConfianca.toFixed(1))
        },
        precos: precosComPeso.map(p => ({
            valor: p.valor,
            fonte: p.fonte,
            match: p.match,
            peso: parseFloat(p.peso_total.toFixed(2)),
            produto: p.produto,
            url: p.url
        }))
    };
}

// =============================================================================
// ENDPOINT PRINCIPAL
// =============================================================================

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('🔍 [ETAPA2-V3] Iniciando processamento...');

    try {
        const {
            nome_produto,
            modelo,
            marca,
            especificacoes,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio
        } = req.body;

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Nome do produto é obrigatório',
                dados: {}
            });
        }

        // ========== ETAPA 1: CLASSIFICAR ==========
        const classificacao = await classificarProduto({
            nome_produto,
            marca,
            modelo,
            especificacoes
        });

        const metaClassificacao = classificacao.meta;
        
        console.log('📋 Categoria:', classificacao.dados.categoria);
        console.log('🎯 API:', classificacao.dados.api_sugerida);
        console.log('🔎 Termo:', classificacao.dados.termo_busca);

        // ========== ETAPA 2: BUSCAR PREÇOS ==========
        const resultadoBusca = await buscarPrecos(
            { nome_produto, marca, modelo, especificacoes },
            classificacao.dados
        );

        if (!resultadoBusca.sucesso || resultadoBusca.total === 0) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'Nenhum preço encontrado nas APIs disponíveis',
                dados: {
                    preco_encontrado: false,
                    classificacao: classificacao.dados,
                    termo_utilizado: classificacao.dados.termo_busca
                },
                meta: {
                    tokens: metaClassificacao.tokens,
                    custo: parseFloat(metaClassificacao.custo.toFixed(6)),
                    versao: 'v3-api-direta'
                }
            });
        }

        // ========== ETAPA 3: CALCULAR MÉDIA ==========
        const resultadoEMA = calcularMediaPonderada(resultadoBusca.precos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: resultadoEMA.motivo,
                dados: { 
                    preco_encontrado: false,
                    classificacao: classificacao.dados
                },
                meta: {
                    tokens: metaClassificacao.tokens,
                    custo: parseFloat(metaClassificacao.custo.toFixed(6)),
                    versao: 'v3-api-direta'
                }
            });
        }

        // ========== ETAPA 4: APLICAR DEPRECIAÇÃO ==========
        let valorMercado = resultadoEMA.valor_mercado;
        let metodo = 'Média Ponderada';
        const { coef_var, num } = resultadoEMA.estatisticas;

        if (num === 1) {
            metodo = 'Preço Único';
        } else if (coef_var > 40 && num > 1) {
            const valores = resultadoEMA.precos.map(p => p.valor).sort((a, b) => a - b);
            valorMercado = valores[Math.floor(valores.length / 2)];
            metodo = 'Mediana (alta variação)';
            console.log('⚠️ Alta variação:', coef_var.toFixed(1) + '% - usando mediana');
        }

        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';
        const fatorDep = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDep;

        // ========== RESPOSTA FINAL ==========
        const dadosCompletos = {
            numero_patrimonio,
            nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            especificacoes: especificacoes || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            
            valores: {
                mercado: parseFloat(valorMercado.toFixed(2)),
                atual: parseFloat(valorAtual.toFixed(2)),
                depreciacao: fatorDep,
                percentual_dep: ((1 - fatorDep) * 100).toFixed(0) + '%',
                metodo: metodo,
                confianca: resultadoEMA.estatisticas.confianca
            },
            
            stats: {
                num: num,
                min: resultadoEMA.estatisticas.min,
                max: resultadoEMA.estatisticas.max,
                desvio: resultadoEMA.estatisticas.desvio,
                coef_var: resultadoEMA.estatisticas.coef_var,
                confianca: resultadoEMA.estatisticas.confianca
            },
            
            precos: resultadoEMA.precos.map(p => ({
                v: p.valor,
                f: p.fonte,
                m: p.match,
                p: p.produto,
                u: p.url
            })),
            
            busca: {
                categoria: classificacao.dados.categoria,
                termo: classificacao.dados.termo_busca,
                api: classificacao.dados.api_sugerida,
                num: num
            },
            
            meta: {
                data: new Date().toISOString(),
                modelo: MODEL,
                versao: 'v3-api-direta',
                tokens: metaClassificacao.tokens,
                custo: parseFloat(metaClassificacao.custo.toFixed(6))
            }
        };

        console.log('✅ R$', valorMercado.toFixed(2), '| Atual: R$', valorAtual.toFixed(2), '| ' + num + ' preço(s)');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: num + ' preço(s) encontrado(s) | ' + resultadoEMA.estatisticas.confianca.toFixed(0) + '% confiança'
        });

    } catch (error) {
        console.error('❌ [ETAPA2-V3] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: { preco_encontrado: false }
        });
    }
};