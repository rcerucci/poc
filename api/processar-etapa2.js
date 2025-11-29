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

    console.log(`✅ [EMA] ${precosValidos.length} preços válidos`);

    // 2. Remover outliers usando IQR (Interquartile Range)
    const valores = precosValidos.map(p => p.valor).sort((a, b) => a - b);
    const q1 = valores[Math.floor(valores.length * 0.25)];
    const q3 = valores[Math.floor(valores.length * 0.75)];
    const iqr = q3 - q1;
    const limiteInferior = q1 - 1.5 * iqr;
    const limiteSuperior = q3 + 1.5 * iqr;

    console.log(`📐 [EMA] IQR: Q1=${q1.toFixed(2)}, Q3=${q3.toFixed(2)}, IQR=${iqr.toFixed(2)}`);
    console.log(`📐 [EMA] Limites: [${limiteInferior.toFixed(2)}, ${limiteSuperior.toFixed(2)}]`);

    const precosFiltrados = precosValidos.filter(p => 
        p.valor >= limiteInferior && p.valor <= limiteSuperior
    );

    if (precosFiltrados.length === 0) {
        console.log('⚠️ [EMA] Todos os preços foram considerados outliers, usando preços válidos');
        precosFiltrados.push(...precosValidos);
    }

    console.log(`✅ [EMA] ${precosFiltrados.length} preços após remoção de outliers`);

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
                pesoRecencia = Math.exp(-diasPassados / 60); // Decai para ~0.6 após 30 dias
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
    console.log(`   Média Exponencial: R$ ${mediaExponencial.toFixed(2)}`);
    console.log(`   Desvio Padrão: R$ ${desvioPadrao.toFixed(2)}`);
    console.log(`   Confiança: ${scoreConfianca.toFixed(1)}%`);

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
            data: p.data_oferta || 'N/A'
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

        // ✅ CORREÇÃO: Usar string vazia se marca ou modelo for 'N/A' para evitar poluir o prompt.
        const marcaParaPrompt = marca && marca !== 'N/A' ? marca : '';
        const modeloParaPrompt = modelo && modelo !== 'N/A' ? modelo : '';

        // --- PROMPT OTIMIZADO (REDUZIDO) ---
        const promptBuscaPreco = `Busque APENAS PRODUTOS NOVOS (de fábrica) para: ${nome_produto} ${marcaParaPrompt} ${modeloParaPrompt}.
        Categoria: ${categoria_depreciacao}

        🔍 BUSCA: Use especificações técnicas e IGNORE completamente descrições de estado físico (arranhões, manchas, desgaste, etc).
        Exemplo: "Notebook Intel Core i3" → busque "Notebook Intel Core i3 NOVO"

        PRIORIDADE:
        1. B2B Brasil (atacado/distribuidores)
        2. B2C Brasil (Amazon/Mercado Livre - filtro "NOVO")
        3. Internacional (USD×5.0, EUR×5.4, +20%)

        JSON (sem markdown):
        {
        "preco_encontrado": true,
        "coleta_de_precos": [
            {"valor": 1500.00, "tipo_fonte": "B2B", "site": "Fornecedor X", "data_oferta": "2025-11-28"}
        ]
        }

        REGRAS: Produto NOVO | Individual | R$ | YYYY-MM-DD | Mínimo 3 preços`;

        console.log('🤖 [ETAPA2] Inicializando modelo com Google Search...');

        const model = genAI.getGenerativeModel({
            model: MODEL,
            tools: [{ googleSearch: {} }],
            generationConfig: {
                temperature: 0.2
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
            console.log('🧹 [ETAPA2] Texto limpo para parse:', jsonText);

            resultadoBusca = JSON.parse(jsonText);
            console.log('✅ [ETAPA2] JSON parseado:', JSON.stringify(resultadoBusca, null, 2));
            
        } catch (parseError) {
            console.error('❌ [ETAPA2] ERRO ao parsear JSON:', parseError.message);
            console.error('📋 [ETAPA2] Texto original:', text);
            throw new Error(`Resposta não é um JSON válido: ${parseError.message}`);
        }

        if (!resultadoBusca.preco_encontrado) {
            console.log('⚠️ [ETAPA2] Preço não encontrado');
            return res.status(200).json({
                status: 'Falha',
                mensagem: `Não foi possível encontrar preço B2B: ${resultadoBusca.motivo || 'Produto muito específico'}. Insira valor manualmente.`,
                dados: { preco_encontrado: false }
            });
        }

        // --- NOVA ETAPA: CALCULAR MÉDIA EXPONENCIAL ---
        console.log('📊 [ETAPA2] Calculando média exponencial dos preços coletados...');
        
        const resultadoEMA = calcularMediaExponencial(resultadoBusca.coleta_de_precos);

        if (!resultadoEMA.sucesso) {
            return res.status(200).json({
                status: 'Falha',
                mensagem: `Erro ao processar preços: ${resultadoEMA.motivo}`,
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
                fonte_preco: 'Média Exponencial Ponderada',
                metodo_calculo: 'EMA com filtro IQR e pesos B2B/recência',
                score_confianca: resultadoEMA.estatisticas.score_confianca,
                observacoes: resultadoBusca.observacoes || 'Calculado via média exponencial de múltiplas fontes'
            },
            analise_estatistica: resultadoEMA.estatisticas,
            precos_coletados: resultadoEMA.detalhes_precos,
            metadados: {
                data_busca: new Date().toISOString(),
                query_utilizada: queryBusca,
                modelo_ia: MODEL,
                estrategia: 'Busca B2B → Média Exponencial → Depreciação'
            }
        };

        console.log('✅ [ETAPA2] Processamento concluído com sucesso!');

        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: `Valores calculados via média exponencial (confiança: ${resultadoEMA.estatisticas.score_confianca.toFixed(0)}%)`
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

// ═══════════════════════════════════════════════════════════════
// O restante do código de front-end/DOM não foi alterado
// ═══════════════════════════════════════════════════════════════

// CONFIGURAÇÕES DE OTIMIZAÇÃO DE CUSTO
// maxWidth: 1024px - Reduz tokens de visão (custo) mantendo legibilidade
// quality: 0.75 - Balanço ideal entre tamanho e qualidade para OCR

// Estado da Aplicação
const AppState = {
    fotosColetadas: [],
    dadosEtapa1: null,
    dadosCompletos: null,
    processandoEtapa: null,
    camposBloqueados: false
};

// Elementos DOM
const elementos = {
    btnProcessarEtapa1: document.getElementById('processarEtapa1'),
    btnValidarEBuscarPreco: document.getElementById('validarEBuscarPreco'),
    btnLimparCache: document.getElementById('limparCache'),
    btnProcessarNovo: document.getElementById('processarNovo'),
    btnExportarJSON: document.getElementById('exportarJSON'),
    btnCopiarJSON: document.getElementById('copiarJSON'),
    
    formSection: document.getElementById('formSection'),
    resultSection: document.getElementById('resultSection'),
    alertBox: document.getElementById('alertBox'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    helpTextForm: document.getElementById('helpTextForm'),
    btnDesbloquearContainer: document.getElementById('btnDesbloquearContainer'),
    
    numeroPatrimonio: document.getElementById('numeroPatrimonio'),
    nomeProduto: document.getElementById('nomeProduto'),
    valorAtual: document.getElementById('valorAtual'),
    valorMercado: document.getElementById('valorMercado'),
    estado: document.getElementById('estado'),
    centroCusto: document.getElementById('centroCusto'),
    depreciacao: document.getElementById('depreciacao'),
    unidade: document.getElementById('unidade'),
    descricao: document.getElementById('descricao')
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    inicializarEventosUpload();
    inicializarBotoes();
    inicializarCtrlV();
    carregarCacheSeExistir();
    console.log('✅ PatriGestor iniciado');
});

// ============================================
// COMPRESSÃO DE IMAGENS
// ============================================

function comprimirImagem(file, maxWidth = 1024, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Redimensionar para máximo de 1024px (otimização de custo!)
                if (width > maxWidth || height > maxWidth) {
                    if (width > height) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    } else {
                        width = (width * maxWidth) / height;
                        height = maxWidth;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converter para base64 com qualidade reduzida (75% é ótimo para texto)
                const comprimido = canvas.toDataURL('image/jpeg', quality);
                
                const tamanhoOriginal = (file.size / 1024).toFixed(0);
                const tamanhoFinal = (comprimido.length / 1024).toFixed(0);
                const reducao = (((file.size - comprimido.length) / file.size) * 100).toFixed(0);
                
                console.log(`📦 Imagem otimizada: ${tamanhoOriginal}KB → ${tamanhoFinal}KB (${reducao}% redução, ${width}x${height}px)`);
                
                resolve(comprimido);
            };
            
            img.onerror = reject;
            img.src = e.target.result;
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================
// CTRL+V - COLAR IMAGENS
// ============================================

function inicializarCtrlV() {
    console.log('🎯 Inicializando Ctrl+V...');
    
    document.addEventListener('paste', async (e) => {
        console.log('📋 Evento paste detectado!');
        
        const items = e.clipboardData?.items;
        console.log('📦 Items:', items);
        
        if (!items) {
            console.log('⚠️ Nenhum item na área de transferência');
            return;
        }
        
        for (let i = 0; i < items.length; i++) {
            console.log(`📌 Item ${i}:`, items[i].type);
            
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                
                const blob = items[i].getAsFile();
                console.log('✅ Imagem detectada:', blob.name, `${(blob.size / 1024).toFixed(0)}KB`);
                
                // Encontra próximo slot vazio
                const index = encontrarProximoSlotVazio();
                console.log('🎰 Slot vazio encontrado:', index);
                
                if (index !== -1) {
                    const slot = document.querySelector(`.photo-slot[data-index="${index}"]`);
                    console.log('📍 Slot DOM:', slot);
                    
                    if (!slot) {
                        console.error('❌ Slot não encontrado no DOM!');
                        return;
                    }
                    
                    const preview = slot.querySelector('.photo-preview');
                    const placeholder = slot.querySelector('.photo-placeholder');
                    const btnRemove = slot.querySelector('.btn-remove');
                    
                    console.log('🔍 Elementos:', { preview, placeholder, btnRemove });
                    
                    await adicionarFotoComCompressao(blob, preview, placeholder, btnRemove, index);
                    exibirAlerta('success', `✅ Imagem colada no slot ${index}! Total: ${contarFotos()} fotos`);
                } else {
                    console.log('⚠️ Nenhum slot vazio disponível');
                    exibirAlerta('warning', '⚠️ Máximo de 4 fotos atingido');
                }
                
                break;
            }
        }
    });
    
    console.log('✅ Ctrl+V inicializado');
}

function encontrarProximoSlotVazio() {
    for (let i = 1; i <= 4; i++) {
        if (!AppState.fotosColetadas[i - 1]) {
            return i;
        }
    }
    return -1;
}

async function adicionarFotoComCompressao(file, preview, placeholder, btnRemove, index) {
    try {
        // Comprimir imagem
        const dataURLComprimido = await comprimirImagem(file);
        
        // Atualizar UI
        preview.src = dataURLComprimido;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        btnRemove.style.display = 'flex';
        
        // Salvar no estado
        AppState.fotosColetadas[index - 1] = {
            file: file,
            dataURL: dataURLComprimido,
            nome: file.name || `clipboard-${Date.now()}.jpg`,
            tamanho: dataURLComprimido.length
        };
        
        verificarFotosMinimas();
        
    } catch (error) {
        console.error('Erro ao comprimir imagem:', error);
        exibirAlerta('error', 'Erro ao processar imagem');
    }
}

function contarFotos() {
    return AppState.fotosColetadas.filter(f => f).length;
}

// ============================================
// GESTÃO DE FOTOS (Upload por clique)
// ============================================

function inicializarEventosUpload() {
    for (let i = 1; i <= 4; i++) {
        const input = document.getElementById(`photo${i}`);
        const slot = input.closest('.photo-slot');
        const preview = slot.querySelector('.photo-preview');
        const placeholder = slot.querySelector('.photo-placeholder');
        const btnRemove = slot.querySelector('.btn-remove');
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await adicionarFoto(file, preview, placeholder, btnRemove, i);
            }
        });
        
        btnRemove.addEventListener('click', (e) => {
            e.stopPropagation();
            removerFoto(input, preview, placeholder, btnRemove, i);
        });
    }
}

async function adicionarFoto(file, preview, placeholder, btnRemove, index) {
    try {
        console.log(`📷 Upload foto ${index}:`, file.name, `${(file.size / 1024).toFixed(0)}KB`);
        
        // Comprimir imagem
        const dataURLComprimido = await comprimirImagem(file);
        
        preview.src = dataURLComprimido;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        btnRemove.style.display = 'flex';
        
        AppState.fotosColetadas[index - 1] = {
            file: file,
            dataURL: dataURLComprimido,
            nome: file.name,
            tamanho: dataURLComprimido.length
        };
        
        verificarFotosMinimas();
        
    } catch (error) {
        console.error('Erro ao processar foto:', error);
        exibirAlerta('error', 'Erro ao processar imagem');
    }
}

function removerFoto(input, preview, placeholder, btnRemove, index) {
    input.value = '';
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    btnRemove.style.display = 'none';
    
    delete AppState.fotosColetadas[index - 1];
    verificarFotosMinimas();
}

function verificarFotosMinimas() {
    const totalFotos = contarFotos();
    elementos.btnProcessarEtapa1.disabled = totalFotos < 2;
    
    if (totalFotos >= 2) {
        elementos.btnProcessarEtapa1.textContent = `🤖 Processar ${totalFotos} fotos - Etapa 1/2`;
    } else {
        elementos.btnProcessarEtapa1.textContent = `🤖 Processar - Etapa 1/2`;
    }
}

// ============================================
// PROCESSAMENTO ETAPA 1
// ============================================

async function processarEtapa1() {
    try {
        // CRÍTICO: Desbloquear campos antes de processar nova consulta
        if (AppState.camposBloqueados) {
            desbloquearCampos();
        }
        
        exibirLoading('Processando IA: Etapa 1/2 - Extraindo dados...');
        
        const imagensBase64 = AppState.fotosColetadas
            .filter(f => f)
            .map(foto => ({
                data: foto.dataURL.split(',')[1],
                nome: foto.nome
            }));
        
        console.log('📤 Enviando', imagensBase64.length, 'imagens para API');
        console.log('📊 Tamanho total:', (JSON.stringify(imagensBase64).length / 1024).toFixed(0), 'KB');
        
        const response = await fetch('/api/processar-etapa1', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imagens: imagensBase64
            })
        });
        
        console.log('📥 Resposta API:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro da API:', errorText);
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const resposta = await response.json();
        console.log('✅ Dados recebidos:', resposta);
        
        ocultarLoading();
        
        if (resposta.status === 'Falha') {
            exibirAlerta('error', resposta.mensagem);
            preencherFormulario(resposta.dados);
            habilitarEdicaoManual();
        } else {
            exibirAlerta('success', '✅ Dados extraídos! Campos bloqueados - clique para copiar.');
            preencherFormulario(resposta.dados);
            destacarCamposCriticos();
            
            // Mostrar hint de campos bloqueados
            if (elementos.helpTextForm) {
                elementos.helpTextForm.style.display = 'block';
            }
        }
        
        AppState.dadosEtapa1 = resposta.dados;
        elementos.formSection.style.display = 'block';
        elementos.formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        salvarCacheEtapa1(resposta.dados);
        
    } catch (erro) {
        ocultarLoading();
        console.error('❌ Erro na Etapa 1:', erro);
        exibirAlerta('error', 'Erro ao processar imagens: ' + erro.message);
    }
}

function preencherFormulario(dados) {
    elementos.numeroPatrimonio.value = dados.numero_patrimonio || '';
    elementos.nomeProduto.value = dados.nome_produto || '';
    elementos.descricao.value = dados.descricao || '';
    elementos.estado.value = dados.estado_conservacao || '';
    elementos.depreciacao.value = dados.categoria_depreciacao || '';
    
    // Tornar campos somente leitura após extração da IA
    tornarCamposSomenteLeitura();
    adicionarBotaoDesbloquear();
}

function destacarCamposCriticos() {
    elementos.numeroPatrimonio.parentElement.classList.add('highlight');
    elementos.nomeProduto.parentElement.classList.add('highlight');
}

function habilitarEdicaoManual() {
    exibirAlerta('warning', '⚠️ Extração automática falhou. Preencha os campos manualmente.');
}

// ============================================
// BLOQUEIO/DESBLOQUEIO DE CAMPOS
// ============================================

function tornarCamposSomenteLeitura() {
    if (AppState.camposBloqueados) return; // Já está bloqueado
    
    // Lista de campos que ficarão bloqueados
    const camposBloqueados = [
        elementos.numeroPatrimonio,
        elementos.nomeProduto,
        elementos.estado,
        elementos.depreciacao,
        elementos.descricao
    ];
    
    camposBloqueados.forEach(campo => {
        if (campo.tagName === 'SELECT') {
            // Para select, desabilitar
            campo.disabled = true;
            campo.style.cursor = 'pointer';
            campo.style.backgroundColor = '#f7fafc';
            campo.title = 'Clique para copiar';
        } else {
            // Para input e textarea
            campo.readOnly = true;
            campo.style.cursor = 'pointer';
            campo.style.backgroundColor = '#f7fafc';
            campo.title = 'Clique para copiar';
        }
        
        // Adicionar evento de clique para copiar
        campo.addEventListener('click', copiarConteudoCampo);
    });
    
    AppState.camposBloqueados = true;
    console.log('🔒 Campos bloqueados para edição (clique para copiar)');
}

function desbloquearCampos() {
    const camposBloqueados = [
        elementos.numeroPatrimonio,
        elementos.nomeProduto,
        elementos.estado,
        elementos.depreciacao,
        elementos.descricao
    ];
    
    camposBloqueados.forEach(campo => {
        if (campo.tagName === 'SELECT') {
            campo.disabled = false;
        } else {
            campo.readOnly = false;
        }
        campo.style.cursor = '';
        campo.style.backgroundColor = '';
        campo.title = '';
        
        // Remover evento de clique
        campo.removeEventListener('click', copiarConteudoCampo);
    });
    
    // Remover botão de desbloquear se existir
    const btnDesbloquear = document.getElementById('btnDesbloquear');
    if (btnDesbloquear) {
        btnDesbloquear.remove();
    }
    
    // Esconder hint
    if (elementos.helpTextForm) {
        elementos.helpTextForm.style.display = 'none';
    }
    
    AppState.camposBloqueados = false;
    console.log('🔓 Campos desbloqueados');
}

function copiarConteudoCampo(event) {
    const campo = event.currentTarget;
    const valor = campo.value;
    
    if (!valor || valor === 'N/A' || valor === '') {
        exibirAlerta('warning', '⚠️ Campo vazio, nada para copiar');
        return;
    }
    
    // Copiar para área de transferência
    navigator.clipboard.writeText(valor)
        .then(() => {
            // Feedback visual
            const corOriginal = campo.style.backgroundColor;
            campo.style.backgroundColor = '#d1fae5';
            campo.style.transition = 'background-color 0.3s';
            
            // Mostrar alerta
            const labelElement = campo.parentElement.querySelector('label');
            const labelText = labelElement ? labelElement.textContent.replace('*', '').trim() : 'Campo';
            const valorTruncado = valor.substring(0, 50) + (valor.length > 50 ? '...' : '');
            exibirAlerta('success', `✅ ${labelText} copiado: "${valorTruncado}"`);
            
            // Restaurar cor original
            setTimeout(() => {
                campo.style.backgroundColor = corOriginal;
            }, 500);
        })
        .catch(err => {
            console.error('Erro ao copiar:', err);
            exibirAlerta('error', '❌ Erro ao copiar. Selecione manualmente.');
        });
}