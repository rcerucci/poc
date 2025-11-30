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
  "especificacoes": "specs técnicas da placa ou N/A",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim (max 3 palavras) ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição técnica completa (max 200 chars)"
}

***REGRAS CRÍTICAS:***

1. **numero_patrimonio:** Plaqueta visível ou N/A

2. **nome_produto:** Genérico, técnico, curto. Manter consistência (Ex: 'Mesa de Trabalho' ou 'Bancada')

3. **marca/modelo:** Exatos de QUALQUER marcação (etiqueta/placa/estampado). **Marca = nome COMPLETO do fabricante.** Modelo = código comercial. **S/N NÃO é modelo**, vai na descrição.

4. ***especificacoes (CRÍTICO - LEITURA COMPLETA):***
   - **TRANSCREVER LITERALMENTE** todos os dados técnicos da placa
   - **NÃO resumir, NÃO omitir, NÃO arredondar valores**
   - **ATENÇÃO AO OCR:** Diferenciar 3 vs 1, 5 vs 6, 8 vs 0, 9 vs 4
   - **INCLUIR TUDO:** tensões, correntes, potências, temperaturas, frequências, códigos normativos, massa, ano, impedância, classe de isolamento, etc.
   - **ORDEM:** Seguir a ordem da placa
   - **Se não houver placa técnica:** N/A
   - **Exemplo:** "3 FASES, 30 kVA, 60 Hz, RESFR A M, LIG YND1, MAT. ISOL CLASSE F, ELEV TEMP ENROL 105°C, H-NI/NBI 0.5 kV, X-NI/NBI 0.5 kV, H 480/400/380 V, X 240/220/200 V, IMPEDÂNCIA 3.92% A 60Hz, 115°C, 200/420 V, MASSA TOTAL 330 Kg, ANO 2018"

5. **estado_conservacao:** Avaliação visual consistente

6. **motivo_conservacao:** Só se Regular/Ruim. Max 3 palavras

7. **categoria_depreciacao:** UM valor exato da lista

8. ***descricao (FORMATO OBRIGATÓRIO):***
   - **PRIORIDADE:** Dados valiosos primeiro (Ano, S/N, normas)
   - **INCLUIR:** Se embalado (parcial/total)
   - **EXCLUIR:** Acessórios externos não fixos (tapetes, cabos removíveis, suportes móveis)
   - **Formato:** "[Nome] [Marca] [Modelo], [principais specs], [S/N], [características físicas fixas]"
   - **NÃO incluir:** cor, localização, estado
   - **Max 200 chars**

***EXEMPLOS CORRETOS:***

Carrinho: {"numero_patrimonio":"02128","nome_produto":"Carrinho Porta-Ferramentas","marca":"N/A","modelo":"N/A","especificacoes":"N/A","estado_conservacao":"Bom","motivo_conservacao":"N/A","categoria_depreciacao":"Móveis e Utensílios","descricao":"Carrinho metal com prateleiras, gaveta, orifícios para mandris, rodízios"}

Notebook: {"numero_patrimonio":"15432","nome_produto":"Notebook","marca":"Dell","modelo":"Latitude 5420","especificacoes":"Intel i5, 8GB, 256GB SSD","estado_conservacao":"Excelente","motivo_conservacao":"N/A","categoria_depreciacao":"Computadores e Informática","descricao":"Notebook Dell Latitude 5420, Intel i5, 8GB RAM, 256GB SSD, S/N: G7H2K3P"}

Transformador: {"numero_patrimonio":"02003","nome_produto":"Transformador Seco","marca":"TRA Eletromecânica Ltda","modelo":"N/A","especificacoes":"3 FASES, 30 kVA, 60 Hz, RESFR A M, LIG YND1, MAT. ISOL CLASSE F, ELEV TEMP ENROL 105°C, H-NI/NBI 0.5 kV, X-NI/NBI 0.5 kV, H 480/400/380 V, X 240/220/200 V, IMPEDÂNCIA 3.92% A 60Hz, 115°C, 200/420 V, MASSA TOTAL 330 Kg, ANO 2018","estado_conservacao":"Bom","motivo_conservacao":"N/A","categoria_depreciacao":"Máquinas e Equipamentos","descricao":"Transformador Seco TRA Eletromecânica Ltda, 30 kVA, Ano 2018, S/N: 9-50-00058, ABNT NBR 10295/5356, massa 330 Kg"}

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
                temperature: 0.1,
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
        
        console.log('📥 [ETAPA1] Resposta recebida');
        
        const response = result.response;
        const text = response.text();
        
        console.log('📝 [ETAPA1] Texto (primeiros 300 chars):', text.substring(0, 300));
        
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
            console.log('📊 [ETAPA1] Dados:', JSON.stringify(dadosExtraidos, null, 2));
            
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
            // Preencher com N/A
            camposFaltando.forEach(campo => {
                dadosExtraidos[campo] = 'N/A';
            });
        }
        
        // Validação do estado de conservação
        const estadosValidos = ['Excelente', 'Bom', 'Regular', 'Ruim'];
        if (!estadosValidos.includes(dadosExtraidos.estado_conservacao)) {
            console.warn('⚠️ [ETAPA1] Estado inválido:', dadosExtraidos.estado_conservacao);
            dadosExtraidos.estado_conservacao = 'Bom'; // Default
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
            dadosExtraidos.categoria_depreciacao = 'Outros'; // Default
        }
        
        // Adicionar metadados
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ia: 95,
                total_imagens_processadas: imagens.length,
                modelo_ia: MODEL,
                versao_sistema: '2.0-Otimizado'
            }
        };
        
        console.log('✅ [ETAPA1] Extração concluída!');
        console.log('📦 [ETAPA1] Produto:', dadosExtraidos.nome_produto);
        console.log('🏷️ [ETAPA1] Marca/Modelo:', dadosExtraidos.marca + ' ' + dadosExtraidos.modelo);
        console.log('⚙️ [ETAPA1] Specs:', dadosExtraidos.especificacoes);
        
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