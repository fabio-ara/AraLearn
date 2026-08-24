# Desenho instrucional parametrizado

O AraLearn representa um conjunto pequeno de decisões pedagógicas que a pessoa
autora pode compreender, revisar e aplicar a um Curso. A interface, o MCP e a
produção por Partes usam a mesma resolução. O propósito é tornar uma intenção
examinável, sem converter preferência editorial em resultado científico ou
conformidade técnica em prova de aprendizagem.

## O que constitui um parâmetro

Um parâmetro de desenho instrucional possui:

- identidade e versão;
- definição operacional;
- forma do valor e domínio permitido;
- escopos em que pode ser atribuído;
- valor-padrão do produto;
- limites de interpretação;
- referências que fundamentam a dimensão investigada.

O valor-padrão é uma hipótese de produto. Evidência externa pode justificar a
investigação de uma dimensão, mas não estabelece automaticamente o melhor valor
para toda população, conteúdo ou tarefa.

Limites de caracteres, bytes, elementos de página e tamanho de lote continuam
relevantes para ergonomia e segurança. Faixa de Partes e etapas de execução
organizam a produção. Esses controles não integram a herança dos parâmetros
pedagógicos.

## Catálogo corrente

O catálogo aceita quatro parâmetros. Comandos não criam definições livres.

| Parâmetro | Forma e valor-padrão | Escopos | Decisão representada |
| --- | --- | --- | --- |
| `new_analysis_unit_ceiling_per_expository_study_unit` | inteiro; padrão `2` | Curso, Lição e Microssequência | teto de unidades de análise apresentadas pela primeira vez numa Unidade expositiva |
| `required_explanation_forms` | conjunto; padrão definição simples, exemplo concreto, mecanismo e contraste | Curso, Lição e Microssequência | formas de explicação que precisam ser desenvolvidas quando aplicáveis |
| `minimum_distinct_practice_opportunities_per_evidence_requirement` | inteiro; padrão `2` | Curso, Lição e Microssequência | quantidade mínima de oportunidades distintas por requisito de evidência |
| `required_practice_variation_dimensions` | conjunto; padrão caso ou dados | Curso, Lição e Microssequência | dimensões que precisam variar entre oportunidades dirigidas ao mesmo requisito |

### Formas de explicação

O conjunto fechado admite:

- definição simples;
- exemplo concreto;
- mecanismo;
- contraste;
- condição de aplicação;
- limite ou exceção;
- exemplo resolvido;
- ligação entre representações.

Definição simples é a base do valor-padrão. Exemplo, mecanismo e contraste são
condicionais ao objeto tratado. Quando uma forma exigida não se aplica, a
produção registra a forma e uma justificativa breve. A lista completa não é um
roteiro obrigatório para toda Unidade.

### Oportunidades e variação da prática

Uma oportunidade distinta conserva a operação-alvo e modifica um aspecto
semanticamente relevante. As dimensões disponíveis são:

- caso ou dados;
- contexto;
- característica da tarefa;
- representação externa;
- nível de apoio.

Trocar palavras, ordem visual ou componente pode preservar a mesma tarefa. A
distinção entre oportunidades depende do requisito de evidência e da estrutura
semântica, não de diferença cosmética.

## Dimensões mantidas fora do catálogo

Rótulos como densidade conceitual, dificuldade, carga cognitiva, profundidade,
teoria e prática, cobertura, progressão ou qualidade abrangem fenômenos
distintos e exigem unidades e métodos próprios. O AraLearn não os reduz a
controles globais.

Algumas relações podem ser examinadas por meios mais precisos:

- cobertura compara itens planejados, alvos atribuídos e fatos aplicados;
- progressão depende de ordem curricular e pré-requisitos;
- teoria e prática aparecem nas Unidades e em suas operações;
- extensão editorial usa contagens observáveis, sem equivaler a complexidade;
- densidade textual só se torna métrica quando unidade, idioma, gênero,
  denominador e procedimento estão definidos.

Essa escolha preserva a possibilidade de pesquisa sem atribuir um significado
indevido a números fáceis de calcular.

## Escopo, origem e precedência

Parâmetros pedagógicos podem ser atribuídos ao Curso, à Lição ou à
Microssequência. Um Módulo mostra os valores herdados, mas não recebe uma
atribuição pedagógica própria. Orientações e políticas de componentes podem
usar Curso, Módulo, Lição ou Microssequência.

Cada atribuição registra uma origem:

| Origem | Significado |
| --- | --- |
| `author` | decisão explícita da pessoa autora |
| `research_condition` | decisão identificada para comparação ou pesquisa |
| `automatic` | proposta automática gravada com valor e justificativa |
| `system_default` | valor-padrão calculado, sem linha de atribuição |

A resolução segue uma regra única:

1. entre `author` e `research_condition`, vale a atribuição aplicável mais
   próxima do alvo;
2. na ausência de decisão explícita aplicável, vale a atribuição `automatic`
   mais próxima;
3. sem atribuição, vale `system_default`.

Uma decisão automática numa Lição, portanto, não substitui uma decisão
explícita no Curso. `research_condition` registra proveniência e continua
editável. Remover uma atribuição atua somente no parâmetro e no escopo
selecionados; a leitura seguinte mostra o valor restaurado, a origem e o escopo
de onde veio.

### Exemplo de herança

Considere o teto `2` definido pela autoria no Curso e o teto `1` definido na
Lição A. Uma Microssequência dessa Lição recebe `1`, com origem `author` e
proveniência na Lição A. Ao limpar a atribuição da Lição, a mesma
Microssequência volta a receber `2` do Curso. Interface e MCP apresentam a mesma
resolução.

## Itens do plano por Microssequência

Unidades de análise instrucional e requisitos de evidência são atribuídos a
Microssequências concretas. A relação admite vários itens em cada alvo e vários
alvos para o mesmo item. Resultados de aprendizagem pretendidos permanecem no
plano geral e não são copiados para essa atribuição operacional.

Ao ler `course_design` numa Microssequência, `targetPlanItems` devolve duas
listas ordenadas:

- `instructionalAnalysisUnitIds`;
- `evidenceRequirementIds`.

Nos demais escopos, `targetPlanItems` é `null`. O comando
`set_target_plan_items` substitui as duas listas na mesma transação. Identidades
repetidas, de outro tipo ou de outro Curso são recusadas.

## Orientações autorais

Uma orientação conserva seu texto original numa revisão imutável, com escopo,
origem, canal e revisão do Curso. A orientação efetiva acumula as revisões do
Curso até o alvo, em ordem estrutural. Limpar a orientação local retira somente
aquela contribuição.

Uma interpretação automatizada é outro registro. Ela aponta para a revisão
exata do texto e pode conter:

- resumo;
- diretivas `require`, `avoid` e `prefer`;
- divergências;
- perguntas de esclarecimento.

A interpretação auxilia a execução e a auditoria, mantendo o texto da pessoa
como referência. Uma nova revisão da orientação exige interpretação própria.

## Política de componentes didáticos

A política de componentes é independente dos parâmetros pedagógicos. Seu valor
efetivo fixa:

```text
revisão do catálogo
disponibilidade: todos ou somente uma lista permitida
componentes permitidos
componentes bloqueados
componentes preferidos
```

Cada referência usa a identidade técnica `package@version`. Um conjunto admite
até 32 referências. Bloqueio prevalece sobre permissão; preferência apenas
orienta a escolha entre componentes permitidos e adequados. Disponibilidade,
preferência e uso materializado são fatos diferentes.

O catálogo apresentado pela interface e pelo MCP vem da mesma fonte usada na
função remota. Na produção seguinte, o servidor sela a revisão do catálogo e a
política efetiva de cada Microssequência. Componente desconhecido, bloqueado ou
fora de uma lista restrita faz a etapa inteira ser revertida.

## Contexto efetivo e fatos de aplicação

Ao iniciar a produção de uma Parte, o servidor deriva o contexto de cada
Microssequência. Ele reúne parâmetros, orientações, interpretações, política de
componentes e itens do plano atribuídos. A impressão digital canônica abrange enunciados,
versões e vínculos e protege as etapas posteriores.

Cada etapa registra fatos delimitados sobre o que foi aplicado:

- identidades das Unidades do lote;
- unidades de análise declaradas como introduzidas;
- formas de explicação desenvolvidas ou justificadamente inaplicáveis;
- oportunidades dirigidas aos requisitos de evidência;
- operação mantida e dimensões variadas;
- componentes usados.

O contrato verifica forma, unicidade, pertencimento, teto, cobertura declarada
e política de componentes. O PostgreSQL também confere se as Unidades, os pais,
as Microssequências e os componentes correspondem ao conteúdo gravado.

Essa verificação preserva rastreabilidade. Ela não substitui leitura
disciplinar do conteúdo para decidir se uma explicação realmente desenvolve o
mecanismo ou se duas práticas são substantivamente distintas.

## Interface e MCP

A área **Parâmetros** percorre Curso, Módulo, Lição e Microssequência. Para o
alvo selecionado, mostra:

- valor efetivo, origem e escopo de proveniência;
- atribuição local e ação para restaurar a herança;
- orientação original e interpretação em registros separados;
- política de componentes com nomes legíveis;
- itens do plano atribuídos à Microssequência;
- confronto entre o planejado e os fatos aplicados;
- limites de produção quando forem pertinentes.

`lerCurso` usa a vista `course_design`; `alterarCurso` usa
`update_course_design`. A interface e o MCP chegam ao mesmo domínio. Uma
mudança informa escopo, revisão esperada, origem, motivo e `requestId`. Repetir
o mesmo pedido recupera o mesmo resultado; uma operação sem alteração conserva
a revisão.

## Limites operacionais

Valores individuais ocupam até 4 KiB. Orientação e interpretação ocupam até
8 KiB cada. Uma política contém até 32 referências. A leitura de um escopo
possui teto de 256 KiB. O contexto de materialização ocupa até 64 KiB e os fatos
de aplicação de uma etapa, até 16 KiB.

Esses valores protegem transporte, memória e transação. Eles não possuem
significado pedagógico.

## Fundamentação e limites de interpretação

O referencial Knowledge-Learning-Instruction (KLI) oferece uma base para explicitar
unidades e relações de conhecimento, ao mesmo tempo que situa sua granularidade
na população e na tarefa ([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)). O AraLearn usa **unidade de
análise instrucional** como operacionalização autoral; o termo não afirma a
observação de um componente cognitivo.

Coerência textual interage com conhecimento prévio e inferências exigidas pelo
texto, sem se reduzir ao comprimento ([McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence)). Explicações podem apoiar
elaboração e relações com princípios, mas dependem do conteúdo e do modo de uso
([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations); [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)).

Prática de recuperação, distribuição e intercalação apoiam a investigação de
oportunidades e variações, sem fixar uma dosagem universal ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)). Representações externas
precisam ser escolhidas segundo sua função e a tarefa de coordenação
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)).

Essas fontes sustentam as dimensões examinadas. Os valores-padrão continuam
hipóteses revisáveis. Para o funcionamento conversacional, consulte [Fluxos,
instruções e contratos](fluxos-prompts-e-contratos.md).

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing): Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102.
- [Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations): Michelene T. H. Chi; Miriam Bassok; Matthew W. Lewis; Peter Reimann; Robert Glaser (1989). **Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.** *Cognitive Science*, 13(2), p. 145–182.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence): Danielle S. McNamara; Walter Kintsch (1996). **Learning from Texts: Effects of Prior Knowledge and Text Coherence.** *Discourse Processes*, 22(3), p. 247–288.
- [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved): Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848.
- [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations): Jörg Wittwer; Alexander Renkl (2008). **Why Instructional Explanations Often Do Not Work: A Framework for Understanding the Effectiveness of Instructional Explanations.** *Educational Psychologist*, 43(1), p. 49–64.

<!-- referências locais: fim -->
