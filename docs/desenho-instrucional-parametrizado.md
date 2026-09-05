# Desenho instrucional parametrizado

O AraLearn representa um conjunto pequeno de decisões pedagógicas e editoriais
que a pessoa autora pode compreender, revisar e aplicar a um curso. A interface,
o MCP e a produção em partes usam a mesma resolução. O propósito é tornar uma
intenção examinável, sem converter preferência editorial em resultado
científico ou conformidade técnica em prova de aprendizagem.

## O que constitui um parâmetro

Um parâmetro de desenho instrucional possui:

- identidade e versão;
- definição operacional;
- forma do valor e domínio permitido;
- escopos em que pode ser atribuído;
- estado contextual ou valor deliberadamente definido;
- limites de interpretação;
- referências que fundamentam a dimensão investigada.

No estado `default`, o GPT precisa calibrar automaticamente cada valor para a
microssequência ou unidade, conforme público, conteúdo, função e planejamento.
Esse estado não é um preset fixo, e a produção não considera a configuração
pronta enquanto a calibração contextual não estiver registrada. Evidência
externa pode justificar a investigação de uma dimensão, mas não estabelece
automaticamente o melhor valor para toda população, conteúdo ou tarefa. Uma
definição deliberadamente fixada pelo pesquisador prevalece no escopo pertinente.

Limites de caracteres, bytes, elementos de página e tamanho de lote continuam
relevantes para ergonomia e segurança. A quantidade de partes organiza a
produção, mas não é meta pedagógica. Esses controles não integram a herança dos
parâmetros pedagógicos.

## Catálogo corrente

O catálogo 1.1.0 contém quatro parâmetros pedagógicos e dois alvos editoriais
quantitativos flexíveis. Comandos não criam definições livres.

| Parâmetro | Forma e exemplos de valores | Escopos | Decisão representada |
| --- | --- | --- | --- |
| `new_analysis_unit_ceiling_per_expository_study_unit` | inteiro; por exemplo, `1` ou `2` | curso, lição, microssequência e unidade de estudo | teto de unidades de análise apresentadas pela primeira vez numa unidade expositiva |
| `required_explanation_forms` | conjunto; por exemplo, definição, exemplo, mecanismo ou contraste | curso, lição, microssequência e unidade de estudo | formas de explicação que precisam ser desenvolvidas quando aplicáveis |
| `minimum_distinct_practice_opportunities_per_evidence_requirement` | inteiro; por exemplo, `1` ou `2` | curso, lição, microssequência e unidade de estudo | quantidade mínima de oportunidades distintas por requisito de evidência |
| `required_practice_variation_dimensions` | conjunto; por exemplo, caso, contexto, representação ou apoio | curso, lição, microssequência e unidade de estudo | dimensões que precisam variar entre oportunidades dirigidas ao mesmo requisito |
| `authoring_chat_response_word_target` | inteiro; por exemplo, `80` ou `120` | curso, lição, microssequência e unidade de estudo | alvo flexível de palavras para uma resposta de autoria |
| `study_unit_content_word_target` | inteiro; por exemplo, `140` ou `180` | curso, lição, microssequência e unidade de estudo | alvo flexível de palavras para o conteúdo de uma unidade de estudo |

Os quatro primeiros parâmetros alteram decisões pedagógicas observáveis. Os dois
últimos tornam a extensão editorial comparável sem transformá-la em medida de
qualidade. Um alvo de palavras não é mínimo nem máximo: respostas e unidades
podem ultrapassá-lo quando a decisão ou o conteúdo exigirem. Ele nunca autoriza
ocultar uma decisão educacional, truncar conteúdo necessário, compactar várias
novidades ou atomizar uma explicação para satisfazer a contagem.

O protocolo abaixo define o significado de **unidade de análise** e das contagens.
Ele fecha a operacionalização para a evolução do produto; sua existência não
afirma que todos os eventos e observáveis já estejam representados no runtime.
O catálogo corrente continua sendo a descrição dos controles implementados.

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

Definição, exemplo, mecanismo e contraste podem ser escolhidos conforme o objeto
tratado. Quando uma forma deliberadamente exigida não se aplica, a
produção registra a forma e uma justificativa breve. A lista completa não é um
roteiro obrigatório para toda unidade.

### Oportunidades e variação da prática

Uma oportunidade de prática solicita uma operação do estudante antes de fornecer
sua solução. Para contar como oportunidade **distinta** num mesmo requisito de
evidência, conserva a operação-alvo e modifica um aspecto semanticamente
relevante. As dimensões disponíveis são:

- caso ou dados;
- contexto;
- característica da tarefa;
- representação externa;
- nível de apoio.

Trocar palavras, ordem visual ou componente pode preservar a mesma tarefa. A
distinção entre oportunidades depende do requisito de evidência e da estrutura
semântica, não de diferença cosmética. Nova tentativa do mesmo item é repetição
da oportunidade. Repetição pode ter finalidade pedagógica, mas não satisfaz por
si um mínimo de oportunidades distintas.

## Protocolo de unidade de análise

**Definição operacional 1, de 5 de setembro de 2026.** Unidade de análise é um
recorte de conhecimento necessário para explicar, reconhecer, relacionar ou
executar a operação pretendida para um público e um repertório declarados.
Pode ser conceito, definição, relação, regra, condição ou distinção. Essas
descrições ajudam a justificar o recorte; não formam uma ontologia universal
nem exigem uma taxonomia específica de cada disciplina.

O recorte pertence ao desenho do curso. Não é uma palavra, token, dimensão de
vetor, frase, componente didático ou entidade observada na mente. A unidade de
estudo organiza a apresentação e a experiência: pode desenvolver vários
recortes, e um recorte pode ser desenvolvido ao longo de várias unidades.

### Como recortar e quando parar

1. Fixar finalidade, público, idioma, conhecimentos explicitamente pressupostos
   e contexto anterior. Examinar o trecho com sua tarefa e seu retorno, além
   das fontes necessárias; não codificar apenas título ou frase isolada.
2. Perguntar o que a pessoa precisa distinguir para compreender ou realizar a
   operação. Incluir conhecimento acessório indispensável mesmo fora da ementa.
   Se não foi assumido nem desenvolvido, registrar a lacuna; ausência no plano
   não o transforma em conhecimento prévio.
3. Separar dois recortes quando o desenho precisa ensinar, aplicar ou tratar uma
   confusão relevante de cada um de modo independente. Explicitar a relação
   quando conhecer os termos não basta para compreender o que se afirma entre
   eles. Conservar juntos os elementos cuja decomposição não altera nenhuma
   decisão instrucional nesse contexto.
4. Atribuir identidade local, descrição, motivo da inclusão, dependências e
   localizador do trecho. Associar sinônimos e traduções à mesma identidade
   somente quando preservam o significado exigido pela tarefa.
5. Codificar ocorrência e desenvolvimento separadamente. Guardar a dúvida ou
   alternativa material quando o contexto não permite decidir; não escolher
   o menor inventário para fazer um teto passar.

O recorte termina quando cada conhecimento necessário tem destino explícito
(pressuposto, desenvolvido antes, desenvolvido agora ou lacuna a resolver), e
uma subdivisão adicional não mudaria explicação, dependência, prática ou
tratamento de erro na tarefa escolhida. Isso evita tanto a lista de termos
quanto a decomposição indefinida de todo conhecimento humano. Mudar público,
objetivo, idioma, fonte ou tarefa pode reabrir essa decisão.

### Distinções que a codificação precisa preservar

| Distinção | Regra operacional e exemplo | Contraexemplo ou limite |
| --- | --- | --- |
| conceito e expressão | Uma identidade representa o conteúdo delimitado; rótulos equivalentes no contexto apontam para ela. “Comutador” e “switch” podem nomear o mesmo objeto no trecho de redes. | Duas palavras não provam dois conceitos; a mesma palavra em dois sentidos não prova um só. Se aprender a correspondência lexical for o objetivo, essa correspondência pode constituir outro recorte. |
| conceito e relação | “Quadro” e “endereço MAC” não explicam, por si, a relação usada no encaminhamento. A relação ganha identidade se precisa ser ensinada ou aplicada separadamente. | Não contar cada verbo, seta ou par de termos como relação nova. Uma relação já delimitada não recebe outra identidade por mudar de frase. |
| regra e condição | Uma regra declara o que vale ou como proceder, com suas condições. Separar a condição quando discriminá-la é uma necessidade instrucional própria. | Dividir ambos os lados de uma igualdade pelo mesmo número não ensina que o divisor deve ser diferente de zero apenas por exibir símbolos. Tampouco cada símbolo exige identidade para quem domina a notação. |
| pressuposto | Conhecimento que o planejamento declara necessário e disponível ao público antes do curso; registrar escopo e justificativa. | “É básico” ou “não está na ementa” não bastam. Pressuposição de desenho não comprova conhecimento real do estudante. |
| introdução | Primeiro tratamento didático de um recorte não pressuposto na ordem corrente do curso, com conteúdo que permita reconhecer o significado pretendido. Conta uma vez por identidade. | Nomear um assunto em índice ou usá-lo sem explicação não o introduz suficientemente. Uma introdução não comprova desenvolvimento completo ou aprendizagem. |
| uso | Mobilização de conhecimento pressuposto ou já introduzido para compreender, explicar ou executar outra operação. | Repetir termo num título não demonstra uso; exigir conhecimento sem base registra lacuna, não uso válido artificial. |
| retomada | Reativação intencional de conhecimento pressuposto ou anterior: reexplicar, comparar com o caso anterior ou solicitar recuperação. É uma forma identificada de uso, sem nova introdução. | Ocorrência posterior de palavra não demonstra retomada. Continuar uma explicação na unidade seguinte pode ser desenvolvimento por uso, sem atividade de reativação. |
| menção e desenvolvimento | Menção apenas aponta para um conteúdo. Desenvolvimento explicita significado, relações, exemplos, mecanismo, condições ou outra forma pertinente, com trecho verificável. | Lista de palavras, ligação bibliográfica e selo “explicado” não demonstram desenvolvimento. Mais palavras ou todas as formas selecionadas também não comprovam suficiência. |

Pressuposto é origem no repertório, não evento textual equivalente aos demais.
Introdução, uso e retomada descrevem ocorrências; desenvolvimento qualifica o
tratamento e pode coexistir com qualquer delas. Na mesma unidade, a identidade
introduzida e imediatamente aplicada conta uma introdução; sua aplicação fica
descrita sem duplicá-la no total de identidades mobilizadas. Para contagens
mutuamente exclusivas por identidade/unidade, a precedência é introdução,
retomada, uso. Uma ocorrência pode ser apenas menção e não entrar nesses totais.

Uma retomada de pressuposto não aumenta a novidade declarada. Se a suposição
estava errada, corrigir o repertório e recalcular as introduções; não conservar
a classificação para atender um número fixado. Desenvolvimento satisfatório
depende da tarefa, das formas aplicáveis e de revisão semântica; nenhuma
cardinalidade o certifica.

### Codificação assistida por modelo de linguagem

A IA recebe protocolo, público, inventário corrente, trecho e contexto focal.
Propõe identidades, localizadores, ocorrências, justificativas e lacunas;
não infere conhecimento efetivo do estudante pela fluência do texto. O software
verifica identidades, duplicações, referências, ordem e contagens. A pessoa
autora pode contestar o recorte; ambiguidade que altera escopo, repertório ou
condição fixada deve ser trazida como decisão concreta.

Resultados de LLM em classificação de textos delimitam a possibilidade de
assistência, mas não validam este recorte de conhecimento pedagógico
([Gilardi et al. (2023)](referencias.md#ref-gilardi2023annotation);
[Pangakis et al. (2023)](referencias.md#ref-pangakis2023validation)). Tokenização
em subpalavras é uma técnica de representação computacional
([Sennrich et al. (2016)](referencias.md#ref-sennrich2016subwords)); contar essas
unidades ou dimensões internas não identifica conceitos humanos.

Para investigar estabilidade, fixar conteúdo, contexto, protocolo, modelo,
configuração e instrução efetivamente enviados; comparar identidades alinhadas
pelo significado, localizadores, divisões/fusões e rótulos, não só totais.
Concordância por ocorrência usa como denominador os pares comparáveis de
identidade e localizador; itens sem alinhamento são relatados separadamente.
Repetições do mesmo modelo não são codificadores humanos independentes.
Um estudo de confiabilidade exigirá corpus próprio, codificação humana
independente e regra de alinhamento/adjudicação declaradas. Não foi realizado
esse estudo nesta etapa, nem estimada validade cognitiva.

O [corpus de recortes e contraexemplos](corpus-unidades-de-analise.md) torna
refutáveis as decisões do protocolo. É material sintético de inspeção, não
amostra de estudantes, benchmark de modelos ou padrão-ouro validado.

## Explicação, prática e posição na sequência

Uma unidade **expositiva** desenvolve conteúdo ou mostra solução comentada sem
solicitar produção do estudante antes de revelá-la. Uma unidade de **prática**
solicita recuperar, discriminar, explicar, decidir, aplicar ou produzir algo
antes da solução; pode oferecer instruções e retorno. **Mista** combina
desenvolvimento expositivo e oportunidade efetiva na mesma unidade. As categorias
descrevem função, não componente: um parágrafo pode solicitar prática, e um botão
“continuar” não a cria.

Um retorno que só corrige o alvo mantém a classificação de prática. Se ensina
outro recorte necessário, a unidade é mista e essa introdução entra na análise;
esconder explicação no retorno não reduz a novidade. Registrar a ordem entre
explicação, solicitação e revelação. “Pense nisso”, sem alvo ou produção
identificável, não interrompe automaticamente um trecho expositivo.

Oportunidade é solicitação disponível no material; resposta é acontecimento
do estudante. Duas solicitações independentes numa unidade podem oferecer duas
oportunidades. Etapas inseparáveis da mesma resolução não viram várias por terem
vários campos. Operação, apoio, localizador, ordem e distinção semântica precisam
ser conhecidos antes da contagem. A aplicação pode ser mental e autoverificada;
isso não produz automaticamente evidência observada de desempenho.

Prática de consolidação pode apontar a unidades de análise sem requisito formal
de evidência. Quando se vincula a esse requisito, precisa conservar a operação
exigida e as condições de produção relevantes. Quantidade de oportunidades
oferecidas não equivale a respostas corretas, domínio ou proficiência.

A distribuição é uma decisão ajustável. Uma preferência como “aproximadamente
duas unidades expositivas antes de praticar” orienta a posição das oportunidades,
admite unidade mista e exige leitura da coerência resultante; não é intervalo
cientificamente ótimo. Valor deliberadamente fixado exige respeito ou decisão
explícita sobre o conflito. Mistas interrompem uma sequência sem prática somente
quando há oportunidade real; a exposição anterior e posterior continua visível
pela ordem dos eventos.

## Medidas observáveis e seus denominadores

Estas definições são contratos de cálculo, não promessa de instrumentação
inteiramente implementada. Usar a mesma revisão corrente do conteúdo, inventário,
ordem, público e protocolo. Ausência de anotação é dado ausente, não zero. Em
qualquer agregado, informar quantos itens foram analisados e quantos faltam.
Denominador vazio produz “não se aplica”, nunca zero por divisão implícita.
Classificação incompleta permite somente resultado parcial identificado como tal.

| Medida | Numerador, denominador e escopo | Limite de interpretação |
| --- | --- | --- |
| introduções por unidade | Identidades introduzidas / uma unidade de estudo, inclusive mista ou prática com novidade no retorno. | Novidade declarada, não carga cognitiva. O teto corrente de expositivas não dispensa examinar os outros casos. |
| mobilização e retomadas | Identidades distintas mobilizadas ou retomadas / uma unidade; cada identidade conta no máximo uma vez em cada conjunto. Retomadas são subconjunto da mobilização, não soma adicional. | Não estima elementos simultâneos na memória. Mostrar também as relações que precisam ser coordenadas. |
| cobertura do desenho | Identidades com introdução localizada / identidades planejadas para desenvolvimento; pressupostos ficam em conjunto separado. | Nome citado não cobre desenvolvimento. O inventário pode estar incompleto; relatar lacunas necessárias fora dele. |
| ocorrência de prática | Unidades de prática ou mistas / unidades didáticas classificadas da sequência. Mostrar as três categorias separadamente. | Uma mista conta uma vez no denominador; proporção de unidades não equivale a tempo ou extensão de prática. |
| intervalos sem oportunidade | Número de unidades expositivas completas entre oportunidades consecutivas, mais os trechos inicial e final; cada intervalo é delimitado por esse par de posições ou borda. | Duas oportunidades na mesma unidade têm intervalo zero nessa escala, mas podem ter exposição entre si. Informar posições internas; não inferir espaçamento temporal. |
| oportunidades por alvo | Solicitações distintas dirigidas a uma unidade de análise ou requisito / um alvo identificado; relatar também repetições e alvos sem oportunidade. | Uma solicitação com dois alvos conta uma vez no total e uma vez em cada alvo; não somar colunas por alvo como total global. |
| extensão textual | Palavras segundo algoritmo e idioma declarados, ou caracteres segundo unidade Unicode declarada / conteúdo textual delimitado no estado observado. | Não comparar idiomas como se palavra fosse unidade universal. Notação, imagens e retorno oculto exigem descrição própria. |
| extensão renderizada | Altura do conteúdo inspecionável em pixels CSS / altura útil do viewport de leitura em pixels CSS, no mesmo estado. | Razão contínua de telas equivalentes, não número de gestos, tempo de leitura ou dificuldade. Transbordamento horizontal é observado à parte. |

Para extensão renderizada, registrar viewport e área útil após barras fixas,
largura, tipografia carregada, tamanho de fonte, entrelinha, zoom, escala do
dispositivo, navegador, modo de visualização, idioma, tema e estado da prática
(inicial, resposta preenchida, retorno aberto, detalhes expandidos). Medir a área
didática, com instruções, alternativas e retorno visível; excluir menu e
ferramentas sobrepostos. Declarar inclusões de cabeçalho e margens. Área de
rolagem interna exige medida e inspeção próprias: a altura externa pode ocultá-la.

Fonte, fórmula, imagem ou retorno ainda não carregados invalidam a comparação.
Uma observação inicial não representa todos os estados. Sem navegador e estado
conhecidos, registrar medição ausente; não preencher pixels por estimativa.
Coeficientes exploratórios por componente não substituem a observação nem
fundamentam limite de geração.

Se o desenvolvimento ultrapassar o alvo editorial, redistribuir em unidades
coerentes e reconsiderar a prática entre elas. Preservar relações, exemplos,
condições e ligação com a sequência. Limite de transporte exige continuação ou
erro recuperável; nenhuma medida autoriza resumir ou truncar conhecimento.
Comparações entre cópias que variam apenas a distribuição conservam inventário e
repertório. Fusão ou divisão de recortes muda a condição e deve ser declarada.

## Dimensões mantidas fora do catálogo

Planejamento curricular global antes dos lotes, aprovação apenas do que estava
inspecionável e fronteira pública em linguagem humana são invariantes do fluxo,
não parâmetros de uma condição. Distribuição editorial, explicações e prática
podem variar pela configuração existente. Uma heurística pedagógica não se torna
automaticamente entidade ou controle novo.

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

Os parâmetros pedagógicos e os alvos editoriais podem ser definidos no curso,
na lição, na microssequência ou na unidade de estudo. Uma unidade recebe o valor
efetivo de seu contexto. Sem definição deliberada, o GPT precisa calibrar o
desenho conforme público, tarefa, conteúdo e função.
Quando uma pessoa fixa uma condição, essa decisão explícita prevalece no escopo
pertinente. Remover a definição restaura o estado `default`; não cria uma
narrativa histórica de alteração.

### Exemplo de herança

Considere o teto `2` definido no curso e o teto `1` definido na
microssequência A. Suas unidades recebem `1`. Ao limpar essa definição, a
microssequência volta a herdar `2` do curso. Se também não houver definição no
curso, volta ao estado contextual. Interface, MCP e Actions apresentam a mesma
precedência.

## Repertório por microssequência

Unidades de análise instrucional e requisitos de evidência podem ser associados
a microssequências concretas durante a preparação e a materialização. A relação
admite vários itens em cada alvo e vários alvos para a mesma ideia. Resultados de
aprendizagem pretendidos permanecem no plano geral.

Salvar uma parte apenas agrupa microssequências já previstas no mapa curricular.
O refinamento interno do repertório não altera silenciosamente cobertura, ordem
ou profundidade aprovadas. A camada confiável resolve identidades e evita
duplicação; o GPT distingue introdução, uso de conhecimento estabelecido e
retomada.

## Direção editorial

Direção editorial é um texto curto e explícito no curso ou num escopo didático.
Ela orienta extensão, estilo, títulos e organização da próxima geração ou
revisão. O valor efetivo segue a hierarquia de escopos e usa a direção aplicável
mais próxima.

Esse texto não é um catálogo de parâmetros e não recebe uma camada permanente
de interpretações. Ele complementa os dois alvos quantitativos com orientação
qualitativa. O GPT aplica a direção na fase editorial pertinente sem alterar o
repertório semântico. Se o conteúdo necessário não couber no formato preferido
ou em torno do alvo de palavras, cria mais unidades de estudo coerentes.

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
até 64 referências. Bloqueio prevalece sobre permissão; preferência apenas
orienta a escolha entre componentes permitidos e adequados. Disponibilidade,
preferência e uso materializado são fatos diferentes.

O catálogo apresentado pela interface, pelo MCP e por Actions vem da mesma fonte
usada na função remota. Na produção seguinte, o servidor sela a revisão do
catálogo e a política efetiva de cada microssequência. Componente desconhecido,
bloqueado ou fora de uma lista restrita faz a gravação inteira ser revertida.

## Contexto efetivo e aplicação corrente

Ao preparar a produção de uma parte, o servidor reúne para cada microssequência
os parâmetros pedagógicos, os alvos editoriais, a direção editorial, a política
de componentes, o repertório, os requisitos de evidência e as fontes pertinentes.

A gravação conserva com as unidades de estudo a aplicação instrucional corrente:

- identidades das unidades do lote;
- unidades de análise declaradas como introduzidas;
- unidades de análise estabelecidas que foram utilizadas;
- formas de explicação desenvolvidas ou justificadamente inaplicáveis;
- oportunidades dirigidas aos requisitos de evidência;
- operação mantida e dimensões variadas;
- componentes usados;
- alvos editoriais aplicados e extensão observada.

Uma introdução marca somente a primeira apresentação de cada unidade de análise. O
desenvolvimento pode continuar em duas ou mais unidades de estudo sem repetir a
introdução; as formas
requeridas são verificadas sobre o conjunto dessas aplicações. No sentido
inverso, uma unidade pode desenvolver várias unidades de análise quando as
relações forem intencionais e a quantidade de introduções novas respeitar o
teto efetivo. Assim, o teto mede novidade no desenho, não comprimento de texto
nem quantidade de telas.

Uma unidade de prática também pode fazer consolidação formativa sem se dirigir
a um requisito de evidência: por exemplo, recuperar uma relação recém-explicada
antes de introduzir a próxima. Nesse caso, ela não se liga a um requisito e não
entra na contagem mínima de oportunidades de evidência. Isso
permite composições como explicação, pequena consolidação, nova explicação,
aplicação e prática de evidência, sem transformar essa ordem em roteiro
universal nem inventar um requisito de evidência.

O contrato verifica forma, unicidade, pertencimento, teto, cobertura declarada
e política de componentes. O PostgreSQL também confere se unidades, pais,
microssequências e componentes correspondem ao conteúdo gravado.

Essa verificação preserva rastreabilidade. Ela não substitui leitura
disciplinar do conteúdo para decidir se uma explicação realmente desenvolve o
mecanismo ou se duas práticas são substantivamente distintas.

## Interface, MCP e Actions

A subvisão **Parâmetros** abre no curso, no módulo, na lição, na microssequência
ou na unidade de estudo e mostra:

- valor efetivo e escopo que o definiu;
- definição local e ação para restaurar a herança;
- quatro parâmetros pedagógicos e dois alvos editoriais flexíveis;
- direção editorial separada;
- política de componentes com nomes legíveis;
- unidades de análise e requisitos atribuídos à microssequência;
- aplicação corrente nas unidades de estudo.

`consultar_configuracao` lê valores efetivos e `ajustar_configuracao` define ou
restaura herança. Interface, MCP e Actions chegam ao mesmo domínio. A pessoa
indica curso ou microssequência; a camada confiável resolve os controles de
concorrência e repetição segura.

## Limites operacionais

Valores e textos possuem limites de transporte e persistência. Uma leitura muito
ampla deve usar um escopo mais específico; uma direção editorial extensa deve
ser dividida conforme sua função.

Esses valores protegem transporte, memória e transação. Eles não possuem
significado pedagógico.

## Fundamentação e limites de interpretação

As ligações seguintes registram o argumento usado para esta definição operacional.
São inferências de desenho do AraLearn, não medidas prescritas pelas fontes.
A consulta focal em 5 de setembro de 2026 foi suficiente para delimitar o
protocolo e suas incertezas; não constituiu revisão sistemática da literatura.

| Fonte e localização consultada | Argumento delimitado | Decisão no AraLearn | Medida e limite |
| --- | --- | --- | --- |
| [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli), [KLI, §§ 2.1–2.2](https://doi.org/10.1111/j.1551-6709.2012.01245.x) | O quadro separa eventos observáveis e mudanças de conhecimento não observáveis; análises de conhecimento orientam escolhas instrucionais. | Descrever o conhecimento-alvo e suas relações segundo tarefa e público; não identificar anotação editorial com componente cognitivo. | Introduções por unidade e cobertura do inventário, sem inferência de aprendizagem. |
| [Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity), [“Element Interactivity” e “Expertise, Strategy Use, and Element Interactivity”](https://link.springer.com/article/10.1007/s10648-023-09782-w) | Interatividade depende do que precisa ser processado conjuntamente e do conhecimento prévio; a mesma informação pode ser agrupada de modos diferentes conforme a experiência. | Registrar repertório e relações de coordenação; contagem editorial permanece distinta da estimativa de interatividade do artigo. | Identidades mobilizadas por unidade, sem conversão em carga; não transferir a contagem de símbolos de um exemplo do artigo como algoritmo geral. |
| [McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence), [resumo dos dois experimentos](https://www.tandfonline.com/doi/abs/10.1080/01638539609544975) | Coerência, inferência e conhecimento prévio interagem; resultados diferem conforme tarefa, e parte dos resultados do primeiro experimento não se repetiu no segundo. | Localizar as relações necessárias e o apoio ao público, sem regra “mais explícito sempre é melhor”. | Lacunas e desenvolvimento localizados, não escore de coerência por palavras. A consulta deste estudo foi ao resumo, não reanálise de seus dados. |
| [Saussure (1916)](referencias.md#ref-saussure1916cours), [segunda parte, cap. IV, §§ 1–2](https://fr.wikisource.org/wiki/Cours_de_linguistique_g%C3%A9n%C3%A9rale/Deuxi%C3%A8me_partie) | Valor linguístico envolve relações no sistema; equivalências entre palavras de línguas diferentes não são necessariamente exatas. | Tratar rótulo, sentido e identidade separadamente; testar equivalência no contexto antes de fundir tradução ou sinônimo. | Identidades alinhadas no corpus, sem contar palavras como conceitos. A análise linguística não fornece unidade cognitiva nem valida o inventário do curso. |
| [Greimas (1966)](referencias.md#ref-greimas1966recit), [§ I, p. 28](https://www.persee.fr/doc/comm_0588-8018_1966_num_8_1_1114) | No problema do relato mítico, sequências articuladas e informação extratextual são necessárias à interpretação; o texto e a recepção são planos distintos. | Examinar contexto e continuidade de sentidos além da frase; não aplicar inventário de semas ou categorias narrativas como taxonomia pedagógica universal. | Localizadores e relações entre trechos; não escore de isotopia ou medida da mente. Consulta focal ao artigo, sem alegar leitura integral de *Sémantique structurale*. |
| [Miller (1984)](referencias.md#ref-miller1984genre), [“Recurrent Rhetorical Situations” e “Implications”, pp. 155–165](https://www.researchgate.net/profile/Carolyn-Miller-15/publication/238749675_Genre_as_Social_Action/links/56bc9c9c08ae6cc737c5c405/Genre-as-Social-Action.pdf) | Gênero envolve ação retórica em situações sociais recorrentes; semelhança formal não basta. | Tratar unidade de estudo como formato de apresentação e elemento da sequência; analisar os gêneros efetivamente usados por finalidade e interlocução. | Categorias funcionais e posições das oportunidades, sem inferir gênero pela geometria. |
| [Gilardi et al. (2023)](referencias.md#ref-gilardi2023annotation), [artigo, tarefas e resultados](https://pmc.ncbi.nlm.nih.gov/articles/PMC10372638/); [Pangakis et al. (2023)](referencias.md#ref-pangakis2023validation), [resumo do preprint](https://arxiv.org/abs/2306.00176) | LLM pode anotar textos; desempenho é dependente da tarefa, dos dados e da instrução. O segundo trabalho requer validação específica. | Usar codificação assistida e revisão de ambiguidades, sem presumir validade a partir de concordância do modelo consigo mesmo. | Comparação de recortes, ocorrências e divergências; confiabilidade humana e validade ainda não medidas. |
| [Sennrich et al. (2016)](referencias.md#ref-sennrich2016subwords), [resumo e método de subpalavras](https://aclanthology.org/P16-1162/) | Segmentação computacional permite representar palavras raras ou desconhecidas com unidades menores. | Tokens são observáveis do instrumento, não unidades semânticas aprovadas do curso. | Contagem de tokens somente para transporte/custo computacional, nunca denominador cognitivo. |

No contrato atual, a unidade de estudo é um **formato de apresentação e uma parte
de sequência didática** que pode abrigar explicação, exemplo resolvido, problema,
comentário ou combinação. “Card” designa o suporte visual. Uma futura alegação
de gênero próprio exigiria estudar finalidades compartilhadas, interlocução,
convenções e usos recorrentes por uma comunidade. Não há essa evidência aqui.
Concisão da conversa de autoria e profundidade do material de estudo respondem
a situações comunicativas diferentes e são decisões independentes.

Explicações podem apoiar elaboração e relações com princípios, mas dependem
do conteúdo e do modo de uso
([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations); [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)).

Prática de recuperação, distribuição e intercalação apoiam a investigação de
oportunidades e variações, sem fixar uma dosagem universal ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)). Representações externas
precisam ser escolhidas segundo sua função e a tarefa de coordenação
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)).

Essas fontes sustentam as dimensões examinadas. Calibrações contextuais e valores
fixados continuam hipóteses revisáveis. Para o funcionamento conversacional, consulte [Fluxos,
instruções e contratos](fluxos-prompts-e-contratos.md).

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing): Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102.
- [Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity): Ouhao Chen; Fred Paas; John Sweller (2023). **A Cognitive Load Theory Approach to Defining and Measuring Task Complexity Through Element Interactivity.** *Educational Psychology Review*, 35, p. 63.
- [Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations): Michelene T. H. Chi; Miriam Bassok; Matthew W. Lewis; Peter Reimann; Robert Glaser (1989). **Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.** *Cognitive Science*, 13(2), p. 145–182.
- [Gilardi et al. (2023)](referencias.md#ref-gilardi2023annotation): Fabrizio Gilardi; Meysam Alizadeh; Maël Kubli (2023). **ChatGPT Outperforms Crowd Workers for Text-Annotation Tasks.** *Proceedings of the National Academy of Sciences*, 120(30), p. e2305016120.
- [Greimas (1966)](referencias.md#ref-greimas1966recit): Algirdas Julien Greimas (1966). **Éléments pour une théorie de l'interprétation du récit mythique.** *Communications*, 8(1), p. 28–59.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence): Danielle S. McNamara; Walter Kintsch (1996). **Learning from Texts: Effects of Prior Knowledge and Text Coherence.** *Discourse Processes*, 22(3), p. 247–288.
- [Miller (1984)](referencias.md#ref-miller1984genre): Carolyn R. Miller (1984). **Genre as Social Action.** *Quarterly Journal of Speech*, 70(2), p. 151–167.
- [Pangakis et al. (2023)](referencias.md#ref-pangakis2023validation): Nicholas Pangakis; Samuel Wolken; Neil Fasching (2023). **Automated Annotation with Generative AI Requires Validation.** arXiv.
- [Saussure (1916)](referencias.md#ref-saussure1916cours): Ferdinand de Saussure (1916). **Cours de linguistique générale.** Lausanne and Paris, Payot.
- [Sennrich et al. (2016)](referencias.md#ref-sennrich2016subwords): Rico Sennrich; Barry Haddow; Alexandra Birch (2016). **Neural Machine Translation of Rare Words with Subword Units.** In: *Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)*, Association for Computational Linguistics, p. 1715–1725.
- [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved): Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848.
- [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations): Jörg Wittwer; Alexander Renkl (2008). **Why Instructional Explanations Often Do Not Work: A Framework for Understanding the Effectiveness of Instructional Explanations.** *Educational Psychologist*, 43(1), p. 49–64.

<!-- referências locais: fim -->
