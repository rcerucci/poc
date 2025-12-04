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
    dadosEtapa2: null,
    cotacaoCache: null
};

const elementos = {
    // Botões principais
    processarEtapa1: document.getElementById('processarEtapa1'),
    validarEBuscarPreco: document.getElementById('validarEBuscarPreco'),
    aceitarCotacao: document.getElementById('aceitarCotacao'),
    usarCache: document.getElementById('usarCache'),
    buscarNova: document.getElementById('buscarNova'),
    exportarJSON: document.getElementById('exportarJSON'),
    processarNovo: document.getElementById('processarNovo'),
    
    // Seções
    observacaoSection: document.getElementById('observacaoSection'),
    formSection: document.getElementById('formSection'),
    cacheSection: document.getElementById('cacheSection'),
    produtosSection: document.getElementById('produtosSection'),
    resultSection: document.getElementById('resultSection'),
    
    // Campos do formulário
    numeroPatrimonio: document.getElementById('numeroPatrimonio'),
    nomeProduto: document.getElementById('nomeProduto'),
    estado: document.getElementById('estado'),
    depreciacao: document.getElementById('depreciacao'),
    centroCusto: document.getElementById('centroCusto'),
    unidade: document.getElementById('unidade'),
    descricao: document.getElementById('descricao'),
    nomeEquipamento: document.getElementById('nomeEquipamento'),
    
    // Áreas de exibição
    alertBox: document.getElementById('alertBox'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    cacheInfo: document.getElementById('cacheInfo'),
    cotacaoInfo: document.getElementById('cotacaoInfo'),
    produtosList: document.getElementById('produtosList'),
    resultIdentificacao: document.getElementById('resultIdentificacao'),
    resultClassificacao: document.getElementById('resultClassificacao'),
    resultValores: document.getElementById('resultValores'),
    jsonOutput: document.getElementById('jsonOutput')
};

// ===================================================================
// INICIALIZAÇÃO
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 PatriGestor iniciado');
    inicializarEventListeners();
    inicializarUploadFotos();
    inicializarObservacaoOperador();
});

function inicializarEventListeners() {
    const btnLimparTudo = document.getElementById('btnLimparTudo');
    if (btnLimparTudo) btnLimparTudo.addEventListener('click', limparTudo);
    
    if (elementos.processarEtapa1) {
        elementos.processarEtapa1.addEventListener('click', processarEtapa1);
    }
    if (elementos.validarEBuscarPreco) {
        elementos.validarEBuscarPreco.addEventListener('click', verificarCacheEBuscar);
    }
    if (elementos.aceitarCotacao) {
        elementos.aceitarCotacao.addEventListener('click', aceitarCotacao);
    }
    if (elementos.usarCache) {
        elementos.usarCache.addEventListener('click', usarCotacaoCache);
    }
    if (elementos.buscarNova) {
        elementos.buscarNova.addEventListener('click', () => buscarPreco(true));
    }
    if (elementos.exportarJSON) {
        elementos.exportarJSON.addEventListener('click', exportarJSON);
    }
    if (elementos.processarNovo) {
        elementos.processarNovo.addEventListener('click', () => location.reload());
    }
}

function inicializarObservacaoOperador() {
    const radios = document.querySelectorAll('input[name="tipoObservacao"]');
    const campoNome = elementos.nomeEquipamento;
    
    if (!radios.length || !campoNome) return;
    
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'nao') {
                campoNome.disabled = true;
                campoNome.value = '';
            } else {
                campoNome.disabled = false;
                campoNome.focus();
            }
        });
    });
}

// ===================================================================
// UPLOAD E MANIPULAÇÃO DE FOTOS
// ===================================================================

function inicializarUploadFotos() {
    for (let i = 1; i <= CONFIG.maxFotos; i++) {
        const input = document.getElementById(`photo${i}`);
        const slot = document.querySelector(`.photo-slot[data-index="${i}"]`);
        
        if (input && slot) {
            input.addEventListener('change', (e) => handleFotoUpload(e, i - 1));
            
            const btnRemove = slot.querySelector('.btn-remove');
            if (btnRemove) {
                btnRemove.addEventListener('click', () => removerFoto(i - 1));
            }
        }
    }
    
    document.addEventListener('paste', handlePaste);
    validarBotaoProcessar();
}

async function handleFotoUpload(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const fotoComprimida = await comprimirImagem(file, CONFIG.compressao.resolucaoStorage);
        AppState.fotos[index] = fotoComprimida;
        
        mostrarPreview(fotoComprimida, index);
        validarBotaoProcessar();
        
        console.log(`✅ Foto ${index + 1} carregada`);
    } catch (error) {
        console.error('❌ Erro ao processar foto:', error);
        mostrarAlerta('Erro ao processar foto: ' + error.message, 'error');
    }
}

async function handlePaste(event) {
    const items = event.clipboardData?.items;
    if (!items) return;
    
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            event.preventDefault();
            const file = item.getAsFile();
            
            const primeiroSlotVazio = AppState.fotos.findIndex(f => f === null);
            if (primeiroSlotVazio === -1) {
                mostrarAlerta('⚠️ Todas as posições de foto estão ocupadas', 'warning');
                return;
            }
            
            try {
                const fotoComprimida = await comprimirImagem(file, CONFIG.compressao.resolucaoStorage);
                AppState.fotos[primeiroSlotVazio] = fotoComprimida;
                
                mostrarPreview(fotoComprimida, primeiroSlotVazio);
                validarBotaoProcessar();
                
                mostrarAlerta(`✅ Foto ${primeiroSlotVazio + 1} colada com sucesso`, 'success', 2000);
            } catch (error) {
                console.error('❌ Erro ao colar foto:', error);
                mostrarAlerta('Erro ao colar foto: ' + error.message, 'error');
            }
            
            break;
        }
    }
}

function mostrarPreview(imagemBase64, index) {
    const slot = document.querySelector(`.photo-slot[data-index="${index + 1}"]`);
    if (!slot) return;
    
    const preview = slot.querySelector('.photo-preview');
    const placeholder = slot.querySelector('.photo-placeholder');
    const btnRemove = slot.querySelector('.btn-remove');
    const label = slot.querySelector('label');
    
    if (preview && placeholder && btnRemove && label) {
        preview.src = imagemBase64;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        btnRemove.style.display = 'flex';
        label.style.cursor = 'default';
    }
}

function removerFoto(index) {
    AppState.fotos[index] = null;
    
    const slot = document.querySelector(`.photo-slot[data-index="${index + 1}"]`);
    if (!slot) return;
    
    const preview = slot.querySelector('.photo-preview');
    const placeholder = slot.querySelector('.photo-placeholder');
    const btnRemove = slot.querySelector('.btn-remove');
    const input = slot.querySelector('input[type="file"]');
    const label = slot.querySelector('label');
    
    if (preview && placeholder && btnRemove && input && label) {
        preview.style.display = 'none';
        preview.src = '';
        placeholder.style.display = 'flex';
        btnRemove.style.display = 'none';
        input.value = '';
        label.style.cursor = 'pointer';
    }
    
    validarBotaoProcessar();
    console.log(`🗑️ Foto ${index + 1} removida`);
}

function validarBotaoProcessar() {
    const fotosValidas = AppState.fotos.filter(f => f !== null);
    const btnProcessar = elementos.processarEtapa1;
    
    if (btnProcessar) {
        btnProcessar.disabled = fotosValidas.length < CONFIG.minFotos;
    }
}

// ===================================================================
// COMPRESSÃO DE IMAGENS
// ===================================================================

async function comprimirImagem(file, resolucaoAlvo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > resolucaoAlvo) {
                        height = (height * resolucaoAlvo) / width;
                        width = resolucaoAlvo;
                    }
                } else {
                    if (height > resolucaoAlvo) {
                        width = (width * resolucaoAlvo) / height;
                        height = resolucaoAlvo;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                ctx.drawImage(img, 0, 0, width, height);
                
                const imagemComprimida = canvas.toDataURL('image/jpeg', CONFIG.compressao.qualidade);
                resolve(imagemComprimida);
            };
            
            img.onerror = () => reject(new Error('Erro ao carregar imagem'));
            img.src = e.target.result;
        };
        
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
    });
}

// ===================================================================
// PROCESSAMENTO - ETAPA 1 (EXTRAÇÃO DE DADOS)
// ===================================================================

async function processarEtapa1() {
    console.log('📸 Iniciando Etapa 1...');
    
    const fotosValidas = AppState.fotos.filter(f => f !== null);
    
    if (fotosValidas.length < CONFIG.minFotos) {
        mostrarAlerta(`⚠️ Mínimo ${CONFIG.minFotos} fotos necessárias`, 'warning');
        return;
    }
    
    mostrarLoading('🤖 Analisando imagens com IA...');
    
    try {
        // Comprimir fotos para IA (512px)
        const imagensParaIA = [];
        for (let foto of fotosValidas) {
            const blob = await fetch(foto).then(r => r.blob());
            const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
            const fotoComprimida = await comprimirImagem(file, CONFIG.compressao.resolucaoIA);
            imagensParaIA.push({ data: fotoComprimida.split(',')[1] });
        }
        
        // Preparar observação do operador
        const tipoObservacao = document.querySelector('input[name="tipoObservacao"]:checked')?.value;
        const nomeEquipamento = elementos.nomeEquipamento?.value.trim();
        
        let observacao = '';
        if (tipoObservacao === 'certeza' && nomeEquipamento) {
            observacao = `Isto é um ${nomeEquipamento}`;
            console.log('✅ Operador TEM CERTEZA:', nomeEquipamento);
        } else if (tipoObservacao === 'suspeita' && nomeEquipamento) {
            observacao = `Parece ser um ${nomeEquipamento}`;
            console.log('🤔 Operador SUSPEITA:', nomeEquipamento);
        }
        
        const payload = {
            imagens: imagensParaIA,
            observacao_operador: observacao
        };
        
        console.log(`📤 Enviando ${imagensParaIA.length} imagens...`);
        if (observacao) console.log('💡 Com observação:', observacao);
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const resultado = await response.json();
        console.log('📥 Etapa 1 - Resposta:', resultado);
        
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa1 = resultado.dados;
            preencherFormulario(resultado.dados);
            mostrarAlerta('✅ ' + resultado.mensagem, 'success');
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
    
    console.log('✅ Formulário preenchido');
}

// [CONTINUA NA PARTE 2...]
// [CONTINUAÇÃO DA PARTE 1...]

// ===================================================================
// PROCESSAMENTO - ETAPA 2 (BUSCA DE PREÇOS)
// ===================================================================

async function verificarCacheEBuscar() {
    console.log('🔍 Verificando cache...');
    
    if (!AppState.dadosEtapa1) {
        mostrarAlerta('⚠️ Execute a Etapa 1 primeiro!', 'warning');
        return;
    }
    
    mostrarLoading('⏳ Verificando cotações salvas...');
    
    try {
        const payload = {
            termo_busca_comercial: AppState.dadosEtapa1.termo_busca_comercial,
            numero_patrimonio: elementos.numeroPatrimonio.value,
            nome_produto: elementos.nomeProduto.value || AppState.dadosEtapa1.nome_produto,
            marca: AppState.dadosEtapa1.marca,
            modelo: AppState.dadosEtapa1.modelo,
            especificacoes: AppState.dadosEtapa1.especificacoes,
            estado_conservacao: elementos.estado.value,
            categoria_depreciacao: elementos.depreciacao.value,
            forcar_nova_busca: false // Verificar cache primeiro
        };
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const resultado = await response.json();
        console.log('📥 Resposta:', resultado);
        
        if (resultado.status === 'Sucesso') {
            if (resultado.em_cache) {
                // Cotação veio do cache
                console.log('⚡ Cotação em cache encontrada!');
                AppState.cotacaoCache = resultado;
                mostrarAvisoCache(resultado);
            } else {
                // Busca nova realizada
                console.log('🔍 Busca nova realizada');
                AppState.dadosEtapa2 = resultado.dados;
                mostrarProdutos(resultado.dados, false);
            }
        } else {
            throw new Error(resultado.mensagem || 'Erro na busca');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('❌ Erro: ' + error.message, 'error');
    } finally {
        esconderLoading();
    }
}

async function buscarPreco(forcarNova = false) {
    console.log('💰 Buscando preços...', forcarNova ? '(Forçar nova busca)' : '');
    
    mostrarLoading('🔍 Buscando preços de mercado...');
    
    // Esconder seção de cache
    if (elementos.cacheSection) {
        elementos.cacheSection.style.display = 'none';
    }
    
    try {
        const payload = {
            termo_busca_comercial: AppState.dadosEtapa1.termo_busca_comercial,
            numero_patrimonio: elementos.numeroPatrimonio.value,
            nome_produto: elementos.nomeProduto.value || AppState.dadosEtapa1.nome_produto,
            marca: AppState.dadosEtapa1.marca,
            modelo: AppState.dadosEtapa1.modelo,
            especificacoes: AppState.dadosEtapa1.especificacoes,
            estado_conservacao: elementos.estado.value,
            categoria_depreciacao: elementos.depreciacao.value,
            forcar_nova_busca: forcarNova
        };
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const resultado = await response.json();
        console.log('📥 Resposta:', resultado);
        
        if (resultado.status === 'Sucesso') {
            AppState.dadosEtapa2 = resultado.dados;
            mostrarProdutos(resultado.dados, false);
            mostrarAlerta('✅ Preços encontrados!', 'success');
        } else {
            throw new Error(resultado.mensagem || 'Erro na busca');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('❌ Erro: ' + error.message, 'error');
    } finally {
        esconderLoading();
    }
}

function usarCotacaoCache() {
    console.log('⚡ Usando cotação do cache');
    
    if (!AppState.cotacaoCache) {
        mostrarAlerta('❌ Erro: Cache não disponível', 'error');
        return;
    }
    
    // Esconder seção de cache
    if (elementos.cacheSection) {
        elementos.cacheSection.style.display = 'none';
    }
    
    AppState.dadosEtapa2 = AppState.cotacaoCache.dados;
    mostrarProdutos(AppState.cotacaoCache.dados, true);
    mostrarAlerta('⚡ Usando cotação salva', 'success');
}

// ===================================================================
// EXIBIÇÃO DE CACHE E PRODUTOS
// ===================================================================

function mostrarAvisoCache(resultado) {
    if (!elementos.cacheSection || !elementos.cacheInfo) return;
    
    const dataCotacao = new Date(resultado.data_cotacao);
    const dataFormatada = dataCotacao.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const idadeDias = resultado.idade_dias;
    const tempoTexto = idadeDias < 1 
        ? 'hoje' 
        : idadeDias === 1 
            ? 'há 1 dia' 
            : `há ${Math.floor(idadeDias)} dias`;
    
    elementos.cacheInfo.innerHTML = `
        📅 Esta cotação foi realizada em <strong>${dataFormatada}</strong> (${tempoTexto}).<br>
        💰 Média ponderada: <strong>R$ ${formatarPreco(resultado.dados.avaliacao?.media_ponderada)}</strong><br>
        📦 ${resultado.dados.avaliacao?.total_produtos || 0} produtos encontrados
        (${resultado.dados.avaliacao?.produtos_match || 0} match, ${resultado.dados.avaliacao?.produtos_similar || 0} similar)
    `;
    
    elementos.cacheSection.style.display = 'block';
    
    // Scroll suave
    elementos.cacheSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function mostrarProdutos(dados, doCache = false) {
    if (!elementos.produtosSection || !elementos.produtosList || !elementos.cotacaoInfo) return;
    
    const produtos = dados.produtos_encontrados || dados.produtos || [];
    const avaliacao = dados.avaliacao || {};
    
    // Info da cotação
    const fonte = doCache ? '⚡ Cotação do cache' : '🆕 Cotação nova';
    elementos.cotacaoInfo.innerHTML = `
        ${fonte} • 
        Média ponderada: <strong>R$ ${formatarPreco(avaliacao.media_ponderada)}</strong> • 
        ${avaliacao.produtos_match || 0} match • 
        ${avaliacao.produtos_similar || 0} similar
    `;
    
    // Lista de produtos
    if (produtos.length === 0) {
        elementos.produtosList.innerHTML = `
            <div class="produto-item">
                <p>⚠️ Nenhum produto encontrado com preço.</p>
            </div>
        `;
    } else {
        elementos.produtosList.innerHTML = produtos.map(produto => `
            <div class="produto-item ${produto.classificacao || 'similar'}">
                <div class="produto-header">
                    <span class="produto-badge ${produto.classificacao || 'similar'}">
                        ${produto.classificacao === 'match' ? '✅ MATCH' : '🔵 SIMILAR'}
                    </span>
                    ${produto.preco ? `
                        <span class="produto-preco">R$ ${formatarPreco(produto.preco)}</span>
                    ` : '<span class="produto-sem-preco">Preço não disponível</span>'}
                </div>
                <h4 class="produto-nome">${produto.nome || 'Produto sem nome'}</h4>
                <p class="produto-loja">🏪 ${produto.loja || 'Loja não informada'}</p>
                ${produto.link ? `
                    <a href="${produto.link}" target="_blank" class="produto-link">
                        🔗 Ver produto na loja
                    </a>
                ` : ''}
            </div>
        `).join('');
    }
    
    elementos.produtosSection.style.display = 'block';
    
    // Scroll suave
    elementos.produtosSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===================================================================
// ACEITAR COTAÇÃO E SALVAR NO CACHE
// ===================================================================

async function aceitarCotacao() {
    console.log('✅ Aceitando cotação...');
    
    if (!AppState.dadosEtapa2) {
        mostrarAlerta('❌ Nenhuma cotação para aceitar', 'error');
        return;
    }
    
    mostrarLoading('💾 Salvando cotação...');
    
    try {
        const payload = {
            termo_busca_comercial: AppState.dadosEtapa1.termo_busca_comercial,
            numero_patrimonio: elementos.numeroPatrimonio.value,
            operador_id: 'operador_web', // TODO: Implementar login
            dados_cotacao: AppState.dadosEtapa2
        };
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa2-aceitar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const resultado = await response.json();
        console.log('📥 Resposta:', resultado);
        
        if (resultado.status === 'Sucesso') {
            console.log('✅ Cotação salva no cache!');
            mostrarResultadoFinal();
            mostrarAlerta('✅ Cotação aceita e salva!', 'success');
        } else {
            throw new Error(resultado.mensagem || 'Erro ao salvar cotação');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('❌ Erro ao salvar: ' + error.message, 'error');
    } finally {
        esconderLoading();
    }
}

// ===================================================================
// RESULTADO FINAL
// ===================================================================

function mostrarResultadoFinal() {
    if (!AppState.dadosEtapa1 || !AppState.dadosEtapa2) return;
    
    const dados1 = AppState.dadosEtapa1;
    const dados2 = AppState.dadosEtapa2;
    const avaliacao = dados2.avaliacao || {};
    
    // Identificação
    if (elementos.resultIdentificacao) {
        elementos.resultIdentificacao.innerHTML = `
            <p><strong>Placa:</strong> ${elementos.numeroPatrimonio.value || 'N/A'}</p>
            <p><strong>Nome:</strong> ${dados1.nome_produto || 'N/A'}</p>
            <p><strong>Marca/Modelo:</strong> ${dados1.marca || 'N/A'} / ${dados1.modelo || 'N/A'}</p>
            <p><strong>Especificações:</strong> ${dados1.especificacoes || 'N/A'}</p>
        `;
    }
    
    // Classificação
    if (elementos.resultClassificacao) {
        elementos.resultClassificacao.innerHTML = `
            <p><strong>Estado:</strong> ${elementos.estado.value || 'N/A'}</p>
            <p><strong>Depreciação:</strong> ${elementos.depreciacao.value || 'N/A'}</p>
            <p><strong>Descrição:</strong> ${dados1.descricao || 'N/A'}</p>
        `;
    }
    
    // Valores
    if (elementos.resultValores) {
        elementos.resultValores.innerHTML = `
            <p><strong>Média Ponderada:</strong> R$ ${formatarPreco(avaliacao.media_ponderada)}</p>
            <p><strong>Produtos encontrados:</strong> ${avaliacao.total_produtos || 0}</p>
            <p><strong>Com preço:</strong> ${avaliacao.produtos_com_preco || 0}</p>
            <p><strong>Faixa:</strong> R$ ${formatarPreco(avaliacao.preco_minimo)} - R$ ${formatarPreco(avaliacao.preco_maximo)}</p>
        `;
    }
    
    // JSON completo
    if (elementos.jsonOutput) {
        const dadosCompletos = {
            etapa1: dados1,
            etapa2: dados2,
            formulario: {
                numero_patrimonio: elementos.numeroPatrimonio.value,
                centro_custo: elementos.centroCusto.value,
                unidade: elementos.unidade.value
            }
        };
        elementos.jsonOutput.textContent = JSON.stringify(dadosCompletos, null, 2);
    }
    
    // Esconder seções anteriores
    if (elementos.formSection) elementos.formSection.style.display = 'none';
    if (elementos.produtosSection) elementos.produtosSection.style.display = 'none';
    
    // Mostrar resultado
    if (elementos.resultSection) {
        elementos.resultSection.style.display = 'block';
        elementos.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// [CONTINUA NA PARTE 3...]
// [CONTINUAÇÃO DA PARTE 2...]

// ===================================================================
// UTILIDADES - ALERTAS E LOADING
// ===================================================================

function mostrarAlerta(mensagem, tipo = 'info', duracao = 4000) {
    if (!elementos.alertBox) return;
    
    elementos.alertBox.textContent = mensagem;
    elementos.alertBox.className = `alert alert-${tipo}`;
    elementos.alertBox.style.display = 'block';
    
    setTimeout(() => {
        elementos.alertBox.style.display = 'none';
    }, duracao);
}

function mostrarLoading(texto = 'Processando...') {
    if (elementos.loadingOverlay && elementos.loadingText) {
        elementos.loadingText.textContent = texto;
        elementos.loadingOverlay.style.display = 'flex';
    }
}

function esconderLoading() {
    if (elementos.loadingOverlay) {
        elementos.loadingOverlay.style.display = 'none';
    }
}

// ===================================================================
// UTILIDADES - FORMATAÇÃO
// ===================================================================

function formatarPreco(valor) {
    if (valor === null || valor === undefined || valor === 'N/A') {
        return 'N/A';
    }
    
    const numero = parseFloat(valor);
    if (isNaN(numero)) return 'N/A';
    
    return numero.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// ===================================================================
// UTILIDADES - EXPORTAÇÃO
// ===================================================================

function exportarJSON() {
    if (!AppState.dadosEtapa1) {
        mostrarAlerta('⚠️ Nenhum dado para exportar', 'warning');
        return;
    }
    
    const dadosCompletos = {
        etapa1: AppState.dadosEtapa1,
        etapa2: AppState.dadosEtapa2,
        formulario: {
            numero_patrimonio: elementos.numeroPatrimonio.value,
            nome_produto: elementos.nomeProduto.value,
            estado: elementos.estado.value,
            depreciacao: elementos.depreciacao.value,
            centro_custo: elementos.centroCusto.value,
            unidade: elementos.unidade.value,
            descricao: elementos.descricao.value
        },
        timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(dadosCompletos, null, 2)], {
        type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patrimonio-${elementos.numeroPatrimonio.value || 'sem-placa'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    mostrarAlerta('✅ JSON exportado com sucesso!', 'success', 2000);
}

// ===================================================================
// UTILIDADES - LIMPEZA
// ===================================================================

function limparTudo() {
    if (!confirm('⚠️ Tem certeza que deseja limpar todos os dados?')) {
        return;
    }
    
    // Limpar fotos
    AppState.fotos = [null, null, null];
    AppState.dadosEtapa1 = null;
    AppState.dadosEtapa2 = null;
    AppState.cotacaoCache = null;
    
    // Limpar previews
    for (let i = 0; i < CONFIG.maxFotos; i++) {
        removerFoto(i);
    }
    
    // Limpar formulário
    if (elementos.numeroPatrimonio) elementos.numeroPatrimonio.value = '';
    if (elementos.nomeProduto) elementos.nomeProduto.value = '';
    if (elementos.estado) elementos.estado.value = '';
    if (elementos.depreciacao) elementos.depreciacao.value = '';
    if (elementos.centroCusto) elementos.centroCusto.value = '';
    if (elementos.unidade) elementos.unidade.value = '';
    if (elementos.descricao) elementos.descricao.value = '';
    if (elementos.nomeEquipamento) elementos.nomeEquipamento.value = '';
    
    // Reset radios
    const radioNao = document.querySelector('input[name="tipoObservacao"][value="nao"]');
    if (radioNao) radioNao.checked = true;
    if (elementos.nomeEquipamento) elementos.nomeEquipamento.disabled = true;
    
    // Esconder seções
    if (elementos.observacaoSection) elementos.observacaoSection.style.display = 'none';
    if (elementos.formSection) elementos.formSection.style.display = 'none';
    if (elementos.cacheSection) elementos.cacheSection.style.display = 'none';
    if (elementos.produtosSection) elementos.produtosSection.style.display = 'none';
    if (elementos.resultSection) elementos.resultSection.style.display = 'none';
    
    mostrarAlerta('🗑️ Tudo limpo! Pronto para novo cadastro', 'success');
    
    console.log('🗑️ Sistema resetado');
}

// ===================================================================
// FIM DO CÓDIGO
// ===================================================================

console.log('✅ app.js carregado com sucesso');