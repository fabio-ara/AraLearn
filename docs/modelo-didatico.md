# Modelo didático do AraLearn

## Finalidade e estatuto deste documento

Este documento explica o modelo didático adotado pelo AraLearn: quais problemas
educacionais orientam o produto, quais alternativas foram consideradas, quais
decisões estão vigentes e como essas decisões aparecem na organização dos
cursos. O texto parte dos conceitos mais gerais e chega à sua
operacionalização no artefato.

O modelo é uma **proposta de projeto educacional fundamentada**, não uma teoria
universal de aprendizagem nem uma demonstração de eficácia. Convém distinguir,
ao longo da leitura:

- **evidência externa**: resultados e argumentos publicados em outros
  contextos;
- **decisão de produto**: escolha pedagógica ou técnica adotada no AraLearn;
- **hipótese de projeto**: relação que ainda precisa ser examinada com pessoas,
  tarefas e medidas adequadas;
- **propriedade implementada**: comportamento demonstrável por código, teste ou
  inspeção;
- **resultado empírico**: achado obtido em avaliação documentada do artefato.

Uma propriedade implementada, como o funcionamento sem conexão, não demonstra por
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
3. **atividade aparente**: o estudante toca, avança e conclui Unidades sem precisar
   explicar, discriminar, aplicar ou recuperar o que estudou.

O modelo responde a esses riscos com progressão explícita, teoria suficiente,
prática pertinente, retorno acionável, representações adequadas e continuidade
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
| Unidade de estudo | realizar uma função didática específica | o que a pessoa precisa compreender ou fazer neste momento? |

### Por que a microssequência existe

**Problema.** Uma Unidade isolada costuma ser pequena demais para situar, explicar,
exemplificar e praticar um conceito complexo. Uma lição inteira pode conter
objetivos demais para delimitar o que estava em andamento e permitir uma
retomada precisa depois de interrupção.

**Alternativas e requisitos.** Seria possível usar somente Unidades e Lições, ou
fixar blocos por duração e quantidade. A unidade intermediária, porém, precisa
preservar um objetivo, seus pré-requisitos, a teoria que o sustenta, as práticas
que o verificam e a ligação com o percurso, sem impor duração universal.

**Decisão.** A **Microssequência didática** é a unidade de progressão situada
entre Unidade de estudo e Lição. Ela contém objetivo, papel no percurso,
dependências, conceitos cobertos, operações verificadas e Unidades ordenadas.

**Fundamentação.** A literatura de carga cognitiva chama atenção para a
capacidade limitada da memória de trabalho e para demandas introduzidas pelo
próprio desenho instrucional ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). A evidência sobre segmentação apresenta moderadores
e não sustenta uma regra universal de tamanho ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)). A literatura
de microaprendizagem também reúne intervenções heterogêneas
([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).

**Operacionalização.** A Autoria declara a função e as dependências da
Microssequência antes de materializar as Unidades. Sua extensão varia conforme a
complexidade, os conhecimentos prévios presumidos, os erros previsíveis e a
evidência de aprendizagem requerida.

**Consequências.** A unidade permite orientar produção, auditoria, retomada e
revisão sem reduzir a lição a uma lista de telas.

**Limites e evidência.** “Microssequência” é um termo operacional do AraLearn.
Não se demonstrou que essa unidade seja superior a toda alternativa; sua
coerência e utilidade precisam ser avaliadas em cursos, públicos e domínios
concretos.

### Parte como coordenação operacional

Em cursos extensos, a autoria pode reunir microssequências em **Partes** para
que planejamento, construção, auditoria, reparo e reauditoria permaneçam
manejáveis. A divisão considera coesão semântica, dependências, quantidade e
complexidade das microssequências e carga provável de revisão humana.

Parte não aparece na hierarquia acima porque não é unidade pedagógica. Também
não é definida por duração, número de Unidades ou uma quantidade universal de
blocos por curso. É uma unidade operacional de coordenação entre pessoa e
assistente; qualquer contagem inicial funciona, no máximo, como referência
configurável a ser avaliada.

## Diagnóstico contextual antes da construção

**Problema.** Um pedido de autoria não contém necessariamente tudo o que muda o
desenho do curso. Ao mesmo tempo, transformar a abertura em questionário fixo
produz perguntas irrelevantes, repete informações já disponíveis e pode
confundir uma condição do contexto com uma regra pedagógica universal.

**Alternativas e requisitos.** A Autoria poderia aplicar sempre o mesmo estilo,
perguntar tudo novamente ou começar a produzir com lacunas silenciosas. Em vez
disso, precisa consultar primeiro o pedido, as Fontes, o Curso e as decisões já
registradas; distinguir o que está documentado do que é apenas hipótese; e
interromper para dialogar somente quando uma informação ausente ou contraditória
mudaria materialmente objetivo, escopo, pré-requisito, sequência, representação,
prática ou dependência de um ambiente externo.

**Decisão.** Antes de materializar Unidades, a Autoria assume uma
**responsabilidade diagnóstica contextual**: organiza as condições de
aprendizagem conhecidas, as exigências do conteúdo e as dificuldades previstas,
e liga cada dificuldade relevante a uma resposta de desenho proposta, aos
passos e componentes que a concretizam e a critérios observáveis. Essa
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
efeito de reversão da especialização (*expertise reversal*)
([Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal)). Em análise
de circuitos, por exemplo, a ordem entre exemplo e problema
produziu resultados diferentes conforme o conhecimento prévio
([Reisslein et al. (2006)](referencias.md#ref-reisslein2006expertisereversal)). Esses achados sustentam a necessidade de tratar a escolha como
contextual; não fornecem um mecanismo para inferir automaticamente o que cada
pessoa sabe nem demonstram a eficácia do produto.

**Operacionalização.** Público, escopo, resultados pretendidos, unidades de
análise e requisitos de evidência ficam no plano instrucional. Orientações
naturais são revisões próprias por escopo; interpretações estruturadas
permanecem separadas do texto original. Parâmetros e política de componentes
possuem valores efetivos com origem e fonte visíveis. Nenhuma camada persiste
raciocínio privado do modelo nem a transcrição integral do diálogo.

**Consequências, limites e responsabilidade.** A pessoa autora continua
responsável por confirmar o público, julgar as hipóteses, revisar fontes e
aprovar decisões. O sistema pode tornar inconsistências e lacunas observáveis,
mas não mede domínio individual, não produz sozinho diagnóstico de domínio, não
certifica adequação disciplinar e não prediz resultados de aprendizagem.

## Análise instrucional e parâmetros locais

O plano e o desenho por escopo separam o percurso abaixo:

```text
fontes e objetivo → itens do plano → atribuição explícita por Microssequência
  → parâmetros e orientações efetivos
  → política e seleção progressiva de componentes
  → contexto selado pelo servidor → Unidades e fatos de aplicação
  → Conteúdo e revisão humana
```

A **unidade de análise instrucional** é um recorte editorial ligado a fontes,
objetivo e relações. Ela não é automaticamente um componente de conhecimento
validado: componentes de conhecimento e eventos de aprendizagem não são
observados diretamente, e sua granularidade depende da análise e da população
([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)).
Do mesmo modo, classificar uma unidade como presumidamente nova, parcial,
integrada ou desconhecida descreve uma hipótese para o desenho, não o domínio
de uma pessoa.

Quando unidades precisam ser processadas juntas, a análise pode declarar essa
relação em campo próprio. O plano conserva identidades e enunciados,
mas não inventa dependências semânticas entre unidades de análise. A estrutura
curricular continua validando sua própria ordem e relações.

Os quatro parâmetros podem variar em Curso, Lição ou
Microssequência: teto de novas unidades por Unidade expositiva, formas de
explicação, oportunidades distintas de prática e dimensões de variação. Módulo
pode receber orientação e política de componentes, mas não ganhou um parâmetro
sem necessidade distinta demonstrada. Os valores iniciais são hipóteses do
produto, não regras pedagógicas universais.

Uma atribuição explícita da pessoa autora ou de uma condição de pesquisa
precede a atribuição automática; dentro da mesma classe, vence o escopo
aplicável mais próximo. A condição de pesquisa registra a origem da decisão,
sem bloquear sua revisão. Limpar uma definição restaura a herança ou o valor
inicial sem copiar o valor para o descendente.

No início da materialização, o servidor resolve e sela parâmetros,
orientações, interpretações, política e os itens do plano atribuídos a cada
Microssequência-alvo. O catálogo selado inclui identidade, posição, enunciado e
versão, enquanto cada alvo referencia somente seu subconjunto.

Na etapa, fatos limitados declaram introduções, formas desenvolvidas, prática,
variações e componentes usados. Formas, oportunidades e variações são
declarações do assistente ou da pessoa autora validadas quanto ao contrato; não são
observadas semanticamente pelo banco. IDs de Unidades, pai/alvo e
`componentRefs` são reconciliados com o conteúdo persistido. Esses fatos
permitem confrontar planejado e declarado como aplicado; não constituem pontuação,
diagnóstico ou resultado de aprendizagem.

Uma unidade de análise é introduzida uma vez, mas pode ser desenvolvida em
várias Unidades de estudo. Cada continuação declara a mesma relação e a
cobertura explicativa é reunida no lote; isso permite aprofundar sem condensar
conteúdo para satisfazer cardinalidade técnica. Uma Unidade também pode
desenvolver mais de uma unidade de análise, desde que a combinação seja
coerente e o teto de introduções novas seja respeitado.

Interface, MCP e Actions operam o mesmo contrato em linguagem comum. A pessoa
autora não precisa editar JSON nem um esquema opaco de componentes. A
fundamentação e os limites estão em
[Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md).

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

**Decisão.** O AraLearn não fixa a quantidade de Unidades teóricas. A explicação
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
necessários à sua leitura foram apresentados. Quando uma Unidade acumula objetivos
independentes, ela é dividida; quando uma relação só faz sentido em conjunto,
ela permanece integrada.

**Consequências.** O número de Unidades passa a ser consequência do planejamento,
e não orçamento pedagógico anterior ao conteúdo. Uma explicação simples pode
ser profunda porque simplifica a entrada, não o alcance final.

**Limites e evidência.** Mais Unidades não significam automaticamente melhor
ensino. Repetição improdutiva, perda de relações e navegação excessiva também
podem aumentar a carga. A qualidade deve ser examinada por coerência,
compreensão e prática, não por volume.

### Microteoria

**Microteoria** é o conjunto de Unidades teóricas que fornece fundamento
suficiente para as práticas de uma microssequência. O prefixo “micro” indica um
recorte local no percurso; não significa resumo, superficialidade, duração
fixa ou adoção automática de qualquer modelo de microaprendizagem.

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

**Decisão.** Quando a natureza da tarefa justificar, a progressão articula
explicação, exemplo resolvido, prática guiada e prática com menos apoio.

**Fundamentação.** Estudos sobre exemplos resolvidos e transição para resolução
independente sustentam essa possibilidade em condições delimitadas
([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples);
[Renkl (2002)](referencias.md#ref-renkl2002learning);
[Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Explicações
instrucionais podem apoiar autoexplicações quando se ajustam ao conteúdo e à
atividade, mas não substituem o trabalho do estudante. O nível de conhecimento
prévio modifica a utilidade do apoio; por isso, a sequência não é uma receita
fixa.

**Operacionalização.** A retirada pode ocorrer por passos, dicas, decisões ou
estrutura parcialmente preenchida. Valores, casos, coordenadas, código-base e
demais informações particulares permanecem na Unidade. Retira-se a ajuda para
decidir, não o enunciado necessário para raciocinar.

**Consequências.** A prática deixa de ser uma passagem abrupta da leitura para
o desempenho completo. Também pode ajudar a localizar em qual etapa uma
dificuldade aparece. Essa possibilidade permanece sujeita a avaliação.

**Limites e evidência.** A retirada excessivamente lenta pode produzir
dependência; a rápida pode reintroduzir busca improdutiva. A decisão precisa ser
avaliada por operação, experiência e resultado.

## Prática orientada pela operação-alvo da tarefa

Uma **operação-alvo da tarefa** é aquilo que a atividade solicita que a pessoa
faça sobre o
conteúdo: recordar, localizar, discriminar, relacionar, ordenar, completar,
explicar, calcular, transformar, provar ou aplicar, entre outras possibilidades.
Ela descreve a demanda planejada, não um gesto de entrada, um comportamento já
observado ou um processo cognitivo que o aplicativo tenha medido.

**Problema.** Variar componentes visuais sem variar a operação produz aparência
de diversidade. Aplicar sempre múltipla escolha também pode reduzir tarefas de
produção a reconhecimento.

**Alternativas e requisitos.** A autoria poderia selecionar modalidades por
preferência, por distribuição fixa ou pela evidência necessária. O formato
precisa corresponder ao que o objetivo exige e permanecer situado no objeto
representado.

**Decisão.** A prática é escolhida pela operação-alvo e pode articular:

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

**Consequências.** O curso pode propor tarefas para examinar discriminação e
retenção sem depender da ordem imediata da explicação.

**Limites e evidência.** Nenhum intervalo ou padrão de intercalação serve a
todos os conteúdos. A seleção exige justificativa e avaliação situada.

## Retorno acionável e estado não punitivo

**Problema.** “Correto” ou “incorreto” informa um resultado, mas não
necessariamente ajuda a entender o erro ou escolher a próxima ação. Acumular
histórico de respostas, notas e classificações também pode alterar a natureza
da prática sem que isso seja necessário ao objetivo.

**Alternativas e requisitos.** O sistema poderia avaliar a cada toque, revelar
automaticamente a resposta, apenas registrar acerto ou oferecer retorno
específico após confirmação. O estudante precisa controlar o momento de
confirmar, poder tentar novamente e receber informação relacionada à distinção
em estudo.

**Decisão.** O botão principal confirma a resposta e, no toque seguinte,
avança. A resposta correta só é revelada por ação explícita. Quantidade de
respostas, ajuda, tempo e respostas reveladas não são convertidos em nota,
classificação ou diagnóstico automático.

**Fundamentação.** O efeito do retorno varia conforme foco, conteúdo,
oportunidade de ação e contexto ([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). O letramento para o uso do retorno inclui interpretá-lo, julgá-lo e agir a
partir dele ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). Avaliações frequentes de baixa consequência apresentam
resultados médios positivos em determinados contextos, com heterogeneidade
([Sotola e Credé (2021)](referencias.md#ref-sotola2021quizzes)).

**Operacionalização.** O retorno explica regra, causa, contraste ou próximo
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

**Decisão.** O catálogo de componentes descreve intenção, estrutura, operações,
condições de uso e limitações. A Autoria escolhe primeiro o tipo de
representação e consulta depois seu contrato específico. O **núcleo de execução
de componentes** descobre, valida e compõe os pacotes de maneira determinística.

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

**Consequências.** A representação deixa de ser decoração e torna-se portadora
de uma relação que o estudante precisa aprender a interpretar e usar.

**Limites e evidência.** Ausência de sobreposição e validade do contrato são
condições técnicas, não demonstração didática. Adequação acadêmica requer
confronto com convenções do domínio; compreensão requer tarefas com pessoas.

## Continuidade móvel e retomada

**Problema.** Interrupções podem exigir reconstruir o objetivo suspenso e o
estado da tarefa ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Dependência de
rede também pode transformar uma ação local simples em espera ou bloqueio.

**Alternativas e requisitos.** Um aplicativo pode depender do servidor,
armazenar apenas uma página temporária ou manter localmente o conteúdo e o estado
necessários ao estudo. A interação precisa permanecer imediata; a
sincronização deve ocorrer sem bloquear o gesto principal.

**Decisão.** Estudo utiliza uma réplica local do conteúdo sincronizado e do
estado pessoal. Tema, resposta em elaboração, confirmação e avanço são
operações locais; a conectividade não integra seu caminho crítico.

**Fundamentação.** A literatura de interrupção sustenta tratar a retomada como
problema próprio, mas não prova que uma implementação específica o resolve. A
diversidade de interfaces de aprendizagem móvel também desaconselha declarar
um arranjo universal ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).

**Operacionalização.** O percurso registra o ponto corrente necessário para
continuar. Diagramas preservam legibilidade móvel e, quando bidimensionais,
usam área de rolagem própria. Preferências de tema permanecem locais.

**Consequências.** A pessoa pode continuar conteúdo já disponível e retomar seu
ponto sem esperar uma operação remota.

**Limites e evidência.** O funcionamento sem conexão pode ser demonstrado
tecnicamente. Redução de custo de retomada, continuidade de estudo e efeitos
educacionais permanecem resultados a investigar.

## Autonomia com suporte e responsabilidade humana

**Problema.** Controle aparente pode significar apenas exposição a muitas
opções. No extremo oposto, automação sem possibilidade real de rejeição ou
revisão transfere decisões pedagógicas para mecanismos opacos.

**Alternativas e requisitos.** A pessoa pode receber um percurso fechado, um
ambiente sem estrutura ou apoio ajustável com consequências compreensíveis.
Autoria assistida precisa separar sugestão, decisão, validação e
responsabilidade.

**Decisão.** O AraLearn oferece percurso visível, marca pessoal para revisão,
Observações situadas e assistência conversacional delimitada. Na Autoria, a
pessoa pode voltar a qualquer StudyUnit, registrar a mudança necessária e
revisar o conjunto de Units pedagogicamente afetado. A inteligência artificial
(IA) propõe e transforma conteúdo sob escopo explícito; a decisão editorial
continua humana.

**Fundamentação.** Autorregulação envolve planejamento, execução, monitoramento
e reflexão ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)). Agência
não se reduz à presença de controles ([Bandura (2001)](referencias.md#ref-bandura2001agency)), e controle do
aprendiz em tecnologia educacional apresenta resultados heterogêneos
([Karich et al. (2014)](referencias.md#ref-karich2014learnercontrol)). Diretrizes de interação entre pessoas e IA recomendam
comunicar capacidades e limites, permitir correção e sustentar controle
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).

**Operacionalização.** O estudante pode marcar conteúdo para revisão e registrar
Observações. A pessoa autora recebe contexto de leitura, alvos graváveis
separados e meios de reabrir, anotar e corrigir qualquer ponto do Curso.
Estrutura e permissões vêm de contratos explícitos, e não da linguagem livre.

**Consequências.** A automação funciona como instrumento de autoria, não como
substituto da avaliação humana. A proveniência pode distinguir contribuições e
revisões.

**Limites e evidência.** A existência de controles de confirmação e revisão pode
ser apenas controle simbólico. Agência, compreensão do escopo e qualidade
autoral exigem avaliação própria.

## Critérios de qualidade de uma microssequência

Uma microssequência pode ser auditada pelas seguintes perguntas:

1. o objetivo descreve conhecimento ou desempenho observável?
2. os pré-requisitos foram ensinados ou explicitamente ligados ao percurso?
3. a primeira Unidade situa o problema para quem encontra o assunto pela primeira
   vez?
4. a terminologia aparece depois de um referente compreensível?
5. a teoria cobre tudo o que as práticas cobram?
6. exemplos e representações preservam as convenções acadêmicas pertinentes?
7. as práticas variam por função, e não por ornamentação?
8. o apoio diminui de maneira justificável?
9. o retorno permite compreender e agir?
10. há retomada quando retenção ou discriminação posterior são relevantes?
11. a Unidade permanece autocontida nos dados particulares necessários à tarefa?
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

A quantidade real de Unidades depende do conteúdo. O exemplo mostra uma lógica de
progressão, não uma cota de produção.

## Relações com os demais documentos

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
