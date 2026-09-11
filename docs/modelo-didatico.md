# Modelo didático do AraLearn

O AraLearn é um artefato técnico de pesquisa em design instrucional e tecnologia
educacional. Seu modelo didático orienta a criação de cursos com assistência de
inteligência artificial (IA), inspeção e revisão humanas, para estudo autodidata
no celular. O curso precisa conservar explicações, relações com as fontes e
prática significativa mesmo quando o estudo ocorre em períodos breves.

## Problema educacional delimitado

Para estudar, a pessoa precisa situar o assunto e compreender
como seus conceitos se relacionam, qual operação deve aprender, como praticá-la
e como retomar o percurso após uma interrupção. Esse problema é particularmente
visível quando o estudo ocorre no celular, em períodos fragmentados e com
conectividade variável.

Três riscos orientam o desenho:

1. **condensação**: vários conceitos, pressupostos e siglas aparecem juntos,
   sem progressão suficiente para quem encontra o assunto pela primeira vez;
2. **fragmentação**: o conteúdo é dividido em unidades curtas, mas perde suas
   relações, sua profundidade e seu propósito;
3. **atividade aparente**: o estudante toca, avança e conclui unidades sem precisar
   explicar, discriminar, aplicar ou recuperar o que estudou.

O modelo responde a esses riscos com progressão explícita, teoria suficiente,
prática pertinente e retorno que ajude a compreender e corrigir o erro.
Representações adequadas e continuidade entre sessões completam essa orientação. Cada curso exige planejamento e revisão próprios.

## Estrutura do percurso

O curso é organizado nos seguintes níveis. Essa divisão é uma convenção do
AraLearn para planejar, produzir e retomar o estudo:

| Nível | Função principal | Pergunta que responde |
| --- | --- | --- |
| curso | delimitar propósito, público e escopo geral | o que será aprendido e para quê? |
| módulo | reunir uma região coerente do domínio | que parte ampla do assunto está em foco? |
| lição | organizar uma progressão local | que sequência de objetivos será percorrida? |
| microssequência | ensinar e verificar um objetivo delimitado | qual transformação de conhecimento ou desempenho se pretende agora? |
| unidade de estudo | realizar uma função didática específica | o que a pessoa precisa compreender ou fazer neste momento? |

### Mapa curricular global

Antes de produzir o conteúdo, a autoria apresenta o mapa completo de módulos,
lições e microssequências, com progressão, dependências importantes e cobertura
do escopo. O mapa pode ser revisto como rascunho. A aprovação confirma somente
as decisões disponíveis para inspeção e não alcança unidades de estudo futuras.

### Por que a microssequência existe

Uma unidade isolada costuma ser pequena demais para situar, explicar,
exemplificar e praticar um conceito complexo. Uma lição inteira pode conter
objetivos demais para delimitar o que estava em andamento e permitir uma
retomada precisa depois de interrupção.

Seria possível usar somente unidades e lições, ou
fixar blocos por duração e quantidade. A unidade intermediária, porém, precisa
preservar um objetivo, seus pré-requisitos, a teoria que o sustenta, as práticas
que o verificam e a ligação com o percurso, sem impor duração universal.

A **microssequência didática** é a unidade de progressão situada
entre unidade de estudo e lição. Ela contém objetivo, papel no percurso,
dependências, conceitos cobertos, operações verificadas e unidades ordenadas.

A **carga cognitiva** diz respeito às demandas de processamento na memória
de trabalho, que mantém e manipula informação durante a tarefa. Sua capacidade
limitada exige considerar como o desenho instrucional apresenta as informações ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). Dividir a apresentação em segmentos pode ajudar em certas condições, mas a
evidência sobre **segmentação** não sustenta uma regra universal de tamanho ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)). A literatura
de **microaprendizagem**, que investiga intervenções em recortes breves, também
reúne formatos e contextos heterogêneos
([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).

A autoria declara a função e as dependências da
microssequência antes de produzir as unidades. Sua extensão varia conforme a
complexidade, os conhecimentos prévios presumidos, os erros previsíveis e a
evidência de aprendizagem requerida.

A microssequência mantém juntas a intenção didática, as unidades ordenadas e
a base explicativa consultada durante o estudo. Essa relação orienta produção,
revisão e retomada.

A coerência e a utilidade dessa divisão precisam ser avaliadas em cursos,
públicos e domínios concretos.

### Parte como coordenação operacional

Depois da aprovação do mapa, a autoria pode reunir microssequências em partes
para delimitar o que será produzido e revisado em cada etapa. A divisão
considera quais assuntos precisam permanecer juntos, suas dependências e a
quantidade de trabalho que a pessoa autora consegue inspecionar.

Uma **parte** agrupa o trabalho de produção e revisão; não acrescenta nível ao
currículo. Seu tamanho e as pausas entre lotes são ajustáveis conforme a
complexidade do material e a disponibilidade da pessoa autora. As regras de
planejamento e produção estão em [Autoria contextual](autoria-contextual.md).

## Diagnóstico contextual antes da construção

Um pedido de autoria não contém necessariamente tudo o que muda o
desenho do curso. Ao mesmo tempo, transformar a abertura em questionário fixo
produz perguntas irrelevantes, repete informações já disponíveis e pode
confundir uma condição do contexto com uma regra pedagógica universal.

A autoria consulta primeiro o pedido, as fontes, o curso e as decisões já
registradas. A análise relaciona as dificuldades previstas a escolhas de
sequência, explicação, representação e prática. Uma pergunta adicional é
necessária quando a informação ausente ou contraditória mudaria uma dessas
decisões, o objetivo ou o escopo. Essa síntese é apresentada à pessoa autora
para confirmação ou correção; descreve o contexto planejado, sem medir o
conhecimento efetivo dos estudantes.

Uma **condição contextual** descreve o cenário, por exemplo, conhecimento prévio
que pode ser presumido, convenção disciplinar, dispositivo, idioma ou acesso a
laboratório. Uma **decisão local** define o que fazer numa microssequência, como
introduzir um pré-requisito, usar um exemplo, escolher uma representação,
acrescentar prática ou declarar que um meio indispensável não está disponível.
A mesma condição pode exigir respostas diferentes conforme a operação e o
conteúdo. No modo automático, o assistente calibra
cada microssequência ou unidade segundo sua função, sem aplicar um conjunto
fixo de valores ao curso inteiro. Uma condição deliberadamente fixada pelo pesquisador prevalece.
Objetivos, cobertura e regras do percurso permanecem; configuração não substitui
decisões locais.

A utilidade de orientação, exemplos e resolução de problemas
pode mudar com o conhecimento prévio e a tarefa, fenômeno discutido como
efeito de reversão da especialização (*expertise reversal*)
([Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal)). Em análise
de circuitos, por exemplo, a ordem entre exemplo e problema
produziu resultados diferentes conforme o conhecimento prévio
([Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal)). Esses achados sustentam a necessidade de tratar a escolha como
contextual; não fornecem um mecanismo para inferir automaticamente o que cada
pessoa sabe nem demonstram a eficácia do produto.

Público, escopo, resultados pretendidos e conhecimentos necessários ficam no
plano instrucional. A direção editorial registra orientações de escrita; os
parâmetros definem escolhas locais, e a política de componentes delimita as
representações permitidas. A pessoa autora pode inspecionar a origem de cada
configuração e compará-la com a que foi aplicada ao material salvo. O
[desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
explica essas camadas e sua precedência.

A pessoa autora confirma o público, julga as hipóteses e examina a adequação
disciplinar. A análise do material pode localizar lacunas e inconsistências;
conhecer o domínio efetivo de cada estudante exige outra forma de avaliação.

## Análise instrucional e parâmetros locais

Para construir uma sequência, a autoria identifica o que precisa ser ensinado
e o que o estudante deverá conseguir fazer. Uma **unidade de análise
instrucional** é um recorte de conhecimento que vale acompanhar separadamente:
uma ideia, relação, condição ou procedimento necessário à tarefa. Por exemplo,
conhecer os nomes de dois equipamentos não implica compreender como se comunicam;
essa relação pode precisar de desenvolvimento próprio.

O recorte depende do público, do objetivo e do repertório pressuposto. Ele não
corresponde automaticamente a uma palavra ou a um componente de conhecimento
validado. A distinção entre conhecimento inferido e eventos observáveis é
tratada por [Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli).
O [protocolo de unidade de análise](desenho-instrucional-parametrizado.md#protocolo-de-unidade-de-análise)
define os critérios de recorte e de registro.

O plano identifica onde cada recorte será introduzido, utilizado ou retomado.
Um **requisito de evidência** explicita a operação e as condições de uma prática
que servirão para examinar o objetivo pretendido. Solicitar a escolha de uma
alternativa e solicitar uma justificativa livre, por exemplo, oferecem evidências
diferentes. A quantidade de oportunidades registra o desenho oferecido, sem
comprovar desempenho ou aprendizagem.

O catálogo atual reúne doze decisões sobre explicações, prática, extensão e
estilo, conversa e produção. Entre elas estão o teto de novas unidades de análise,
as formas de explicação, a quantidade e a variação das práticas e sua posição
na sequência. Os alvos de palavras orientam a distribuição editorial; as
preferências de partes, lotes e pausas organizam o trabalho. A
[tabela do catálogo](desenho-instrucional-parametrizado.md#catálogo-corrente)
descreve cada decisão, seus valores e escopos.

Uma escolha automática é calibrada conforme o contexto. Uma atribuição
explícita da pessoa autora ou de uma condição de pesquisa tem precedência sobre
a automática; entre atribuições da mesma classe, vale o escopo aplicável mais
próximo. Remover uma definição local restaura a herança ou a calibração
contextual. Esses controles representam escolhas revisáveis, não leis
pedagógicas nem um perfil inferido do estudante.

A produção registra a configuração aplicada e relaciona o material às unidades
de análise, às formas explicativas e às oportunidades de prática declaradas.
Esses registros permitem comparar intenção e realização. A validação técnica
confere referências, pertencimento e contagens; a inspeção humana decide se o
texto desenvolve a relação pretendida, se a fonte a sustenta e se as práticas
são substantivamente distintas.

Uma unidade de análise pode ser desenvolvida em várias unidades de estudo.
A introdução é registrada uma vez, e as continuações usam ou retomam a ideia.
Uma unidade de estudo também pode desenvolver mais de um recorte quando a
relação entre eles justificar a composição e o teto de introduções for
respeitado. Preservar essa flexibilidade evita condensar explicações ou
fragmentá-las apenas para satisfazer uma contagem.

Durante uma produção parcial, práticas previstas podem permanecer ausentes ou
incompletas; o registro aplicado conserva essa diferença. A produção de
um lote completo exige a cobertura, a quantidade e a variação estabelecidas
para ele. O detalhe de contexto, validação e atualização dos registros está em
[Contexto efetivo e aplicação corrente](desenho-instrucional-parametrizado.md#contexto-efetivo-e-aplicação-corrente).

## Profundidade sem condensação

Cada microssequência pode reunir uma **base explicativa**: conteúdo previamente
autorado que desenvolve conceitos, pressupostos, exemplos, relações e limites.
Todas as suas unidades dão acesso ao mesmo conteúdo pelo comando **Explicação**.
A abertura consulta o que foi salvo, sem gerar uma resposta nova por IA.
O [contrato de explicação e revisão humana](explicacao-e-revisao-humana.md)
detalha sua produção, suas fontes e sua revisão.

As unidades do percurso continuam substantivas: precisam ensinar uma relação
ou propor uma tarefa inteligível. A base permite aprofundar e recuperar
pressupostos sem repetir todo o desenvolvimento em cada unidade. A suficiência
para iniciantes é examinada no conjunto das unidades e da explicação acessível;
o estudante com maior experiência pode prosseguir sem abrir o apoio.

A base compartilhada e as **formas de explicação** têm papéis diferentes.
As formas descrevem como uma ideia foi desenvolvida — por exemplo, por definição,
mecanismo ou contraste. Uma forma presente apenas na base não satisfaz uma
exigência de desenvolvimento daquela forma nas unidades do percurso. Essa
separação conserva a possibilidade de inspecionar o que foi ensinado em cada
lugar.

### Explicação progressiva

Uma explicação pode ser curta e ainda assim exigir muitos
conhecimentos ocultos. O estudante novato encontra termos, símbolos e relações
antes de saber que problema eles resolvem. Expandir o mesmo parágrafo não
resolve necessariamente a dificuldade; apenas aumenta sua densidade.

Resumir favorece rapidez de leitura, mas pode
retirar fundamentos. Acumular detalhes desde o primeiro contato preserva
informação, mas pode impedir a construção de um modelo inicial. A solução deve
começar por uma situação inteligível, introduzir o vocabulário necessário e
acrescentar camadas até alcançar a profundidade definida pelo escopo.

O AraLearn não fixa a quantidade de unidades teóricas. A explicação
parte do que uma pessoa leiga precisa compreender para situar o objeto e avança
em complexidade sem omitir os fundamentos necessários à prática.

A carga imposta pela busca e pela integração de elementos
precisa ser considerada no desenho ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). A segmentação pode favorecer a aprendizagem em
certas condições, mas seus efeitos dependem do conteúdo, da tarefa e do modo de
apresentação ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

Antes da produção, a autoria explicita:

1. o referente concreto ou problema que situa o assunto;
2. os conceitos e relações indispensáveis;
3. os conhecimentos que não podem ser presumidos;
4. a ordem de introdução da terminologia e da notação;
5. os exemplos que tornam a operação observável;
6. as práticas que solicitam compreensão e uso do conteúdo.

Uma tabela densa, uma fórmula ou um diagrama só aparece depois que os elementos
necessários à sua leitura foram apresentados. Quando uma unidade acumula objetivos
independentes, ela é dividida; quando uma relação só faz sentido em conjunto,
ela permanece integrada.

O número de unidades passa a ser consequência do planejamento,
e não orçamento pedagógico anterior ao conteúdo. Uma explicação simples pode
ser profunda porque simplifica a entrada, não o alcance final.

Mais unidades não significam automaticamente melhor
ensino. Repetição improdutiva, perda de relações e navegação excessiva também
podem aumentar a carga. A qualidade deve ser examinada por coerência,
compreensão e prática, não por volume.

<a id="microteoria"></a>

### Suficiência teórica no percurso

A fundamentação necessária à prática pode ocupar várias unidades e ser
aprofundada na base explicativa. Sua extensão depende do objetivo e do público.
O estudante precisa encontrar:

- o problema e o contexto do conceito;
- os termos e símbolos empregados;
- as relações necessárias para compreender a operação;
- um exemplo apropriado quando a tarefa exigir modelagem;
- os limites e contrastes relevantes;
- base explícita para tudo o que será solicitado nas práticas locais.

O exame desse conjunto orienta a distribuição do conteúdo. Se uma relação
necessária estiver ausente, a revisão precisa desenvolvê-la; encurtar ou
acrescentar unidades, por si só, não resolve a lacuna.

## Apoio inicial e retirada gradual

Pedir solução independente cedo demais pode transformar a
aprendizagem em busca aleatória. Manter todos os passos resolvidos, por outro
lado, pode impedir que o estudante assuma progressivamente a operação.

A prática pode começar por problemas completos,
por imitação permanente ou por exemplos seguidos de retirada de apoio. Para
novatos, o desenho precisa tornar a operação visível antes de exigir sua
execução autônoma; o apoio deve diminuir sem ocultar os dados necessários ao
problema.

Quando a natureza da tarefa justificar, a progressão articula
explicação, exemplo resolvido, prática guiada e prática com menos apoio.

Estudos sobre exemplos resolvidos e transição para resolução
independente sustentam essa possibilidade em condições delimitadas
([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples);
[Renkl (2002)](referencias.md#ref-renkl2002learning);
[Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Explicações
instrucionais podem apoiar autoexplicações quando se ajustam ao conteúdo e à
atividade, mas não substituem o trabalho do estudante. O nível de conhecimento
prévio modifica a utilidade do apoio; por isso, a sequência não é uma receita
fixa.

A retirada pode ocorrer por passos, dicas, decisões ou
estrutura parcialmente preenchida. Valores, casos, coordenadas, código-base e
demais informações particulares permanecem na unidade. Retira-se a ajuda para
decidir, não o enunciado necessário para raciocinar.

A prática deixa de ser uma passagem abrupta da leitura para
o desempenho completo. Também pode ajudar a localizar em qual etapa uma
dificuldade aparece. Essa possibilidade permanece sujeita a avaliação.

A retirada excessivamente lenta pode produzir
dependência; a rápida pode reintroduzir busca improdutiva. A decisão precisa ser
avaliada por operação, experiência e resultado.

## Prática orientada pela operação-alvo da tarefa

Uma **operação-alvo da tarefa** é o que a pessoa precisa fazer com o conteúdo:
recordar uma informação, distinguir casos, explicar uma relação ou aplicar um
procedimento, por exemplo.
Ela descreve a demanda planejada, não um gesto de entrada, um comportamento já
observado ou um processo cognitivo que o aplicativo tenha medido.

Variar componentes visuais sem variar a operação produz aparência
de diversidade. Aplicar sempre múltipla escolha também pode reduzir tarefas de
produção a reconhecimento.

A autoria poderia selecionar modalidades por
preferência, por distribuição fixa ou pela evidência necessária. O formato
precisa corresponder ao que o objetivo exige e permanecer situado no objeto
representado.

A prática é escolhida pela operação-alvo e pode articular:

- seleção de uma ou mais alternativas quando discriminar opções é relevante;
- lacuna localizada dentro de texto, tabela, código, matriz, fórmula ou
  diagrama;
- digitação num campo ou resposta aberta quando produzir a resposta faz parte
  do objetivo;
- ordenação quando a sequência é o próprio objeto de conhecimento;
- correspondência por lacunas independentes nos campos textuais de parágrafos
  ou tabelas em que cada relação já é lida, sem uma modalidade autônoma de
  associação.

Na **prática de recuperação**, a pessoa tenta trazer à memória o conhecimento
estudado. Essa prática apresenta benefícios em diferentes
contextos educacionais, com variação entre tarefas e resultados
([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). A
**transferência**, uso do conhecimento em tarefas novas, não é automática ([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

Cada prática declara o que verifica e qual conhecimento
anterior a torna respondível. Lacunas são independentes e permanecem no lugar
estrutural em que a decisão ocorre, inclusive quando várias delas compõem uma
correspondência. A resposta não aparece antecipadamente na exposição nem é
revelada antes de ação explícita.

A diversidade passa a ter função, e não valor ornamental.
Uma mesma representação pode servir à exposição e a práticas diferentes sem
perder sua gramática acadêmica.

Tocar numa opção não caracteriza, por si só, prática de
recuperação. Reconhecimento, produção e ordenação impõem demandas distintas e
precisam ser avaliados de acordo com o objetivo.

## Distribuição e intercalação

Um conceito praticado apenas logo após a exposição pode produzir
desempenho imediato sem informar retenção. Misturar conteúdos aleatoriamente,
contudo, pode introduzir confusão sem benefício.

Na **prática distribuída**, as oportunidades se separam no tempo; o intervalo
depende de por quanto tempo se pretende conservar o conhecimento. Na
**intercalação**, alternam-se categorias ou procedimentos relacionados, para
que reconhecer qual se aplica também faça parte da tarefa.

O planejamento registra dependências e retomadas, sem adotar
intervalo universal. A intercalação é usada quando reconhecer qual conceito ou
procedimento se aplica faz parte da aprendizagem.

A prática distribuída possui respaldo amplo, mas o intervalo
favorável depende do intervalo de retenção e de outras condições
([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing)). Os efeitos da intercalação também variam,
especialmente conforme a similaridade entre categorias
([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).

Conceitos são retomados depois de separação significativa
e práticas próximas podem ser alternadas somente após a base de cada operação
estar estabelecida.

O curso pode propor tarefas para examinar discriminação e
retenção sem depender da ordem imediata da explicação.

Nenhum intervalo ou padrão de intercalação serve a
todos os conteúdos. A seleção exige justificativa e avaliação situada.

## Retorno acionável e estado não punitivo

“Correto” ou “incorreto” informa um resultado, mas não
necessariamente ajuda a entender o erro ou escolher a próxima ação. Acumular
histórico de respostas, notas e classificações também pode alterar a natureza
da prática sem que isso seja necessário ao objetivo.

O sistema poderia avaliar a cada toque, revelar
automaticamente a resposta, apenas registrar acerto ou oferecer retorno
específico após confirmação. O estudante precisa controlar o momento de
confirmar, poder tentar novamente e receber informação relacionada à distinção
em estudo.

O botão principal confirma a resposta e, no toque seguinte,
avança. A resposta correta só é revelada por ação explícita. Quantidade de
respostas, ajuda, tempo e respostas reveladas não são convertidos em nota,
classificação ou diagnóstico automático. Essa política é desenvolvida em
[Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md).

O efeito do retorno varia conforme foco, conteúdo,
oportunidade de ação e contexto ([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). O letramento para o uso do retorno inclui interpretá-lo, julgá-lo e agir a
partir dele ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). Avaliações frequentes de baixa consequência apresentam
resultados médios positivos em determinados contextos, com heterogeneidade
([Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes)).

O retorno explica regra, causa, contraste ou próximo
passo. As alternativas incorretas, chamadas **distratores**, representam erros
plausíveis. A pessoa pode limpar,
repetir e revelar a resposta sem penalização acumulada.

O erro pode ser tratado como informação para revisão, e não
como marca permanente sobre o estudante.

O estado não punitivo é uma política normativa. Não há
base para afirmar, sem estudo próprio, que ele reduz ansiedade ou melhora a
aprendizagem.

## Representações como parte do conteúdo

Relações espaciais, tabulares, hierárquicas, temporais ou formais
podem se perder quando convertidas em prosa. O problema inverso ocorre quando
um diagrama é usado apenas para “variar” e introduz uma notação desnecessária.

Texto e tabela devem continuar sendo usados
quando preservam adequadamente o objeto. Uma representação especializada só se
justifica quando sua estrutura é necessária à compreensão ou à operação e
segue uma convenção reconhecível no domínio.

Os [componentes didáticos](componentes-didaticos.md) são as formas estruturadas
de apresentar conteúdo e receber respostas. Seu catálogo descreve finalidade,
operações, condições de uso e limitações. A autoria parte da relação a ensinar
e escolhe uma representação que a preserve; o aplicativo apresenta os dados
segundo as regras desse componente.

Representações externas podem complementar informação,
restringir interpretações ou apoiar novas relações, mas sua coordenação também
exige processamento ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Retirar informação sem função — **coerência** — e aproximar elementos que
precisam ser integrados — **contiguidade** — orientam a combinação de texto e imagem
([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

Uma matriz preserva a posição de cada valor em linhas e colunas. Um grafo
explicita os elementos e as conexões entre eles; um plano cartesiano conserva
eixos e coordenadas. Na análise de línguas, uma glosa interlinear alinha partes
da expressão a seus significados gramaticais e à tradução. A
lacuna ou digitação aparece dentro do objeto quando ali ocorre o raciocínio.
Rótulos textuais podem ser editados; topologia, identificadores e estrutura
permanecem protegidos.

A representação conserva uma relação que o estudante precisa aprender a
interpretar e usar.

Ausência de sobreposição e validade do contrato são
condições técnicas, não demonstração didática. Adequação acadêmica requer
confronto com convenções do domínio; compreensão requer tarefas com pessoas.

## Continuidade móvel e retomada

Interrupções podem exigir reconstruir o objetivo suspenso e o
estado da tarefa ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Dependência de
rede também pode transformar uma ação local simples em espera ou bloqueio.

Um aplicativo pode depender do servidor,
armazenar apenas uma página temporária ou manter localmente o conteúdo e o estado
necessários ao estudo. A interação precisa permanecer imediata; a
sincronização deve ocorrer sem bloquear o gesto principal.

O estudo utiliza uma réplica local do conteúdo sincronizado e do
estado pessoal. Tema, resposta em elaboração, confirmação e avanço são
operações locais. A [persistência local](persistencia-relacional.md) conserva
os dados disponíveis para continuar sem esperar uma resposta do servidor.

A literatura de interrupção sustenta tratar a retomada como
problema próprio, mas não prova que uma implementação específica o resolve. A
diversidade de interfaces de aprendizagem móvel também desaconselha declarar
um arranjo universal ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).

O percurso registra o ponto corrente necessário para
continuar. Diagramas preservam legibilidade móvel e, quando bidimensionais,
usam área de rolagem própria. Preferências de tema permanecem locais.

A pessoa pode continuar conteúdo já disponível e retomar seu
ponto sem esperar uma operação remota.

O funcionamento sem conexão pode ser demonstrado
tecnicamente. Redução de custo de retomada, continuidade de estudo e efeitos
educacionais permanecem resultados a investigar.

## Autonomia com suporte e responsabilidade humana

Controle aparente pode significar apenas exposição a muitas
opções. No extremo oposto, automação sem possibilidade real de rejeição ou
revisão transfere decisões pedagógicas para mecanismos opacos.

A pessoa pode receber um percurso fechado, um
ambiente sem estrutura ou apoio ajustável com consequências compreensíveis.
Autoria assistida precisa separar sugestão, decisão, validação e
responsabilidade.

O AraLearn mantém a pessoa autora no ciclo de decisão: ela pode inspecionar
a estrutura e o conteúdo, examinar as fontes, pedir ou fazer correções e
declarar a revisão do material que examinou. A IA propõe e transforma o
conteúdo dentro do escopo autorizado. As integrações por
[MCP](autoria-mcp.md), protocolo de acesso a ferramentas e contexto, e
[Actions/OpenAPI](autoria-actions.md), integração descrita por operações de
serviço, dão ao assistente acesso estruturado às mesmas tarefas de autoria; os cursos permanecem
inspecionáveis na aplicação.

**Autorregulação** envolve planejar o próprio estudo, acompanhar sua
realização e refletir sobre ajustes necessários ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). **Agência**, a capacidade de agir
intencionalmente e influir no próprio percurso, não se reduz à presença de controles ([Bandura (2001)](referencias.md#ref-bandura2001agency)), e controle do
aprendiz em tecnologia educacional apresenta resultados heterogêneos
([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)). Diretrizes de interação entre pessoas e IA recomendam
comunicar capacidades e limites, permitir correção e sustentar controle
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).

O estudante pode marcar conteúdo para rever e registrar
[observações situadas](observacoes-pedagogicas.md). Na autoria, a revisão
distingue a base explicativa de cada unidade: examinar uma não declara revisão
da outra. Salvar, abrir ou editar também não declara revisão automaticamente.
O [registro de revisão humana](explicacao-e-revisao-humana.md#revisão-independente-por-objeto)
identifica o conteúdo a que a declaração se refere e sinaliza alterações
posteriores.

Os vínculos de [fontes e citações](fontes-e-citacoes.md) permitem confrontar
um trecho com a referência e a localização que o sustentam. A proveniência
registra a origem da produção e das intervenções. Fonte vinculada, intervenção
humana e revisão declarada são fatos diferentes e permanecem distinguíveis.

A existência de controles de confirmação e revisão pode
ser apenas controle simbólico. A participação efetiva da pessoa, sua compreensão do escopo e a qualidade
autoral exigem avaliação própria.

## Critérios de qualidade de uma microssequência

Uma microssequência pode ser auditada pelas seguintes perguntas:

1. o objetivo descreve conhecimento ou desempenho observável?
2. os pré-requisitos foram ensinados ou explicitamente ligados ao percurso?
3. a primeira unidade situa o problema para quem encontra o assunto pela primeira
   vez?
4. a terminologia aparece depois de um referente compreensível?
5. a teoria cobre tudo o que as práticas cobram?
6. exemplos e representações preservam as convenções acadêmicas pertinentes?
7. as práticas variam por função, e não por ornamentação?
8. o apoio diminui de maneira justificável?
9. o retorno permite compreender e agir?
10. há retomada quando retenção ou discriminação posterior são relevantes?
11. a unidade permanece autocontida nos dados particulares necessários à tarefa?
12. hipóteses, decisões e resultados estão descritos sem alegações indevidas?
13. unidades presumidas novas e relações simultâneas estão explícitas sem ser
    apresentadas como medida de carga?
14. cada prática exige a operação pretendida e representa uma oportunidade
    semanticamente distinta quando conta como variação?
15. a seleção de componente respeita a disponibilidade autorizada e registra
    limitações quando não há representação adequada?

## Exemplo abstrato de progressão

Para ensinar uma operação nova, uma microssequência pode adotar a seguinte
progressão possível, sem a transformar em modelo obrigatório:

1. apresentar uma situação concreta e o problema que exige a operação;
2. nomear os elementos envolvidos e suas relações;
3. introduzir a notação, mostrando como ler cada parte;
4. resolver um caso e justificar cada decisão;
5. pedir que a pessoa complete um passo no lugar estrutural correspondente;
6. pedir a execução completa em caso semelhante;
7. contrastar um erro plausível ou uma categoria próxima;
8. retomar a operação depois de intervalo significativo;
9. solicitar aplicação em estrutura nova quando transferência for objetivo.

A quantidade real de unidades depende do conteúdo. O exemplo mostra uma lógica de
progressão, não uma cota de produção.

## Relações com os demais documentos

<a id="finalidade-e-estatuto-deste-documento"></a>

Os fundamentos da literatura orientam as decisões do modelo; seus efeitos
sobre o estudo e a aprendizagem são hipóteses a investigar pelo protocolo
de avaliação. A inspeção do software permite verificar os comportamentos
implementados, como a retomada de conteúdo disponível sem conexão.

- A [Revisão de literatura](revisao-de-literatura.md) apresenta a base externa
  e seus limites.
- O [Quadro teórico](quadro-teorico.md) converte decisões em proposições
  examináveis.
- O [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
  fundamenta unidades, parâmetros e contratos conceituais.
- O [Glossário de construtos](glossario-construtos.md) distingue conceitos
  teóricos, resultados e termos do produto.
- A [Fundamentação pedagógica dos componentes](fundamentacao-pedagogica-dos-resources.md)
  aprofunda as decisões representacionais.
- A [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
  liga fundamento, implementação e avaliação.
- O [Protocolo de avaliação](protocolo-avaliacao-artefato.md) define como as
  hipóteses podem ser examinadas sem confundir teste técnico e aprendizagem.

As referências completas e seus identificadores persistentes estão em
[`referencias.bib`](referencias.bib).

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
