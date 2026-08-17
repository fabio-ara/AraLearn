# Glossário de construtos e resultados educacionais

## Finalidade

Este glossário define os conceitos usados para formular hipóteses e interpretar
avaliações do AraLearn. Sua função é impedir que um nome de interface ou um
rastro técnico seja promovido indevidamente a medida psicológica, educacional
ou social.

Um glossário técnico responde, por exemplo, o que são IndexedDB, RAG, CAS,
schema ou sincronização. Este glossário responde o que significam agência,
retomada, compreensão, carga cognitiva extrínseca e qualidade pedagógica. Os
termos de implementação estão no [Glossário técnico](glossario-tecnico.md).

## Como usar as definições

Cada entrada distingue:

- **definição de trabalho**: significado adotado na documentação;
- **manifestação possível**: comportamento ou produto que pode contribuir para
  observar o conceito;
- **não exemplo ou interpretação proibida**: dado que não deve ser tratado como
  equivalente;
- **evidência necessária**: condição mínima para uma interpretação responsável.

Nenhuma manifestação isolada mede automaticamente um construto. Uma pessoa que
rejeita uma sugestão pode estar exercendo agência, mas o clique em “rejeitar”
não revela, sozinho, se ela compreendeu a alternativa e agiu intencionalmente.

## Tipos de termo

### Construto teórico

Conceito abstrato usado para explicar fenômenos, apoiado por teoria e pesquisa.
Não é diretamente observável; precisa ser operacionalizado por manifestações e
instrumentos. Exemplos: agência e aprendizagem autorregulada.

### Resultado

Fenômeno que uma avaliação procura observar sob condições declaradas. Pode ser
simples, como sucesso numa tarefa de retomada, ou composto, como qualidade
pedagógica avaliada por rubrica.

### Termo operacional

Vocabulário criado ou delimitado pelo AraLearn para organizar o produto. Não
tem pretensão de se tornar um construto universal. Exemplos: microssequência e
microteoria.

### Política de design

Escolha normativa que determina como o produto deve se comportar. Ela pode
gerar hipóteses, mas não é evidência de efeito. Exemplo: não converter tentativas
em nota ou diagnóstico.

### Condição de tarefa

Característica do cenário em que uma atividade ocorre. Exemplo: prática de
baixa consequência, sem nota ou ranking.

## Construtos relacionados à autonomia

### Agência

- **Tipo:** construto teórico.
- **Definição:** capacidade situada de agir intencionalmente, fazer escolhas e
  produzir efeitos dentro de condições sociais e materiais
  ([Bandura (2001)](referencias.md#ref-bandura2001agency)).
- **Manifestação possível:** escolher entre alternativas compreendidas,
  justificar uma decisão, rejeitar uma sugestão, revisar e reverter.
- **Não equivale a:** quantidade de botões, personalizações, cliques ou ausência
  de restrições.
- **Evidência necessária:** tarefa que exija escolha real, explicação da
  consequência e possibilidade efetiva de agir de outro modo, complementada
  por relato ou entrevista.

### Aprendizagem autorregulada

- **Tipo:** construto teórico.
- **Definição:** processo cíclico que envolve planejamento, execução,
  monitoramento e reflexão sobre a própria aprendizagem
  ([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)).
- **Manifestação possível:** formular meta, escolher estratégia, acompanhar sua
  adequação e ajustá-la diante de resultado ou feedback.
- **Não equivale a:** estudar sem professor, progredir no curso, acessar com
  frequência ou marcar uma unidade para revisão.
- **Evidência necessária:** combinação de tarefa, relato situado, produto e
  instrumento apropriado; o indicador precisa corresponder à fase investigada.

### Aprendizagem autodirigida

- **Tipo:** construto teórico.
- **Definição:** iniciativa do aprendiz na identificação de necessidades,
  formulação de objetivos, escolha de recursos, execução e avaliação do processo
  ([Knowles (1975)](referencias.md#ref-knowles1975selfdirected)).
- **Manifestação possível:** definir e revisar objetivos, buscar recursos e
  justificar alterações do percurso.
- **Não equivale a:** abandono institucional, improviso, ausência de mediação ou
  estudo solitário.
- **Evidência necessária:** observar decisões sobre o processo em contexto, e
  não apenas navegação livre.

### Apoio à autonomia

- **Tipo:** construto teórico aplicado ao contexto.
- **Definição:** condições que combinam escolha significativa, justificativa,
  escuta e estrutura, em vez de controle arbitrário ou abandono
  ([Ryan e Deci (2020)](referencias.md#ref-ryan2020motivation)).
- **Manifestação possível:** compreender por que uma orientação existe, poder
  recusá-la legitimamente e dispor de suporte para decidir.
- **Não equivale a:** liberdade irrestrita, ausência de regras ou muitas opções.
- **Evidência necessária:** avaliação da qualidade da escolha e da percepção de
  suporte, não contagem de controles.

### Controle humano da IA

Neste glossário, **inteligência artificial (IA)** designa modelos ou serviços
computacionais que propõem, transformam ou analisam conteúdo durante a autoria.

- **Tipo:** política de design e construto de avaliação.
- **Definição:** autoridade efetiva da pessoa sobre intenção, escopo, revisão e
  consequência de uma operação assistida.
- **Manifestação possível:** conhecer o alvo, rejeitar, iterar, corrigir,
  desfazer, restaurar e justificar a decisão final.
- **Não equivale a:** botão de confirmação, aviso genérico ou revisão humana
  apenas nominal.
- **Evidência necessária:** tarefas com erro, sugestão inadequada e mudança de
  escopo, acompanhadas de explicação sobre responsabilidade e consequência.
  Diretrizes de interação humano–IA fundamentam a necessidade de comunicação e
  correção ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).

## Construtos relacionados ao processamento da tarefa

### Componente de conhecimento

- **Tipo:** unidade teórica latente.
- **Definição:** componente inferido que relaciona condições, respostas e
  mudanças de desempenho em uma análise de aprendizagem; sua granularidade
  depende da população e das tarefas
  ([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)).
- **Manifestação possível:** padrão de sucesso, erro, explicação ou aplicação
  em conjunto apropriado de tarefas.
- **Não equivale a:** tópico, unidade de estudo, unidade
  editorial, campo de banco ou algo que o sistema observe diretamente.
- **Evidência necessária:** modelo explícito, tarefas alinhadas, inferência e
  exame de alternativas compatíveis com a finalidade da avaliação.

### Interatividade de elementos

- **Tipo:** propriedade teórica da relação pessoa–tarefa.
- **Definição:** necessidade de processar simultaneamente elementos que
  interagem para compreender ou realizar uma tarefa; depende da estrutura da
  informação e do conhecimento prévio
  ([Chen et al. (2023)](referencias.md#ref-chen2023elementinteractivity)).
- **Manifestação possível:** relações que não podem ser aprendidas ou
  executadas isolando seus componentes sem perder a operação.
- **Não equivale a:** quantidade de objetos na tela, extensão do texto,
  dificuldade percebida ou score calculado pelo AraLearn.
- **Evidência necessária:** definição do elemento, público, tarefa e relações
  simultâneas, acompanhada de medida compatível quando houver alegação sobre
  carga.

### Carga cognitiva extrínseca

- **Tipo:** construto teórico.
- **Definição:** demanda de memória de trabalho introduzida pela apresentação ou
  pelo procedimento e dispensável à operação que se pretende aprender
  ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)).
- **Manifestação possível:** busca visual desnecessária, alternância entre
  fontes que precisam ser integradas, passos operacionais, atenção dividida e
  erros de leitura.
- **Não equivale a:** complexidade inerente, dificuldade total percebida,
  quantidade de texto ou esforço produtivo.
- **Evidência necessária:** comparação entre apresentações ou procedimentos,
  com tarefa equivalente, observação e instrumento adequado.

### Dificuldades desejáveis

- **Tipo:** construto teórico.
- **Definição:** condições que podem prejudicar o desempenho imediato e, sob
  circunstâncias apropriadas, favorecer retenção ou transferência posterior
  ([Bjork e Bjork (2011)](referencias.md#ref-bjork2011desirable)).
- **Manifestação possível:** recuperação espaçada ou discriminação entre
  categorias quando o estudante possui base para realizar a operação.
- **Não equivale a:** confusão, enunciado ambíguo, pré-requisito ausente,
  sobreposição visual, latência ou qualquer dificuldade.
- **Evidência necessária:** resultado posterior compatível e comparação; maior
  esforço imediato não basta.

### Prática de recuperação

- **Tipo:** construto operacionalizado.
- **Definição:** tentativa de produzir conhecimento ou decisão sem nova
  exposição integral ao conteúdo-alvo ([Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Carpenter et al. (2022)](referencias.md#ref-carpenter2022spacing)).
- **Manifestação possível:** recordar, discriminar, explicar, completar,
  ordenar ou aplicar sem resposta já exposta.
- **Não equivale a:** reler, tocar, reconhecer resposta visível ou avançar.
- **Evidência necessária:** especificar o que deveria ser recuperado, que apoio
  estava disponível e que resposta foi produzida.

### Gesto de entrada

- **Tipo:** termo técnico observável.
- **Definição:** movimento físico captado pela interface, como toque, deslize,
  arrasto ou pinça.
- **Manifestação possível:** evento de ponteiro ou toque com alvo e instante
  identificados.
- **Não equivale a:** ação de interface concluída, operação intelectual,
  atenção, intenção ou aprendizagem.
- **Evidência necessária:** instrumentação técnica validada e contexto da
  interface; o gesto isolado não sustenta interpretação psicológica.

### Ação de interface

- **Tipo:** termo técnico observável.
- **Definição:** mudança de estado solicitada por um controle, como abrir,
  avançar, voltar, confirmar ou anotar.
- **Manifestação possível:** transição de estado aceita, recusada ou interrompida.
- **Não equivale a:** gesto que a iniciou, operação-alvo da tarefa ou resultado
  educacional.
- **Evidência necessária:** estado anterior, ação, alvo e resultado técnico.

### Operação-alvo da tarefa

- **Tipo:** termo operacional de planejamento.
- **Definição:** operação que a tarefa solicita sobre o conteúdo, como localizar,
  comparar, relacionar, ordenar, calcular, transformar, explicar ou provar.
- **Manifestação possível:** resposta e justificativa coerentes com o objetivo.
- **Não equivale a:** gesto de entrada, modalidade visual, botão, processo
  cognitivo diretamente observado ou garantia de aprendizagem.
- **Evidência necessária:** correspondência explícita entre objetivo, tarefa,
  resposta e critério de avaliação.

### Ação epistêmica

- **Tipo:** conceito teórico aplicado à interação.
- **Definição:** ação externa realizada para revelar informação ou simplificar
  o trabalho cognitivo, distinguível de uma ação pragmática que apenas aproxima
  o estado final ([Kirsh e Maglio (1994)](referencias.md#ref-kirshmaglio1994epistemic);
  [Kirsh (2010)](referencias.md#ref-kirsh2010external)).
- **Manifestação possível:** reorganizar uma representação para tornar uma
  relação perceptível antes de decidir.
- **Não equivale a:** todo toque, rolagem, anotação ou manipulação externa.
- **Evidência necessária:** tarefa e análise que demonstrem a função da ação,
  incluindo explicações alternativas.

### Atenção

- **Tipo:** família de construtos cognitivos.
- **Definição:** seleção de informação ou de representações internas segundo
  mecanismos e condições específicos
  ([Chun et al. (2011)](referencias.md#ref-chun2011attention)).
- **Manifestação possível:** desempenho em tarefa e medidas validadas para o
  mecanismo atencional investigado.
- **Não equivale a:** visibilidade na viewport, foco de teclado, clique, rolagem,
  tempo de permanência, conclusão ou ausência de troca de janela.
- **Evidência necessária:** definição do mecanismo, desenho e instrumento
  compatíveis; explicações neurocientíficas exigem cautela de tradução entre
  níveis ([Howard-Jones (2014)](referencias.md#ref-howardjones2014neuroscience)).

### Engajamento

- **Tipo:** construto multidimensional.
- **Definição:** relação situada com a atividade que pode envolver dimensões
  comportamentais, cognitivas e afetivas
  ([Henrie et al. (2015)](referencias.md#ref-henrie2015engagement)).
- **Manifestação possível:** combinação de participação observável,
  autorrelato, produto e desempenho conforme a dimensão investigada.
- **Não equivale a:** `engagement_score`, cliques, tempo, frequência, sequência
  de rolagem ou qualquer rastro isolado.
- **Evidência necessária:** definição da dimensão, instrumento e triangulação
  proporcionais ao uso; logs e autorrelatos podem divergir sistematicamente
  ([Parry et al. (2021)](referencias.md#ref-parry2021digitalmedia)).

## Resultados de aprendizagem

### Compreensão

- **Tipo:** resultado.
- **Definição:** construção de significado demonstrada por explicação,
  discriminação, relação ou aplicação coerente.
- **Manifestação possível:** explicar por que uma resposta se aplica,
  distinguir casos próximos ou aplicar o conceito a exemplo apropriado.
- **Não equivale a:** concluir uma unidade, repetir frase, reconhecer familiaridade ou
  declarar confiança.
- **Evidência necessária:** tarefa e rubrica alinhadas ao conceito, com controle
  de pistas e conhecimentos prévios.

### Retenção

- **Tipo:** resultado.
- **Definição:** disponibilidade posterior do conhecimento ou desempenho
  aprendido.
- **Manifestação possível:** realizar tarefa equivalente depois de intervalo
  justificado.
- **Não equivale a:** progresso salvo, repetição imediata ou lembrança do layout.
- **Evidência necessária:** medida adiada e descrição do intervalo; o resultado
  imediato não pode substituí-la.

### Transferência

- **Tipo:** resultado.
- **Definição:** aplicação de conhecimento ou estratégia a situação
  suficientemente nova, preservando a estrutura relevante.
- **Manifestação possível:** resolver problema novo e explicar a relação com o
  princípio aprendido.
- **Não equivale a:** trocar números, nomes ou cores numa tarefa isomórfica
  evidente.
- **Evidência necessária:** justificar a distância entre tarefa de aprendizagem
  e tarefa de transferência; a literatura mostra que transferência de prática
  por teste é possível, mas moderada ([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

## Resultados de interação e continuidade

### Usabilidade

- **Tipo:** resultado contextual.
- **Definição:** efetividade, eficiência e satisfação de pessoas específicas ao
  alcançar objetivos específicos em determinado contexto, conforme a ISO
  9241-11:2018 ([International Organization for Standardization (2018)](referencias.md#ref-iso2018usability)).
- **Manifestação possível:** sucesso, erro, necessidade de ajuda, tempo
  interpretado com cautela e percepção numa jornada.
- **Não equivale a:** beleza, preferência isolada, aprendizagem ou número de
  acessos.
- **Evidência necessária:** público, objetivo, contexto e critérios declarados.

### Retomada

- **Tipo:** resultado de continuidade.
- **Definição:** restabelecimento do objetivo, do ponto e do contexto necessários
  para continuar uma atividade suspensa.
- **Manifestação possível:** localizar o ponto correto, explicar o que estava em
  andamento e continuar sem erro relevante.
- **Não equivale a:** abrir a aplicação, permanecer online ou lembrar um termo.
- **Evidência necessária:** interrupção controlada ou naturalística, intervalo,
  tarefa de continuação e explicações alternativas
  ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)).

### Aprendizagem móvel situada

- **Tipo:** lente de contexto.
- **Definição:** atividade de aprendizagem mediada por dispositivo móvel em
  condições cotidianas que podem variar em tempo, ambiente, movimento e rede.
- **Manifestação possível:** estudo em diferentes contextos e retomada entre
  sessões.
- **Não equivale a:** conteúdo curto, superficial ou universalmente vantajoso.
- **Evidência necessária:** caracterização real do contexto e do dispositivo; a
  diversidade da literatura de interfaces móveis exige avaliação situada
  ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)).

## Feedback e participação

### Feedback formativo

- **Tipo:** construto operacionalizado.
- **Definição:** informação específica destinada a apoiar interpretação e ação
  posterior sobre tarefa ou aprendizagem ([Nicol e Macfarlane-Dick (2006)](referencias.md#ref-nicol2006formative); [Shute (2008)](referencias.md#ref-shute2008feedback)).
- **Manifestação possível:** identificar distinção, compreender causa, escolher
  revisão e aplicar em nova tarefa.
- **Não equivale a:** nota, elogio genérico ou “certo/incorreto” isolado.
- **Evidência necessária:** examinar conteúdo, foco, timing e ação posterior.

### Feedback literacy

- **Tipo:** construto teórico.
- **Definição:** capacidade de apreciar feedback, fazer julgamentos, manejar
  respostas afetivas e agir ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)).
- **Manifestação possível:** explicar a mensagem, compará-la com o próprio
  trabalho e revisar de modo fundamentado.
- **Não equivale a:** receber, abrir, aceitar ou agradecer.
- **Evidência necessária:** tarefa de interpretação e uso, preferencialmente
  acompanhada de entrevista ou produto revisado.

### Colaboração situada

- **Tipo:** construto teórico aplicado.
- **Definição:** coordenação e construção de prática ou significado num contexto
  social ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)).
- **Manifestação possível:** negociação, contribuição, revisão, divisão de
  responsabilidade e transformação do produto comum.
- **Não equivale a:** convite, copresença, papel, acesso ou quantidade de
  mensagens.
- **Evidência necessária:** análise do processo, das relações e do produto
  coletivo, incluindo conflitos e casos negativos.

### Anotação ancorada

- **Tipo:** termo operacional alinhado ao modelo Web Annotation; na interface,
  aparece como **Observação**.
- **Definição:** anotação com corpo e alvo endereçável, autoria, motivação e
  estado. Pode registrar dúvida, possível erro, confusão ou sugestão ligada a
  Curso, Módulo, Lição, Tópico, Microssequência ou Unidade; podem coexistir
  várias no mesmo alvo
  ([W3C (2017)](https://www.w3.org/TR/annotation-model/)).
- **Manifestação possível:** texto registrado, alvo reencontrável, autoria e
  decisão de ação.
- **Não equivale a:** achado de auditoria, mensagem de chat sem alvo,
  diagnóstico de dificuldade, domínio ou qualidade docente. Categoria, estado,
  resposta e resolução tampouco são medidas desses construtos.
- **Evidência necessária:** corpo, alvo e contexto; ausência de observação não
  significa compreensão. Classificação automática só identifica o próprio
  Tópico quando ele é o alvo exato; outros assuntos exigem seleção humana
  explícita, não inferência pela prosa.

## Resultados compostos de qualidade

### Qualidade pedagógica

- **Tipo:** resultado composto.
- **Definição:** alinhamento entre propósito, conhecimentos prévios,
  progressão, explicação, representação, prática e feedback.
- **Manifestação possível:** teoria cobre a prática, não há saltos ocultos,
  exemplos são pertinentes e tarefas verificam o objetivo.
- **Não equivale a:** schema válido, grande volume, fluência textual ou
  aprovação de uma única pessoa.
- **Evidência necessária:** rubrica explícita, revisão de conteúdo e tarefas com
  o público pertinente.

### Qualidade representacional

- **Tipo:** resultado composto.
- **Definição:** fidelidade às convenções acadêmicas do domínio e apoio à
  operação-alvo da tarefa sem ambiguidade evitável.
- **Manifestação possível:** especialista reconhece a notação e novato consegue
  interpretar a relação depois da base necessária.
- **Não equivale a:** ausência de overflow, aparência sofisticada, uso de
  Graphviz, Vega ou outra biblioteca.
- **Evidência necessária:** auditoria disciplinar, caso complexo e tarefa de
  interpretação.

### Qualidade autoral

- **Tipo:** resultado composto.
- **Definição:** correção factual, coerência, adequação ao público,
  rastreabilidade e responsabilidade editorial.
- **Manifestação possível:** conteúdo correto, justificável, revisável e
  alinhado ao planejamento.
- **Não equivale a:** origem humana ou automatizada, texto fluente ou contrato
  aceito.
- **Evidência necessária:** rubrica, revisão independente, casos adversos e
  registro de retrabalho.

### Conformidade instrucional do artefato

- **Tipo:** resultado operacional delimitado, não construto psicológico.
- **Definição:** correspondência entre regras de desenho explicitadas e o
  conteúdo materializado numa revisão identificada.
- **Manifestação possível:** referências, ordem, resources, requisitos e
  evidência pública permanecem coerentes segundo checks e revisão semântica.
- **Não equivale a:** qualidade pedagógica global, aprendizagem, compreensão,
  eficácia do reparo ou validade de um parâmetro.
- **Evidência necessária:** audit run reproduzível, unidades reais, regras
  declaradas, julgamento humano nos itens semânticos e reauditoria após reparo.

## Termos operacionais do modelo didático

### Segmento discursivo

Trecho delimitado segundo critério declarado, como relação retórica, intenção
discursiva, subtópico, proposição ou função informacional. Não existe uma
fronteira semântica universal independente de teoria, procedimento e tarefa
([Mann e Thompson (1988)](referencias.md#ref-mann1988rst);
[Passonneau e Litman (1997)](referencias.md#ref-passonneau1997segmentation);
[Pons Bordería e Borreguero Zuloaga (2024)](referencias.md#ref-ponsborderia2024unidades)).
Uma segmentação de pesquisa registra critério, versão, anotador e eventual
adjudicação. Parágrafo é unidade gráfica possível, não prova de unidade
conceitual, retórica ou instrucional.

### Extensão editorial

Contagem observável de caracteres, palavras, linhas, altura, duração ou payload.
Pode orientar ergonomia, renderização e limites técnicos, mas não mede por si
mesma densidade conceitual, dificuldade, completude, atenção ou compreensão.

### Complexidade textual

Família multidimensional de propriedades linguísticas, discursivas, lexicais e
sintáticas, dependente de população, corpus e tarefa
([Graesser et al. (2004)](referencias.md#ref-graesser2004cohmetrix);
[Leal et al. (2024)](referencias.md#ref-leal2024nilcmetrix);
[Gazzola et al. (2022)](referencias.md#ref-gazzola2022textcomplexity)). Uma
métrica automática pode servir como descritor ou covariável; não deve virar
diretamente nível pedagógico, diagnóstico ou nota de qualidade.

### Unidade de estudo

Menor unidade persistida, ordenável, endereçável e renderizável apresentada em
Estudo e Autoria. Pode ser somente expositiva ou também reunir uma ou mais
representações, solicitação de resposta e feedback. É termo operacional próprio
do AraLearn: não equivale a gênero discursivo, componente de conhecimento ou
unidade psicológica. A aparência corrente em bloco retangular não define essa
ontologia, e o termo não promete interatividade quando ela não existe.

### Flashcard

Item específico organizado em torno de uma pista e de uma resposta para
recuperação. Pode integrar prática distribuída, mas formato, agendamento e
resultado não são sinônimos. Explicação, diagrama, simulação e unidade de
apresentação sem recuperação não são flashcards; uma revisão de escopo em
profissões da saúde não deve ser generalizada automaticamente a outros domínios
([Barrison et al. (2025)](referencias.md#ref-barrison2025flashcards)).

### Coerência do percurso

Continuidade entre objetivo, pré-requisito, explicação, exemplo, prática,
feedback e retomada. Não equivale a sequência longa ou uniformidade visual.

### Unidade de análise instrucional

Recorte editorial revisável que relaciona fonte, objetivo, pressuposto de
conhecimento prévio, explicação e evidência pretendida. É uma
operacionalização do AraLearn; não equivale a componente de conhecimento
validado, conceito psicológico ou unidade pedagógica universal.

### Conjunto de coordenação

Conjunto de unidades e relações que o planejamento presume que precisam
permanecer disponíveis simultaneamente. Sua cardinalidade pode ser calculada,
mas não mede carga cognitiva, capacidade ou dificuldade individual.

### Requisito de explicação

Necessidade contextual ligada a unidades ou relações, como definição,
mecanismo, condição de aplicação, limite, contraste, exemplo ou justificativa
de procedimento. É instrumento de planejamento e auditoria, não checklist
universal nem nota de qualidade.

### Forma de explicação

Realização observável pela qual uma unidade ou relação é desenvolvida, como
definição simples, exemplo concreto, mecanismo, contraste, condição de
aplicação, limite, exemplo resolvido ou ligação entre representações. A forma
pode ser exigida somente quando aplicável e não é sinônimo de menção de uma
palavra, comprimento do texto ou qualidade comprovada.

### Requisito de evidência

Relação entre objetivo, alvo, operação, tarefa e forma aceitável de desempenho.
Serve para auditar correspondência entre plano e prática; não transforma uma
atividade em instrumento psicométrico nem demonstra domínio.

### Oportunidade distinta de prática

Ocorrência em que alvo, operação e estrutura semântica permitem produzir a
evidência pretendida sob um caso ou condição declarado. Troca cosmética de
texto, ordem visual ou componente não cria necessariamente outra oportunidade.

### Dimensão de variação da prática

Aspecto declarado que muda entre oportunidades voltadas ao mesmo requisito de
evidência, como caso ou dados, contexto, característica da tarefa,
representação externa ou nível de apoio. A operação-alvo permanece invariável;
trocar a operação tende a constituir outro requisito, não uma variação do
mesmo.

### Fidelidade da tarefa

Descrição categorial dos aspectos do desempenho, ambiente e restrições que uma
tarefa preserva ou omite. Não equivale a escala universal de autenticidade;
uma representação pode ser adequada a uma evidência e insuficiente para outra.

### Diagnóstico pedagógico contextual

Síntese de planejamento que relaciona condições de aprendizagem, exigências do
conteúdo, dificuldades previstas e respostas de desenho antes da
materialização. Não equivale a avaliação clínica ou psicométrica, perfil
individual, medição de domínio nem predição de eficácia.

### Condição de aprendizagem

Informação contextual verificável ou hipótese explicitada sobre público,
conhecimento prévio presumível, tarefa, fonte, idioma, convenção, dispositivo ou
meio disponível. Não equivale a prescrição pedagógica, perfil individual nem
diagnóstico de capacidade.

### Exigência do conteúdo

Operação, relação, convenção ou pré-requisito que o objetivo e o objeto de
estudo exigem coordenar. Não equivale a dificuldade já demonstrada pelo
estudante nem a estratégia escolhida para ensiná-la.

### Dificuldade prevista

Hipótese revisável de que uma exigência específica do conteúdo pode dificultar
o objetivo para o público nas condições declaradas. Não equivale a déficit do
estudante, erro já observado ou resultado de aprendizagem medido.

### Resposta de desenho

Decisão local aprovada e ligada a uma dificuldade prevista, como introduzir um
pré-requisito, decompor uma explicação, oferecer exemplo, escolher uma
representação ou planejar prática. Não equivale a estilo global do curso nem a
alegação de que a resposta será eficaz.

### Microssequência didática

Construto próprio do AraLearn: conjunto ordenado de unidades de estudo e
interação orientado a um objetivo instrucional delimitado, com contexto, teoria
e prática suficientes para esse escopo. Não corresponde automaticamente a
parágrafo, subtópico, duração ou quantidade fixa e não é apresentado como
unidade universal da pesquisa educacional.

### Parte de autoria

Unidade operacional que agrupa trabalho autoral manejável segundo coesão,
dependências, complexidade das microssequências e carga de revisão. É uma
unidade de materialização, não um nível didático. A faixa orientativa de 7 a 12
Partes por curso é um valor padrão configurável para coordenar produção e
revisão, não cota pedagógica nem quantidade universal; cada Parte pode abranger
várias microssequências.

### Microteoria

Conjunto de unidades teóricas suficiente para fundamentar as práticas locais.
Não significa teoria resumida, rasa ou desconectada de pré-requisitos.

### Baixa consequência

Condição de prática sem nota, ranking ou penalização acumulada. Não significa
ausência de desafio, feedback ou avaliação.

### Estado de estudo não punitivo

Política segundo a qual tentativas, ajuda, tempo e resposta revelada não se
transformam em punição, ranking ou diagnóstico automático. É decisão normativa,
não resultado demonstrado sobre ansiedade.

### Frugalidade

Critério de proporcionalidade de armazenamento, payload, latência, custo e
manutenção ao contexto do produto. Não autoriza reduzir segurança,
acessibilidade, rigor ou qualidade pedagógica.

### Analytics centrado nas pessoas

Orientação segundo a qual pergunta, participação, interpretação, intervenção e
limite precedem a coleta de dados ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)). Não equivale a dashboard, predição ou vigilância.

## Termos operacionais de experimentação

### Experimento instrucional parametrizado

- **Tipo:** termo operacional e protocolo de governança.
- **Definição:** comparação planejada que parte de uma base comum aprovada,
  declara fatores e condições explícitas, materializa variantes rastreáveis e
  congela a revisão exata entregue a cada participante.
- **Não equivale a:** ensaio causal válido, teste A/B improvisado, publicação de
  duas versões ou comparação posterior de uso.
- **Evidência necessária:** além da proveniência técnica, exige pergunta,
  população, unidade de atribuição, instrumentos, procedimento, análise e
  explicações alternativas compatíveis com a inferência pretendida.

### Fator experimental

- **Tipo:** termo metodológico operacionalizado.
- **Definição:** dimensão deliberadamente variada entre condições e vinculada a
  uma definição ordinária de parâmetro ou a um `ResourceSet` versionado.
- **Não equivale a:** toda diferença entre artefatos, configuração escondida ou
  rótulo livre como “baixo” e “alto”.
- **Evidência necessária:** valores governados, alvos, versão, relação com a
  hipótese e verificação de que diferenças não planejadas foram separadas.

### Condição experimental

- **Tipo:** termo metodológico operacionalizado.
- **Definição:** tupla explícita de valores para todos os fatores de um
  protocolo, aplicada ao escopo congelado e sob os mesmos invariantes
  declarados.
- **Não equivale a:** grupo de pessoas, variante visual, atribuição de
  participante, estado corrente do Curso ou combinação fatorial gerada
  implicitamente.
- **Evidência necessária:** condição versionada, locks emitidos pelo servidor,
  materialização auditada e vínculo inequívoco com a variante entregue.

### Variante instrucional

- **Tipo:** termo operacional.
- **Definição:** Curso derivado de uma base comum para uma condição explícita,
  com identidade, parâmetros e relação de origem rastreáveis. A comparação
  precisa identificar qual revisão de cada Curso foi efetivamente analisada,
  sem tornar o Curso vivo permanentemente imutável.
- **Não equivale a:** cópia sem proveniência, branch de código, condição em si
  ou garantia de que somente o fator pretendido mudou.
- **Evidência necessária:** diff factual, classificação das diferenças, decisão
  humana e freeze da revisão exata antes da atribuição.

### Atribuição de participante

- **Tipo:** termo metodológico operacionalizado.
- **Definição:** vínculo append-only entre enrollment consentido e uma revisão
  congelada de variante, produzido por regra manual, pseudoaleatória
  reproduzível ou balanceamento simples declarado.
- **Não equivale a:** consentimento, acesso direto ao Curso, exposição efetiva,
  adesão à atividade ou randomização estatisticamente suficiente.
- **Evidência necessária:** unidade de atribuição, algoritmo e versão, ocultação
  adequada, perdas, desvios e análise coerente com o procedimento real.

### Métrica

- **Tipo:** regra de cálculo operacional.
- **Definição:** transformação versionada de dados declarados, com fórmula,
  unidade, denominador, filtros e tratamento de ausências reproduzíveis.
- **Não equivale a:** medida obtida, indicador interpretado, desfecho de pesquisa
  ou construto validado.
- **Evidência necessária:** dados de entrada preservados, versão e teste do
  cálculo; precisão computacional não valida a interpretação educacional.

### Medida

- **Tipo:** valor observado ou derivado.
- **Definição:** resultado da observação ou da aplicação de uma métrica sob
  instrumento, população, momento e condições identificados.
- **Não equivale a:** construto, explicação causal ou decisão.
- **Evidência necessária:** qualidade e validade proporcionais à interpretação e
  ao uso pretendidos
  ([Messick (1995)](referencias.md#ref-messick1995validity);
  [American Educational Research Association et al. (2014)](referencias.md#ref-aera2014standards)).

### Indicador

- **Tipo:** interpretação operacional orientada a uma finalidade.
- **Definição:** medida ou combinação de medidas interpretada segundo regra
  explícita para apoiar acompanhamento ou decisão delimitada.
- **Não equivale a:** dado bruto, dashboard, alerta automático ou verdade sobre
  atenção, engajamento, domínio e qualidade.
- **Evidência necessária:** finalidade, limiar ou modelo, interpretação permitida
  e proibida, explicações alternativas e consequência da decisão.

### Desfecho de pesquisa

- **Tipo:** resultado selecionado no protocolo.
- **Definição:** variável de resultado definida antes da interpretação, com
  unidade, instrumento, momento, versão e regra de cálculo identificáveis.
- **Não equivale a:** clique, conclusão, evento de telemetria, score técnico,
  achado de avaliação ou qualquer dado disponível.
- **Evidência necessária:** validade e confiabilidade proporcionais ao uso,
  população e condição de coleta, além de tratamento de dados ausentes e casos
  adversos.

### Inferência causal

- **Tipo:** interpretação metodológica.
- **Definição:** conclusão de que uma diferença de condição contribuiu para uma
  diferença de desfecho sob desenho, pressupostos e análise explicitados.
- **Não equivale a:** correlação, diferença descritiva, assignment determinístico,
  freeze reproduzível ou execução bem-sucedida de testes de software.
- **Evidência necessária:** comparabilidade, aderência, mensuração adequada,
  análise da incerteza e exame de vieses, contaminação, perdas e explicações
  alternativas. O AraLearn não concede essa interpretação automaticamente.

## Distinções metodológicas

### Design-Based Research — DBR

Investigação iterativa de uma intervenção educacional em contexto autêntico,
relacionando teoria, desenho e prática ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)). Produz explicações situadas e princípios de design; não é
sinônimo de desenvolvimento ágil ou teste de interface.

### Design Science Research — DSR

Construção e avaliação rigorosa de artefato e conhecimento de design
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). Não é sinônimo de engenharia de
software nem substitui DBR quando a pergunta é educacional e situada.

### Avaliação formativa do artefato

Episódio destinado a localizar falhas e orientar revisão. Seu produto é uma
decisão de alterar, manter ou remover. Não se confunde com feedback formativo ao
estudante.

### Avaliação somativa do artefato

Episódio destinado a julgar uma versão segundo critérios e finalidade
predefinidos. Não constitui prova universal nem elimina a necessidade de
explicitar contexto e limites.

## Regra de operacionalização

Qualquer métrica, indicador ou desfecho futuro deve registrar:

1. construto ou resultado;
2. unidade de análise;
3. manifestação observada;
4. instrumento e qualidade da medida;
5. interpretação permitida;
6. explicações alternativas;
7. intervenção possível;
8. retenção, acesso, exclusão e custo do dado;
9. unidade, denominador e algoritmo quando houver valor numérico;
10. versão e proveniência da operacionalização.

Se essa cadeia não puder ser preenchida, o dado não deve entrar apenas por
estar tecnicamente disponível. Um termo operacional pode tornar-se objeto de
investigação, mas não deve ser apresentado como construto estabelecido sem
desenvolvimento e validação próprios.
## Construtos e dados em Resultados

- **Conclusão estrutural explícita** descreve um estado funcional persistido;
  não equivale a atenção, esforço, domínio ou aprendizagem.
- **Completude de instrumento** descreve observações presentes e ausentes no
  recorte esperado; não mede adesão sem uma definição prévia do protocolo.
- **Diferença entre condições** é descrição de desenho ou desfecho; não é efeito
  causal sem identificação, instrumento válido e análise apropriada.
- **Ausência** é dado não disponível ou explicitamente ausente. Não deve ser
  convertida automaticamente em zero, fracasso ou abandono.
- **Fit de resource** (`canonical`, `versatile`, `substitute`) descreve a relação
  declarada com a necessidade instrucional; não ordena qualidade.
