const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// --- Extrair Especificação Principal ---
function extrairEspecificacaoPrincipal(especificacoes, nome_produto) {
    if (!especificacoes || especificacoes === 'N/A') {
        return nome_produto;
    }
    
    const padroes = {
        kva: /(\d+\.?\d*)\s*kVA/i,
        kw: /(\d+\.?\d*)\s*kW/i,
        hp: /(\d+\.?\d*)\s*HP/i,
        w: /(\d+\.?\d*)\s*W(?![a-z])/i,
        gb: /(\d+)\s*GB/i,
        tb: /(\d+)\s*TB/i,
        litros: /(\d+\.?\d*)\s*L(?:itros)?/i,
        polegadas: /(\d+\.?\d*)(?:"|''|\s*pol)/i,
        metros: /(\d+\.?\d*)\s*m(?![a-z])/i,
        volts: /(\d+)\s*V(?![a-z])/i,
        amperes: /(\d+)\s*A(?![a-z])/i,
        btu: /(\d+)\s*BTU/i
    };
    
    for (const [tipo, regex] of Object.entries(padroes)) {
        const match = especificacoes.match(regex);
        if (match) return match[0];
    }
    
    const palavras = especificacoes.split(/[,;]|\.(?=\s)/)[0].trim();
    return palavras.length > 100 ? palavras.substring(0, 50) + '...' : palavras;
}

// --- Prompt Ultra Otimizado ---
const PROMPT_BUSCA_PRECO = (dados) => {
    const especPrincipal = extrairEspecificacaoPrincipal(dados.especificacoes, dados.nome_produto);
    
    return `Encontre 1-4 preços NOVOS no Brasil para substituir:
${dados.nome_produto} | ${dados.marca || 'N/A'} | ${dados.modelo || 'N/A'}
Spec: ${especPrincipal}

REGRAS:
1. Termo: Marca+Modelo OU spec chave
2. Aceitar: Exato, Equivalente (±10%), Substituto
3. Só NOVOS, preços visíveis
4. Fontes: ML, Amazon, B2B
5. PRÉ-FILTRAR: Remova outliers (±30% da mediana)

JSON MÍNIMO:
{"ok":true,"termo":"texto","precos":[{"v":1599.9,"f":"Loja","m":"Exato","p":"Nome"}]}

Sem preços:
{"ok":false,"motivo":"razão","termo":"texto"}

CRÍTICO: JSON válido, nomes até 40 chars, SEM markdown`;
};

// --- Cálculo de Média - FUNCIONA COM 1+ PREÇOS ---
function calcularMediaPonderada(coleta_precos) {
    console.log('📊 [EMA] Calculando...');
    
    if (!coleta_precos || coleta_precos.length === 0) {
        return { sucesso: false, motivo: 'Nenhum preço' };
    }

    const precosValidos = coleta_precos
        .map(item => ({
            ...item,
            valor: parseFloat(String(item.v || item.valor).replace(/[^\d,.]/g, '').replace(',', '.'))
        }))
        .filter(item => !isNaN(item.valor) && item.valor > 0);

    if (precosValidos.length === 0) {
        return { sucesso: false, motivo: 'Nenhum preço válido' };
    }

    console.log('✅ [EMA] ' + precosValidos.length + ' preço(s)');

    // ✅ CASO 1: APENAS 1 PREÇO
    if (precosValidos.length === 1) {
        const precoUnico = precosValidos[0];
        const match = precoUnico.m || precoUnico.tipo_match || '';
        const fonte = precoUnico.f || precoUnico.fonte || '';
        const produto = precoUnico.p || precoUnico.produto || 'N/A';
        
        console.log('⚠️ [EMA] Apenas 1 preço: R$', precoUnico.valor.toFixed(2));
        
        return {
            sucesso: true,
            valor_mercado: parseFloat(precoUnico.valor.toFixed(2)),
            estatisticas: {
                num: 1,
                min: precoUnico.valor,
                max: precoUnico.valor,
                desvio: 0,
                coef_var: 0,
                confianca: 30 // ✅ Confiança baixa (apenas 1 preço)
            },
            precos: [{
                valor: precoUnico.valor,
                fonte: fonte,
                match: match,
                peso: 1.0,
                produto: produto
            }]
        };
    }

    // ✅ CASO 2: 2+ PREÇOS - Calcular pesos
    const precosComPeso = precosValidos.map(item => {
        let pesoMatch = 1.0;
        const match = item.m || item.tipo_match || '';
        if (match === 'Exato') pesoMatch = 2.0;
        else if (match === 'Equivalente') pesoMatch = 1.5;
        else if (match === 'Substituto') pesoMatch = 1.3;
        
        const fonte = item.f || item.fonte || '';
        const pesoFonte = fonte.includes('B2B') ? 1.5 : 1.0;
        const pesoTotal = pesoMatch * pesoFonte;

        return { 
            ...item, 
            valor: item.valor,
            fonte: fonte,
            tipo_match: match,
            produto: item.p || item.produto || 'N/A',
            peso_total: pesoTotal 
        };
    });

    const somaPonderada = precosComPeso.reduce((acc, p) => acc + (p.valor * p.peso_total), 0);
    const somaPesos = precosComPeso.reduce((acc, p) => acc + p.peso_total, 0);
    const mediaPonderada = somaPonderada / somaPesos;

    const media = precosComPeso.reduce((acc, p) => acc + p.valor, 0) / precosComPeso.length;
    const variancia = precosComPeso.reduce((acc, p) => acc + Math.pow(p.valor - media, 2), 0) / precosComPeso.length;
    const desvioPadrao = Math.sqrt(variancia);
    const coefVariacao = (desvioPadrao / media) * 100;
    
    // ✅ Score de confiança baseado em quantidade + variação
    let scoreBase = 100 - coefVariacao;
    
    // Penalizar se poucos preços
    if (precosValidos.length === 2) scoreBase *= 0.7; // 70% do score
    else if (precosValidos.length === 3) scoreBase *= 0.85; // 85% do score
    
    const scoreConfianca = Math.max(0, Math.min(100, scoreBase));

    console.log('💰 R$', mediaPonderada.toFixed(2), '| Conf:', scoreConfianca.toFixed(0) + '%');

    return {
        sucesso: true,
        valor_mercado: parseFloat(mediaPonderada.toFixed(2)),
        estatisticas: {
            num: precosValidos.length,
            min: Math.min(...precosValidos.map(p => p.valor)),
            max: Math.max(...precosValidos.map(p => p.valor)),
            desvio: parseFloat(desvioPadrao.toFixed(2)),
            coef_var: parseFloat(coefVariacao.toFixed(2)),
            confianca: parseFloat(scoreConfianca.toFixed(1))
        },
        precos: precosComPeso.map(p => ({
            valor: p.valor,
            fonte: p.fonte,
            match: p.tipo_match,
            peso: parseFloat(p.peso_total.toFixed(2)),
            produto: p.produto
        }))
    };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    console.log('🔍 [ETAPA2] Iniciando...');

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
                mensagem: 'Nome obrigatório',
                dados: {}
            });
        }

        const promptBusca = PROMPT_BUSCA_PRECO({
            nome_produto,
            marca,
            modelo,
            especificacoes
        });

        console.log('🤖 [ETAPA2] Chamando Gemini...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 },
            responseMimeType: 'application/json'
        });

        const result = await model.generateContent(promptBusca);
        const text = result.response.text();

        // ===== 📊 AUDITORIA =====
        const usage = result.response.usageMetadata;
        const tokIn = usage?.promptTokenCount || 0;
        const tokOut = usage?.candidatesTokenCount || 0;
        const tokTot = usage?.totalTokenCount || 0;
        
        const custoIn = tokIn * 0.0000016;
        const custoOut = tokOut * 0.0000133;
        const custoTot = custoIn + custoOut;
        
        console.log('📊 Tokens:', tokIn, '/', tokOut, '| R$', custoTot.toFixed(4));
        // ===== FIM =====

        let resultado;
        try {
            let jsonText = text.trim();
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonText = jsonMatch[0];
            resultado = JSON.parse(jsonText);
            console.log('✅ JSON válido');
        } catch (e) {
            console.error('❌ JSON inválido:', text.substring(0, 200));
            throw new Error('JSON inválido: ' + e.message);
        }

        // ✅ SEM PREÇOS = RESULTADO VÁLIDO
        if (!resultado.ok || resultado.ok === false) {
            console.log('ℹ️ Preços não encontrados (normal)');
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: resultado.motivo || 'Produto sem preços online visíveis',
                dados: { 
                    preco_encontrado: false,
                    termo_utilizado: resultado.termo || 'N/A'
                },
                meta: {
                    tokens: { in: tokIn, out: tokOut, total: tokTot },
                    custo: parseFloat(custoTot.toFixed(4))
                }
            });
        }

        const precos = resultado.precos || [];
        
        // ✅ SEM MÍNIMO! Aceita 1+
        if (precos.length === 0) {
            console.log('ℹ️ Array vazio');
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: 'Nenhum preço retornado',
                dados: { 
                    preco_encontrado: false,
                    termo_utilizado: resultado.termo || 'N/A'
                },
                meta: {
                    tokens: { in: tokIn, out: tokOut, total: tokTot },
                    custo: parseFloat(custoTot.toFixed(4))
                }
            });
        }

        // ✅ CALCULAR COM 1+ PREÇOS
        const resultadoEMA = calcularMediaPonderada(precos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Sem Preços',
                mensagem: resultadoEMA.motivo,
                dados: { 
                    preco_encontrado: false
                },
                meta: {
                    tokens: { in: tokIn, out: tokOut, total: tokTot },
                    custo: parseFloat(custoTot.toFixed(4))
                }
            });
        }

        let valorMercado = resultadoEMA.valor_mercado;
        let metodo = 'Média Ponderada';
        const { coef_var, num } = resultadoEMA.estatisticas;

        // ✅ Ajustar método baseado em quantidade e variação
        if (num === 1) {
            metodo = 'Preço Único';
        } else if (coef_var > 40 && num > 1) {
            const valores = resultadoEMA.precos.map(p => p.valor).sort((a, b) => a - b);
            valorMercado = valores[Math.floor(valores.length / 2)];
            metodo = 'Mediana (alta var)';
            console.log('⚠️ Alta var:', coef_var.toFixed(1) + '% - usando mediana');
        }

        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';
        const fatorDep = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDep;

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
                p: p.produto
            })),
            
            busca: {
                termo: resultado.termo || 'N/A',
                num: num
            },
            
            meta: {
                data: new Date().toISOString(),
                modelo: MODEL,
                versao: '2.4-SemMinimo',
                tokens: { in: tokIn, out: tokOut, total: tokTot },
                custo: parseFloat(custoTot.toFixed(4))
            }
        };

        console.log('✅ R$', valorMercado.toFixed(2), '| Atual: R$', valorAtual.toFixed(2), '| ' + num + ' preço(s)');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: num + ' preço(s) | ' + resultadoEMA.estatisticas.confianca.toFixed(0) + '% conf'
        });

    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: { preco_encontrado: false }
        });
    }
};