# Persistência relacional e sincronização

O PostgreSQL do Supabase é a fonte canônica compartilhada do AraLearn. O IndexedDB mantém uma réplica relacional por usuário e dispositivo para permitir estudo e edição sem conexão. O contrato público `aralearn.contract` versão 3 continua sendo usado por validadores, importação e exportação manual, geração assistida, ferramentas administrativas de intercâmbio e pela visão de domínio montada em memória; ele não é unidade de persistência.

## Um catálogo, seleções leves

Cada curso oficial publicado possui uma única árvore no PostgreSQL. Adicionar um curso à biblioteca não copia módulos, lições, microssequências ou cards: `select_catalog_course` cria apenas uma linha em `user_course_selections`. Remover usa `unselect_catalog_course` e não altera a publicação oficial nem a seleção de outra pessoa.

O catálogo consulta somente metadados por `list_catalog_collections`. A árvore de um curso é obtida por `get_selected_course_graph` somente depois de o usuário selecioná-lo. Assim, o armazenamento remoto cresce aproximadamente com `catálogo + estado pessoal`, em vez de `catálogo × usuários`.

Coleções são agrupamentos administrativos do catálogo. Trilhas são agrupamentos pessoais: `study_paths` e `study_path_courses` apenas referenciam cursos selecionados e nunca duplicam conteúdo.

## Cópia pessoal somente quando houver autoria

Selecionar, baixar, estudar, comentar ou organizar um curso oficial não cria uma cópia de sua árvore no PostgreSQL. O conteúdo oficial permanece compartilhado e somente leitura.

Quando o usuário confirma a primeira alteração real no conteúdo, `fork_catalog_course_for_editing` executa uma única transação: cria uma raiz pessoal ligada ao curso de origem, duplica a árvore com UUIDs novos e remapeia seleção, trilhas, progresso e comentários. A mudança autoral é aplicada somente depois dessa preparação. Abrir a aba de edição, inspecionar um card ou cancelar uma alteração não consome espaço com uma cópia.

Depois da bifurcação, o curso pessoal é independente. O `ProjectDocumentDiffer` produz patches apenas para as linhas modificadas, e a outbox não contém o documento integral. Cursos criados do zero e documentos v3 importados manualmente também são normalizados diretamente como árvores pessoais; não alteram a publicação oficial.

## Tabelas e object stores

| Domínio | PostgreSQL | IndexedDB |
|---|---|---|
| catálogo e seleção | `courses`, `user_course_selections` | `courses`, `courseSelections` |
| árvore didática | `modules`, `lessons`, `microsequences`, `cards` e tabelas filhas | stores relacionais equivalentes |
| organização | `study_paths`, `study_path_courses` | `studyPaths`, `studyPathCourses` |
| progresso | `lesson_progress`, `card_progress` | `lessonProgress`, `cardProgress` |
| comentários | `card_comments` | `comments` |
| sincronização | `private.sync_devices`, `private.sync_idempotency`, `private.sync_changes` | `outbox`, `syncState` |

Cada conta usa o banco físico `aralearn-relational-v2:user:<uuid>`; e-mail não participa do nome nem da autorização. Logout conserva a réplica e a outbox. Entrar com outra conta abre outro banco, sem visibilidade cruzada. O banco antigo não é aberto nem migrado.

## Identidade estável

Os IDs textuais do contrato viram `contract_key` no escopo do pai. Relações persistidas usam UUIDs e chaves estrangeiras reais.

Na publicação oficial, cada UUID é derivado deterministicamente da `identityKey`. O hash do conteúdo e a ordem de importação não participam dessa identidade. Corrigir um título ou texto e republicar preserva os UUIDs das entidades semanticamente iguais; enquanto o usuário estuda a publicação compartilhada, progresso e comentários continuam associados sem `source_entity_id` ou mapa de linhagem por entidade. Ao criar uma cópia pessoal para edição, a transação remapeia esse estado para os novos UUIDs.

`publication_seq` e `content_hash` são marcadores internos da publicação atual. Eles servem para detectar que a réplica precisa baixar a árvore novamente, não para oferecer histórico de versões ao estudante.

## Bootstrap leve

`bootstrap_replica` devolve, sob a mesma visão lógica:

- seleções do usuário;
- progresso de lições e cards;
- comentários;
- trilhas e seus cursos;
- metadados dos cursos selecionados;
- `highWaterSequence`.

O bootstrap não agrega as árvores didáticas. O IndexedDB aplica snapshot e cursor numa única transação; depois baixa somente as árvores selecionadas que estejam ausentes ou desatualizadas. O feed incremental começa estritamente depois do high-water.

Quando uma publicação oficial muda, o dispositivo baixa a árvore completa, valida todas as relações e remonta um documento v3 válido antes de substituir o cache em uma única transação local. Timeout, fechamento do app, download incompleto ou grafo inválido preservam a árvore anterior. Entidades novas começam sem progresso e IDs preservados mantêm seu estado pessoal automaticamente.

Se a publicação remover uma entidade que ainda possui mutação local não resolvida, a atualização é adiada: o cache e a outbox permanecem intactos até confirmação remota, descarte explícito ou nova ação válida. Somente depois de não existir trabalho bloqueador a transação poda progresso e comentários sem alvo. Ao remontar uma lição, apenas o prefixo consecutivo de cards atualmente concluídos conta como avanço; inserir um card antes do ponto alcançado não o marca como concluído por engano.

## Salvamento e sincronização oportunista

Uma ação de estudo segue esta ordem:

```text
alteração em memória
→ transação no IndexedDB
→ entrada pequena na outbox
→ tentativa automática de push quando houver rede
→ pull incremental paginado
```

O estudo não depende da rede. A sincronização é tentada ao iniciar, recuperar conexão, voltar à tela, concluir gravações e enquanto o app estiver visível e online. Fechar o app encerra essas tentativas. O botão de sincronização apenas solicita um ciclo imediato; não é necessário para salvar o trabalho.

Cada mutação recebe `mutationId`. Repetir uma requisição após timeout é idempotente. O pull aplica uma página por vez, confirma o cursor depois da transação local e pode retomar sem acumular todo o histórico em memória.

Seleção, trilhas, progresso, comentários e patches granulares de cursos pessoais entram na outbox. Conteúdo oficial, árvore completa e documento JSON nunca são enviados como uma única mutação do estudante.

## Última atualização válida

Progresso, comentários, seleção, organização e linhas de cursos pessoais seguem uma regra previsível de *last write wins*: a última mutação válida recebida pelo servidor para a mesma identidade passa a ser o estado corrente. O estudante não vê versões, revisões ou uma interface de merge. Essa regra nunca permite modificar a árvore oficial compartilhada.

O timestamp aceito para ordenação é atribuído ou validado pelo protocolo do servidor; o cliente não pode alterar dados de outra conta. A repetição do mesmo `mutationId` devolve o mesmo resultado sem reaplicar a operação.

Reiniciar um curso remove o progresso pessoal atual por mutações granulares. A regra continua sendo a mesma: a última ação válida confirmada pelo servidor passa a valer. Um dispositivo que permaneceu offline pode enviar depois uma atividade mais recente e torná-la o estado corrente, sem versões ocultas ou exceções especiais.

## Falhas

- **Rede, timeout, 429 e 5xx:** a mutação continua pendente e será tentada novamente.
- **Autenticação necessária:** HTTP 401, JWT/sessão ausente ou refresh token inválido interrompem o ciclo sem mudar payload, status ou contador da outbox. Depois de novo login, a mesma mutação volta à fila.
- **Rejeição definitiva:** payload inválido, referência inexistente ou HTTP 403 com sessão válida não é reenviado automaticamente. A interface informa que a ação precisa ser descartada ou refeita.

O push não corrompe o estado remoto em conexão instável: cada lote é transacional e cada mutação é idempotente. Uma confirmação perdida pode ser consultada novamente pelo mesmo identificador.

## Remoção e isolamento

Retirar um curso oficial remove somente a seleção daquela conta; a publicação compartilhada permanece intacta. Retirar um curso pessoal remove também sua árvore independente quando ela deixa de ter seleção. Nos dois casos, a FK elimina progresso, comentários e vínculos com trilhas daquele curso. Quando o próprio usuário confirma essa ação destrutiva, o dispositivo descarta seleção, cache, estado pessoal e pendências depois da confirmação remota. Se a retirada chegar de outro dispositivo ou de uma ação administrativa enquanto houver outbox não resolvida, o curso é ocultado, mas cache e trabalho local ficam preservados para reconciliação; sem pendências, tudo é removido em uma única transação local.

Quando uma publicação é arquivada administrativamente, o banco retira todas as seleções e emite os tombstones pessoais na mesma transação. O bootstrap ignora publicações retiradas e a exclusão física direta de uma árvore canônica é bloqueada, evitando estado órfão ou ressurreição por dispositivo antigo.

RLS protege todas as relações expostas. Usuários autenticados leem publicações oficiais, mas somente o próprio `auth.uid()` lê ou altera seleções, trilhas, progresso e comentários. Tabelas técnicas de sincronização são acessadas por RPCs autorizadas, não por consultas diretas do navegador.

## Publicação administrativa

A publicação administrativa segue `JSON v3 válido → normalização relacional → validação integral → publicação atômica`. Cursos grandes usam staging em fragmentos pequenos e idempotentes, mas só aparecem no catálogo depois da validação final. Essa operação não está disponível ao estudante. Fixtures permanecem fora do runtime e do APK.

A publicação usa UUIDs estáveis por `identityKey`. Uma nova importação do mesmo curso pode alterar conteúdo e `publication_seq` sem trocar a identidade das linhas preservadas. O processo administrativo usa service role somente no terminal ou ambiente seguro; essa chave nunca entra no frontend, APK ou GitHub Pages.

## Autoria administrativa futura

A autoria pessoal manual ou assistida da interface usa a cópia sob demanda e o protocolo granular descritos acima. A futura integração administrativa por GPT personalizado é outro sistema: ela não faz parte deste protocolo e será projetada por API estreita e servidor separado. Não há GPT Actions, Edge Function de autoria, OpenAPI ou tabelas de execução autoral administrativa neste corte.
