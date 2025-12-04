const { GoogleGenerativeAI } = require('@google/generative-ai');

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite';
const genAI = new GoogleGenerativeAI(API_KEY);

// =============================================================================
// RESOLVER REDIRECTS
// =============================================================================

async function resolverRedirect(url) {
    if (!url.includes('vertexaisearch.cloud.google.com') && 
        !url.includes('google.com/url')) {
        return url;
    }
    
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            timeout: 5000
        });
        return response.url;
    } catch (error) {
        return url;
    }
}

// =============================================================================
// BUSCAR COM GROUNDING (ETAPA 1 - MARKDOWN)
// =============================================================================

async function buscarComGrounding(termo, produtoOriginal) {
    console.log('🔍 [GROUNDING] Termo:', termo);
    
    if (!API_KEY) {
        throw new Error('API Key não configurada');
    }
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        });
        
        const prompt = `Busque produtos para: ${termo}

PRODUTO ORIGINAL:
Nome: ${produtoOriginal.nome_produto}
Marca: ${produtoOriginal.marca}
Modelo: ${produtoOriginal.modelo}
Especificações: ${produtoOriginal.especificacoes}

OBJETIVO: Encontre produtos COM PREÇOS em Reais (R$).

Retorne em formato MARKDOWN os produtos encontrados.
Para cada produto inclua:
1. Nome completo do produto
2. Classificação: "MATCH" ou "SIMILAR"
3. **PREÇO** (OBRIGATÓRIO - busque em snippets, títulos, descrições)
   - Se tiver preço à vista, use esse
   - Se tiver apenas parcelado, calcule o total
   - Se tiver "De R$ X por R$ Y", use o menor (R$ Y)
   - SEMPRE tente encontrar algum valor em R$
4. Loja
5. Link COMPLETO do produto

CRITÉRIOS DE CLASSIFICAÇÃO:
- MATCH = Produto da MESMA MARCA e MESMA ESPECIFICAÇÃO PRINCIPAL
  Exemplo: Se procura "Notebook Dell Inspiron i5 8GB", então "Notebook Dell Inspiron i5 8GB" = MATCH
  (Mesmo que seja 15" ou 14", se for Dell Inspiron i5 8GB é MATCH)

- SIMILAR = Produto de marca diferente OU especificação diferente
  Exemplo: "Notebook HP i5 8GB" = SIMILAR (marca diferente)
  Exemplo: "Notebook Dell Inspiron i7 8GB" = SIMILAR (processador diferente)

IMPORTANTE: 
- Priorize produtos COM PREÇO
- Se um site não mostrar preço no snippet, tente outro
- Retorne MÁXIMO 10 produtos
- Use listas numeradas e SEMPRE inclua links clicáveis`;
        
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }]
        });
        
        const response = result.response;
        const textoMarkdown = response.text();
        
        // Extrair metadata
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        const queries = groundingMetadata?.webSearchQueries || [];
        const chunks = groundingMetadata?.groundingChunks || [];
        
        // Extrair tokens
        const usage = response.usageMetadata;
        const tokens = {
            input: usage?.promptTokenCount || 0,
            output: usage?.candidatesTokenCount || 0,
            total: usage?.totalTokenCount || 0
        };
        
        console.log('✅ [GROUNDING] Sucesso');
        console.log('📊 Queries:', queries.length, '| Chunks:', chunks.length);
        console.log('📊 Tokens:', tokens.total);
        
        // Extrair links dos chunks
        const linksChunks = chunks
            .filter(chunk => chunk.web)
            .map(chunk => ({
                uri: chunk.web.uri,
                title: chunk.web.title || 'Sem título',
                domain: chunk.web.domain || extrairDominio(chunk.web.uri)
            }));
        
        return {
            sucesso: true,
            textoMarkdown,
            queries,
            linksChunks,
            tokens
        };
        
    } catch (error) {
        console.error('❌ [GROUNDING] Erro:', error.message);
        return {
            sucesso: false,
            erro: error.message
        };
    }
}

// =============================================================================
// EXTRAIR JSON DO MARKDOWN (ETAPA 2 - SEM GROUNDING)
// =============================================================================

async function extrairJsonDoMarkdown(textoMarkdown) {
    console.log('📊 [EXTRAÇÃO] Estruturando dados...');
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
                maxOutputTokens: 8192,
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        });
        
        const prompt = `Converta o seguinte texto Markdown em JSON estruturado.

TEXTO MARKDOWN:
${textoMarkdown}

Retorne um JSON com esta estrutura EXATA:

{
  "produtos": [
    {
      "nome": "nome completo do produto",
      "preco": 999.99,
      "link": "https://...",
      "loja": "nome da loja",
      "classificacao": "match" ou "similar"
    }
  ]
}

REGRAS PARA PREÇOS:
- Extraia TODOS os preços mencionados no texto
- Converta "R$ 9.666,00" para 9666.00 (número decimal)
- Converta "R$ 3.258,50" para 3258.5
- Se houver múltiplos preços (à vista/parcelado), use o MENOR
- Se houver "De R$ X por R$ Y", use Y (menor preço)
- Se realmente não houver preço, use null
- Preserve os links EXATAMENTE como estão
- classificacao deve ser "match" ou "similar" (minúsculas)`;
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();
        const dados = JSON.parse(jsonText);
        
        // Extrair tokens
        const usage = response.usageMetadata;
        const tokens = {
            input: usage?.promptTokenCount || 0,
            output: usage?.candidatesTokenCount || 0,
            total: usage?.totalTokenCount || 0
        };
        
        console.log('✅ [EXTRAÇÃO] Produtos:', dados.produtos?.length || 0);
        console.log('📊 Tokens:', tokens.total);
        
        return {
            sucesso: true,
            produtos: dados.produtos || [],
            tokens
        };
        
    } catch (error) {
        console.error('❌ [EXTRAÇÃO] Erro:', error.message);
        return {
            sucesso: false,
            erro: error.message,
            produtos: [],
            tokens: { input: 0, output: 0, total: 0 }
        };
    }
}

function extrairDominio(url) {
    try {
        const match = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
        return match ? match[1] : 'desconhecido';
    } catch (e) {
        return 'desconhecido';
    }
}

// =============================================================================
// RESOLVER REDIRECTS NOS PRODUTOS
// =============================================================================

async function resolverRedirectsProdutos(produtos) {
    console.log('🔄 [REDIRECT] Resolvendo', produtos.length, 'links...');
    
    const produtosResolvidos = await Promise.all(
        produtos.map(async (produto) => {
            if (!produto.link) return produto;
            
            const linkResolvido = await resolverRedirect(produto.link);
            
            return {
                ...produto,
                link: linkResolvido
            };
        })
    );
    
    console.log('✅ [REDIRECT] Concluído');
    return produtosResolvidos;
}

// =============================================================================
// CALCULAR MÉDIA PONDERADA
// =============================================================================

function calcularMediaPonderada(produtos) {
    console.log('📊 [MÉDIA] Calculando...');
    
    // Filtrar produtos com preço
    const produtosComPreco = produtos.filter(p => p.preco !== null && p.preco > 0);
    
    if (produtosComPreco.length === 0) {
        console.warn('⚠️ [MÉDIA] Nenhum produto com preço');
        return {
            media_ponderada: null,
            total_produtos: produtos.length,
            com_preco: 0,
            match: 0,
            similar: 0,
            precos: []
        };
    }
    
    // Separar por classificação
    const matches = produtosComPreco.filter(p => p.classificacao === 'match');
    const similares = produtosComPreco.filter(p => p.classificacao === 'similar');
    
    // Calcular soma ponderada: match peso 2, similar peso 1
    let somaPonderada = 0;
    let somaPesos = 0;
    
    matches.forEach(p => {
        somaPonderada += p.preco * 2;
        somaPesos += 2;
    });
    
    similares.forEach(p => {
        somaPonderada += p.preco * 1;
        somaPesos += 1;
    });
    
    const mediaPonderada = somaPesos > 0 ? somaPonderada / somaPesos : null;
    
    console.log('✅ [MÉDIA] Match:', matches.length, '| Similar:', similares.length);
    console.log('✅ [MÉDIA] Ponderada: R$', mediaPonderada?.toFixed(2));
    
    return {
        media_ponderada: mediaPonderada,
        total_produtos: produtos.length,
        com_preco: produtosComPreco.length,
        match: matches.length,
        similar: similares.length,
        precos: produtosComPreco.map(p => p.preco).sort((a, b) => a - b)
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
    if (req.method !== 'POST') return res.status(405).json({
        status: 'Erro',
        mensagem: 'Método não permitido'
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('🚀 [ETAPA2-OTIMIZADA] BUSCA SIMPLIFICADA');
    console.log('='.repeat(70) + '\n');
    
    try {
        const {
            termo_busca_comercial,
            numero_patrimonio,
            nome_produto,
            marca,
            modelo,
            especificacoes,
            estado_conservacao,
            categoria_depreciacao
        } = req.body;
        
        if (!termo_busca_comercial || termo_busca_comercial.trim() === '') {
            return res.status(400).json({
                status: 'Erro',
                mensagem: 'Campo "termo_busca_comercial" é obrigatório'
            });
        }
        
        const termo = termo_busca_comercial.trim();
        const produtoOriginal = {
            nome_produto: nome_produto || 'N/A',
            marca: marca || 'N/A',
            modelo: modelo || 'N/A',
            especificacoes: especificacoes || 'N/A'
        };
        
        console.log('📦 Patrimônio:', numero_patrimonio);
        console.log('📦 Produto:', nome_produto);
        console.log('🔍 Termo:', termo);
        
        // ETAPA 1: Buscar com grounding (Markdown)
        const resultadoGrounding = await buscarComGrounding(termo, produtoOriginal);
        
        if (!resultadoGrounding.sucesso) {
            return res.status(200).json({
                status: 'Erro',
                mensagem: 'Falha na busca',
                dados: {
                    erro: resultadoGrounding.erro
                }
            });
        }
        
        // ETAPA 2: Extrair JSON do Markdown (sem grounding)
        const resultadoExtracao = await extrairJsonDoMarkdown(resultadoGrounding.textoMarkdown);
        
        if (!resultadoExtracao.sucesso) {
            return res.status(200).json({
                status: 'Erro',
                mensagem: 'Falha na extração de dados',
                dados: {
                    erro: resultadoExtracao.erro,
                    texto_markdown: resultadoGrounding.textoMarkdown
                }
            });
        }
        
        // Resolver redirects nos links dos produtos
        const produtosResolvidos = await resolverRedirectsProdutos(resultadoExtracao.produtos);
        
        // Calcular média ponderada
        const estatisticas = calcularMediaPonderada(produtosResolvidos);
        
        // Resolver redirects dos links de auditoria
        const linksAuditoriaResolvidos = await Promise.all(
            resultadoGrounding.linksChunks.map(async (link) => ({
                ...link,
                uri: await resolverRedirect(link.uri)
            }))
        );
        
        // Calcular tokens totais
        const tokensTotal = resultadoGrounding.tokens.total + resultadoExtracao.tokens.total;
        
        const dadosResposta = {
            produto: {
                numero_patrimonio: numero_patrimonio || 'N/A',
                nome_produto: nome_produto || 'N/A',
                marca: marca || 'N/A',
                modelo: modelo || 'N/A',
                especificacoes: especificacoes || 'N/A',
                estado_conservacao: estado_conservacao || 'N/A',
                categoria_depreciacao: categoria_depreciacao || 'N/A'
            },
            
            // Média ponderada e estatísticas
            avaliacao: {
                media_ponderada: estatisticas.media_ponderada,
                total_produtos: estatisticas.total_produtos,
                produtos_com_preco: estatisticas.com_preco,
                produtos_match: estatisticas.match,
                produtos_similar: estatisticas.similar,
                preco_minimo: estatisticas.precos[0] || null,
                preco_maximo: estatisticas.precos[estatisticas.precos.length - 1] || null
            },
            
            // Produtos encontrados
            produtos: produtosResolvidos,
            
            // Links para auditoria (páginas de lista)
            links_auditoria: linksAuditoriaResolvidos,
            
            // Metadados mínimos
            meta: {
                queries: resultadoGrounding.queries.length,
                tokens: tokensTotal,
                tokens_grounding: resultadoGrounding.tokens.total,
                tokens_extracao: resultadoExtracao.tokens.total,
                data: new Date().toISOString()
            }
        };
        
        console.log('\n✅ [ETAPA2-OTIMIZADA] CONCLUÍDO');
        console.log('📊 Produtos:', estatisticas.total_produtos);
        console.log('📊 Com preço:', estatisticas.com_preco, '(match:', estatisticas.match, '| similar:', estatisticas.similar, ')');
        console.log('📊 Média ponderada: R$', estatisticas.media_ponderada?.toFixed(2) || 'N/A');
        console.log('📊 Tokens TOTAL:', tokensTotal, '(grounding:', resultadoGrounding.tokens.total, '+ extração:', resultadoExtracao.tokens.total, ')');
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: `Média ponderada: R$ ${estatisticas.media_ponderada?.toFixed(2) || 'N/A'}`,
            dados: dadosResposta
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2-OTIMIZADA] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message
        });
    }
};