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

// --- Função para Gerar Termos de Busca Determinísticos ---
function gerarTermosBuscaPadronizados(nome_produto, marca, modelo, descricao) {
    console.log('🔍 [BUSCA] Gerando termos de busca padronizados...');
    
    const termos = [];
    
    // Termo 1: Nome do produto + marca (se houver)
    if (marca && marca !== 'N/A') {
        termos.push(nome_produto + ' ' + marca);
    } else {
        termos.push(nome_produto);
    }
    
    // Termo 2: Nome do produto + modelo (se houver)
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

        // --- GERAR TERMOS DE BUSCA PADRONIZADOS ---
        const termosBusca = gerarTermosBuscaPadronizados(nome_produto, marca, modelo, descricao);
        const dataAtual = new Date().toISOString().split('T')[0];
        
        // --- PROMPT COM TERMOS FIXOS (MAIS DETERMINÍSTICO) ---
        const promptBuscaPreco = `Você é um especialista em precificação de ativos. Busque preços de mercado de produtos NOVOS no Brasil.

PRODUTO:
Nome: ${nome_produto}
Categoria: ${categoria_depreciacao}

TERMOS DE BUSCA OBRIGATÓRIOS (use EXATAMENTE estes termos):
${termosBusca.map((t, i) => (i + 1) + '. "' + t + '"').join('\n')}

INSTRUÇÕES CRÍTICAS:

1. Use APENAS os termos de busca acima (não invente novos termos)
2. Para cada termo, busque produtos NOVOS (nunca usados)
3. Aceite produtos EQUIVALENTES (mesma função/categoria)
4. IGNORE cores, tamanhos específicos, acabamentos
5. Priorize sites B2B (atacado/distribuidores)

FONTES VÁLIDAS (Brasil):
- B2B: Atacado, distribuidores, fornecedores industriais (tipo_fonte: "B2B")
- B2C: Mercado Livre, Amazon, Magazine Luiza (tipo_fonte: "B2C")

REGRAS DE PREÇOS:
- Mínimo 5 preços, máximo 10 preços
- Valores em R$ (reais)
- Preço UNITÁRIO (não kits)
- Data: YYYY-MM-DD (hoje: ${dataAtual})
- Produtos NOVOS apenas

FORMATO DE RESPOSTA (JSON puro, sem markdown):
{
  "preco_encontrado": true,
  "termos_busca_utilizados": ["termo exato 1", "termo exato 2"],
  "coleta_de_precos": [
    {
      "valor": 450.00,
      "tipo_fonte": "B2B",
      "site": "Nome da Loja",
      "data_oferta": "2025-11-28",
      "produto_encontrado": "Descrição produto"
    }
  ],
  "observacoes": "Metodologia de busca utilizada"
}

Se não encontrar:
{
  "preco_encontrado": false,
  "motivo": "Explicação",
  "termos_busca_utilizados": ["termos tentados"]
}

IMPORTANTE:
- Use os MESMOS termos de busca sempre (para consistência)
- Retorne APENAS JSON
- Seja DETERMINÍSTICO (mesma busca = mesmos resultados aproximados)`;

        console.log('🤖 [ETAPA2] Inicializando modelo Gemini com Google Search...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.1  // ⬇️ TEMPERATURA MÍNIMA para mais determinismo
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

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado com sucesso');
            
            if (resultadoBusca.termos_busca_utilizados) {
                console.log('🔍 [ETAPA2] Termos utilizados:', resultadoBusca.termos_busca_utilizados);
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
                mensagem: 'Não foi possível encontrar preço: ' + (resultadoBusca.motivo || 'Produto não encontrado') + '. Insira manualmente.',
                dados: { 
                    preco_encontrado: false,
                    termos_tentados: resultadoBusca.termos_busca_utilizados || []
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

        const valorMercado = resultadoEMA.valor_mercado;
        console.log('✅ [ETAPA2] Valor de mercado: R$ ' + valorMercado);

        // --- APLICAR DEPRECIAÇÃO ---
        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';

        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        console.log('📉 [ETAPA2] Fator depreciação: ' + fatorDepreciacao + ' | Valor atual: R$ ' + valorAtual.toFixed(2));

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
                fonte_preco: 'Média Exponencial Ponderada',
                metodo_calculo: 'Busca padronizada + EMA com IQR + Pesos B2B/recência',
                score_confianca: resultadoEMA.estatisticas.score_confianca,
                observacoes: resultadoBusca.observacoes || 'Calculado via média exponencial'
            },
            analise_estatistica: resultadoEMA.estatisticas,
            precos_coletados: resultadoEMA.detalhes_precos,
            estrategia_busca: {
                termos_padronizados: termosBusca,
                termos_utilizados: resultadoBusca.termos_busca_utilizados || [],
                produtos_equivalentes_aceitos: true
            },
            metadados: {
                data_busca: new Date().toISOString(),
                modelo_ia: MODEL,
                temperatura: 0.1,
                estrategia: 'Busca Padronizada → EMA → Depreciação'
            }
        };

        console.log('✅ [ETAPA2] Concluído! Mercado: R$ ' + valorMercado + ' | Atual: R$ ' + valorAtual.toFixed(2));

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Preço calculado (confiança: ' + resultadoEMA.estatisticas.score_confianca.toFixed(0) + '%)'
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