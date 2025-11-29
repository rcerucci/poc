// ===================================================================
// CONFIGURAÇÕES E ESTADO GLOBAL
// ===================================================================

const CONFIG = {
    apiUrl: 'https://poc-rose-five.vercel.app',
    maxFotos: 5,
    minFotos: 2
};

const AppState = {
    fotos: [],
    fotoAtual: 0,
    dadosEtapa1: null,
    dadosEtapa2: null
};

// ===================================================================
// ELEMENTOS DO DOM
// ===================================================================

const elementos = {
    // Captura de fotos
    video: document.getElementById('video'),
    canvas: document.getElementById('canvas'),
    btnIniciarCamera: document.getElementById('btn-iniciar-camera'),
    btnCapturar: document.getElementById('btn-capturar'),
    btnProximaFoto: document.getElementById('btn-proxima-foto'),
    containerCamera: document.getElementById('container-camera'),
    contadorFotos: document.getElementById('contador-fotos'),
    galeriaMiniaturas: document.getElementById('galeria-miniaturas'),
    
    // Extração de dados
    btnExtrairDados: document.getElementById('btn-extrair-dados'),
    loadingExtracao: document.getElementById('loading-extracao'),
    
    // Campos de formulário
    numeroPatrimonio: document.getElementById('numero-patrimonio'),
    nomeProduto: document.getElementById('nome-produto'),
    estado: document.getElementById('estado'),
    depreciacao: document.getElementById('depreciacao'),
    descricao: document.getElementById('descricao'),
    
    // Precificação
    btnBuscarPreco: document.getElementById('btn-buscar-preco'),
    loadingPrecificacao: document.getElementById('loading-precificacao'),
    valorMercado: document.getElementById('valor-mercado'),
    valorAtual: document.getElementById('valor-atual'),
    fatorDepreciacao: document.getElementById('fator-depreciacao'),
    scoreConfianca: document.getElementById('score-confianca'),
    
    // Finalização
    btnSalvarAtivo: document.getElementById('btn-salvar-ativo'),
    btnNovoAtivo: document.getElementById('btn-novo-ativo'),
    
    // Mensagens
    containerMensagem: document.getElementById('container-mensagem'),
    mensagemTexto: document.getElementById('mensagem-texto')
};

// ===================================================================
// INICIALIZAÇÃO
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Aplicação iniciada');
    inicializarEventListeners();
    atualizarContadorFotos();
});

function inicializarEventListeners() {
    elementos.btnIniciarCamera.addEventListener('click', iniciarCamera);
    elementos.btnCapturar.addEventListener('click', capturarFoto);
    elementos.btnProximaFoto.addEventListener('click', proximaFoto);
    elementos.btnExtrairDados.addEventListener('click', extrairDados);
    elementos.btnBuscarPreco.addEventListener('click', processarEtapa2);
    elementos.btnSalvarAtivo.addEventListener('click', salvarAtivo);
    elementos.btnNovoAtivo.addEventListener('click', novoAtivo);
}

// ===================================================================
// CAPTURA DE FOTOS
// ===================================================================

async function iniciarCamera() {
    console.log('📷 Iniciando câmera...');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        
        elementos.video.srcObject = stream;
        elementos.containerCamera.style.display = 'block';
        elementos.btnIniciarCamera.style.display = 'none';
        elementos.btnCapturar.style.display = 'inline-block';
        
        console.log('✅ Câmera iniciada');
        mostrarMensagem('📷 Câmera ativada! Posicione o objeto e clique em Capturar.', 'info');
        
    } catch (erro) {
        console.error('❌ Erro ao acessar câmera:', erro);
        mostrarMensagem('❌ Erro ao acessar câmera: ' + erro.message, 'error');
    }
}

function capturarFoto() {
    if (AppState.fotos.length >= CONFIG.maxFotos) {
        mostrarMensagem('⚠️ Máximo de ' + CONFIG.maxFotos + ' fotos atingido!', 'warning');
        return;
    }
    
    console.log('📸 Capturando foto ' + (AppState.fotos.length + 1));
    
    const context = elementos.canvas.getContext('2d');
    elementos.canvas.width = elementos.video.videoWidth;
    elementos.canvas.height = elementos.video.videoHeight;
    
    context.drawImage(elementos.video, 0, 0);
    
    const fotoBase64 = elementos.canvas.toDataURL('image/jpeg', 0.8);
    const fotoData = fotoBase64.split(',')[1];
    
    AppState.fotos.push({
        data: fotoData,
        timestamp: new Date().toISOString(),
        thumbnail: fotoBase64
    });
    
    adicionarMiniatura(fotoBase64, AppState.fotos.length);
    atualizarContadorFotos();
    
    console.log('✅ Foto capturada. Total:', AppState.fotos.length);
    mostrarMensagem('✅ Foto ' + AppState.fotos.length + ' capturada!', 'success');
    
    if (AppState.fotos.length >= CONFIG.minFotos) {
        elementos.btnProximaFoto.style.display = 'inline-block';
    }
}

function adicionarMiniatura(fotoBase64, numero) {
    const div = document.createElement('div');
    div.className = 'miniatura';
    div.innerHTML = `
        <img src="${fotoBase64}" alt="Foto ${numero}">
        <span class="numero-foto">${numero}</span>
        <button class="btn-remover" onclick="removerFoto(${numero - 1})">×</button>
    `;
    elementos.galeriaMiniaturas.appendChild(div);
}

function removerFoto(indice) {
    console.log('🗑️ Removendo foto', indice + 1);
    AppState.fotos.splice(indice, 1);
    elementos.galeriaMiniaturas.innerHTML = '';
    
    AppState.fotos.forEach((foto, i) => {
        adicionarMiniatura(foto.thumbnail, i + 1);
    });
    
    atualizarContadorFotos();
    mostrarMensagem('🗑️ Foto removida', 'info');
}

function atualizarContadorFotos() {
    const total = AppState.fotos.length;
    elementos.contadorFotos.textContent = total + '/' + CONFIG.maxFotos + ' fotos';
    elementos.contadorFotos.className = 'contador-fotos';
    
    if (total >= CONFIG.minFotos) {
        elementos.contadorFotos.classList.add('completo');
    }
}

function proximaFoto() {
    if (AppState.fotos.length < CONFIG.minFotos) {
        mostrarMensagem('⚠️ Tire pelo menos ' + CONFIG.minFotos + ' fotos!', 'warning');
        return;
    }
    
    console.log('➡️ Avançando para extração de dados');
    
    // Parar câmera
    const stream = elementos.video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    
    elementos.containerCamera.style.display = 'none';
    elementos.btnCapturar.style.display = 'none';
    elementos.btnProximaFoto.style.display = 'none';
    elementos.btnExtrairDados.disabled = false;
    
    mostrarMensagem('✅ ' + AppState.fotos.length + ' fotos prontas! Clique em "Extrair Dados" para continuar.', 'success');
}

// ===================================================================
// EXTRAÇÃO DE DADOS (ETAPA 1)
// ===================================================================

async function extrairDados() {
    console.log('🔍 Iniciando Etapa 1 - Extração de Dados');
    
    if (AppState.fotos.length < CONFIG.minFotos) {
        mostrarMensagem('⚠️ Tire pelo menos ' + CONFIG.minFotos + ' fotos primeiro!', 'warning');
        return;
    }
    
    elementos.loadingExtracao.style.display = 'flex';
    elementos.btnExtrairDados.disabled = true;
    
    try {
        console.log('📤 Enviando ' + AppState.fotos.length + ' imagens para API');
        console.log('📊 Tamanho total:', calcularTamanhoTotal() + ' KB');
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa1', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imagens: AppState.fotos
            })
        });
        
        console.log('📥 Resposta API:', response.status);
        
        if (!response.ok) {
            throw new Error('Erro HTTP: ' + response.status);
        }
        
        const resultado = await response.json();
        console.log('✅ Dados recebidos:', resultado);
        
        if (resultado.status === 'Sucesso') {
            // Armazenar resultado completo
            AppState.dadosEtapa1 = resultado;
            
            // Preencher formulário
            const dados = resultado.dados;
            elementos.numeroPatrimonio.value = dados.numero_patrimonio || '';
            elementos.nomeProduto.value = dados.nome_produto || '';
            elementos.estado.value = dados.estado_conservacao || 'Bom';
            elementos.depreciacao.value = dados.categoria_depreciacao || 'Outros';
            elementos.descricao.value = dados.descricao || '';
            
            // Log dos dados extraídos (DEBUG)
            console.log('📦 [DEBUG] Dados extraídos:');
            console.log('  - Nome:', dados.nome_produto);
            console.log('  - Marca:', dados.marca);
            console.log('  - Modelo:', dados.modelo);
            console.log('  - Specs:', dados.especificacoes);
            console.log('  - Estado:', dados.estado_conservacao);
            console.log('  - Categoria:', dados.categoria_depreciacao);
            
            // Bloquear campos para cópia (opcional)
            [elementos.numeroPatrimonio, elementos.nomeProduto, elementos.estado, 
             elementos.depreciacao, elementos.descricao].forEach(campo => {
                campo.style.cursor = 'text';
                campo.title = 'Clique para copiar';
            });
            
            console.log('🔒 Campos bloqueados para edição (clique para copiar)');
            
            // Habilitar busca de preço
            elementos.btnBuscarPreco.disabled = false;
            
            mostrarMensagem('✅ Dados extraídos! Agora busque o preço de mercado.', 'success');
        } else {
            throw new Error(resultado.mensagem || 'Erro ao extrair dados');
        }
        
    } catch (erro) {
        console.error('❌ Erro na Etapa 1:', erro);
        mostrarMensagem('❌ Erro ao extrair dados: ' + erro.message, 'error');
        elementos.btnExtrairDados.disabled = false;
    } finally {
        elementos.loadingExtracao.style.display = 'none';
    }
}

function calcularTamanhoTotal() {
    const totalBytes = AppState.fotos.reduce((acc, foto) => {
        return acc + (foto.data.length * 0.75);
    }, 0);
    return Math.round(totalBytes / 1024);
}

// ===================================================================
// BUSCA DE PREÇOS (ETAPA 2) - CORRIGIDO ✅
// ===================================================================

async function processarEtapa2() {
    console.log('🔍 Iniciando Etapa 2 - Busca de Preços');
    
    elementos.loadingPrecificacao.style.display = 'flex';
    elementos.btnBuscarPreco.disabled = true;
    
    try {
        if (AppState.fotos.length === 0) {
            throw new Error('Nenhuma foto carregada. Tire fotos primeiro!');
        }
        
        // ✅ CORREÇÃO: Obter dados LIMPOS da Etapa 1
        const dadosEtapa1 = AppState.dadosEtapa1?.dados || {};
        
        console.log('📋 Dados limpos da Etapa 1:', dadosEtapa1);
        
        // ✅ CORREÇÃO: Usar dados limpos + especificacoes
        const dadosParaBusca = {
            numero_patrimonio: elementos.numeroPatrimonio.value || dadosEtapa1.numero_patrimonio || 'N/A',
            nome_produto: elementos.nomeProduto.value || dadosEtapa1.nome_produto || 'N/A',
            
            // ✅ CORREÇÃO PRINCIPAL: Usar marca, modelo e especificacoes limpos da Etapa 1
            marca: dadosEtapa1.marca || 'N/A',
            modelo: dadosEtapa1.modelo || 'N/A',
            especificacoes: dadosEtapa1.especificacoes || 'N/A', // ✅ ADICIONADO
            descricao: dadosEtapa1.descricao || elementos.descricao.value || 'N/A',
            
            estado_conservacao: elementos.estado.value || dadosEtapa1.estado_conservacao || 'Bom',
            categoria_depreciacao: elementos.depreciacao.value || dadosEtapa1.categoria_depreciacao || 'Outros'
        };
        
        console.log('📤 Enviando dados para Etapa 2:', dadosParaBusca);
        
        const response = await fetch(CONFIG.apiUrl + '/api/processar-etapa2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosParaBusca)
        });
        
        console.log('📥 Resposta Etapa 2:', response.status);
        
        if (!response.ok) {
            const erro = await response.json();
            console.log('❌ Erro da API:', erro);
            throw new Error(erro.mensagem || 'Erro HTTP: ' + response.status);
        }
        
        const resultado = await response.json();
        console.log('✅ Dados recebidos Etapa 2:', resultado);
        
        if (resultado.status === 'Sucesso') {
            // Armazenar resultado
            AppState.dadosEtapa2 = resultado;
            
            // Preencher campos de precificação
            const valores = resultado.dados.valores_estimados;
            
            elementos.valorMercado.value = formatarMoeda(valores.valor_mercado_estimado);
            elementos.valorAtual.value = formatarMoeda(valores.valor_atual_estimado);
            elementos.fatorDepreciacao.value = valores.fator_depreciacao.toFixed(2);
            elementos.scoreConfianca.value = valores.score_confianca.toFixed(0) + '%';
            
            // Habilitar salvamento
            elementos.btnSalvarAtivo.disabled = false;
            
            mostrarMensagem('✅ Precificação concluída! Score: ' + valores.score_confianca.toFixed(0) + '%', 'success');
            
            // Log de debug
            if (resultado.dados.precos_coletados) {
                console.log('📊 Preços coletados:', resultado.dados.precos_coletados);
                console.log('📊 Estratégia:', resultado.dados.estrategia_busca);
            }
            
        } else {
            throw new Error(resultado.mensagem || 'Falha na precificação');
        }
        
    } catch (erro) {
        console.error('❌ Erro na Etapa 2:', erro);
        mostrarMensagem('❌ Erro ao buscar preço: ' + erro.message, 'error');
        elementos.btnBuscarPreco.disabled = false;
    } finally {
        elementos.loadingPrecificacao.style.display = 'none';
    }
}

// ===================================================================
// FINALIZAÇÃO
// ===================================================================

async function salvarAtivo() {
    console.log('💾 Salvando ativo...');
    
    const ativoCompleto = {
        etapa1: AppState.dadosEtapa1,
        etapa2: AppState.dadosEtapa2,
        fotos: AppState.fotos.map(f => f.thumbnail),
        data_cadastro: new Date().toISOString()
    };
    
    console.log('📦 Dados completos do ativo:', ativoCompleto);
    
    // Aqui você implementaria o salvamento real (banco de dados, etc)
    // Por enquanto, apenas simula
    
    mostrarMensagem('✅ Ativo salvo com sucesso!', 'success');
    
    setTimeout(() => {
        elementos.btnNovoAtivo.style.display = 'inline-block';
    }, 1000);
}

function novoAtivo() {
    console.log('🔄 Iniciando novo ativo...');
    
    if (confirm('Deseja realmente iniciar um novo ativo? Os dados atuais serão perdidos.')) {
        location.reload();
    }
}

// ===================================================================
// UTILITÁRIOS
// ===================================================================

function formatarMoeda(valor) {
    return 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
}

function mostrarMensagem(texto, tipo = 'info') {
    elementos.mensagemTexto.textContent = texto;
    elementos.containerMensagem.className = 'mensagem mensagem-' + tipo;
    elementos.containerMensagem.style.display = 'block';
    
    setTimeout(() => {
        elementos.containerMensagem.style.display = 'none';
    }, 5000);
}

// ===================================================================
// COPIAR PARA ÁREA DE TRANSFERÊNCIA (BONUS)
// ===================================================================

[elementos.numeroPatrimonio, elementos.nomeProduto, elementos.estado, 
 elementos.depreciacao, elementos.descricao].forEach(campo => {
    campo.addEventListener('click', function() {
        this.select();
        document.execCommand('copy');
        mostrarMensagem('📋 Copiado: ' + this.value.substring(0, 30) + '...', 'info');
    });
});

console.log('✅ App.js carregado e pronto!');

// ===================================================================
// CTRL+V PARA COLAR IMAGENS (REABITADO)
// ===================================================================

let proximoSlotDisponivel = 1;

document.addEventListener('paste', (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            event.preventDefault();
            
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            
            reader.onload = (e) => {
                // Procurar próximo slot vazio
                let slotPreenchido = false;
                
                for (let slotIndex = 1; slotIndex <= 3; slotIndex++) {
                    const slot = document.querySelector(`.photo-slot[data-index="${slotIndex}"]`);
                    const preview = slot.querySelector('.photo-preview');
                    
                    // Se o slot está vazio
                    if (preview.style.display === 'none') {
                        const placeholder = slot.querySelector('.photo-placeholder');
                        const btnRemove = slot.querySelector('.btn-remove');
                        
                        // Preencher slot
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                        placeholder.style.display = 'none';
                        btnRemove.style.display = 'flex';
                        
                        // Adicionar aos dados
                        const fotoData = e.target.result.split(',')[1];
                        AppState.fotos[slotIndex - 1] = {
                            data: fotoData,
                            timestamp: new Date().toISOString(),
                            thumbnail: e.target.result
                        };
                        
                        console.log('✅ Foto colada no slot', slotIndex);
                        atualizarContadorFotos();
                        slotPreenchido = true;
                        break;
                    }
                }
                
                if (!slotPreenchido) {
                    mostrarMensagem('⚠️ Todos os slots de fotos estão preenchidos!', 'warning');
                }
            };
            
            reader.readAsDataURL(blob);
            break;
        }
    }
});

// ===================================================================
// ATUALIZAR CONTADOR E BOTÃO PROCESSAR
// ===================================================================

function atualizarContadorFotos() {
    const totalFotos = AppState.fotos.filter(f => f !== null && f !== undefined).length;
    
    // Habilitar botão se >= 2 fotos
    if (totalFotos >= CONFIG.minFotos) {
        elementos.btnProcessarEtapa1 = document.getElementById('processarEtapa1');
        if (elementos.btnProcessarEtapa1) {
            elementos.btnProcessarEtapa1.disabled = false;
        }
    }
    
    console.log('📸 Total de fotos:', totalFotos);
}

// ===================================================================
// REMOVER FOTO (Ctrl+V compatível)
// ===================================================================

window.removerFoto = function(indice) {
    console.log('🗑️ Removendo foto', indice + 1);
    
    const slot = document.querySelector(`.photo-slot[data-index="${indice + 1}"]`);
    const preview = slot.querySelector('.photo-preview');
    const placeholder = slot.querySelector('.photo-placeholder');
    const btnRemove = slot.querySelector('.btn-remove');
    const input = slot.querySelector('input[type="file"]');
    
    // Limpar slot
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    btnRemove.style.display = 'none';
    input.value = '';
    
    // Remover dos dados
    AppState.fotos[indice] = null;
    
    atualizarContadorFotos();
    mostrarMensagem('🗑️ Foto removida', 'info');
};

console.log('✅ App.js carregado e pronto!');