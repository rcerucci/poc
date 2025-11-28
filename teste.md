# Sistema Inteligente de Avaliação Patrimonial
## Prova de Conceito (POC)

---

## 1. VISÃO GERAL

Este documento apresenta uma Prova de Conceito (POC) de um sistema automatizado para identificação e avaliação de ativos patrimoniais utilizando inteligência artificial. O objetivo é demonstrar a viabilidade técnica de reduzir o tempo e aumentar a consistência no processo de cadastro patrimonial.

### 1.1 Público-Alvo
Profissionais de contabilidade, controladoria e gestão patrimonial.

### 1.2 Limitações da POC
**IMPORTANTE:** Esta é uma prova de conceito para validação técnica. Os valores e informações gerados pelo sistema são estimativas baseadas em análise automatizada e **NÃO substituem** a validação final do operador responsável. A decisão final sobre cadastro e valores patrimoniais permanece sob responsabilidade do contador ou gestor patrimonial.

---

## 2. PROBLEMA ATUAL

O processo manual de cadastro patrimonial apresenta desafios:

- **Tempo elevado:** 5 a 10 minutos por item para identificação e precificação
- **Inconsistência:** Variação na classificação entre diferentes operadores
- **Dificuldade de precificação:** Pesquisa manual de preços em múltiplas fontes
- **Subjetividade:** Avaliação do estado de conservação pode variar

---

## 3. SOLUÇÃO PROPOSTA

O sistema automatizado divide o processo em duas etapas independentes, utilizando inteligência artificial para auxiliar o operador.

### ETAPA 1: Identificação do Ativo

**Entrada:** Fotografias do item (mínimo 2 imagens)

**Processo:**
O sistema de visão computacional analisa as imagens e identifica:

1. **Número de Patrimônio:** Leitura de plaquetas ou etiquetas visíveis
2. **Identificação do Produto:** Nome genérico do ativo (ex: "Notebook", "Torno CNC", "Mesa Escritório")
3. **Marca e Modelo:** Fabricante e código específico quando visível
4. **Estado de Conservação:** Classificação visual em quatro categorias:
   - Excelente: Sem desgaste aparente
   - Bom: Desgaste mínimo, funcional
   - Regular: Desgaste moderado, sinais de uso
   - Ruim: Desgaste significativo, necessita manutenção
5. **Categoria de Depreciação:** Classificação contábil segundo RFB:
   - Equipamentos de Informática
   - Ferramentas
   - Instalações
   - Máquinas e Equipamentos
   - Móveis e Utensílios
   - Veículos
   - Outros
6. **Descrição Técnica:** Consolidação de especificações visíveis (voltagem, potência, características físicas)

**Saída:** Ficha técnica estruturada do ativo

**Validação Realizada:** Testes com mais de 40 itens complexos apresentaram 100% de precisão na identificação. O mesmo item consultado múltiplas vezes retorna sempre as mesmas informações, demonstrando consistência.

---

### ETAPA 2: Avaliação de Mercado

**Entrada:** Dados identificados na Etapa 1

**Processo:**
O sistema realiza pesquisa automatizada de preços utilizando três estratégias em ordem de prioridade:

#### 3.1 Estratégia de Busca

**1ª Prioridade - Fornecedores Corporativos (B2B) Nacionais:**
- Distribuidores atacadistas
- Representantes oficiais
- Canais corporativos de venda

**2ª Prioridade - Varejo Nacional (B2C):**
- Grandes varejistas online
- Marketplaces estabelecidos

**3ª Prioridade - Fornecedores Internacionais:**
- Fabricantes globais
- Distribuidores B2B internacionais
- **Ajuste aplicado:** Conversão cambial + 20% (custos de importação)

#### 3.2 Cálculo do Valor de Mercado

O sistema coleta entre 5 e 7 ofertas de diferentes fontes e aplica tratamento estatístico:

**Passo 1 - Filtro de Anomalias:**
Valores extremos (muito altos ou muito baixos) são identificados e removidos usando método estatístico IQR (Intervalo Interquartil), evitando distorções por promoções pontuais ou preços inflacionados.

**Passo 2 - Sistema de Pesos:**
Cada preço coletado recebe pontuação baseada em dois critérios:

- **Tipo de Fonte:**
  - B2B (corporativo): Peso 1.5
  - B2C (varejo): Peso 1.0
  
  *Justificativa: Preços B2B refletem melhor o custo real de aquisição empresarial, incluindo garantias corporativas e suporte.*

- **Recência da Oferta:**
  - Ofertas recentes (até 30 dias): Peso máximo
  - Ofertas antigas: Peso decrescente exponencial
  
  *Justificativa: Mercado de tecnologia e equipamentos tem variação de preço ao longo do tempo.*

**Passo 3 - Média Exponencial Ponderada (EMA):**
Cálculo de média que prioriza os preços com maior pontuação, resultando em valor mais representativo do mercado corporativo atual.

**Resultado:** Valor de Mercado Estimado (preço de aquisição novo)

#### 3.3 Cálculo do Valor Atual (Depreciado)

Aplicação de fatores de depreciação baseados em:
- Estado de conservação identificado
- Categoria do ativo

**IMPORTANTE:** Os fatores utilizados nesta POC são estimativas práticas para avaliação de ativos usados. Estes fatores **NÃO são** as taxas oficiais de depreciação da RFB (definidas na Instrução Normativa RFB 1700/2017, Anexo III, alterada pela IN RFB 1881/2019), que tratam de depreciação contábil anual para fins fiscais. 

Os fatores desta POC estimam o **valor de mercado residual** de ativos usados, considerando desgaste físico e obsolescência, e devem ser validados pelo contador conforme critérios contábeis e fiscais aplicáveis à organização.

**Tabela de Fatores Estimados (Valor Residual de Mercado):**

| Estado/Categoria | Excelente | Bom | Regular | Ruim |
|------------------|-----------|-----|---------|------|
| Equipamentos Informática | 90% | 75% | 55% | 35% |
| Máquinas e Equipamentos | 85% | 70% | 50% | 30% |
| Móveis e Utensílios | 80% | 65% | 45% | 25% |
| Veículos | 85% | 70% | 50% | 30% |
| Ferramentas | 85% | 70% | 50% | 30% |
| Instalações | 80% | 65% | 45% | 25% |
| Outros | 75% | 60% | 40% | 20% |

**Fórmula:**
```
Valor Atual = Valor de Mercado × Fator de Depreciação
```

**Exemplo Prático:**
- Notebook Dell identificado como "Bom"
- Valor de Mercado: R$ 4.500,00
- Fator: 75% (Equipamento Informática, Bom)
- **Valor Atual: R$ 3.375,00**

---

## 4. INFORMAÇÕES FORNECIDAS AO OPERADOR

O sistema gera relatório completo contendo:

### 4.1 Dados do Ativo
- Número de patrimônio
- Nome, marca e modelo
- Descrição técnica
- Estado de conservação
- Categoria contábil

### 4.2 Avaliação Financeira
- **Valor de Mercado Estimado:** Preço de reposição (produto novo)
- **Valor Atual Estimado:** Valor depreciado
- **Percentual de Depreciação Aplicado**
- **Fator de Depreciação Utilizado**

### 4.3 Transparência Metodológica
- **Número de preços coletados:** Quantas fontes foram consultadas
- **Intervalo de preços:** Valor mínimo e máximo encontrado
- **Desvio padrão:** Medida de variação entre os preços
- **Score de Confiança (0-100%):** Indicador de consistência dos dados
  - 90-100%: Alta confiança (preços muito similares)
  - 70-89%: Confiança média (alguma variação)
  - Abaixo 70%: Baixa confiança (grande variação, requer revisão)

### 4.4 Rastreabilidade
- Data e hora da análise
- Modelo de IA utilizado
- Método de cálculo aplicado
- Detalhamento das fontes consultadas

---

## 5. RESULTADOS DA POC

### 5.1 Identificação (Etapa 1)
- **Taxa de acerto:** 100% em 40+ itens testados
- **Consistência:** Múltiplas análises do mesmo item retornam resultados idênticos
- **Tempo médio:** 30 segundos por item

### 5.2 Precificação (Etapa 2)
- **Precisão:** Valores alinhados com mercado B2B real
- **Tendência observada:** Preços ligeiramente superiores ao varejo promocional (esperado para contexto corporativo)
- **Tempo médio:** 45 segundos por item

### 5.3 Comparação com Processo Manual

| Métrica | Processo Manual | Sistema POC | Melhoria |
|---------|-----------------|-------------|----------|
| Tempo por item | 5-10 minutos | 1-2 minutos | 5-10x mais rápido |
| Consistência | Varia por operador | Reproduzível | Alta |
| Documentação | Limitada | Completa e rastreável | Superior |
| Escalabilidade | Linear (precisa mais pessoas) | Exponencial | Alta |

---

## 6. RESPONSABILIDADES E VALIDAÇÕES

### 6.1 Responsabilidade do Sistema
- Fornecer estimativas baseadas em análise automatizada
- Apresentar dados de forma transparente e rastreável
- Indicar nível de confiança das estimativas

### 6.2 Responsabilidade do Operador (CRÍTICO)
O operador contador/gestor patrimonial **DEVE:**

✅ **Validar** todas as informações geradas  
✅ **Verificar** se categoria contábil está correta  
✅ **Confirmar** se estado de conservação reflete a realidade  
✅ **Ajustar** valores quando necessário baseado em conhecimento do mercado  
✅ **Documentar** alterações realizadas  
✅ **Aprovar** ou rejeitar o cadastro final  

**O sistema é uma ferramenta de auxílio, não de decisão autônoma.**

---

## 7. CONSIDERAÇÕES FINAIS

### 7.1 Benefícios da Automação
- Redução significativa do tempo de cadastro
- Padronização do processo de avaliação
- Documentação completa e auditável
- Liberação do operador para tarefas analíticas de maior valor

### 7.2 Limitações Conhecidas
- Estimativas podem variar do valor real de mercado
- Produtos muito específicos podem ter menos referências
- Estado de conservação é subjetivo (análise visual)
- Mercado de ativos usados tem alta volatilidade

### 7.3 Recomendações de Uso
1. Utilize o sistema como **primeira análise** para agilizar o processo
2. **Sempre valide** os dados críticos (categoria, estado, valores)
3. Para itens de **alto valor**, considere consulta manual adicional
4. Mantenha **registro** de ajustes para refinamento do sistema
5. Utilize o **score de confiança** como indicador de necessidade de revisão detalhada

---

## 8. ANÁLISE DE CUSTO-BENEFÍCIO

### 8.1 Estrutura de Custos da Automação

O sistema opera com **custo variável** de infraestrutura, cobrando apenas pelo que é efetivamente utilizado.

**Custo por avaliação:** Aproximadamente **R$ 0,06 por item** processado (infraestrutura atual, incluindo ambas as etapas: identificação + precificação).

### 8.2 Cenários de Uso Real

#### Itens Novos (Primeira Avaliação)
Quando um ativo é processado pela primeira vez:
- **Custo:** R$ 0,06
- **Dados gerados:** Completos (identificação + avaliação)
- **Armazenamento:** Ficha técnica permanente

#### Itens Repetidos (Ativos Idênticos)
Para ativos já catalogados (ex: 50 notebooks do mesmo modelo):
- **Custo:** R$ 0,00 (zero)
- **Processo:** Reuso dos dados existentes
- **Necessidade:** Alterar apenas número de patrimônio

#### Falhas de Avaliação
Em casos raros onde a avaliação não é consistente:
- **Custo perdido:** R$ 0,06
- **Frequência observada:** Muito baixa (< 2%)
- **Mitigação:** Itens repetidos são mais comuns que falhas

### 8.3 Projeção para Lote de 1.000 Itens

**Cenário Típico:**
- 700 itens únicos (novos modelos)
- 300 itens repetidos (mesmo modelo, patrimônio diferente)
- 10 falhas estimadas (1,4% - conservador)

**Cálculo de Custo:**
```
Itens únicos:     700 × R$ 0,06 = R$ 42,00
Itens repetidos:  300 × R$ 0,00 = R$  0,00
Falhas:            10 × R$ 0,06 = R$  0,60 (custo perdido)
─────────────────────────────────────────
TOTAL ESTIMADO:                   R$ 42,60
```

**Custo médio por item no lote:** R$ 0,043 (considerando reuso)

### 8.4 Benefícios Além do Custo

#### Redução de Tempo
| Processo | Tempo Manual | Tempo Automatizado | Ganho |
|----------|--------------|-------------------|-------|
| Por item único | 5-10 minutos | 1-2 minutos | 75-80% mais rápido |
| 1.000 itens (cenário misto) | ~100 horas | ~20 horas | 80 horas economizadas |

#### Qualidade do Cadastro

**Processo Manual:**
- Inconsistência entre operadores
- Variação na classificação
- Documentação limitada
- Subjetividade na precificação
- Dificuldade de auditoria

**Processo Automatizado:**
- Padronização total
- Mesma regra para todos os itens
- Documentação completa e rastreável
- Metodologia transparente e reproduzível
- Auditoria facilitada por logs detalhados

#### Escalabilidade
- **Manual:** Precisa contratar mais operadores para aumentar volume
- **Automatizado:** Processa 10 ou 10.000 itens com mesma infraestrutura

### 8.5 Tendência de Custo

À medida que o sistema é utilizado:
- **Biblioteca de ativos cresce** (mais itens repetidos disponíveis)
- **Custo médio por item diminui** progressivamente
- **Retorno sobre investimento aumenta** com o tempo

**Exemplo:** Após catalogar 500 modelos diferentes, novos lotes terão maior proporção de itens repetidos (custo zero), reduzindo custo médio para R$ 0,02-0,03 por item.

---

## 10. POSSÍVEIS MELHORIAS

As seguintes melhorias podem ser implementadas:

- Integração com sistema de cadastro existente
- Biblioteca de valores históricos para comparação
- Relatórios gerenciais de evolução patrimonial
- Alertas para itens que requerem reavaliação
- Dashboard de indicadores de confiança

---

## CONTATO E SUPORTE

Para dúvidas sobre a metodologia ou funcionamento do sistema, entre em contato com a equipe técnica.

---

**Documento gerado em:** Novembro/2025  
**Versão:** 1.0 - Prova de Conceito  
**Status:** Validação Técnica Concluída