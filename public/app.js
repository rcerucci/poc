// ===================================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// ===================================================================

const CONFIG = {
    apiUrl: 'https://poc-rose-five.vercel.app',
    maxFotos: 3,
    minFotos: 2,
    compressao: {
        qualidade: 0.65,
        maxResolucao: 1024
    }
};

const AppState = {
    fotos: [null, null, null],
    dadosEtapa1: null,
    dadosEtapa2: null
};

// ===================================================================
// ELEMENTOS DO DOM
// ===================================================================

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

// ===================================================================
// INICIALIZAÇÃO
// ===================================================================

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

// ===================================================================
// LIMPAR TUDO
// ===================================================================

function limparTudo() {
    if (confirm('⚠️ Deseja realmente limpar tudo? Esta ação não pode ser desfeita.')) {
        location.reload();
    }
}

// ===================================================================
// COMPRESSÃO DE IMAGENS
// ===================================================================

async function comprimirImagem(base64, qualidade = 0.65, maxResolucao = 1024) {
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
            
            console.log('📦 Compressão:', {
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

// ===================================================================
// UPLOAD DE FOTOS
// ===================================================================

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
    console.log('✅ Upload de fotos inicializado');
}

function handleFileSelect(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        mostrarAlerta('⚠️ Por favor, selecione apenas imagens!', 'warning');
        return;
    }
    
    mostrarAlerta('🔄 Comprimindo imagem...', 'info');
    
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
    
    const base64Comprimido = await comprimirImagem(
        base64,
        CONFIG.compressao.qualidade,
        CONFIG.compressao.maxResolucao
    );
    
    preview.src = base64Comprimido;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    btnRemove.style.display = 'flex';
    
    AppState.fotos[index] = {
        data: base64Comprimido.split(',')[1],
        timestamp: new Date().toISOString(),
        thumbnail: base64Comprimido
    };
    
    console.log('✅ Foto ' + (index + 1) + ' adicionada');
    verificarFotosMinimas();
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
        elementos.processarEtapa1.disabled = totalFotos < CONFIG.minFotos;
    }
    
    console.log('📸 Total:', totalFotos + '/' + CONFIG.maxFotos);
}

// ===================================================================
// CTRL+V PARA COLAR IMAGENS
// ===================================================================

document.addEventListener('paste', (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            event.preventDefault();
            
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                const indexVazio = AppState.fotos.findIndex(f => f === null);
                
                if (indexVazio !== -1) {
                    mostrarAlerta('🔄 Comprimindo imagem colada...', 'info');
                    await adicionarFoto(e.target.result, indexVazio);
                    mostrarAlerta('✅ Imagem colada no slot ' + (indexVazio + 1), 'success');
                } else {
                    mostrarAlerta('⚠️ Todos os slots estão preenchidos!', 'warning');
                }
            };
            
            reader.readAsDataURL(blob);
            break;
        }
    }
});

// ===================================================================
// PROCESSAR ETAPA 1
// ===================================================================

async function processarEtapa1() {
    console.log('🔍 Iniciando Etapa 1');
    
    const fotosValidas = AppState.fotos.filter(f => f !== null);
    
    if (fotosValidas.length < CONFIG.minFotos) {
        mostrarAlerta('⚠️ Adicione pelo menos ' + CONFIG.minFotos + ' fotos!', 'warning');
        return;
    }
    
    const tamanhoTotal = fotosValidas.reduce((acc, f) => acc + f.data.length, 0);
    console.log('📊 Tamanho total:', (tamanhoTotal / 1024).toFixed(0) + ' KB');
    
    mostrarLoading('🤖 Extraindo dados das imagens...');
    
    try {
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagens: fotosValidas })
        });
        
        if (!response.ok) {
            throw new Error('Erro HTTP: ' + response.status);
        }
        
        const resultado = await response.json();
        console.log('✅ Etapa 1 concluída:', resultado);
        
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa1 = resultado;
            preencherFormulario(resultado.dados);
            
            elementos.formSection.style.display = 'block';
            elementos.helpTextForm.style.display = 'block';
            
            mostrarAlerta('✅ Dados extraídos! Valide e busque o preço.', 'success');
        } else {
            throw new Error(resultado.mensagem || 'Erro na extração');
        }
        
    } catch (erro) {
        console.error('❌ Erro Etapa 1:', erro);
        mostrarAlerta('❌ Erro: ' + erro.message, 'error');
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
    
    bloquearCampos([
        elementos.numeroPatrimonio,
        elementos.nomeProduto,
        elementos.estado,
        elementos.depreciacao,
        elementos.descricao
    ]);
    
    console.log('📋 Formulário preenchido');
}

function bloquearCampos(campos) {
    campos.forEach(campo => {
        if (campo) {
            if (campo.tagName === 'SELECT') {
                campo.disabled = true;
            } else {
                campo.readOnly = true;
            }
            
            campo.addEventListener('click', function() {
                this.select();
                document.execCommand('copy');
                mostrarAlerta('📋 Copiado: ' + this.value.substring(0, 30) + '...', 'info');
            });
        }
    });
}

// ===================================================================
// PROCESSAR ETAPA 2 - ✅ CORRIGIDO
// ===================================================================

async function processarEtapa2() {
    console.log('🔍 Iniciando Etapa 2');
    
    if (!AppState.dadosEtapa1) {
        mostrarAlerta('⚠️ Execute a Etapa 1 primeiro!', 'warning');
        return;
    }
    
    const dadosEtapa1 = AppState.dadosEtapa1.dados;
    
    const dadosParaBusca = {
        numero_patrimonio: elementos.numeroPatrimonio?.value || dadosEtapa1.numero_patrimonio || 'N/A',
        nome_produto: elementos.nomeProduto?.value || dadosEtapa1.nome_produto || 'N/A',
        marca: dadosEtapa1.marca || 'N/A',
        modelo: dadosEtapa1.modelo || 'N/A',
        especificacoes: dadosEtapa1.especificacoes || 'N/A',
        descricao: dadosEtapa1.descricao || elementos.descricao?.value || 'N/A',
        estado_conservacao: elementos.estado?.value || dadosEtapa1.estado_conservacao || 'Bom',
        categoria_depreciacao: elementos.depreciacao?.value || dadosEtapa1.categoria_depreciacao || 'Outros'
    };
    
    console.log('📤 Enviando para Etapa 2:', dadosParaBusca);
    
    mostrarLoading('💰 Buscando preços de mercado...');
    
    try {
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosParaBusca)
        });
        
        if (!response.ok) {
            throw new Error('Erro HTTP: ' + response.status);
        }
        
        const resultado = await response.json();
        console.log('✅ Etapa 2 concluída:', resultado);
        
        // ✅ TRATAR "SEM PREÇOS" COMO RESULTADO VÁLIDO
        if (resultado.status === 'Sem Preços') {
            console.log('ℹ️ Produto sem preços online');
            
            AppState.dadosEtapa2 = resultado;
            
            mostrarAlerta('ℹ️ ' + resultado.mensagem, 'info');
            
            // Mostrar resultado "sem preços"
            elementos.resultSection.style.display = 'block';
            
            elementos.resultIdentificacao.innerHTML = `
                <p><strong>Placa:</strong> ${dadosParaBusca.numero_patrimonio}</p>
                <p><strong>Nome:</strong> ${dadosParaBusca.nome_produto}</p>
                <p><strong>Marca:</strong> ${dadosParaBusca.marca}</p>
                <p><strong>Modelo:</strong> ${dadosParaBusca.modelo}</p>
            `;
            
            elementos.resultClassificacao.innerHTML = `
                <p><strong>Estado:</strong> ${dadosParaBusca.estado_conservacao}</p>
                <p><strong>Categoria:</strong> ${dadosParaBusca.categoria_depreciacao}</p>
            `;
            
            elementos.resultValores.innerHTML = `
                <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px;">
                    <p style="margin: 0 0 10px 0;"><strong>⚠️ Sem Preços Online</strong></p>
                    <p style="margin: 0 0 10px 0; color: #666;">${resultado.mensagem}</p>
                    <p style="margin: 0; font-size: 0.9em; color: #666;">
                        💡 Produto específico/industrial sem vendas online visíveis. Recomenda-se cotação manual.
                    </p>
                </div>
            `;
            
            elementos.resultMetadados.innerHTML = `
                <p><strong>Termo buscado:</strong> ${resultado.dados?.termo_utilizado || 'N/A'}</p>
                <p><strong>Custo busca:</strong> R$ ${resultado.meta?.custo?.toFixed(4) || '0.0000'}</p>
                <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            `;
            
            elementos.jsonOutput.textContent = JSON.stringify(resultado, null, 2);
            elementos.resultSection.scrollIntoView({ behavior: 'smooth' });
            
            esconderLoading();
            return; // ✅ NÃO é erro!
        }
        
        // ✅ SUCESSO COM PREÇOS
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa2 = resultado;
            
            // Compatível com ambos os formatos
            const valores = resultado.dados.valores_estimados || resultado.dados.valores;
            const valorMercado = valores.valor_mercado_estimado || valores.mercado;
            const valorAtual = valores.valor_atual_estimado || valores.atual;
            
            if (elementos.valorMercado) elementos.valorMercado.value = formatarMoeda(valorMercado);
            if (elementos.valorAtual) elementos.valorAtual.value = formatarMoeda(valorAtual);
            
            bloquearCampos([elementos.valorMercado, elementos.valorAtual]);
            
            mostrarResultado(resultado);
            
            const confianca = valores.score_confianca || valores.confianca || 0;
            mostrarAlerta('✅ Precificação concluída! Score: ' + confianca.toFixed(0) + '%', 'success');
        } else {
            throw new Error(resultado.mensagem || 'Falha na precificação');
        }
        
    } catch (erro) {
        console.error('❌ Erro Etapa 2:', erro);
        mostrarAlerta('❌ Erro: ' + erro.message, 'error');
    } finally {
        esconderLoading();
    }
}

// ===================================================================
// MOSTRAR RESULTADO - ✅ COMPATÍVEL
// ===================================================================

function mostrarResultado(resultado) {
    const dados = resultado.dados;
    
    elementos.resultIdentificacao.innerHTML = `
        <p><strong>Placa:</strong> ${dados.numero_patrimonio}</p>
        <p><strong>Nome:</strong> ${dados.nome_produto}</p>
        <p><strong>Marca:</strong> ${dados.marca}</p>
        <p><strong>Modelo:</strong> ${dados.modelo}</p>
    `;
    
    elementos.resultClassificacao.innerHTML = `
        <p><strong>Estado:</strong> ${dados.estado_conservacao}</p>
        <p><strong>Categoria:</strong> ${dados.categoria_depreciacao}</p>
    `;
    
    // ✅ Compatível com ambos os formatos
    const valores = dados.valores_estimados || dados.valores;
    const valorMercado = valores.valor_mercado_estimado || valores.mercado;
    const valorAtual = valores.valor_atual_estimado || valores.atual;
    const fatorDep = valores.fator_depreciacao || valores.depreciacao;
    const confianca = valores.score_confianca || valores.confianca;
    const metodo = valores.fonte_preco || valores.metodo || 'N/A';
    
    // ✅ Indicador visual de confiança
    let corConfianca = '#28a745'; // verde
    if (confianca < 50) corConfianca = '#dc3545'; // vermelho
    else if (confianca < 70) corConfianca = '#ffc107'; // amarelo
    
    elementos.resultValores.innerHTML = `
        <p><strong>Mercado:</strong> R$ ${valorMercado.toFixed(2)}</p>
        <p><strong>Atual:</strong> R$ ${valorAtual.toFixed(2)}</p>
        <p><strong>Depreciação:</strong> ${(fatorDep * 100).toFixed(0)}%</p>
        <p><strong>Método:</strong> ${metodo}</p>
        <p><strong>Confiança:</strong> <span style="color: ${corConfianca}; font-weight: bold;">${confianca.toFixed(0)}%</span></p>
    `;
    
    // Metadados compatível
    const meta = dados.metadados || dados.meta;
    const dataBusca = meta.data_busca || meta.data;
    const modeloIA = meta.modelo_ia || meta.modelo;
    const custoTotal = meta.custo_total || meta.custo;
    
    // Stats compatível
    const stats = dados.analise_estatistica || dados.stats;
    const numPrecos = stats?.num_precos_coletados || stats?.num || 0;
    
    elementos.resultMetadados.innerHTML = `
        <p><strong>Preços encontrados:</strong> ${numPrecos}</p>
        <p><strong>Data:</strong> ${new Date(dataBusca).toLocaleString('pt-BR')}</p>
        <p><strong>Modelo IA:</strong> ${modeloIA}</p>
        <p><strong>Custo total:</strong> R$ ${custoTotal?.toFixed(4) || '0.0000'}</p>
    `;
    
    elementos.jsonOutput.textContent = JSON.stringify(resultado, null, 2);
    
    elementos.resultSection.style.display = 'block';
    elementos.resultSection.scrollIntoView({ behavior: 'smooth' });
}

// ===================================================================
// EXPORTAR E COPIAR JSON
// ===================================================================

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
    const json = elementos.jsonOutput.textContent;
    navigator.clipboard.writeText(json).then(() => {
        mostrarAlerta('📋 JSON copiado!', 'success');
    });
}

// ===================================================================
// UTILITÁRIOS
// ===================================================================

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