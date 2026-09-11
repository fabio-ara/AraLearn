# Revisão de literatura orientada ao desenho do AraLearn

## Finalidade, pergunta e limites

Esta revisão reúne conhecimentos que ajudam a justificar, questionar e avaliar
as decisões educacionais e sociotécnicas do AraLearn. Sua pergunta orientadora
é:

> Que conhecimentos publicados são relevantes para projetar e avaliar uma
> aplicação de autoria assistida por IA e revisão humana, com explicações,
> conteúdo vinculado às fontes, representações e prática, para estudo autodidata
> no celular e continuidade sem conexão?

O texto é uma **revisão narrativa orientada ao desenho do artefato**: as fontes
foram reunidas em torno dos problemas que o AraLearn procura enfrentar e dos
mecanismos que poderiam explicá-los. Esse método permite relacionar campos
diferentes, mas não oferece a cobertura reprodutível de uma revisão sistemática
ou de escopo. Para esse tipo de síntese, seria necessário registrar a busca e o
percurso completo de seleção e avaliação das fontes; JBI e PRISMA-ScR oferecem
orientações específicas
([Peters et al. (2024)](referencias.md#ref-peters2024scoping); [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr)).

As fontes descrevem teorias, orientações e resultados produzidos fora do
AraLearn. Cada seção explicita como esse conhecimento fundamenta uma decisão do
produto e qual hipótese surge dessa relação. Resultados sobre aprendizagem ou
uso pertencem aos estudos citados; uma avaliação do AraLearn precisa produzi-los
em condições próprias. Os [estados usados para classificar essas
afirmações](fundamentos-pesquisa-e-governanca.md#estados-epistêmicos) estão
definidos nos fundamentos de pesquisa e governança.

O [procedimento de busca e atualização](#procedimento-de-composição-do-corpus)
registra como as fontes foram reunidas e quais consultas podem ser reconstruídas.
As referências completas estão em [Referências](referencias.md). A
[Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
relaciona compromissos do produto a objetos observáveis, verificações técnicas
e avaliações educacionais necessárias.

Neste texto, **local-first** designa uma arquitetura em que a cópia local
sustenta a operação corrente e a sincronização com o servidor ocorre sem
bloquear a interação.

## Como avaliar o alcance de uma fonte

A força de uma fonte depende da pergunta e do alcance de seu método:

| Tipo de fonte | Contribuição possível | Limite principal |
| --- | --- | --- |
| revisão sistemática ou meta-análise | sintetizar consistência, heterogeneidade e moderadores | depende da qualidade e comparabilidade dos estudos incluídos |
| estudo experimental ou quase experimental | examinar relações causais sob condições delimitadas | generalização para outro público, conteúdo ou dispositivo não é automática |
| estudo qualitativo ou de campo | explicar processos, interpretações, contexto e casos negativos | não estima efeito populacional sem desenho complementar |
| teoria ou quadro conceitual | definir construtos e mecanismos plausíveis | coerência conceitual não constitui confirmação empírica |
| norma ou orientação institucional | estabelecer critérios de acessibilidade, ética ou governança | conformidade não demonstra aprendizagem |
| documentação e testes do artefato | demonstrar estrutura ou comportamento implementado | correção técnica não valida construtos pedagógicos |

O tipo da fonte é apenas o início da avaliação. Seu alcance depende também de
quem participou, do que as pessoas fizeram, das condições comparadas e do
resultado observado. Uma meta-análise distante da situação investigada pode
oferecer fundamento mais indireto que um estudo de campo bem alinhado à
pergunta local.

## 1. Aprendizagem móvel, interrupção e retomada

### Conceitos necessários

**Aprendizagem móvel** abrange atividades mediadas por dispositivos que podem
ocorrer em ambientes, tempos e condições variáveis. O conceito dirige a atenção
para o que acontece quando a pessoa estuda em trânsito, alterna tarefas ou
precisa retomar depois de perder a conexão; o tamanho do conteúdo é apenas uma
das decisões envolvidas.

**Retomada** é o restabelecimento do objetivo e do estado necessários para
continuar uma atividade suspensa. Ela pode ser observada quando a pessoa
reencontra o ponto, explica o que fazia e consegue prosseguir; a reabertura do
aplicativo descreve somente o primeiro passo.

### Evidência externa

Uma revisão sistemática encontrou diversidade de quadros para interfaces em
aplicações de aprendizagem móvel, o que desaconselha a ideia de um layout
universalmente adequado ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)). Uma revisão sobre aprendizagem
autodirigida de línguas com tecnologia móvel identificou estratégias
cognitivas, metacognitivas, sociais e afetivas, mas seu domínio limita a
generalização ([Lai et al. (2022)](referencias.md#ref-lai2022mobile)).

Estudos experimentais sobre interrupção mostram custos para retomar objetivos
suspensos e diferenças relacionadas à duração, à demanda da interrupção e à
capacidade de memória de trabalho ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Esses resultados não examinam o AraLearn nem
demonstram efeito educacional de armazenamento local.

### Decisão e hipótese para o AraLearn

No AraLearn, conservar conteúdo e ponto de estudo no dispositivo responde ao
problema de continuar depois de uma interrupção. Para investigar essa escolha,
é necessário distinguir disponibilidade técnica, localização do ponto e
reconstrução do raciocínio. Uma pessoa pode conseguir reabrir a unidade e ainda
precisar de ajuda para compreender o que fazia. A [proposição sobre retomada](quadro-teorico.md#p1-retomada-local-após-interrupção)
relaciona essa hipótese às alternativas e à avaliação; o [guia de uso](uso-do-app.md)
explica as condições atuais de conexão para estudo e autoria.

## 2. Autorregulação, autodireção e agência

### Conceitos necessários

Estudar sozinho descreve uma condição; **aprendizagem autorregulada** descreve o
processo pelo qual a pessoa planeja, executa, acompanha e revê a própria
aprendizagem
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). **Aprendizagem
autodirigida** acrescenta iniciativa na definição de objetivos, recursos e
processos ([Knowles (1975)](referencias.md#ref-knowles1975selfdirected)). **Agência** envolve capacidade de agir de
modo intencional e produzir efeitos, sempre em condições sociais e materiais
([Bandura (2001)](referencias.md#ref-bandura2001agency)).

**Metacognição**, no uso adotado neste corpus, é o conhecimento que a pessoa
tem sobre o próprio processo de pensar e aprender, acompanhado da capacidade
de monitorá-lo e regulá-lo. Julgar que compreendeu, perceber incerteza, escolher
outra estratégia e conferir se ela funcionou são manifestações possíveis; uma
declaração de confiança ou um clique isolado não mede esse processo. A
metacognição participa dos ciclos de autorregulação, mas não é sinônimo de toda
autorregulação, que também envolve motivação, comportamento e condições do
ambiente ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated);
[Panadero (2017)](referencias.md#ref-panadero2017selfregulated)).

Esses conceitos deslocam a análise da quantidade de opções para a qualidade das
decisões que a pessoa consegue tomar. Uma meta-análise sobre controle do
aprendiz em tecnologia educacional encontrou efeitos heterogêneos
([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)). A teoria da autodeterminação também distingue
escolha significativa e apoio à autonomia de abandono ou ausência de estrutura
([Ryan e Deci (2020)](referencias.md#ref-ryan2020motivation)).

### Decisão e hipótese para o AraLearn

A organização de um percurso oferece uma referência para decidir o próximo
passo; consultar ajuda e revisar uma estratégia exigem ação do estudante.
A relação entre estrutura e escolha interessa ao AraLearn justamente porque
oferecer opções não assegura que a pessoa saiba usá-las. Metas, justificativas,
rejeições e mudanças de estratégia podem ser examinadas em situações de uso,
conforme o [guia de investigação](guia-pesquisador.md#formular-caminhos-de-investigação).

### IA e autorregulação: o processo importa

[Ferreira e Pedrosa (2024)](referencias.md#ref-ferreira2024iaautorregulacao)
analisam 14 artigos selecionados entre 67 registros de três bases de
publicações acadêmicas: Scopus, Web of Science e ERIC. A revisão relaciona
tecnologias e usos pedagógicos às fases de
planejamento, execução e reflexão de Zimmerman. Os autores extraem contexto,
tecnologia e uso, analisam o conteúdo e validam as categorias entre si. O
corpus reúne estudos empíricos e não empíricos; não fornece um efeito agregado
transferível ao AraLearn. Os autores apontam a necessidade de investigar como
o design instrucional integra a IA à autorregulação e de ampliar os termos de
busca. Também discutem proteção de dados e formação crítica diante de
informação falaciosa.

Para o AraLearn, esse recorte sugere uma pergunta de investigação: ao retomar
uma trilha e consultar ajuda, como a pessoa escolhe o que estudar, reconhece
dificuldades e ajusta sua estratégia? A sugestão é deste projeto. Precisa de
observação e relatos situados; contagens do conteúdo ou marcações de conclusão
não revelam essas fases. Uma revisão futura deve procurar também pesquisas
pelas estratégias específicas, como busca de ajuda e reflexão, sem depender
apenas do termo amplo autorregulação.

## 3. Carga cognitiva, segmentação e profundidade

### Conceitos necessários

A memória de trabalho possui capacidade limitada, e parte da dificuldade de
uma tarefa pode ser criada pelo modo como informação e ações são apresentadas
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). **Carga cognitiva
extrínseca** designa demanda dispensável à aprendizagem do conteúdo-alvo, como
procurar dados espalhados, interpretar rótulos ambíguos ou alternar entre fontes
que precisam ser integradas.

Segmentar uma explicação significa distribuir suas etapas de modo que a pessoa
possa acompanhá-las sem perder as relações necessárias. Uma meta-análise
encontrou efeitos variados conforme as condições da segmentação
([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)). A literatura de
microaprendizagem (*microlearning*) também reúne intervenções bastante
diferentes
([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)). Essas evidências orientam
o exame do conteúdo e da tarefa, em vez de uma regra universal como “um
conceito por unidade” ou “quanto menor, melhor”.

### Texto, discurso e extensão editorial

Modelos de compreensão textual distinguem relações locais e organização global;
teorias e métodos de segmentação delimitam unidades por critérios como relação
retórica, intenção discursiva ou mudança de subtópico
([Kintsch e van Dijk (1978)](referencias.md#ref-kintsch1978model);
[Mann e Thompson (1988)](referencias.md#ref-mann1988rst);
[Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation);
[Hearst (1997)](referencias.md#ref-hearst1997texttiling)). Uma revisão recente
da linguística do texto também mostra que “unidade discursiva” não designa um
átomo universal independente de teoria e procedimento
([Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades)).

Parágrafo, número de palavras e tempo estimado de leitura são exemplos de
**medidas editoriais observáveis**. Junto de outras medidas de extensão e
apresentação, podem apoiar renderização e ergonomia. Identificar unidade de
sentido, densidade conceitual, dificuldade ou completude exige analisar também
o conteúdo e suas relações. Ferramentas de complexidade
textual integram propriedades lexicais, sintáticas, discursivas e de coesão;
mesmo assim, seus valores dependem do corpus, da população, da tarefa e da
interpretação pretendida
([Graesser et al. (2004)](referencias.md#ref-graesser2004cohmetrix);
[Leal et al. (2024)](referencias.md#ref-leal2024nilcmetrix);
[Gazzola et al. (2022)](referencias.md#ref-gazzola2022textcomplexity)).

Para investigar **densidade conceitual**, o AraLearn precisa declarar o que
conta como conceito, relação e ocorrência, conservar as anotações semânticas
brutas e versionar o denominador e o cálculo. Usar caracteres ou palavras como
substitutos silenciosos produziria uma medida fácil de calcular, mas incapaz de
sustentar a interpretação pedagógica desejada.

### Decisão e hipótese para o AraLearn

Para o desenho do AraLearn, a questão é distribuir o desenvolvimento de uma
ideia preservando suas relações. Uma explicação pode introduzir um problema,
desenvolver o raciocínio e solicitar aplicação ao longo de várias etapas.
Cortar cada frase em outra tela pode aumentar a necessidade de reconstruir
relações; reunir todas de uma vez também pode dificultar o acompanhamento.
O [modelo didático](modelo-didatico.md) explica a organização adotada, e a
[proposição de progressão](quadro-teorico.md#p2-progressão-suficiente-sem-condensação)
formula o que precisa ser avaliado com autores e estudantes.

## 4. Unidades, evidência e parâmetros de desenho

### Do conhecimento planejado à unidade apresentada

Planejar uma atividade exige perguntar que conhecimento a pessoa precisará
mobilizar. O quadro KLI (*Knowledge–Learning–Instruction*, conhecimento,
aprendizagem e instrução) chama de **componentes de conhecimento** as unidades
inferidas a partir do desempenho em tarefas. Esses componentes ajudam a explicar
a aprendizagem, mas não são objetos que o sistema observe diretamente. O recorte
adequado muda conforme o público e o desempenho investigado
([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)).

Para planejar conteúdo de modo rastreável, o AraLearn adota uma
[**unidade de análise
instrucional**](desenho-instrucional-parametrizado.md). Trata-se de um recorte
editorial revisável, ligado a uma fonte e a um objetivo, que acompanha uma ideia
ou relação ao longo da explicação e da prática. O conhecimento prévio é uma
suposição declarada para aquele público, e não um diagnóstico individual ou uma
estimativa de domínio.

O [modelo didático](modelo-didatico.md) chama de **unidade de estudo** cada etapa
salva e identificável do percurso apresentado ao estudante. Ela pode ser
expositiva, propor prática ou reunir uma representação com uma solicitação de
resposta e seu retorno. É uma convenção que organiza o conteúdo no produto. Sua
aparência em cartão não determina uma única função discursiva ou atividade.

**Flashcard**, ou cartão de memorização, designa especificamente o item
organizado em torno de uma pista e de uma resposta que deve ser recuperada. Uma
revisão de escopo sobre flashcards eletrônicos nas profissões da saúde oferece
evidência para esse recurso naquele domínio; explicações, diagramas e simulações
realizam outras funções
([Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards)).

Uma **microssequência didática** ordena as unidades de estudo em torno de um
objetivo delimitado. A **parte de autoria**, por sua vez, reúne uma porção
manejável do trabalho de planejamento, produção e revisão. A primeira organiza
o ensino; a segunda organiza o processo de criação e pode abranger mais de uma
microssequência. Ambas são convenções do AraLearn, explicadas no [modelo
didático](modelo-didatico.md) e nos [parâmetros de
autoria](parametros-de-autoria.md).

Estudos de sistemas recentes oferecem evidência situada para manter o plano
intermediário visível e editável, sem transferir a decisão pedagógica inteira
ao modelo. O VIVID organizou geração, avaliação e modificação de diálogos
educacionais por instrutores; sua avaliação com doze participantes tratou uma
tarefa e um formato específicos, não a produção de cursos em geral
([Choi et al. (2024)](referencias.md#ref-choi2024vivid)). O Shiksha Copilot
combinou geração, curadoria humana e adaptação docente de planos de aula; o
estudo misto envolveu 1.043 docentes e 23 curadores num contexto multilíngue e
de recursos limitados, no qual profissionais continuaram avaliando e
contextualizando o material produzido
([Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha)). Esses
resultados tornam pertinente investigar planejamento revisável e intervenção
humana no AraLearn. Como cada estudo avaliou seu próprio sistema e contexto, a
utilidade das partes de autoria e sua quantidade precisam ser examinadas no
produto.

### Relações que precisam ser processadas em conjunto

Na teoria da carga cognitiva, um **elemento** é uma unidade que a pessoa precisa
processar para aprender ou executar algo. **Interatividade de elementos**
descreve quantos desses elementos precisam ser coordenados ao mesmo tempo. A
estimativa depende da estrutura da informação e do conhecimento prévio e, por
isso, não representa toda a dificuldade da tarefa
([Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity)).

No planejamento do AraLearn, conhecimentos e relações que precisam permanecer
juntos formam um **conjunto de coordenação**. A contagem descreve o tamanho do
conjunto; os vínculos mostram, por exemplo, que uma ideia é pré-requisito de
outra. A [análise instrucional](desenho-instrucional-parametrizado.md) conserva
essas duas informações. Essa escolha busca preservar a estrutura da tarefa, e
não produzir uma pontuação automática de carga cognitiva.

### Da tarefa à evidência pretendida

O desenho centrado em evidências (*Evidence-Centered Design*) parte de uma
pergunta prática: que tarefa produziria uma resposta pertinente à afirmação que
se deseja sustentar? O método relaciona alegação, evidência observável e tarefa
([Mislevy et al. (2003)](referencias.md#ref-mislevy2003ecd)). O
AraLearn aproveita a separação para ligar objetivo, operação, requisito de
evidência e forma aceitável de desempenho. No produto, o **requisito de
evidência** é um registro de planejamento que ajuda a conferir se a atividade
corresponde ao objetivo. Transformar a resposta numa medida de aprendizagem
exige desenvolver e validar um instrumento próprio.

O modelo de desenho instrucional de quatro componentes, conhecido pela sigla
4C/ID (*Four-Component Instructional Design*), articula quatro componentes com
funções próprias: tarefas de aprendizagem integrais, informação de apoio,
informação procedimental e prática de partes da tarefa. As tarefas reúnem a
competência em situações completas; os outros componentes sustentam o que
precisa ser compreendido, orientam procedimentos recorrentes no momento de uso
ou exercitam partes que requerem automatização. O modelo também ajuda a pensar
quando variar casos e retirar apoio. Essas decisões dependem do conteúdo e do
estágio de aprendizagem
([van Merriënboer (2019)](referencias.md#ref-vanmerrienboer2019fourcomponent)).
Por isso, formas de desempenho e fidelidade devem permanecer categorias e
relações com limitações declaradas, em vez de uma escala ordinal artificial.

### Explicação, prática e materialização

Uma **autoexplicação** ocorre quando a pessoa explica para si mesma uma relação
ou justifica um passo do que está estudando. Essa atividade pode aprofundar
condições de aplicação e ligar procedimentos a princípios, embora seus efeitos
variem entre participantes e tarefas
([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations);
[Chi et al. (1994)](referencias.md#ref-chi1994eliciting)). Explicações
instrucionais também podem falhar quando não se ajustam ao conhecimento prévio,
aos conceitos relevantes ou à atividade cognitiva em curso
([Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)). Avaliar a
explicação, portanto, requer observar sua relação com o público, o conteúdo e a
tarefa, em vez de aplicar um checklist universal.

Num estudo com 48 estudantes de formação docente aprendendo probabilidade por
exemplos resolvidos, explicações instrucionais apoiaram a aprendizagem em
condições delimitadas, mas o uso desse apoio também apresentou dificuldades
([Renkl (2002)](referencias.md#ref-renkl2002learning)). O resultado situa a
relação entre exemplo, explicação oferecida e autoexplicação da pessoa. Em outra
tarefa ou com outro público, essa relação precisa ser examinada novamente.

A implementação registra que aspecto uma explicação precisa desenvolver. Em um
caso, pode ser o mecanismo que produz um fenômeno; em outro, a condição sob a
qual uma regra vale ou a justificativa de um procedimento. Na prática, uma nova
oportunidade precisa mudar o caso de maneira relevante para o objetivo, em vez
de apenas trocar palavras ou aparência.

O AraLearn relaciona o conhecimento a desenvolver, as atividades planejadas e
as unidades apresentadas ao estudante. Uma contagem de duas práticas informa a
quantidade; identificar o que cada uma pede permite examinar sua pertinência.
A hipótese é que conservar essas relações ajude a detectar omissões e repetição
superficial. O [desenho instrucional
parametrizado](desenho-instrucional-parametrizado.md) apresenta as convenções e
seus procedimentos de análise.

### Desenho de cursos e participação de quem os utiliza

[Amado et al. (2022)](referencias.md#ref-amado2022moocsdesign) propõem um quadro
para o desenho de MOOCs — cursos on-line abertos a muitos participantes — na
formação contínua de professores em Portugal. Com métodos mistos, que combinam
dados numéricos e qualitativos, organizam duas fases. Na primeira, uma
revisão de escopo — mapeamento da literatura sobre o tema — e entrevistas
fundamentam o quadro inicial. Na segunda, 103 questionários e dois pequenos
grupos de discussão contribuem para examinar e reformular a proposta. O quadro relaciona recursos, desenho e organização e
acompanhamento. A combinação de números e falas permite examinar divergências,
inclusive sobre colaboração e avaliação. Trata-se de fundamentação e
apreciação por participantes; a eficácia formativa continua por demonstrar.

Para o AraLearn, a contribuição metodológica está em confrontar um modelo de
autoria com o julgamento de educadores e usuários. É possível examinar se
objetivos, materiais, atividades e condições de acesso formam um percurso
compreensível, usando cursos efetivamente produzidos. Essa adaptação é proposta
por este projeto. O estudo original tratou MOOCs para formação contínua de
professores; autoria com IA e estudo autodidata no celular precisam de
investigação própria, e os requisitos daquele contexto não são transferidos
automaticamente ao aplicativo.

## 5. Exemplos resolvidos e retirada de apoio

Exemplos resolvidos podem ser mais adequados do que resolução não apoiada para
novatos em determinadas tarefas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples)). A retirada
gradual de etapas pode articular a passagem entre estudo do exemplo e solução
independente ([Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). A
explicação instrucional pode apoiar a autoexplicação quando corresponde ao
conteúdo e à atividade, sem eliminar déficits de uso
([Renkl (2002)](referencias.md#ref-renkl2002learning)). O benefício depende do
conhecimento prévio e da natureza da operação.

Num exemplo de cálculo, o estudante pode primeiro acompanhar os passos e suas
justificativas, depois completar uma etapa e, por fim, resolver um caso sem a
solução exposta. A quantidade de apoio acompanha o que a pessoa já consegue
fazer e o objetivo da tarefa. No AraLearn, essa possibilidade orienta a
[proposição sobre retirada de apoio](quadro-teorico.md#p4-apoio-seguido-de-produção-independente).
A comparação precisa considerar a experiência e o tempo dedicado, além do
desempenho quando o apoio deixa de estar disponível.

## 6. Representações externas e múltiplas representações

### A função de uma representação

Uma representação externa torna perceptíveis relações que podem ser difíceis
de conservar mentalmente, como a posição num plano, a hierarquia numa árvore ou
a comparação entre valores. O quadro DeFT propõe analisá-la pelo modo como foi
desenhada, pela função que cumpre e pela tarefa em que será usada
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Ela pode complementar
uma explicação ou restringir interpretações, mas também introduzir convenções
desconhecidas que precisam ser aprendidas.

A teoria da aprendizagem multimídia e a evidência de contiguidade sustentam
integrar elementos que precisam ser compreendidos em conjunto
([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)). Elas não sustentam que adicionar
imagens ou aumentar a variedade visual melhora automaticamente a aprendizagem.

Cada representação destaca algumas relações e pode ocultar outras. Uma imagem
pode complementar o texto, especializar parte da informação ou apenas repeti-la;
a função precisa ser declarada
([Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations);
[Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext)).
Sinalização pode apoiar a coordenação de texto e imagem em condições
delimitadas, com moderadores e heterogeneidade; não corrige conteúdo
incompatível nem torna qualquer arranjo instrucionalmente adequado
([Richter et al. (2016)](referencias.md#ref-richter2016signaling);
[Schneider et al. (2018)](referencias.md#ref-schneider2018signaling)).

### Decisão e hipótese para o AraLearn

Uma tabela pode ajudar a comparar valores; um fluxograma pode tornar mais
visíveis as decisões de um procedimento. A escolha depende da operação que o
estudante precisa realizar e das convenções que compreende. No AraLearn, o
[catálogo de componentes](componentes-didaticos.md) descreve os recursos
existentes, enquanto a [fundamentação das representações](fundamentacao-pedagogica-dos-resources.md)
relaciona suas funções e limites. A [proposição sobre representação](quadro-teorico.md#p3-representação-escolhida-pela-operação)
formula a comparação entre alternativas para uma mesma tarefa.

## 7. Gênero discursivo e descrição do artefato

Na tradição retórica e organizacional, gênero é uma forma recorrente de ação
social reconhecida numa comunidade. Forma visual e tipo de arquivo pertencem a
outras dimensões
([Miller (1984)](referencias.md#ref-miller1984genre);
[Yates e Orlikowski (1992)](referencias.md#ref-yates1992genres)). Por isso, uma
interface em blocos retangulares não estabelece por si um gênero discursivo, e
uma unidade curta não se torna flashcard apenas pela aparência.

O AraLearn é um **ambiente de aprendizagem, autoria
e pesquisa com unidades de estudo estruturadas**. A fórmula
explica funções do artefato; não reivindica a descoberta de um gênero
discursivo estabelecido. Dentro dele podem coexistir gêneros e atividades
diversos, como uma explicação, um exemplo resolvido ou uma pergunta de
recuperação. Eles precisam ser identificados por sua função comunicativa e
instrucional, não apenas pelo mecanismo que os apresenta na tela.

Essas distinções permitem descrever o conteúdo por sua função comunicativa e
o produto por suas operações. Uma explicação e uma pergunta podem compartilhar
a mesma aparência sem realizar o mesmo trabalho. O [glossário](glossario-construtos.md#segmento-discursivo)
distingue segmento discursivo, unidade de estudo e cartão de memorização.
A utilidade dessas convenções pode ser examinada pela análise de materiais e
pela compreensão de quem os produz.

## 8. Leitura móvel, ação e inferências sobre atenção

Layout, tamanho de tela e movimento do texto podem afetar leitura e esforço, mas
os resultados dependem da tarefa, do material e do modo de interação
([Dyson (2004)](referencias.md#ref-dyson2004layout);
[Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens);
[Li et al. (2021)](referencias.md#ref-li2021interaction)). Isso não estabelece
que rolagem, paginação ou encaixe automático seja universalmente superior. A autoria móvel
adota como hipótese de interface uma **sequência vertical de inspeção**: fluxo finito,
curricularmente ordenado, com posição, hierarquia, retomada e marcos explícitos.
Ela deve ser avaliada pela capacidade de localizar, revisar e anotar unidades,
não por semelhança com um fluxo contínuo de publicações.

Twitter/X ajuda a explicar a genealogia de fluxos curtos e continuamente
roláveis, mas não fornece fundamento pedagógico para copiá-los. Estudos de sua
linguagem e de usos educacionais descrevem fenômenos situados, enquanto pesquisa
de interação mostra riscos próprios de consumo de mídia social
([Zappavigna (2011)](referencias.md#ref-zappavigna2011ambient);
[Tang e Hew (2017)](referencias.md#ref-tang2017twitter);
[Baughan et al. (2022)](referencias.md#ref-baughan2022dissociation)). O
precedente genealógico permanece separado da evidência educacional.

Entre tocar a tela e compreender um conceito há níveis diferentes. A tabela
organiza essa passagem sem atribuir ao gesto um processo mental que ele não
revela:

| Nível | O que pode ser descrito |
| --- | --- |
| entrada e interface | o gesto observado, como toque ou deslize, e a mudança de estado produzida, como abrir ou avançar |
| tarefa | a operação solicitada sobre o conteúdo, como comparar, ordenar ou explicar |
| relação com o conhecimento | uma ação externa pode revelar informação e funcionar como **ação epistêmica** em condições demonstradas; o processo cognitivo continua sendo uma inferência |

A distinção entre ações pragmáticas e epistêmicas oferece base para estudar a
função de uma ação externa. Classificar um toque como epistêmico requer mostrar
como ele revelou informação ou simplificou o trabalho na tarefa
([Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic);
[Kirsh (2010)](referencias.md#ref-kirsh2010external)). Atenção compreende
processos seletivos internos e externos com mecanismos próprios
([Chun et al. (2011)](referencias.md#ref-chun2011attention)). Cliques, foco de
teclado, posição visível, rolagem e tempo de permanência são eventos técnicos,
não medidas diretas de atenção; explicações neurocientíficas exigem cautela
adicional ([Howard-Jones (2014)](referencias.md#ref-howardjones2014neuroscience)).

Engajamento também é multidimensional, e revisões da aprendizagem mediada por
tecnologia mostram diversidade de definições e instrumentos
([Henrie et al. (2015)](referencias.md#ref-henrie2015engagement)). Nem relato nem
log deve ser promovido sozinho a verdade psicológica; divergências sistemáticas
entre uso digital registrado e autorrelatado reforçam a necessidade de declarar
o que cada fonte observa
([Parry et al. (2021)](referencias.md#ref-parry2021digitalmedia)).

## 9. Prática de recuperação e formato de resposta

**Prática de recuperação** envolve tentar trazer à memória conhecimento
estudado, em vez de apenas relê-lo. Recordar pode integrar uma explicação ou
uma decisão sobre um novo caso. Estudos experimentais e revisões
encontraram benefícios em diferentes condições escolares, com variação por
tarefa, conteúdo e medida ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). Transferência para estruturas novas é possível, mas
moderada ([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

Reconhecer uma alternativa, escrever uma explicação e ordenar etapas solicitam
operações diferentes. A dificuldade maior de um formato, por si só, não o torna
mais educativo.

A [escolha do formato de resposta](componentes-didaticos.md) precisa acompanhar
o que se pretende recuperar ou aplicar. Uma seleção pode exigir distinguir
casos próximos; uma resposta escrita pode pedir explicação. A atividade deve
conservar os dados do problema, oferecer retorno pertinente e permitir
observar a operação solicitada. A [proposição sobre prática](quadro-teorico.md#p5-prática-variada-por-função-e-não-por-aparência)
separa variação relevante de mudança cosmética e relaciona o desenho à
avaliação posterior.

## 10. Prática distribuída e intercalação

A **prática distribuída** reapresenta o conhecimento ao longo do tempo. Há uma
base empírica ampla para seus benefícios, mas o intervalo favorável depende do
horizonte de retenção e de outras características
([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing)). Já a **intercalação**
alterna categorias ou procedimentos e pode favorecer
discriminação, com moderadores como similaridade
([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).

Retomar um procedimento depois de um intervalo e alterná-lo com outro são
escolhas distintas. Em matemática, por exemplo, alternar problemas que exigem
operações diferentes pode solicitar também a identificação de qual operação
usar. O [planejamento do AraLearn](modelo-didatico.md) pode organizar retomadas
e alternâncias com essa finalidade; a distribuição observada do material
precisa ser relacionada à tarefa e ao momento em que o conhecimento será
avaliado.

## 11. Feedback, ação e baixa consequência

O efeito do feedback depende do que a mensagem informa, do momento em que chega
e da possibilidade de a pessoa agir sobre ela
([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). A competência para interpretar e usar feedback
(*feedback literacy*) desloca a atenção da mensagem entregue para a capacidade de
interpretar, julgar e usar essa informação ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). Feedback também pode corrigir avaliações metacognitivas
equivocadas, como respostas corretas dadas com baixa confiança
([Butler et al. (2008)](referencias.md#ref-butler2008confidence)).

Testes de **baixa consequência** têm peso ou consequências reduzidos para a
avaliação do estudante. A síntese de [Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes)
encontrou associação positiva com desempenho nas disciplinas, incluindo
atividades que contribuíam para a nota. O AraLearn adota uma opção mais
específica: a prática não gera nota, classificação ou penalização acumulada.
Os efeitos dessa política sobre estratégias ou ansiedade exigem avaliação
própria.

No AraLearn, o estudante confirma uma resposta antes da avaliação, recebe
retorno e pode tentar novamente ou revelar a solução por ação própria.
A [política de estudo sem penalização acumulada](estado-de-estudo-nao-punitivo.md)
explica essas escolhas. A [proposição sobre retorno](quadro-teorico.md#p6-retorno-acionável-de-baixa-consequência)
investiga se a informação recebida ajuda a interpretar o erro e agir no próximo
caso. O conteúdo da mensagem e seu uso importam tanto quanto seu momento.

## 12. Participação, responsabilidade e acesso

A aprendizagem ocorre por mediações, instrumentos e relações sociais
([Vygotsky (1978)](referencias.md#ref-vygotsky1978mind)). O apoio pode ser contingente e retirado à medida que a pessoa
assume partes da tarefa
([Wood et al. (1976)](referencias.md#ref-wood1976tutoring)). Comunidades de
prática ajudam a compreender participação e construção de significado, mas
também podem habilitar ou inibir agência
([Wenger (1998)](referencias.md#ref-wenger1998communities);
[Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)). Acesso comum a um
curso só caracteriza colaboração ou comunidade quando as pessoas efetivamente
participam, negociam sentidos e transformam a prática.

O AraLearn reserva a edição do curso à pessoa proprietária e permite conceder
ou revogar acesso para estudo. As [observações](observacoes-pedagogicas.md)
podem mediar perguntas e revisão de material. Esses meios técnicos delimitam
ações disponíveis, enquanto colaboração depende do que as pessoas efetivamente
constroem e negociam entre si. A [proposição sobre responsabilidade autoral](quadro-teorico.md#p9-propriedade-do-curso-e-assistência-de-ia-delimitada)
examina as escolhas de acesso e controle; investigar participação social requer
observar também as relações e o contexto de uso.

## 13. Aprendizagem no trabalho, gestão do conhecimento e educação profissional

### O que muda quando aprender faz parte do trabalho

No trabalho, uma pessoa pode aprender num curso formal, ao resolver um problema
ou ao conversar com colegas. Esses processos ocorrem em relações que podem
envolver a pessoa, a equipe ou a organização, e os ambientes de trabalho
diferem quanto às oportunidades e ao apoio que oferecem.
Uma revisão temática também distingue aprendizagem formal e informal e alerta
contra tratar “o local de trabalho” como ambiente uniforme
([Tynjälä (2008)](referencias.md#ref-tynjala2008workplace)).

**Gestão do conhecimento** trata dos processos pelos quais uma organização cria,
organiza, compartilha, transfere e aplica conhecimento. Um sistema de
informação pode apoiar esses processos, mas não os substitui: conhecimento e
gestão do conhecimento envolvem práticas, pessoas, contextos e decisões que não
se reduzem ao armazenamento de documentos. A revisão de Alavi e Leidner situa
os sistemas de gestão do conhecimento como apoio à criação, à transferência e
à aplicação de conhecimento organizacional e ressalta a natureza multifacetada
do problema ([Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge)).

**Educação e formação técnica e profissional** (TVET, do inglês *technical and
vocational education and training*) abrange educação, formação e
desenvolvimento de competências relacionados a campos ocupacionais, produção,
serviços e meios de vida. A recomendação da UNESCO inclui aprendizagem baseada
no trabalho, formação continuada e desenvolvimento profissional dentro de uma
perspectiva de aprendizagem ao longo da vida. Ela também reconhece contextos
institucionais, laborais, domésticos e informais, inclusive aprendizagem
autodirigida e entre pares ([UNESCO (2015)](referencias.md#ref-unesco2015tvet)).
A recomendação é uma fonte normativa: delimita finalidades e orientações, mas
não demonstra que uma plataforma específica forme competências profissionais.

### Relação possível com o AraLearn

O AraLearn pode apoiar a preparação de percursos a partir de normas, manuais e
explicações relacionadas a tarefas profissionais. Uma pesquisa pode acompanhar
como esses materiais são selecionados, transformados em curso e usados diante
de um problema de trabalho. O curso, suas fontes e a revisão permanecem
inspecionáveis, conforme o [guia de autoria](guia-professor-autor.md).

A passagem do material à prática profissional exige investigação própria:
qualidade do curso, realização de uma tarefa, retenção e mudança organizacional
são resultados diferentes. Ocupação, experiência, condições de aprendizagem e
consequências do uso delimitam a análise. Capacidades de gestão institucional,
como matrícula, certificação e gestão de competências, são descritas entre os
[limites atuais do produto](estado-atual-e-roadmap.md); a criação de cursos não
as institui por si mesma.

## 14. Inteligência artificial generativa, recuperação de contexto e controle humano

Um **modelo de linguagem de grande porte** (LLM, do inglês *large language
model*) estima e produz sequências de linguagem a partir de instruções e
contexto. **Inteligência artificial generativa** (IA generativa) é a categoria
mais ampla de sistemas capazes de produzir conteúdo; fluência não implica
correção factual ou adequação pedagógica.

A geração aumentada por recuperação condiciona a geração a informação
recuperada ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)). A sigla RAG,
do inglês *retrieval-augmented generation*, designa especificamente uma
arquitetura em que a recuperação integra de modo identificável o processo de
geração. Consultas auxiliares de contexto podem seguir outros desenhos. Mesmo
numa RAG, a fonte escolhida, sua interpretação e o texto gerado continuam
sujeitos a erro.
Uma revisão sobre alucinação na geração de linguagem mostra tipos, causas,
métricas e formas de mitigação dependentes da tarefa
([Ji et al. (2023)](referencias.md#ref-ji2023hallucination)).

Sínteses recentes sobre uso educacional de IA generativa encontraram efeitos
agregados positivos, mas também forte heterogeneidade e moderadores. Han et al.
reuniram 68 estudos experimentais ou quase experimentais e 337 tamanhos de
efeito, com heterogeneidade substancial; nível educacional, área, duração e
tamanho amostral modificaram os resultados
([Han et al. (2025)](referencias.md#ref-han2025genaimeta)). Chen e Cheung
sintetizaram 57 estudos e 97 estimativas com estudantes universitários; algumas
dimensões foram positivas, enquanto metacognição não apresentou efeito
estatisticamente significativo, e pessoa, ferramenta, regra, contexto e medida
atuaram como moderadores
([Chen e Cheung (2025)](referencias.md#ref-chen2025genaimeta)). Essas sínteses
não avaliam o AraLearn nem permitem transportar um efeito médio para outra
tarefa, modelo ou população.

Diretrizes para interação entre pessoas e IA recomendam comunicar capacidades e limites,
oferecer feedback e permitir correção ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Funções que exigem
reflexão podem reduzir dependência excessiva em alguns cenários, mas também
introduzem custo e não se transferem automaticamente
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). Orientações de UNESCO e NIST destacam avaliação de
risco, transparência, proteção de dados e responsabilidade humana
([UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)).

A própria colaboração pessoa–IA é heterogênea. Uma meta-análise pré-registrada
de 106 experimentos encontrou que as combinações tiveram desempenho médio
inferior ao melhor desempenho isolado; houve perdas em tarefas de decisão e um
resultado positivo não significativo em tarefas de criação
([Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai)). Em entrevistas
com docentes de escolas australianas e suecas, o uso para planejar e produzir
materiais envolveu conferir, editar e, quando necessário, rejeitar ou
reconstruir as saídas ([Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting)).
Esses relatos tornam visível trabalho profissional que uma descrição centrada
somente em geração ou economia de tempo apagaria, mas não estimam efeito
populacional nem aprendizagem.

Na autoria do AraLearn, o assistente consulta o contexto salvo, identifica o
que pode alterar e recebe as regras do componente escolhido. A pessoa autora
inspeciona o resultado e suas fontes. Essa organização busca tornar mudanças
compreensíveis e corrigíveis. O [guia de assistência por IA](assistencia-por-ia.md)
explica as operações, e a [proposição sobre correção contextual](quadro-teorico.md#p7-correção-contextual-e-revisável)
relaciona o desenho à avaliação de escopo, qualidade e retrabalho.

### Confiança calibrada e viés de automação

**Confiança calibrada** significa que a confiança na ferramenta acompanha suas
capacidades e limitações na tarefa. A revisão de
[Lee e See (2004)](referencias.md#ref-lee2004trust) distingue a atitude de
confiança do comportamento de apoiar-se na automação: a primeira influencia o
segundo, mas não o determina. O objetivo de design é favorecer um uso
adequado, sem presumir que aumentar a confiança seja sempre benéfico.

**Viés de automação** pode ocorrer quando o apoio automatizado leva a aceitar
uma recomendação errada ou a deixar de agir porque o sistema não apontou um
problema. [Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation)
revisam estudos e propõem um modelo que relaciona parte desses erros à atenção,
à situação e às características do sistema. Experiência e instruções de
conferência não garantem sua prevenção. O modelo não explica todas as formas
de viés e foi construído em outros contextos de automação.

No AraLearn, texto fluente, referências aparentes e uma resposta tecnicamente
aceita podem parecer mais confiáveis do que são. A hipótese de transferência
desses riscos precisa ser examinada: apresente propostas corretas e
incorretas, observe a conferência das fontes e compare a decisão com critérios
de conteúdo independentes. Registre também rejeições de propostas corretas.
Satisfação, frequência de uso e a declaração de revisão, isoladamente, não
demonstram confiança calibrada. Os controles disponíveis são condições para a
inspeção, cuja qualidade depende da pessoa, da tarefa e do contexto.

### Inspeção humana e conferência das fontes

Supervisão humana precisa ser examinada como trabalho de inspeção, julgamento
e intervenção. A pessoa autora necessita de meios para reencontrar a afirmação,
consultar a fonte em contexto, reconhecer uma atribuição inadequada e decidir
sobre a correção. Diretrizes de interação fundamentam esses meios; estudos
situados de autoria mostram que conferir e reconstruir materiais pode exigir
trabalho substancial
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting)).

No AraLearn, [fontes e âncoras](fontes-e-citacoes.md) localizam o material usado,
e a [revisão autoral](explicacao-e-revisao-humana.md) registra uma declaração
humana sobre conteúdo salvo. São decisões de design que tornam a inspeção
possível; uma citação presente ou uma confirmação registrada não comprova sua
qualidade. A hipótese é que a ligação entre texto, fonte, objeto inspecionado e
correção possa apoiar controle humano efetivo. Para examiná-la, o estudo deve
incluir atribuições plausíveis porém incorretas, fontes insuficientes e erros
que passem pela validação estrutural, observando como a pessoa os interpreta
e trata.

### Literacia em IA e orientações institucionais

A Recomendação CM/Rec(2026)12, adotada pelo **Conselho da Europa** em 2 de
setembro de 2026, propõe uma literacia em IA que reúne dimensões humana,
tecnológica e prática. O conceito abrange compreender o funcionamento e os
limites dos sistemas, avaliar suas implicações e decidir de modo informado
quando e como utilizá-los. A recomendação destaca a preservação do julgamento
e da responsabilidade humanos e a possibilidade de decidir pelo não uso da IA
(apêndice, §§ 7, 27–28 e 34;
[Conselho da Europa (2026)](referencias.md#ref-coe2026ailiteracy)).

No Brasil, o referencial do Ministério da Educação orienta a **supervisão humana
significativa**, vinculando o uso da IA às finalidades pedagógicas. Na pesquisa
e na pós-graduação, recomenda examinar a confiabilidade e a pertinência das
fontes, verificar os resultados, declarar como a IA foi empregada e preservar
a responsabilidade científica e os dados da investigação (pp. 69–70 e
175–179; [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao)).

Essas fontes oferecem orientações institucionais, não resultados de eficácia
do AraLearn. Para o projeto, fundamentam investigar se autores compreendem as
propostas, conferem conteúdo e fontes e conservam condições reais de decisão.
Também sustentam distinguir competência crítica no uso da IA de habilidade
para executar comandos. Uma avaliação deve examinar essas capacidades; a
presença de controles ou citações não comprova que foram desenvolvidas.

## 15. Análise de dados educacionais, privacidade e interpretação

A análise de dados educacionais, também conhecida como *learning analytics*,
envolve mais que coletar e exibir dados. Transparência, controle,
responsabilidade e finalidade são princípios éticos relevantes
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). Abordagens centradas nas pessoas
tratam feedback informado por dados como processo humano e dialógico
([Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)).

Cliques, tempo e conclusão são manifestações ambíguas. Podem refletir uma
interrupção, uma estratégia do estudante ou uma falha técnica. Relacioná-los a
atenção, esforço, domínio ou qualidade docente exige um modelo e validação.

A área **Dados de autoria** descreve conteúdo e intervenções observáveis no
curso corrente. Suas contagens ajudam a inspecionar o desenho produzido;
comportamento de estudo não é coletado por essa área. A pessoa proprietária
pode exportar a análise e o conteúdo salvo para uma investigação com finalidade
própria. O [dicionário dos dados](dicionario-metricas-datasets.md) explica o que
os números representam, e os [fundamentos de governança](fundamentos-pesquisa-e-governanca.md)
tratam das responsabilidades em seu uso.

## 16. Métrica, indicador, desfecho e validade

Guardar um evento com precisão não valida a interpretação construída sobre ele.
Validade diz respeito à sustentação das interpretações e dos usos de uma medida
em determinada população, tarefa e decisão; não é um selo permanente do campo
de banco, do instrumento ou do algoritmo
([Messick (1995)](referencias.md#ref-messick1995validity);
[American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards)).

Para a pesquisa no AraLearn, o caminho do registro à conclusão possui etapas
distintas:

| Etapa | Função |
| --- | --- |
| dado bruto | preserva o que foi observado, com contexto, unidade e origem |
| métrica e medida | a métrica define uma regra de cálculo versionada; a medida é o valor obtido por observação ou pela aplicação dessa regra |
| indicador | interpreta uma ou mais medidas para uma finalidade declarada |
| desfecho de pesquisa | define no protocolo qual variável será tratada como resultado |

Uma contagem de anotações, por exemplo, pode ser dado e medida de frequência.
Ela só se torna indicador de carga de revisão sob uma justificativa explícita e
não mede automaticamente dificuldade, qualidade, engajamento ou atenção. O
mesmo vale para a proporção entre teoria e prática, o uso dos componentes e a
taxa de correção.

Como decisão de produto, o AraLearn conserva os fatos de autoria e planejamento
necessários para recalcular métricas. Definição, fórmula, denominador e filtros
recebem versão, acompanhados tanto das interpretações admitidas quanto das
interpretações vedadas. A hipótese é que ligar esses registros à versão do
conteúdo permita análises reprodutíveis do processo de autoria.

Essa reprodutibilidade é técnica. Validade educacional e causalidade dependem
do instrumento, da população, do momento, dos dados ausentes e das comparações
definidas em cada estudo, além das consequências previstas para o uso do
resultado. O protocolo também declara como a incerteza será representada e
tratada na análise; um valor calculável não elimina a incerteza da medição ou
da interpretação.

## 17. Construção e avaliação do artefato

A pesquisa baseada em design, ou DBR (*Design-Based Research*), investiga
intervenções educacionais por ciclos em
contextos autênticos e busca explicar relações entre teoria, design e prática
([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)). A pesquisa em ciência do design, ou DSR (*Design Science Research*),
organiza construção, demonstração e avaliação de artefatos e do conhecimento de
design que incorporam ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)).

Gregor e Hevner ajudam a posicionar a contribuição conforme a maturidade do
problema e da solução ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). O FEDS (*Framework for Evaluation in Design Science*)
organiza a avaliação por finalidade: orientar mudanças durante a construção
(formativa) ou julgar uma versão (somativa). Também distingue um ambiente
preparado para a avaliação (artificial) do uso próximo ao cotidiano
(naturalístico)
([Venable et al. (2016)](referencias.md#ref-venable2016feds)).

DBR é especialmente pertinente quando a pergunta acompanha como uma
intervenção educacional se transforma e opera em situações reais. DSR dirige a
atenção ao artefato, aos mecanismos que ele incorpora e ao conhecimento de
desenho produzido. Testes de software podem compor a evidência técnica de uma
DSR, enquanto os resultados educacionais exigem procedimentos próprios.

Perguntas sobre práticas institucionais ou experiência vivida podem requerer
estudo de caso ou outro enquadramento. O
[protocolo](protocolo-avaliacao-artefato.md#escolher-uma-estratégia-de-investigação)
relaciona cada estratégia ao tipo de pergunta que ela consegue responder.

## Síntese das alegações

| Tema | O que a revisão sustenta | Consequência para o desenho e a pesquisa |
| --- | --- | --- |
| tamanho das unidades | o dimensionamento depende do objetivo, das relações e do conhecimento prévio | planejar a progressão antes de definir quantidade ou extensão |
| contagem e carga cognitiva | a quantidade descreve o material; carga depende também das relações e do público | conservar vínculos e usar contagens como descritores operacionais |
| limites de sentido | parágrafo e extensão são medidas editoriais, não fronteiras semânticas universais | declarar o critério de segmentação, o denominador e a versão |
| unidade de estudo e flashcard | flashcard é o caso específico organizado por pista e resposta | identificar unidade, gênero e atividade por suas funções |
| representação de dimensões pedagógicas | algumas relações são mais bem preservadas por categorias ou conjuntos que por pontuações | escolher a forma de registro conforme a informação necessária |
| múltiplas representações | o benefício depende da função e da coordenação entre as formas | justificar cada representação pela operação que ela apoia |
| transformação entre formas | passar de texto para imagem pode perder, acrescentar ou alterar relações | registrar fonte, finalidade e mudanças da transformação |
| disponibilidade e uso de componentes | política disponível, escolha local e instância produzida são estados diferentes | verificar no conteúdo qual componente foi realmente usado |
| recuperação e distribuição | podem favorecer aprendizagem em vários contextos, com moderadores | definir operação, intervalo, retorno e medida |
| escolha e autonomia | opções ganham sentido quando a pessoa as compreende e dispõe de estrutura para agir | avaliar agência e qualidade da escolha, não quantidade de controles |
| retorno | conteúdo, foco e possibilidade de ação importam junto com o momento | observar como a pessoa interpreta e usa a informação |
| disponibilidade local | o software pode demonstrar acesso sem rede; retomada e aprendizagem são resultados humanos distintos | avaliar primeiro se a pessoa reconstrói e continua a tarefa |
| gesto e atenção | rolagem registra uma interação, enquanto atenção e engajamento são construtos próprios | conservar gesto, ação e contexto e validar qualquer inferência psicológica |
| contexto para geração | recuperação e contratos delimitam informação e operação, mas ainda admitem erro | inspecionar fontes e resultado e conservar intervenção humana |
| rastros de uso | registros técnicos precisam de um argumento que os relacione ao fenômeno investigado | começar pelo construto e pela finalidade da análise |
| reprodutibilidade e validade | uma fórmula reproduzível assegura o cálculo, não a interpretação | validar o uso para a população, a tarefa e a decisão declaradas |

## Lacunas de conhecimento

As lacunas atuais formam cinco frentes de pesquisa:

| Frente | Conhecimento ainda necessário |
| --- | --- |
| sistemas e contextos de uso | comparar classes de sistemas sem apagar suas diferenças e caracterizar estudantes-trabalhadores em situações reais de tempo, dispositivo e conectividade |
| progressão e representação | mapear critérios de segmentação e convenções em diferentes áreas, estudar a coordenação entre representações e investigar explicações progressivas para novatos sem perda de profundidade |
| planejamento e medida | examinar se autores compreendem os registros de análise instrucional, validar seus limites locais e desenvolver medidas de retomada, carga, agência, uso do retorno e qualidade autoral |
| prática e interface | comparar políticas de componentes, distinguir compreensão imediata, retenção e transferência e confrontar formas de inspeção como sequência vertical e paginação |
| IA e governança | investigar modelos com capacidades e custos distintos, estudar proveniência, poder e autoria coletiva e registrar mecanismos que falham, resultados nulos e efeitos adversos |

Algumas frentes exigem definições e instrumentos específicos, especialmente
para densidade conceitual, complexidade textual e engajamento. Esses
instrumentos devem ser validados para a interpretação pretendida antes de
orientarem decisões do produto.

## Procedimento de composição do corpus

O corpus partiu das alegações pedagógicas e sociotécnicas presentes no desenho
do AraLearn. Para cada uma, foram procuradas sínteses de evidência, estudos
fundamentais, quadros conceituais e fontes normativas pertinentes. A identidade
bibliográfica foi conferida por DOI — identificador persistente de uma
publicação —, ISBN — identificador de uma edição de livro — ou endereço
institucional estável.

Depois da conferência, cada fonte foi relacionada ao tema, ao público, à tarefa
e ao alcance de seu método. A síntese final separa o resultado publicado, a
inferência feita para o artefato e a questão que ainda precisa de avaliação.

Materiais promocionais e comparações sem identidade bibliográfica verificável
ficaram fora do fundamento de eficácia. O mesmo ocorreu com inferências que
tratavam satisfação ou conclusão como aprendizagem e com afirmações cujo
mecanismo não podia ser separado do restante da intervenção.

Essa estratégia oferece rastreabilidade, mas não garante exaustividade. Novas
fontes devem entrar na bibliografia somente depois de conferência e devem
alterar a síntese quando contradizem, limitam ou refinam o argumento vigente.

O corpus inicial não conserva um diário completo das consultas que o
originaram. Portanto, não é possível reconstruir retrospectivamente, com
precisão, todas as bases, expressões, datas e contagens usadas. Essa limitação
é declarada em vez de preencher lacunas com buscas presumidas.

### Protocolo prospectivo de busca e atualização

A partir desta versão, toda busca destinada a ampliar ou revisar o corpus segue
o protocolo **ARA-LIT-1**. O registro aumenta a rastreabilidade desta revisão
narrativa. Uma revisão sistemática ou de escopo requer protocolo e etapas
próprios, compatíveis com a pergunta e o método escolhido.

1. formular uma pergunta delimitada e associá-la a um eixo desta revisão;
2. escolher bases adequadas ao eixo, como ERIC para educação, Scopus para
   cobertura interdisciplinar e ACM Digital Library para computação; normas
   exigem a fonte institucional primária pertinente;
3. registrar, antes da seleção, a base, a consulta exatamente como executada,
   a data e hora em UTC, os filtros e a contagem informada pela base;
4. deduplicar primeiro por DOI e, quando ele não existir, por título, ano e
   autoria, conservando a decisão em caso de dúvida;
5. avaliar título e resumo segundo os critérios abaixo; registrar o motivo da
   exclusão quando a decisão depender do texto integral;
6. conferir identidade bibliográfica e, conforme o desenho da fonte, examinar
   população, contexto, tarefa, comparação, resultados, limitações e risco de
   viés;
7. incluir os metadados confirmados em `referencias.bib`, atualizar a síntese e
   a matriz de rastreabilidade e explicar quando a nova fonte contradiz ou
   restringe uma afirmação anterior.

Consultas em mecanismos de busca gerais e rastreamento de referências para
trás ou para a frente podem complementar as bases. Eles devem ser identificados
como tal no registro; não substituem silenciosamente uma base declarada.

### Critérios ARA-LIT-1

Uma fonte pode ser incluída quando tem identidade verificável, relação direta
com a pergunta registrada e informação suficiente para avaliar o alcance da
afirmação utilizada. Conforme a pergunta, são elegíveis estudos primários,
sínteses de evidência, trabalhos teóricos, normas e documentação técnica
primária. Não há corte cronológico geral: cada filtro de data precisa de
justificativa registrada.

São excluídos como fundamento científico materiais promocionais, fontes sem
proveniência verificável e textos cuja relação com a pergunta dependa apenas de
analogia. Uma fonte não é excluída por contradizer a decisão atual; resultados
nulos, adversos e explicações rivais são necessários para avaliar o argumento.
Idioma, acesso ao texto integral e tipo de publicação não devem ser usados como
filtros ocultos: quando afetarem a seleção, aparecem no campo `filtros` ou nas
observações.

### Registro reprodutível

O arquivo
[`evidence/registro-buscas-bibliograficas.csv`](evidence/registro-buscas-bibliograficas.csv)
recebe uma linha por consulta realmente executada. As linhas datadas distinguem a busca temática da conferência de uma fonte já
conhecida. Quando o instante exato de uma consulta não foi preservado, as
observações identificam o horário registrado e essa limitação.

| Campo | Significado |
| --- | --- |
| `registro_id` | identificador estável da consulta |
| `data_hora_utc` | horário registrado em ISO 8601 e UTC; as observações informam quando ele corresponde ao registro posterior da consulta |
| `eixo` | pergunta ou seção desta revisão atendida |
| `base_ou_indice` | serviço consultado, sem agrupar bases diferentes numa linha |
| `consulta_exata` | expressão copiada da interface ou API consultada |
| `filtros` | limites de data, idioma, campo, tipo ou outros, inclusive “nenhum” |
| campos de contagem | total informado, deduplicação, triagens e inclusões daquele fluxo |
| `motivos_exclusao_texto_integral` | categorias e contagens das exclusões decididas após leitura integral |
| `versao_criterios` | versão aplicada, inicialmente `ARA-LIT-1` |
| `responsavel` | identificador ou papel definido no protocolo da investigação |
| `observacoes` | falhas, limites, motivo de nova execução ou ligação para evidência complementar |

Se a mesma consulta for repetida, recebe nova linha: resultados de uma base
podem mudar ao longo do tempo. Correções preservam o valor anterior no histórico
do Git e explicam a mudança em `observacoes`.

## Documentos de operacionalização

O [modelo didático](modelo-didatico.md) leva estes fundamentos ao planejamento
dos cursos. O [quadro teórico](quadro-teorico.md) formula as relações a
investigar, e o [protocolo de avaliação](protocolo-avaliacao-artefato.md) ajuda a
transformá-las em estudos delimitados. O [percurso acadêmico da
documentação](README.md#avaliar-o-artefato) reúne os aprofundamentos restantes.

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui): Masyura Ahmad Faudzi; Zaihisma Che Cob; Ridha Omar; Sharul Azim Sharudin; Masitah Ghazali (2023). **Investigating the User Interface Design Frameworks of Current Mobile Learning Applications: A Systematic Review.** *Education Sciences*, 13(1), p. 94.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge): Maryam Alavi; Dorothy E. Leidner (2001). **Review: Knowledge Management and Knowledge Management Systems: Conceptual Foundations and Research Issues.** *MIS Quarterly*, 25(1), p. 107–136.
- [Amado et al. (2022)](referencias.md#ref-amado2022moocsdesign): Carolina Amado; Nuno Dorotea; Ana Pedro; João Piedade (2022). **MOOCs Design: A Conceptual Framework for Continuous Teacher Training in Portugal.** *Education Sciences*, 12(5), artigo 308.
- [American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards): American Educational Research Association; American Psychological Association; National Council on Measurement in Education (2014). **Standards for Educational and Psychological Testing.** Washington, DC, American Educational Research Association.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Autio et al. (2024)](referencias.md#ref-nist2024genai): Chloe Autio; Reva Schwartz; Jesse Dunietz; Shomik Jain; Martin Stanley; Elham Tabassi; Patrick Hall; Kamie Roberts (2024). **Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile.** National Institute of Standards and Technology, NIST AI 600-1.
- [Bandura (2001)](referencias.md#ref-bandura2001agency): Albert Bandura (2001). **Social Cognitive Theory: An Agentic Perspective.** *Annual Review of Psychology*, 52, p. 1–26.
- [Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards): Philip D. Barrison; Emily A. Balczewski; Emily Capellari; Zach Landis-Lewis; Alexandra H. Vinson (2025). **Electronic Flashcards in Health Professions Education: A Scoping Review.** *Academic Medicine*, 100(4), p. 497–506.
- [Baughan et al. (2022)](referencias.md#ref-baughan2022dissociation): Amanda Baughan; Mingrui Ray Zhang; Raveena Rao; Kai Lukoff; Anastasia Schaadhardt; Lisa D. Butler; Alexis Hiniker (2022). **I Don't Even Remember What I Read: How Design Influences Dissociation on Social Media.** In: *Proceedings of the 2022 CHI Conference on Human Factors in Computing Systems*, ACM, p. 1–13.
- [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao): Brasil. Ministério da Educação (2026). **Referencial para Desenvolvimento e Uso Responsáveis de Inteligência Artificial na Educação.** Ministério da Educação.
- [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative): E. N. Bridwell-Mitchell (2016). **Collaborative Institutional Agency: How Peer Learning in Communities of Practice Enables and Inhibits Micro-Institutional Change.** *Organization Studies*, 37(2), p. 161–192.
- [Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving): Markus Brunmair; Tobias Richter (2019). **Similarity Matters: A Meta-Analysis of Interleaved Learning and Its Moderators.** *Psychological Bulletin*, 145(11), p. 1029–1052.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [Butler et al. (2008)](referencias.md#ref-butler2008confidence): Andrew C. Butler; Jeffrey D. Karpicke; Henry L. Roediger (2008). **Correcting a Metacognitive Error: Feedback Increases Retention of Low-Confidence Correct Responses.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 34(4), p. 918–928.
- [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy): David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325.
- [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing): Shana K. Carpenter; Steven C. Pan; Andrew C. Butler (2022). **The Science of Effective Learning with Spacing and Retrieval Practice.** *Nature Reviews Psychology*, 1, p. 496–511.
- [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed): Nicholas J. Cepeda; Harold Pashler; Edward Vul; John T. Wixted; Doug Rohrer (2006). **Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.** *Psychological Bulletin*, 132(3), p. 354–380.
- [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing): Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102.
- [Chen e Cheung (2025)](referencias.md#ref-chen2025genaimeta): Shuzhen Chen; Alan C. K. Cheung (2025). **Effect of Generative Artificial Intelligence on University Students Learning Outcomes: A Systematic Review and Meta-Analysis.** *Educational Research Review*, 49, p. 100737.
- [Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity): Ouhao Chen; Fred Paas; John Sweller (2023). **A Cognitive Load Theory Approach to Defining and Measuring Task Complexity Through Element Interactivity.** *Educational Psychology Review*, 35, p. 63.
- [Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations): Michelene T. H. Chi; Miriam Bassok; Matthew W. Lewis; Peter Reimann; Robert Glaser (1989). **Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems.** *Cognitive Science*, 13(2), p. 145–182.
- [Chi et al. (1994)](referencias.md#ref-chi1994eliciting): Michelene T. H. Chi; Nicholas de Leeuw; Mei-Hung Chiu; Christian LaVancher (1994). **Eliciting Self-Explanations Improves Understanding.** *Cognitive Science*, 18(3), p. 439–477.
- [Choi et al. (2024)](referencias.md#ref-choi2024vivid): Seulgi Choi; Hyewon Lee; Yoonjoo Lee; Juho Kim (2024). **VIVID: Human–AI Collaborative Authoring of Vicarious Dialogues from Lecture Videos.** In: *Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems*, Association for Computing Machinery, p. 1–26.
- [Chun et al. (2011)](referencias.md#ref-chun2011attention): Marvin M. Chun; Julie D. Golomb; Nicholas B. Turk-Browne (2011). **A Taxonomy of External and Internal Attention.** *Annual Review of Psychology*, 62(1), p. 73–101.
- [Conselho da Europa (2026)](referencias.md#ref-coe2026ailiteracy): Conselho da Europa (2026). **Recommendation CM/Rec(2026)12 of the Committee of Ministers to Member States on Artificial Intelligence Literacy.** Council of Europe.
- [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning): Jennie Chang De Gagne; Hyeyoung Kate Park; Katherine Hall; Amanda Woodward; Sandra Yamane; Sang Suk Kim (2019). **Microlearning in Health Professions Education: Scoping Review.** *JMIR Medical Education*, 5(2), p. e13997.
- [Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha): Deepak Varuvel Dennison; Bakhtawar Ahtisham; Kavyansh Chourasia; Nirmit Arora; Rahul Singh; René F. Kizilcec; Akshay Nambi; Tanuja Ganu; Aditya Vashistha (2026). **Shiksha Copilot: Teacher–AI Collaboration for Curating and Customizing Lesson Plans in Low-Resource Schools.** *Proceedings of the ACM on Human-Computer Interaction*, 10(2), p. 1–47.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Dyson (2004)](referencias.md#ref-dyson2004layout): Mary C. Dyson (2004). **How Physical Text Layout Affects Reading from Screen.** *Behaviour & Information Technology*, 23(6), p. 377–393.
- [Ferreira e Pedrosa (2024)](referencias.md#ref-ferreira2024iaautorregulacao): Adriano Ferreira; Daniela Pedrosa (2024). **Uso da inteligência artificial para apoiar a autorregulação de aprendizagem: uma revisão de literatura.** *PRATICA – Revista Multimédia de Investigação em Inovação Pedagógica e Práticas de e-Learning*, 7(2), p. 101–111.
- [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption): Cyrus K. Foroughi; Nicole E. Werner; Elizabeth T. Nelson; Deborah A. Boehm-Davis (2016). **Individual Differences in Working-Memory Capacity and Task Resumption Following Interruptions.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 42(9), p. 1480–1488.
- [Gazzola et al. (2022)](referencias.md#ref-gazzola2022textcomplexity): Murilo Gazzola; Sidney Leal; Breno Pedroni; Fábio Theoto Rocha; Sabine Pompéia; Sandra Aluísio (2022). **Text Complexity of Open Educational Resources in Portuguese: Mixing Written and Spoken Registers in a Multi-task Approach.** *Language Resources and Evaluation*, 56(2), p. 621–650.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [Graesser et al. (2004)](referencias.md#ref-graesser2004cohmetrix): Arthur C. Graesser; Danielle S. McNamara; Max M. Louwerse; Zhiqiang Cai (2004). **Coh-Metrix: Analysis of Text on Cohesion and Language.** *Behavior Research Methods, Instruments, & Computers*, 36(2), p. 193–202.
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Han et al. (2025)](referencias.md#ref-han2025genaimeta): Xiaoli Han; Hongchao Peng; Mingzhuo Liu (2025). **The Impact of GenAI on Learning Outcomes: A Systematic Review and Meta-Analysis of Experimental Studies.** *Educational Research Review*, 48, p. 100714.
- [Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback): John Hattie; Helen Timperley (2007). **The Power of Feedback.** *Review of Educational Research*, 77(1), p. 81–112.
- [Haverkamp et al. (2023)](referencias.md#ref-haverkamp2023screens): Ymkje E. Haverkamp; Ivar Bråten; Natalia Latini; Ladislao Salmerón (2023). **Is It the Size, the Movement, or Both? Investigating Effects of Screen Size and Text Movement on Processing, Understanding, and Motivation When Students Read Informational Text.** *Reading and Writing*, 36(7), p. 1589–1608.
- [Hearst (1997)](referencias.md#ref-hearst1997texttiling): Marti A. Hearst (1997). **TextTiling: Segmenting Text into Multi-paragraph Subtopic Passages.** *Computational Linguistics*, 23(1), p. 33–64.
- [Henrie et al. (2015)](referencias.md#ref-henrie2015engagement): Curtis R. Henrie; Lisa R. Halverson; Charles R. Graham (2015). **Measuring Student Engagement in Technology-mediated Learning: A Review.** *Computers & Education*, 90, p. 36–53.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Howard-Jones (2014)](referencias.md#ref-howardjones2014neuroscience): Paul A. Howard-Jones (2014). **Neuroscience and Education: Myths and Messages.** *Nature Reviews Neuroscience*, 15(12), p. 817–824.
- [Ji et al. (2023)](referencias.md#ref-ji2023hallucination): Ziwei Ji; Nayeon Lee; Rita Frieske; Tiezheng Yu; Dan Su; Yan Xu; Etsuko Ishii; Ye Jin Bang; Andrea Madotto; Pascale Fung (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys*, 55(12), p. 1–38.
- [Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol): Angela C. Karich; Matthew K. Burns; Kathrin E. Maki (2014). **Updated Meta-Analysis of Learner Control Within Educational Technology.** *Review of Educational Research*, 84(3), p. 392–410.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Kintsch e van Dijk (1978)](referencias.md#ref-kintsch1978model): Walter Kintsch; Teun A. van Dijk (1978). **Toward a Model of Text Comprehension and Production.** *Psychological Review*, 85(5), p. 363–394.
- [Kirsh (2010)](referencias.md#ref-kirsh2010external): David Kirsh (2010). **Thinking with External Representations.** *AI & Society*, 25(4), p. 441–454.
- [Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic): David Kirsh; Paul Maglio (1994). **On Distinguishing Epistemic from Pragmatic Action.** *Cognitive Science*, 18(4), p. 513–549.
- [Knowles (1975)](referencias.md#ref-knowles1975selfdirected): Malcolm S. Knowles (1975). **Self-Directed Learning: A Guide for Learners and Teachers.** New York, Association Press.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [Lai et al. (2022)](referencias.md#ref-lai2022mobile): Yuzhi Lai; Nadira Saab; Wilfried Admiraal (2022). **Learning Strategies in Self-Directed Language Learning Using Mobile Technology in Higher Education: A Systematic Scoping Review.** *Education and Information Technologies*, 27, p. 7749–7780.
- [Leal et al. (2024)](referencias.md#ref-leal2024nilcmetrix): Sidney Evaldo Leal; Magali Sanches Duran; Carolina Evaristo Scarton; Nathan Siegle Hartmann; Sandra Maria Aluísio (2024). **NILC-Metrix: Assessing the Complexity of Written and Spoken Language in Brazilian Portuguese.** *Language Resources and Evaluation*, 58(1), p. 73–110.
- [Lee e See (2004)](referencias.md#ref-lee2004trust): John D. Lee; Katrina A. See (2004). **Trust in Automation: Designing for Appropriate Reliance.** *Human Factors*, 46(1), p. 50–80.
- [Lewis et al. (2020)](referencias.md#ref-lewis2020rag): Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474.
- [Li et al. (2021)](referencias.md#ref-li2021interaction): Jutao Li; Jiutai Song; Yanqun Huang; Yuzhen Wang; Jie Zhang (2021). **Effects of Different Interaction Modes on Fatigue and Reading Effectiveness with Mobile Phones.** *International Journal of Industrial Ergonomics*, 85, p. 103189.
- [Mann e Thompson (1988)](referencias.md#ref-mann1988rst): William C. Mann; Sandra A. Thompson (1988). **Rhetorical Structure Theory: Toward a Functional Theory of Text Organization.** *Text*, 8(3), p. 243–281.
- [Martinec e Salway (2005)](referencias.md#ref-martinec2005imagetext): Radan Martinec; Andrew Salway (2005). **A System for Image–Text Relations in New (and Old) Media.** *Visual Communication*, 4(3), p. 337–371.
- [Mayer (2009)](referencias.md#ref-mayer2009multimedia): Richard E. Mayer (2009). **Multimedia Learning.** 2. ed., Cambridge University Press.
- [Messick (1995)](referencias.md#ref-messick1995validity): Samuel Messick (1995). **Validity of Psychological Assessment: Validation of Inferences from Persons' Responses and Performances as Scientific Inquiry into Score Meaning.** *American Psychologist*, 50(9), p. 741–749.
- [Miller (1984)](referencias.md#ref-miller1984genre): Carolyn R. Miller (1984). **Genre as Social Action.** *Quarterly Journal of Speech*, 70(2), p. 151–167.
- [Mislevy et al. (2003)](referencias.md#ref-mislevy2003ecd): Robert J. Mislevy; Russell G. Almond; Janice F. Lukas (2003). **A Brief Introduction to Evidence-Centered Design.** Educational Testing Service, RR-03-16.
- [Monk et al. (2008)](referencias.md#ref-monk2008resumption): Christopher A. Monk; J. Gregory Trafton; Deborah A. Boehm-Davis (2008). **The Effect of Interruption Duration and Demand on Resuming Suspended Goals.** *Journal of Experimental Psychology: Applied*, 14(4), p. 299–313.
- [Morris et al. (2021)](referencias.md#ref-morris2021formative): Rebecca Morris; Thomas Perry; Lindsey Wardle (2021). **Formative Assessment and Feedback for Learning in Higher Education: A Systematic Review.** *Review of Education*, 9(3), p. e3292.
- [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer): Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756.
- [Panadero (2017)](referencias.md#ref-panadero2017selfregulated): Ernesto Panadero (2017). **A Review of Self-Regulated Learning: Six Models and Four Directions for Research.** *Frontiers in Psychology*, 8, p. 422.
- [Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation): Raja Parasuraman; Dietrich H. Manzey (2010). **Complacency and Bias in Human Use of Automation: An Attentional Integration.** *Human Factors*, 52(3), p. 381–410.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Parry et al. (2021)](referencias.md#ref-parry2021digitalmedia): Douglas A. Parry; Brittany I. Davidson; Craig J. R. Sewall; Jacob T. Fisher; Hannah Mieczkowski; Daniel S. Quintana (2021). **A Systematic Review and Meta-analysis of Discrepancies between Logged and Self-reported Digital Media Use.** *Nature Human Behaviour*, 5(11), p. 1535–1547.
- [Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation): Rebecca J. Passonneau; Diane J. Litman (1997). **Discourse Segmentation by Human and Automated Means.** *Computational Linguistics*, 23(1), p. 103–139.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Peters et al. (2024)](referencias.md#ref-peters2024scoping): Micah D. J. Peters; Christina Godfrey; Patricia McInerney; Zachary Munn; Andrea C. Tricco; Hanan Khalil (2024). **Scoping Reviews.** In: *JBI Manual for Evidence Synthesis*, JBI.
- [Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades): Salvador Pons Bordería; Margarita Borreguero Zuloaga (2024). **Unidades discursivas del texto escrito: revisión crítica del estado de la cuestión y directrices para una nueva propuesta.** *Círculo de Lingüística Aplicada a la Comunicación*, 99, p. 7–21.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Renkl (2002)](referencias.md#ref-renkl2002learning): Alexander Renkl (2002). **Worked-Out Examples: Instructional Explanations Support Learning by Self-Explanations.** *Learning and Instruction*, 12(5), p. 529–556.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Richter et al. (2016)](referencias.md#ref-richter2016signaling): Juliane Richter; Katharina Scheiter; Alexander Eitel (2016). **Signaling Text–Picture Relations in Multimedia Learning: A Comprehensive Meta-analysis.** *Educational Research Review*, 17, p. 19–36.
- [Ryan e Deci (2020)](referencias.md#ref-ryan2020motivation): Richard M. Ryan; Edward L. Deci (2020). **Intrinsic and Extrinsic Motivation from a Self-Determination Theory Perspective: Definitions, Theory, Practices, and Future Directions.** *Contemporary Educational Psychology*, 61, p. 101860.
- [Schneider et al. (2018)](referencias.md#ref-schneider2018signaling): Sascha Schneider; Maik Beege; Steve Nebel; Günter Daniel Rey (2018). **A Meta-analysis of How Signaling Affects Learning with Media.** *Educational Research Review*, 23, p. 1–24.
- [Schnotz e Bannert (2003)](referencias.md#ref-schnotz2003representations): Wolfgang Schnotz; Maria Bannert (2003). **Construction and Interference in Learning from Multiple Representation.** *Learning and Instruction*, 13(2), p. 141–156.
- [Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting): Neil Selwyn; Marita Ljungqvist; Anders Sonesson (2025). **When the Prompting Stops: Exploring Teachers' Work Around the Educational Frailties of Generative AI Tools.** *Learning, Media and Technology*, 50(3), p. 310–323.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.
- [Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes): Lukas K. Sotola; Marcus Credé (2021). **Regarding Class Quizzes: A Meta-Analytic Synthesis of Studies on the Relationship between Frequent Low-Stakes Testing and Class Performance.** *Educational Psychology Review*, 33(2), p. 407–426.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Tang e Hew (2017)](referencias.md#ref-tang2017twitter): Ying Tang; Khe Foon Hew (2017). **Using Twitter for Education: Beneficial or Simply a Waste of Time?** *Computers & Education*, 106, p. 97–118.
- [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved): Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848.
- [Tricco et al. (2018)](referencias.md#ref-tricco2018prismascr): Andrea C. Tricco; Erin Lillie; Wasifa Zarin; Kelly K. O'Brien; Heather Colquhoun; Danielle Levac; David Moher; Micah D. J. Peters; Tanya Horsley; Laura Weeks; Susanne Hempel; et al. (2018). **PRISMA Extension for Scoping Reviews (PRISMA-ScR): Checklist and Explanation.** *Annals of Internal Medicine*, 169(7), p. 467–473.
- [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered): Yi-Shan Tsai; Roberto Martinez-Maldonado (2022). **Human-Centered Approaches to Data-Informed Feedback.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 213–222.
- [Tynjälä (2008)](referencias.md#ref-tynjala2008workplace): Päivi Tynjälä (2008). **Perspectives into Learning at the Workplace.** *Educational Research Review*, 3(2), p. 130–154.
- [UNESCO (2015)](referencias.md#ref-unesco2015tvet): UNESCO (2015). **Recommendation concerning Technical and Vocational Education and Training (TVET).** UNESCO.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.
- [Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai): Michelle Vaccaro; Abdullah Almaatouq; Thomas Malone (2024). **When Combinations of Humans and AI Are Useful: A Systematic Review and Meta-Analysis.** *Nature Human Behaviour*, 8, p. 2293–2303.
- [van Merriënboer (2019)](referencias.md#ref-vanmerrienboer2019fourcomponent): Jeroen J. G. van Merriënboer (2019). **The Four-Component Instructional Design Model: An Overview of Its Main Design Principles.** School of Health Professions Education, Maastricht University.
- [Venable et al. (2016)](referencias.md#ref-venable2016feds): John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89.
- [Vygotsky (1978)](referencias.md#ref-vygotsky1978mind): Lev S. Vygotsky (1978). **Mind in Society: The Development of Higher Psychological Processes.** Harvard University Press.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.
- [Wenger (1998)](referencias.md#ref-wenger1998communities): Etienne Wenger (1998). **Communities of Practice: Learning, Meaning, and Identity.** Cambridge University Press.
- [Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations): Jörg Wittwer; Alexander Renkl (2008). **Why Instructional Explanations Often Do Not Work: A Framework for Understanding the Effectiveness of Instructional Explanations.** *Educational Psychologist*, 43(1), p. 49–64.
- [Wood (2021)](referencias.md#ref-wood2021dialogic): John Wood (2021). **A Dialogic Technology-Mediated Model of Feedback Uptake and Literacy.** *Assessment & Evaluation in Higher Education*, 46(8), p. 1173–1190.
- [Wood et al. (1976)](referencias.md#ref-wood1976tutoring): David Wood; Jerome S. Bruner; Gail Ross (1976). **The Role of Tutoring in Problem Solving.** *Journal of Child Psychology and Psychiatry*, 17(2), p. 89–100.
- [Yates e Orlikowski (1992)](referencias.md#ref-yates1992genres): Joanne Yates; Wanda J. Orlikowski (1992). **Genres of Organizational Communication: A Structurational Approach to Studying Communication and Media.** *Academy of Management Review*, 17(2), p. 299–326.
- [Zappavigna (2011)](referencias.md#ref-zappavigna2011ambient): Michele Zappavigna (2011). **Ambient Affiliation: A Linguistic Perspective on Twitter.** *New Media & Society*, 13(5), p. 788–806.
- [Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated): Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70.

<!-- referências locais: fim -->
