# Persistência relacional e sincronização

O PostgreSQL do Supabase é a fonte canônica compartilhada do AraLearn. O IndexedDB `aralearn-relational-v1` mantém uma réplica relacional por dispositivo e uma outbox de mutações. O contrato público `aralearn.contract` versão 3 continua sendo usado para importação, exportação, validação, contexto de geração e visão de domínio montada em memória; ele não é uma unidade de persistência.

Não há leitura automática do banco IndexedDB documental anterior. Quem precisar recuperar dados de uma versão antiga deve exportar manualmente o JSON nessa versão e importá-lo na versão relacional.

## Unidades persistidas

As identidades persistidas são UUIDs. Os `id` textuais do contrato são preservados em `contract_key`, porque continuam úteis na autoria e no intercâmbio, mas não funcionam como chave global do banco.

Os nomes SQL usam `snake_case`; os object stores usam os nomes de coleção do runtime. O mapeamento é explícito:

| Contrato ou estado | PostgreSQL/Supabase | IndexedDB |
|---|---|---|
| curso e associação | `courses`, `course_memberships` | `courses`, `memberships` |
| módulo e lição | `modules`, `lessons` | `modules`, `lessons` |
| guias | `course_guides`, `guide_items` | `guides`, `guideItems` |
| tópicos e declarações | `lesson_topics`, `topic_statements` | `topics`, `topicStatements` |
| microssequência, dependências e listas semânticas | `microsequences`, `microsequence_dependencies`, `microsequence_statements` | `microsequences`, `dependencies`, `microsequenceStatements` |
| cards | `cards` | `cards` |
| fontes e referências de tópico | `card_refs`, discriminada por `ref_kind` | `cardSources`, `cardTopics` |
| blocos e alternativas | `card_blocks`, `block_options` | `blocks`, `options` |
| nós e arestas de árvore, grafo e relação | `block_nodes`, `block_edges` | `nodes`, `edges` |
| estrutura e exercícios de fluxo | `flow_nodes`, `flow_cases`, `flow_practices`, `node_practices`, `node_practice_items` | `flowNodes`, `flowCases`, `flowPractices`, `flowPracticeEntries`, `flowPracticeOptions`, `flowPracticeVariants`, `flowShapeOptions` |
| matrizes, células, pontos, linhas e destaques | `block_matrix_items`, `block_cells`, `block_points`, `block_lines`, `block_highlights` | `matrixItems`, `cells`, `points`, `lines`, `highlights` |
| estudo e comentários | `lesson_progress`, `card_progress`, `card_comments` | `lessonProgress`, `cardProgress`, `comments` |
| sincronização | `sync_devices`, `sync_mutations`, `sync_changes` | `outbox`, `syncState`, `conflicts`; a identidade do dispositivo e o cursor ficam em `syncState` |

`node_practice_items.item_kind` separa opções, variantes e opções de forma nos três object stores correspondentes. Da mesma maneira, `card_refs.ref_kind` separa fontes e tópicos no dispositivo. Essa tradução faz parte do protocolo de push/pull; não há duas representações documentais independentes.

`card.topics` é uma lista de tags textuais livres, não uma exigência de referência a `lesson.topics`. Cada string vira uma linha de `card_refs` com `ref_kind = 'topic'`: quando ela coincide com o `contract_key` de um tópico estruturado da mesma lição, `topic_id` registra também a FK; quando não coincide, `topic_id` fica nulo e `topic_contract_key` preserva a tag integralmente. O round-trip remonta as duas formas sem perda.

Campos conhecidos e relevantes para integridade ficam em colunas ou tabelas filhas. JSONB é reservado a valores pequenos realmente polimórficos e aos envelopes transitórios de sincronização; nenhuma tabela guarda um curso, módulo, lição, microssequência, card ou documento de progresso inteiro em JSONB.

## Identidades naturais de progresso e comentários

As linhas que admitem uma única ocorrência por usuário e entidade recebem UUIDs v8 determinísticos derivados de uma chave natural versionada. `lessonProgress` usa usuário + UUID persistido da lição; `cardProgress` e `comments` usam usuário + UUID persistido do card. Os `contract_key` textuais não participam dessa identidade.

Assim, dois dispositivos que registram pela primeira vez o mesmo progresso ou comentário calculam o mesmo UUID, em vez de criarem linhas aleatórias concorrentes. As constraints naturais do PostgreSQL continuam sendo a autoridade final. Se uma linha antiga chegar com outro UUID e colidir com a mesma chave natural, o servidor devolve `canonicalEntityId`; a réplica remapeia as referências para a identidade canônica sem duplicar progresso ou comentário.

## Round-trip do contrato

A normalização recebe somente um documento v3 aprovado pelo validador público. Ela cria UUIDs para novas entidades, preserva `contract_key`, resolve relações internas e produz conjuntos de linhas. A montagem faz o caminho inverso e executa novamente o validador público.

O teste de compatibilidade é:

```text
JSON v3 válido
→ normalização em linhas
→ persistência relacional
→ montagem do JSON v3
→ igualdade semântica e hash canônico
→ validação pública
```

Todos os onze recursos (`paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`) fazem parte desse teste. Campo desconhecido ou não mapeado produz erro; não existe descarte silencioso.

## Alterações granulares

A interface continua trabalhando com um `ProjectDocument` montado em memória. Ao salvar, o `ProjectDocumentDiffer` compara o estado anterior com o novo, e o `DomainMutationService` aplica as operações em uma transação local. Cada operação traz `mutationId`, `baseRevision`, tipo de entidade, UUID, campos alterados e a linha granular ou seu tombstone.

Exemplos:

- corrigir o texto de um parágrafo atualiza uma linha de `blocks`;
- corrigir uma alternativa atualiza uma linha de `block_options`;
- alterar um vértice ou uma aresta atualiza apenas `block_nodes` ou `block_edges`;
- concluir um card atualiza `card_progress` e, quando necessário, a agregação de `lesson_progress`;
- substituir cards de uma microssequência valida o fragmento primeiro e troca apenas `cards` e suas linhas filhas naquele escopo.

Uma falha de validação encerra a transação sem modificar o estado anterior. O progresso e os comentários externos ao escopo permanecem intactos.

## Durabilidade local explícita

`saveProject` e `saveProgress` atualizam a visão de domínio imediatamente para manter a interface responsiva, mas devolvem uma `Promise` que só resolve depois do commit da transação IndexedDB. O repositório publica três estados distintos: `pending`, enquanto há gravação local em voo; `saved`, somente quando memória e linhas persistidas coincidem; e `error`, quando o commit falha. Em erro, o trabalho continua na memória, a falha permanece visível e `retryDurability` repete o estado desejado sem anunciar uma gravação inexistente.

`flush()` aguarda toda a fila e propaga a falha persistente. A saída da conta e a troca controlada de runtime precisam concluir esse flush; se ele falhar, a saída é interrompida e a interface oferece nova tentativa. `visibilitychange` e `pagehide` solicitam flush como melhor esforço. No APK, o botão voltar aguarda a mesma Promise antes de pedir à Activity que finalize, e `onPause` dispara um flush adicional como proteção para encerramentos controlados pelo Android.

## Isolamento da réplica por usuário

Sessão e estado PKCE ficam no banco global `aralearn-relational-v1`, aberto antes de se conhecer o usuário. Depois da autenticação, a réplica de dados é aberta em um banco físico derivado exclusivamente do UUID Supabase: `aralearn-relational-v1:user:<uuid>`. E-mail não participa do nome nem da autorização local.

Os `mutationId` pendentes de RPCs idempotentes do catálogo também ficam no banco global, mas cada chave inclui obrigatoriamente o UUID da sessão. Assim, trocar de A para B não reutiliza, remove nem oculta a tentativa pendente de A; ao retornar, A repete a operação com o mesmo identificador.

O logout fecha as conexões, mas não apaga curso, outbox, conflitos, rejeições, progresso ou comentários. Ao entrar novamente, a mesma conta reabre sua réplica; outra conta abre outro banco e não enxerga os object stores da anterior. Exclusão da réplica é uma ação destrutiva separada, explícita e confirmada, nunca um efeito normal da troca de usuário.

Uma microssequência possui dois tokens de concorrência. `revision` cobre metadados e relações gerais; `cards_revision` cobre somente a subárvore de cards e seus filhos. Alterar título, objetivo ou dependências não invalida por si só uma substituição de cards já preparada. Alterar card, bloco, opção ou recurso filho incrementa `cards_revision`, e `replace_microsequence_cards` compara e avança esse token estreito de forma transacional.

## Catálogo e cópias pessoais

A listagem inicial consulta somente metadados de cursos oficiais publicados no servidor. A árvore didática não é baixada para compor o catálogo.

`clone_catalog_course` executa no PostgreSQL uma cópia transacional da árvore publicada. A cópia recebe UUIDs novos, registra a associação do usuário e guarda `source_entity_id` em cada entidade clonável. O UUID pessoal devolvido pela RPC direciona a sincronização que recebe a árvore; se o feed já a materializou, nenhum snapshot duplicado é baixado. O cliente nunca tenta reproduzir a clonagem com uma série de requisições independentes.

O hash atual da cópia é comparado ao hash de origem. Uma cópia não personalizada pode ser atualizada transacionalmente por `refresh_personal_course_from_source`. Se houver personalização, o servidor não sobrescreve nem faz merge automático: a interface oferece criar uma nova cópia da publicação, preservando a anterior.

## Exclusão concorrente de curso

Excluir uma cópia pessoal é uma operação composta, disponível somente ao proprietário. A transação local aplica tombstones à árvore, associação, progresso e comentários e grava uma única intenção `personalCourseDeletion` na outbox; ela contém identificadores e metadados de reversão, não uma cópia JSON do curso.

`delete_personal_course` recebe `mutationId` e a revisão-base do curso, serializa a escrita e só aplica os tombstones remotos se a revisão ainda coincidir. Uma alteração remota concorrente produz um conflito estruturado com a linha e a revisão canônicas, sem excluir parcialmente a árvore. A réplica mantém a intenção local e o estado remoto para decisão explícita: aceitar o remoto restaura a árvore recebida e descarta a exclusão local; manter o local cria uma nova mutação de exclusão contra a revisão remota. Não há resolução silenciosa por última gravação.

## Protocolo offline

Cada instalação recebe um UUID de dispositivo persistido. A sincronização segue este ciclo:

1. lê mutações pendentes da outbox em ordem causal e em páginas;
2. envia o lote a `apply_sync_batch`;
3. o servidor deduplica por `mutationId`, serializa por curso as escritas autorais e captura as revisões no início do lote;
4. aplica as mutações na ordem enviada, comparando `baseRevision` com esse snapshot e com as mutações diretas anteriores do mesmo lote;
5. diante de conflito ou rejeição real, desfaz atomicamente todo o lote; somente a mutação bloqueadora vira conflito terminal, enquanto as irmãs revertidas ou ainda não executadas continuam pendentes;
6. confirma as mutações somente quando o lote conclui sem bloqueio;
7. em dispositivo novo, recebe de `bootstrap_replica` um snapshot autorizado e o `highWaterSequence` da mesma visão lógica e grava ambos numa única transação local;
8. nos ciclos seguintes, lê `pull_sync_changes` somente depois desse high-water;
9. aplica uma página por transação IndexedDB e persiste o cursor após cada commit, sem acumular o histórico inteiro em memória;
10. se houver interrupção, retoma da última página confirmada, sem materializar o mesmo curso novamente por snapshot e feed.

O snapshot inicial torna causal uma sequência como inserir card, inserir bloco filho e depois atualizar o mesmo card: o incremento agregado provocado pelo filho não é confundido com escrita de outro dispositivo. As operações compostas de substituição de cards e exclusão de curso respeitam a mesma ordem da outbox e não atravessam um conflito granular anterior. Se qualquer etapa bloquear, o cliente não envia silenciosamente as mutações causais posteriores.

Exclusões são tombstones com `deleted_at`. Repetir uma chamada depois de falha é seguro. Em revisão divergente, o servidor não usa última gravação silenciosa: o estado remoto permanece canônico, a mutação local permanece registrada e uma linha em `conflicts` conserva as duas versões para resolução explícita.

### Classificação de falhas do push

O cliente classifica cada resultado antes de alterar a outbox. A classificação não depende apenas de uma exceção HTTP: as RPCs compostas devolvem, sempre que possível, `status`, `mutationId`, `code`, `reason` e `message` estruturados.

- **Retentável:** indisponibilidade de rede ou serviço, timeout, HTTP 429 e HTTP 5xx mantêm a mutação como `pending`. A repetição usa o mesmo `mutationId`; quando a sessão e a conexão ainda permitem, uma falha de push não impede o pull seguro das alterações remotas.
- **Conflito:** revisão divergente, SQLSTATE `40001`, HTTP 409 ou conflito otimista explícito movem a mutação para `conflict`. As versões local e remota ficam preservadas, e as mutações causais descendentes não atravessam a bloqueadora.
- **Rejeição definitiva:** payload ou fragmento inválido, violação estrutural, referência ou entidade inexistente/removida, autorização revogada, reutilização incompatível de `mutationId` e outras falhas determinísticas movem a mutação para `rejected`. Ela deixa a fila automática e não volta a `pending` sem uma nova ação do usuário.

A biblioteca mostra conflitos e rejeições como estados que exigem atenção. Uma rejeição só é removida por descarte explícito e confirmado; o descarte restaura o último estado local confirmado e trata deterministicamente sua cadeia causal. Não existe loop automático para uma mutação que o servidor já recusou de forma definitiva.

### Snapshot, revogação e reconciliação

`bootstrap_replica` monta todas as memberships, árvores, progressos e comentários autorizados sob a mesma barreira transacional que determina `highWaterSequence`. O IndexedDB aplica snapshot e cursor numa única transação. Depois disso, o feed começa estritamente depois do high-water e cada página confirma seu próprio cursor; o cliente nunca acumula o histórico completo antes de aplicar.

Um snapshot remoto só substitui um curso local quando ele ainda não existe, quando a réplica está comprovadamente limpa ou após restauração explicitamente confirmada. Outbox pendente, conflito, rejeição ou edição local ainda não confirmada bloqueiam a substituição: o curso local é preservado, o snapshot remoto fica disponível para comparação e uma reconciliação é registrada.

Quando chega o tombstone da membership, o curso deixa de ser visível imediatamente. Se não há trabalho local, uma única transação remove curso, árvore, progresso, comentários e índices relacionados. Se há trabalho não sincronizado, a árvore necessária à reconciliação é preservada sem voltar à biblioteca, e a interface exige decisão explícita. O tombstone mínimo da revogação impede que páginas antigas ressuscitem o acesso.

### Retenção e compactação remota

A política versionada em `private.sync_retention_policy` usa, por padrão, janela de dispositivo ativo de 90 dias, retenção mínima de 30 dias para `sync_changes`, 180 dias para mutações e 365 dias para idempotência de RPC. `private.safe_sync_watermark` calcula o menor cursor entre dispositivos ainda ativos; alterações do feed só podem ser eliminadas quando estão abaixo desse watermark **e** além da retenção mínima.

`compact_sync_history(true, now())` é o dry-run administrativo e informa candidatos sem excluir. `compact_sync_history(false, now())` desativa dispositivos vencidos e compacta mudanças abaixo do watermark, mutações antigas e registros antigos de idempotência de acordo com a política. `sync_storage_diagnostics()` informa watermark, quantidade e tamanho das tabelas, dispositivos ativos/inativos e os intervalos vigentes. Ambas exigem um usuário marcado como administrador da aplicação ou contexto administrativo no servidor; `anon` e usuários comuns não recebem essa capacidade.

Dispositivo inativo não pode retomar de um cursor anterior à compactação: precisa executar novo bootstrap. Se houver trabalho local não resolvido, o rebootstrap é bloqueado e vira reconciliação em vez de sobrescrever a réplica. Tombstones das entidades relacionais não são apagados somente por idade; a compactação remove entradas antigas do feed já protegidas pelo watermark, mantendo a condição necessária para impedir ressurreição. Conflitos resolvidos deixam de bloquear a outbox, mas permanecem na réplica isolada do usuário como registro local até uma limpeza destrutiva explicitamente solicitada.

## Segurança

Todas as tabelas expostas têm RLS habilitada. O acesso anônimo às informações de usuário é negado. Usuários autenticados podem ler cursos oficiais publicados; cursos pessoais só podem ser lidos ou alterados pelo proprietário e por membros com papel autorizado. Funções transacionais verificam `auth.uid()` internamente e fixam um `search_path` seguro.

O runtime recebe apenas a Project URL e a publishable key. Service role, senha do banco e segredos administrativos nunca entram no site, no APK ou no IndexedDB.
