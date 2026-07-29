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

O plano de autoria usa identificadores estáveis para resultados, componentes,
operações, microssequências e cards. Eles permanecem na revisão JSON e são
validados antes de o hash receber estado `validated`.

Uma relação `A requires B` significa que o domínio de A exige B. Somente esse
tipo de relação precisa formar um grafo sem ciclos. As demais relações podem
ser recíprocas quando o conteúdo justificar.

Conceitos vêm do mapa conceitual; resultados, do plano; termos, do registro de
autoria; operações e posições, do plano de cards. A aplicação aceita apenas
identificadores e valores definidos pelo contrato. Ela não tenta interpretar
frases livres nem converter relações por aproximação.

Os identificadores pedagógicos não são tratados como identificadores de
`lesson_topics`. A ligação entre os dois modelos só existe quando o protocolo
informa os dois lados de modo explícito. Assim, um termo ou uma operação não
passa a representar um tópico apenas porque as chaves ou os rótulos parecem
semelhantes.

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
`aralearn-relational-v4`. O endereço de e-mail não participa dessa identidade.
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

Para publicar o resultado, uma nova execução de autoria usa
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

Cada alteração recebe um `mutationId`. A fila local conserva seleções, trilhas,
progresso e comentários. Ela não guarda nem envia o documento integral.

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

Uma falha ao enviar não impede o recebimento de mudanças remotas quando a sessão e a conexão continuam válidas.

## Atualização, retirada e limpeza

Quando um curso oficial muda, identidades preservadas mantêm progresso e comentários. Partes removidas deixam de usar os dados associados. Se houver uma área de autoria local alterada, a substituição da projeção inteira é adiada antes de apagar qualquer linha. O resultado da sincronização identifica esse curso como atualização de catálogo adiada.

Ao retirar uma seleção em outro dispositivo, a réplica local deixa de mostrar o curso. Sem trabalho pendente, curso, progresso, comentários e referências de trilha são removidos juntos. Com trabalho pendente, o curso fica oculto e os dados locais são preservados até a resolução.

O histórico de sincronização é mantido enquanto houver dispositivos ativos que possam precisar dele. A limpeza usa o menor ponto já recebido por esses dispositivos e nunca elimina apenas parte de uma sequência. Dispositivos inativos fazem uma nova carga inicial quando voltam a ser usados.

## Acesso

As regras de acesso por linha protegem dados pessoais. Usuários autenticados podem ler cursos oficiais publicados; seleções, trilhas, progresso e comentários pertencem somente à própria conta. Tabelas internas de sincronização não ficam abertas ao navegador.

As funções de publicação, diagnóstico e limpeza administrativa exigem credenciais administrativas em ambiente seguro. Essas credenciais não são usadas pela aplicação web ou Android.
