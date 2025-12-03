// ===================================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// ===================================================================

const CONFIG = {
    apiUrl: 'https://poc-rose-five.vercel.app',
    maxFotos: 3,
    minFotos: 2,
    compressao: {
        qualidade: 0.65,
        resolucaoIA: 512,
        resolucaoStorage: 1024
    }
};

const AppState = {
    fotos: [null, null, null],
    dadosEtapa1: null,
    dadosEtapa2: null
};

const elementos = {
    processarEtapa1: document.getElementById('processarEtapa1'),
    validarEBuscarPreco: document.getElementById('validarEBuscarPreco'),
    exportarJSON: document.getElementById('exportarJSON'),
    copiarJSON: document.getElementById('copiarJSON'),
    processarNovo: document.getElementById('processarNovo'),
    formSection: document.getElementById('formSection'),
    resultSection: document.getElementById('resultSection'),
    helpTextForm: document.getElementById('helpTextForm'),
    numeroPatrimonio: document.getElementById('numeroPatrimonio'),
    nomeProduto: document.getElementById('nomeProduto'),
    estado: document.getElementById('estado'),
    depreciacao: document.getElementById('depreciacao'),
    centroCusto: document.getElementById('centroCusto'),
    unidade: document.getElementById('unidade'),
    descricao: document.getElementById('descricao'),
    valorAtual: document.getElementById('valorAtual'),
    valorMercado: document.getElementById('valorMercado'),
    alertBox: document.getElementById('alertBox'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    resultIdentificacao: document.getElementById('resultIdentificacao'),
    resultClassificacao: document.getElementById('resultClassificacao'),
    resultValores: document.getElementById('resultValores'),
    resultMetadados: document.getElementById('resultMetadados'),
    jsonOutput: document.getElementById('jsonOutput')
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Aplicação iniciada');
    inicializarEventListeners();
    inicializarUploadFotos();
});

function inicializarEventListeners() {
    const btnLimparTudo = document.getElementById('btnLimparTudo');
    if (btnLimparTudo) {
        btnLimparTudo.addEventListener('click', limparTudo);
    }

    if (elementos.processarEtapa1) {
        elementos.processarEtapa1.addEventListener('click', processarEtapa1);
    }
    if (elementos.validarEBuscarPreco) {
        elementos.validarEBuscarPreco.addEventListener('click', processarEtapa2);
    }
    if (elementos.exportarJSON) {
        elementos.exportarJSON.addEventListener('click', exportarJSON);
    }
    if (elementos.copiarJSON) {
        elementos.copiarJSON.addEventListener('click', copiarJSON);
    }
    if (elementos.processarNovo) {
        elementos.processarNovo.addEventListener('click', () => location.reload());
    }
}

function limparTudo() {
    if (confirm('⚠️ Deseja realmente limpar tudo? Esta ação não pode ser desfeita.')) {
        location.reload();
    }
}

async function comprimirImagem(base64, maxResolucao, qualidade) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxResolucao) {
                    height = Math.round((height * maxResolucao) / width);
                    width = maxResolucao;
                }
            } else {
                if (height > maxResolucao) {
                    width = Math.round((width * maxResolucao) / height);
                    height = maxResolucao;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const comprimido = canvas.toDataURL('image/jpeg', qualidade);
            
            const tamanhoOriginal = base64.length;
            const tamanhoComprimido = comprimido.length;
            const reducao = ((tamanhoOriginal - tamanhoComprimido) / tamanhoOriginal) * 100;
            
            console.log('📦 Compressão ' + maxResolucao + 'px:', {
                resolucao: width + 'x' + height,
                qualidade: (qualidade * 100) + '%',
                original: (tamanhoOriginal / 1024).toFixed(0) + ' KB',
                comprimida: (tamanhoComprimido / 1024).toFixed(0) + ' KB',
                reducao: reducao.toFixed(1) + '%'
            });
            
            resolve(comprimido);
        };
        img.src = base64;
    });
}

async function processarImagemDupla(base64Original) {
    console.log('🖼️ Gerando 2 versões da imagem (65% qualidade)...');
    
    const [versaoIA, versaoStorage] = await Promise.all([
        comprimirImagem(
            base64Original, 
            CONFIG.compressao.resolucaoIA, 
            CONFIG.compressao.qualidade
        ),
        comprimirImagem(
            base64Original, 
            CONFIG.compressao.resolucaoStorage, 
            CONFIG.compressao.qualidade
        )
    ]);
    
    return {
        ia: versaoIA,
        storage: versaoStorage,
        timestamp: new Date().toISOString()
    };
}

function inicializarUploadFotos() {
    for (let i = 1; i <= 3; i++) {
        const input = document.getElementById('photo' + i);
        const slot = document.querySelector(`.photo-slot[data-index="${i}"]`);
        
        if (input && slot) {
            input.addEventListener('change', (e) => handleFileSelect(e, i - 1));
            
            const btnRemove = slot.querySelector('.btn-remove');
            if (btnRemove) {
                btnRemove.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removerFoto(i - 1);
                });
            }
        }
    }
    
    document.addEventListener('paste', handlePaste);
    console.log('✅ Upload de fotos inicializado (Ctrl+V ativo)');
}

async function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (item.type.indexOf('image') === -1) continue;
        
        const blob = item.getAsFile();
        if (!blob) continue;
        
        const indexVazio = AppState.fotos.findIndex(f => f === null);
        if (indexVazio === -1) {
            mostrarAlerta('⚠️ Máximo de 3 fotos atingido!', 'warning');
            return;
        }
        
        mostrarAlerta('📋 Imagem colada! Comprimindo...', 'info');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            await adicionarFoto(e.target.result, indexVazio);
        };
        reader.readAsDataURL(blob);
        
        break;
    }
}

function handleFileSelect(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        mostrarAlerta('⚠️ Por favor, selecione apenas imagens!', 'warning');
        return;
    }
    
    mostrarAlerta('🔄 Comprimindo imagem (2 versões)...', 'info');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        await adicionarFoto(e.target.result, index);
    };
    reader.readAsDataURL(file);
}

async function adicionarFoto(base64, index) {
    const slot = document.querySelector(`.photo-slot[data-index="${index + 1}"]`);
    if (!slot) return;
    
    const preview = slot.querySelector('.photo-preview');
    const placeholder = slot.querySelector('.photo-placeholder');
    const btnRemove = slot.querySelector('.btn-remove');
    
    const versoes = await processarImagemDupla(base64);
    
    preview.src = versoes.storage;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    btnRemove.style.display = 'flex';
    
    AppState.fotos[index] = {
        ia: versoes.ia.split(',')[1],
        storage: versoes.storage.split(',')[1],
        thumbnail: versoes.storage,
        timestamp: versoes.timestamp
    };
    
    console.log('✅ Foto ' + (index + 1) + ' adicionada (2 versões)');
    verificarFotosMinimas();
    mostrarAlerta('✅ Foto processada com sucesso!', 'success');
}

function removerFoto(index) {
    const slot = document.querySelector(`.photo-slot[data-index="${index + 1}"]`);
    if (!slot) return;
    
    const preview = slot.querySelector('.photo-preview');
    const placeholder = slot.querySelector('.photo-placeholder');
    const btnRemove = slot.querySelector('.btn-remove');
    const input = document.getElementById('photo' + (index + 1));
    
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    btnRemove.style.display = 'none';
    if (input) input.value = '';
    
    AppState.fotos[index] = null;
    
    console.log('🗑️ Foto ' + (index + 1) + ' removida');
    verificarFotosMinimas();
    mostrarAlerta('🗑️ Foto removida', 'info');
}

function verificarFotosMinimas() {
    const totalFotos = AppState.fotos.filter(f => f !== null).length;
    
    if (elementos.processarEtapa1) {
        if (totalFotos >= CONFIG.minFotos) {
            elementos.processarEtapa1.disabled = false;
            elementos.processarEtapa1.classList.add('ready');
        } else {
            elementos.processarEtapa1.disabled = true;
            elementos.processarEtapa1.classList.remove('ready');
        }
    }
    
    console.log('📸 Fotos válidas:', totalFotos + '/' + CONFIG.minFotos);
}

async function processarEtapa1() {
    console.log('🔍 Iniciando Etapa 1...');
    
    const fotosValidas = AppState.fotos.filter(f => f !== null);
    
    if (fotosValidas.length < CONFIG.minFotos) {
        mostrarAlerta('⚠️ Adicione pelo menos ' + CONFIG.minFotos + ' fotos!', 'warning');
        return;
    }
    
    mostrarLoading('🤖 Analisando imagens com IA...');
    
    try {
        const imagensParaIA = fotosValidas.map(foto => ({
            data: foto.ia,
            timestamp: foto.timestamp
        }));
        
        console.log('📤 Enviando ' + imagensParaIA.length + ' imagens (512px) para API...');
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagens: imagensParaIA })
        });
        
        const resultado = await response.json();
        
        console.log('📥 Etapa 1 - Resposta:', resultado);
        
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa1 = resultado.dados;
            preencherFormulario(resultado.dados);
            mostrarAlerta('✅ ' + resultado.mensagem, 'success');
            
            if (resultado.dados.metadados?.custo_total) {
                console.log('💰 Custo Etapa 1: R$', resultado.dados.metadados.custo_total);
            }
        } else {
            throw new Error(resultado.mensagem || 'Erro na Etapa 1');
        }
        
    } catch (error) {
        console.error('❌ Erro na Etapa 1:', error);
        mostrarAlerta('❌ Erro: ' + error.message, 'error');
    } finally {
        esconderLoading();
    }
}

function preencherFormulario(dados) {
    if (elementos.numeroPatrimonio) elementos.numeroPatrimonio.value = dados.numero_patrimonio || '';
    if (elementos.nomeProduto) elementos.nomeProduto.value = dados.nome_produto || '';
    if (elementos.estado) elementos.estado.value = dados.estado_conservacao || '';
    if (elementos.depreciacao) elementos.depreciacao.value = dados.categoria_depreciacao || '';
    if (elementos.descricao) elementos.descricao.value = dados.descricao || '';
    
    if (elementos.formSection) elementos.formSection.style.display = 'block';
    if (elementos.helpTextForm) elementos.helpTextForm.style.display = 'block';
    
    console.log('✅ Formulário preenchido');
}

async function processarEtapa2() {
    console.log('💰 Iniciando Etapa 2...');
    
    if (!AppState.dadosEtapa1) {
        mostrarAlerta('⚠️ Execute a Etapa 1 primeiro!', 'warning');
        return;
    }
    
    const payload = {
        nome_produto: elementos.nomeProduto.value || AppState.dadosEtapa1.nome_produto,
        termo_busca_comercial: AppState.dadosEtapa1.termo_busca_comercial,
        marca: AppState.dadosEtapa1.marca,
        modelo: AppState.dadosEtapa1.modelo,
        especificacoes: AppState.dadosEtapa1.especificacoes,
        estado_conservacao: elementos.estado.value,
        categoria_depreciacao: elementos.depreciacao.value,
        numero_patrimonio: elementos.numeroPatrimonio.value
    };
    
    mostrarLoading('🔍 Buscando preços de mercado...');
    
    try {
        console.log('📤 Enviando dados para busca de preço...');
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const resultado = await response.json();
        
        console.log('📥 Etapa 2 - Resposta:', resultado);
        
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa2 = resultado.dados;
            atualizarValores(resultado.dados);
            mostrarResultadoFinal();
            mostrarAlerta('✅ ' + resultado.mensagem, 'success');
            
            if (resultado.dados.meta?.custo_total) {
                console.log('💰 Custo Etapa 2: R$', resultado.dados.meta.custo_total);
            }
        } else {
            throw new Error(resultado.mensagem || 'Erro na Etapa 2');
        }
        
    } catch (error) {
        console.error('❌ Erro na Etapa 2:', error);
        mostrarAlerta('❌ Erro: ' + error.message, 'error');
    } finally {
        esconderLoading();
    }
}

function atualizarValores(dados) {
    if (elementos.valorMercado && dados.valores) {
        elementos.valorMercado.value = formatarMoeda(dados.valores.mercado);
    }
    if (elementos.valorAtual && dados.valores) {
        elementos.valorAtual.value = formatarMoeda(dados.valores.atual);
    }
    
    console.log('✅ Valores atualizados');
}

function mostrarResultadoFinal() {
    if (!elementos.resultSection || !AppState.dadosEtapa2) return;
    
    const dados = AppState.dadosEtapa2;
    
    if (elementos.resultIdentificacao) {
        elementos.resultIdentificacao.innerHTML = `
            <p><strong>Placa:</strong> ${dados.numero_patrimonio || 'N/A'}</p>
            <p><strong>Nome:</strong> ${dados.nome_produto}</p>
            <p><strong>Marca/Modelo:</strong> ${dados.marca} / ${dados.modelo}</p>
            <p><strong>Especificações:</strong> ${dados.especificacoes}</p>
        `;
    }
    
    if (elementos.resultClassificacao) {
        elementos.resultClassificacao.innerHTML = `
            <p><strong>Estado:</strong> ${dados.estado_conservacao}</p>
            <p><strong>Depreciação:</strong> ${dados.categoria_depreciacao}</p>
            <p><strong>Descrição:</strong> ${dados.descricao}</p>
        `;
    }
    
    if (elementos.resultValores && dados.valores) {
        elementos.resultValores.innerHTML = `
            <p><strong>Mercado:</strong> ${formatarMoeda(dados.valores.mercado)}</p>
            <p><strong>Atual:</strong> ${formatarMoeda(dados.valores.atual)}</p>
            <p><strong>Depreciação:</strong> ${dados.valores.percentual_dep}</p>
            <p><strong>Método:</strong> ${dados.valores.metodo}</p>
            <p><strong>Confiança:</strong> ${dados.valores.confianca}%</p>
        `;
    }
    
    if (elementos.resultMetadados && dados.meta) {
        elementos.resultMetadados.innerHTML = `
            <p><strong>Data:</strong> ${new Date(dados.meta.data).toLocaleString('pt-BR')}</p>
            <p><strong>Versão:</strong> ${dados.meta.versao}</p>
            <p><strong>Custo LLM:</strong> R$ ${dados.meta.custo_llm?.toFixed(4) || '0.0000'}</p>
        `;
    }
    
    if (dados.precos && dados.precos.length > 0) {
        const precosHtml = dados.precos.map((p, i) => `
            <div class="preco-item">
                <strong>#${i + 1}</strong> - 
                <span class="preco-valor">${formatarMoeda(p.v)}</span> - 
                <span class="preco-fonte">${p.f}</span>
                <button class="btn-link-mini" onclick="window.open('${p.u}', '_blank')">🔗 Ver</button>
            </div>
        `).join('');
        
        const secaoPrecos = document.createElement('div');
        secaoPrecos.className = 'result-section';
        secaoPrecos.innerHTML = `
            <h4>Preços Encontrados (${dados.precos.length})</h4>
            ${precosHtml}
        `;
        
        if (elementos.resultValores) {
            elementos.resultValores.parentElement.appendChild(secaoPrecos);
        }
    }
    
    if (elementos.jsonOutput) {
        elementos.jsonOutput.textContent = JSON.stringify(dados, null, 2);
    }
    
    elementos.resultSection.style.display = 'block';
    elementos.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportarJSON() {
    const dados = {
        etapa1: AppState.dadosEtapa1,
        etapa2: AppState.dadosEtapa2,
        fotos: AppState.fotos.filter(f => f !== null).map(f => f.thumbnail)
    };
    
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ativo_' + new Date().getTime() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    mostrarAlerta('💾 JSON exportado!', 'success');
}

function copiarJSON() {
    const json = AppState.dadosEtapa2 ? JSON.stringify(AppState.dadosEtapa2, null, 2) : '{}';
    navigator.clipboard.writeText(json).then(() => {
        mostrarAlerta('📋 JSON copiado!', 'success');
    });
}

function formatarMoeda(valor) {
    return 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
}

function mostrarAlerta(mensagem, tipo = 'info') {
    if (!elementos.alertBox) return;
    
    elementos.alertBox.textContent = mensagem;
    elementos.alertBox.className = 'alert ' + tipo;
    elementos.alertBox.style.display = 'flex';
    
    setTimeout(() => {
        elementos.alertBox.style.display = 'none';
    }, 5000);
}

function mostrarLoading(texto = 'Processando...') {
    if (elementos.loadingOverlay) elementos.loadingOverlay.style.display = 'flex';
    if (elementos.loadingText) elementos.loadingText.textContent = texto;
}

function esconderLoading() {
    if (elementos.loadingOverlay) elementos.loadingOverlay.style.display = 'none';
}

console.log('✅ App.js carregado e pronto!');