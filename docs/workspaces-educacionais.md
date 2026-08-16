# Workspaces educacionais

## Problema que o workspace resolve

Um curso individual pode ser mantido pela própria conta. Um curso construído
por uma turma, grupo de pesquisa ou equipe editorial exige algo adicional:
participantes diferentes precisam consultar, escrever, revisar e administrar o
mesmo projeto sem compartilhar credenciais nem criar cópias divergentes.

O AraLearn chama esse espaço delimitado de **workspace educacional**. O
workspace reúne:

- uma identidade estável para o projeto;
- a composição corrente dos cursos em construção;
- as pessoas que participam;
- o papel de cada pessoa naquele espaço;
- observações e decisões de curadoria vinculadas a alvos precisos;
- o contexto mínimo necessário para retomar uma autoria interrompida.

O workspace não é uma pasta visual nem uma etapa burocrática anterior ao
curso. Ele é a fronteira de colaboração e autorização. A criação da estrutura
já faz o planejamento aparecer em **Trilhas**; cards materializados tornam-se
estudáveis no mesmo item, mesmo que outras partes ainda estejam em construção.

## Conceitos que não devem ser confundidos

| Conceito | Finalidade | Quem controla |
| --- | --- | --- |
| Workspace | pessoas, papéis, autoria e revisão de um projeto | participantes autorizados naquele espaço |
| Trilhas | acesso pessoal a cursos e planejamentos | a própria conta e as concessões recebidas |
| Grupo de Trilhas | organização visual dos itens da tela inicial | somente a própria conta |
| Coleções | distribuição editorial de cursos oficiais | contas com autorização de catálogo |

Excluir um grupo de **Trilhas** não exclui o workspace nem o curso. Ser
proprietário de um workspace também não autoriza, por si só, alterar
**Coleções**. A separação evita que ações pessoais de organização sejam
interpretadas como decisões coletivas ou editoriais.

## Papéis e capacidades

O papel é local ao workspace. A mesma pessoa pode ser professora/autora em um
projeto, estudante em outro e leitora em um terceiro.

| Papel | Capacidades no workspace |
| --- | --- |
| Proprietário | ler, criar, revisar, comentar, publicar, administrar participantes e transferir a propriedade principal |
| Administrador | ler, criar, revisar, comentar, publicar e administrar participantes |
| Professor/Autor | ler, criar, revisar, comentar e publicar |
| Revisor | ler, revisar e comentar |
| Estudante | ler e registrar comentários próprios |
| Leitor | ler |

O servidor verifica essas capacidades em cada leitura ou escrita compartilhada.
Ocultar um botão na interface melhora a compreensão, mas não constitui
controle de acesso suficiente; a decisão final precisa ocorrer onde os dados
são mantidos.

Há limites adicionais de delegação. Somente o proprietário principal transfere
a propriedade. Um administrador não cria nem remove outro administrador. O
proprietário principal não pode abandonar o espaço antes da transferência. O
objetivo é tornar a mudança de responsabilidade deliberada e auditável, em vez
de fazê-la surgir como efeito indireto de uma alteração de papel.

Para distribuir um curso em **Coleções**, duas condições são independentes:

1. o papel local deve permitir publicação pelo workspace;
2. a conta deve possuir autorização editorial no catálogo.

Esse cruzamento impede que a administração de um projeto privado conceda
automaticamente poder global sobre os cursos oficiais.

## Um curso, duas experiências complementares

O mesmo curso do workspace pode ser usado em dois contextos paralelos:

- em **Estudo**, a pessoa lê os cards, responde às práticas, marca **Rever** e
  registra observações;
- em **Autoria**, pessoas autorizadas modificam textos, reorganizam a árvore e
  revisam o material.

Não é criada uma cópia apenas para cada contexto. O aplicativo compõe a visão
adequada a partir das mesmas identidades de curso, módulo, lição,
microssequência e card. Identidades estáveis permitem mover uma entidade sem
romper, por esse motivo apenas, o ponto de retomada e as observações que
continuam referindo-se ao mesmo alvo.

Separar a experiência de estudar da experiência de autorar reduz controles
estranhos à tarefa imediata. Essa decisão constitui um pressuposto de
usabilidade a ser avaliado com pessoas e tarefas reais; ela não prova, por si
só, menor carga cognitiva ou melhor aprendizagem
([International Organization for Standardization (2018)](referencias.md#ref-iso2018usability); [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload)).

## Projeção visual do workspace

No aplicativo web e no APK, **Autoria** começa por Workspaces e Coleções. A
lista recebe do servidor um estado compacto e revisionado — planejamento,
construção, auditoria pendente ou pronto — em vez de inferir o processo por
publicação, contagem de cards ou cache visitado.

Ao abrir um workspace:

- **Mapa** organiza Partes e microssequências e distingue plano, análise,
  materialização e finding;
- **Desenho** projeta apenas os parâmetros aplicáveis e o valor efetivo, com
  Auto, override estruturado e lock;
- **Conteúdo** reutiliza o leitor e as identidades correntes;
- **Auditoria** lê findings paginados e mantém alvo indisponível como tal.

Essa projeção não vira uma segunda fonte canônica. O GPT externo interpreta e
propõe; as operações persistem no workspace; a interface consulta, acompanha e
aplica somente ajustes estruturados. Uma Parte continua sendo coordenação
humano–GPT, não escopo de herança de parâmetro nem unidade pedagógica.

## Criação e materialização progressiva

O AraLearn não exige um estado binário de “rascunho” versus “publicado” para
que o curso possa ser lido. A construção pode ocorrer progressivamente:

1. a autoria registra fontes, finalidade, público e objetivo;
2. cria o mapa operacional de Partes e microssequências;
3. lê o slice corrente e analisa uma microssequência;
4. quando Auto precisar de um conjunto novo, propõe facetas, congela as
   referências exatas em um `ResourceSet` e só então cria o assignment;
5. resolve os parâmetros e o snapshot efetivo;
6. descobre progressivamente somente os resources autorizados e vincula
   análise, snapshot e seleções ao blueprint contextual;
7. compõe teoria, prática e cards em memória, valida a estrutura e a adequação,
   persiste os cards e relê o estado;
8. registra um manifesto factual do que foi realmente produzido;
9. estuda, audita e repara o que já existe;
10. distribui uma revisão somente quando houver uma finalidade editorial.

Isso aproxima validação pedagógica e autoria: uma parte pronta pode ser
experimentada sem fingir que o projeto inteiro terminou. Publicação continua
existindo como ato explícito de distribuição, não como requisito para
renderização.

## Convites e participação

O convite associa um e-mail, um papel e um código temporário. O código fica
válido por até sete dias e aparece somente quando é criado. O banco conserva
uma impressão criptográfica do código; assim, uma consulta posterior confirma
um código apresentado, mas não recupera o segredo original.

A conta que aceita precisa estar autenticada com o mesmo e-mail do convite.
Após a aceitação, o vínculo de membro substitui o convite. Revogar esse vínculo
interrompe o acesso que dependia exclusivamente do workspace, sem apagar cursos
próprios nem outras concessões válidas.

As instruções completas estão no [guia de administração de
workspace](guia-administracao-workspace.md).

## Observações situadas e revisão

Durante o estudo, uma pessoa pode registrar uma dúvida, possível erro,
confusão, sugestão ou observação no próprio card. Quando o curso se associa de
forma inequívoca a um workspace, o registro entra na triagem daquele espaço.

Papéis de revisão podem responder e alterar o estado corrente. Responder não
modifica o curso. Para indicar que uma observação foi incorporada, é necessário
executar uma correção de autoria, verificar que ela foi gravada e somente
depois vincular o reparo ao registro. Essa separação preserva a diferença entre
conversar sobre um problema e alterar o objeto educacional.

A observação é manifestação qualitativa situada, não medida de domínio. A
literatura sobre feedback enfatiza interpretação, diálogo e possibilidade de
ação; ela não autoriza transformar a quantidade de comentários em nota ou
indicador automático de qualidade docente ([Nicol e Macfarlane-Dick (2006)](referencias.md#ref-nicol2006formative); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)).

Consulte [Observações pedagógicas nos cards](observacoes-pedagogicas.md).

## Continuidade da autoria

Uma sessão de conversa pode terminar antes do curso. Para permitir retomada, o
workspace conserva um estado operacional compacto: partes planejadas, decisões
correntes, mandato de trabalho e achados formais ainda relevantes. Ele não usa
o histórico integral da conversa como fonte de verdade.

O desenho parametrizado possui registros duráveis próprios para análise,
assignments, `ResourceSet`s, snapshot efetivo, blueprint v2 e manifesto. Esses
objetos não são reconstruídos da conversa nem comprimidos dentro da continuidade
textual. Parte permanece no mapa como coordenação de trabalho, mas não integra a
cadeia de parâmetros, que segue
`workspace → course → module → lesson → microsequence`.

Uma nova sessão usa `gerirDesenhoInstrucional` com `read_slice`. Primeiro lê a
view `overview`, suas referências e `availableViews`; depois abre somente as
views necessárias entre análise, parâmetros, blueprint, binding e
materialização. Assim, assignments, locks, definições, snapshot,
`ResourceSet`s, blueprint e manifesto não formam um payload monolítico. O
transcript não é necessário para continuar. Concluir uma microssequência também
não exige nova confirmação humana quando a Parte e o mandato já autorizam a
continuação; decisões materiais e reparos de findings conservam autoridade
humana explícita.

Essa escolha resolve dois problemas:

- uma conversa longa é uma memória instável e dispendiosa para reconstruir o
  estado do projeto;
- mensagens podem conter tentativas, hipóteses e explicações que não equivalem
  a decisões aprovadas nem a conteúdo gravado.

A árvore do workspace e suas revisões correntes permanecem como fonte dos
objetos de curso. A conversa ajuda a operar sobre eles, mas não substitui seus
dados estruturados. Quando uma escrita parte de uma revisão que já mudou, o
sistema exige nova leitura em vez de sobrescrever silenciosamente o trabalho
de outra pessoa.

## Persistência e economia de armazenamento

O banco mantém cada entidade mutável do curso uma única vez no workspace. A
colaboração acrescenta registros estreitos de membros, convites pendentes,
observações e estado corrente de continuidade. Uma lista ou síntese mostrada
na interface é calculada quando consultada; ela não precisa virar outra cópia
persistida do curso.

Revisões distribuídas são artefatos imutáveis identificados pelo conteúdo. A
composição de autoria, ao contrário, continua mutável e é protegida por número
de revisão. Essa divisão oferece uma origem estável para distribuição sem
guardar uma cópia integral a cada pequena edição.

Análise, snapshots efetivos, `ResourceSet`s, blueprints e manifestos também são
imutáveis e versionados, mas não são publicações nem cópias integrais do curso.
Um binding corrente aponta qual blueprint v2, análise e snapshot pertencem à
microssequência; uma nova decisão cria nova versão em vez de reescrever a
proveniência anterior. Assignments registram `auto`, override manual ou lock de
pesquisa como valores explícitos; “herdado” é um resultado calculado.

Cada `ResourceSet` registra disponibilidade exata. O manifesto mantém separadas
a seleção autorizada e a instância usada. Se não houver representação adequada,
a limitação permanece explícita. Workspaces anteriores a esse modelo ficam
`unresolved`; conteúdo já materializado aparece como `legacy_untracked` e
`legacy_unrestricted` até nova análise, sem preenchimento retroativo fictício.

Recibos temporários permitem reconhecer a repetição acidental do mesmo comando
após uma falha de conexão. Eles não são versões do curso e expiram. Convites
pendentes também expiram. Limites de retenção e medições de armazenamento devem
ser tratados como propriedades verificáveis da implantação, não como promessa
universal de capacidade.

## Uso offline

Depois de uma sincronização, **Trilhas** conserva no dispositivo a projeção e
os cursos necessários à continuidade do estudo. A composição previamente
carregada pode ser lida sem rede. Edições textuais autorizadas em cursos de
workspace também podem ser guardadas em uma fila local e enviadas depois.

Quando uma fatia do desenho de uma microssequência já foi sincronizada, análise,
valor efetivo e manifesto podem ser consultados offline. O cache em `syncState`
é somente uma réplica do último estado remoto. Override manual e restauração de
Auto podem entrar numa fila separada quando a capacidade havia sido observada;
o valor pendente não altera o snapshot remoto exibido como canônico.

A fila possui índice por conta e workspace, de modo que a reconexão e a saída
possam localizar alterações mesmo sem reabrir a microssequência. Escolher Auto
antes do envio coalesce a intenção do mesmo parâmetro. Caches de lista, Mapa e
Desenho só avançam de revisão; resposta atrasada de outra aba não regride a
projeção corrente.

Nem toda tarefa admite execução offline:

| Tarefa | Sem conexão |
| --- | --- |
| estudar curso já sincronizado | disponível |
| marcar **Rever** e escrever observação própria | disponível; sincroniza depois |
| editar texto de card ou metadado em workspace já carregado | pode entrar na fila local |
| consultar desenho já sincronizado | disponível como réplica, com proveniência remota |
| ajustar parâmetro manual ou restaurar Auto | pode entrar na fila; exige revalidação remota |
| consultar uma seleção de Resources já carregada | disponível como réplica; filtros não concedem autoridade |
| criar/aplicar um novo conjunto de Resources, definir condição ou alterar lock de pesquisa | indisponível |
| resolver conflito de escrita | depende de comparação com o estado remoto |
| convidar, aceitar convite ou mudar papel | indisponível |
| publicar ou consultar triagem compartilhada | indisponível |
| usar serviço externo de linguagem | indisponível |

Uma fila local não transforma o dispositivo na autoridade sobre permissões.
Na reconexão, o servidor volta a verificar o papel e a revisão. Se o mesmo
texto mudou remotamente, a pessoa escolhe entre conservar a redação local ou
descartá-la; o sistema não mistura redações incompatíveis sem decisão.
Parâmetros seguem a mesma fronteira de autoridade: capacidade, revisão e locks
são relidos, e conflitos continuam explícitos.

## Hipóteses educacionais e limites

Workspaces tornam possível coordenar autoria, revisão e participação sem
compartilhar contas. Teorias de comunidades de prática e estudos sobre
colaboração ajudam a formular hipóteses sobre participação e aprendizagem
([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)). Isso não permite
afirmar que a simples presença em um workspace melhora a aprendizagem.

No AraLearn, papéis são primeiro mecanismos de autorização e responsabilidade.
Qualquer efeito educacional da colaboração precisa ser investigado com métodos
adequados, incluindo a experiência das pessoas, a qualidade do material
produzido e as tarefas realizadas. Cliques, tempo e presença não são usados
como substitutos automáticos desses construtos.

## Tarefa mínima de verificação

**Pré-condição:** tenha um workspace de teste, duas contas com papéis diferentes,
um curso parcialmente materializado e conexão para as operações de autoridade.

**Passos:**

1. se a finalidade está explícita;
2. se cada papel corresponde à responsabilidade real;
3. se o curso aparece em **Trilhas** sem cópia paralela;
4. se somente pessoas autorizadas conseguem modificar o projeto;
5. se uma observação pode receber resposta sem alterar o curso;
6. se uma correção concorrente produz conflito, e não sobrescrita silenciosa;
7. se análise, valor efetivo, `ResourceSet` disponível, blueprint e manifesto
   apontam para versões compatíveis;
8. se o estado legado aparece sem parâmetros inventados;
9. se o curso e o desenho já sincronizados continuam legíveis sem rede e uma
   intenção manual permanece separada do estado remoto.

**Resultado esperado:** leitura, autoria, revisão e administração obedecem aos
papéis; o curso usa a mesma identidade em Estudo e Autoria; conflitos e
pendências permanecem explícitos.

**Sem conexão:** repita apenas a leitura, o estudo e uma edição textual já
autorizada e materializada. Convites, papéis, estrutura e publicação devem
continuar indisponíveis até a reconexão.

**Recuperação:** se a verificação falhar, preserve a réplica e registre operação,
papel, revisão e mensagem. Reverta o cenário de teste pela ação correspondente;
não amplie permissões nem limpe dados para ocultar a falha.

Falhas nessas verificações são problemas funcionais; não devem ser explicadas
como escolha pedagógica.
