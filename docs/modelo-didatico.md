# Modelo didático do AraLearn

## Finalidade e estatuto deste documento

Este documento explica o modelo didático adotado pelo AraLearn: quais problemas
educacionais orientam o produto, quais alternativas foram consideradas, quais
decisões estão vigentes e como essas decisões aparecem na organização dos
cursos. O texto parte dos conceitos mais gerais e chega à sua
operacionalização no artefato.

O modelo é uma **proposta de design educacional fundamentada**, não uma teoria
universal de aprendizagem nem uma demonstração de eficácia. Convém distinguir,
ao longo da leitura:

- **evidência externa**: resultados e argumentos publicados em outros
  contextos;
- **decisão de produto**: escolha pedagógica ou técnica adotada no AraLearn;
- **hipótese de design**: relação que ainda precisa ser examinada com pessoas,
  tarefas e medidas adequadas;
- **propriedade implementada**: comportamento demonstrável por código, teste ou
  inspeção;
- **resultado empírico**: achado obtido em avaliação documentada do artefato.

Uma propriedade implementada, como o funcionamento offline, não demonstra por
si só compreensão, retenção ou aprendizagem. Do mesmo modo, uma decisão
fundamentada pode ser plausível sem ter sido validada no contexto específico do
AraLearn.

## Problema educacional delimitado

O AraLearn foi concebido para situações em que estudar envolve mais do que
acessar informação. A pessoa precisa compreender de onde um assunto parte,
como seus conceitos se relacionam, qual operação deve aprender, como praticá-la
e como retomar o percurso após uma interrupção. Esse problema é particularmente
visível quando o estudo ocorre no celular, em períodos fragmentados e com
conectividade variável.

Três riscos orientam o desenho:

1. **condensação**: vários conceitos, pressupostos e siglas aparecem juntos,
   sem progressão suficiente para quem encontra o assunto pela primeira vez;
2. **fragmentação**: o conteúdo é dividido em unidades curtas, mas perde suas
   relações, sua profundidade e seu propósito;
3. **atividade aparente**: o estudante toca, avança e conclui cards sem precisar
   explicar, discriminar, aplicar ou recuperar o que estudou.

O modelo responde a esses riscos com progressão explícita, teoria suficiente,
prática pertinente, feedback acionável, representações adequadas e continuidade
entre sessões. Trata-se de uma orientação; cada curso continua exigindo
planejamento e revisão próprios.

## Estrutura do percurso

O curso é organizado em níveis com responsabilidades diferentes:

| Unidade | Função principal | Pergunta que responde |
| --- | --- | --- |
| curso | delimitar propósito, público e escopo geral | o que será aprendido e para quê? |
| módulo | reunir uma região coerente do domínio | que parte ampla do assunto está em foco? |
| lição | organizar uma progressão local | que sequência de objetivos será percorrida? |
| microssequência | ensinar e verificar um objetivo delimitado | qual transformação de conhecimento ou desempenho se pretende agora? |
| card | realizar uma função didática específica | o que a pessoa precisa compreender ou fazer neste momento? |

### Por que a microssequência existe

**Problema.** Um card isolado costuma ser pequeno demais para situar, explicar,
exemplificar e praticar um conceito complexo. Uma lição inteira pode conter
objetivos demais para orientar uma sessão curta e permitir uma retomada
precisa.

**Alternativas e requisitos.** Seria possível usar somente cards e lições, ou
fixar blocos por duração e quantidade. A unidade intermediária, porém, precisa
preservar um objetivo, seus pré-requisitos, a teoria que o sustenta, as práticas
que o verificam e a ligação com o percurso, sem impor duração universal.

**Decisão.** A **microssequência** é a unidade de progressão situada entre card
e lição. Ela contém objetivo, papel no percurso, dependências, conceitos
cobertos, operações verificadas e cards ordenados.

**Fundamentação.** A literatura de carga cognitiva chama atenção para a
capacidade limitada da memória de trabalho e para demandas introduzidas pelo
próprio desenho instrucional ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). A evidência sobre segmentação apresenta moderadores
e não sustenta uma regra universal de tamanho ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)). A literatura
de microlearning também reúne intervenções heterogêneas
([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).

**Operacionalização.** A autoria declara a função e as dependências da
microssequência antes de materializar os cards. Sua extensão varia conforme a
complexidade, os conhecimentos prévios presumidos, os erros previsíveis e a
evidência de aprendizagem requerida.

**Consequências.** A unidade permite orientar produção, auditoria, retomada e
revisão sem reduzir a lição a uma lista de telas.

**Limites e evidência.** “Microssequência” é um termo operacional do AraLearn.
Não se demonstrou que essa unidade seja superior a toda alternativa; sua
coerência e utilidade precisam ser avaliadas em cursos, públicos e domínios
concretos.

## Diagnóstico contextual antes da construção

**Problema.** Um pedido de autoria não contém necessariamente tudo o que muda o
desenho do curso. Ao mesmo tempo, transformar a abertura em questionário fixo
produz perguntas irrelevantes, repete informações já disponíveis e pode
confundir uma condição do contexto com uma regra pedagógica universal.

**Alternativas e requisitos.** A autoria poderia aplicar sempre o mesmo estilo,
perguntar tudo novamente ou começar a produzir com lacunas silenciosas. Em vez
disso, precisa consultar primeiro o brief, as fontes, o curso e as decisões já
registradas; distinguir o que está documentado do que é apenas hipótese; e
interromper para dialogar somente quando uma informação ausente ou contraditória
mudaria materialmente objetivo, escopo, pré-requisito, sequência, representação,
prática ou dependência de um ambiente externo.

**Decisão.** Antes de materializar cards, a autoria assume uma
**responsabilidade diagnóstica contextual**: organiza as condições de
aprendizagem conhecidas, as exigências do conteúdo e as dificuldades previstas,
e liga cada dificuldade relevante a uma resposta de desenho proposta, aos
passos e packages que a concretizam e a critérios observáveis. Essa
síntese é apresentada à pessoa autora para confirmação ou correção. Ela não é
um diagnóstico clínico, psicométrico ou automático dos estudantes.

Uma **condição contextual** descreve o cenário, por exemplo, conhecimento prévio
que pode ser presumido, convenção disciplinar, dispositivo, idioma ou acesso a
laboratório. Uma **decisão local** define o que fazer numa microssequência, como
introduzir um pré-requisito, usar um exemplo, escolher uma representação,
acrescentar prática ou declarar que um meio indispensável não está disponível.
A mesma condição pode exigir respostas diferentes conforme a operação e o
conteúdo. Por isso, o AraLearn não adota uma pedagogia global calibrável que
determine o curso inteiro. Objetivos, cobertura e invariantes continuam comuns;
o que não existe é uma configuração global de estilo que substitua as decisões
locais.

**Fundamentação.** A utilidade de orientação, exemplos e resolução de problemas
pode mudar com o conhecimento prévio e a tarefa, fenômeno discutido como
*expertise reversal* ([Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal)). Em análise de circuitos, por exemplo, a ordem entre exemplo e problema
produziu resultados diferentes conforme o conhecimento prévio
([Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal)). Esses achados sustentam a necessidade de tratar a escolha como
contextual; não fornecem um mecanismo para inferir automaticamente o que cada
pessoa sabe nem demonstram a eficácia do produto.

**Operacionalização.** Condições estáveis ficam no brief; o resumo da decisão
conserva condição e exigência; `pedagogicalDiagnosis.difficultyResponses`
preserva somente os pares relevantes de dificuldade e resposta ligados à
microssequência. As referências locais aos passos e packages existem no
blueprint de trabalho, mas não são copiadas para a continuidade. Não persistem
raciocínio privado do modelo nem o transcript integral do diálogo. Na
auditoria, cada resposta prometida deve aparecer no plano e nos cards; também
se procuram resposta ausente, densidade excessiva, prática antes da base,
representação inadequada, perda de cobertura e dependência de meio externo
indisponível.

**Consequências, limites e responsabilidade.** A pessoa autora continua
responsável por confirmar o público, julgar as hipóteses, revisar fontes e
aprovar decisões. O sistema pode tornar inconsistências e lacunas observáveis,
mas não mede domínio individual, não produz sozinho diagnóstico de domínio, não
certifica adequação disciplinar e não prediz resultados de aprendizagem.

## Profundidade sem condensação

### Explicação progressiva

**Problema.** Uma explicação pode ser curta e ainda assim exigir muitos
conhecimentos ocultos. O estudante novato encontra termos, símbolos e relações
antes de saber que problema eles resolvem. Expandir o mesmo parágrafo não
resolve necessariamente a dificuldade; apenas aumenta sua densidade.

**Alternativas e requisitos.** Resumir favorece rapidez de leitura, mas pode
retirar fundamentos. Acumular detalhes desde o primeiro contato preserva
informação, mas pode impedir a construção de um modelo inicial. A solução deve
começar por uma situação inteligível, introduzir o vocabulário necessário e
acrescentar camadas até alcançar a profundidade definida pelo escopo.

**Decisão.** O AraLearn não fixa quantidade de cards de teoria. A explicação
parte do que uma pessoa leiga precisa compreender para situar o objeto e avança
em complexidade sem omitir os fundamentos necessários à prática.

**Fundamentação.** A carga imposta pela busca e pela integração de elementos
precisa ser considerada no desenho ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). A segmentação pode favorecer a aprendizagem em
certas condições, mas seus efeitos dependem do conteúdo, da tarefa e do modo de
apresentação ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

**Operacionalização.** Antes da produção, a autoria explicita:

1. o referente concreto ou problema que situa o assunto;
2. os conceitos e relações indispensáveis;
3. os conhecimentos que não podem ser presumidos;
4. a ordem de introdução da terminologia e da notação;
5. os exemplos que tornam a operação observável;
6. as práticas que demonstram compreensão e uso.

Uma tabela densa, uma fórmula ou um diagrama só aparece depois que os elementos
necessários à sua leitura foram apresentados. Quando um card acumula objetivos
independentes, ele é dividido; quando uma relação só faz sentido em conjunto,
ela permanece integrada.

**Consequências.** O número de cards passa a ser consequência do planejamento,
e não orçamento pedagógico anterior ao conteúdo. Uma explicação simples pode
ser profunda porque simplifica a entrada, não o alcance final.

**Limites e evidência.** Mais cards não significam automaticamente melhor
ensino. Repetição improdutiva, perda de relações e navegação excessiva também
podem aumentar a carga. A qualidade deve ser examinada por coerência,
compreensão e prática, não por volume.

### Microteoria

**Microteoria** é o conjunto de cards teóricos que fornece fundamento
suficiente para as práticas de uma microssequência. O prefixo “micro” indica um
recorte local no percurso; não significa resumo, superficialidade, duração
fixa ou adoção automática de qualquer modelo de microlearning.

Uma microteoria é suficiente quando o estudante encontra no próprio percurso:

- o problema e o contexto do conceito;
- os termos e símbolos empregados;
- as relações necessárias para compreender a operação;
- pelo menos um exemplo apropriado quando a tarefa exigir modelagem;
- os limites e contrastes relevantes;
- base explícita para tudo o que será cobrado nas práticas locais.

## Apoio inicial e retirada gradual

**Problema.** Pedir solução independente cedo demais pode transformar a
aprendizagem em busca aleatória. Manter todos os passos resolvidos, por outro
lado, pode impedir que o estudante assuma progressivamente a operação.

**Alternativas e requisitos.** A prática pode começar por problemas completos,
por imitação permanente ou por exemplos seguidos de retirada de apoio. Para
novatos, o desenho precisa tornar a operação visível antes de exigir sua
execução autônoma; o apoio deve diminuir sem ocultar os dados necessários ao
problema.

**Decisão.** Quando a natureza da tarefa justificar, a progressão combina
explicação, exemplo resolvido, prática guiada e prática com menos apoio.

**Fundamentação.** Estudos sobre exemplos resolvidos e transição para resolução
independente sustentam essa possibilidade em condições delimitadas
([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). O nível de conhecimento prévio
modifica a utilidade do apoio; por isso, a sequência não é uma receita fixa.

**Operacionalização.** A retirada pode ocorrer por passos, dicas, decisões ou
estrutura parcialmente preenchida. Valores, casos, coordenadas, código-base e
demais informações particulares permanecem no card. Retira-se a ajuda para
decidir, não o enunciado necessário para raciocinar.

**Consequências.** A prática deixa de ser uma passagem abrupta da leitura para
o desempenho completo. Também se torna possível identificar em qual etapa uma
incompreensão aparece.

**Limites e evidência.** A retirada excessivamente lenta pode produzir
dependência; a rápida pode reintroduzir busca improdutiva. A decisão precisa ser
avaliada por operação, experiência e resultado.

## Prática orientada pelo gesto cognitivo

Um **gesto cognitivo** é a operação que a pessoa precisa realizar sobre o
conteúdo: recordar, localizar, discriminar, relacionar, ordenar, completar,
explicar, calcular, transformar, provar ou aplicar, entre outras. O termo é
usado como instrumento de planejamento, não como taxonomia psicológica
universal.

**Problema.** Variar componentes visuais sem variar a operação produz aparência
de diversidade. Aplicar sempre múltipla escolha também pode reduzir tarefas de
produção a reconhecimento.

**Alternativas e requisitos.** A autoria poderia selecionar modalidades por
preferência, por distribuição fixa ou pela evidência necessária. O formato
precisa corresponder ao que o objetivo exige e permanecer situado no objeto
representado.

**Decisão.** A prática é escolhida pelo gesto cognitivo e pode combinar:

- seleção de uma ou mais alternativas quando discriminar opções é relevante;
- lacuna localizada dentro de texto, tabela, código, matriz, fórmula ou
  diagrama;
- digitação quando produzir a resposta faz parte do objetivo;
- ordenação quando a sequência é o próprio objeto de conhecimento;
- correspondência por lacunas independentes nos campos textuais de parágrafos
  ou tabelas em que cada relação já é lida, sem uma modalidade autônoma de
  associação.

**Fundamentação.** A prática de recuperação apresenta benefícios em diferentes
contextos educacionais, com variação entre tarefas e resultados
([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)). A
transferência para tarefas novas não é automática ([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

**Operacionalização.** Cada prática declara o que verifica e qual conhecimento
anterior a torna respondível. Lacunas são independentes e permanecem no lugar
estrutural em que a decisão ocorre, inclusive quando várias delas compõem uma
correspondência. A resposta não aparece antecipadamente na exposição nem é
revelada antes de ação explícita.

**Consequências.** A diversidade passa a ter função, e não valor ornamental.
Uma mesma representação pode servir à exposição e a práticas diferentes sem
perder sua gramática acadêmica.

**Limites e evidência.** Tocar numa opção não caracteriza, por si só, prática de
recuperação. Reconhecimento, produção e ordenação impõem demandas distintas e
precisam ser avaliados de acordo com o objetivo.

## Distribuição e intercalação

**Problema.** Um conceito praticado apenas logo após a exposição pode produzir
desempenho imediato sem informar retenção. Misturar conteúdos aleatoriamente,
contudo, pode introduzir confusão sem benefício.

**Alternativas e requisitos.** A prática pode ser concentrada, distribuída no
tempo ou intercalada com categorias relacionadas. O intervalo deve considerar
o horizonte de retenção, e a intercalação deve exigir discriminação entre
operações comparáveis.

**Decisão.** O planejamento registra dependências e retomadas, sem adotar
intervalo universal. A intercalação é usada quando reconhecer qual conceito ou
procedimento se aplica faz parte da aprendizagem.

**Fundamentação.** A prática distribuída possui respaldo amplo, mas o intervalo
favorável depende do intervalo de retenção e de outras condições
([Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed); [Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing)). A intercalação tem moderadores
próprios, especialmente a similaridade entre categorias
([Brunmair e Richter (2019)](referencias.md#ref-brunmair2019interleaving); [Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).

**Operacionalização.** Conceitos são retomados depois de separação significativa
e práticas próximas podem ser alternadas somente após a base de cada operação
estar estabelecida.

**Consequências.** O curso pode verificar discriminação e retenção sem depender
da ordem imediata da explicação.

**Limites e evidência.** Nenhum intervalo ou padrão de intercalação serve a
todos os conteúdos. A seleção exige justificativa e avaliação situada.

## Feedback acionável e estado não punitivo

**Problema.** “Correto” ou “incorreto” informa um resultado, mas não
necessariamente ajuda a entender o erro ou escolher a próxima ação. Acumular
tentativas, notas e rankings também pode alterar a natureza da prática sem que
isso seja necessário ao objetivo.

**Alternativas e requisitos.** O sistema poderia avaliar a cada toque, revelar
automaticamente a resposta, apenas registrar acerto ou oferecer feedback
específico após confirmação. O estudante precisa controlar o momento de
confirmar, poder tentar novamente e receber informação relacionada à distinção
em estudo.

**Decisão.** O botão principal confirma a resposta e, no toque seguinte,
avança. A resposta correta só é revelada por ação explícita. Tentativas, ajuda,
tempo e respostas reveladas não são convertidos em nota, ranking ou diagnóstico
automático.

**Fundamentação.** O efeito do feedback varia conforme foco, conteúdo,
oportunidade de ação e contexto ([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). *Feedback literacy* inclui interpretar, julgar e usar o
feedback, e não apenas recebê-lo ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). Avaliações frequentes de baixa consequência apresentam
resultados médios positivos em determinados contextos, com heterogeneidade
([Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes)).

**Operacionalização.** O feedback explica regra, causa, contraste ou próximo
passo. Distratores representam erros plausíveis. A pessoa pode limpar,
repetir e revelar a resposta sem penalização acumulada.

**Consequências.** O erro pode ser tratado como informação para revisão, e não
como marca permanente sobre o estudante.

**Limites e evidência.** O estado não punitivo é uma política normativa. Não há
base para afirmar, sem estudo próprio, que ele reduz ansiedade ou melhora a
aprendizagem.

## Representações como parte do conteúdo

**Problema.** Relações espaciais, tabulares, hierárquicas, temporais ou formais
podem se perder quando convertidas em prosa. O problema inverso ocorre quando
um diagrama é usado apenas para “variar” e introduz uma notação desnecessária.

**Alternativas e requisitos.** Texto e tabela devem continuar sendo usados
quando preservam adequadamente o objeto. Uma representação especializada só se
justifica quando sua estrutura é necessária à compreensão ou à operação e
segue uma convenção reconhecível no domínio.

**Decisão.** O catálogo de recursos descreve intenção, estrutura, operações,
condições de uso e limitações. A autoria escolhe primeiro o tipo de
representação e consulta depois seu contrato específico. O **kernel**, núcleo
comum que descobre, valida e compõe módulos de representação, materializa
o contrato de forma determinística.

**Fundamentação.** Representações externas podem complementar informação,
restringir interpretações ou apoiar novas relações, mas sua coordenação também
cria demanda cognitiva ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Coerência e contiguidade são
relevantes quando texto e imagem precisam ser integrados
([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

**Operacionalização.** Uma matriz preserva linhas e colunas; um grafo preserva
vértices e arestas; um plano cartesiano preserva eixos e coordenadas; uma glosa
interlinear preserva alinhamento entre forma, morfema, glosa e tradução. A
lacuna ou digitação aparece dentro do objeto quando ali ocorre o raciocínio.
Rótulos textuais podem ser editados; topologia, identificadores e estrutura
permanecem protegidos.

**Consequências.** O recurso visual deixa de ser decoração e torna-se portador
de uma relação que o estudante precisa aprender a interpretar e usar.

**Limites e evidência.** Ausência de sobreposição e validade do contrato são
condições técnicas, não demonstração didática. Adequação acadêmica requer
confronto com convenções do domínio; compreensão requer tarefas com pessoas.

## Continuidade móvel e retomada

**Problema.** Interrupções podem exigir reconstruir o objetivo suspenso e o
estado da tarefa ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Dependência de
rede também pode transformar uma ação local simples em espera ou bloqueio.

**Alternativas e requisitos.** Um aplicativo pode depender do servidor,
armazenar apenas uma página em cache ou manter localmente o conteúdo e o estado
necessários ao estudo. A interação corrente precisa permanecer imediata; a
sincronização deve ocorrer sem bloquear o gesto principal.

**Decisão.** O estudo utiliza uma réplica local do conteúdo sincronizado e do
estado corrente. Tema, resposta em elaboração, confirmação e avanço são
operações locais; a conectividade não integra seu caminho crítico.

**Fundamentação.** A literatura de interrupção sustenta tratar a retomada como
problema próprio, mas não prova que uma implementação específica o resolve. A
diversidade de interfaces de aprendizagem móvel também desaconselha declarar
um layout universal ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).

**Operacionalização.** O percurso registra o ponto corrente necessário para
continuar. Diagramas preservam legibilidade móvel e, quando bidimensionais,
usam área de rolagem própria. Preferências de tema permanecem locais.

**Consequências.** A pessoa pode continuar conteúdo já disponível e retomar seu
ponto sem esperar uma operação remota.

**Limites e evidência.** Funcionamento offline pode ser demonstrado
tecnicamente. Redução de custo de retomada, continuidade de estudo e efeitos
educacionais permanecem resultados a investigar.

## Autonomia com suporte e responsabilidade humana

**Problema.** Controle aparente pode significar apenas exposição a muitas
opções. No extremo oposto, automação sem possibilidade real de rejeição ou
reversão transfere decisões pedagógicas para mecanismos opacos.

**Alternativas e requisitos.** A pessoa pode receber um percurso fechado, um
ambiente sem estrutura ou apoio ajustável com consequências compreensíveis.
Autoria assistida precisa separar sugestão, decisão, validação e
responsabilidade.

**Decisão.** O AraLearn oferece percurso visível, escolha de trilhas, edição
contextual, versões reversíveis e assistência conversacional delimitada. A
inteligência artificial (IA) propõe e transforma conteúdo sob escopo explícito;
a decisão editorial continua humana.

**Fundamentação.** Autorregulação envolve planejamento, execução, monitoramento
e reflexão ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). Agência
não se reduz à presença de controles ([Bandura (2001)](referencias.md#ref-bandura2001agency)), e controle do
aprendiz em tecnologia educacional apresenta resultados heterogêneos
([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)). Diretrizes de interação humano–IA recomendam
comunicar capacidades e limites, permitir correção e sustentar controle
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).

**Operacionalização.** O estudante pode marcar conteúdo para revisão, registrar
observações e editar textos autorizados. A assistência recebe contexto somente
para leitura e alvos graváveis separados, permite iteração e conserva meios de
desfazer ou restaurar. Estrutura e permissões não são inferidas de linguagem
livre.

**Consequências.** A automação funciona como instrumento de autoria, não como
substituto da avaliação humana. A proveniência pode distinguir contribuições e
revisões.

**Limites e evidência.** A existência de botões de confirmação e reversão pode
ser apenas controle simbólico. Agência, compreensão do escopo e qualidade
autoral exigem avaliação própria.

## Critérios de qualidade de uma microssequência

Uma microssequência pode ser auditada pelas seguintes perguntas:

1. o objetivo descreve conhecimento ou desempenho observável?
2. os pré-requisitos foram ensinados ou explicitamente ligados ao percurso?
3. o primeiro card situa o problema para quem encontra o assunto pela primeira
   vez?
4. a terminologia aparece depois de um referente compreensível?
5. a teoria cobre tudo o que as práticas cobram?
6. exemplos e representações preservam as convenções acadêmicas pertinentes?
7. as práticas variam por função, e não por ornamentação?
8. o apoio diminui de maneira justificável?
9. o feedback permite compreender e agir?
10. há retomada quando retenção ou discriminação posterior são relevantes?
11. o card permanece autocontido nos dados particulares necessários à tarefa?
12. hipóteses, decisões e resultados estão descritos sem alegações indevidas?

## Exemplo abstrato de progressão

Para ensinar uma operação nova, uma microssequência pode adotar a seguinte
progressão — sem que ela se torne modelo obrigatório:

1. apresentar uma situação concreta e o problema que exige a operação;
2. nomear os elementos envolvidos e suas relações;
3. introduzir a notação, mostrando como ler cada parte;
4. resolver um caso e justificar cada decisão;
5. pedir que a pessoa complete um passo no lugar estrutural correspondente;
6. pedir a execução completa em caso semelhante;
7. contrastar um erro plausível ou uma categoria próxima;
8. retomar a operação depois de intervalo significativo;
9. solicitar aplicação em estrutura nova quando transferência for objetivo.

A quantidade real de cards depende do conteúdo. O exemplo mostra uma lógica de
progressão, não uma cota de produção.

## Relações com os demais documentos

- A [Revisão de literatura](revisao-de-literatura.md) apresenta a base externa
  e seus limites.
- O [Quadro teórico](quadro-teorico.md) converte decisões em proposições
  examináveis.
- O [Glossário de construtos](glossario-construtos.md) distingue conceitos
  teóricos, resultados e termos do produto.
- A [Fundamentação pedagógica dos recursos](fundamentacao-pedagogica-dos-resources.md)
  aprofunda as decisões representacionais.
- A [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
  liga fundamento, implementação e avaliação.
- O [Protocolo de avaliação](protocolo-avaliacao-artefato.md) define como as
  hipóteses podem ser examinadas sem confundir teste técnico e aprendizagem.

As referências completas e seus identificadores persistentes estão em
[`referencias.bib`](referencias.bib).
