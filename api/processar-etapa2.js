const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuração da IA e Autenticação ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

// Inicializar Google AI
const genAI = new GoogleGenerativeAI(API_KEY);

// --- Dicionário de Fatores de Depreciação ---
const FATORES_DEPRECIACAO = {
    Excelente: {
        'Equipamentos de Informática': 0.9,
        'Ferramentas': 0.85,
        'Instalações': 0.8,
        'Máquinas e Equipamentos': 0.85,
        'Móveis e Utensílios': 0.8,
        'Veículos': 0.85,
        'Outros': 0.75
    },
    Bom: {
        'Equipamentos de Informática': 0.75,
        'Ferramentas': 0.7,
        'Instalações': 0.65,
        'Máquinas e Equipamentos': 0.7,
        'Móveis e Utensílios': 0.65,
        'Veículos': 0.7,
        'Outros': 0.6
    },
    Regular: {
        'Equipamentos de Informática': 0.55,
        'Ferramentas': 0.5,
        'Instalações': 0.45,
        'Máquinas e Equipamentos': 0.5,
        'Móveis e Utensílios': 0.45,
        'Veículos': 0.5,
        'Outros': 0.4
    },
    Ruim: {
        'Equipamentos de Informática': 0.35,
        'Ferramentas': 0.3,
        'Instalações': 0.25,
        'Máquinas e Equipamentos': 0.3,
        'Móveis e Utensílios': 0.25,
        'Veículos': 0.3,
        'Outros': 0.2
    }
};

// --- Função para Gerar Termos de Busca Padronizados ---
function gerarTermosBuscaPadronizados(nome_produto, marca, modelo, descricao) {
    console.log('🔍 [BUSCA] Gerando termos de busca padronizados...');
    
    const termos = [];
    
    // Termo 1: Nome do produto + marca (se houver)
    if (marca && marca !== 'N/A') {
        termos.push(nome_produto + ' ' + marca);
    } else {
        termos.push(nome_produto);
    }
    
    // Termo 2: Nome do produto + modelo (se houver e for curto)
    if (modelo && modelo !== 'N/A' && modelo.length < 50) {
        termos.push(nome_produto + ' ' + modelo);
    }
    
    // Termo 3: Extrair sinônimos da descrição (se houver "também conhecido como")
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
    
    // Garantir que temos pelo menos 1 termo
    if (termos.length === 0) {
        termos.push(nome_produto);
    }
    
    console.log('📋 [BUSCA] Termos padronizados:', termos);
    return termos;
}

// --- Função de Cálculo de Média Exponencial ---
function calcularMediaExponencial(coleta_precos) {
    console.log('📊 [EMA] Iniciando cálculo de média exponencial...');
    console.log('📥 [EMA] Preços coletados:', JSON.stringify(coleta_precos, null, 2));

    if (!coleta_precos || coleta_precos.length === 0) {
        console.log('⚠️ [EMA] Nenhum preço coletado');
        return { sucesso: false, motivo: 'Nenhum preço coletado' };
    }

    // 1. Filtrar e validar preços
    const precosValidos = coleta_precos
        .map(item => ({
            ...item,
            valor: parseFloat(String(item.valor).replace(/[^\d,.]/g, '').replace(',', '.'))
        }))
        .filter(item => !isNaN(item.valor) && item.valor > 0);

    if (precosValidos.length === 0) {
        console.log('⚠️ [EMA] Nenhum preço válido após filtragem');
        return { sucesso: false, motivo: 'Nenhum preço válido encontrado' };
    }

    console.log('✅ [EMA] ' + precosValidos.length + ' preços válidos');

    // 2. Remover outliers usando IQR (Interquartile Range)
    const valores = precosValidos.map(p => p.valor).sort((a, b) => a - b);
    const q1 = valores[Math.floor(valores.length * 0.25)];
    const q3 = valores[Math.floor(valores.length * 0.75)];
    const iqr = q3 - q1;
    const limiteInferior = q1 - 1.5 * iqr;
    const limiteSuperior = q3 + 1.5 * iqr;

    console.log('📐 [EMA] IQR: Q1=' + q1.toFixed(2) + ', Q3=' + q3.toFixed(2) + ', IQR=' + iqr.toFixed(2));
    console.log('📐 [EMA] Limites: [' + limiteInferior.toFixed(2) + ', ' + limiteSuperior.toFixed(2) + ']');

    const precosFiltrados = precosValidos.filter(p => 
        p.valor >= limiteInferior && p.valor <= limiteSuperior
    );

    if (precosFiltrados.length === 0) {
        console.log('⚠️ [EMA] Todos os preços foram considerados outliers, usando preços válidos');
        precosFiltrados.push(...precosValidos);
    }

    console.log('✅ [EMA] ' + precosFiltrados.length + ' preços após remoção de outliers');

    // 3. Calcular pesos (Fonte + Recência)
    const dataAtual = new Date();
    const precosComPeso = precosFiltrados.map(item => {
        // Peso por tipo de fonte
        const pesoFonte = item.tipo_fonte === 'B2B' ? 1.5 : 1.0;

        // Peso por recência (últimos 30 dias = peso 1.0, decai exponencialmente)
        let pesoRecencia = 1.0;
        if (item.data_oferta) {
            try {
                const dataOferta = new Date(item.data_oferta);
                const diasPassados = (dataAtual - dataOferta) / (1000 * 60 * 60 * 24);
                pesoRecencia = Math.exp(-diasPassados / 60);
            } catch (e) {
                console.log('⚠️ [EMA] Data inválida:', item.data_oferta);
            }
        }

        const pesoTotal = pesoFonte * pesoRecencia;

        return {
            ...item,
            peso_fonte: pesoFonte,
            peso_recencia: pesoRecencia,
            peso_total: pesoTotal
        };
    });

    console.log('⚖️ [EMA] Pesos calculados:', precosComPeso.map(p => ({
        valor: p.valor,
        tipo: p.tipo_fonte,
        peso: p.peso_total.toFixed(3)
    })));

    // 4. Calcular Média Exponencial Ponderada (EMA)
    const somaPonderada = precosComPeso.reduce((acc, item) => 
        acc + (item.valor * item.peso_total), 0
    );
    const somaPesos = precosComPeso.reduce((acc, item) => 
        acc + item.peso_total, 0
    );

    const mediaExponencial = somaPonderada / somaPesos;

    // 5. Calcular desvio padrão para score de confiança
    const media = precosComPeso.reduce((acc, item) => acc + item.valor, 0) / precosComPeso.length;
    const variancia = precosComPeso.reduce((acc, item) => 
        acc + Math.pow(item.valor - media, 2), 0
    ) / precosComPeso.length;
    const desvioPadrao = Math.sqrt(variancia);
    const coeficienteVariacao = (desvioPadrao / media) * 100;

    // Score de confiança (0-100): menor variação = maior confiança
    const scoreConfianca = Math.max(0, Math.min(100, 100 - coeficienteVariacao));

    console.log('💰 [EMA] Resultado final:');
    console.log('   Média Exponencial: R$ ' + mediaExponencial.toFixed(2));
    console.log('   Desvio Padrão: R$ ' + desvioPadrao.toFixed(2));
    console.log('   Confiança: ' + scoreConfianca.toFixed(1) + '%');

    return {
        sucesso: true,
        valor_mercado: parseFloat(mediaExponencial.toFixed(2)),
        estatisticas: {
            num_precos_coletados: coleta_precos.length,
            num_precos_validos: precosValidos.length,
            num_precos_apos_outliers: precosFiltrados.length,
            preco_minimo: Math.min(...precosFiltrados.map(p => p.valor)),
            preco_maximo: Math.max(...precosFiltrados.map(p => p.valor)),
            desvio_padrao: parseFloat(desvioPadrao.toFixed(2)),
            coeficiente_variacao: parseFloat(coeficienteVariacao.toFixed(2)),
            score_confianca: parseFloat(scoreConfianca.toFixed(1))
        },
        detalhes_precos: precosComPeso.map(p => ({
            valor: p.valor,
            fonte: p.site || p.fonte,
            tipo: p.tipo_fonte,
            peso: parseFloat(p.peso_total.toFixed(3)),
            data: p.data_oferta || 'N/A',
            produto: p.produto_encontrado || 'N/A'
        }))
    };
}

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🔍 [ETAPA2] Iniciando busca RIGOROSA de preços...');

    try {
        const {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio,
            descricao
        } = req.body;

        console.log('📥 [ETAPA2] Dados recebidos:', {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao,
            descricao: descricao ? descricao.substring(0, 80) + '...' : 'N/A'
        });

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Nome do produto é obrigatório para buscar preço',
                dados: {}
            });
        }

        // --- GERAR TERMOS DE BUSCA PADRONIZADOS ---
        const termosBusca = gerarTermosBuscaPadronizados(nome_produto, marca, modelo, descricao);
        const dataAtual = new Date().toISOString().split('T')[0];
        
        // --- PROMPT ANTI-ALUCINAÇÃO (MUITO RIGOROSO) ---
        const promptBuscaPreco = `Você é um especialista em precificação. Busque preços REAIS de produtos NOVOS no mercado brasileiro.

PRODUTO:
Nome: ${nome_produto}
Categoria: ${categoria_depreciacao}
Descrição: ${descricao || 'N/A'}

TERMOS DE BUSCA OBRIGATÓRIOS (use EXATAMENTE estes):
${termosBusca.map((t, i) => (i + 1) + '. "' + t + '"').join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ REGRAS CRÍTICAS - LEIA COM ATENÇÃO - VIOLAÇÕES SERÃO REJEITADAS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. APENAS PREÇOS REAIS ENCONTRADOS VIA GOOGLE SEARCH
   ❌ NÃO invente preços
   ❌ NÃO estime valores
   ❌ NÃO use "preços aproximados" ou "baseado em similares"
   ❌ NÃO complete com chutes se não encontrar o mínimo
   ❌ NÃO use "média de mercado" ou "valor estimado"
   ✅ Se encontrou 2 preços reais, retorne APENAS esses 2
   ✅ HONESTIDADE ABSOLUTA: É melhor retornar FALSE do que inventar

2. MÍNIMO ABSOLUTO: 3 PREÇOS REAIS E VERIFICÁVEIS
   - Se encontrou MENOS de 3 preços reais → "preco_encontrado": false
   - Se encontrou 3+ preços reais → "preco_encontrado": true
   - Não arredonde para cima: 2 preços ≠ 3 preços

3. PRODUTOS NOVOS APENAS (DE FÁBRICA)
   - Ignore produtos usados, seminovos, recondicionados, outlet
   - Apenas produtos novos, lacrados, com nota fiscal

4. FONTES VÁLIDAS NO BRASIL:
   ✅ B2B: Distribuidores industriais, atacado, fornecedores (tipo_fonte: "B2B")
   ✅ B2C: Mercado Livre (só "novo"), Amazon, Magazine Luiza (tipo_fonte: "B2C")
   ❌ Fóruns, classificados, OLX, anúncios particulares
   ❌ Sites internacionais sem conversão adequada

5. CADA PREÇO DEVE OBRIGATORIAMENTE TER:
   - Valor numérico válido em R$ (não "sob consulta")
   - Site/loja ESPECÍFICA (não "Loja X" ou "Fornecedor genérico")
   - Data da oferta em formato YYYY-MM-DD
   - Descrição REAL do produto encontrado
   - URL do produto (quando disponível)

6. VALIDAÇÃO DE PREÇOS:
   - Todos os preços devem estar na mesma ordem de grandeza
   - Se encontrar R$ 100 e R$ 5.000 para o mesmo produto → investigar
   - Produtos equivalentes devem ter preços similares (±50%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 FORMATO DE RESPOSTA (JSON puro, sem markdown, sem crases):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CASO 1 - SE ENCONTROU 3+ PREÇOS REAIS:
{
  "preco_encontrado": true,
  "num_precos_encontrados": 5,
  "termos_busca_utilizados": ["Carrinho Porta-Ferramentas", "carrinho porta-mandris"],
  "coleta_de_precos": [
    {
      "valor": 1250.00,
      "tipo_fonte": "B2B",
      "site": "Ferramentas Industrial SP",
      "data_oferta": "2025-11-28",
      "produto_encontrado": "Carrinho porta-mandris 40 slots metal azul",
      "url": "https://exemplo.com/produto123"
    },
    {
      "valor": 1180.00,
      "tipo_fonte": "B2C",
      "site": "Mercado Livre",
      "data_oferta": "2025-11-27",
      "produto_encontrado": "Carrinho organizador ferramentas 2 prateleiras",
      "url": "https://mercadolivre.com/MLB123"
    }
  ],
  "observacoes": "Encontrados 5 preços reais de carrinhos porta-mandris/ferramentas industriais. Preços consistentes na faixa R$ 1.100-1.400."
}

CASO 2 - SE ENCONTROU MENOS DE 3 PREÇOS REAIS:
{
  "preco_encontrado": false,
  "num_precos_encontrados": 1,
  "motivo": "Encontrado apenas 1 preço real verificável. Produto muito específico (carrinho porta-mandris industrial), poucos fornecedores no mercado brasileiro.",
  "termos_busca_utilizados": ["Carrinho Porta-Ferramentas", "carrinho porta-mandris"],
  "precos_parciais": [
    {
      "valor": 2800.00,
      "site": "WorldTools Brasil",
      "produto_encontrado": "Carrinho porta-cones CNC industrial",
      "observacao": "Único fornecedor encontrado com estoque"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 EXEMPLOS DE ERROS GRAVES - NUNCA FAÇA ISSO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ ERRO 1 - Inventar preços para completar mínimo:
{
  "preco_encontrado": true,
  "coleta_de_precos": [
    {"valor": 800.00, "site": "Mercado Livre"}, ← OK (real)
    {"valor": 900.00, "site": "Estimativa baseada em similares"}, ← INVENTADO!
    {"valor": 950.00, "site": "Valor aproximado"} ← INVENTADO!
  ]
}
CORRETO: Retornar "preco_encontrado": false com 1 preço parcial

❌ ERRO 2 - Usar fontes genéricas:
{
  "coleta_de_precos": [
    {"valor": 1200.00, "site": "Loja X"}, ← Genérico demais
    {"valor": 1300.00, "site": "Fornecedor brasileiro"} ← Inespecífico
  ]
}
CORRETO: Nomes reais: "Anhanguera Ferramentas", "Dutra Máquinas", etc.

❌ ERRO 3 - Incluir produtos usados:
{
  "coleta_de_precos": [
    {"valor": 450.00, "produto_encontrado": "Carrinho usado bom estado"} ← USADO!
  ]
}
CORRETO: Apenas produtos NOVOS

❌ ERRO 4 - Preços muito discrepantes sem justificativa:
{
  "coleta_de_precos": [
    {"valor": 200.00}, ← Muito baixo
    {"valor": 1200.00},
    {"valor": 5000.00} ← Muito alto (provavelmente kit ou erro)
  ]
}
CORRETO: Investigar outliers, retornar apenas preços consistentes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ LEMBRETE FINAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- QUALIDADE > QUANTIDADE: 3 preços REAIS > 10 preços INVENTADOS
- HONESTIDADE > COMPLETUDE: Melhor "não encontrado" que preço falso
- VERIFICABILIDADE: Todo preço deve poder ser conferido no Google
- Data de hoje: ${dataAtual}
- Retorne APENAS JSON puro (sem markdown)`;

        console.log('🤖 [ETAPA2] Inicializando Gemini com Google Search...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.1  // Mínimo para determinismo
            }
        });

        console.log('📤 [ETAPA2] Enviando requisição...');

        const result = await model.generateContent(promptBuscaPreco);
        const response = result.response;
        const text = response.text();

        console.log('📥 [ETAPA2] Resposta BRUTA:');
        console.log('═══════════════════════════════════════');
        console.log(text);
        console.log('═══════════════════════════════════════');

        let resultadoBusca;

        try {
            let jsonText = text.trim();
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
                console.log('🎯 [ETAPA2] JSON isolado');
            }

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado');
            
        } catch (parseError) {
            console.error('❌ [ETAPA2] ERRO ao parsear JSON:', parseError.message);
            console.error('📋 [ETAPA2] Texto:', text);
            throw new Error('Resposta não é JSON válido: ' + parseError.message);
        }

        // --- VALIDAÇÃO ANTI-ALUCINAÇÃO ---
        if (resultadoBusca.preco_encontrado) {
            console.log('🔍 [VALIDAÇÃO] Verificando se LLM inventou preços...');
            
            const precosValidos = resultadoBusca.coleta_de_precos.filter(p => {
                const siteValido = p.site && 
                    p.site !== 'N/A' &&
                    !p.site.toLowerCase().includes('estimat') &&
                    !p.site.toLowerCase().includes('aproxim') &&
                    !p.site.toLowerCase().includes('baseado') &&
                    !p.site.toLowerCase().includes('média') &&
                    !p.site.toLowerCase().includes('loja x') &&
                    !p.site.toLowerCase().includes('fornecedor x');
                
                const valorValido = p.valor && p.valor > 0;
                
                return siteValido && valorValido;
            });
            
            console.log('📊 [VALIDAÇÃO] Preços informados: ' + resultadoBusca.coleta_de_precos.length);
            console.log('📊 [VALIDAÇÃO] Preços válidos: ' + precosValidos.length);
            
            if (precosValidos.length < 3) {
                console.log('⚠️ [VALIDAÇÃO] LLM retornou menos de 3 preços REAIS!');
                console.log('📋 [VALIDAÇÃO] Preços recebidos:', JSON.stringify(resultadoBusca.coleta_de_precos, null, 2));
                
                // Forçar como "não encontrado"
                resultadoBusca.preco_encontrado = false;
                resultadoBusca.num_precos_encontrados = precosValidos.length;
                resultadoBusca.motivo = 'Apenas ' + precosValidos.length + ' preço(s) real(is) encontrado(s). Mínimo necessário: 3 preços verificáveis.';
                resultadoBusca.precos_parciais = precosValidos;
                
                console.log('🔄 [VALIDAÇÃO] Convertido para preco_encontrado=false');
            } else {
                // Atualizar com apenas os preços válidos
                resultadoBusca.coleta_de_precos = precosValidos;
                resultadoBusca.num_precos_encontrados = precosValidos.length;
                console.log('✅ [VALIDAÇÃO] ' + precosValidos.length + ' preços reais confirmados');
            }
        }

        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado ou insuficiente');
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Não foi possível encontrar preços suficientes: ' + (resultadoBusca.motivo || 'Produto muito específico') + '. Insira valor manualmente.',
                dados: { 
                    preco_encontrado: false,
                    num_precos_encontrados: resultadoBusca.num_precos_encontrados || 0,
                    termos_tentados: resultadoBusca.termos_busca_utilizados || [],
                    precos_parciais: resultadoBusca.precos_parciais || []
                }
            });
        }

        // --- CALCULAR MÉDIA EXPONENCIAL ---
        console.log('📊 [ETAPA2] Calculando média exponencial...');
        
        const resultadoEMA = calcularMediaExponencial(resultadoBusca.coleta_de_precos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Erro ao processar preços: ' + resultadoEMA.motivo,
                dados: { preco_encontrado: false }
            });
        }

        // --- VALIDAÇÃO ESTATÍSTICA (MEDIANA SE ALTA VARIAÇÃO) ---
        let valorMercado = resultadoEMA.valor_mercado;
        let metodoUtilizado = 'Média Exponencial Ponderada';
        const { coeficiente_variacao } = resultadoEMA.estatisticas;

        if (coeficiente_variacao > 40) {
            console.log('⚠️ [VALIDAÇÃO] Alta variação detectada: ' + coeficiente_variacao.toFixed(1) + '%');
            console.log('🔄 [VALIDAÇÃO] Alternando para MEDIANA (mais robusta contra outliers)');
            
            const valores = resultadoEMA.detalhes_precos
                .map(p => p.valor)
                .sort((a, b) => a - b);
            
            const mediana = valores[Math.floor(valores.length / 2)];
            
            console.log('📊 [VALIDAÇÃO] Média EMA: R$ ' + valorMercado.toFixed(2));
            console.log('📊 [VALIDAÇÃO] Mediana: R$ ' + mediana.toFixed(2));
            console.log('📊 [VALIDAÇÃO] Diferença: R$ ' + Math.abs(valorMercado - mediana).toFixed(2) + ' (' + ((Math.abs(valorMercado - mediana) / valorMercado) * 100).toFixed(1) + '%)');
            
            valorMercado = mediana;
            metodoUtilizado = 'Mediana (alta variação de preços detectada)';
        } else {
            console.log('✅ [VALIDAÇÃO] Variação aceitável: ' + coeficiente_variacao.toFixed(1) + '%');
        }

        console.log('✅ [ETAPA2] Valor de mercado final: R$ ' + valorMercado.toFixed(2));

        // --- APLICAR DEPRECIAÇÃO ---
        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';

        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        console.log('📉 [ETAPA2] Fator: ' + fatorDepreciacao + ' | Valor atual: R$ ' + valorAtual.toFixed(2));

        const dadosCompletos = {
            numero_patrimonio: numero_patrimonio,
            nome_produto: nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            valores_estimados: {
                valor_mercado_estimado: parseFloat(valorMercado.toFixed(2)),
                valor_atual_estimado: parseFloat(valorAtual.toFixed(2)),
                fator_depreciacao: fatorDepreciacao,
                percentual_depreciacao: ((1 - fatorDepreciacao) * 100).toFixed(0) + '%',
                fonte_preco: metodoUtilizado,
                metodo_calculo: 'Busca rigorosa Google → Validação anti-alucinação → ' + metodoUtilizado + ' → Depreciação',
                score_confianca: resultadoEMA.estatisticas.score_confianca,
                observacoes: (resultadoBusca.observacoes || '') + (coeficiente_variacao > 40 ? ' | Alta variação (' + coeficiente_variacao.toFixed(0) + '%), usada mediana.' : '')
            },
            analise_estatistica: resultadoEMA.estatisticas,
            precos_coletados: resultadoEMA.detalhes_precos,
            estrategia_busca: {
                termos_padronizados: termosBusca,
                termos_utilizados: resultadoBusca.termos_busca_utilizados || [],
                num_precos_reais_encontrados: resultadoBusca.num_precos_encontrados || resultadoEMA.estatisticas.num_precos_coletados,
                produtos_equivalentes_aceitos: true,
                validacao_anti_alucinacao: true
            },
            metadados: {
                data_busca: new Date().toISOString(),
                modelo_ia: MODEL,
                temperatura: 0.1,
                estrategia: 'Busca Rigorosa (anti-alucinação) → Validação → Estatística → Depreciação'
            }
        };

        console.log('✅ [ETAPA2] Processamento concluído!');
        console.log('💰 [ETAPA2] Mercado: R$ ' + valorMercado.toFixed(2) + ' | Atual: R$ ' + valorAtual.toFixed(2));
        console.log('📊 [ETAPA2] Preços reais: ' + resultadoBusca.num_precos_encontrados + ' | Confiança: ' + resultadoEMA.estatisticas.score_confianca.toFixed(0) + '%');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores calculados com ' + resultadoBusca.num_precos_encontrados + ' preços reais (confiança: ' + resultadoEMA.estatisticas.score_confianca.toFixed(0) + '%)'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);
        console.error('❌ [ETAPA2] Stack:', error.stack);

        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao buscar preço: ' + error.message,
            dados: { preco_encontrado: false }
        });
    }
};