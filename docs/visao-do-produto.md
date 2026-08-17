# Visão do produto

O AraLearn é um ambiente móvel de estudo e autoria de cursos. Seu propósito é
transformar um conjunto extenso de assuntos em um percurso que explique,
exemplifique, proponha práticas e possa ser retomado depois de uma interrupção.
O produto não substitui o trabalho intelectual do estudante nem promete que a
mera exposição a cards produza aprendizagem. Ele organiza condições para que o
estudo seja compreensível, praticável e revisável.

Este documento apresenta o problema tratado, as escolhas centrais do produto e
os limites dessas escolhas. Os procedimentos de uso estão em [Uso do
app](uso-do-app.md); os conceitos pedagógicos são aprofundados em [Modelo
didático](modelo-didatico.md).

## Problema educacional e problema de interação

Encontrar informação não equivale a dispor de um percurso de aprendizagem. Uma
pessoa pode ter acesso a livros, aulas, vídeos e respostas de sistemas de
linguagem e ainda precisar descobrir sozinha:

- quais conceitos precisam ser apresentados primeiro;
- quanto conteúdo cabe em uma etapa sem perder a continuidade;
- em que momento observar um exemplo ou uma representação visual;
- que prática exige a operação-alvo pretendida;
- como interpretar o feedback e retomar o estudo posteriormente.

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
se um assunto exige mais etapas, o curso deve usar mais cards.

## Unidade de organização do estudo

O conteúdo segue uma hierarquia estável:

```text
curso -> módulo -> lição -> microssequência -> card
```

Cada nível resolve um problema distinto:

- **curso** delimita a finalidade e o campo de conhecimento;
- **módulo** reúne uma região coerente do programa;
- **lição** organiza uma progressão que pode ser estudada como unidade;
- **microssequência** combina teoria e prática em torno de uma finalidade local;
- **card** apresenta uma contribuição delimitada para essa microssequência.

A microssequência evita dois extremos. Um card completamente isolado pode não
oferecer contexto suficiente; uma lição apresentada como bloco único pode
concentrar relações demais. A divisão intermediária mantém um contexto próximo
e permite alternar explicação, exemplo, prática e feedback. Estudos sobre
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
quantidade e a variedade de práticas necessárias para cobrir esses gestos.

Prática de recuperação e feedback formativo possuem suporte consistente na
literatura, mas seus efeitos dependem da tarefa, do intervalo, do conteúdo e da
qualidade do retorno ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Shute (2008)](referencias.md#ref-shute2008feedback)). Por isso, o produto não reduz prática a contagem de itens
nem trata qualquer resposta como prova de domínio.

## Recursos de representação

Um card pode conter texto ou um recurso especializado, como fórmula, matriz,
grafo, diagrama de conjuntos, fluxograma, tabela, código ou representação
linguística. Um recurso só se justifica quando sua estrutura ajuda a perceber
algo que seria menos claro em prosa genérica.

A escolha da representação ocorre depois da intenção pedagógica. O mesmo
assunto pode exigir uma fórmula para explicitar uma relação quantitativa, um
gráfico para comparar uma distribuição e uma tabela para consultar valores.
Usar várias representações não é um benefício automático: o curso precisa
explicar as correspondências relevantes e evitar que o estudante tenha de
adivinhar por que duas formas aparecem juntas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Manter
rótulos próximos aos elementos que explicam também reduz a integração mental
desnecessária ([Ginns (2006)](referencias.md#ref-ginns2006contiguity)).

Os recursos são pacotes independentes do núcleo do leitor. Essa separação
permite acrescentar uma representação ou corrigir seu contrato e seu
renderizador sem reescrever a progressão, a persistência e os controles comuns
dos cards. A independência arquitetural não dispensa curadoria acadêmica: cada
pacote continua responsável por convenções da área, legibilidade móvel,
interação de prática, edição textual e validação.

## Estudo, autoria e assistência computacional

O mesmo curso pode ser observado em dois contextos complementares:

- no **Estudo**, a pessoa lê, pratica, recebe feedback, marca um card para rever
  e registra uma observação;
- na **Autoria**, uma pessoa autorizada corrige textos, reorganiza a estrutura,
  acompanha Mapa/Desenho/Auditoria e coordena um projeto compartilhado. A
  conversa de planejamento permanece num GPT ou cliente MCP externo; não existe
  chat autoral interno no aplicativo.

Uma correção local não precisa transportar o curso inteiro. A interface permite
selecionar o card, a microssequência, a lição ou instâncias específicas de
recursos, conforme a operação autorizada. O contexto enviado a um serviço de
linguagem é montado para esse alvo e a resposta precisa satisfazer contratos
estruturais antes de ser gravada.

Respostas produzidas por modelos podem conter omissões ou erros. A assistência
é, portanto, uma ferramenta de autoria sob responsabilidade humana, não uma
autoridade pedagógica. Recomendações para interação humano-IA favorecem tornar
o escopo visível, oferecer possibilidade de correção e apoiar a recuperação de
erros ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Orientações para IA generativa em educação também
reforçam supervisão, transparência e adequação ao contexto ([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Continuidade entre dispositivo e servidor

O AraLearn foi concebido para contextos em que a conexão pode desaparecer. O
dispositivo mantém uma réplica local dos cursos escolhidos e do estado
funcional necessário para estudar. Depois do primeiro download, leitura,
prática e retomada dependem primeiro dessa réplica; mudanças pendentes podem ser
sincronizadas quando a rede retorna.

Essa escolha separa duas responsabilidades:

- o **servidor** conserva a fonte compartilhada, autentica a conta, aplica
  permissões e recebe sincronizações;
- o **dispositivo** oferece resposta imediata e continuidade temporária quando
  o servidor não pode ser alcançado.

Uma réplica não é uma segunda autoridade. Ela não concede permissões e pode
mostrar o último estado remoto confirmado enquanto estiver sem rede. Convites,
alterações de papel, publicação e assistência externa exigem conexão porque
dependem de outra pessoa ou serviço e precisam ser validados no momento da
operação. Os fundamentos técnicos dessa decisão estão em
[Arquitetura](arquitetura.md) e [Persistência relacional](persistencia-relacional.md).

## Estado de estudo sem vigilância comportamental

O produto conserva o necessário para responder a perguntas funcionais, como
“em que card continuar?” e “qual card a própria pessoa marcou para rever?”. Ele
não registra abertura de card, permanência, número de tentativas, acertos,
erros ou último resultado para inferir atenção, esforço ou domínio.

Dados de interação são ambíguos fora do contexto em que foram produzidos. A
literatura sobre ética em análise da aprendizagem recomenda relacionar coleta,
finalidade, interpretação e responsabilidade, em vez de acumular dados porque
podem ser úteis no futuro ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). A aplicação
dessa regra no produto está em [Estado de estudo não
punitivo](estado-de-estudo-nao-punitivo.md).

## Organização pessoal, catálogo e colaboração

**Estudo** reúne em **Trilhas** aquilo que a pessoa escolheu estudar.
**Autoria** reúne **Workspaces** acessíveis e **Coleções**, o catálogo
compartilhado. Abrir um curso no catálogo ou uma prévia de workspace não o
adiciona automaticamente a Trilhas: a seleção é uma decisão explícita. Grupos
pessoais organizam Trilhas sem alterar curso, workspace ou catálogo.

Um **workspace educacional** reúne uma composição de curso, participantes e
permissões locais. A mesma pessoa pode assumir responsabilidades diferentes em
espaços diferentes. O papel organiza acesso e prestação de responsabilidade;
não mede aprendizagem e não prova que a colaboração seja pedagogicamente
eficaz. Esse pressuposto precisa ser avaliado em uso, distinguindo mecanismo de
coordenação de resultado educacional. Consulte [Workspaces
educacionais](workspaces-educacionais.md).

## Público e condições de uso

O desenho móvel atende especialmente pessoas que estudam em sessões curtas,
durante deslocamentos ou entre outras atividades. A interface web mantém a
largura de leitura próxima à experiência móvel para que o mesmo conteúdo não
dependa de uma diagramação exclusiva de desktop. Revisões de aprendizagem móvel
e autodirigida identificam oportunidades e exigências próprias desse contexto,
mas não autorizam supor que qualquer interface móvel produza autorregulação
([Lai et al. (2022)](referencias.md#ref-lai2022mobile); [Broadbent e Poon (2015)](referencias.md#ref-broadbent2015selfregulated)).

O AraLearn também atende autores, professores, revisores e pesquisadores que
precisam examinar como um curso foi planejado, representado, corrigido e usado.
Esses públicos compartilham o mesmo artefato, mas recebem ações diferentes de
acordo com suas responsabilidades.

## Limites e compromissos verificáveis

O produto assume os seguintes compromissos de projeto:

- conteúdo novo deve ser estudável à medida que é materializado, sem um estado
  burocrático de rascunho oculto ao leitor autorizado;
- a seleção de um recurso visual deve decorrer de uma necessidade de
  representação, não de variedade decorativa;
- uma resposta de IA nunca dispensa validação estrutural e revisão humana;
- estados funcionais de retomada não devem ser reinterpretados como medidas de
  aprendizagem;
- operações locais não devem aguardar a rede quando sua execução não depende
  dela;
- uma falha isolada não deve bloquear a leitura dos demais cursos;
- decisões de eficiência, acessibilidade e eficácia devem ser avaliadas por
  testes ou estudos adequados, e não declaradas como resultado já comprovado.

Esses compromissos descrevem o desenho pretendido. A confirmação de usabilidade
e de efeitos educacionais exige avaliação empírica com tarefas, participantes e
critérios explícitos. A documentação distingue, por isso, fundamento da
literatura, decisão de projeto, propriedade verificada por teste e questão
ainda aberta.

## Referências no texto

As citações usam chaves da base bibliográfica pública em
[referencias.bib](referencias.bib).
