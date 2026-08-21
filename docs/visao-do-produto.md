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

## Estudo, autoria e assistência computacional

O mesmo Curso pode ser observado em dois contextos complementares:

- no **Estudo**, a pessoa lê, pratica, recebe retorno, marca uma Unidade para
  rever e registra uma observação. Na candidata de clientes 0.0.26, ainda não
  publicada, também pode editar uma Unidade; quando o Curso é
  compartilhado, a primeira gravação cria um Curso pessoal privado sem alterar o
  original;
- na **Autoria**, a pessoa proprietária planeja, produz e inspeciona o Curso,
  mantém sua proveniência, tria Anotações, audita correções, compara variantes,
  consulta fatos da produção e concede acesso direto para Estudo. Um protocolo
  aberto, o **Model Context Protocol (MCP)**, conecta o assistente de autoria ao
  aplicativo.

Uma alteração não precisa transportar todos os Cursos. A entrada inicial recebe
descritores finos para selecionar um Curso; a composição é lida em páginas sob
uma revisão fixa somente na entrada. O contexto enviado a um serviço de
linguagem é montado para o Curso e o alvo pertinentes, e a resposta precisa
satisfazer contratos estruturais antes de ser gravada.

Respostas produzidas por modelos podem conter omissões ou erros. A assistência
é uma ferramenta de autoria sob responsabilidade humana. Recomendações para
interação entre pessoas e inteligência artificial favorecem tornar
o escopo visível, oferecer possibilidade de correção e apoiar a recuperação de
erros ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Orientações para IA generativa em educação também
reforçam supervisão, transparência e adequação ao contexto ([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

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

## Público e condições de uso

O desenho móvel atende especialmente pessoas que estudam em sessões curtas,
durante deslocamentos ou entre outras atividades. A interface web mantém a
largura de leitura próxima à experiência móvel para que o mesmo conteúdo não
dependa de uma diagramação exclusiva para computador. Revisões de aprendizagem móvel
e autodirigida identificam oportunidades e exigências próprias desse contexto,
mas não autorizam supor que qualquer interface móvel produza autorregulação
([Lai et al. (2022)](referencias.md#ref-lai2022mobile); [Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated)).

O AraLearn também atende autores, professores, revisores e pesquisadores que
precisam examinar como um Curso foi planejado, representado, corrigido e usado.
Esses públicos observam o mesmo Curso vivo, mas recebem ações diferentes de
acordo com propriedade e acesso.

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
