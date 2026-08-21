# Autoria remota por modelos de linguagem

Este capítulo ensina como um cliente conversacional opera a Autoria pelo
**Model Context Protocol (MCP)** sem criar uma segunda realidade. A interface
visual usa a API de Cursos, enquanto o cliente conversacional usa o MCP; ambos
leem e alteram o mesmo Curso vivo no PostgreSQL.

## O problema que o serviço resolve

Uma conversa é adequada para intenções amplas, como planejar, comparar, revisar
ou reorganizar, mas texto livre não deve receber acesso irrestrito ao banco. Sem
uma fronteira tipada, cada cliente precisaria conhecer tabelas, autorização,
paginação, concorrência e contratos de componentes.

O serviço MCP oferece poucas ferramentas de produto. A pessoa descreve a
tarefa; o cliente escolhe a ferramenta, valida argumentos, chama o servidor e
apresenta o resultado. O servidor continua responsável por identidade,
propriedade, revisão, idempotência e invariantes.

Na interface visual, a ação contextual **ChatGPT** abre um compositor. A pessoa
confere o alvo e seu caminho, escolhe uma intenção compatível e edita o próprio
argumento. Ao copiar, o AraLearn acrescenta Curso, revisão observada, identidade
do alvo, endereço direto de retorno, referências pertinentes e limites de
segurança. O AraLearn não apresenta essa cópia como execução. A geração e as
chamadas MCP ocorrem no ChatGPT ou em outro cliente externo conectado pela
pessoa.

Curso, Módulo, Lição, Tópico, Microssequência, Unidade de estudo, Fonte, Âncora
e Parte de autoria podem ser alvos de conversa. Planejar e preparar estrutura
pertencem ao Curso ou à Parte; verificar Fonte pertence a Fonte ou Âncora;
corrigir pertence à Unidade; materializar pertence à Parte. Revisar e discutir
ficam disponíveis nos alvos em que ajudam a pessoa a argumentar sem iniciar uma
alteração automática.

Copiar ou cancelar não grava API, PostgreSQL, Storage ou IndexedDB. Depois de
uma operação confirmada no cliente MCP, voltar à guia ou focalizar a janela do
AraLearn atualiza o cabeçalho canônico e a área visível. A ação de atualização
do cabeçalho oferece o mesmo caminho quando o navegador não sinaliza o retorno.
Essa releitura não pede nova confirmação para uma alteração já confirmada no
cliente.

Se o compositor, uma confirmação ou um formulário estiver ativo, a releitura é
adiada. O AraLearn conserva o argumento e os demais campos do rascunho e orienta
a pessoa a concluir ou cancelar antes de atualizar. Esse adiamento não confirma
nem desfaz uma operação no servidor.

## O que é MCP

MCP é um protocolo para um cliente descobrir ferramentas e recursos de
conhecimento expostos por um servidor. No AraLearn, o transporte usa JSON-RPC
sobre HTTP e a versão de protocolo `2025-11-25`.

Há duas classes de objeto:

- **ferramenta MCP:** executa uma leitura ou mutação tipada;
- **recurso MCP:** entrega conhecimento estável que pode ser lido sob demanda.

O recurso de conhecimento `aralearn://authoring/invariants` contém somente
invariantes de operação: Curso vivo, leitura antes de escrita, estado dinâmico
persistido, Parte como agrupamento operacional, descoberta progressiva de
componentes, materialização por etapas retomáveis e síntese breve do resultado.

O recurso visual opcional `ui://aralearn/course-inspector/0.0.23.html` segue a
extensão MCP Apps. Ele representa a prévia de uma Unidade de estudo, os
indicadores agregados de Pesquisa e a comparação de Variantes; também apresenta
um resumo adequado para as demais operações da biblioteca de componentes. Um
cliente sem MCP Apps continua recebendo a forma textual canônica do mesmo
resultado autorizado.

A política estável do MCP Apps não permite a compilação WebAssembly usada pelos
diagramas Graphviz. Nesses componentes, o recurso apresenta a descrição textual
equivalente e o endereço autorizado, sem tentar afrouxar a política do cliente.
Os demais componentes conservam a prévia visual.

Plano, parâmetros, orientações, política de componentes, fontes, observações,
rodadas, achados e correções não devem ser copiados para esse recurso nem
fixados nas instruções do cliente. Eles pertencem ao Curso e precisam poder mudar
sem reconstruir o assistente.

## Componentes e fluxo de uma alteração

**Descrição textual:** a pessoa formula a intenção no cliente; o cliente lê o
Curso, chama uma ferramenta com dados tipados e recebe o novo estado; a
interface visual consulta a mesma raiz depois da alteração.

```mermaid
sequenceDiagram
    participant P as Pessoa autora
    participant C as Cliente MCP
    participant M as Servidor MCP
    participant D as Serviço de Curso
    participant B as PostgreSQL
    participant A as Autoria visual
    P->>C: intenção em linguagem natural
    C->>M: listar ou ler Curso
    M->>D: rota exclusiva do proprietário
    D->>B: leitura autorizada
    B-->>C: revisão e estado corrente
    C->>M: mutação + revisão esperada
    M->>D: comando validado
    D->>B: transação
    B-->>C: resultado e nova revisão
    A->>D: reler o mesmo Curso
```

O MCP não acessa tabelas diretamente. `courseMcpTools` mapeia cada chamada para
o roteador canônico; `CourseSupabaseAdapter` autentica a pessoa e chama apenas
as funções de serviço permitidas.

## Autenticação e autorização

Cada cliente usa OAuth com uma conta individual do AraLearn. O token identifica
a sessão; o servidor ainda revalida a propriedade do Curso em cada operação.
Uma chave administrativa compartilhada não é credencial de cliente.

O fluxo interativo usa código de autorização com PKCE S256. O endereço protegido
publica metadados OAuth em `/.well-known/oauth-protected-resource`, e respostas
401/403 incluem o desafio necessário para reconectar a conta.

As regras correntes são deliberadamente simples:

- ferramentas de Autoria listam e alteram somente Cursos próprios;
- Curso compartilhado não aparece no MCP autoral;
- acesso direto concede somente Estudo;
- mutações exigem escopo de escrita;
- perfil e acesso continuam sujeitos à identidade da sessão e à propriedade;
- o servidor nunca confia num identificador enviado pelo cliente para ampliar
  autoridade.

## Ferramentas correntes

### `listarCursos`

Lista Cursos próprios em páginas de até 50 itens. Aceita busca opcional e cursor
formado por data de atualização e identidade. A resposta é fina e inclui links
para a interface visual; não carrega toda a composição.

Use-a primeiro quando a pessoa nomear um Curso por título. Não escolha entre
homônimos sem confirmar o contexto.

### `lerCurso`

Lê uma destas projeções:

- `summary`: cabeçalho fino do Curso;
- `outline`: hierarquia compacta;
- `instructional_plan`: plano vivo, itens com identidades estáveis, Partes,
  vínculos, progresso derivado e atividade recente;
- `course_design`: catálogo pedagógico, valor local e efetivo por escopo,
  orientação original e interpretação, política de componentes, itens do plano
  atribuídos quando o escopo é uma Microssequência e resumo
  planejado×aplicado;
- `course_sources`: catálogo de Fontes, detalhe versionado de uma Fonte ou
  histórico de atribuições de um alvo;
- `course_source_attachment`: autorização temporária para enviar ou abrir um
  PDF privado de uma revisão de Fonte;
- `anchored_annotations`: caixa de entrada, anotações de um alvo ou detalhe de
  uma Anotação ancorada;
- `audit_cycle`: contexto focal, achados, rodadas ou detalhe de um achado ou de
  uma rodada de auditoria;
- `variant_comparisons`: conjuntos de Variantes ligados ao Curso;
- `variant_comparison`: comparação factual de um conjunto e suas revisões;
- `research`: fatos, métricas, filtros e páginas da área Pesquisa;
- `part_materialization`: uma execução persistida, seu contexto e fatos
  limitados, as etapas com versão e a próxima etapa pendente;
- `study_units`: Unidades de estudo em ordem curricular, com contexto, Parte e
  links profundos;
- `entities`: página de entidades do Curso.

`entities` exige `expectedRevision`. O cursor contém tipo e identidade da
última entidade. Se a revisão mudar durante a paginação, a leitura é recusada;
o cliente deve reiniciar a partir do estado corrente.

`study_units` também exige `expectedRevision` e aceita os mesmos escopos da
Inspeção visual: Curso, Parte de autoria, Unidades sem Parte, Módulo, Lição ou
Microssequência didática. `anchorStudyUnitId` inclui a Unidade escolhida na
primeira página; `cursor: {studyUnitId}` continua para frente ou para trás e
não pode coexistir com a âncora. A página normal contém 12 itens, o máximo é 24
e `maxBytes` fica entre 64 KiB e 1.500.000 bytes. O contrato falha fechado se a
resposta completa ultrapassar 1,75 MiB.

`part_materialization` exige `authoringPartId` e `materializationId`, ambos
obtidos do plano ou do recibo anterior. A resposta traz no máximo 64 etapas e
`nextPendingStep`; por isso um cliente novo retoma trabalho real sem depender
da conversa anterior. Se uma etapa falhou ou a execução terminou, o próximo
passo é nulo. Essa vista é exclusiva do proprietário e não inclui instruções
enviadas ao modelo nem raciocínio privado.

Antes de auditar ou alterar estrutura, percorra todas as páginas pertinentes.
Um resumo não demonstra que uma Unidade existe nem que sua composição é válida.

`course_design` recebe um escopo concreto de Curso, Módulo, Lição ou
Microssequência. A resposta traz o contexto progressivo, os quatro parâmetros,
a pilha de orientações, a política efetiva e as 32 opções da revisão exata do
catálogo de componentes. Parâmetros pedagógicos não aceitam override em Módulo;
orientação e política aceitam. `targetPlanItems` contém as listas de unidades de
análise e requisitos de evidência atribuídos quando o alvo é uma
Microssequência e vale `null` nos demais escopos. A leitura falha fechada acima
do limite executável de 256 KiB; não há promessa contratual de 96 KiB para
toda resposta normal.

`course_sources` exige `expectedRevision` e escolhe exatamente um modo:
`catalog`, `source` ou `target`. A leitura é exclusiva do proprietário, estrita e paginada em
até 24 itens. `source` recebe a identidade literal da Fonte; `target` recebe
`plan_item|study_unit` e a identidade do alvo. O cursor é opaco, não pode ser
fabricado pelo cliente e só vale sob a revisão lida. O catálogo traz a revisão
corrente; o detalhe preserva revisões e Âncoras; o alvo preserva atribuições
somente por acréscimo e indica qual ainda corresponde à versão e ao resumo
criptográfico atuais.

O objeto lido contém exatamente `contract`, `courseId`, `courseRevision`,
`mode`, `query`, `items` e `nextCursor`. `query` explicita os três binds e deixa
nulos os que não pertencem ao modo. Cada vínculo de alvo tem
`{sourceId, sourceRevision, relation, anchors}`; cada referência de Âncora tem
`{anchorId, anchorRevision}`. Campos adicionais não são extensão tolerada.

`course_source_attachment` exige revisão do Curso, Fonte e revisão da Fonte.
`prepare_upload` valida tipo, tamanho e resumo criptográfico e devolve uma URL assinada para o
PDF; `download` autoriza a abertura de um anexo já confirmado. O cliente envia
o arquivo à URL assinada e só então usa `attach_pdf` para confirmar o vínculo
relacional. Há limite de 20 MiB por arquivo, 64 MiB de conteúdo único por Curso
e oito anexos por Fonte.

`anchored_annotations` escolhe `inbox`, `target` ou `detail`. A caixa de entrada
aceita filtros por origem, canal, estado, categoria, ausência de categoria,
assuntos e hierarquia com descendentes; o modo alvo exige identidade exata e o
detalhe exige `annotationId`. A página admite no máximo 24 itens, cursor opaco
de até 240 caracteres e resposta de até 256 KiB. Cada item usa
`aralearn.course-anchored-annotation.v1` e inclui caminho observado e corrente,
certeza da revisão observada, classificação automática e humana separadas,
capacidades e links profundos. O contribuidor lido pelo proprietário é protegido por papel
no formato `contributor={kind:'protected_person',role,ref,label}`. `ref` é o
pseudônimo aleatório persistido `person-` + 16 hex, não derivado de Curso/UUID,
nunca UUID ou e-mail e não reversível pelo contrato. A interface mostra somente o `label` pseudônimo protegido, nunca
`ref`, UUID ou e-mail.

Fonte e Âncora são alvos válidos dessa leitura, ao lado dos objetos da
hierarquia didática. O detalhe de uma Fonte pode, portanto, consultar a mesma
página de Anotações usada pela caixa de entrada. A categoria
`reformulation_request` identifica um pedido de reformulação ligado à Fonte ou
à Âncora exata.

`audit_cycle` escolhe `context`, `findings`, `runs` ou `detail`. `findings` e
`runs` são paginados, aceitam `targetStudyUnitId` opcional e usam cursor opaco;
`runs` enumera também rodadas limpas, sem achados. A página distingue a lista
`runs` do detalhe `runDetail`. No modo `detail`, o cliente informa exatamente
um entre `findingId` e `auditRunId`; o detalhe da rodada entrega todas as verificações
e suas evidências, e não apenas os achados derivados. A página admite até 24
itens, cursor de até 240 caracteres e resposta de até 240 KiB.

O contexto focal reúne a Unidade corrente, Microssequência, plano, desenho,
Fontes/Âncoras e até 12 Observações selecionadas. Uma referência a Observação
guarda somente identidade e versão. Enquanto uma retirada ainda existe como
registro de retirada, ela aparece `available: false` e sem link profundo. Depois da remoção
física prevista pelo ciclo de limpeza das Anotações, a exclusão em cascata remove apenas o
vínculo e o identificador da projeção; nenhum texto, pseudônimo ou dado pessoal
foi copiado para rodada, achado ou correção.

`variant_comparisons` lista os conjuntos ligados ao Curso na revisão esperada.
`variant_comparison` exige `comparisonSetId` e devolve planejamento comum,
revisões dos Cursos, diferenças declaradas, desvios não declarados, diferenças
factuais e dados ausentes. Cada membro continua sendo um Curso independente.

`research` devolve o mesmo contrato da área Pesquisa. Aceita conjuntos,
estados, intervalo de datas, limite e cursor; a resposta preserva definições,
denominadores e dados ausentes. Os fatos são descritivos e não sustentam, por si
sós, uma conclusão causal ou de aprendizagem.

### `criarCurso`

Cria atomicamente um Curso privado vazio e seu plano instrucional inicial.
Exige:

- `requestId` estável para a intenção;
- título;
- objetivo.

O plano nasce vazio com preferência automática de 7–12 Partes. A faixa é um
ponto de partida editável e pesquisável, não uma prescrição sobre ensino.

Não cria recipiente, estágio editorial ou cópia de distribuição. A pessoa que
autenticou a chamada é proprietária.

### `alterarCurso`

Possui oito operações fechadas:

- `update_instructional_plan`: aplica um comando semântico ao plano, como atualizar
  campos naturais, incluir/editar/reordenar itens, incluir/editar/dividir/
  juntar/reordenar Partes ou mover vínculos de microssequência;
- `update_course_design`: define ou limpa parâmetro, orientação e política de
  componentes, registra interpretação ligada à revisão exata da orientação ou
  aplica `set_target_plan_items` para substituir as duas listas de itens de uma
  Microssequência;
- `update_course_sources`: cria ou revisa uma Fonte, aposenta Fonte ou Âncora,
  salva Âncora, confirma um PDF já enviado ou substitui o conjunto ordenado de
  Fontes de um item do plano ou de uma Unidade;
- `update_anchored_annotations`: cria ou revisa Anotação ancorada, retira,
  considera, responde, resolve, reabre ou corrige assuntos;
- `update_audit_cycle`: registra rodada, propõe ou rejeita correção, decide
  achado, aplica correção, verifica achado ou executa reversão;
- `update_course_variants`: cria Cursos variantes a partir de um ponto comum ou
  desvincula um membro sem excluir o Curso;
- `commit_course_composition`: inclui, substitui ou exclui entidades em lote;
- `advance_part_materialization`: inicia uma execução, registra uma etapa
  delimitada ou finaliza a materialização de uma Parte.

Todas exigem `courseId` e `requestId`. Operações de conteúdo exigem a revisão
esperada do Curso; em Anotações ancoradas ela aparece somente ao criar ou
corrigir assuntos. Alterar o plano exige também sua versão. Um comando carrega
intenção e identidades estáveis; o servidor calcula e persiste o alvo inteiro
na mesma transação.
O alvo do plano aceita até 192 vínculos de Microssequência no total e 512 KiB;
esse limite mantém sua leitura enriquecida abaixo do orçamento do transporte.

`update_course_sources` aceita somente os comandos `save_source`,
`retire_source`, `save_anchor`, `retire_anchor`, `attach_pdf` e
`set_target_sources`. Um
vínculo novo declara `informed_by`, `supported_by`, `adapted_from`,
`quoted_from`, `contrasted_with`, `exemplified_by`, `inspired_by` ou
`needs_verification` e exige ao menos uma Âncora ativa da revisão exata. Há no máximo
32 Fontes por alvo e oito identidades de Âncora por revisão de Fonte.
`legacy_reference` é apenas fato de
migração e nunca opção de escrita. Uma identidade legada não resolvida é
resolvida na mesma identidade, preservando literalmente o identificador; o cliente não a
normaliza nem cria substituto.

`update_course_variants` aceita `create_comparison_variants` e
`detach_comparison_variant`. A criação recebe de duas a oito variantes, fixa o
ponto comum do planejamento e cria Cursos independentes com diferenças
declaradas de parâmetros ou política. A desvinculação exige confirmação e não
apaga Curso, conteúdo, acesso nem estado pessoal.

`update_anchored_annotations` aceita os oito comandos fechados
`create_anchored_annotation`, `revise_anchored_annotation`,
`withdraw_anchored_annotation`, `consider_anchored_annotation`,
`respond_to_anchored_annotation`, `resolve_anchored_annotation`,
`reopen_anchored_annotation` e `correct_anchored_annotation_subjects`. Criar
exige `confirmed: true` depois de confirmação humana e `briefSummary` não nulo
nem vazio; o servidor remove `confirmed` antes de chamar o domínio. Texto bruto
tem 2.000 escalares/16 KiB, síntese 500/4 KiB e resposta 2.000/16 KiB.

Há várias anotações por ator e alvo. Estados são apenas
`open|considered|resolved|withdrawn`. Classificação automática exata ocorre
somente em alvo Tópico; a correção de assuntos é um fato humano separado.
Criar e corrigir assuntos exigem também a revisão esperada do Curso. Revisar,
responder e mudar estado usam a versão esperada da anotação e o contador global
do conjunto, pois o MCP é exclusivo do proprietário, sem avançar a revisão de conteúdo apenas
pela triagem. A projeção de Estudo usa outro contador privado por pessoa; ele
não cria ferramenta nem estado MCP adicional.

O comando de criação aceita também os alvos `source` e `source_anchor` e a
categoria `reformulation_request`. Ao responder, `responseKind: "answer"`
exige `consideredSourceLinks` vazio. `responseKind: "reformulation"` exige ao
menos um vínculo canônico com revisão de Fonte e uma ou mais Âncoras vigentes.
O recibo devolve essa base na resposta da pessoa autora.

`update_audit_cycle` aceita sete comandos fechados: `record_audit`,
`propose_authoring_correction`, `reject_authoring_correction`,
`decide_finding`, `apply_authoring_correction`, `verify_finding` e
`rollback_authoring_correction`. O envelope do ciclo aceita no máximo 192 KiB.
`auditCommand.confirmed: true` é obrigatório apenas para aplicar ou executar
`rollback_authoring_correction`; os outros cinco comandos recusam esse campo. O servidor retira a
confirmação antes de chamar o domínio.

Uma rodada registra exatamente três verificações humanas nas dimensões pedagógica, factual e
editorial; o servidor acrescenta a verificação estrutural determinística, sob máximo
de 32 verificações. Cada resultado é
`passed|failed|uncertain|not_applicable|not_checked`, com até 16 achados na
rodada. Rodada imutável, versões somente por acréscimo de achado e correção e a junção com
Anotações são autoridades privadas distintas.

A correção v1 só substitui conteúdo e o conjunto completo de Fontes da Unidade
focal existente. Ela preserva `topics` legítimos e não cria, apaga, move,
reposiciona ou muda o pai de uma entidade. Uma operação sem efeito é recusada.
A aplicação conserva o ponto de controle `before|after`, com até 48 KiB por
estado e 96 KiB no conjunto, e avança o achado para `awaiting_verification`; a
reversão exige que o estado aplicado ainda corresponda ao ponto de controle. Ambos reutilizam
`course_change_receipts`, com resultado de até 64 KiB, e são as únicas operações
do ciclo que criam `course_events`.

Verificação registra outra rodada e informa `resolved|still_open`. Resolver
exige que o critério focal tenha passado; `still_open` reabre. Evidência factual
positiva ou resolução factual exige Fonte e Âncora ativas na revisão exata:
`supported_by` sustenta afirmações e `quoted_from` só vale para
`quotation_fidelity`. `suggestedAnnotationActions` com `resolve|reopen` é mera
sugestão; executá-la requer outro comando explícito de
`update_anchored_annotations` com a versão corrente.

O recibo de Fonte contém exatamente `contract`, `courseId`, `courseRevision`,
`requestId`, `idempotent`, `changed` e `change`. `change` é nulo quando não há alteração; caso
contrário, contém `type`, `subjectId` e `revision`, e `changed` precisa refletir
essa diferença.

Cada grupo de composição aceita no máximo 200 itens. Uma etapa de
materialização aceita no máximo 64 mudanças de entidade e 256 KiB, fixa a
versão da Parte e mantém conteúdo, etapa, vínculo, revisão, evento e recibo na
mesma transação. A execução persiste o próximo passo; repetir a mesma chamada
recupera o recibo antes do CAS. A transação valida pais, posições, identidades,
conteúdo de cada linha pelo tipo
`module|lesson|topic|microsequence|study_unit`; o banco verifica `dependsOn`
somente nas Lições afetadas. A escrita permanece segmentada e não recompõe o
Curso integral antes de cada confirmação. Excluir ou reordenar uma Parte nunca
exclui a composição didática.

`commit_course_composition` não aceita `sources` dentro de `studyUnits`. Para
cada Unidade incluída ou substituída, o pedido leva exatamente uma entrada em
`sourceAttributionApplications` com o conjunto completo de vínculos, inclusive
quando vazio. Entidades, atribuições, revisão, evento e recibo confirmam ou
revertem juntos.

A API do aplicativo reutiliza essa composição com uma forma mais estreita para
a edição contextual: exatamente uma Unidade existente, nenhuma exclusão,
versão esperada da Unidade e origem `manual` ou `provider_assistance`. O
servidor registra canal e origem no recibo e no evento. A forma de resposta do
canal MCP permanece inalterada e não recebe esses campos internos.

Para repetir uma edição depois de resposta perdida, a interface conserva sob o
mesmo `requestId` o conjunto de Fontes lido antes da primeira tentativa. A
transação aceita referências históricas somente como carga JSONB idêntica da
proveniência efetiva anterior; vínculo novo ou modificado continua exigindo
Fonte e Âncora ativas. Essa regra não oferece ao MCP uma forma de criar
`legacy_reference`.

O início de uma materialização não aceita contexto declarado pelo cliente. O
servidor resolve e sela parâmetros, orientações, política e atribuições de
Fontes dos itens do plano para as Microssequências-alvo. O contexto
`aralearn.course-design-context.v2` inclui catálogos de itens como
`{id, position, statement, version}` e, em cada alvo, somente os IDs atribuídos
a ele, além das revisões e Âncoras seladas. Cada `record_step` apresenta uma
aplicação factual limitada e aplicações
`aralearn.course-source-attribution-application.v1`; somente fatos presentes
no contexto podem ser gravados. Conteúdo, vínculos, atribuições, etapa, evento e
recibo são atômicos sob o resumo criptográfico do contexto.

Formas de explicação, oportunidades e dimensões de variação são declarações do
cliente conversacional ou da pessoa autora com esquema, referências, contagens e coerência
interna validados; não são inferidas semanticamente da prosa pelo banco. A
transação reconcilia materialmente os IDs de Unidades, o pai/alvo e os
`componentRefs` do conteúdo. Referência desconhecida, excluída ou fora de
`allow_only` reverte o lote inteiro.

O cliente deve reler depois da escrita. Uma resposta de sucesso demonstra que
a transação foi aceita, não que a mudança é pedagogicamente adequada.

### `gerirPessoas`

Agrupa cinco operações estreitamente relacionadas:

| Operação | Efeito |
| --- | --- |
| `read_profile` | lê nome e chave de avatar da própria pessoa |
| `update_profile` | altera nome ou referência de avatar já enviada |
| `list_access` | lista proprietário e pessoas com acesso ao Curso próprio |
| `grant_access` | concede Estudo a uma conta localizada por e-mail exato |
| `revoke_access` | revoga pelo identificador retornado na lista |

Conceder e revogar exigem `confirmed: true` depois de confirmação humana clara
e usam `requestId`. A ferramenta não pesquisa diretório, não sugere contas e
não devolve o e-mail. A fotografia é enviada pelo fluxo seguro do Storage; o
MCP apenas registra ou remove a chave já autorizada.

### `consultarComponentesDidaticos`

Descobre e valida a biblioteca sem carregar todos os contratos no contexto:

1. `explore` apresenta famílias e facetas;
2. `search` encontra candidatos por intenção;
3. `inspect` compara poucos pacotes;
4. `contracts` entrega o contrato exato necessário;
5. `validate_study_unit` valida uma Unidade composta;
6. `audit_representation` confronta composição e intenção;
7. `preview_study_unit` prepara inspeção fiel ao renderizador.

## Concorrência e repetição segura

Cada Curso possui uma revisão inteira crescente. Uma mutação só é aceita quando
`expectedRevision` coincide com a revisão corrente. Esse mecanismo é
**compare-and-swap (CAS)**: comparar a revisão lida e trocar o estado numa única
transação.

O plano e cada execução de materialização também possuem versões próprias.
Assim, uma mudança alheia fora da Parte não apaga trabalho em andamento, mas
alterar a própria Parte ou repetir uma etapa sobre uma versão antiga produz um
conflito explícito. Enquanto uma execução está em andamento, cabeçalho e
itens independentes do plano continuam editáveis; a Parte, sua posição e seus
vínculos ficam protegidos até a execução terminar ou ser marcada como falha.

Cada mutação também possui `requestId`. O servidor conserva um recibo pequeno e
temporário:

- pedido repetido com o mesmo conteúdo recupera o resultado;
- o mesmo identificador com outro conteúdo é recusado;
- recibos de Curso, acesso e Anotações ancoradas expiram em até 14 dias;
- o recibo não é histórico de conversa nem cópia do Curso.

Para Anotações, essa expiração é autoritativa: o recibo deixa de admitir
repetição no prazo. A remoção física ocorre oportunisticamente durante leituras
e mutações do Curso, em um lote de até 128 registros de retirada e 256 recibos
expirados a cada operação;
um Curso inativo pode conservar dados físicos expirados porque não há tarefa
periódica nem garantia de remoção física na janela.

Diante de conflito de revisão, não aumente o número e tente novamente às cegas.
Releia, compare a intenção com o estado novo e proponha a reconciliação.

## Conhecimento estável e estado dinâmico

O servidor entrega instruções curtas no `initialize` e pelo recurso de
invariantes. O Curso conserva dados mutáveis:

- título e objetivo;
- plano instrucional com público, escopo, faixa preferencial,
  resultados pretendidos, unidades de análise e requisitos de evidência;
- parâmetros pedagógicos, orientações autorais versionadas, interpretações e
  política de componentes por escopo;
- atribuições muitos-para-muitos de unidades de análise e requisitos de
  evidência às Microssequências;
- catálogo privado e versionado de Fontes e Âncoras, mais atribuições
  somente por acréscimo a itens do plano e Unidades;
- Partes operacionais, seus vínculos e execuções de materialização;
- composição didática;
- Anotações ancoradas autorais e estudantis, com contador global exclusivo do
  proprietário e contador privado por pessoa na projeção de Estudo;
- rodadas imutáveis, versões de achados, vínculos protegidos com Observações e
  correções versionadas;
- fatos, métricas, filtros e exportações da área Pesquisa;
- pontos comuns, membros e comparações factuais de Variantes.

Essa separação evita que mudar o planejamento exija editar as instruções fixas
do cliente ou reconstruir uma base fixa. Também evita persistir conversa integral ou
raciocínio privado como se fossem dados do produto.

## Respostas, erros e limites

Ferramentas retornam `structuredContent` no formato:

```json
{
  "ok": true,
  "requestId": "identificador-ou-null",
  "data": {}
}
```

Falhas de ferramenta retornam `ok: false`, código, mensagem e detalhes seguros.
Erros previsíveis incluem:

- autenticação ausente ou revogada;
- escopo insuficiente;
- Curso inexistente ou não pertencente à pessoa;
- revisão desatualizada;
- `requestId` reutilizado com outro comando;
- Fonte, revisão, Âncora, relação ou alvo inválido;
- rodada, achado, correção, critério focal ou evidência inválida;
- confirmação indevida num comando não destrutivo do ciclo de auditoria;
- entidade, plano, Parte ou etapa de materialização inválida;
- e-mail sem conta correspondente;
- confirmação ausente;
- limite do corpo do pedido ou prazo excedido.

O transporte aceita pedidos de até 1 MiB, e as ferramentas usam limites ainda
menores por campo e lote. A leitura `study_units` possui orçamento próprio de
resposta, com limite máximo de 1,75 MiB sob o teto de 2 MiB. O prazo de uma
chamada não autoriza aumentar o lote indefinidamente; a produção por Partes
precisa respeitar limites reais de modelo, rede e transação.

As leituras de Fontes têm resposta máxima de 256 KiB, página de até 24 itens e
cursor opaco de até 240 caracteres. Metadados e URLs ficam no PostgreSQL; o
contrato não envia arquivos de referência ao Storage. Esses limites reduzem
transferência, mas o crescimento somente por acréscimo e o consumo real de
banco, saída de dados e funções ainda precisam ser medidos antes de afirmar
sustentabilidade no plano gratuito.

O ciclo de auditoria limita páginas e resultados de mudança a 240 KiB, comandos
a 192 KiB, 256 rodadas por Curso com reserva para correções aplicadas, 1.024
identidades de achado, 64 correções por Curso e oito por achado. Históricos
projetados também são limitados. Auditoria e correção exigem conexão: não há
relação local, cópia autoritativa nem fila de envio delas no IndexedDB.

## Configuração

O endereço tem a forma:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

Para conectar um cliente:

1. confirme que migrações, manifesto e Edge Function pertencem à mesma
   revisão;
2. cadastre o cliente OAuth e seus endereços de redirecionamento;
3. configure o endereço acima;
4. autentique uma conta individual;
5. confira a descoberta das seis ferramentas, do recurso de invariantes e, num
   cliente compatível, do recurso visual versionado;
6. faça primeiro uma leitura sem mutação;
7. teste criação e alteração somente num Curso de desenvolvimento.

## Verificação

A verificação cobre protocolo, OAuth, registro de ferramentas, roteamento,
autorização, concorrência e contratos:

```powershell
node --test tests/runtime/course-mcp-server.test.js
node --test tests/runtime/course-mcp-tools.test.js
node --test tests/runtime/course-tool-executor.test.js
node --test tests/runtime/course-router.test.js
npm run test:authoring:mcp:local
npm run test:authoring:mcp:local:oauth
npm run test:authoring:supabase:e2e
```

O último teste exige Supabase e todas as Edge Functions locais em execução,
credenciais efêmeras e `ARALEARN_E2E_REAL_SUPABASE=1`. Ele atravessa a interface
servida por `public/main.js`, IndexedDB, API de Cursos, PostgreSQL, Storage, RLS,
registro e autorização OAuth com PKCE e chamadas MCP. A mesma jornada cria a
estrutura mínima, vincula uma Microssequência à Parte, inicia uma materialização,
registra a etapa de contexto, relê `part_materialization` e comprova a chegada do
andamento à interface e ao IndexedDB. Abrir **Ver etapas** não envia nova escrita
nem repete a confirmação já feita no cliente MCP. O teste encerra comprovando a
remoção dos dados criados. A versão 0.0.24 acrescenta à mesma jornada a
edição manual, a assistência por relay, os eventos `manual` e
`provider_assistance`, a releitura da API e do PostgreSQL e a promoção no
IndexedDB; esse percurso passou novamente 1/1 em 14,2 segundos depois da
correção da classificação do endereço local no navegador.

Essa prova é local e automatizada. O relay foi exercitado sobre HTTP local; ela
não comprova o acesso do Pages HTTPS à rede local nem a ponte nativa do
Android 0.0.24 num APK instalado em dispositivo real. A verificação
hospedada só deve ser executada depois que as migrações remotas estiverem em
paridade com `supabase/runtime-manifest.json`; nenhuma dessas duas provas, por
si, demonstra instalação pública ou usabilidade dentro do ChatGPT.

## Referências normativas e técnicas

- [Model Context Protocol: especificação 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Apps: extensão estável 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Supabase Auth como servidor OAuth 2.1](https://supabase.com/docs/guides/auth/oauth-server)
- [OAuth 2.0 Security Best Current Practice: RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)
- [Proof Key for Code Exchange: RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
- [OAuth 2.0 Protected Resource Metadata: RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)
