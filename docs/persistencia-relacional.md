# Persistência relacional e sincronização

O Supabase guarda o estado compartilhado. O IndexedDB mantém, em cada dispositivo,
uma projeção relacional para estudo sem conexão. O JSON v4 imutável no Storage é
a fonte de verdade do conteúdo remoto; a projeção local existe para consulta e
interação eficientes.

## O que fica no banco

O PostgreSQL remoto guarda metadados de curso, seleção, trilhas, autorização,
progresso, revisão vigente e feed de sincronização. Módulos, lições,
microssequências, cards, blocos e recursos de uma nova revisão não são
materializados linha por linha no servidor.

Depois do download e da validação, o IndexedDB projeta fórmulas, blocos, nós,
opções e demais estruturas em tabelas locais. Isso preserva o runtime relacional
e o funcionamento offline sem transferir o custo de autoria para o banco remoto.

## Metadados pedagógicos

O contrato v4 usa `guide` no módulo e na lição para delimitar objetivo,
inclusões, exclusões, notação e cuidados. Cada tópico da lição declara `id`,
`label`, `kind`, `checks` e `errors`. Cada microssequência declara `goal`,
`role`, `status`, `dependsOn`, `covers`, `checks` e, quando necessário,
`errors`.

`dependsOn` referencia somente microssequências da mesma lição, por identidade
explícita, e precisa formar um grafo acíclico. `covers` e `checks` descrevem a
cobertura e as evidências esperadas; não criam relações implícitas. Cards e
recursos também conservam ids estáveis no documento.

A aplicação aceita apenas campos, identificadores e referências definidos pelo
contrato. Ela não aproxima rótulos, não converte frases livres em relações e
não mantém um plano pedagógico paralelo ao documento v4.

O PostgreSQL conserva apenas hashes e ponteiros desses artefatos. Texto,
planejamento, evidência e estrutura dos cards não recebem uma segunda cópia no
banco.

O estado pessoal ocupa tabelas separadas:

| Finalidade | PostgreSQL | IndexedDB |
| --- | --- | --- |
| Cursos selecionados | `user_course_selections` | `courseSelections` |
| Trilhas | `study_paths`, `study_path_courses` | `studyPaths`, `studyPathCourses` |
| Progresso | `lesson_progress`, `card_progress` | `lessonProgress`, `cardProgress` |
| Comentários | `card_comments` | `comments` |
| Sincronização | tabelas privadas | fila de envio (`outbox`) e estado da sincronização |

O dispositivo abre um banco por UUID de conta no namespace físico
`aralearn-relational-v4-r2`. O endereço de e-mail não participa dessa identidade.
Esse namespace é uma geração limpa do contrato v4: cópias locais de gerações
encerradas não são abertas, migradas nem disputadas. Após autenticar, a seleção
e as revisões oficiais são reconstruídas pela sincronização remota.
Namespaces de contratos anteriores não são abertos nem migrados. Uma conta não
pode acessar os dados locais de outra.

As consultas usadas por assistentes também respeitam essa separação. Uma integração pessoal recebe somente os cursos selecionados por sua conta, as próprias trilhas e uma página de módulos, lições, microssequências ou cards por vez. Criar, renomear ou excluir uma trilha e mover uma seleção usam comandos idempotentes vinculados ao UUID do proprietário. Excluir a trilha conserva os cursos e seu estado de estudo.

O catálogo possui outro plano de controle. Coleções e classificações guardam
posição e revisão; alterações administrativas deixam recibos privados de
idempotência. O conteúdo integral é uma revisão JSON imutável no Storage.
Título e objetivo permanecem como metadados pequenos. Qualquer alteração de
conteúdo passa novamente pelo fluxo de autoria, validação e troca atômica do
ponteiro de revisão.

## Selecionar, editar e remover

`select_catalog_course` registra que a conta selecionou uma publicação. O
dispositivo recebe o `revision_hash` e baixa o documento pelo endpoint
`aralearn-course-revisions`. A rota que remontava a árvore remota foi removida.
O endpoint responde ao preflight da origem pública com `GET`, `apikey` e
`Authorization`; essa verificação faz parte do bloqueio de publicação do site.

Os controles do aplicativo editam a projeção do curso selecionado numa área de
autoria local. A primeira mutação grava em `syncState` um marcador com
`basePublicationSeq` e `baseContentHash`; módulos, lições, microssequências,
cards, blocos e recursos alterados continuam nas tabelas locais. Essas linhas
não entram na outbox e não são tratadas como uma publicação.

Cada gravação de conteúdo consulta a revisão de `authoring.localDraft` que o
repositório carregou e a confere novamente dentro da transação IndexedDB. O
commit das linhas e a troca por uma nova revisão do marcador são indivisíveis.
Se outra aba gravou antes, a operação obsoleta falha e recarrega o conteúdo já
confirmado; não há sobrescrita por último escritor.

Todos os `localDrafts` ativos de cursos selecionados ficam disponíveis para
restauração explícita, mesmo quando a seleção ainda aponta para a mesma revisão
oficial. O estado informa separadamente `remoteUpdateAvailable`, comparando
`publicationSeq` e `contentHash` autoritativos com a base do rascunho e a
réplica instalada.

A restauração não reutiliza um grafo em cache: consulta a seleção atual, baixa
seu artefato imutável, valida o contrato e confere o SHA-256. A transação que
instala o grafo compara tanto a revisão do `localDraft` quanto o identificador,
a sequência, o hash e a origem da seleção consultada. Se outra aba editar o
rascunho ou avançar a seleção durante o download, nada é sobrescrito e a
operação deve ser repetida com o estado novo. Uma retirada remota também não
apaga automaticamente um rascunho ativo; a poda fica bloqueada até uma decisão
explícita.

Para publicar o resultado, um workspace de autoria usa
`base_revision_hash`. A publicação é recusada se a revisão vigente mudou e
nunca faz merge silencioso.

`unselect_catalog_course` retira um curso da biblioteca da conta. A publicação
oficial e suas revisões continuam intactas.

## Início da réplica

`bootstrap_replica` devolve seleções, trilhas, progresso, comentários,
metadados dos cursos, hashes de revisão e a posição atual do histórico de
mudanças. O dispositivo grava o estado pessoal em uma transação e baixa as
revisões ausentes separadamente.

Uma revisão é baixada apenas quando o hash mudou. Antes da troca, o dispositivo
confere o contrato v4 e o SHA-256, projeta o documento em linhas locais e
substitui a cópia do curso na mesma transação do IndexedDB. Material incompleto
ou inválido não substitui o que já está disponível.

## Envio e recebimento

Cada alteração recebe um `mutationId`. A outbox conserva trilhas, associações
de trilha, progresso e comentários. Selecionar ou retirar curso usa sua própria
intenção idempotente persistida. Nenhum desses mecanismos guarda ou envia o
documento integral.

`apply_sync_batch` recebe essas alterações. O mesmo identificador pode ser reenviado depois de uma falha de rede sem criar uma segunda gravação. `pull_sync_changes` entrega as mudanças remotas em páginas; cada página é confirmada no dispositivo antes da seguinte.

A última alteração válida aceita pelo servidor passa a valer para a mesma
informação pessoal. O horário usado nessa ordem é controlado pelo protocolo do
servidor. A revisão do curso não pode ser alterada por esse caminho.

## Falhas esperadas

| Situação | Resultado |
| --- | --- |
| Sem rede, demora de resposta, 429 ou erro temporário do servidor | A alteração permanece na fila para nova tentativa. |
| Sessão ausente ou expirada | A fila é preservada e o aplicativo pede novo acesso. |
| Dado inválido, referência inexistente ou permissão revogada | A alteração é rejeitada e não volta à fila automaticamente. |
| `localDraft` mudou durante uma restauração | O rascunho mais recente é preservado e a tela recarrega seu estado. |
| A seleção avançou durante o download da revisão | A revisão capturada não é instalada; a operação pode ser repetida com o novo hash. |

Uma falha ao enviar não impede o recebimento de mudanças remotas quando a sessão e a conexão continuam válidas.

## Atualização, retirada e limpeza

Quando um curso oficial muda, identidades preservadas mantêm progresso e comentários. Partes removidas deixam de usar os dados associados. Se houver uma área de autoria local alterada, a substituição da projeção inteira é adiada antes de apagar qualquer linha. O resultado da sincronização identifica esse curso como atualização de catálogo adiada.

Ao retirar uma seleção em outro dispositivo, a réplica local deixa de mostrar o curso. Sem trabalho pendente, curso, progresso, comentários e referências de trilha são removidos juntos. Com trabalho pendente, o curso fica oculto e os dados locais são preservados até a resolução.

O histórico de sincronização é mantido enquanto houver dispositivos ativos que possam precisar dele. A limpeza usa o menor ponto já recebido por esses dispositivos e nunca elimina apenas parte de uma sequência. Dispositivos inativos fazem uma nova carga inicial quando voltam a ser usados.

## Acesso

As regras de acesso por linha protegem dados pessoais. Usuários autenticados podem ler cursos oficiais publicados; seleções, trilhas, progresso e comentários pertencem somente à própria conta. Tabelas internas de sincronização não ficam abertas ao navegador.

As funções de publicação, diagnóstico e limpeza administrativa exigem credenciais administrativas em ambiente seguro. Essas credenciais não são usadas pela aplicação web ou Android.
