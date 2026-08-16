# Persistência relacional e sincronização

Este documento explica como o AraLearn conserva dados no dispositivo e nos
serviços remotos, por que a aplicação continua funcionando sem conexão e como
alterações atravessam uma rede que pode desaparecer a qualquer momento.

Persistir significa manter um dado além da execução corrente do programa.
Sincronizar significa reconciliar estados mantidos em locais diferentes. Os
termos não são sinônimos: um dado pode estar persistido no celular e ainda não
ter sido sincronizado com o servidor.

## Conceitos fundamentais

- **Supabase**: plataforma remota que reúne banco de dados, autenticação,
  armazenamento de arquivos e funções executadas no servidor;
- **IndexedDB**: banco de objetos do navegador, usado para conservar no
  dispositivo o conteúdo necessário ao estudo e as operações ainda não
  sincronizadas;
- **banco de dados relacional**: sistema que organiza fatos em relações
  estruturadas e aplica chaves, restrições e transações para preservar a
  coerência entre elas;
- **PostgreSQL**: sistema gerenciador de banco de dados relacional usado pelo
  Supabase como autoridade compartilhada do AraLearn; a documentação oficial
  introduz relações, linhas, colunas e consultas em [PostgreSQL — Relational
  Database Concepts](https://www.postgresql.org/docs/current/tutorial-concepts.html);
- **projeção**: forma derivada de outra fonte e organizada para determinada
  consulta;
- **réplica local**: subconjunto sincronizado necessário para continuidade no
  dispositivo, não uma cópia integral da instalação;
- **cache**: dado reconstruível que não constitui fonte de autoridade;
- **Storage**: serviço de armazenamento de arquivos do Supabase;
- **artefato**: arquivo gerado e verificável que reúne uma versão materializada
  de um curso;
- **workspace**: espaço de trabalho autoral no qual cursos e suas revisões são
  mantidos como entidades estruturadas;
- **rascunho local**: alteração autoral persistida no dispositivo, mas ainda
  não confirmada no workspace remoto;
- **outbox**: fila durável de operações que precisam ser enviadas;
- **bootstrap**: carga inicial que estabelece uma base e um cursor confiáveis
  antes da sincronização incremental;
- **cursor** ou **watermark**: marcador até o qual mudanças remotas já foram
  observadas;
- **tombstone**: registro de retirada que impede uma réplica antiga de
  ressuscitar um item excluído;
- **idempotência**: propriedade pela qual repetir a mesma intenção produz o
  mesmo efeito observável, sem duplicação;
- **chamada de procedimento remoto (RPC)**: pedido para que o servidor execute
  uma operação definida junto ao banco de dados;
- **compare-and-swap (CAS)**: gravação condicional à permanência da revisão que
  foi lida.

O [glossário técnico](glossario-tecnico.md) reúne definições mais amplas e
remissões para os capítulos em que esses conceitos são desenvolvidos.

## Modelo mental

O AraLearn possui três classes de dados:

1. **conteúdo pedagógico**, como cursos, microssequências, cards e pacotes de
   recursos;
2. **estado instrucional de autoria**, como análise, parâmetros resolvidos,
   disponibilidade de resources, blueprint e manifesto;
3. **estado pessoal**, como seleção, grupo, cursor, conclusão, marca **Rever** e
   observação;
4. **controle operacional**, como revisão, cursor de sincronização, recibo de
   idempotência e operação pendente.

Essas classes não percorrem necessariamente o mesmo canal. Um curso oficial é
baixado como artefato imutável; uma seleção é uma relação pequena; o estado de
estudo é uma linha pessoal corrente; um workspace autoral é composto por
entidades no PostgreSQL.

```text
publicação oficial no Storage
          │ download, hash e validação
          ▼
projeção do curso no IndexedDB

estado pessoal no PostgreSQL ◄── sincronização ──► estado e filas locais

workspace no PostgreSQL ◄── RPC com CAS ──► edição autorizada

desenho versionado no PostgreSQL ──► cache/fila não canônicos no syncState
```

## Por que usar IndexedDB

### Problema

O estudo precisa responder imediatamente e continuar em redes instáveis. O
armazenamento local também precisa consultar cards por curso, lição,
microssequência e posição e confirmar várias alterações como uma unidade.

### Alternativas

- `localStorage`: simples, porém síncrono, orientado a pequenas strings e sem
  transações ou índices adequados ao volume de uma árvore de curso;
- arquivo JSON único: fácil de exportar, mas caro para atualizar parcialmente
  e inadequado para consultas localizadas;
- memória da página: rápida, mas perdida ao fechar o aplicativo;
- IndexedDB: banco de objetos assíncrono, com chaves, índices e transações.

### Decisão

O AraLearn usa IndexedDB. A [especificação Indexed Database API
3.0](https://www.w3.org/TR/IndexedDB/) define object stores, índices e
transações atômicas assíncronas, além de persistência entre sessões sujeita à
política de armazenamento do navegador. Essas propriedades permitem gravar a
árvore normalizada, o estado pessoal e a outbox sem bloquear a interface.

### Funcionamento no AraLearn

Cada conta autenticada abre um banco cujo nome contém o UUID da conta. O
namespace atual é `aralearn-relational-v4-r3`, com versão IndexedDB `4`. O
e-mail não participa da identidade porque pode mudar; o UUID do Auth é a chave
estável. Sair encerra a sessão, mas não apaga a réplica nem as pendências.

Os principais object stores são:

| Grupo | Object stores representativos | Finalidade |
| --- | --- | --- |
| árvore didática | `courses`, `modules`, `lessons`, `topics`, `microsequences`, `cards` | navegação e reconstrução do curso |
| metadados estruturais | `guides`, `guideItems`, `topicStatements`, `microsequenceStatements`, `dependencies` | objetivos, limites e relações pedagógicas |
| packages | `packageInstances`, `cardSources`, `cardTopics` | composição dos cards |
| dados sincronizados | `courseSelections` | seleção oficial leve |
| controle local | `outbox`, `syncState` | operações pendentes, curso instalado, curso adiado, curso de workspace e fatias do desenho autoral |

Índices como `byCourseId`, `byLessonPosition` e
`byMicrosequencePosition` evitam varrer o banco inteiro para abrir uma parte.
Uma transação de leitura e escrita abrange os stores necessários: ou todos os
registros daquele commit são aceitos, ou nenhum é.

### Consequências e limites

O IndexedDB reduz a dependência da rede e permite consultas localizadas. Ele
não oferece SQL, chaves estrangeiras nativas ou as garantias de um servidor
relacional multiusuário. As invariantes entre stores são verificadas pelo
domínio e pelas transações da aplicação. O navegador também pode remover dados
sob pressão de armazenamento; por isso, o servidor continua sendo autoridade
para dados compartilhados e cursos publicados.

A implementação está em `src/persistence/IndexedDbRelationalStore.js`,
`relationalSchema.js` e `RelationalTransaction.js`; os testes de banco real no
navegador estão em `tests/runtime/relational-indexed-db.test.js` e nas jornadas
offline.

## Por que normalizar a árvore no dispositivo

Normalização, neste contexto, significa guardar entidades relacionadas em
coleções distintas, ligadas por identidades estáveis, em vez de repetir toda a
subárvore em cada registro.

### Problema e alternativas

Um JSON aninhado é conveniente para transporte e publicação, mas uma pequena
alteração num card exigiria substituir uma estrutura grande. A alternativa é
projetar o documento em linhas locais e remontá-lo quando necessário.

### Decisão e funcionamento

Depois do download, `contractToRelationalRows.js` decompõe o envelope em linhas.
`relationalRowsToContract.js` executa o caminho inverso. O documento publicado
continua sendo a unidade canônica de intercâmbio; a forma relacional é uma
projeção local de execução.

Metadados pedagógicos permanecem explícitos:

- módulo e lição usam `guide` para objetivo, inclusões, exclusões, notação e
  cuidados;
- tópicos declaram identidade, rótulo, tipo, verificações e erros esperados;
- microssequências declaram objetivo, papel, dependências, cobertura e
  verificações;
- cards e instâncias de package conservam identidades estáveis.

`dependsOn` só referencia microssequências da mesma lição e precisa formar
grafo acíclico. O código não infere relações por semelhança textual.

### Consequências e limites

É possível substituir um curso inteiro atomicamente e preservar estados
associados a identidades que permaneceram. Em contrapartida, qualquer mudança
do envelope exige paridade entre conversores e validador; os testes de
round-trip são parte obrigatória da alteração.

## O que fica no PostgreSQL

O PostgreSQL é a fonte de autoridade para relações compartilhadas e
coordenação concorrente. Ele mantém:

- seleção de cursos oficiais;
- grupos e vínculos de Trilhas;
- estado pessoal corrente;
- membros, convites e capacidades de workspace;
- composição mutável do workspace;
- análises, parâmetros, conjuntos disponíveis, snapshots efetivos, blueprints e
  manifestos versionados do desenho instrucional;
- metadados e hash da revisão publicada;
- feeds, cursores e recibos necessários à repetição segura.

O PostgreSQL não conserva uma segunda decomposição de cada publicação oficial.
O artefato integral fica no Storage. Essa decisão evita pagar simultaneamente
pelo documento no Storage e por toda a mesma árvore em tabelas remotas.

### Estado instrucional versionado do workspace

O estado parametrizado não é acrescentado como um JSON monolítico em
`authoring_state`. As migrations
`20260815193000_parameterized_authoring_design.sql` e
`20260815230000_authoring_blueprint_artifact_receipt.sql` separam as
responsabilidades em famílias relacionais privadas e acrescentam a retomada dos
hashes imutáveis do blueprint e a barreira para representações não canônicas:

A mesma migração corrige a divergência da continuidade sem apagar comportamento
anterior: o validador vigente continua responsável pelo envelope compacto,
enquanto uma extensão fechada aceita `representationSelection` e
`pedagogicalDiagnosis`; a allowlist de operações conserva o conjunto anterior e
acrescenta somente as mutações do desenho parametrizado.

| Família | Tabelas principais | Regra |
| --- | --- | --- |
| catálogo e análise | `authoring_design_parameter_definitions`; `authoring_instructional_analyses` | definições e análises são imutáveis por identidade e versão |
| atribuições e resolução | `authoring_design_parameter_assignments`; `authoring_effective_design_snapshots`; tabelas filhas de valores e `ResourceSet`s | atribuições formam histórico append-only; o snapshot congela resultado e proveniência |
| disponibilidade | `authoring_resource_sets`; `authoring_resource_set_members` | conjunto e membros fixam versões exatas do catálogo e dos packages |
| plano | `authoring_pedagogical_blueprints`; `authoring_pedagogical_blueprint_bindings`; `authoring_microsequence_design_bindings` | blueprint v2 e binding completo são imutáveis e versionados; somente o apontador corrente da microssequência é uma projeção mutável |
| realização | `authoring_materialization_manifests`; `authoring_materialization_states`; tabelas filhas de seleção, instâncias, cobertura e métricas | manifesto e projeções são imutáveis; o estado corrente incrementa quando cards da microssequência mudam |

As RPCs públicas oferecem leituras focadas, preview da resolução e mutações
transacionais. `list_authoring_design_parameter_definitions_v1`,
`get_authoring_instructional_analysis_v1`,
`list_authoring_design_parameter_assignments_v1`,
`preview_authoring_effective_design_v1`,
`get_authoring_effective_design_snapshot_v1`,
`get_authoring_pedagogical_blueprint_artifact_v1`,
`get_authoring_materialization_manifest_v1` e
`get_authoring_design_state_v1` leem; as operações
`save_authoring_instructional_analysis_v1`,
`manage_authoring_design_parameter_assignment_v1`,
`save_authoring_resource_set_v1`,
`resolve_authoring_effective_design_v1`,
`save_authoring_pedagogical_blueprint_v1` e
`register_authoring_materialization_manifest_v1` escrevem. Desde a #104, MCP e
Action encaminham essas operações por um serviço único, com slice progressivo
por microssequência e recibos compactos.

Cada escrita informa ator, workspace, `requestId`, hash do pedido e revisão
esperada. O servidor bloqueia o workspace, aplica CAS, reavalia a capacidade e
registra recibo idempotente antes de avançar a revisão. Objetos versionados
rejeitam `UPDATE`; uma nova versão ou uma operação append-only preserva o estado
anterior. Conteúdo conversacional e chaves de raciocínio privado são recusados.

O caminho de ancestria é derivado das entidades correntes do workspace, não de
um caminho fornecido como autoridade pelo cliente:

```text
workspace → course → module → lesson → microsequence
```

Parte fica fora da cadeia. O resolvedor prioriza `research_lock`,
`manual_override`, `auto` e default, nessa ordem; `nearest_scope_replaces`
escolhe a origem mais próxima dentro da mesma classe de autoridade e substitui
o valor completo, inclusive conjunto, vetor ou relação. Duplicidade do mesmo
modo no mesmo escopo falha explicitamente. O lock é uma barreira anterior à
resolução local e não pode ser contornado por um override mais baixo. O snapshot
registra modo da atribuição e proveniência de herança em campos distintos.

Um `ResourceSet` restringe disponibilidade. Cada seleção do manifesto aponta
para o `ResourceSet` versionado que, no mesmo registro, precisa conter o package
e permitir seu `fit` e papel. Instâncias materializadas apontam para a seleção;
assim, disponibilidade, escolha e uso real permanecem fatos diferentes.
Qualquer `fit` não canônico exige limitação explícita. A interseção entre a
política efetiva e a política do conjunto decide se `versatile` ou `substitute`
é admitido ou bloqueado; uma aproximação nunca é tratada como equivalência.

O backend deriva `contentHash` do conjunto corrente de cards da
microssequência, em ordem canônica, e só registra o manifesto se o hash recebido
for idêntico. O conjunto de `materializedSteps.artifactRefs` também precisa ser
exatamente o conjunto de cards correntes: referência fantasma, omissão, extra
ou duplicidade falha. O trigger sobre entidades incrementa
`authoring_materialization_states.materialization_revision` em inserção,
alteração, movimentação ou exclusão pertinente; hash e revisão participam da
leitura de currentness.

Essa igualdade demonstra quais cards integram a materialização, mas não prova,
sozinha, que cada declaração de `materializedResources` corresponde às
instâncias de package dentro do JSON de cada card. O gate de escrita valida os
cards sob o snapshot corrente; a auditoria determinística da #106 deve ainda
derivar o uso dos cards e confrontá-lo independentemente com o manifesto.

Não há backfill de análise, parâmetros ou `ResourceSet` inventados. A leitura
retorna `unresolved` para análise; qualquer conteúdo que exista sem manifesto
parametrizado — inclusive se criado depois da migração pelo fluxo anterior —
fica `legacy_untracked` e sua disponibilidade, `legacy_unrestricted`. Sem
conteúdo, materialização e disponibilidade permanecem `unresolved` até que uma
nova decisão seja registrada.

`get_authoring_design_state_v1` também compara caminho, versão da entidade,
resolução corrente, referências ligadas, hash canônico e revisão do estado de
materialização. Se a árvore, um parâmetro ou um card avançou, análise, snapshot,
blueprint ou manifesto retorna `stale` em vez de ser tratado como base atual
para nova materialização.

### Estado pessoal por `trailItemId`

`trailItemId` é a identidade estável de um item em Trilhas, independentemente
de sua fonte corrente. Por isso, grupo, progresso, **Rever** e observação podem
permanecer quando uma publicação é atualizada ou quando um item continua
acessível por workspace depois da retirada de uma seleção.

| Finalidade | PostgreSQL | Projeção local |
| --- | --- | --- |
| seleção oficial | `user_course_selections` | `courseSelections` |
| identidade integrada | `private.trail_items` | entrada de `syncState` |
| grupos | `study_paths`, `study_path_items` | entrada de `syncState` |
| cursor, conclusão, Rever e observação | `trail_personal_states` | cache e fila compacta em `syncState` |

A projeção de Trilhas é paginada por `list_trail_items_v1`. O cliente percorre
todas as páginas, rejeita cursor repetido e só então substitui o snapshot
local. Uma página incompleta nunca se torna a nova projeção. Offline, essa
projeção é somente leitura e todas as capacidades de mutação permanecem falsas.

## Por que não existe uma outbox universal

### Problema

“Sincronizar” pode significar transportar um vínculo pequeno, aplicar patches
num documento pessoal ou alterar um workspace compartilhado sob CAS. Forçar
todas essas operações a um único protocolo esconderia diferenças de
autoridade, conflito e tamanho.

### Decisão

O AraLearn mantém canais separados:

1. a outbox relacional e `apply_sync_batch` transportam a seleção leve de
   cursos oficiais;
2. grupos de Trilhas usam RPCs transacionais e `requestId`;
3. estado pessoal usa patches compactos por `trailItemId`, CAS e `mutationId`;
4. workspace autoral usa revisão global, versões de partes e RPCs próprias;
5. desenho parametrizado usa cache fracionado e fila própria somente para
   override manual ou restauração de Auto, com CAS remoto;
6. revisões de cursos são baixadas como artefatos por hash.

### Consequências

Cada canal explicita o tipo de conflito que consegue resolver. Uma falha num
canal não autoriza escrita por outro e conteúdo pedagógico integral nunca é
empurrado pela outbox de seleção.

### Limites

A multiplicidade de canais aumenta a responsabilidade de observabilidade e
testes. O código precisa classificar corretamente falha retentável, sessão
ausente, rejeição definitiva e conflito. A matriz de testes em
`tests/runtime/relational-sync.test.js`,
`integrated-course-sync.test.js` e
`trail-personal-state-repository.test.js`, acrescida de
`workspace-design-offline-store.test.js`, protege essas fronteiras.

### Cache e fila offline do desenho

`WorkspaceDesignOfflineStore` reutiliza `syncState`; não cria object stores nem
outra fonte canônica. Cada fatia contém o último estado remoto validado de uma
microssequência e é isolada por conta e workspace. Resposta remota mais antiga
não rebaixa a revisão local; a listagem é paginada e não exige carregar um curso
grande inteiro.

A fila guarda no máximo intenções `set_manual_override` e `restore_auto`.
Enquanto pendente, um override aparece separado da fatia remota e é marcado
como não autoritativo. A reconexão relê revisão, capacidade e locks; conflito é
preservado para decisão, falha retentável continua pendente e confirmação só
remove a intenção depois de armazenar o novo estado remoto. Repetir o mesmo
`requestId` só é idempotente quando a impressão do payload coincide; conflito
pode ser reenviado com a revisão relida ou descartado explicitamente.

Uma intenção ainda não tentada é coalescida por slot: escolher Auto depois de
um override local cancela o `set_manual_override`, em vez de enviá-lo mais
tarde. O índice das filas é isolado por conta e permite que inicialização,
reconexão e saída localizem pendências sem reabrir a microssequência. Resposta
perdida consulta o recibo idempotente antes de repetir a mutação.

Transações do `syncState` preservam índice e fila quando duas instâncias operam
ao mesmo tempo. A sincronização usa Web Locks quando disponíveis; no fallback
IndexedDB, uma lease renovável por workspace impede dois envios concorrentes e
expira se a instância desaparecer.

Lista de Workspaces e overview usam chaves por conta e escrita monotônica por
revisão. A composição transitória do leitor reutiliza a paginação de Trilhas,
com fence de revisão e cache por `trailItemId`; nenhum documento monolítico
atravessa a Action. O cache é suplementar: quota ou falha do IndexedDB não
transforma uma resposta online válida em erro. A projeção SQL
`authoring-product-state-projection-v1` fornece os estados de lista e os
marcadores de microssequência no mesmo fence da revisão; o cache não os infere
por visitas anteriores.

Os limites atuais são 2 MiB por fatia, 32 MiB de cache de desenho por workspace,
512 KiB por fila, 100 operações por workspace, 10 mil entradas no índice local
e 100 itens por página. Ao atingir o orçamento total, a fatia reconstruível mais
antiga é removida antes do estado recente. Esses tetos são proteção técnica, não
unidades pedagógicas nem promessa de capacidade do dispositivo.

## Ciclo de uma sincronização

Uma interação local segue este princípio:

```text
gesto na interface
→ transação local
→ registro da intenção pendente, quando aplicável
→ envio remoto posterior
→ confirmação ou classificação da falha
→ recebimento das mudanças remotas
```

O ciclo executado por `RelationalSyncEngine` é mais específico:

1. **push**: tenta enviar operações pendentes;
2. **bootstrap**, se necessário: estabelece snapshot e cursor de base;
3. **pull**: recebe mudanças remotas em páginas;
4. **reconciliação de revisões**: baixa os cursos cujo hash mudou;
5. **commit local**: instala somente a revisão validada.

Cada página de pull é aplicada antes da seguinte. Se o aplicativo fechar, o
cursor local registra apenas o prefixo realmente confirmado. Se a sessão
expirar, a outbox permanece; chamadas remotas param até novo login.

### Bootstrap

`bootstrap_replica` devolve seleções leves e `highWaterSequence`. Bootstrap não
é download de todo o catálogo: revisões ausentes são obtidas separadamente. Um
dispositivo cuja retenção expirou precisa repetir o bootstrap antes de retomar
o feed incremental.

### Download e troca de revisão

Para cada seleção, o manifesto informa `courseId`, sequência de publicação e
hash. O cliente:

1. compara o hash remoto com o hash instalado;
2. baixa o JSON por `aralearn-course-revisions`;
3. valida o envelope e os packages;
4. calcula o hash canônico recebido;
5. converte a revisão em linhas;
6. substitui a projeção inteira na mesma transação.

Falha de download, contrato ou hash não substitui uma revisão válida anterior.
Uma revisão inválida é isolada daquele curso; os demais continuam disponíveis.

### Atualização adiada

Se uma nova publicação alcança um curso com rascunho local ou operação ainda
não resolvida, o cliente não descarta silenciosamente o trabalho. A revisão
remota é marcada como adiada. Restaurar a publicação exige informar a revisão
do rascunho que foi lida; se outra aba alterou o rascunho, a restauração falha
por CAS.

## Estado pessoal compacto

O estado funcional não registra abertura, tempo, tentativa, acerto ou erro. Ele
contém apenas cursor, conclusão estrutural, marca **Rever** e observação
autoral. A representação v3 de progresso usa o ID da lição e conjuntos de
`completedCardIds`, em vez de criar uma linha temporal para cada toque.

`mutate_trail_personal_state_v1` recebe no máximo 512 operações ou 64 KiB por
lote e devolve revisão e data, não o documento inteiro. O orçamento do cliente
para a linha é 256 KiB. Uma resposta perdida pode repetir `mutationId`; um
conflito relê o estado corrente e reaplica somente os patches pendentes.

Essa compactação reduz armazenamento e evita transformar estudo em telemetria
comportamental. Ela também limita análises posteriores: o sistema não pode
reconstruir duração, número de tentativas ou sequência detalhada de respostas
porque escolheu não coletá-las.

## Falhas e comportamento esperado

| Situação | Comportamento seguro |
| --- | --- |
| sem rede, timeout, HTTP 429 ou 5xx | conserva pendência e revisão local; tenta depois |
| sessão ausente ou expirada | classifica `auth_required`, preserva filas e pede novo acesso |
| payload inválido ou referência inexistente | rejeita sem commit parcial |
| capacidade revogada | nega a operação; na leitura autenticada seguinte remove cache cuja autoridade terminou |
| revisão avançou | recusa CAS e exige nova leitura |
| override offline encontra lock de pesquisa ou capacidade revogada | não envia ou registra conflito; preserva a intenção separada do estado canônico |
| resposta remota se perdeu | repete a mesma chave e o mesmo payload para recuperar o recibo |
| artefato baixado não corresponde ao hash | isola a revisão e não substitui o curso válido |
| outra aba substituiu a conexão IndexedDB | encerra a conexão antiga e repete a operação por uma conexão corrente |

O cliente pode detectar que está offline; não pode deduzir que uma permissão
foi revogada enquanto não fala com o servidor. Por isso, o cache permite
leitura do conteúdo já autorizado, mas nunca inventa capacidades de escrita.

## Tombstones, feeds e retenção

### Problema

Apagar imediatamente um evento remoto pode fazer um dispositivo antigo não
perceber a retirada e restaurar estado obsoleto. Conservar todos os eventos
para sempre, por outro lado, cresce sem limite.

### Decisão

O feed pessoal usa o menor cursor dos dispositivos ativos como watermark e
mantém janela mínima de retenção. Dispositivos são considerados ativos por 90
dias; `private.sync_changes` permanece por pelo menos 30 dias; deduplicação de
mutações de dispositivo usa 90 dias. Um dispositivo vencido volta pelo
bootstrap.

O feed de revisão oficial é ainda mais compacto: mantém somente a mudança mais
recente por curso e audiência, inclusive o tombstone. Cada atualização recebe
sequência maior; assim, um dispositivo que consulta depois de sua sequência
continua encontrando o estado vigente sem uma linha por republicação.

Uma manutenção oportunista diária inativa dispositivos vencidos e compacta o
prefixo seguro sob advisory lock. A RPC administrativa
`compact_sync_history` oferece dry-run antes da exclusão efetiva.

### Consequências e limites

Retenção é uma política de disponibilidade do feed, não backup. O bootstrap
reconstrói a base corrente, mas não recupera um histórico excluído. Tombstones
de revisão precisam permanecer enquanto não houver watermark específico que
prove que todos os clientes relevantes observaram a retirada.

O estado instrucional possui coleta privada e conservadora em lotes. Por padrão,
somente versões com mais de 180 dias, já substituídas e sem referência vigente
são candidatas; cada lote usa até 256 registros por família e `SKIP LOCKED`.
Assignments referenciados por snapshot, blueprints ligados ou citados por
manifesto, snapshots ligados a blueprint ou manifesto, análises referenciadas e
`ResourceSet`s usados por assignment corrente, snapshot ou seleção são
preservados. Manifestos não são removidos por idade nessa etapa. O limite de
lote pode ser ajustado entre 1 e 1.000, mas encurtar a retenção exige decisão
operacional explícita; coleta de lixo não é backup nem restauração histórica.

## Segurança da persistência

Cada conta usa banco local distinto. No servidor, Row-Level Security e RPCs
contextuais restringem dados pessoais. Tabelas internas de feed e
deduplicação não têm leitura direta pelo navegador. Funções administrativas
exigem canal protegido e não usam a chave publicável do site.

Dados locais continuam sujeitos à segurança física do dispositivo e do perfil
do navegador. Sair do AraLearn não constitui apagamento seguro do IndexedDB;
exclusão de conta e limpeza de dispositivo são operações distintas. A política
de dados pessoais está em [Privacidade](privacidade.md).

## Evidência e pontos não demonstrados

A suíte verifica transações locais, round-trip, troca de réplica, conflitos,
falhas de rede simuladas, isolamento de conta, retenção, resolução do desenho e
Auth/PostgREST no stack local. A [medição pública do payload parametrizado](evidence/parameterized-authoring-storage-budget-2026-08-15.json)
mede JSON UTF-8 representativo; ela não inclui páginas e índices do PostgreSQL,
blueprints nem custo real de uma implantação. Os testes tampouco demonstram
disponibilidade prolongada, perda física do dispositivo ou comportamento de
todos os navegadores sob pressão de armazenamento. A [Matriz de conformidade
técnica](matriz-conformidade-tecnica.md) explicita esses limites.
## Analytics versionados

A migration `20260817120000_authoring_analytics.sql` acrescenta dicionário
imutável, observações explícitas de outcome, versões de dataset, receipts e
quatro views relacionais. `datasetSetRef` combina workspace/experimento,
revisões append-only e estado explícito de progresso. Outcomes fixam protocolo,
condição, `VariantRevision`, instrumento, onda e pseudônimo; mudança semântica é
nova linha/versão, não UPDATE. Exclusão da conta pode apenas anonimizar
`recorded_by`. Tabelas privadas não recebem grants de cliente; RPCs são
`service_role` e revalidam `read` ou `research`.
