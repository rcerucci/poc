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

    console.log('🔍 [ETAPA2] Iniciando busca inteligente de preços...');

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

        const dataAtual = new Date().toISOString().split('T')[0];
        
        // --- PROMPT INTELIGENTE (LLM FAZ TODA A ANÁLISE) ---
        const promptBuscaPreco = `Você é um especialista em precificação de ativos. Analise os dados abaixo e busque preços de mercado de produtos NOVOS equivalentes.

DADOS DO PRODUTO:
Nome: ${nome_produto}
Marca: ${marca || 'N/A'}
Modelo: ${modelo || 'N/A'}
Categoria: ${categoria_depreciacao}
Descrição: ${descricao || 'N/A'}

SUA TAREFA:

1. ANALISAR a descrição e identificar:
   - Função principal do produto
   - Características técnicas essenciais
   - Sinônimos ou nomes alternativos comuns no mercado
   - Termos de busca genéricos mais eficazes

2. BUSCAR preços usando estratégia inteligente:
   - Use termos GENÉRICOS e FUNCIONAIS (ignore cores, tamanhos, acabamentos estéticos)
   - Exemplo: "Carrinho Porta-Ferramentas azul" deve buscar "carrinho auxiliar rodízios metal", "carrinho porta mandris", "carrinho ferramentas industrial"
   - Aceite produtos EQUIVALENTES da mesma categoria e função
   - Priorize especificações técnicas, não aparência

3. FONTES (em ordem de prioridade):
   - B2B Brasil (atacado, distribuidores) - tipo_fonte: "B2B"
   - B2C Brasil (Amazon, Mercado Livre, Magazine Luiza) - tipo_fonte: "B2C"
   - Internacional (converter: USD x 5.0, EUR x 5.4, adicionar +20% importação) - tipo_fonte: "Internacional"

4. CRITÉRIOS OBRIGATÓRIOS:
   - APENAS produtos NOVOS (de fábrica, nunca usados)
   - Mínimo 3 preços, idealmente 5-10 preços
   - Produtos equivalentes são ACEITOS (mesma função/categoria)
   - Valores SEMPRE em R$ (reais brasileiros)
   - Data no formato YYYY-MM-DD (data atual: ${dataAtual})
   - Preço UNITÁRIO (não pacotes/kits)

FORMATO DE RESPOSTA - RETORNE APENAS JSON PURO (sem crases, sem markdown):
{
  "preco_encontrado": true,
  "termos_busca_utilizados": ["termo1", "termo2", "termo3"],
  "coleta_de_precos": [
    {
      "valor": 450.00,
      "tipo_fonte": "B2B",
      "site": "Nome do Fornecedor ou Loja",
      "data_oferta": "2025-11-28",
      "produto_encontrado": "Descrição exata do produto encontrado"
    }
  ],
  "observacoes": "Estratégia de busca utilizada e observações relevantes"
}

Se NÃO encontrar preços suficientes:
{
  "preco_encontrado": false,
  "motivo": "Explicação detalhada do motivo",
  "termos_busca_utilizados": ["termos que você tentou"]
}

IMPORTANTE: Retorne APENAS o JSON, sem texto adicional antes ou depois, sem crases de markdown.`;

        console.log('🤖 [ETAPA2] Inicializando modelo Gemini com Google Search...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.3
                // ❌ REMOVIDO: responseMimeType (incompatível com tools)
            }
        });

        console.log('📤 [ETAPA2] Enviando requisição para Gemini...');

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
                console.log('🎯 [ETAPA2] JSON isolado do texto');
            }
            
            jsonText = jsonText.trim();
            console.log('🧹 [ETAPA2] Texto limpo para parse');

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado com sucesso');
            
            if (resultadoBusca.termos_busca_utilizados) {
                console.log('🔍 [ETAPA2] Termos de busca utilizados:', resultadoBusca.termos_busca_utilizados);
            }
            
        } catch (parseError) {
            console.error('❌ [ETAPA2] ERRO ao parsear JSON:', parseError.message);
            console.error('📋 [ETAPA2] Texto original:', text);
            throw new Error('Resposta não é um JSON válido: ' + parseError.message);
        }

        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado');
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Não foi possível encontrar preço de mercado: ' + (resultadoBusca.motivo || 'Produto muito específico') + '. Insira valor manualmente.',
                dados: { 
                    preco_encontrado: false,
                    termos_tentados: resultadoBusca.termos_busca_utilizados || []
                }
            });
        }

        // --- CALCULAR MÉDIA EXPONENCIAL ---
        console.log('📊 [ETAPA2] Calculando média exponencial dos preços coletados...');
        
        const resultadoEMA = calcularMediaExponencial(resultadoBusca.coleta_de_precos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: 'Erro ao processar preços: ' + resultadoEMA.motivo,
                dados: { preco_encontrado: false }
            });
        }

        const valorMercado = resultadoEMA.valor_mercado;
        console.log('✅ [ETAPA2] Valor de mercado (EMA):', valorMercado);

        // --- APLICAR DEPRECIAÇÃO ---
        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';

        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        console.log('📉 [ETAPA2] Depreciação:', fatorDepreciacao, '| Valor atual:', valorAtual);

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
                fonte_preco: 'Média Exponencial Ponderada (Busca Inteligente)',
                metodo_calculo: 'EMA com filtro IQR, pesos B2B/recência e busca por equivalentes',
                score_confianca: resultadoEMA.estatisticas.score_confianca,
                observacoes: resultadoBusca.observacoes || 'Calculado via média exponencial de múltiplas fontes'
            },
            analise_estatistica: resultadoEMA.estatisticas,
            precos_coletados: resultadoEMA.detalhes_precos,
            estrategia_busca: {
                termos_utilizados: resultadoBusca.termos_busca_utilizados || [],
                produtos_equivalentes_aceitos: true
            },
            metadados: {
                data_busca: new Date().toISOString(),
                modelo_ia: MODEL,
                estrategia: 'Busca Inteligente (LLM) → Média Exponencial → Depreciação'
            }
        };

        console.log('✅ [ETAPA2] Processamento concluído com sucesso!');
        console.log('💰 [ETAPA2] Valor mercado: R$ ' + valorMercado + ' | Valor atual: R$ ' + valorAtual.toFixed(2));

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores calculados via busca inteligente e média exponencial (confiança: ' + resultadoEMA.estatisticas.score_confianca.toFixed(0) + '%)'
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