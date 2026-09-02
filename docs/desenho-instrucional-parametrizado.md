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
relevantes para ergonomia e segurança. A quantidade de Partes organiza a
produção, mas não é meta pedagógica. Esses controles não integram a herança dos
parâmetros pedagógicos.

## Catálogo corrente

O catálogo aceita quatro parâmetros. Comandos não criam definições livres.

| Parâmetro | Forma e valor-padrão | Escopos | Decisão representada |
| --- | --- | --- | --- |
| `new_analysis_unit_ceiling_per_expository_study_unit` | inteiro; padrão `2` | Curso e Microssequência | teto de unidades de análise apresentadas pela primeira vez numa Unidade expositiva |
| `required_explanation_forms` | conjunto; padrão definição simples, exemplo concreto, mecanismo e contraste | Curso e Microssequência | formas de explicação que precisam ser desenvolvidas quando aplicáveis |
| `minimum_distinct_practice_opportunities_per_evidence_requirement` | inteiro; padrão `2` | Curso e Microssequência | quantidade mínima de oportunidades distintas por requisito de evidência |
| `required_practice_variation_dimensions` | conjunto; padrão caso ou dados | Curso e Microssequência | dimensões que precisam variar entre oportunidades dirigidas ao mesmo requisito |

Uma unidade de análise instrucional identifica a menor novidade que precisa ser
acompanhada separadamente no desenho corrente. Antes de agregar um enunciado, a
Autoria verifica se suas partes podem ser ensinadas, aplicadas ou confundidas de
modo independente. Se puderem, recebem identidades distintas; relações entre
elas ficam explícitas no plano. Conhecimento já ensinado pode ser reutilizado
sem contar como nova introdução.

Essa decisão é semântica e contextual. Quem produz o plano declara a relação,
o GPT pode avaliá-la e a pessoa autora decide ambiguidades reais. O servidor
confere identidades, vínculos, cardinalidade e teto, mas não afirma ter
compreendido o significado de um enunciado em linguagem natural.

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

- cobertura compara o inventário planejado e as introduções correntes;
- progressão depende de ordem curricular e pré-requisitos;
- teoria e prática aparecem nas Unidades e em suas operações;
- extensão editorial usa contagens observáveis, sem equivaler a complexidade;
- densidade textual só se torna métrica quando unidade, idioma, gênero,
  denominador e procedimento estão definidos.

Essa escolha preserva a possibilidade de pesquisa sem atribuir um significado
indevido a números fáceis de calcular.

## Escopo, origem e precedência

Parâmetros pedagógicos podem ser definidos no Curso ou numa Microssequência.
Uma StudyUnit consulta o valor efetivo da Microssequência a que pertence. Sem
definição local, vale o Curso; sem definição no Curso, vale o padrão do produto.

O uso comum permite calibração automática a partir do público, da tarefa e do
contexto mínimo já conhecido. Quando uma pessoa fixa uma condição, essa decisão
explícita prevalece no escopo pertinente. Remover a definição restaura a
herança; não cria uma narrativa histórica de alteração.

### Exemplo de herança

Considere o teto `2` definido no Curso e o teto `1` definido na
Microssequência A. Suas StudyUnits recebem `1`. Ao limpar essa definição, a
Microssequência volta a receber `2` do Curso. Interface, MCP e Actions apresentam
a mesma resolução.

## Itens do plano por Microssequência

Unidades de análise instrucional e requisitos de evidência são atribuídos a
Microssequências concretas. A relação admite vários itens em cada alvo e vários
alvos para o mesmo item. Resultados de aprendizagem pretendidos permanecem no
plano geral e não são copiados para essa atribuição operacional.

Ao salvar a Parte, cada Microssequência registra suas AnalysisUnits e requisitos
de evidência em linguagem humana. A camada confiável resolve identidades,
preserva a ordem e recusa itens repetidos, de outro tipo ou de outro Curso.

## Direção editorial

Direção editorial é um texto curto e explícito no Curso ou na Microssequência.
Ela orienta extensão, estilo, títulos e organização da próxima geração ou
revisão. O valor efetivo segue a mesma herança do escopo: a Microssequência usa
sua direção local ou, na ausência dela, a direção do Curso.

Esse texto não é um catálogo de parâmetros e não recebe uma camada permanente
de interpretações. O GPT aplica a direção na fase editorial pertinente sem
alterar o inventário semântico. Se o conteúdo necessário não couber no formato
preferido, cria mais StudyUnits.

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

O catálogo apresentado pela interface, pelo MCP e por Actions vem da mesma fonte
usada na função remota. Na produção seguinte, o servidor sela a revisão do
catálogo e a política efetiva de cada Microssequência. Componente desconhecido,
bloqueado ou fora de uma lista restrita faz a gravação inteira ser revertida.

## Contexto efetivo e aplicação corrente

Ao preparar a produção de uma Parte, o servidor reúne para cada Microssequência
os parâmetros, a direção editorial, a política de componentes, as AnalysisUnits,
os requisitos de evidência e as Fontes pertinentes.

A gravação conserva com as StudyUnits a aplicação instrucional corrente:

- identidades das Unidades do lote;
- unidades de análise declaradas como introduzidas;
- formas de explicação desenvolvidas ou justificadamente inaplicáveis;
- oportunidades dirigidas aos requisitos de evidência;
- operação mantida e dimensões variadas;
- componentes usados.

Uma introdução marca somente a primeira apresentação de cada AnalysisUnit. O
desenvolvimento pode continuar em duas ou mais StudyUnits sem repetir a
introdução; as formas
requeridas são verificadas sobre o conjunto dessas aplicações. No sentido
inverso, uma Unidade pode desenvolver várias unidades de análise quando as
relações forem intencionais e a quantidade de introduções novas respeitar o
teto efetivo. Assim, o teto mede novidade no desenho, não comprimento de texto
nem quantidade de telas.

Uma Unidade de prática também pode fazer consolidação formativa sem se dirigir
a um requisito de evidência: por exemplo, recuperar uma relação recém-explicada
antes de introduzir a próxima. Nesse caso, ela não se liga a um requisito e não
entra na contagem mínima de oportunidades de evidência. Isso
permite composições como explicação, pequena consolidação, nova explicação,
aplicação e prática de evidência, sem transformar essa ordem em roteiro
universal nem inventar um requisito de evidência.

O contrato verifica forma, unicidade, pertencimento, teto, cobertura declarada
e política de componentes. O PostgreSQL também confere se Units, pais,
Microssequências e componentes correspondem ao conteúdo gravado.

Essa verificação preserva rastreabilidade. Ela não substitui leitura
disciplinar do conteúdo para decidir se uma explicação realmente desenvolve o
mecanismo ou se duas práticas são substantivamente distintas.

## Interface, MCP e Actions

A subvisão **Parâmetros** abre no Curso ou no contexto da Microssequência e
mostra:

- valor efetivo e escopo que o definiu;
- definição local e ação para restaurar a herança;
- direção editorial separada;
- política de componentes com nomes legíveis;
- AnalysisUnits e requisitos atribuídos à Microssequência;
- aplicação corrente nas StudyUnits.

`consultar_configuracao` lê valores efetivos e `ajustar_configuracao` define ou
restaura herança. Interface, MCP e Actions chegam ao mesmo domínio. A pessoa
indica Curso ou Microssequência; a camada confiável resolve os controles de
concorrência e repetição segura.

## Limites operacionais

Valores e textos possuem limites de transporte e persistência. Uma leitura muito
ampla deve usar um escopo mais específico; uma direção editorial extensa deve
ser dividida conforme sua função.

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
