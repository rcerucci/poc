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

    console.log('🔍 [ETAPA2] Iniciando busca de preços B2B...');

    try {
        const {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao,
            numero_patrimonio
        } = req.body;

        console.log('📥 [ETAPA2] Dados recebidos:', {
            nome_produto,
            modelo,
            marca,
            estado_conservacao,
            categoria_depreciacao
        });

        if (!nome_produto || nome_produto === 'N/A') {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Nome do produto é obrigatório para buscar preço',
                dados: {}
            });
        }

        const queryBusca = [nome_produto, marca, modelo]
            .filter(x => x && x !== 'N/A')
            .join(' ');

        console.log('🔎 [ETAPA2] Query de busca:', queryBusca);

        const promptBuscaPreco = `Você tem acesso à ferramenta Google Search. Encontre o preço de AQUISIÇÃO CORPORATIVA (B2B) NOVO para: ${nome_produto} ${marca || ''} ${modelo || ''}.

        CONTEXTO: Sistema de gestão patrimonial. Preço deve refletir custo B2B que EMPRESA pagaria.
        CATEGORIA: ${categoria_depreciacao}

        ESTRATÉGIA (nesta ordem):
        1. PRIORIDADE: Fornecedores B2B/Corporativos BR, Fabricantes Oficiais, Atacadistas. Use R$.
        2. SEGUNDO: Varejo B2C BR (Mercado Livre, Amazon). Use R$.
        3. TERCEIRO: Internacional B2B (Alibaba, Fabricantes). Converta (1 USD=5.00, 1 EUR=5.40) e ADICIONE 20% (importação).
        4. FALLBACK: Estime com produto SIMILAR B2B da mesma categoria.

        FORMATO (APENAS JSON):
        {
        "preco_encontrado": true,
        "valor_mercado": 15000.00,
        "fonte": "Nome Fornecedor/Distribuidor",
        "observacoes": "Tipo: [B2B/B2C/Estimativa]. Origem: [BR/Internacional]. Detalhes.",
        "tipo_fonte": "B2B"
        }
        OU
        {
        "preco_encontrado": false,
        "motivo": "explicação breve"
        }

        REGRAS: Priorize B2B. Use todas estratégias antes de retornar false. valor_mercado = número puro sem símbolos. Retorne APENAS JSON.`;


        console.log('🤖 [ETAPA2] Inicializando modelo com Google Search (foco B2B)...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.3
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
            
            // 💡 Isola o bloco JSON para lidar com texto antes/depois
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
                console.log('🎯 [ETAPA2] JSON isolado do texto');
            }
            
            jsonText = jsonText.trim();
            console.log('🧹 [ETAPA2] Texto limpo para parse:', jsonText);

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado:', JSON.stringify(resultadoBusca, null, 2));
            
            // Validar e limpar valor_mercado
            if (resultadoBusca.preco_encontrado && resultadoBusca.valor_mercado) {
                // Se o valor_mercado é uma string, limpe-o
                if (typeof resultadoBusca.valor_mercado === 'string') {
                    console.log('🧹 [ETAPA2] Limpando valor_mercado (string):', resultadoBusca.valor_mercado);
                    resultadoBusca.valor_mercado = resultadoBusca.valor_mercado
                        .replace(/[^\d,\.]/g, '') // Remove tudo exceto dígitos, vírgulas e pontos
                        .replace(',', '.');        // Substitui vírgula por ponto (formato brasileiro)
                    console.log('✨ [ETAPA2] Valor limpo:', resultadoBusca.valor_mercado);
                }
            }
            
        } catch (parseError) {
            console.error('❌ [ETAPA2] ERRO ao parsear JSON:', parseError.message);
            console.error('📋 [ETAPA2] Texto original:', text);
            throw new Error(`Resposta não é um JSON válido: ${parseError.message}`);
        }

        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado após todas as estratégias');
            return res.status(200).json({
                status: 'Falha',
                mensagem: `Não foi possível encontrar preço B2B: ${resultadoBusca.motivo || 'Produto muito específico'}. Insira valor manualmente.`,
                dados: { preco_encontrado: false }
            });
        }

        console.log('💰 [ETAPA2] Preço encontrado:', resultadoBusca.valor_mercado);
        console.log('📊 [ETAPA2] Tipo de fonte:', resultadoBusca.tipo_fonte || 'Não especificado');

        // Converter para número e validar
        const valorMercado = parseFloat(resultadoBusca.valor_mercado);

        if (isNaN(valorMercado) || valorMercado <= 0) {
            console.error('❌ [ETAPA2] Valor inválido:', resultadoBusca.valor_mercado);
            throw new Error('Valor de mercado retornado pela IA não é um número válido.');
        }

        console.log('✅ [ETAPA2] Valor validado:', valorMercado);

        const estado = estado_conservacao || 'Bom';
        const categoria = categoria_depreciacao || 'Outros';

        const fatorDepreciacao = FATORES_DEPRECIACAO[estado]?.[categoria] || 0.7;
        const valorAtual = valorMercado * fatorDepreciacao;

        console.log('📉 [ETAPA2] Depreciação:', fatorDepreciacao, 'Valor atual:', valorAtual);

        const dadosCompletos = {
            numero_patrimonio,
            nome_produto,
            modelo: modelo || 'N/A',
            marca: marca || 'N/A',
            estado_conservacao: estado,
            categoria_depreciacao: categoria,
            valores_estimados: {
                valor_mercado_estimado: parseFloat(valorMercado.toFixed(2)),
                valor_atual_estimado: parseFloat(valorAtual.toFixed(2)),
                fator_depreciacao: fatorDepreciacao,
                percentual_depreciacao: `${((1 - fatorDepreciacao) * 100).toFixed(0)}%`,
                fonte_preco: resultadoBusca.fonte || 'Google Search B2B',
                tipo_fonte: resultadoBusca.tipo_fonte || 'Não especificado',
                observacoes: resultadoBusca.observacoes || 'Valor estimado para aquisição corporativa'
            },
            metadados: {
                data_busca: new Date().toISOString(),
                query_utilizada: queryBusca,
                modelo_ia: MODEL,
                estrategia: 'Busca B2B prioritária com fallback B2C'
            }
        };

        console.log('✅ [ETAPA2] Processamento concluído com sucesso!');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Valores B2B encontrados via busca corporativa'
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