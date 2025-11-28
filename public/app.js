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
    carregarCacheSeExistir();
});

// ============================================
// GESTÃO DE FOTOS
// ============================================

function inicializarEventosUpload() {
    for (let i = 1; i <= 4; i++) {
        const input = document.getElementById(`photo${i}`);
        const slot = input.closest('.photo-slot');
        const preview = slot.querySelector('.photo-preview');
        const placeholder = slot.querySelector('.photo-placeholder');
        const btnRemove = slot.querySelector('.btn-remove');
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                adicionarFoto(file, slot, preview, placeholder, btnRemove, i);
            }
        });
        
        btnRemove.addEventListener('click', (e) => {
            e.stopPropagation();
            removerFoto(input, slot, preview, placeholder, btnRemove, i);
        });
    }
}

function adicionarFoto(file, slot, preview, placeholder, btnRemove, index) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        btnRemove.style.display = 'flex';
        
        AppState.fotosColetadas[index - 1] = {
            file: file,
            dataURL: e.target.result,
            nome: file.name,
            tamanho: file.size
        };
        
        verificarFotosMinimas();
    };
    
    reader.readAsDataURL(file);
}

function removerFoto(input, slot, preview, placeholder, btnRemove, index) {
    input.value = '';
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    btnRemove.style.display = 'none';
    
    delete AppState.fotosColetadas[index - 1];
    verificarFotosMinimas();
}

function verificarFotosMinimas() {
    const totalFotos = AppState.fotosColetadas.filter(f => f).length;
    elementos.btnProcessarEtapa1.disabled = totalFotos < 2;
    
    if (totalFotos >= 2) {
        elementos.btnProcessarEtapa1.textContent = `🤖 Processar ${totalFotos} fotos - Etapa 1/2`;
    }
}

// ============================================
// PROCESSAMENTO ETAPA 1 - CHAMADA API VERCEL
// ============================================

async function processarEtapa1() {
    try {
        exibirLoading('Processando IA: Etapa 1/2 - Extraindo dados...');
        
        // Prepara imagens em base64
        const imagensBase64 = AppState.fotosColetadas
            .filter(f => f)
            .map(foto => ({
                data: foto.dataURL.split(',')[1], // Remove prefixo data:image/...
                nome: foto.nome
            }));
        
        // Chamada para API Vercel
        const response = await fetch('/api/processar-etapa1', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imagens: imagensBase64
            })
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const resposta = await response.json();
        
        ocultarLoading();
        
        if (resposta.status === 'Falha') {
            exibirAlerta('error', resposta.mensagem);
            preencherFormulario(resposta.dados);
            habilitarEdicaoManual();
        } else {
            exibirAlerta('info', '✅ Dados extraídos automaticamente. Valide a Placa e o Nome antes de buscar o preço.');
            preencherFormulario(resposta.dados);
            destacarCamposCriticos();
        }
        
        AppState.dadosEtapa1 = resposta.dados;
        elementos.formSection.style.display = 'block';
        salvarCacheEtapa1(resposta.dados);
        
    } catch (erro) {
        ocultarLoading();
        console.error('Erro na Etapa 1:', erro);
        exibirAlerta('error', 'Erro ao processar imagens: ' + erro.message);
    }
}

function preencherFormulario(dados) {
    elementos.numeroPatrimonio.value = dados.numero_patrimonio || '';
    elementos.nomeProduto.value = dados.nome_produto || '';
    elementos.descricao.value = dados.descricao || '';
    elementos.estado.value = dados.classificacao_automatica?.estado_conservacao || '';
    elementos.depreciacao.value = dados.classificacao_automatica?.categoria_depreciacao || '';
}

function destacarCamposCriticos() {
    elementos.numeroPatrimonio.parentElement.classList.add('highlight');
    elementos.nomeProduto.parentElement.classList.add('highlight');
}

function habilitarEdicaoManual() {
    exibirAlerta('warning', '⚠️ Extração automática falhou. Preencha os campos manualmente.');
}

// ============================================
// PROCESSAMENTO ETAPA 2 - CHAMADA API VERCEL
// ============================================

async function processarEtapa2() {
    try {
        // Validação
        if (!elementos.numeroPatrimonio.value || elementos.numeroPatrimonio.value === 'N/A') {
            exibirAlerta('error', 'Número de Patrimônio inválido. Corrija antes de continuar.');
            return;
        }
        
        if (!elementos.nomeProduto.value || elementos.nomeProduto.value === 'N/A') {
            exibirAlerta('error', 'Nome do Produto é obrigatório.');
            return;
        }
        
        exibirLoading('Processando IA: Etapa 2/2 - Buscando preço de reposição...');
        
        // Dados para grounding
        const dadosParaGrounding = {
            nome_produto: elementos.nomeProduto.value,
            modelo: AppState.dadosEtapa1?.modelo,
            marca: AppState.dadosEtapa1?.marca,
            estado: elementos.estado.value,
            numero_patrimonio: elementos.numeroPatrimonio.value
        };
        
        // Chamada para API Vercel
        const response = await fetch('/api/processar-etapa2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosParaGrounding)
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const resposta = await response.json();
        
        ocultarLoading();
        
        if (resposta.status === 'Falha_Grounding') {
            exibirAlerta('warning', resposta.mensagem);
            habilitarEdicaoManualValores();
        } else {
            preencherValores(resposta.dados.valores_estimados);
            destacarCamposValores();
            exibirAlerta('success', '✅ Valores calculados! Revise os dados antes de finalizar.');
            
            AppState.dadosCompletos = resposta.dados;
            salvarCacheCompleto(resposta.dados);
        }
        
    } catch (erro) {
        ocultarLoading();
        console.error('Erro na Etapa 2:', erro);
        exibirAlerta('error', 'Erro ao buscar preço: ' + erro.message);
    }
}

function preencherValores(valores) {
    elementos.valorMercado.value = formatarMoeda(valores.valor_mercado_estimado);
    elementos.valorAtual.value = formatarMoeda(valores.valor_atual_estimado);
    
    elementos.valorAtual.title = `Calculado: R$ ${valores.valor_mercado_estimado.toFixed(2)} × ${(valores.fator_depreciacao * 100).toFixed(0)}%`;
}

function destacarCamposValores() {
    elementos.valorMercado.parentElement.classList.add('success');
    elementos.valorAtual.parentElement.classList.add('success');
    
    elementos.numeroPatrimonio.parentElement.classList.remove('highlight');
    elementos.nomeProduto.parentElement.classList.remove('highlight');
}

function habilitarEdicaoManualValores() {
    elementos.valorMercado.focus();
}

// ============================================
// FINALIZAÇÃO E RESULTADOS
// ============================================

function finalizarProcessamento() {
    if (!AppState.dadosCompletos) {
        exibirAlerta('error', 'Complete o processamento antes de finalizar.');
        return;
    }
    
    const dadosFinais = {
        ...AppState.dadosCompletos,
        numero_patrimonio: elementos.numeroPatrimonio.value,
        nome_produto: elementos.nomeProduto.value,
        descricao: elementos.descricao.value,
        estado_conservacao: elementos.estado.value,
        centro_custo: elementos.centroCusto.value,
        categoria_depreciacao: elementos.depreciacao.value,
        unidade: elementos.unidade.value
    };
    
    exibirResultado(dadosFinais);
    elementos.formSection.style.display = 'none';
    elementos.resultSection.style.display = 'block';
    ocultarAlerta();
}

function exibirResultado(dados) {
    document.getElementById('resultIdentificacao').innerHTML = `
        <p><strong>ID Temporário:</strong> POC_${gerarUUID()}</p>
        <p><strong>Patrimônio:</strong> ${dados.numero_patrimonio}</p>
        <p><strong>Nome:</strong> ${dados.nome_produto}</p>
        <p><strong>Marca:</strong> ${dados.marca || 'N/A'}</p>
        <p><strong>Modelo:</strong> ${dados.modelo || 'N/A'}</p>
    `;
    
    document.getElementById('resultClassificacao').innerHTML = `
        <p><strong>Estado:</strong> ${dados.estado_conservacao}</p>
        <p><strong>Categoria:</strong> ${dados.categoria_depreciacao}</p>
        <p><strong>Fator Aplicado:</strong> ${(dados.valores_estimados?.fator_depreciacao * 100).toFixed(0)}%</p>
    `;
    
    const valorMercado = dados.valores_estimados?.valor_mercado_estimado || 0;
    const valorAtual = dados.valores_estimados?.valor_atual_estimado || 0;
    
    document.getElementById('resultValores').innerHTML = `
        <p><strong>Valor Mercado:</strong> ${formatarMoeda(valorMercado)}</p>
        <p><strong>Valor Atual:</strong> ${formatarMoeda(valorAtual)}</p>
        <p><strong>Depreciação:</strong> ${formatarMoeda(valorMercado - valorAtual)}</p>
    `;
    
    document.getElementById('resultMetadados').innerHTML = `
        <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        <p><strong>Origem:</strong> Sistema IA Automatizado</p>
        <p><strong>Confiança OCR:</strong> ${dados.metadados?.confianca_ocr || 'N/A'}%</p>
        <p><strong>Versão:</strong> 1.0-POC</p>
    `;
    
    document.getElementById('jsonOutput').textContent = JSON.stringify(dados, null, 2);
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
    
    if (tipo === 'success') {
        setTimeout(ocultarAlerta, 5000);
    }
}

function ocultarAlerta() {
    elementos.alertBox.style.display = 'none';
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function salvarCacheEtapa1(dados) {
    sessionStorage.setItem('poc_etapa1', JSON.stringify(dados));
}

function salvarCacheCompleto(dados) {
    sessionStorage.setItem('poc_completo', JSON.stringify(dados));
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
