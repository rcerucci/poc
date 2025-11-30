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

// --- Termos de Busca Padronizados ---
function gerarTermosBusca(nome_produto, marca, modelo, descricao) {
    console.log('🔍 [BUSCA] Gerando termos...');
    
    const termos = [];
    
    if (marca && marca !== 'N/A') {
        termos.push(nome_produto + ' ' + marca);
    } else {
        termos.push(nome_produto);
    }
    
    if (modelo && modelo !== 'N/A' && modelo.length < 50) {
        termos.push(nome_produto + ' ' + modelo);
    }
    
    if (descricao && descricao !== 'N/A') {
        const regexSinonimo = /também\s+conhecido\s+como\s+([^.]+)/i;
        const match = descricao.match(regexSinonimo);
        if (match) {
            const sinonimos = match[1].split(/\s+ou\s+|,\s*/);
            if (sinonimos.length > 0) {
                termos.push(sinonimos[0].trim());
            }
        }
    }
    
    if (termos.length === 0) termos.push(nome_produto);
    
    console.log('📋 [BUSCA] Termos:', termos);
    return termos;
}

// ✅ PROMPT OTIMIZADO - REDUÇÃO DE 80% NOS TOKENS
const PROMPT_BUSCA_PRECO = (dados) => `Busque 3-5 preços NOVOS no Brasil de:

PRODUTO: ${dados.nome_produto}
MARCA: ${dados.marca || 'N/A'}
MODELO: ${dados.modelo || 'N/A'}
SPECS: ${dados.especificacoes || 'N/A'}

REGRAS:
1. Produtos NOVOS (não usados)
2. Preço visível (não "Solicitar Orçamento")
3. Prioridade: B2C (Mercado Livre, Amazon, Magalu)
4. Aceitar modelo exato OU equivalente (±10% spec principal)
5. RESPOSTA COMPACTA: só preço, fonte, match

IMPORTANTE: Se não encontrar 3 preços reais, retorne quantos encontrar (1 ou 2 é OK).

JSON (sem markdown, máximo 800 tokens):
{
  "preco_encontrado": true/false,
  "termo_busca_utilizado": "termo usado",
  "num_precos_encontrados": 4,
  "precos_coletados": [
    {
      "valor": 1599.90,
      "fonte": "Mercado Livre",
      "tipo_match": "Exato",
      "produto": "Nome produto"
    }
  ]
}

Se falhou:
{
  "preco_encontrado": false,
  "motivo": "razão breve",
  "termo_busca_utilizado": "termo",
  "num_precos_encontrados": 0,
  "precos_coletados": []
}`;

// ✅ CÁLCULO DE MÉDIA ADAPTATIVO (aceita 1+ preços)
function calcularMediaPonderada(coleta_precos) {
    console.log('📊 [EMA] Calculando média ponderada...');
    
    if (!coleta_precos || coleta_precos.length === 0) {
        return { sucesso: false, motivo: 'Nenhum preço' };
    }

    const precosValidos = coleta_precos
        .map(item => ({
            ...item,
            valor: parseFloat(String(item.valor).replace(/[^\d,.]/g, '').replace(',', '.'))
        }))
        .filter(item => !isNaN(item.valor) && item.valor > 0);

    if (precosValidos.length === 0) {
        return { sucesso: false, motivo: 'Nenhum preço válido' };
    }

    console.log('✅ [EMA] ' + precosValidos.length + ' preços válidos');

    // ✅ REMOVER OUTLIERS APENAS SE TIVER 4+ PREÇOS
    let precosFiltrados = precosValidos;
    
    if (precosValidos.length >= 4) {
        const valores = precosValidos.map(p => p.valor).sort((a, b) => a - b);
        const q1 = valores[Math.floor(valores.length * 0.25)];
        const q3 = valores[Math.floor(valores.length * 0.75)];
        const iqr = q3 - q1;
        const limiteInf = q1 - 1.5 * iqr;
        const limiteSup = q3 + 1.5 * iqr;

        precosFiltrados = precosValidos.filter(p => 
            p.valor >= limiteInf && p.valor <= limiteSup
        );

        if (precosFiltrados.length === 0) {
            precosFiltrados = precosValidos;
        }
        
        console.log('✅ [EMA] ' + precosFiltrados.length + ' após outliers');
    }

    // ✅ PESOS OTIMIZADOS (PRIORIZA B2C)
    const dataAtual = new Date();
    const precosComPeso = precosFiltrados.map(item => {
        // Peso por tipo de match
        let pesoMatch = 1.0;
        if (item.tipo_match === 'Exato') pesoMatch = 2.0;
        else if (item.tipo_match === 'Parcial') pesoMatch = 1.5;
        
        // ✅ PESO POR FONTE (INVERTIDO - B2C MAIOR)
        let pesoFonte = 1.0;
        const fonteLower = item.fonte?.toLowerCase() || '';
        
        // B2C (alta confiança)
        if (fonteLower.includes('mercado livre') || 
            fonteLower.includes('amazon') || 
            fonteLower.includes('magalu') ||
            fonteLower.includes('magazine') ||
            fonteLower.includes('americanas') ||
            fonteLower.includes('submarino')) {
            pesoFonte = 2.0; // ✅ B2C tem PESO MAIOR
        }
        // B2B (média confiança)
        else if (fonteLower.includes('b2b') || 
                 fonteLower.includes('distribui') ||
                 fonteLower.includes('atacad')) {
            pesoFonte = 1.5;
        }
        
        // Peso por recência
        let pesoRecencia = 1.0;
        if (item.data_oferta) {
            try {
                const dataOferta = new Date(item.data_oferta);
                const dias = (dataAtual - dataOferta) / (1000 * 60 * 60 * 24);
                pesoRecencia = Math.exp(-dias / 60);
            } catch (e) {}
        }

        const pesoTotal = pesoMatch * pesoFonte * pesoRecencia;

        return { ...item, peso_total: pesoTotal };
    });

    console.log('⚖️ [EMA] Pesos:', precosComPeso.map(p => ({
        valor: p.valor,
        fonte: p.fonte,
        match: p.tipo_match,
        peso: p.peso_total.toFixed(3)
    })));

    // ✅ ESTRATÉGIA ADAPTATIVA BASEADA NA QUANTIDADE
    let valorMercado;
    let metodo;
    
    if (precosFiltrados.length === 1) {
        // 1 preço: usar direto
        valorMercado = precosFiltrados[0].valor;
        metodo = 'Preço Único';
        console.log('💰 [EMA] Usando preço único: R$ ' + valorMercado.toFixed(2));
        
    } else if (precosFiltrados.length === 2) {
        // 2 preços: média simples
        valorMercado = (precosFiltrados[0].valor + precosFiltrados[1].valor) / 2;
        metodo = 'Média Simples (2 preços)';
        console.log('💰 [EMA] Média de 2 preços: R$ ' + valorMercado.toFixed(2));
        
    } else {
        // 3+ preços: média ponderada
        const somaPonderada = precosComPeso.reduce((acc, p) => acc + (p.valor * p.peso_total), 0);
        const somaPesos = precosComPeso.reduce((acc, p) => acc + p.peso_total, 0);
        valorMercado = somaPonderada / somaPesos;
        metodo = 'Média Ponderada (Match+Fonte B2C+Recência)';
        console.log('💰 [EMA] Média ponderada: R$ ' + valorMercado.toFixed(2));
    }

    // Estatísticas
    const media = precosComPeso.reduce((acc, p) => acc + p.valor, 0) / precosComPeso.length;
    const variancia = precosComPeso.reduce((acc, p) => acc + Math.pow(p.valor - media, 2), 0) / precosComPeso.length;
    const desvioPadrao = Math.sqrt(variancia);
    const coefVariacao = precosComPeso.length > 1 ? (desvioPadrao / media) * 100 : 0;
    
    // ✅ SCORE DE CONFIANÇA ADAPTATIVO
    let scoreConfianca;
    if (precosFiltrados.length === 1) {
        scoreConfianca = 60; // 1 preço = confiança moderada
    } else if (precosFiltrados.length === 2) {
        scoreConfianca = 75; // 2 preços = confiança boa
    } else {
        scoreConfianca = Math.max(50, Math.min(100, 100 - coefVariacao)); // 3+ = baseado em variação
    }

    console.log('📊 [EMA] Confiança: ' + scoreConfianca.toFixed(1) + '%');

    return {
        sucesso: true,
        valor_mercado: parseFloat(valorMercado.toFixed(2)),
        metodo: metodo,
        estatisticas: {
            num_precos_coletados: coleta_precos.length,
            num_precos_validos: precosValidos.length,
            num_precos_apos_outliers: precosFiltrados.length,
            preco_minimo: Math.min(...precosFiltrados.map(p => p.valor)),
            preco_maximo: Math.max(...precosFiltrados.map(p => p.valor)),
            desvio_padrao: parseFloat(desvioPadrao.toFixed(2)),
            coeficiente_variacao: parseFloat(coefVariacao.toFixed(2)),
            score_confianca: parseFloat(scoreConfianca.toFixed(1))
        },
        detalhes_precos: precosComPeso.map(p => ({
            valor: p.valor,
            fonte: p.fonte,
            tipo_match: p.tipo_match,
            peso: parseFloat(p.peso_total.toFixed(3)),
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

    console.log('🔍 [ETAPA2] Iniciando busca...');

    try {
        const {
            nome_produto,
            modelo,
            marca,
            especificacoes,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio,
            descricao
        } = req.body;

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Nome do produto obrigatório',
                dados: {}
            });
        }

        const termosBusca = gerarTermosBusca(nome_produto, marca, modelo, descricao);
        const promptBusca = PROMPT_BUSCA_PRECO({
            nome_produto,
            marca,
            modelo,
            especificacoes
        });

        console.log('🤖 [ETAPA2] Chamando Gemini com Google Search...');

        // ✅ CONFIGURAÇÃO SIMPLIFICADA (SEM dynamic_retrieval_config)
        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],  // ✅ SIMPLIFICADO
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1500,  // ✅ LIMITE DE RESPOSTA
                responseMimeType: 'application/json'
            }
        });

        const result = await model.generateContent(promptBusca);
        const text = result.response.text();

        console.log('📥 [ETAPA2] Resposta recebida');
        
        // Log de tokens se disponível
        if (result.response.usageMetadata) {
            console.log('📊 [ETAPA2] Tokens:', result.response.usageMetadata);
        }

        let resultadoBusca;
        try {
            let jsonText = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonText = jsonMatch[0];
            resultadoBusca = JSON.parse(jsonText);
        } catch (e) {
            throw new Error('JSON inválido: ' + e.message);
        }

        // ✅ VALIDAÇÃO ANTI-ALUCINAÇÃO RIGOROSA
        if (resultadoBusca.preco_encontrado) {
            const precosValidos = resultadoBusca.precos_coletados.filter(p => {
                // Verificações rigorosas
                const temFonte = p.fonte && p.fonte !== 'N/A' && p.fonte.length > 3;
                const naoEhEstimativa = !p.fonte.toLowerCase().includes('estimat');
                const temValor = p.valor && p.valor > 0;
                const valorRazoavel = p.valor < 1000000; // Menos de 1 milhão
                
                return temFonte && naoEhEstimativa && temValor && valorRazoavel;
            });

            console.log(`✅ [VALIDAÇÃO] ${precosValidos.length} preços válidos de ${resultadoBusca.precos_coletados.length}`);

            // ✅ ACEITAR 1+ PREÇOS (não exigir 3)
            if (precosValidos.length === 0) {
                console.log('❌ [VALIDAÇÃO] Nenhum preço válido!');
                resultadoBusca.preco_encontrado = false;
                resultadoBusca.motivo = 'Nenhum preço real verificável';
            } else {
                resultadoBusca.precos_coletados = precosValidos;
                resultadoBusca.num_precos_encontrados = precosValidos.length;
            }
        }

        if (!resultadoBusca.preco_encontrado) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Preços não encontrados: ' + (resultadoBusca.motivo || 'Produto não localizado'),
                dados: { preco_encontrado: false }
            });
        }

        const resultadoEMA = calcularMediaPonderada(resultadoBusca.precos_coletados);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Erro no cálculo: ' + resultadoEMA.motivo,
                dados: { preco_encontrado: false }
            });
        }

        let valorMercado = resultadoEMA.valor_mercado;
        let metodo = resultadoEMA.metodo;
        const { coeficiente_variacao, num_precos_apos_outliers } = resultadoEMA.estatisticas;

        // ✅ USAR MEDIANA APENAS SE 4+ PREÇOS E ALTA VARIAÇÃO
        if (num_precos_apos_outliers >= 4 && coeficiente_variacao > 40) {
            console.log('⚠️ [VALIDAÇÃO] Alta variação: ' + coeficiente_variacao.toFixed(1) + '%');
            const valores = resultadoEMA.detalhes_precos.map(p => p.valor).sort((a, b) => a - b);
            const mediana = valores[Math.floor(valores.length / 2)];
            console.log('🔄 [VALIDAÇÃO] Usando mediana: R$ ' + mediana.toFixed(2));
            valorMercado = mediana;
            metodo = 'Mediana (alta variação)';
        }

        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';
        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        const dadosCompletos = {
            numero_patrimonio,
            nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            especificacoes: especificacoes || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            valores_estimados: {
                valor_mercado_estimado: parseFloat(valorMercado.toFixed(2)),
                valor_atual_estimado: parseFloat(valorAtual.toFixed(2)),
                fator_depreciacao: fatorDepreciacao,
                percentual_depreciacao: ((1 - fatorDepreciacao) * 100).toFixed(0) + '%',
                fonte_preco: metodo,
                score_confianca: resultadoEMA.estatisticas.score_confianca
            },
            analise_estatistica: resultadoEMA.estatisticas,
            precos_coletados: resultadoEMA.detalhes_precos,
            estrategia_busca: {
                termos_padronizados: termosBusca,
                termo_utilizado: resultadoBusca.termo_busca_utilizado,
                num_precos_reais: resultadoBusca.num_precos_encontrados
            },
            metadados: {
                data_busca: new Date().toISOString(),
                modelo_ia: MODEL
            }
        };

        console.log('✅ [ETAPA2] Concluído! Mercado: R$ ' + valorMercado.toFixed(2) + ' | Atual: R$ ' + valorAtual.toFixed(2));

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Calculado com ' + resultadoBusca.num_precos_encontrados + ' preços (confiança: ' + resultadoEMA.estatisticas.score_confianca.toFixed(0) + '%)'
        });

    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);
        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro: ' + error.message,
            dados: { preco_encontrado: false }
        });
    }
};