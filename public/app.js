// Estado da Aplicação
const AppState = {
    fotosColetadas: [],
    dadosEtapa1: null,
    dadosCompletos: null,
    processandoEtapa: null
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

function comprimirImagem(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Redimensionar se maior que maxWidth
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converter para base64 com qualidade reduzida
                const comprimido = canvas.toDataURL('image/jpeg', quality);
                
                console.log(`📦 Imagem comprimida: ${(file.size / 1024).toFixed(0)}KB → ${(comprimido.length / 1024).toFixed(0)}KB`);
                
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
// CTRL+V - COLAR IMAGENS (CORRIGIDO)
// ============================================

function inicializarCtrlV() {
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                
                const blob = items[i].getAsFile();
                console.log('📋 Imagem colada:', blob.name, `${(blob.size / 1024).toFixed(0)}KB`);
                
                // Encontra próximo slot vazio
                const index = encontrarProximoSlotVazio();
                
                if (index !== -1) {
                    const slot = document.querySelector(`.photo-slot[data-index="${index}"]`);
                    const preview = slot.querySelector('.photo-preview');
                    const placeholder = slot.querySelector('.photo-placeholder');
                    const btnRemove = slot.querySelector('.btn-remove');
                    
                    await adicionarFotoComCompressao(blob, preview, placeholder, btnRemove, index);
                    exibirAlerta('success', `✅ Imagem colada no slot ${index}! Total: ${contarFotos()} fotos`);
                } else {
                    exibirAlerta('warning', '⚠️ Máximo de 4 fotos atingido');
                }
                
                break;
            }
        }
    });
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
            exibirAlerta('success', '✅ Dados extraídos com sucesso! Valide os campos.');
            preencherFormulario(resposta.dados);
            destacarCamposCriticos();
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
}

function destacarCamposCriticos() {
    elementos.numeroPatrimonio.parentElement.classList.add('highlight');
    elementos.nomeProduto.parentElement.classList.add('highlight');
}

function habilitarEdicaoManual() {
    exibirAlerta('warning', '⚠️ Extração automática falhou. Preencha os campos manualmente.');
}

// ============================================
// PROCESSAMENTO ETAPA 2
// ============================================
// Estado da Aplicação
const AppState = {
    fotosColetadas: [],
    dadosEtapa1: null,
    dadosCompletos: null,
    processandoEtapa: null
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

function comprimirImagem(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Redimensionar se maior que maxWidth
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converter para base64 com qualidade reduzida
                const comprimido = canvas.toDataURL('image/jpeg', quality);
                
                console.log(`📦 Imagem comprimida: ${(file.size / 1024).toFixed(0)}KB → ${(comprimido.length / 1024).toFixed(0)}KB`);
                
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
// CTRL+V - COLAR IMAGENS (CORRIGIDO)
// ============================================

function inicializarCtrlV() {
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                
                const blob = items[i].getAsFile();
                console.log('📋 Imagem colada:', blob.name, `${(blob.size / 1024).toFixed(0)}KB`);
                
                // Encontra próximo slot vazio
                const index = encontrarProximoSlotVazio();
                
                if (index !== -1) {
                    const slot = document.querySelector(`.photo-slot[data-index="${index}"]`);
                    const preview = slot.querySelector('.photo-preview');
                    const placeholder = slot.querySelector('.photo-placeholder');
                    const btnRemove = slot.querySelector('.btn-remove');
                    
                    await adicionarFotoComCompressao(blob, preview, placeholder, btnRemove, index);
                    exibirAlerta('success', `✅ Imagem colada no slot ${index}! Total: ${contarFotos()} fotos`);
                } else {
                    exibirAlerta('warning', '⚠️ Máximo de 4 fotos atingido');
                }
                
                break;
            }
        }
    });
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
            exibirAlerta('success', '✅ Dados extraídos com sucesso! Valide os campos.');
            preencherFormulario(resposta.dados);
            destacarCamposCriticos();
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
}

function destacarCamposCriticos() {
    elementos.numeroPatrimonio.parentElement.classList.add('highlight');
    elementos.nomeProduto.parentElement.classList.add('highlight');
}

function habilitarEdicaoManual() {
    exibirAlerta('warning', '⚠️ Extração automática falhou. Preencha os campos manualmente.');
}

// ============================================
// PROCESSAMENTO ETAPA 2
// ============================================

async function processarEtapa2() {
    try {
        // Validar campos obrigatórios
        const numeroPatrimonio = elementos.numeroPatrimonio.value.trim();
        const nomeProduto = elementos.nomeProduto.value.trim();
        
        if (!numeroPatrimonio || !nomeProduto) {
            exibirAlerta('warning', '⚠️ Preencha a Placa e o Nome antes de buscar o preço!');
            return;
        }
        
        exibirLoading('Buscando preços online: Etapa 2/2...');
        
        const dadosParaBusca = {
            numero_patrimonio: numeroPatrimonio,
            nome_produto: nomeProduto,
            modelo: elementos.descricao.value?.split(',')[0] || 'N/A',
            marca: elementos.descricao.value?.split(',')[1] || 'N/A',
            estado_conservacao: elementos.estado.value || 'Bom',
            categoria_depreciacao: elementos.depreciacao.value || 'Outros'
        };
        
        console.log('📤 Enviando dados para Etapa 2:', dadosParaBusca);
        
        const response = await fetch('/api/processar-etapa2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosParaBusca)
        });
        
        console.log('📥 Resposta Etapa 2:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro da API:', errorText);
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const resposta = await response.json();
        console.log('✅ Dados recebidos Etapa 2:', resposta);
        
        ocultarLoading();
        
        if (resposta.status === 'Falha') {
            exibirAlerta('warning', '⚠️ ' + resposta.mensagem);
            elementos.valorMercado.focus();
        } else {
            const valores = resposta.dados.valores_estimados;
            elementos.valorMercado.value = formatarMoeda(valores.valor_mercado_estimado);
            elementos.valorAtual.value = formatarMoeda(valores.valor_atual_estimado);
            
            exibirAlerta('success', `✅ Valores encontrados! Depreciação: ${valores.percentual_depreciacao}`);
            
            // Destacar campos preenchidos
            elementos.valorMercado.parentElement.classList.add('success');
            elementos.valorAtual.parentElement.classList.add('success');
        }
        
        AppState.dadosCompletos = resposta.dados;
        
    } catch (erro) {
        ocultarLoading();
        console.error('❌ Erro na Etapa 2:', erro);
        exibirAlerta('error', 'Erro ao buscar preços: ' + erro.message);
    }
}

// ============================================
// UTILITÁRIOS
// ============================================

function exibirLoading(texto) {
    elementos.loadingText.textContent = texto;
    elementos.loadingOverlay.style.display = 'flex';
}

function ocultarLoading() {
    elementos.loadingOverlay.style.display = 'none';
}

function exibirAlerta(tipo, mensagem) {
    elementos.alertBox.className = `alert ${tipo}`;
    elementos.alertBox.textContent = mensagem;
    elementos.alertBox.style.display = 'flex';
    
    setTimeout(() => {
        elementos.alertBox.style.display = 'none';
    }, tipo === 'success' ? 5000 : 8000);
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function salvarCacheEtapa1(dados) {
    sessionStorage.setItem('poc_etapa1', JSON.stringify(dados));
}

function carregarCacheSeExistir() {
    const cacheEtapa1 = sessionStorage.getItem('poc_etapa1');
    
    if (cacheEtapa1) {
        const dados = JSON.parse(cacheEtapa1);
        AppState.dadosEtapa1 = dados;
        
        exibirAlerta('info', 'Campos preenchidos com o último cadastro.');
        preencherFormulario(dados);
        elementos.formSection.style.display = 'block';
    }
}

function limparCache() {
    if (confirm('Deseja limpar todos os dados em cache?')) {
        sessionStorage.clear();
        location.reload();
    }
}

function resetarFormulario() {
    sessionStorage.clear();
    location.reload();
}

function exportarJSON() {
    const dados = AppState.dadosCompletos || AppState.dadosEtapa1;
    if (!dados) return;
    
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ativo_${dados.numero_patrimonio}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    exibirAlerta('success', '✅ JSON exportado!');
}

function copiarJSON() {
    const dados = AppState.dadosCompletos || AppState.dadosEtapa1;
    if (!dados) return;
    
    navigator.clipboard.writeText(JSON.stringify(dados, null, 2))
        .then(() => exibirAlerta('success', '✅ JSON copiado!'))
        .catch(err => exibirAlerta('error', 'Erro ao copiar: ' + err.message));
}

function inicializarBotoes() {
    elementos.btnProcessarEtapa1.addEventListener('click', processarEtapa1);
    elementos.btnValidarEBuscarPreco.addEventListener('click', processarEtapa2);
    elementos.btnLimparCache.addEventListener('click', limparCache);
    elementos.btnProcessarNovo.addEventListener('click', resetarFormulario);
    elementos.btnExportarJSON.addEventListener('click', exportarJSON);
    elementos.btnCopiarJSON.addEventListener('click', copiarJSON);
}