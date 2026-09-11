# Modelo didático do AraLearn

O AraLearn é um produto de software usado também como objeto de pesquisa em
design instrucional e tecnologia educacional. Seu modelo didático orienta a
criação de cursos com assistência de inteligência artificial (IA) e revisão
humana, destinados ao estudo autodidata no celular. Mesmo quando o estudo ocorre
em períodos breves, o curso precisa conservar explicações suficientes, relações
com as fontes e prática significativa.

## Problema educacional delimitado

Uma pessoa que começa a estudar média aritmética pode memorizar “some e divida”
e ainda não saber o que está dividindo, por que divide nem o que o resultado
informa. Se encontra apenas uma fórmula, precisa descobrir os pressupostos por
conta própria. Se recebe uma tela para cada palavra, perde a relação entre os
passos. O problema é construir essa compreensão numa sequência que também
possa ser interrompida e retomada.

Três riscos orientam o desenho:

- **condensação**: conceitos, pressupostos e siglas chegam juntos, antes que
  a pessoa tenha condições de relacioná-los;
- **fragmentação**: a divisão em unidades curtas separa elementos que só fazem
  sentido em conjunto;
- **atividade aparente**: tocar e avançar substitui a necessidade de explicar,
  distinguir casos, aplicar um procedimento ou recuperar conhecimento.

A resposta do AraLearn envolve planejar o que precisa ser compreendido,
desenvolver as relações necessárias e oferecer práticas coerentes com esse
objetivo. A extensão de cada etapa decorre desse trabalho. O uso no celular e a
atenção interrompida orientam a organização, sem diminuir o alcance do curso.

## Estrutura do percurso

Considere um curso ilustrativo sobre interpretação de dados. Uma lição pode
tratar de média e mediana; dentro dela, a primeira etapa ensina a interpretar a
média. Essa etapa reúne a situação inicial, a explicação do cálculo, um caso
resolvido e práticas que pedem calcular e interpretar. No AraLearn, esse
conjunto orientado por um objetivo delimitado é uma **microssequência**.

O percurso se estende por vários níveis, do curso à unidade de estudo. A tabela
registra a função que o AraLearn atribui a cada nível e aplica essa convenção ao
exemplo:

| Nível | Função | Exemplo no curso ilustrativo |
| --- | --- | --- |
| curso | delimitar propósito, público e escopo | interpretar conjuntos de dados do cotidiano |
| módulo | reunir uma região coerente do assunto | resumir e comparar conjuntos |
| lição | organizar uma progressão entre objetivos relacionados | compreender média e mediana |
| microssequência | desenvolver e praticar um objetivo delimitado | calcular a média e explicar seu significado |
| unidade de estudo | realizar uma função no percurso | comparar a média com os valores observados |

### Mapa curricular global

O mapa de módulos, lições e microssequências organiza a cobertura do assunto,
a ordem e as dependências: por exemplo, ordenar valores precisa anteceder o
primeiro cálculo de mediana.
A pessoa autora pode corrigir esse rascunho e aprovar as decisões que consegue
inspecionar. O planejamento pode avançar progressivamente: a explicação de uma
microssequência já existente pode ser desenvolvida enquanto o mapa ainda está
em rascunho. A aprovação do mapa completo antecede a organização das partes de
produção e das unidades que elas entregam. Essa aprovação delimita o percurso.
Explicações e unidades recebem revisão própria quando seu conteúdo estiver
disponível para inspeção.

### Por que a microssequência existe

Uma unidade isolada costuma ser pequena demais para situar, explicar,
exemplificar e praticar um conceito. Uma lição inteira pode reunir objetivos
demais para indicar precisamente o que estava em andamento. A microssequência
mantém juntas a intenção didática, as dependências, a explicação de base e as
unidades ordenadas que desenvolvem um objetivo. Seu tamanho varia com a tarefa,
o público e as dificuldades previstas.

A **carga cognitiva** diz respeito às demandas de processamento na memória de
trabalho, que mantém e manipula informação durante uma tarefa. Sua capacidade
limitada exige considerar o que precisa ser relacionado simultaneamente e o
que o estudante já conhece ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload);
[Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). A
**segmentação**, divisão da apresentação em etapas, possui resultados
condicionais na literatura; esses resultados não estabelecem uma quantidade
universal de telas ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).
A pesquisa sobre **microaprendizagem**, que estuda intervenções breves, reúne
formatos e contextos heterogêneos ([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).
A microssequência é a solução de organização adotada pelo AraLearn; sua
utilidade precisa ser examinada nos cursos e públicos em que for usada.

### Parte como coordenação operacional

Depois da aprovação do mapa, a autoria pode reunir microssequências em uma
**parte**, conjunto de trabalho que será produzido e revisado. Partes sucessivas
podem formar um **lote**. Essa divisão coordena o trabalho segundo as relações
que precisam permanecer juntas e a quantidade de material que a pessoa consegue
inspecionar. Partes e lotes ficam fora da hierarquia curricular. O fluxo está em
[Autoria contextual](autoria-contextual.md).

## Diagnóstico contextual antes da construção

O desenho começa pelo que se sabe do público e do propósito do curso. No
exemplo de média, saber somar e dividir pode ser um pré-requisito declarado.
Se o público ainda não domina essas operações, o percurso precisa ensiná-las
ou oferecer um caminho explícito até elas. Presumir que algo é “básico” não
resolve a necessidade.

A autoria consulta o pedido, as fontes e as decisões existentes antes de
perguntar. Uma informação adicional é necessária quando mudaria o objetivo,
a cobertura ou uma escolha de explicação, representação ou prática. A síntese
é apresentada à pessoa autora para confirmação. Trata-se de uma descrição do
público planejado, distinta de uma avaliação do conhecimento de cada estudante.

Uma **condição contextual**, como o idioma ou o acesso a laboratório, ajuda a
decidir o que fazer. A **decisão local** é a resposta instrucional a essa
condição: pode introduzir um pré-requisito, escolher um exemplo ou reconhecer a
falta de um meio indispensável. A mesma condição pode levar a escolhas
diferentes em tarefas distintas.

O **efeito de reversão da especialização** descreve situações em que uma forma
de apoio útil a iniciantes perde utilidade ou se torna desfavorável para quem
já possui mais conhecimento ([Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal)).
Em análise de circuitos, a ordem entre exemplo e problema produziu resultados
diferentes conforme o conhecimento prévio ([Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal)).
Essa relação justifica examinar público e tarefa; o aplicativo não deduz o
conhecimento individual a partir do conteúdo do curso.

Público, escopo e resultados pretendidos ficam no plano instrucional. As
orientações de escrita formam a direção editorial. Os parâmetros registram
escolhas ajustáveis, e a política de componentes delimita as representações
permitidas. O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
explica como essas camadas participam da produção.

## Análise instrucional e parâmetros locais

Para interpretar a média, o estudante precisa relacionar o total observado,
a quantidade de observações e a distribuição desse total. Cada conhecimento
que exige acompanhamento próprio pode formar uma **unidade de análise
instrucional**: um recorte planejado de ideia, relação, condição ou procedimento.
Aprender os nomes “total” e “quantidade” não garante compreender a relação entre
eles. Essa relação pode exigir desenvolvimento próprio.

O recorte depende do público e da tarefa. Ele não corresponde automaticamente
a uma palavra nem a uma entidade comprovadamente presente na mente. A distinção
entre conhecimento inferido e eventos observáveis é discutida por
[Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli). O
[protocolo de unidade de análise](desenho-instrucional-parametrizado.md#protocolo-de-unidade-de-análise)
estabelece como registrar e justificar esses recortes.

Um **requisito de evidência** declara o que uma prática precisa solicitar para
examinar o objetivo. Calcular a média de três valores e explicar por que ela
pode diferir de todos eles examinam aspectos diferentes. O plano relaciona cada
recorte às unidades que o introduzem, utilizam ou retomam e às práticas
pertinentes. A existência da atividade registra uma oportunidade oferecida;
o desempenho depende do que o estudante fizer.

Os parâmetros tornam explícitas escolhas desse desenho. Um teto de novidades
orienta quantos recortes serão introduzidos numa unidade expositiva, que
desenvolve conteúdo antes de solicitar uma resposta. Outros parâmetros orientam
como explicar e praticar esses recortes. Alvos de palavras cuidam da extensão
editorial, enquanto as preferências do processo organizam a conversa e os
conjuntos de produção. O
[catálogo das doze decisões](desenho-instrucional-parametrizado.md#catálogo-corrente)
conserva os valores e escopos de cada uma.

No modo automático, o assistente escolhe valores conforme o contexto e registra
os motivos. Uma decisão explicitamente fixada pela pessoa autora ou por uma
condição de pesquisa prevalece sobre a escolha automática. Por exemplo, o curso
pode exigir uma forma de explicação com exemplo, enquanto uma unidade recebe
um alvo de palavras próprio. São parâmetros diferentes: escolher a extensão
local não retira a exigência de exemplo. Quando há escolhas distintas para o
mesmo parâmetro, a [resolução dos parâmetros](parametros-de-autoria.md) determina
a prioridade conforme origem e alcance. Esses controles orientam o material
produzido, sem constituir um perfil inferido do estudante.

A **configuração aplicada** conserva as escolhas usadas na produção de uma
unidade. Mudar a intenção atual não reescreve essa produção. A comparação entre
intenção e aplicação ajuda a localizar o que precisa ser revisto. O software
confere referências e contagens; a pessoa examina se a relação foi explicada,
se a fonte a sustenta e se as práticas apresentam variação substantiva.

Um recorte pode ser desenvolvido em várias unidades: sua introdução é contada
uma vez e as continuações o utilizam ou retomam. Uma unidade também pode reunir
recortes cuja relação justifique a composição, respeitado o teto de novidades.
Durante a produção parcial, práticas previstas podem continuar ausentes; ao
concluir o lote, é exigida a cobertura estabelecida para ele. Os registros e as
regras dessa conferência estão em
[Contexto efetivo e aplicação corrente](desenho-instrucional-parametrizado.md#contexto-efetivo-e-aplicação-corrente).

## Profundidade sem condensação

A **explicação** é o texto-base autorado da microssequência. Ela torna explícitos
os pressupostos necessários, desenvolve conceitos e relações por meio de
exemplos e delimita o conteúdo com suas fontes. Todas as
unidades desse conjunto dão acesso ao mesmo conteúdo pelo comando
**Explicação**. Abrir esse apoio consulta o que foi salvo; não produz uma nova
resposta de IA. Sua autoria, fontes e revisão são descritas em
[Explicação e revisão humana](explicacao-e-revisao-humana.md).

No exemplo da média, a explicação pode desenvolver por que se divide o total
pela quantidade de observações e em que situações a média ajuda a resumir o
conjunto. As unidades do percurso ensinam essas relações e propõem operações
sobre elas. A base compartilhada permite aprofundar ou recuperar pressupostos
sem repetir todo o texto em cada etapa. Cada unidade continua contendo uma
relação inteligível ou uma tarefa com os dados necessários para resolvê-la.

A suficiência para iniciantes é examinada no conjunto do percurso e da
explicação acessível. Essa base é diferente das **formas de explicação**, como
definição, mecanismo ou contraste, exigidas pelos parâmetros das unidades.
Uma forma desenvolvida apenas no texto-base não satisfaz uma exigência de
apresentá-la nas unidades. A distinção permite inspecionar o que foi ensinado
em cada lugar.

### Explicação progressiva

Uma explicação progride quando torna compreensível o próximo passo. Para três
tempos de espera de 2, 4 e 9 minutos, pode-se começar pelo total: 15 minutos
reunidos entre três observações. Distribuir esse total igualmente produz
5 minutos por observação. A divisão ganha sentido antes da fórmula; depois,
a notação pode expressar a relação já compreendida.

No planejamento, a autoria identifica o problema inicial, o que ainda precisa
ser desenvolvido e a ordem em que exemplos e notações se tornam compreensíveis.
Tabelas, fórmulas e diagramas entram quando seus elementos já podem ser
interpretados. A busca por informação e sua
integração também participam das demandas da tarefa
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload);
[Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)).

Se uma unidade acumula objetivos independentes, sua distribuição deve ser
revista. Se uma relação só faz sentido em conjunto, a divisão precisa
preservá-la. Acrescentar telas por si só não melhora a explicação: pode aumentar
repetição e navegação. O número de unidades decorre da progressão necessária,
sem uma cota universal apoiada pela literatura de segmentação
([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

<a id="microteoria"></a>

### Suficiência teórica no percurso

A prática deve encontrar base no que foi ensinado ou explicitamente assumido
como pré-requisito. No exemplo, pedir que o estudante julgue a influência de
um valor extremo exige antes desenvolver a relação entre esse valor, o total
e a média. Saber executar a divisão não basta.

A revisão examina se o estudante encontra o significado dos conceitos e das
notações, as relações necessárias e um exemplo que torne claros os limites
relevantes à tarefa. Uma lacuna nessa base exige desenvolvimento; alterar o
tamanho das unidades sem tratar a relação ausente apenas redistribui a lacuna.

## Apoio inicial e retirada gradual

Um **exemplo resolvido** mostra o procedimento e justifica suas decisões.
Depois de acompanhar o cálculo e a interpretação da média, o estudante pode
completar um passo num caso novo e, mais adiante, resolver e explicar outro
caso com menos ajuda. A retirada de apoio transfere progressivamente decisões
para quem estuda.

Exemplos resolvidos e retirada gradual de passos têm apoio em estudos
situados, especialmente com novatos ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples);
[Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). As explicações
instrucionais podem apoiar as **autoexplicações**, pelas quais o estudante
procura compreender e justificar o que ocorre no exemplo
([Renkl (2002)](referencias.md#ref-renkl2002learning)). A sequência precisa
considerar a experiência e a operação; nem toda tarefa exige o mesmo apoio.

É possível retirar dicas, passos resolvidos ou uma estrutura parcialmente
preenchida. Os dados particulares continuam presentes: valores, coordenadas,
código-base ou contexto necessário. Retira-se ajuda para decidir, preservando
o enunciado necessário ao raciocínio. Apoio mantido por tempo excessivo pode
reduzir a oportunidade de agir; retirada precoce pode devolver o estudante a
uma busca sem orientação. A revisão examina onde cada dificuldade aparece.

## Prática orientada pela operação-alvo da tarefa

Uma **operação-alvo da tarefa** é o que a pessoa precisa fazer com o conteúdo.
Escolher a média entre alternativas, calculá-la e explicar seu significado
solicitam operações diferentes. O gesto de tocar ou digitar é apenas o meio
pelo qual uma resposta pode ser registrada.

A escolha do formato segue essa demanda. Alternativas permitem discriminar
opções; uma lacuna pede completar algo no próprio texto, tabela, fórmula ou
diagrama. Digitação pode solicitar uma resposta localizada; resposta aberta
pode pedir justificativa ou previsão. Ordenação é pertinente quando reconstruir
a sequência faz parte do conhecimento. Correspondências simples usam lacunas
independentes nos campos em que cada relação já é lida, sem outra modalidade
autônoma de associação. Os
[componentes didáticos](componentes-didaticos.md#5-composição-da-unidade-de-estudo)
explicam essas possibilidades.

Na **prática de recuperação**, a pessoa tenta trazer à memória conhecimento
estudado. Seus benefícios foram observados em diferentes contextos, com
variação entre tarefas e resultados ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval);
[Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval);
[Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). Copiar uma
resposta visível não produz a mesma demanda; selecionar uma opção tampouco
certifica, por si só, que houve recuperação.

Cada prática declara o que pretende examinar e qual conhecimento anterior a
torna respondível. A solicitação precede a solução, e a revelação depende de
ação explícita. Variar apenas palavras ou aparência pode conservar a mesma
tarefa; uma variação substantiva muda um aspecto relevante do caso, do contexto,
da representação ou do apoio. Quando **transferência**, isto é, uso em tarefas
novas, é um objetivo, precisam existir oportunidades e avaliação compatíveis:
o efeito não se estende automaticamente a qualquer tarefa
([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

## Distribuição e intercalação

Na **prática distribuída**, as oportunidades se separam no tempo. Retomar a
interpretação da média em outra sessão permite examiná-la fora da proximidade
imediata com a explicação. O intervalo adequado depende de quanto tempo se
pretende conservar o conhecimento e de outras condições
([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed);
[Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing)).

Na **intercalação**, alternam-se categorias ou procedimentos relacionados.
Depois de aprender média e mediana, por exemplo, o estudante pode precisar
escolher qual usar antes de calcular. Reconhecer a operação pertinente passa
a integrar a tarefa. Os efeitos dessa organização variam, entre outros fatores,
com a similaridade entre categorias ([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving);
[Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).

O planejamento registra dependências e retomadas. A alternância precisa ser
intencional e preservar a base de cada operação; misturar conteúdos ao acaso
não fornece essa progressão. Intervalos entre unidades na sequência também
precisam ser distinguidos do tempo efetivamente decorrido entre sessões.

## Retorno acionável e estado não punitivo

Se a resposta à média do exemplo for 15, dizer apenas “incorreto” pouco ajuda.
Um retorno pertinente pode mostrar que 15 é o total dos tempos e recuperar a
pergunta sobre quanto caberia a cada uma das três observações. O retorno liga
o erro à regra ou relação que permite reconsiderá-lo. Em atividades de escolha,
as alternativas incorretas, chamadas **distratores**, podem representar esses
erros plausíveis.

O efeito do retorno depende de seu foco, do conteúdo e da oportunidade de agir
([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback);
[Shute (2008)](referencias.md#ref-shute2008feedback);
[Morris et al. (2021)](referencias.md#ref-morris2021formative)). Saber
interpretá-lo, julgá-lo e usá-lo é parte do letramento para o uso do retorno
([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy);
[Wood (2021)](referencias.md#ref-wood2021dialogic)).

No AraLearn, o controle principal confirma a resposta e, no acionamento
seguinte, avança. A pessoa pode limpar, tentar novamente e revelar a solução
por ação explícita. Quantidade de tentativas, ajuda, tempo e respostas reveladas
não são convertidos em nota ou classificação. O
[estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) conserva o
necessário à continuidade, como o ponto de retomada e as marcas para rever.

Avaliações frequentes de baixa consequência apresentam resultados médios
positivos em determinados contextos, com heterogeneidade
([Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes)). A opção do
AraLearn por prática sem nota é uma decisão própria; seu efeito sobre ansiedade,
participação ou aprendizagem depende de investigação no uso do aplicativo.

## Representações como parte do conteúdo

Uma tabela ajuda a comparar os tempos observados; um gráfico pode tornar
perceptível sua distribuição; uma fórmula explicita a relação do cálculo.
A escolha depende do que o estudante precisa interpretar ou fazer. Cada forma
introduz também uma demanda de leitura: eixos, símbolos e relações devem ser
ensinados quando ainda não forem conhecidos.

Representações externas podem complementar informação, restringir
interpretações ou apoiar novas relações. Coordená-las exige trabalho próprio
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). A **coerência** orienta
retirar informação sem função; a **contiguidade**, aproximar elementos que
precisam ser integrados ([Mayer (2009)](referencias.md#ref-mayer2009multimedia);
[Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

Os componentes conservam estruturas pertinentes ao domínio, como a posição em
uma matriz, as conexões em um grafo e o alinhamento entre forma e significado
numa glosa interlinear. Uma prática pode solicitar resposta
no próprio lugar em que essa relação é interpretada. A
[fundamentação pedagógica dos componentes](fundamentacao-pedagogica-dos-resources.md)
desenvolve os critérios de escolha, composição e acessibilidade; o
[contrato dos componentes](componentes-didaticos.md) descreve sua apresentação
e os limites de edição da estrutura.

## Continuidade móvel e retomada

Depois de uma interrupção, a pessoa pode precisar reconstruir o objetivo
suspenso e o estado da tarefa ([Monk et al. (2008)](referencias.md#ref-monk2008resumption);
[Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Conservar
o ponto do percurso e oferecer acesso à explicação ajuda a organizar o retorno
pretendido pelo projeto.

O estudo usa uma cópia local do conteúdo sincronizado e do estado pessoal.
Escolhas de tema, resposta em elaboração, confirmação e avanço ocorrem no
dispositivo. A [persistência local](persistencia-relacional.md) conserva os
dados disponíveis para que estudar não dependa de uma resposta imediata do
servidor. As representações precisam continuar legíveis em telas estreitas;
objetos bidimensionais podem usar rolagem própria sem perder sua estrutura.

A diversidade de interfaces de aprendizagem móvel desaconselha pressupor uma
disposição universal ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).
No AraLearn, o funcionamento do conteúdo disponível sem conexão é verificável
no software. O custo de retomar, a continuidade de uso e os efeitos educacionais
precisam ser examinados com pessoas e tarefas.

## Autonomia com suporte e responsabilidade humana

Na autoria assistida, a pessoa examina o curso e as evidências que o sustentam,
pede ou faz correções e declara a revisão do material inspecionado. O assistente
propõe e transforma conteúdo no escopo autorizado. Ele trabalha por uma conversa
externa conectada às tarefas do AraLearn; os cursos continuam disponíveis para
inspeção na aplicação. Os guias de [MCP](autoria-mcp.md) e
[Actions/OpenAPI](autoria-actions.md) descrevem os meios técnicos dessa
comunicação.

**Autorregulação** envolve planejar o estudo, acompanhar sua realização e
refletir sobre ajustes ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated);
[Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). **Agência** é
a capacidade de agir intencionalmente e influir no próprio percurso
([Bandura (2001)](referencias.md#ref-bandura2001agency)). Oferecer controles é
uma condição de uso a examinar, não uma medida desses fenômenos: os resultados
sobre controle do aprendiz em tecnologia educacional são heterogêneos
([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)). Diretrizes
de interação entre pessoas e IA recomendam comunicar capacidades e limites,
permitir correção e sustentar o controle
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).

No estudo, a pessoa pode marcar conteúdo para rever e registrar
[observações situadas](observacoes-pedagogicas.md), anotações ligadas à
explicação ou unidade que motivou a dúvida. Na autoria, a revisão da explicação
é independente da revisão de cada unidade. Abrir, salvar ou editar não declara
revisão automaticamente. O [registro de revisão humana](explicacao-e-revisao-humana.md#revisão-independente-por-objeto)
identifica o conteúdo examinado e sinaliza mudanças posteriores.

As [fontes e citações](fontes-e-citacoes.md) permitem confrontar um trecho com
a referência e a localização que o sustentam. A **proveniência** registra a
origem do conteúdo e das intervenções. Ter uma fonte vinculada, uma intervenção
humana registrada ou uma declaração de revisão responde a perguntas diferentes.
Uma avaliação da autoria deve investigar se a pessoa compreende essas
diferenças e consegue tomar decisões informadas, além de observar a presença
dos controles.

## Critérios de qualidade de uma microssequência

A inspeção percorre o objetivo e as unidades na ordem em que serão estudados.
Quatro perguntas organizam esse trabalho:

| Pergunta de revisão | O que examinar |
| --- | --- |
| A pessoa encontra base para compreender? | problema inicial, pré-requisitos, termos apresentados no momento necessário e teoria suficiente para as práticas |
| A sequência conserva as relações? | ordem, transições, exemplos, quantidade de novidades e conhecimentos usados conjuntamente; ausência de compressão ou divisão artificial |
| A prática solicita o que se pretende ensinar? | operação, dados particulares disponíveis, variação substantiva, apoio, retorno e retomadas pertinentes |
| O conteúdo pode ser inspecionado e corrigido? | fontes, convenções das representações, componentes permitidos, limites assumidos e alcance da revisão humana |

As contagens localizam onde os recortes foram tratados, e a lista de formatos
mostra como o material foi apresentado. A carga cognitiva e a diversidade real
das práticas exigem examinar o conteúdo e a tarefa. O
[ciclo de revisão](auditoria-de-conformidade-instrucional.md) relaciona os
apontamentos às correções e à nova inspeção.

## Exemplo de progressão

No curso ilustrativo de média, a microssequência pode começar pelos três tempos
de espera, reunir o total e mostrar a divisão em partes iguais. Depois de
relacionar esse raciocínio à fórmula, pede-se completar um cálculo novo e
interpretar o resultado. Uma atividade seguinte pode contrastar média e valor
observado: a média de 5 minutos não afirma que alguma pessoa esperou exatamente
5 minutos. Retomar a relação em outra sessão permite estudá-la fora da sequência
imediata do exemplo.

A comparação com mediana pertence a uma etapa em que ambos os conceitos já
estejam disponíveis. A quantidade de unidades decorre das explicações e
práticas necessárias ao público, por isso outros cursos podem seguir
progressões diferentes.

## Relações com os demais documentos

<a id="finalidade-e-estatuto-deste-documento"></a>

A literatura fundamenta conceitos e relações que orientam o desenho. A inspeção
do software verifica comportamentos implementados. Investigar compreensão,
retenção ou transferência exige um protocolo e observações de uso compatíveis
com a pergunta. As decisões deste modelo são examináveis por esses meios:

- a [Revisão de literatura](revisao-de-literatura.md) desenvolve a evidência
  externa e seus limites;
- o [Quadro teórico](quadro-teorico.md) relaciona decisões a proposições de
  pesquisa, e o [Glossário de construtos](glossario-construtos.md) define os
  conceitos usados para interpretá-las;
- a [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
  liga decisões, implementação e avaliação;
- o [Protocolo de avaliação](protocolo-avaliacao-artefato.md) apresenta métodos
  para examinar as hipóteses com participantes e tarefas.

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui): Masyura Ahmad Faudzi; Zaihisma Che Cob; Ridha Omar; Sharul Azim Sharudin; Masitah Ghazali (2023). **Investigating the User Interface Design Frameworks of Current Mobile Learning Applications: A Systematic Review.** *Education Sciences*, 13(1), p. 94.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Bandura (2001)](referencias.md#ref-bandura2001agency): Albert Bandura (2001). **Social Cognitive Theory: An Agentic Perspective.** *Annual Review of Psychology*, 52, p. 1–26.
- [Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving): Markus Brunmair; Tobias Richter (2019). **Similarity Matters: A Meta-Analysis of Interleaved Learning and Its Moderators.** *Psychological Bulletin*, 145(11), p. 1029–1052.
- [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy): David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325.
- [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing): Shana K. Carpenter; Steven C. Pan; Andrew C. Butler (2022). **The Science of Effective Learning with Spacing and Retrieval Practice.** *Nature Reviews Psychology*, 1, p. 496–511.
- [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed): Nicholas J. Cepeda; Harold Pashler; Edward Vul; John T. Wixted; Doug Rohrer (2006). **Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.** *Psychological Bulletin*, 132(3), p. 354–380.
- [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing): Nicholas J. Cepeda; Edward Vul; Doug Rohrer; John T. Wixted; Harold Pashler (2008). **Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention.** *Psychological Science*, 19(11), p. 1095–1102.
- [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning): Jennie Chang De Gagne; Hyeyoung Kate Park; Katherine Hall; Amanda Woodward; Sandra Yamane; Sang Suk Kim (2019). **Microlearning in Health Professions Education: Scoping Review.** *JMIR Medical Education*, 5(2), p. e13997.
- [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption): Cyrus K. Foroughi; Nicole E. Werner; Elizabeth T. Nelson; Deborah A. Boehm-Davis (2016). **Individual Differences in Working-Memory Capacity and Task Resumption Following Interruptions.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 42(9), p. 1480–1488.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback): John Hattie; Helen Timperley (2007). **The Power of Feedback.** *Review of Educational Research*, 77(1), p. 81–112.
- [Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal): Slava Kalyuga (2007). **Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction.** *Educational Psychology Review*, 19(4), p. 509–539.
- [Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol): Angela C. Karich; Matthew K. Burns; Kathrin E. Maki (2014). **Updated Meta-Analysis of Learner Control Within Educational Technology.** *Review of Educational Research*, 84(3), p. 392–410.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli): Kenneth R. Koedinger; Albert T. Corbett; Charles Perfetti (2012). **The Knowledge-Learning-Instruction Framework: Bridging the Science-Practice Chasm to Enhance Robust Student Learning.** *Cognitive Science*, 36(5), p. 757–798.
- [Mayer (2009)](referencias.md#ref-mayer2009multimedia): Richard E. Mayer (2009). **Multimedia Learning.** 2. ed., Cambridge University Press.
- [Monk et al. (2008)](referencias.md#ref-monk2008resumption): Christopher A. Monk; J. Gregory Trafton; Deborah A. Boehm-Davis (2008). **The Effect of Interruption Duration and Demand on Resuming Suspended Goals.** *Journal of Experimental Psychology: Applied*, 14(4), p. 299–313.
- [Morris et al. (2021)](referencias.md#ref-morris2021formative): Rebecca Morris; Thomas Perry; Lindsey Wardle (2021). **Formative Assessment and Feedback for Learning in Higher Education: A Systematic Review.** *Review of Education*, 9(3), p. e3292.
- [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer): Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756.
- [Panadero (2017)](referencias.md#ref-panadero2017selfregulated): Ernesto Panadero (2017). **A Review of Self-Regulated Learning: Six Models and Four Directions for Research.** *Frontiers in Psychology*, 8, p. 422.
- [Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal): Jana Reisslein; Robert K. Atkinson; Patrick Seeling; Martin Reisslein (2006). **Encountering the Expertise Reversal Effect with a Computer-Based Environment on Electrical Circuit Analysis.** *Learning and Instruction*, 16(2), p. 92–103.
- [Renkl (2002)](referencias.md#ref-renkl2002learning): Alexander Renkl (2002). **Worked-Out Examples: Instructional Explanations Support Learning by Self-Explanations.** *Learning and Instruction*, 12(5), p. 529–556.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.
- [Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes): Lukas K. Sotola; Marcus Credé (2021). **Regarding Class Quizzes: A Meta-Analytic Synthesis of Studies on the Relationship between Frequent Low-Stakes Testing and Class Performance.** *Educational Psychology Review*, 33(2), p. 407–426.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved): Kelli Taylor; Doug Rohrer (2010). **The Effects of Interleaved Practice.** *Applied Cognitive Psychology*, 24(6), p. 837–848.
- [Wood (2021)](referencias.md#ref-wood2021dialogic): John Wood (2021). **A Dialogic Technology-Mediated Model of Feedback Uptake and Literacy.** *Assessment & Evaluation in Higher Education*, 46(8), p. 1173–1190.
- [Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated): Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70.

<!-- referências locais: fim -->
