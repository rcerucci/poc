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

// ✅ PROMPT OTIMIZADO (80% MENOR, MESMA FUNCIONALIDADE)
const PROMPT_BUSCA_PRECO = (dados) => `Busque preços NOVOS no Brasil:

PRODUTO: ${dados.nome_produto}
MARCA: ${dados.marca || 'N/A'}
MODELO: ${dados.modelo || 'N/A'}
SPECS: ${dados.especificacoes || 'N/A'}

REGRAS:
- Produtos NOVOS (não usados)
- Mínimo 3 preços com valores visíveis
- Prioridade: B2C (Mercado Livre, Amazon, Magalu) > B2B
- Aceitar exato OU equivalente (±10% spec principal)
- Ignore "Solicitar Orçamento"

JSON (sem markdown):
{
  "preco_encontrado": true,
  "termo_busca_utilizado": "termo",
  "estrategia": "Exato/Equivalente",
  "num_precos_encontrados": 4,
  "precos_coletados": [
    {
      "valor": 1599.90,
      "fonte": "Mercado Livre",
      "tipo_match": "Exato",
      "produto": "Nome produto",
      "url": "URL"
    }
  ]
}

Se < 3:
{
  "preco_encontrado": false,
  "motivo": "razão",
  "termo_busca_utilizado": "termo",
  "num_precos_encontrados": 0,
  "precos_coletados": []
}`;

// --- Cálculo EMA com Pesos ---
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

    // Remover outliers (IQR)
    const valores = precosValidos.map(p => p.valor).sort((a, b) => a - b);
    const q1 = valores[Math.floor(valores.length * 0.25)];
    const q3 = valores[Math.floor(valores.length * 0.75)];
    const iqr = q3 - q1;
    const limiteInf = q1 - 1.5 * iqr;
    const limiteSup = q3 + 1.5 * iqr;

    const precosFiltrados = precosValidos.filter(p => 
        p.valor >= limiteInf && p.valor <= limiteSup
    );

    if (precosFiltrados.length === 0) {
        precosFiltrados.push(...precosValidos);
    }

    console.log('✅ [EMA] ' + precosFiltrados.length + ' após outliers');

    // Calcular pesos (Match + Fonte + Recência)
    const dataAtual = new Date();
    const precosComPeso = precosFiltrados.map(item => {
        // Peso por tipo de match
        let pesoMatch = 1.0;
        if (item.tipo_match === 'Exato') pesoMatch = 2.0;
        else if (item.tipo_match === 'Parcial') pesoMatch = 1.5;
        
        // ✅ PESO POR FONTE OTIMIZADO (B2C > B2B)
        let pesoFonte = 1.0;
        const fonteLower = item.fonte?.toLowerCase() || '';
        
        if (fonteLower.includes('mercado livre') || 
            fonteLower.includes('amazon') || 
            fonteLower.includes('magalu') ||
            fonteLower.includes('magazine') ||
            fonteLower.includes('americanas') ||
            fonteLower.includes('submarino')) {
            pesoFonte = 2.0; // B2C maior peso
        } else if (fonteLower.includes('b2b') || 
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
        match: p.tipo_match,
        peso: p.peso_total.toFixed(3)
    })));

    // Média ponderada
    const somaPonderada = precosComPeso.reduce((acc, p) => acc + (p.valor * p.peso_total), 0);
    const somaPesos = precosComPeso.reduce((acc, p) => acc + p.peso_total, 0);
    const mediaPonderada = somaPonderada / somaPesos;

    // Estatísticas
    const media = precosComPeso.reduce((acc, p) => acc + p.valor, 0) / precosComPeso.length;
    const variancia = precosComPeso.reduce((acc, p) => acc + Math.pow(p.valor - media, 2), 0) / precosComPeso.length;
    const desvioPadrao = Math.sqrt(variancia);
    const coefVariacao = (desvioPadrao / media) * 100;
    const scoreConfianca = Math.max(0, Math.min(100, 100 - coefVariacao));

    console.log('💰 [EMA] Média: R$ ' + mediaPonderada.toFixed(2) + ' | Confiança: ' + scoreConfianca.toFixed(1) + '%');

    return {
        sucesso: true,
        valor_mercado: parseFloat(mediaPonderada.toFixed(2)),
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
//
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

        // ✅ CONFIGURAÇÃO COM LIMITE DE TOKENS
        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: { 
                temperature: 0.1,
                maxOutputTokens: 1500  // ✅ LIMITA RESPOSTA
            }
        });

        const result = await model.generateContent(promptBusca);
        const text = result.response.text();

        console.log('📥 [ETAPA2] Resposta recebida');
        
        // ✅ LOG DE TOKENS
        if (result.response.usageMetadata) {
            console.log('📊 [TOKENS]', result.response.usageMetadata);
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

        // Validação anti-alucinação
        if (resultadoBusca.preco_encontrado) {
            const precosValidos = resultadoBusca.precos_coletados.filter(p =>
                p.fonte && p.fonte !== 'N/A' && !p.fonte.toLowerCase().includes('estimat') && p.valor > 0
            );

            if (precosValidos.length < 3) {
                console.log('⚠️ [VALIDAÇÃO] Menos de 3 preços reais!');
                resultadoBusca.preco_encontrado = false;
                resultadoBusca.motivo = 'Apenas ' + precosValidos.length + ' preço(s) real(is)';
            } else {
                resultadoBusca.precos_coletados = precosValidos;
            }
        }

        if (!resultadoBusca.preco_encontrado) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Preços insuficientes: ' + (resultadoBusca.motivo || 'Produto específico'),
                dados: { preco_encontrado: false }
            });
        }

        const resultadoEMA = calcularMediaPonderada(resultadoBusca.precos_coletados);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Erro: ' + resultadoEMA.motivo,
                dados: { preco_encontrado: false }
            });
        }

        let valorMercado = resultadoEMA.valor_mercado;
        let metodo = 'Média Ponderada (Match+Fonte B2C+Recência)';
        const { coeficiente_variacao } = resultadoEMA.estatisticas;

        // Se alta variação, usar mediana
        if (coeficiente_variacao > 40) {
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
                estrategia: resultadoBusca.estrategia,
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