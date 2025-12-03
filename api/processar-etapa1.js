const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuração ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(API_KEY);

// --- Definições de Custo CORRIGIDAS ---
const TAXA_CAMBIO_USD_BRL = 6.00;

const USD_INPUT_POR_MILHAO = 0.15;
const USD_OUTPUT_POR_MILHAO = 0.60;

const CUSTO_INPUT_POR_TOKEN = (USD_INPUT_POR_MILHAO / 1_000_000) * TAXA_CAMBIO_USD_BRL;
const CUSTO_OUTPUT_POR_TOKEN = (USD_OUTPUT_POR_MILHAO / 1_000_000) * TAXA_CAMBIO_USD_BRL;

const TOKENS_POR_IMAGEM_512PX = 1610;

const PROMPT_SISTEMA = `Extraia informações do ativo em JSON (sem markdown):

{
  "numero_patrimonio": "placa/etiqueta ou N/A",
  "nome_produto": "nome genérico catalográfico (max 4 palavras)",
  "termo_busca_comercial": "termo para buscar produto similar novo em marketplace (max 6 palavras)",
  "marca": "fabricante ou N/A",
  "modelo": "código ou N/A",
  "especificacoes": "specs técnicas da placa ou observáveis ou N/A",
  "estado_conservacao": "Excelente|Bom|Regular|Ruim",
  "motivo_conservacao": "motivo se Regular/Ruim (max 3 palavras) ou N/A",
  "categoria_depreciacao": "Computadores e Informática|Ferramentas|Instalações|Máquinas e Equipamentos|Móveis e Utensílios|Veículos|Outros",
  "descricao": "descrição completa contextual (180-200 chars)"
}

REGRAS DE PADRONIZAÇÃO:

1. numero_patrimonio:
   - EXTRAIR APENAS O NÚMERO da plaqueta de patrimônio
   - IGNORAR: Nome de empresa, CNPJ, endereço, códigos de barras
   - Exemplo: "TechIMPORT CNPJ 15.524.734/0001-47 PATRIMÔNIO 02246" → "02246"
   - Se não houver: N/A

2. nome_produto:
   - Termo TÉCNICO/CATALOGRÁFICO para inventário
   - Genérico, máximo 4 palavras
   - Exemplos: "Armário de Gavetas", "Impressora Multifuncional", "Furadeira de Impacto"

3. termo_busca_comercial:
   - Como digitaria no MERCADO LIVRE para COMPRAR este produto NOVO
   - Incluir características VISÍVEIS que diferenciam o produto
   - MÁXIMO 6 palavras
   - Exemplos:
     * Armário branco metal 5 gavetas → "Gaveteiro Industrial 5 Gavetas Metal"
     * Cadeira presidente couro → "Cadeira Presidente Giratória Couro"
     * Notebook Dell → "Notebook Dell Core i5"

4. marca/modelo:
   - marca: Fabricante do EQUIPAMENTO (Dell, HP, Makita)
   - NUNCA: Nome da empresa proprietária
   - modelo: Código comercial do fabricante
   - Se ausente: N/A

5. especificacoes (COMPLETAS E OBSERVÁVEIS):
   - SE HOUVER PLACA: Copiar todos dados técnicos
   - SE NÃO HOUVER: Incluir TODAS características observáveis:
     * Material, cor, dimensões aproximadas
     * Gavetas/portas/prateleiras
     * Rodízios, fechaduras, características estruturais
   - Exemplo SEM placa: "Metal pintado branco, aprox 120cm altura x 70cm largura, 5 gavetas corrediças com placas identificadoras, gaveta inferior com fechadura, rodízios industriais, tampo liso"
   - Exemplo COM placa: "710W, 220V, 60Hz, rotação 0-2800 rpm, mandril 13mm, peso 1,8kg"

6. estado_conservacao:
   - Excelente: Novo/como novo
   - Bom: Uso normal, sem danos
   - Regular: Desgaste acentuado
   - Ruim: Danos visíveis

7. motivo_conservacao:
   - OBRIGATÓRIO se Regular/Ruim
   - Max 3 palavras: "ferrugem avançada", "desgaste visível"
   - Se Excelente/Bom: N/A

8. categoria_depreciacao:
   - Notebooks/PCs/impressoras → "Computadores e Informática"
   - Ferramentas manuais/elétricas → "Ferramentas"
   - Ar condicionado/elétrica → "Instalações"
   - Geradores/tornos/prensas → "Máquinas e Equipamentos"
   - Mesas/cadeiras/armários → "Móveis e Utensílios"
   - Veículos → "Veículos"
   - Outros → "Outros"

9. descricao (CAMPO PRINCIPAL - 180-200 CARACTERES):
   - OBJETIVO: Descrição COMPLETA do ativo para cadastro de inventário
   - USAR 180-200 caracteres (não desperdiçar espaço!)
   - ESTRUTURA:
     * "[nome] [aplicação/função]. [Características principais sintetizadas]. [S/N/Ano se houver]. [Contexto de uso]."
   - NÃO repetir especificacoes literalmente
   - SINTETIZAR specs em linguagem natural descritiva
   - INCLUIR contexto de uso quando óbvio (oficina, escritório, etc)
   
   EXEMPLOS CORRETOS (~180-200 chars):
   
   "Armário de Gavetas industrial para ferramentas. Metal branco, 5 gavetas corrediças com identificadores, gaveta inferior com fechadura, rodízios industriais, tampo liso. Típico de oficinas e almoxarifado."
   
   "Cadeira de Escritório tipo presidente, estofado sintético preto com apoio lombar ajustável. Base giratória com 5 rodízios duplos, regulagem de altura a gás, suporte até 120kg. S/N: CP-2019-4521."
   
   "Impressora Multifuncional HP LaserJet Pro M428fdw. Tecnologia laser monocromática, impressão duplex automático, alimentador ADF 50 folhas, conectividade rede ethernet e WiFi. Velocidade 40 ppm. S/N: BRDB8K2Q7N."
   
   "Furadeira de Impacto Makita modelo HP1640. Potência 710W/220V, rotação variável 0-2800 rpm, mandril 13mm, impacto ajustável. Peso 1,8kg. Fabricação 2017. Uso profissional construção e manutenção."
   
   "Gerador Diesel Toyama TDG8000SLE3 com motor 10HP. Potência contínua 6500W monofásico 220V, partida elétrica e manual, tanque 25L com autonomia 8h. Proteção sobrecarga. Ano 2020. Para uso emergencial."

EXEMPLOS COMPLETOS:

Gaveteiro:
{
  "numero_patrimonio": "02149",
  "nome_produto": "Armário de Gavetas",
  "termo_busca_comercial": "Gaveteiro Industrial 5 Gavetas Metal",
  "marca": "N/A",
  "modelo": "N/A",
  "especificacoes": "Metal pintado branco, aprox 120cm altura x 70cm largura, 5 gavetas corrediças com placas identificadoras, gaveta inferior com fechadura, rodízios industriais, tampo liso removível",
  "estado_conservacao": "Regular",
  "motivo_conservacao": "desgaste visível",
  "categoria_depreciacao": "Móveis e Utensílios",
  "descricao": "Armário de Gavetas industrial para ferramentas. Metal branco, 5 gavetas corrediças com identificadores, gaveta inferior com fechadura, rodízios industriais, tampo liso. Típico de oficinas e almoxarifado."
}

Cadeira:
{
  "numero_patrimonio": "00157",
  "nome_produto": "Cadeira de Escritório",
  "termo_busca_comercial": "Cadeira Presidente Giratória Preta",
  "marca": "Cavaletti",
  "modelo": "Air Plus",
  "especificacoes": "Estofado sintético preto, apoio lombar ajustável, base giratória 5 rodas, rodízios duplos, regulagem altura a gás, suporte 120kg",
  "estado_conservacao": "Bom",
  "motivo_conservacao": "N/A",
  "categoria_depreciacao": "Móveis e Utensílios",
  "descricao": "Cadeira de Escritório tipo presidente, estofado sintético preto com apoio lombar ajustável. Base giratória com 5 rodízios duplos, regulagem de altura a gás, suporte até 120kg. S/N: CP-2019-4521."
}

Impressora:
{
  "numero_patrimonio": "08934",
  "nome_produto": "Impressora Multifuncional",
  "termo_busca_comercial": "Impressora HP LaserJet M428 Laser",
  "marca": "HP",
  "modelo": "LaserJet Pro MFP M428fdw",
  "especificacoes": "Laser monocromático, duplex automático, ADF 50 folhas, rede ethernet e WiFi, impressão 40 ppm, scanner 600x600 dpi",
  "estado_conservacao": "Excelente",
  "motivo_conservacao": "N/A",
  "categoria_depreciacao": "Computadores e Informática",
  "descricao": "Impressora Multifuncional HP LaserJet Pro M428fdw. Tecnologia laser monocromática, impressão duplex automático, alimentador ADF 50 folhas, conectividade rede ethernet e WiFi. Velocidade 40 ppm. S/N: BRDB8K2Q7N."
}
`;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    
    console.log('🔍 [ETAPA1] Iniciando extração...');
    
    try {
        const { imagens } = req.body;
        
        console.log('📥 [ETAPA1] Recebidas ' + (imagens?.length || 0) + ' imagens');
        
        if (!imagens || imagens.length < 2) {
            return res.status(400).json({
                status: 'Falha',
                mensagem: 'Mínimo de 2 imagens necessárias',
                dados: {}
            });
        }
        
        if (!API_KEY) {
            return res.status(500).json({
                status: 'Falha',
                mensagem: 'API Key não configurada',
                dados: {}
            });
        }
        
        const model = genAI.getGenerativeModel({
            model: MODEL,
            generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json'
            }
        });
        
        const imageParts = imagens.map(img => ({
            inlineData: {
                data: img.data,
                mimeType: 'image/jpeg'
            }
        }));
        
        const result = await model.generateContent([
            PROMPT_SISTEMA,
            ...imageParts
        ]);
        
        // Auditoria de tokens
        const usage = result.response.usageMetadata;
        const numImagens = imagens.length;
        
        const tokensInput = usage?.promptTokenCount || 0;
        const tokensOutput = usage?.candidatesTokenCount || 0;
        const tokensTotal = tokensInput + tokensOutput;
        const tokensImagemEstimados = numImagens * TOKENS_POR_IMAGEM_512PX;
        
        const custoInput = tokensInput * CUSTO_INPUT_POR_TOKEN;
        const custoOutput = tokensOutput * CUSTO_OUTPUT_POR_TOKEN;
        const custoTotal = custoInput + custoOutput;
        
        console.log('📊 [ETAPA1] Tokens:', {
            Input: tokensInput,
            Output: tokensOutput,
            Total: tokensTotal,
            Custo: `R$ ${custoTotal.toFixed(4)}`
        });
        
        const text = result.response.text();
        
        // Parse JSON
        let dadosExtraidos;
        try {
            let jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonText = jsonMatch[0];
            dadosExtraidos = JSON.parse(jsonText);
        } catch (parseError) {
            throw new Error('JSON inválido: ' + parseError.message);
        }
        
        // Validações
        const camposObrigatorios = [
            'numero_patrimonio', 'nome_produto', 'termo_busca_comercial',
            'marca', 'modelo', 'especificacoes', 'estado_conservacao',
            'motivo_conservacao', 'categoria_depreciacao', 'descricao'
        ];
        
        camposObrigatorios.forEach(campo => {
            if (dadosExtraidos[campo] === undefined) {
                dadosExtraidos[campo] = 'N/A';
            }
        });
        
        const estadosValidos = ['Excelente', 'Bom', 'Regular', 'Ruim'];
        if (!estadosValidos.includes(dadosExtraidos.estado_conservacao)) {
            dadosExtraidos.estado_conservacao = 'Bom';
        }
        
        if (['Excelente', 'Bom'].includes(dadosExtraidos.estado_conservacao)) {
            dadosExtraidos.motivo_conservacao = 'N/A';
        }
        
        const categoriasValidas = [
            'Computadores e Informática', 'Ferramentas', 'Instalações',
            'Máquinas e Equipamentos', 'Móveis e Utensílios', 'Veículos', 'Outros'
        ];
        
        if (!categoriasValidas.includes(dadosExtraidos.categoria_depreciacao)) {
            dadosExtraidos.categoria_depreciacao = 'Outros';
        }
        
        const dadosCompletos = {
            ...dadosExtraidos,
            metadados: {
                data_extracao: new Date().toISOString(),
                confianca_ia: 95,
                total_imagens_processadas: imagens.length,
                modelo_ia: MODEL,
                versao_sistema: '2.4-Descricao-200chars',
                tokens_input: tokensInput,
                tokens_output: tokensOutput,
                tokens_total: tokensTotal,
                tokens_imagem_estimados: tokensImagemEstimados,
                custo_input: parseFloat(custoInput.toFixed(4)),
                custo_output: parseFloat(custoOutput.toFixed(4)),
                custo_total: parseFloat(custoTotal.toFixed(4)),
                taxa_cambio: TAXA_CAMBIO_USD_BRL
            }
        };
        
        console.log('✅ [ETAPA1] Concluído! Custo: R$', custoTotal.toFixed(4));
        
        return res.status(200).json({
            status: 'Sucesso',
            dados: dadosCompletos,
            mensagem: 'Dados extraídos com sucesso'
        });
        
    } catch (error) {
        console.error('❌ [ETAPA1]', error.message);
        return res.status(500).json({
            status: 'Falha',
            mensagem: 'Erro ao processar: ' + error.message,
            dados: {}
        });
    }
};
```

---

## ✅ **Resultado Esperado**

Com o novo prompt, a descrição ficará:
```
"Armário de Gavetas industrial para ferramentas. Metal branco, 5 gavetas corrediças com identificadores, gaveta inferior com fechadura, rodízios industriais, tampo liso. Típico de oficinas e almoxarifado."