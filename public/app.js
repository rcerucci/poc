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
// PROCESSAR ETAPA 2
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
            
            elementos.jsonOutput.innerHTML = '<pre>' + JSON.stringify(resultado, null, 2) + '</pre>';
            elementos.resultSection.scrollIntoView({ behavior: 'smooth' });
            
            esconderLoading();
            return;
        }
        
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa2 = resultado;
            
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
// MOSTRAR RESULTADO - VISUALIZADOR INTELIGENTE
// ===================================================================

function mostrarResultado(resultado) {
    const dados = resultado.dados;
    
    elementos.resultIdentificacao.innerHTML = `
        <p><strong>Placa:</strong> ${dados.numero_patrimonio}</p>
        <p><strong>Nome:</strong> ${dados.nome_produto}</p>
        <p><strong>Marca:</strong> ${dados.marca}</p>
        <p><strong>Modelo:</strong> ${dados.modelo}</p>
        <p><strong>Especificações:</strong> ${dados.especificacoes}</p>
    `;
    
    elementos.resultClassificacao.innerHTML = `
        <p><strong>Estado:</strong> ${dados.estado_conservacao}</p>
        <p><strong>Categoria:</strong> ${dados.categoria_depreciacao}</p>
    `;
    
    const valores = dados.valores_estimados || dados.valores;
    const valorMercado = valores.valor_mercado_estimado || valores.mercado;
    const valorAtual = valores.valor_atual_estimado || valores.atual;
    const fatorDep = valores.fator_depreciacao || valores.depreciacao;
    const confianca = valores.score_confianca || valores.confianca;
    const metodo = valores.fonte_preco || valores.metodo || 'N/A';
    
    let corConfianca = '#28a745';
    if (confianca < 50) corConfianca = '#dc3545';
    else if (confianca < 70) corConfianca = '#ffc107';
    
    elementos.resultValores.innerHTML = `
        <p><strong>Mercado:</strong> R$ ${valorMercado.toFixed(2)}</p>
        <p><strong>Atual:</strong> R$ ${valorAtual.toFixed(2)}</p>
        <p><strong>Depreciação:</strong> ${(fatorDep * 100).toFixed(0)}%</p>
        <p><strong>Método:</strong> ${metodo}</p>
        <p><strong>Confiança:</strong> <span style="color: ${corConfianca}; font-weight: bold;">${confianca.toFixed(0)}%</span></p>
    `;
    
    const meta = dados.metadados || dados.meta;
    const dataBusca = meta.data_busca || meta.data;
    const modeloIA = meta.modelo_ia || meta.modelo;
    const custoTotal = meta.custo_total || meta.custo;
    
    const stats = dados.analise_estatistica || dados.stats;
    const numPrecos = stats?.num_precos_coletados || stats?.num || 0;
    
    const busca = dados.estrategia_busca || dados.busca;
    const termoBusca = busca?.termo_utilizado || busca?.termo || 'N/A';
    
    elementos.resultMetadados.innerHTML = `
        <p><strong>Preços encontrados:</strong> ${numPrecos}</p>
        <p><strong>Termo de busca:</strong> ${termoBusca}</p>
        <p><strong>Data:</strong> ${new Date(dataBusca).toLocaleString('pt-BR')}</p>
        <p><strong>Modelo IA:</strong> ${modeloIA}</p>
        <p><strong>Custo total:</strong> R$ ${custoTotal?.toFixed(4) || '0.0000'}</p>
    `;
    
    const jsonFormatado = gerarJSONFormatado(dados);
    elementos.jsonOutput.innerHTML = jsonFormatado;
    
    elementos.resultSection.style.display = 'block';
    elementos.resultSection.scrollIntoView({ behavior: 'smooth' });
}

// ===================================================================
// GERAR JSON FORMATADO
// ===================================================================

function gerarJSONFormatado(dados) {
    const valores = dados.valores_estimados || dados.valores;
    const stats = dados.analise_estatistica || dados.stats;
    const precos = dados.precos_coletados || dados.precos;
    const busca = dados.estrategia_busca || dados.busca;
    const meta = dados.metadados || dados.meta;
    
    const valorMercado = valores.valor_mercado_estimado || valores.mercado;
    const valorAtual = valores.valor_atual_estimado || valores.atual;
    const fatorDep = valores.fator_depreciacao || valores.depreciacao;
    const confianca = valores.score_confianca || valores.confianca;
    const metodo = valores.fonte_preco || valores.metodo;
    
    const numPrecos = stats?.num_precos_coletados || stats?.num || 0;
    const min = stats?.preco_minimo || stats?.min || 0;
    const max = stats?.preco_maximo || stats?.max || 0;
    const desvio = stats?.desvio_padrao || stats?.desvio || 0;
    const coefVar = stats?.coeficiente_variacao || stats?.coef_var || 0;
    
    const termoBusca = busca?.termo_utilizado || busca?.termo || 'N/A';
    const numBusca = busca?.num_precos_reais || busca?.num || 0;
    
    const dataBusca = meta?.data_busca || meta?.data;
    const modeloIA = meta?.modelo_ia || meta?.modelo;
    const versao = meta?.versao_sistema || meta?.versao;
    const custoTotal = meta?.custo_total || meta?.custo;
    
    const tokensIn = meta?.tokens_input || meta?.tokens?.in || 0;
    const tokensOut = meta?.tokens_output || meta?.tokens?.out || 0;
    const tokensTotal = meta?.tokens_total || meta?.tokens?.total || 0;
    
    return `
<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>📊 IDENTIFICAÇÃO</strong>
    </div>
    <div class="json-content" style="display: none;">
        <table class="json-table">
            <tr><td>Placa</td><td>${dados.numero_patrimonio}</td></tr>
            <tr><td>Nome</td><td>${dados.nome_produto}</td></tr>
            <tr><td>Marca</td><td>${dados.marca}</td></tr>
            <tr><td>Modelo</td><td>${dados.modelo}</td></tr>
            <tr><td>Especificações</td><td>${dados.especificacoes}</td></tr>
            <tr><td>Estado</td><td>${dados.estado_conservacao}</td></tr>
            <tr><td>Categoria</td><td>${dados.categoria_depreciacao}</td></tr>
        </table>
    </div>
</div>

<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>💰 VALORES</strong>
    </div>
    <div class="json-content" style="display: none;">
        <table class="json-table">
            <tr><td>Valor Mercado</td><td>R$ ${valorMercado.toFixed(2)}</td></tr>
            <tr><td>Valor Atual</td><td>R$ ${valorAtual.toFixed(2)}</td></tr>
            <tr><td>Depreciação</td><td>${(fatorDep * 100).toFixed(0)}%</td></tr>
            <tr><td>Método</td><td>${metodo}</td></tr>
            <tr><td>Confiança</td><td>${confianca.toFixed(1)}%</td></tr>
        </table>
    </div>
</div>

<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>📈 ESTATÍSTICAS (${numPrecos} preços)</strong>
    </div>
    <div class="json-content" style="display: none;">
        <table class="json-table">
            <tr><td>Preços Coletados</td><td>${numPrecos}</td></tr>
            <tr><td>Mínimo</td><td>R$ ${min.toFixed(2)}</td></tr>
            <tr><td>Máximo</td><td>R$ ${max.toFixed(2)}</td></tr>
            <tr><td>Desvio Padrão</td><td>R$ ${desvio.toFixed(2)}</td></tr>
            <tr><td>Coef. Variação</td><td>${coefVar.toFixed(2)}%</td></tr>
            <tr><td>Confiança</td><td>${confianca.toFixed(1)}%</td></tr>
        </table>
    </div>
</div>

<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>🔍 BUSCA</strong>
    </div>
    <div class="json-content" style="display: none;">
        <table class="json-table">
            <tr><td>Termo Utilizado</td><td><code>${termoBusca}</code></td></tr>
            <tr><td>Preços Encontrados</td><td>${numBusca}</td></tr>
        </table>
    </div>
</div>

<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>💵 PREÇOS COLETADOS (${precos?.length || 0})</strong>
    </div>
    <div class="json-content" style="display: none;">
        <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
            <table class="json-table" style="min-width: 600px;">
                <thead>
                    <tr>
                        <th>Valor</th>
                        <th>Fonte</th>
                        <th>Match</th>
                        <th>Produto</th>
                        <th style="min-width: 100px;">Link</th>
                    </tr>
                </thead>
                <tbody>
                    ${(precos || []).map(p => {
                        const valor = p.valor || p.v;
                        const fonte = p.fonte || p.f;
                        const match = p.tipo_match || p.match || p.m;
                        const produto = p.produto || p.p;
                        const url = p.url || p.u;
                        
                        let corMatch = '#6c757d';
                        if (match === 'Exato') corMatch = '#28a745';
                        else if (match === 'Equivalente') corMatch = '#007bff';
                        else if (match === 'Substituto') corMatch = '#ffc107';
                        
                        return `
                        <tr>
                            <td style="white-space: nowrap;">R$ ${valor.toFixed(2)}</td>
                            <td style="white-space: nowrap;">${fonte}</td>
                            <td><span style="color: ${corMatch}; font-weight: bold; white-space: nowrap;">${match}</span></td>
                            <td><small>${produto}</small></td>
                            <td style="text-align: center;">
                                ${url ? 
                                    `<button onclick="abrirModalAnuncio('${url}', '${produto.replace(/'/g, "\\'")}'); event.stopPropagation();" 
                                        title="Ver anúncio original"
                                        style="
                                        background: #667eea;
                                        color: white;
                                        border: none;
                                        padding: 6px 12px;
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                        font-weight: 500;
                                        display: inline-flex;
                                        align-items: center;
                                        gap: 4px;
                                        transition: all 0.2s;
                                        white-space: nowrap;
                                    " onmouseover="this.style.background='#5a67d8'" onmouseout="this.style.background='#667eea'">
                                        🔗 Ver
                                    </button>` 
                                    : `<span style="color: #a0aec0; font-size: 11px;" title="Link não disponível">-</span>`
                                }
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ${(precos || []).filter(p => !(p.url || p.u)).length > 0 ? `
            <div style="margin-top: 10px; padding: 10px; background: #fff3cd; border-radius: 6px; font-size: 12px; color: #856404;">
                ℹ️ Alguns preços não têm link disponível. Isso pode ocorrer quando o produto foi encontrado mas o link expirou ou é de acesso restrito.
            </div>
        ` : ''}
    </div>
</div>

<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>⚙️ METADADOS</strong>
    </div>
    <div class="json-content" style="display: none;">
        <table class="json-table">
            <tr><td>Data</td><td>${new Date(dataBusca).toLocaleString('pt-BR')}</td></tr>
            <tr><td>Modelo IA</td><td>${modeloIA}</td></tr>
            <tr><td>Versão Sistema</td><td>${versao}</td></tr>
            <tr><td>Tokens Input</td><td>${tokensIn.toLocaleString()}</td></tr>
            <tr><td>Tokens Output</td><td>${tokensOut.toLocaleString()}</td></tr>
            <tr><td>Tokens Total</td><td>${tokensTotal.toLocaleString()}</td></tr>
            <tr><td>Custo Total</td><td>R$ ${custoTotal.toFixed(4)}</td></tr>
        </table>
    </div>
</div>

<div class="json-section">
    <div class="json-header" onclick="toggleSection(this)">
        <span class="json-toggle">▶</span>
        <strong>📄 JSON BRUTO</strong>
    </div>
    <div class="json-content" style="display: none;">
        <pre>${JSON.stringify(dados, null, 2)}</pre>
    </div>
</div>
    `.trim();
}

// ===================================================================
// TOGGLE DE SEÇÕES
// ===================================================================

function toggleSection(header) {
    const content = header.nextElementSibling;
    const toggle = header.querySelector('.json-toggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// ===================================================================
// MODAL DE ANÚNCIO COM FALLBACK
// ===================================================================

function abrirModalAnuncio(url, produto) {
    // Criar modal
    const modal = document.createElement('div');
    modal.id = 'modalAnuncio';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;
    
    // Container do iframe
    const container = document.createElement('div');
    container.style.cssText = `
        background: white;
        border-radius: 12px;
        width: 100%;
        max-width: 1200px;
        height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    `;
    
    // Header do modal
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 20px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f7fafc;
        border-radius: 12px 12px 0 0;
    `;
    
    const title = document.createElement('div');
    title.style.cssText = `
        font-weight: 600;
        color: #2d3748;
        font-size: 16px;
        flex: 1;
    `;
    title.textContent = produto || 'Anúncio';
    
    // Botão abrir em nova aba
    const openBtn = document.createElement('button');
    openBtn.innerHTML = '🔗 Abrir Nova Aba';
    openBtn.style.cssText = `
        background: #667eea;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        margin-right: 10px;
        transition: all 0.2s;
    `;
    openBtn.onmouseover = () => openBtn.style.background = '#5a67d8';
    openBtn.onmouseout = () => openBtn.style.background = '#667eea';
    openBtn.onclick = () => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #718096;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => {
        closeBtn.style.background = '#edf2f7';
        closeBtn.style.color = '#2d3748';
    };
    closeBtn.onmouseout = () => {
        closeBtn.style.background = 'none';
        closeBtn.style.color = '#718096';
    };
    closeBtn.onclick = () => fecharModalAnuncio();
    
    header.appendChild(title);
    header.appendChild(openBtn);
    header.appendChild(closeBtn);
    
    // Container de conteúdo
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = `
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f7fafc;
        border-radius: 0 0 12px 12px;
        position: relative;
    `;
    
    // Loading
    const loading = document.createElement('div');
    loading.innerHTML = '⏳ Carregando...';
    loading.style.cssText = `
        position: absolute;
        color: #718096;
        font-size: 14px;
    `;
    iframeContainer.appendChild(loading);
    
    // Iframe
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 0 0 12px 12px;
        display: none;
    `;
    
    // Detectar se iframe carregou ou foi bloqueado
    let iframeBlocked = false;
    let fallbackTimeout = setTimeout(() => {
        if (!iframe.contentWindow || !iframe.contentDocument) {
            iframeBlocked = true;
            mostrarFallback();
        }
    }, 3000);
    
    iframe.onload = () => {
        clearTimeout(fallbackTimeout);
        try {
            // Tenta acessar o iframe
            const test = iframe.contentWindow.location.href;
            loading.style.display = 'none';
            iframe.style.display = 'block';
        } catch (e) {
            // Bloqueado por CSP
            iframeBlocked = true;
            mostrarFallback();
        }
    };
    
    iframe.onerror = () => {
        clearTimeout(fallbackTimeout);
        iframeBlocked = true;
        mostrarFallback();
    };
    
    function mostrarFallback() {
        loading.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
                <div style="font-size: 18px; font-weight: 600; color: #2d3748; margin-bottom: 10px;">
                    Este site não permite visualização em modal
                </div>
                <div style="font-size: 14px; color: #718096; margin-bottom: 20px;">
                    Clique no botão abaixo para abrir em uma nova aba
                </div>
                <button onclick="window.open('${url}', '_blank'); fecharModalAnuncio();" style="
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                ">
                    🔗 Abrir em Nova Aba
                </button>
            </div>
        `;
        iframe.style.display = 'none';
    }
    
    iframeContainer.appendChild(iframe);
    
    // Montar modal
    container.appendChild(header);
    container.appendChild(iframeContainer);
    modal.appendChild(container);
    document.body.appendChild(modal);
    
    // Fechar ao clicar fora
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            fecharModalAnuncio();
        }
    });
    
    // Fechar com ESC
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            fecharModalAnuncio();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function fecharModalAnuncio() {
    const modal = document.getElementById('modalAnuncio');
    if (modal) {
        modal.remove();
    }
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
    const json = AppState.dadosEtapa2 ? JSON.stringify(AppState.dadosEtapa2, null, 2) : '{}';
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