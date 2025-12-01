const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuração ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(API_KEY);

const PROMPT_SISTEMA = `Extraia informações do ativo em JSON (sem markdown):

{
  "numero_patrimonio": "placa/etiqueta ou N/A",
  "nome_produto": "nome genérico (max 4 palavras)",
  "marca": "fabricante ou N/A",
  "modelo": "código ou N/A",
  "especificacoes": "specs técnicas da placa ou observáveis ou N/A",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim (max 3 palavras) ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição técnica completa (max 200 chars)"
}

REGRAS DE PADRONIZAÇÃO:

1. numero_patrimonio:
   - EXTRAIR APENAS O NÚMERO da plaqueta de patrimônio
   - IGNORAR: Nome de empresa, CNPJ, endereço, códigos de barras
   - Exemplo: "TechIMPORT CNPJ 15.524.734/0001-47 PATRIMÔNIO 02246" → "02246"
   - Se não houver: N/A

2. nome_produto:
   - Use o termo de BUSCA comercial (como você digitaria no Mercado Livre para COMPRAR este produto novo)
   - Genérico, técnico, máximo 4 palavras
   - Exemplos: "Cadeira de Escritório", "Impressora Multifuncional", "Furadeira de Impacto"
   - NUNCA: Termos vagos ("Cadeira") ou descrições funcionais ("Sistema de remoção")

3. marca/modelo (NÃO CONFUNDIR COM PROPRIETÁRIO):
   - marca: Fabricante do EQUIPAMENTO (Dell, HP, Makita, Samsung)
   - NUNCA usar: Nome da empresa proprietária da plaqueta
   - modelo: Código comercial do fabricante
   - S/N NÃO é modelo (vai em descricao)
   - Se ausente: N/A

4. especificacoes (TRANSCRIÇÃO LITERAL OU OBSERVAÇÃO):
   - SE HOUVER PLACA TÉCNICA: Copiar exatamente todos dados técnicos
   - SE NÃO HOUVER PLACA: Incluir características técnicas OBSERVÁVEIS:
     * Material (aço inox, madeira, plástico, alumínio, MDF)
     * Dimensões aproximadas se relevantes (ex: "aprox 2m x 1m")
     * Características construtivas (gavetas, prateleiras, rodízios)
     * Capacidade, potência, voltagem se visível
   - NÃO incluir: Dados da plaqueta de patrimônio
   - NÃO resumir, NÃO omitir
   - ORDEM: Seguir ordem da placa original (se houver)
   - INCLUIR: tensões, correntes, potências, temperaturas, frequências, códigos normativos, massa, ano, impedância, classe de isolamento
   - ATENÇÃO OCR: 3≠1, 5≠6, 8≠0, 9≠4
   - Exemplo COM placa: "710W, 220V, 60Hz, rotação variável 0-2800 rpm, mandril 13mm"
   - Exemplo SEM placa: "Aço inoxidável, 3 gavetas, prateleira inferior fixa, rodízios"
   - Se não houver placa NEM características observáveis: N/A

5. estado_conservacao:
   - CRITÉRIOS OBJETIVOS:
   - Excelente: Novo/como novo, sem marcas de uso
   - Bom: Uso normal, funcionando, sem danos estruturais
   - Regular: Marcas de uso acentuado, riscos, manchas
   - Ruim: Danos visíveis, ferrugem, peças quebradas

6. motivo_conservacao:
   - OBRIGATÓRIO se Regular/Ruim
   - MÁXIMO 3 palavras
   - Exemplos: "ferrugem avançada", "peças faltando", "tinta descascada", "desgaste visível"
   - Se Excelente/Bom: N/A

7. categoria_depreciacao:
   - ESCOLHER EXATAMENTE UM da lista
   - PADRONIZAÇÃO POR TIPO:
     * Notebooks, PCs, impressoras, tablets → "Computadores e Informática"
     * Chaves, alicates, furadeiras, serras → "Ferramentas"
     * Ar condicionado, elétrica predial, hidráulica → "Instalações"
     * Transformadores, geradores, tornos, prensas → "Máquinas e Equipamentos"
     * Mesas, cadeiras, armários, estantes, bancadas → "Móveis e Utensílios"
     * Carros, motos, empilhadeiras, caminhões → "Veículos"
     * Qualquer outro → "Outros"

8. descricao (FORMATO PADRONIZADO):
   - ESTRUTURA FIXA: "[nome_produto] [marca] [modelo], [specs principais], [S/N se houver], [ano se houver], [características físicas fixas]"
   - PRIORIZAR NESTA ORDEM: Ano, S/N, normas técnicas
   - INCLUIR se aplicável: "embalado parcialmente" ou "embalado totalmente"
   - NUNCA incluir: Nome da empresa proprietária, CNPJ, cor, localização, estado de conservação, acessórios removíveis (tapetes, cabos soltos, suportes móveis)
   - MAX 200 caracteres

VALIDAÇÃO FINAL OBRIGATÓRIA (checklist mental antes de retornar):
□ numero_patrimonio contém APENAS números (sem CNPJ, sem empresa)
□ marca é do fabricante do equipamento (não da empresa dona)
□ especificacoes está em ordem da placa original OU contém características observáveis
□ S/N está em descricao (nunca em especificacoes ou modelo)
□ estado_conservacao é um dos 4 valores exatos
□ categoria_depreciacao é um dos 7 valores exatos da lista
□ descricao segue o formato padronizado e tem ≤200 chars
□ Acessórios removíveis NÃO estão em descricao

EXEMPLOS DE PADRONIZAÇÃO CORRETA:

Cadeira: {"numero_patrimonio":"00157","nome_produto":"Cadeira de Escritório","marca":"Cavaletti","modelo":"Air Plus","especificacoes":"Apoio lombar ajustável, base giratória, rodízios duplos, suporte até 120kg","estado_conservacao":"Bom","motivo_conservacao":"N/A","categoria_depreciacao":"Móveis e Utensílios","descricao":"Cadeira de Escritório Cavaletti Air Plus, apoio lombar, base giratória, S/N: CP-2019-4521."}

Impressora: {"numero_patrimonio":"08934","nome_produto":"Impressora Multifuncional","marca":"HP","modelo":"LaserJet Pro MFP M428fdw","especificacoes":"Laser monocromático, duplex automático, ADF 50 folhas, rede ethernet, WiFi","estado_conservacao":"Excelente","motivo_conservacao":"N/A","categoria_depreciacao":"Computadores e Informática","descricao":"Impressora HP LaserJet Pro M428fdw, laser mono, duplex, rede, S/N: BRDB8K2Q7N."}

Furadeira: {"numero_patrimonio":"01245","nome_produto":"Furadeira de Impacto","marca":"Makita","modelo":"HP1640","especificacoes":"710W, 220V, 60Hz, rotação variável 0-2800 rpm, mandril 13mm","estado_conservacao":"Regular","motivo_conservacao":"desgaste visível","categoria_depreciacao":"Ferramentas","descricao":"Furadeira Makita HP1640, 710W, 220V, mandril 13mm, Ano 2017."}

Gerador: {"numero_patrimonio":"00892","nome_produto":"Gerador Diesel","marca":"Toyama","modelo":"TDG8000SLE3","especificacoes":"Diesel, 6500W contínuos, monofásico 220V, partida elétrica, autonomia 8h","estado_conservacao":"Bom","motivo_conservacao":"N/A","categoria_depreciacao":"Máquinas e Equipamentos","descricao":"Gerador Toyama TDG8000SLE3, diesel 6500W, partida elétrica, Ano 2020."}

Ar-Condicionado: {"numero_patrimonio":"03421","nome_produto":"Ar Condicionado Split","marca":"Samsung","modelo":"AR12BVHZCWK","especificacoes":"12000 BTU, inverter, gás R410A, 220V, classe A, Digital Inverter Compressor","estado_conservacao":"Excelente","motivo_conservacao":"N/A","categoria_depreciacao":"Instalações","descricao":"Ar Condicionado Samsung 12000 BTU inverter, R410A, 220V, S/N: A201BC4578."}
`;

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
    
    console.log('🔍 [ETAPA1] Iniciando extração...');
    
    try {
        const { imagens } = req.body;
        
        console.log('📥 [ETAPA1] Recebidas ' + (imagens?.length || 0) + ' imagens');
        
        if (!imagens || imagens.length < 2) {
            console.log('⚠️ [ETAPA1] Mínimo de imagens não atingido');
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Mínimo de 2 imagens necessárias',
                dados: {}
            });
        }
        
        if (!API_KEY) {
            console.error('❌ [ETAPA1] GOOGLE_API_KEY não configurada');
            return res.status(500).json({
                status: 'Falha',
                mensagem: 'API Key não configurada',
                dados: {}
            });
        }
        
        console.log('🤖 [ETAPA1] Inicializando modelo:', MODEL);
        
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json'
            }
        });
        
        console.log('🖼️ [ETAPA1] Preparando ' + imagens.length + ' imagens...');
        
        const imageParts = imagens.map(img => ({
            inlineData: {
                data: img.data,
                mimeType: 'image/jpeg'
            }
        }));
        
        console.log('📤 [ETAPA1] Enviando para Gemini...');
        
        const result = await model.generateContent([
            PROMPT_SISTEMA,
            ...imageParts
        ]);
        
        // ===== 📊 AUDITORIA DE TOKENS =====
        const usage = result.response.usageMetadata;
        console.log('📊 [ETAPA1-DIAGNÓSTICO] Tokens:', {
            input: usage?.promptTokenCount,
            output: usage?.candidatesTokenCount,
            total: usage?.totalTokenCount,
            custo_estimado: 'R$ ' + ((usage?.totalTokenCount || 0) * 0.00001).toFixed(4)
        });
        // ===== FIM AUDITORIA =====
        
        console.log('📥 [ETAPA1] Resposta recebida');
        
        const response = result.response;
        const text = response.text();
        
        console.log('📝 [ETAPA1-DIAGNÓSTICO] Resposta:', {
            caracteres: text.length,
            tokens_estimados: Math.ceil(text.length / 4)
        });
        
        // Parse JSON
        let dadosExtraidos;
        try {
            let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
                console.log('🎯 [ETAPA1] JSON isolado');
            }
            
            console.log('🧹 [ETAPA1] Parseando JSON...');
            
            dadosExtraidos = JSON.parse(jsonText);
            console.log('✅ [ETAPA1] JSON parseado com sucesso');
            
        } catch (parseError) {
            console.error('❌ [ETAPA1] Erro ao parsear:', parseError.message);
            console.error('📋 [ETAPA1] Texto completo:', text);
            throw new Error('JSON inválido: ' + parseError.message);
        }
        
        // Validação básica dos campos obrigatórios
        const camposObrigatorios = [
            'numero_patrimonio',
            'nome_produto',
            'marca',
            'modelo',
            'especificacoes',
            'estado_conservacao',
            'motivo_conservacao',
            'categoria_depreciacao',
            'descricao'
        ];
        
        const camposFaltando = camposObrigatorios.filter(campo => 
            dadosExtraidos[campo] === undefined
        );
        
        if (camposFaltando.length > 0) {
            console.warn('⚠️ [ETAPA1] Campos faltando:', camposFaltando);
            camposFaltando.forEach(campo => {
                dadosExtraidos[campo] = 'N/A';
            });
        }
        
        // Validação do estado de conservação
        const estadosValidos = ['Excelente', 'Bom', 'Regular', 'Ruim'];
        if (!estadosValidos.includes(dadosExtraidos.estado_conservacao)) {
            console.warn('⚠️ [ETAPA1] Estado inválido:', dadosExtraidos.estado_conservacao);
            dadosExtraidos.estado_conservacao = 'Bom';
        }
        
        // Validação do motivo_conservacao
        if (['Excelente', 'Bom'].includes(dadosExtraidos.estado_conservacao)) {
            dadosExtraidos.motivo_conservacao = 'N/A';
        }
        
        // Validação da categoria
        const categoriasValidas = [
            'Computadores e Informática',
            'Ferramentas',
            'Instalações',
            'Máquinas e Equipamentos',
            'Móveis e Utensílios',
            'Veículos',
            'Outros'
        ];
        
        if (!categoriasValidas.includes(dadosExtraidos.categoria_depreciacao)) {
            console.warn('⚠️ [ETAPA1] Categoria inválida:', dadosExtraidos.categoria_depreciacao);
            dadosExtraidos.categoria_depreciacao = 'Outros';
        }
        
        // Adicionar metadados
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ia: 95,
                total_imagens_processadas: imagens.length,
                modelo_ia: MODEL,
                versao_sistema: '2.1-Padronizado-Otimizado',
                tokens_consumidos: usage?.totalTokenCount || 0,
                custo_extracao: parseFloat(((usage?.totalTokenCount || 0) * 0.00001).toFixed(4))
            }
        };
        
        console.log('✅ [ETAPA1] Extração concluída!');
        console.log('📦 [ETAPA1] Produto:', dadosExtraidos.nome_produto);
        console.log('🏷️ [ETAPA1] Marca/Modelo:', dadosExtraidos.marca + ' / ' + dadosExtraidos.modelo);
        console.log('⚙️ [ETAPA1] Specs:', dadosExtraidos.especificacoes);
        console.log('💰 [ETAPA1] Custo:', 'R$ ' + dadosCompletos.metadados.custo_extracao);
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Dados extraídos com sucesso'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA1] Erro:', error.message);
        console.error('❌ [ETAPA1] Stack:', error.stack);
        
        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao processar: ' + error.message,
            dados: {
                numero_patrimonio: 'N/A',
                nome_produto: 'N/A',
                marca: 'N/A',
                modelo: 'N/A',
                especificacoes: 'N/A',
                estado_conservacao: 'N/A',
                motivo_conservacao: 'N/A',
                categoria_depreciacao: 'N/A',
                descricao: 'N/A'
            }
        });
    }
};