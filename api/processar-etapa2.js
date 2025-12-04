const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash-lite';
const genAI = new GoogleGenerativeAI(API_KEY);

// Custom Search API
const CUSTOM_SEARCH_CX_ID = process.env.CUSTOM_SEARCH_CX_ID;

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
// BUSCAR COM CUSTOM SEARCH API
// =============================================================================

async function buscarCustomSearch(termo, numResultados = 20) {
    console.log('🔍 Termo:', termo);
    console.log('🔍 Resultados solicitados:', numResultados);
    
    if (!API_KEY || !CUSTOM_SEARCH_CX_ID) {
        throw new Error('Custom Search não configurado');
    }
    
    const resultados = [];
    const maxPorChamada = 10;
    const chamadas = Math.ceil(numResultados / maxPorChamada);
    
    try {
        for (let i = 0; i < chamadas; i++) {
            const startIndex = (i * maxPorChamada) + 1;
            
            console.log(`📡 Chamada ${i + 1}/${chamadas} - startIndex: ${startIndex}`);
            
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: API_KEY,
                    cx: CUSTOM_SEARCH_CX_ID,
                    q: termo,
                    num: maxPorChamada,
                    start: startIndex,
                    gl: 'br',
                    lr: 'lang_pt'
                },
                timeout: 15000
            });
            
            if (response.data.items && response.data.items.length > 0) {
                resultados.push(...response.data.items);
                console.log(`✅ ${response.data.items.length} resultados obtidos`);
            } else {
                console.log(`⚠️ Nenhum resultado na chamada ${i + 1}`);
                break;
            }
            
            if (i < chamadas - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        console.log(`✅ Total: ${resultados.length} resultados\n`);
        return { sucesso: true, resultados };
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        return { sucesso: false, resultados: [], erro: error.message };
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
    console.log('🚀 [ETAPA2] BUSCA DE PREÇOS');
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
        
        const resultado = await buscarCustomSearch(termo, 20);
        
        if (!resultado.sucesso || resultado.resultados.length === 0) {
            return res.status(200).json({
                status: 'Sem Resultados',
                mensagem: 'Nenhum resultado encontrado',
                dados: {
                    produto: {
                        numero_patrimonio: numero_patrimonio || 'N/A',
                        nome_produto: nome_produto || 'N/A'
                    },
                    busca: {
                        termo_utilizado: termo,
                        total_resultados: 0,
                        erro: resultado.erro || null
                    }
                }
            });
        }
        
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
                total_resultados: resultado.resultados.length
            },
            
            resultados_brutos: resultado.resultados,
            
            metadados: {
                data_processamento: new Date().toISOString(),
                versao_sistema: '2.0-Dados-Brutos',
                api_busca: 'Google Custom Search API'
            }
        };
        
        console.log('✅ [ETAPA2] CONCLUÍDO');
        console.log('📊 Resultados:', resultado.resultados.length);
        console.log('='.repeat(70) + '\n');
        
        return res.status(200).json({
            status: 'Sucesso',
            mensagem: `${resultado.resultados.length} resultado(s) encontrado(s)`,
            dados: dadosCompletos
        });
        
    } catch (error) {
        console.error('❌ [ETAPA2] ERRO:', error.message);
        return res.status(500).json({
            status: 'Erro',
            mensagem: error.message,
            dados: {}
        });
    }
};