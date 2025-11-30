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

// =========================================================================
// ❌ CÓDIGO DE CONTINGÊNCIA (TODO: IMPLEMENTAR COM GEMINI PRO)
//    - Este prompt deve ser usado APENAS se o PROMPT_BUSCA_PRECO falhar.
// =========================================================================

/*
const PROMPT_BUSCA_PRECO_PRO_CONTINGENCIA = (dados) => `Você é um Extrator de Preços Sênior, designado para garantir a precificação de um ativo industrial ou de baixa liquidez onde modelos de IA mais baratos falharam. Colete MÍNIMO 3 preços NOVOS no Brasil.

PRODUTO DE ALTO VALOR E BAIXA TRANSPARÊNCIA:
Nome: ${dados.nome_produto}
Marca: ${dados.marca || 'N/A'}
Modelo: ${dados.modelo || 'N/A'}
Specs: ${dados.especificacoes || 'N/A'}

***ESTRATÉGIA DE BUSCA (GEMINI PRO - PRIORIDADE NO RESULTADO):***

1.  **EXECUTE BUSCA POR COMPONENTES E INFERÊNCIA:** Formule consultas que busquem o preço do item **EXATO** E **também** o **"preço de catálogo"** ou **"preço de tabela"** do fabricante/distribuidor. Use sua capacidade analítica para inferir um valor de referência a partir de documentos B2B.

2.  **ACEITAÇÃO FLEXÍVEL DE EQUIVALENTES (Regra de Sobrevivência):**
    a.  **Foco em Especificação Principal:** Aceite a diferença de tipo funcional (Ex: Autotransformador em vez de Isolador) **SE** a Especificação Técnica PRINCIPAL (kVA, HP, etc.) estiver dentro de $\pm5\%$ e o preço for o mais razoável e representativo para a classe de potência.
    b.  **Contingência de Peso/Dimensões:** A diferença em especificações secundárias (como peso) DEVE ser usada para classificar o *tipo_match* como 'Equivalente' (Peso 1.0), mas **NÃO** deve ser uma causa para rejeitar o preço, a menos que a Especificação Principal também falhe.

3.  **HIERARQUIA DE FONTES:** Priorize preço verificável, mesmo que B2C, sobre cotação B2B não transparente.

4.  **REJEIÇÃO CONDICIONAL:** Se um preço for encontrado, mas tiver discrepância funcional/de peso, **USE-O** e classifique-o como 'Equivalente' (Peso 1.0). Rejeite APENAS se o preço estiver fora do range esperado do mercado.

***MÍNIMO:*** 3 preços REAIS ou INFERIDOS.

JSON (sem markdown): (Use o mesmo formato de saída da Etapa 2)
{
  "preco_encontrado": true,
  "termo_busca_utilizado": "termos múltiplos utilizados",
  "estrategia": "Contingência PRO: Inferência de Catálogo B2B + Equivalente Funcional Aceito",
  "num_precos_encontrados": 5,
  "precos_coletados": [
    // ... (lista de preços)
  ]
}
`;
*/

/*
const PROMPT_BUSCA_PRECO = (dados) => `Você é um extrator de preços. Colete MÍNIMO 3 preços NOVOS no Brasil.

PRODUTO:
Nome: ${dados.nome_produto}
Marca: ${dados.marca || 'N/A'}
Modelo: ${dados.modelo || 'N/A'}
Specs: ${dados.especificacoes || 'N/A'}

***ESTRATÉGIA DE BUSCA (UMA ÚNICA QUERY):***

1. ***ANALISE OS DADOS*** e construa o termo de busca MAIS EFICAZ:
   - Se tem Marca + Modelo: use ambos
   - Marca/Modelo = N/A: foque Specs técnicas
   - Inclua sinônimos e variações do produto (e termos como "preço de tabela" ou "preço de catálogo" para B2B).

2. ***EXECUTE BUSCA SIMULTÂNEA*** (modelo exato + similares):
   - Modelo EXATO (prioridade máxima)
   - SIMILARES/EQUIVALENTES (±5% specs principais)
   - Exemplos OR:
     * "Gerador Cummins C22D5" OR "gerador 20kVA 22kVA diesel"

3. ***PRIORIDADE DE FONTES:***
   - MÁXIMA: B2B Brasil (atacado/distribuidores)
   - MÉDIA: B2C Brasil (Mercado Livre/Amazon/Magazine Luiza)
   - BAIXA: Internacional (converter moeda + 20% impostos)

4. ***REGRA DE FAIL-FAST E TRANSIÇÃO (NOVO):***
   - Se a busca na Prioridade MÁXIMA (B2B) retornar apenas resultados não verificáveis ('Solicitar Orçamento', 'Cotação'), a IA DEVE **ignorar esses resultados imediatamente** e priorizar a coleta dos preços verificáveis das fontes de Prioridade MÉDIA (B2C) e BAIXA. **NÃO BLOQUEIE A BUSCA** em fontes opacas.

***REGRAS CRÍTICAS (GENÉRICAS E FINAIS):***
- Produtos NOVOS (ignore usados/seminovos)
- **Equivalentes de Especificação Chave:** A tolerância de **±5%** DEVE ser aplicada à **Especificação Técnica PRINCIPAL** do produto (ex: kVA, HP, Polegadas).
- **Contingência de Especificações Secundárias:** Diferenças em especificações secundárias (tensão, frequência) devem ser aceitas se a Especificação Técnica PRINCIPAL estiver dentro da tolerância de $\pm5\%$.
- ***NÃO*** aceite kits/promoções/bundles
- ***MÍNIMO:*** 3 preços REAIS verificáveis

***PRIORIZAÇÃO (peso interno):***
1. Match EXATO (marca+modelo) = 2.0
2. Match PARCIAL (marca OU modelo+specs) = 1.5
3. Equivalente (specs $\pm5\%$) = 1.0

JSON (sem markdown):
{
  "preco_encontrado": true,
  "termo_busca_utilizado": "termo exato usado",
  "estrategia": "Match Exato ou Equivalente: [Especificação chave e valor usado]",
  "num_precos_encontrados": 5,
  "precos_coletados": [
    {
      "valor": 15999.90,
      "fonte": "Distribuidora XYZ - B2B",
      "tipo_match": "Exato",
      "produto": "Gerador Cummins C22D5 22kVA"
    }
  ]
}

Se < 3: {"preco_encontrada": false, "motivo": "explicação", "termo_busca_utilizado": "termo tentado", "num_precos_encontrados": 1}`;
*/

const PROMPT_BUSCA_PRECO = (dados) => `Você é um assistente de pesquisa de preços. Seu objetivo é encontrar preços REAIS e VERIFICÁVEIS de produtos NOVOS no mercado brasileiro, com prioridade máxima no Valor de Reposição.

PRODUTO A PESQUISAR:
- Nome: ${dados.nome_produto}
- Marca: ${dados.marca || 'Não especificada'}
- Modelo: ${dados.modelo || 'Não especificado'}
- Especificações: ${dados.especificacoes || 'Não especificadas'}

INSTRUÇÕES DE BUSCA:

1. MONTE O TERMO DE BUSCA (UMA ÚNICA QUERY):
   - Use Marca + Modelo se disponíveis
   - Se ausentes, use Nome + palavras-chave das especificações
   - Inclua sinônimos e variações comuns do produto
   - Exemplo: "Gerador Cummins C22D5" OU "gerador diesel 22kVA"

2. HIERARQUIA DE PREÇOS NOVOS (VALOR DE REPOSIÇÃO):

   - PRIORIDADE 1: Modelo exato (marca + modelo idênticos)
   
   - PRIORIDADE 2 (Foco em Obsoletos): **Equivalente de Reposição**. Procure ativamente o **Modelo Sucessor** ou um item de produção atual com as mesmas Especificações Principais (tolerância de até 10%). Este é o preço de reposição.
   
   - PRIORIDADE 3: Produtos da mesma categoria com especificações próximas, para validar o range de preço.

3. FONTES ACEITAS (qualquer uma é válida):
   - Lojas online brasileiras (Mercado Livre, Amazon, Magazine Luiza, etc)
   - Distribuidores e atacadistas B2B
   - E-commerces especializados
   - IGNORE fontes que só mostram "Solicitar Orçamento" sem preço

4. REGRAS IMPORTANTES:
   - **APENAS PRODUTOS NOVOS**. Nunca aceite preços de usados ou seminovos.
   - Não aceitar kits ou combos.
   - Preços devem estar visíveis (não apenas "consulte").
   - A falta de preço para o Modelo Exato DEVE forçar a busca de preços para o Equivalente de Reposição (Prioridade 2).

5. EQUIVALÊNCIA DE REPOSIÇÃO (Match 1.0):
   - Para especificação principal (kVA, HP, polegadas, etc): até 10% de diferença é aceitável.
   - Diferenças em specs secundárias (voltagem, peso, frequência) podem ser ignoradas se a spec principal for compatível, pois o objetivo é o valor do substituto.

6. MÍNIMO:
   - Se encontrar menos de 3 preços NOVOS (Exato ou Equivalente de Reposição), retorne os que encontrar (não falhe).

FORMATO DE RESPOSTA (JSON puro, sem markdown):

Se encontrou preços:
{
  "preco_encontrado": true,
  "termo_busca_utilizado": "termo exato que você usou na busca",
  "estrategia": "Exato/Equivalente de Reposição - explicação breve",
  "num_precos_encontrados": 4,
  "precos_coletados": [
    {
      "valor": 15999.90,
      "fonte": "Nome da loja/site",
      "tipo_match": "Equivalente", // Agora deve ser "Equivalente" ou "Exato"
      "produto": "Nome completo do produto encontrado (Sucessor de Linha)",
      "url": "URL se disponível"
    }
  ]
}

Se NÃO encontrou preços suficientes:
{
  "preco_encontrado": false,
  "motivo": "explicação do que tentou e por que não encontrou",
  "termo_busca_utilizado": "termo que usou",
  "num_precos_encontrados": 0,
  "precos_coletados": []
}`


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

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.1 }
        });

        const result = await model.generateContent(promptBusca);
        const text = result.response.text();

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