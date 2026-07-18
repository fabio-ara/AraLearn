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

Uma microssequência possui dois tokens de concorrência. `revision` cobre metadados e relações gerais; `cards_revision` cobre somente a subárvore de cards e seus filhos. Alterar título, objetivo ou dependências não invalida por si só uma substituição de cards já preparada. Alterar card, bloco, opção ou recurso filho incrementa `cards_revision`, e `replace_microsequence_cards` compara e avança esse token estreito de forma transacional.

## Catálogo e cópias pessoais

A listagem inicial consulta somente metadados de cursos oficiais publicados no servidor. A árvore didática não é baixada para compor o catálogo.

`clone_catalog_course` executa no PostgreSQL uma cópia transacional da árvore publicada. A cópia recebe UUIDs novos, registra a associação do usuário e guarda `source_entity_id` em cada entidade clonável. O cliente nunca tenta reproduzir essa operação com uma série de requisições independentes.

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
7. lê `pull_sync_changes` a partir do último número de sequência;
8. acumula as páginas sem expor árvore parcial e aplica o ciclo inteiro em uma única transação IndexedDB;
9. persiste o cursor somente depois do commit local.

O snapshot inicial torna causal uma sequência como inserir card, inserir bloco filho e depois atualizar o mesmo card: o incremento agregado provocado pelo filho não é confundido com escrita de outro dispositivo. As operações compostas de substituição de cards e exclusão de curso respeitam a mesma ordem da outbox e não atravessam um conflito granular anterior. Se qualquer etapa bloquear, o cliente não envia silenciosamente as mutações causais posteriores.

Exclusões são tombstones com `deleted_at`. Repetir uma chamada depois de falha é seguro. Em revisão divergente, o servidor não usa última gravação silenciosa: o estado remoto permanece canônico, a mutação local permanece registrada e uma linha em `conflicts` conserva as duas versões para resolução explícita.

## Segurança

Todas as tabelas expostas têm RLS habilitada. O acesso anônimo às informações de usuário é negado. Usuários autenticados podem ler cursos oficiais publicados; cursos pessoais só podem ser lidos ou alterados pelo proprietário e por membros com papel autorizado. Funções transacionais verificam `auth.uid()` internamente e fixam um `search_path` seguro.

O runtime recebe apenas a Project URL e a publishable key. Service role, senha do banco e segredos administrativos nunca entram no site, no APK ou no IndexedDB.
