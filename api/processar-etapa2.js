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
    
    // Padrões de especificações principais por categoria
    const padroes = {
        // Potência
        kva: /(\d+\.?\d*)\s*kVA/i,
        kw: /(\d+\.?\d*)\s*kW/i,
        hp: /(\d+\.?\d*)\s*HP/i,
        w: /(\d+\.?\d*)\s*W(?![a-z])/i,
        
        // Capacidade
        gb: /(\d+)\s*GB/i,
        tb: /(\d+)\s*TB/i,
        litros: /(\d+\.?\d*)\s*L(?:itros)?/i,
        
        // Dimensões
        polegadas: /(\d+\.?\d*)(?:"|''|\s*pol)/i,
        metros: /(\d+\.?\d*)\s*m(?![a-z])/i,
        
        // Tensão/Corrente
        volts: /(\d+)\s*V(?![a-z])/i,
        amperes: /(\d+)\s*A(?![a-z])/i,
        
        // BTU (ar condicionado)
        btu: /(\d+)\s*BTU/i
    };
    
    // Tentar encontrar especificação principal
    for (const [tipo, regex] of Object.entries(padroes)) {
        const match = especificacoes.match(regex);
        if (match) {
            return match[0]; // Retorna a spec encontrada (ex: "30 kVA")
        }
    }
    
    // Se não encontrou padrão, pegar primeiras palavras das specs
    const palavras = especificacoes.split(/[,;]|\.(?=\s)/)[0].trim();
    if (palavras.length > 100) {
        return palavras.substring(0, 50) + '...';
    }
    return palavras;
}

// --- Prompt Inteligente com Exemplos Neutros ---
const PROMPT_BUSCA_PRECO = (dados) => {
    const especPrincipal = extrairEspecificacaoPrincipal(dados.especificacoes, dados.nome_produto);
    
    return `Você é um especialista em precificação de ativos para REPOSIÇÃO. Encontre 3-5 preços de produtos NOVOS no Brasil que possam SUBSTITUIR este item:

ATIVO A SUBSTITUIR:
- Nome: ${dados.nome_produto}
- Marca: ${dados.marca || 'Não especificada'}
- Modelo: ${dados.modelo || 'Não especificado'}
- Especificação CHAVE: ${especPrincipal}
- Specs completas: ${dados.especificacoes || 'Não especificadas'}

ESTRATÉGIA DE BUSCA INTELIGENTE:

1. CONSTRUIR TERMO DE BUSCA:
   - Se Marca+Modelo conhecidos: use ambos
   - Se Marca/Modelo genéricos (N/A): foque na especificação CHAVE
   - Use termos simples, não toda a especificação técnica
   - Exemplo BOM: "impressora laser 40ppm duplex"
   - Exemplo RUIM: "impressora laser monocromático duplex automático ADF 50 folhas rede ethernet WiFi classe A"

2. HIERARQUIA DE ACEITAÇÃO (prioridade decrescente):
   a) EXATO: Marca + Modelo idênticos
   b) EQUIVALENTE: Mesma função + especificação CHAVE dentro de ±10%
   c) SUBSTITUTO: Produto de mercado atual que substitui o original (mesmo com marca/modelo diferentes)

3. CRITÉRIOS DE EQUIVALÊNCIA PARA REPOSIÇÃO:
   - Especificação CHAVE deve estar dentro de ±10%
   - Especificações secundárias podem variar
   - Produtos descontinuados: aceitar SUCESSOR de linha
   - Produtos sem marca: aceitar QUALQUER marca confiável com specs compatíveis

4. FONTES VÁLIDAS:
   - Mercado Livre, Amazon, Magazine Luiza
   - Distribuidores B2B com preço visível
   - IGNORAR: "Solicitar orçamento", usados, kits

5. MÍNIMO: 3 preços de produtos NOVOS com preços visíveis

IMPORTANTE: Seu objetivo é encontrar o CUSTO DE REPOSIÇÃO. Um item antigo pode ter um substituto moderno com preço diferente, mas que cumpre a mesma função.

EXEMPLOS DE BUSCA CORRETA:

Notebook Dell i5 8GB:
- Termo: "notebook Dell i5 8GB"
- Aceitar: Dell Inspiron 15 3000 (modelo específico atual)
- Resultado: {"tipo_match": "Equivalente", "justificativa": "Mesmo fabricante, specs compatíveis"}

Furadeira 710W 220V:
- Termo: "furadeira 710W"
- Aceitar: Makita HP1640 710W OU Bosch GSB 13 RE 650W
- Resultado: {"tipo_match": "Equivalente", "justificativa": "710W (exato) ou 650W (dentro de ±10%)"}

Ar Condicionado 12000 BTU:
- Termo: "ar condicionado 12000 BTU inverter"
- Aceitar: Samsung 12000 BTU OU LG 11500 BTU OU Midea 13000 BTU
- Resultado: {"tipo_match": "Equivalente", "justificativa": "11500-13000 BTU (±10% de 12000)"}

Gerador 6500W diesel:
- Termo: "gerador diesel 6500W"
- Aceitar: Toyama TDG8000 (8000W) OU Honda EG6500 (6500W)
- Resultado: {"tipo_match": "Substituto", "justificativa": "8000W substitui 6500W com margem"}

Impressora laser 40ppm:
- Termo: "impressora laser 40ppm duplex"
- Aceitar: HP M428fdw (40ppm) OU Brother HL-L6200DW (48ppm)
- Resultado: {"tipo_match": "Equivalente", "justificativa": "40-48ppm (dentro de ±10%)"}

JSON (sem markdown):
{
  "preco_encontrado": true,
  "termo_busca_utilizado": "termo simples usado",
  "estrategia": "Exato/Equivalente/Substituto - breve explicação",
  "num_precos_encontrados": 4,
  "precos_coletados": [
    {
      "valor": 1599.90,
      "fonte": "Nome da loja",
      "tipo_match": "Equivalente",
      "produto": "Nome do produto encontrado",
      "justificativa": "Spec chave compatível (detalhe)"
    }
  ]
}

Se <3 preços:
{
  "preco_encontrado": false,
  "motivo": "Razão específica do que tentou",
  "termo_busca_utilizado": "termo tentado",
  "num_precos_encontrados": 1,
  "precos_coletados": []
}`;
};

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
        else if (item.tipo_match === 'Equivalente') pesoMatch = 1.5;
        else if (item.tipo_match === 'Substituto') pesoMatch = 1.3;
        
        // Peso por fonte
        const pesoFonte = item.fonte?.includes('B2B') ? 1.5 : 1.0;
        
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
            produto: p.produto,
            justificativa: p.justificativa || 'N/A'
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

        const promptBusca = PROMPT_BUSCA_PRECO({
            nome_produto,
            marca,
            modelo,
            especificacoes
        });

        console.log('🤖 [ETAPA2] Chamando Gemini com Google Search...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 }
        });

        const result = await model.generateContent(promptBusca);
        const text = result.response.text();

        // ===== 📊 AUDITORIA COM CUSTOS REAIS =====
        const usage = result.response.usageMetadata;
        
        const CUSTO_INPUT_POR_TOKEN = 0.0000016;   // R$ 1,60/1M
        const CUSTO_OUTPUT_POR_TOKEN = 0.0000133;  // R$ 13,34/1M
        const GROUNDING_FREE_TIER_DIARIO = 1500;
        
        const tokensInput = usage?.promptTokenCount || 0;
        const tokensOutput = usage?.candidatesTokenCount || 0;
        const tokensTotal = usage?.totalTokenCount || 0;
        
        const custoTokens = (tokensInput * CUSTO_INPUT_POR_TOKEN) + 
                            (tokensOutput * CUSTO_OUTPUT_POR_TOKEN);
        const custoGrounding = 0; // FREE (assumindo <1500/dia)
        const custoTotal = custoTokens + custoGrounding;
        
        console.log('📊 [ETAPA2-DIAGNÓSTICO] Tokens:', {
            input: tokensInput,
            output: tokensOutput,
            total: tokensTotal,
            custo_tokens: 'R$ ' + custoTokens.toFixed(4),
            custo_grounding: 'GRÁTIS (free tier)',
            custo_total: 'R$ ' + custoTotal.toFixed(4)
        });
        // ===== FIM AUDITORIA =====

        console.log('📥 [ETAPA2] Resposta recebida');

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
        let metodo = 'Média Ponderada (Match+Fonte+Recência)';
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
                termo_utilizado: resultadoBusca.termo_busca_utilizado,
                estrategia: resultadoBusca.estrategia,
                num_precos_reais: resultadoBusca.num_precos_encontrados
            },
            metadados: {
                data_busca: new Date().toISOString(),
                modelo_ia: MODEL,
                versao_sistema: '2.2-Custos-Reais-Busca-Inteligente',
                tokens_input: tokensInput,
                tokens_output: tokensOutput,
                tokens_total: tokensTotal,
                custo_tokens: parseFloat(custoTokens.toFixed(4)),
                custo_grounding: parseFloat(custoGrounding.toFixed(4)),
                custo_total: parseFloat(custoTotal.toFixed(4))
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