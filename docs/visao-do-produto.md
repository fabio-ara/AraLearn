# Visão do produto

O AraLearn é um ambiente móvel de estudo e autoria de Cursos. Seu propósito é
transformar um conjunto extenso de assuntos em um percurso que explique,
exemplifique, proponha práticas e possa ser retomado depois de uma interrupção.
Ele organiza condições para que o estudo seja compreensível, praticável e
revisável. A aprendizagem ainda depende do trabalho intelectual do estudante e
não pode ser inferida da simples exposição às Unidades.

Este documento apresenta o problema tratado, as escolhas centrais do produto e
os limites dessas escolhas. Os procedimentos de uso estão em [Uso do
aplicativo](uso-do-app.md); os conceitos pedagógicos são aprofundados em [Modelo
didático](modelo-didatico.md).

## Problema educacional e problema de interação

Encontrar informação não equivale a dispor de um percurso de aprendizagem. Uma
pessoa pode ter acesso a livros, aulas, vídeos e respostas de sistemas de
linguagem e ainda precisar descobrir sozinha:

- quais conceitos precisam ser apresentados primeiro;
- quanto conteúdo cabe em uma etapa sem perder a continuidade;
- em que momento observar um exemplo ou uma representação visual;
- que prática exige a operação-alvo pretendida;
- como interpretar o retorno e retomar o estudo posteriormente.

Essa dificuldade possui uma dimensão pedagógica e outra de interação. Na
dimensão pedagógica, explicações muito condensadas podem ocultar pré-requisitos
e transferir ao estudante o trabalho de reconstruir relações que deveriam ter
sido ensinadas. Na interação, uma interface que exige muitas decisões ou perde
o estado após uma interrupção acrescenta esforço alheio ao objeto de estudo.

A teoria da carga cognitiva distingue o esforço exigido pelo conteúdo daquele
produzido pela forma de apresentação. Essa distinção fundamenta a busca por
segmentação, explicitação de relações e remoção de elementos que não contribuem
para a tarefa ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). A
segmentação, entretanto, não autoriza resumir a teoria até torná-la incompleta:
se um assunto exige mais etapas, o Curso deve usar mais Unidades.

## Unidade de organização do estudo

O conteúdo segue uma hierarquia estável:

```text
Curso → Módulo → Lição → Microssequência didática → Unidade de estudo
```

Cada nível cumpre uma função distinta:

- **Curso** delimita a finalidade e o campo de conhecimento;
- **Módulo** reúne uma região coerente do programa;
- **Lição** organiza uma progressão que pode ser estudada como unidade;
- **Microssequência didática** articula teoria e prática em torno de uma
  finalidade local;
- **Unidade de estudo** apresenta uma contribuição delimitada para essa
  Microssequência.

A Microssequência evita dois extremos. Uma Unidade completamente isolada pode não
oferecer contexto suficiente; uma lição apresentada como bloco único pode
concentrar relações demais. A divisão intermediária mantém um contexto próximo
e permite alternar explicação, exemplo, prática e retorno. Estudos sobre
segmentação em materiais instrucionais oferecem fundamento para investigar
essa escolha, mas não comprovam por si sós a eficácia da implementação do
AraLearn ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)).

## Teoria progressiva, e não teoria resumida

O ponto de partida é um estudante que encontra o assunto pela primeira vez.
Isso não significa reduzir a profundidade. Significa introduzir o vocabulário,
situar o problema e construir as relações antes de exigir que a pessoa opere
com elas.

Uma sequência teórica pode começar por uma situação reconhecível, apresentar
um modelo simples e acrescentar camadas até alcançar a profundidade definida
para o curso. Exemplos resolvidos podem tornar visíveis decisões intermediárias
que um resultado final ocultaria ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples)). À medida que o
estudante pratica, parte desse apoio pode ser retirada de modo planejado
([Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). Metáforas e analogias são recursos de aproximação; não
substituem a definição técnica nem devem permanecer quando produzem uma
correspondência incorreta.

## Prática como parte da explicação

O AraLearn não fixa uma quantidade universal de exercícios por assunto. O
planejamento deve primeiro identificar o que o estudante precisará fazer:
recordar, distinguir, relacionar, ordenar, calcular, interpretar uma
representação ou produzir uma resposta, por exemplo. Depois, seleciona-se a
quantidade e a variedade de práticas necessárias para cobrir essas operações.

Prática de recuperação e retorno formativo possuem suporte consistente na
literatura, mas seus efeitos dependem da tarefa, do intervalo, do conteúdo e da
qualidade do retorno ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Shute (2008)](referencias.md#ref-shute2008feedback)). Por isso, o produto não reduz prática a contagem de itens
nem trata qualquer resposta como prova de domínio.

## Componentes e representações

Uma Unidade pode conter texto ou um componente especializado, como fórmula, matriz,
grafo, diagrama de conjuntos, fluxograma, tabela, código ou representação
linguística. Um componente só se justifica quando sua estrutura ajuda a perceber
algo que seria menos claro em prosa genérica.

A escolha da representação ocorre depois da intenção pedagógica. O mesmo
assunto pode exigir uma fórmula para explicitar uma relação quantitativa, um
gráfico para comparar uma distribuição e uma tabela para consultar valores.
Usar várias representações não é um benefício automático: o curso precisa
explicar as correspondências relevantes e evitar que o estudante tenha de
adivinhar por que duas formas aparecem juntas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Manter
rótulos próximos aos elementos que explicam também reduz a integração mental
desnecessária ([Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

Os componentes são distribuídos em pacotes independentes do núcleo de execução.
Essa separação permite acrescentar uma representação ou corrigir seu contrato e
sua apresentação sem reescrever a progressão, a persistência e os controles
comuns das Unidades. Cada pacote continua responsável pelas convenções da área,
pela legibilidade móvel, pela interação de prática, pelos campos textuais
editáveis e pela validação.

## Interação que preserva orientação e contexto

Uma interface de autoria não é compreensível apenas porque expõe todas as
funções. A pessoa precisa formar uma imagem de onde está, que objeto está
alterando, qual estado prevalece e como retornar. **Arquitetura da informação**
designa aqui a organização de lugares, rótulos, relações e percursos que permite
responder a essas perguntas.

O AraLearn usa a hierarquia do próprio Curso como referência comum entre
Estudo e Autoria. O título, o caminho didático, o modo ativo e o alvo corrente
permanecem visíveis nos pontos em que uma ação poderia ser ambígua. Essa
decisão privilegia **reconhecimento em vez de memorização**: a pessoa pode
reconhecer um Curso, uma Unidade, uma Fonte ou a origem de um valor na tela, em
vez de decorar identificadores, nomes de contratos ou a posição de uma área.

**Visibilidade do estado** significa tornar observável o que o sistema sabe e
o que ainda está acontecendo. Cópia local, falta de conexão, rascunho, prévia,
gravação, sincronização e conflito não são o mesmo estado. A interface precisa
mostrar essa diferença antes de pedir uma decisão. **Divulgação progressiva**
significa apresentar primeiro as ações e informações necessárias à tarefa e
revelar detalhes especializados quando passam a ser relevantes. Ela evita
exigir todo o vocabulário de componentes, pesquisa e integração no primeiro
contato, sem remover essas capacidades.

Essas são decisões de interação, não resultados de usabilidade. Demonstrar que
pessoas encontram uma função, interpretam um estado e retomam a tarefa exige
avaliação com público, objetivos e contexto definidos, conforme o conceito de
usabilidade da ISO 9241-11:2018
([International Organization for Standardization (2018)](referencias.md#ref-iso2018usability)).

## Estudo, autoria e assistência computacional

O mesmo Curso pode ser observado em dois contextos complementares:

- no **Estudo**, a pessoa lê, pratica, recebe retorno, marca uma Unidade para
  rever e registra uma observação. Também pode editar uma
  Unidade; quando o Curso é
  compartilhado, a primeira gravação cria um Curso pessoal privado sem alterar o
  original;
- na **Autoria**, a pessoa proprietária abre diretamente o Conteúdo, planeja uma
  Parte por vez, inspeciona StudyUnits, define parâmetros, mantém Fontes, registra
  Observações e consulta Analytics. O fluxo conectado pode planejar, produzir e
  revisar; a responsabilidade humana permanece em conferir o objeto e decidir o
  que deve mudar.

A assistência computacional chega ao Curso por três canais distintos. A
**Assistência por IA** dentro do aplicativo mantém uma sessão contextual em
memória para Unidade, Microssequência ou Lição. O **Model Context Protocol
(MCP)** conecta um cliente compatível às operações canônicas de Autoria. O
canal **Actions/OpenAPI** permite que um GPT personalizado use as mesmas tarefas
humanas por HTTP. Eles não compartilham protocolo, sessão, credencial ou
principal de autorização, embora obedeçam às mesmas regras de Curso.

Quando a conversa precisa mostrar conteúdo material, o cliente pode reunir um
conjunto ordenado de Unidades — de preferência uma Microssequência coerente — e
apresentá-lo no próprio chat. Cada Unidade conserva a representação final, a
resposta esperada e o feedback de práticas, a referência curta para comentário e
o desenho contextual. O mesmo conjunto possui um endereço para a área
**Conteúdo** da Autoria, onde permanece filtrado sem impedir que a pessoa retire
o filtro e percorra o restante do Curso.

Uma alteração não precisa transportar todos os Cursos. A entrada inicial recebe
descritores finos para selecionar um Curso; a composição é lida em páginas sob
uma revisão fixa somente na entrada. O contexto enviado a um serviço de
linguagem é montado para o Curso e o alvo pertinentes, e a resposta precisa
satisfazer contratos estruturais antes de ser gravada.

Respostas produzidas por modelos podem conter omissões ou erros. A assistência
é uma ferramenta de autoria sob responsabilidade humana. O AraLearn separa a
coordenação na conversa, a tarefa humana contratada, a validação e a gravação no
Curso corrente. Escopo delimitado, possibilidade de rejeitar, reabrir qualquer
ponto e pedir revisão são condições de supervisão; a existência desses
controles não prova que a pessoa compreenda o erro ou exerça controle efetivo.

**Confiança calibrada** ocorre quando a confiança e a dependência correspondem
à capacidade observada do sistema naquela tarefa e às incertezas conhecidas; o
conceito diz respeito à adequação da dependência, não à confiança alta por si
só ([Lee e See (2004)](referencias.md#ref-lee2004trust)). **Viés de automação**
(*automation bias*) descreve uso inadequado de uma recomendação automatizada,
como aceitá-la diante de indícios contrários ou deixar de procurar informação
por atenção deslocada ao auxílio. A literatura o relaciona à complacência e a
processos de atenção, sem reduzir todo aceite de sugestão a um único mecanismo
([Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation)).
Tornar limites e correções possíveis é necessário, mas intervenções que exigem
reflexão também podem introduzir custo e seus efeitos dependem da tarefa
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). Orientações
para IA generativa em educação reforçam supervisão, transparência, proteção de
dados e adequação ao contexto ([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Continuidade entre dispositivo e servidor

O AraLearn foi concebido para contextos em que a conexão pode desaparecer. O
dispositivo mantém uma réplica local dos Cursos já abertos e do estado
funcional necessário para estudar. Depois da primeira transferência, leitura,
prática e retomada dependem primeiro dessa réplica; mudanças pendentes podem ser
sincronizadas quando a rede retorna.

Essa escolha separa duas responsabilidades:

- o **servidor** conserva a fonte compartilhada, autentica a conta, aplica
  propriedade e acessos e recebe sincronizações;
- o **dispositivo** oferece resposta imediata e continuidade temporária quando
  o servidor não pode ser alcançado.

Uma réplica conserva o último estado remoto confirmado e as mudanças locais que
aguardam sincronização. Permissões continuam sendo aplicadas pelo servidor.
Conceder ou revogar acesso, alterar conteúdo e usar assistência externa exigem
conexão porque precisam ser validados no momento da operação.
Os fundamentos técnicos dessa decisão estão em
[Arquitetura](arquitetura.md) e [Persistência relacional](persistencia-relacional.md).

## Estado de estudo sem vigilância comportamental

O produto conserva o necessário para responder a perguntas funcionais, como
“em que Unidade continuar?” e “qual Unidade a própria pessoa marcou para
rever?”. Ele não registra abertura de Unidade, permanência, quantidade de
respostas enviadas, acertos, erros ou último resultado para inferir atenção,
esforço ou domínio.

Dados de interação são ambíguos fora do contexto em que foram produzidos. A
literatura sobre ética em análise da aprendizagem recomenda relacionar coleta,
finalidade, interpretação e responsabilidade, em vez de acumular dados porque
podem ser úteis no futuro ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). A aplicação
dessa regra no produto está em [Estado de estudo não
punitivo](estado-de-estudo-nao-punitivo.md).

## Propriedade e acesso direto

Todo Curso nasce privado e possui uma pessoa proprietária. Estudo lista Cursos
próprios e aqueles aos quais a pessoa recebeu acesso. Autoria lista somente
Cursos próprios.

O proprietário pode conceder ou revogar acesso diretamente a outra conta. A
concessão dá acesso a Estudo e preserva com o proprietário a edição do Curso. O
modelo não cria grupos, organizações nem acesso público anônimo.

## Públicos e condições de uso

O desenho móvel atende especialmente pessoas que estudam em períodos que podem
ser interrompidos, durante deslocamentos ou entre outras atividades. A interface web mantém a
largura de leitura próxima à experiência móvel para que o mesmo conteúdo não
dependa de uma diagramação exclusiva para computador. Revisões de aprendizagem móvel
e autodirigida identificam oportunidades e exigências próprias desse contexto,
mas não autorizam supor que qualquer interface móvel produza autorregulação
([Lai et al. (2022)](referencias.md#ref-lai2022mobile); [Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated)).

O AraLearn também atende autores, professores, revisores e pesquisadores que
precisam examinar como um Curso foi planejado, representado, corrigido e usado.
Esses públicos observam o mesmo Curso vivo, mas recebem ações diferentes de
acordo com propriedade e acesso.

Treinamento e desenvolvimento, educação profissional e tecnológica,
aprendizagem autodirigida no trabalho e circulação de conhecimento são
contextos possíveis de aplicação e investigação. A aprendizagem no trabalho
pode ser formal ou informal, envolver diferentes níveis e depender das
condições oferecidas pelo ambiente ([Tynjälä (2008)](referencias.md#ref-tynjala2008workplace)).
Sistemas de informação podem apoiar criação, transferência e aplicação de
conhecimento organizacional sem constituir, sozinhos, gestão do conhecimento
([Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge)). O AraLearn
não oferece gestão de competências, matrícula institucional ou certificação e
não tem eficácia demonstrada nesses contextos.

## Limites e compromissos verificáveis

O produto assume os seguintes compromissos de projeto:

- conteúdo novo deve ser estudável por quem tem acesso à medida que é
  produzido;
- a seleção de um componente visual deve decorrer de uma necessidade de
  representação, não de variedade decorativa;
- alterações propostas por IA passam pelos contratos estruturais e devem ser
  conferidas pela pessoa autora;
- estados funcionais de retomada conservam sua finalidade e não viram medidas
  de aprendizagem por conveniência;
- operações locais permanecem imediatas quando sua execução independe da rede;
- uma falha isolada preserva a leitura dos demais Cursos;
- decisões de eficiência, acessibilidade e eficácia devem ser avaliadas por
  testes ou estudos adequados, e não declaradas como resultado já comprovado.

Esses compromissos orientam o produto e sua avaliação. A confirmação de usabilidade
e de efeitos educacionais exige avaliação empírica com tarefas, participantes e
critérios explícitos. A documentação distingue, por isso, fundamento da
literatura, decisão de projeto, propriedade verificada por teste e questão
ainda aberta.

## Referências no texto

As citações usam chaves da base bibliográfica pública em
[referencias.bib](referencias.bib).

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Alavi e Leidner (2001)](referencias.md#ref-alavi2001knowledge): Maryam Alavi; Dorothy E. Leidner (2001). **Review: Knowledge Management and Knowledge Management Systems: Conceptual Foundations and Research Issues.** *MIS Quarterly*, 25(1), p. 107–136.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated): Jaclyn Broadbent; Walter L. Poon (2015). **Self-Regulated Learning Strategies and Academic Achievement in Online Higher Education Learning Environments: A Systematic Review.** *The Internet and Higher Education*, 27, p. 1–13.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [International Organization for Standardization (2018)](referencias.md#ref-iso2018usability): International Organization for Standardization (2018). **ISO 9241-11:2018: Ergonomics of Human-System Interaction — Part 11: Usability: Definitions and Concepts.** ISO 9241-11:2018.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Lai et al. (2022)](referencias.md#ref-lai2022mobile): Yuzhi Lai; Nadira Saab; Wilfried Admiraal (2022). **Learning Strategies in Self-Directed Language Learning Using Mobile Technology in Higher Education: A Systematic Scoping Review.** *Education and Information Technologies*, 27, p. 7749–7780.
- [Lee e See (2004)](referencias.md#ref-lee2004trust): John D. Lee; Katrina A. See (2004). **Trust in Automation: Designing for Appropriate Reliance.** *Human Factors*, 46(1), p. 50–80.
- [Parasuraman e Manzey (2010)](referencias.md#ref-parasuraman2010automation): Raja Parasuraman; Dietrich H. Manzey (2010). **Complacency and Bias in Human Use of Automation: An Attentional Integration.** *Human Factors*, 52(3), p. 381–410.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Renkl et al. (2004)](referencias.md#ref-renkl2004fading): Alexander Renkl; Robert K. Atkinson; Cornelia S. Große (2004). **How Fading Worked Solution Steps Works: A Cognitive Load Perspective.** *Instructional Science*, 32, p. 59–82.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples): John Sweller; Graham A. Cooper (1985). **The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra.** *Cognition and Instruction*, 2(1), p. 59–89.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Tynjälä (2008)](referencias.md#ref-tynjala2008workplace): Päivi Tynjälä (2008). **Perspectives into Learning at the Workplace.** *Educational Research Review*, 3(2), p. 130–154.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
