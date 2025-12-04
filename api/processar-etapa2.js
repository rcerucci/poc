const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite';
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

// =============================================================================
// RESOLVER REDIRECTS (SOLUÇÃO PARA O PROBLEMA DO vertexaisearch)
// =============================================================================

async function resolverRedirect(url) {
    console.log('🔄 [REDIRECT] Resolvendo:', url.substring(0, 80) + '...');
    
    // Se não for um redirect do Google, retornar o URL original
    if (!url.includes('vertexaisearch.cloud.google.com') && 
        !url.includes('google.com/url') &&
        !url.includes('google.com/search')) {
        console.log('✅ [REDIRECT] URL direto, sem redirect');
        return url;
    }
    
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            timeout: 5000
        });
        
        const urlFinal = response.url;
        console.log('✅ [REDIRECT] Resolvido para:', urlFinal.substring(0, 80) + '...');
        return urlFinal;
        
    } catch (error) {
        console.warn('⚠️ [REDIRECT] Falha ao resolver, usando original:', error.message);
        return url;
    }
}

// =============================================================================
// BUSCAR COM GROUNDING (ETAPA 1 - MARKDOWN COM CITAÇÕES)
// =============================================================================

async function buscarComGrounding(termo) {
    console.log('🔍 [GROUNDING] Termo:', termo);
    
    if (!API_KEY) {
        throw new Error('API Key não configurada');
    }
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0.1,
                thinkingConfig: {
                    thinkingBudget: 0
                }
            }
        });
        
        // IMPORTANTE: Pedir em MARKDOWN para preservar grounding metadata
        const prompt = `Busque informações sobre: ${termo}

Retorne os produtos encontrados em formato MARKDOWN com preços em reais (R$).
Para cada produto inclua:
- Nome do produto
- Preço à vista (se disponível)
- Preço parcelado (se disponível)
- Nome da loja
- Link do produto

Use listas numeradas.`;
        
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }]
        });
        
        const response = result.response;
        const texto = response.text();
        
        // Extrair metadata de grounding
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        
        // Extrair usage metadata
        const usage = result.response.usageMetadata;
        const tokensInput = usage?.promptTokenCount || 0;
        const tokensOutput = usage?.candidatesTokenCount || 0;
        const tokensTotal = usage?.totalTokenCount || 0;
        
        console.log('✅ [GROUNDING] Sucesso');
        console.log('📊 Tokens - Input:', tokensInput, '| Output:', tokensOutput, '| Total:', tokensTotal);
        
        if (groundingMetadata) {
            console.log('🌐 Web searches:', groundingMetadata.webSearchQueries?.length || 0);
            console.log('📦 Grounding chunks:', groundingMetadata.groundingChunks?.length || 0);
        }
        
        return {
            sucesso: true,
            texto,
            groundingMetadata,
            tokens: {
                input: tokensInput,
                output: tokensOutput,
                total: tokensTotal
            }
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
// PROCESSAR GROUNDING METADATA COM RESOLUÇÃO DE REDIRECTS
// =============================================================================

async function processarGroundingMetadata(metadata) {
    if (!metadata) {
        return {
            tem_resultados: false,
            total_chunks: 0,
            total_queries: 0
        };
    }
    
    const chunks = metadata.groundingChunks || [];
    const queries = metadata.webSearchQueries || [];
    const supports = metadata.groundingSupports || [];
    
    // Extrair links únicos dos chunks
    const linksComRedirect = chunks
        .filter(chunk => chunk.web)
        .map(chunk => ({
            uri: chunk.web.uri,
            title: chunk.web.title,
            domain: chunk.web.domain || extrairDominio(chunk.web.uri)
        }));
    
    console.log('🔄 [REDIRECT] Resolvendo', linksComRedirect.length, 'links...');
    
    // Resolver todos os redirects em paralelo
    const linksResolvidos = await Promise.all(
        linksComRedirect.map(async (link) => ({
            ...link,
            uri_original: link.uri,
            uri: await resolverRedirect(link.uri)
        }))
    );
    
    // Processar supports (liga texto às fontes)
    const suportes = supports.map(support => ({
        texto: support.segment?.text || '',
        indices_chunks: support.groundingChunkIndices || [],
        confianca: support.confidenceScores || []
    }));
    
    return {
        tem_resultados: chunks.length > 0,
        total_chunks: chunks.length,
        total_queries: queries.length,
        queries_realizadas: queries,
        links_encontrados: linksResolvidos,
        suportes,
        search_entry_point: metadata.searchEntryPoint || null
    };
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
// MASCARAR URLS (PROTEÇÃO CONTRA CORRUPÇÃO)
// =============================================================================

function mascararUrls(texto, links) {
    let textoMascarado = texto;
    const mapaUrls = {};
    
    links.forEach((link, idx) => {
        const placeholder = `<<URL_${idx + 1}>>`;
        mapaUrls[placeholder] = link.uri;
        
        // Substituir URLs no texto
        textoMascarado = textoMascarado.replace(link.uri, placeholder);
        if (link.uri_original && link.uri_original !== link.uri) {
            textoMascarado = textoMascarado.replace(link.uri_original, placeholder);
        }
    });
    
    console.log('🎭 [MASK] URLs mascaradas:', Object.keys(mapaUrls).length);
    return { textoMascarado, mapaUrls };
}

function desmascararUrls(texto, mapaUrls) {
    let textoFinal = texto;
    
    Object.entries(mapaUrls).forEach(([placeholder, url]) => {
        textoFinal = textoFinal.replace(new RegExp(placeholder, 'g'), url);
    });
    
    console.log('🎭 [UNMASK] URLs restauradas');
    return textoFinal;
}

// =============================================================================
// EXTRAIR DADOS ESTRUTURADOS (ETAPA 2 - JSON COM URLS PROTEGIDAS)
// =============================================================================

async function extrairDadosEstruturados(textoMarkdown, mapaUrls) {
    console.log('📊 [EXTRAÇÃO] Estruturando dados...');
    
    try {
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
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
      "preco_a_vista": 999.99,
      "preco_parcelado": 1099.99,
      "link": "<<URL_N>>",
      "loja": "nome da loja"
    }
  ]
}

REGRAS IMPORTANTES:
- Extraia TODOS os produtos mencionados
- Se não houver preço à vista, use null
- Se não houver preço parcelado, use null
- PRESERVE os placeholders <<URL_N>> EXATAMENTE como estão
- Converta valores como "R$ 866,98" para 866.98 (número)
- Se a loja não for mencionada, use null
- Retorne apenas o JSON, sem texto adicional`;
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const jsonText = response.text();
        
        // Extrair tokens desta chamada
        const usage = response.usageMetadata;
        const tokensExtracao = {
            input: usage?.promptTokenCount || 0,
            output: usage?.candidatesTokenCount || 0,
            total: usage?.totalTokenCount || 0
        };
        
        console.log('📊 Tokens Extração - Input:', tokensExtracao.input, '| Output:', tokensExtracao.output, '| Total:', tokensExtracao.total);
        
        const dados = JSON.parse(jsonText);
        
        // Desmascarar URLs no JSON
        const jsonComUrls = desmascararUrls(JSON.stringify(dados), mapaUrls);
        const dadosFinais = JSON.parse(jsonComUrls);
        
        console.log('✅ [EXTRAÇÃO] Encontrados:', dadosFinais.produtos?.length || 0, 'produtos');
        
        return {
            sucesso: true,
            produtos: dadosFinais.produtos || [],
            tokens: tokensExtracao
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
        mensagem: 'Método não permitido',
        dados: {}
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('🚀 [ETAPA2-FIXED] BUSCA COM REDIRECTS RESOLVIDOS');
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
                mensagem: 'Campo "termo_busca_comercial" é obrigatório',
                dados: {}
            });
        }
        
        const termo = termo_busca_comercial.trim();
        
        console.log('📦 Patrimônio:', numero_patrimonio);
        console.log('📦 Produto:', nome_produto);
        console.log('🔍 Termo:', termo);
        
        // ETAPA 1: Buscar com grounding (Markdown)
        const resultado = await buscarComGrounding(termo);
        
        if (!resultado.sucesso) {
            return res.status(200).json({
                status: 'Erro',
                mensagem: 'Falha na busca com grounding',
                dados: {
                    produto: {
                        numero_patrimonio: numero_patrimonio || 'N/A',
                        nome_produto: nome_produto || 'N/A'
                    },
                    erro: resultado.erro
                }
            });
        }
        
        // Processar metadata e resolver redirects
        const metadataProcessada = await processarGroundingMetadata(resultado.groundingMetadata);
        
        // Mascarar URLs no texto Markdown
        const { textoMascarado, mapaUrls } = mascararUrls(
            resultado.texto,
            metadataProcessada.links_encontrados
        );
        
        // ETAPA 2: Extrair dados estruturados (JSON)
        const dadosEstruturados = await extrairDadosEstruturados(textoMascarado, mapaUrls);
        
        // Calcular tokens totais
        const tokensTotal = {
            grounding: resultado.tokens,
            extracao: dadosEstruturados.tokens,
            total: resultado.tokens.total + dadosEstruturados.tokens.total
        };
        
        const dadosCompletos = {
            produto: {
                numero_patrimonio: numero_patrimonio || 'N/A',
                nome_produto: nome_produto || 'N/A',
                marca: marca || 'N/A',
                modelo: modelo || 'N/A',
                especificacoes: especificacoes || 'N/A',
                estado_conservacao: estado_conservacao || 'N/A',
                categoria_depreciacao: categoria_depreciacao || 'N/A'
            },
            
            busca: {
                termo_utilizado: termo,
                metodo: 'Grounding + Redirect Resolution + JSON Extraction',
                queries_realizadas: metadataProcessada.queries_realizadas,
                total_queries: metadataProcessada.total_queries,
                total_links: metadataProcessada.total_chunks
            },
            
            // 🆕 Dados estruturados extraídos com URLs resolvidas
            produtos_encontrados: dadosEstruturados.produtos,
            total_produtos: dadosEstruturados.produtos.length,
            
            // Resposta original da LLM (mantida para referência)
            resposta_llm_original: resultado.texto,
            
            // Links do grounding com redirects resolvidos
            links_grounding: metadataProcessada.links_encontrados,
            
            // Suportes (conexão texto -> fontes)
            suportes: metadataProcessada.suportes,
            
            // Tokens detalhados
            tokens: tokensTotal,
            
            metadados: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '5.0-Redirect-Fixed',
                modelo_llm: MODEL,
                metodo_busca: 'Grounding + Redirect Resolution',
                thinking_mode: 'desabilitado',
                extracao_json: dadosEstruturados.sucesso ? 'sucesso' : 'falha',
                redirects_resolvidos: metadataProcessada.links_encontrados.length
            }
        };
        
        console.log('\n✅ [ETAPA2-FIXED] CONCLUÍDO');
        console.log('📊 Queries realizadas:', metadataProcessada.total_queries);
        console.log('📊 Links encontrados:', metadataProcessada.total_chunks);
        console.log('📊 Redirects resolvidos:', metadataProcessada.links_encontrados.length);
        console.log('📊 Produtos estruturados:', dadosEstruturados.produtos.length);
        console.log('📊 Tokens TOTAL:', tokensTotal.total);
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: `${dadosEstruturados.produtos.length} produto(s) com links reais de ${metadataProcessada.total_chunks} fonte(s)`,
            dados: dadosCompletos
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2-FIXED] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};