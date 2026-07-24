# Persistência relacional e sincronização

O Supabase guarda o estado compartilhado. O IndexedDB mantém, em cada dispositivo, uma réplica para estudo sem conexão. O JSON v3 é usado para intercâmbio, validação e montagem em memória; não é a forma de armazenamento do aplicativo.

## O que fica no banco

O catálogo oficial usa tabelas relacionadas para cursos, módulos, lições, microssequências, dependências, cards, blocos e recursos visuais. Cada linha tem UUID, posição e vínculos reais com as demais linhas.

Fórmulas matemáticas e químicas também permanecem relacionais. `card_blocks` guarda a notação e a leitura acessível; `block_nodes` guarda cada termo e operação da árvore. Uma correção em um símbolo não exige armazenar novamente o curso nem guardar MathML em uma coluna JSON.

## Metadados pedagógicos

O plano de autoria usa identificadores estáveis para resultados, componentes,
operações, microssequências e cards. Esses identificadores são materializados
em relações próprias quando o curso é publicado:

| Tabela | Informação |
| --- | --- |
| `learning_components` | Conceito, operação, termo, resultado ou erro conceitual, identificado no protocolo |
| `learning_component_relations` | Relações `requires`, `part_of`, `contrasts`, `represents`, `applies` e `causes` |
| `learning_component_placements` | Introdução, prática, retomada, avaliação ou correção em uma microssequência ou card |
| `learning_component_topic_links` | Correspondência declarada entre um componente autoral e um tópico do contrato v3 |

Uma relação `A requires B` significa que o domínio de A exige B. Somente esse
tipo de relação precisa formar um grafo sem ciclos. As demais relações podem
ser recíprocas quando o conteúdo justificar.

A materialização ocorre antes da limpeza dos dados transitórios de autoria e
faz parte da mesma transação da publicação. Conceitos vêm do mapa conceitual;
resultados, do plano; termos, do registro de autoria; operações e posições, do
plano de cards. O servidor aceita apenas identificadores e valores definidos
pelo contrato de autoria. Ele não tenta interpretar frases livres nem
convertê-las por aproximação. Uma relação sem tipo formal é informada e não
entra silenciosamente no modelo.

Os identificadores pedagógicos não são tratados como identificadores de
`lesson_topics`. A ligação entre os dois modelos só existe quando o protocolo
informa os dois lados de modo explícito. Assim, um termo ou uma operação não
passa a representar um tópico apenas porque as chaves ou os rótulos parecem
semelhantes.

Essas tabelas guardam planejamento e evidência, não uma segunda cópia da
árvore didática. O texto e a estrutura dos cards continuam nas tabelas
canônicas do contrato v3.

O estado pessoal ocupa tabelas separadas:

| Finalidade | PostgreSQL | IndexedDB |
| --- | --- | --- |
| Cursos selecionados | `user_course_selections` | `courseSelections` |
| Trilhas | `study_paths`, `study_path_courses` | `studyPaths`, `studyPathCourses` |
| Progresso | `lesson_progress`, `card_progress` | `lessonProgress`, `cardProgress` |
| Comentários | `card_comments` | `comments` |
| Sincronização | tabelas privadas | fila de envio (`outbox`) e estado da sincronização |

O dispositivo abre um banco por UUID de conta. O endereço de e-mail não participa dessa identidade. Uma conta não pode acessar os dados locais de outra.

As consultas usadas por assistentes também respeitam essa separação. Uma integração pessoal recebe somente os cursos selecionados por sua conta, as próprias trilhas e uma página de módulos, lições, microssequências ou cards por vez. Criar, renomear ou excluir uma trilha e mover uma seleção usam comandos idempotentes vinculados ao UUID do proprietário. Excluir a trilha conserva os cursos e seu estado de estudo.

O catálogo possui outro plano de controle. Coleções e classificações guardam posição e revisão; alterações administrativas deixam recibos privados de idempotência. A árvore oficial pode ser percorrida em páginas por um cliente editorial autorizado. Título e objetivo são corrigidos como metadados. O conteúdo pode ser corrigido somente pelo protocolo restrito a uma microssequência, com hash de base, validação integral em memória e gravação transacional do recorte.

## Selecionar, editar e remover

`select_catalog_course` registra que a conta selecionou uma publicação. `get_selected_course_graph` entrega a árvore para o dispositivo. Nenhuma dessas operações duplica o curso no PostgreSQL.

`fork_catalog_course_for_editing` cria uma árvore pessoal somente quando alguém confirma a primeira alteração de conteúdo. A transação troca a seleção para a nova árvore e preserva a relação com trilhas, progresso e comentários. Mudanças posteriores são comparadas e gravadas apenas nas linhas afetadas.

Uma correção pontual substitui uma microssequência completa, nunca o documento do curso. Cards ausentes na nova forma recebem `deleted_at`, porque progresso e comentários ainda podem apontar para seus UUIDs. As consultas ativas, a reconstrução do documento e novas cópias ignoram essas linhas. Os blocos e demais filhos do card continuam sendo removidos fisicamente. Isso limita o custo do histórico à entidade que precisa conservar identidade referencial.

`unselect_catalog_course` retira um curso da biblioteca da conta. A publicação oficial continua intacta. Quando a seleção aponta para uma árvore pessoal sem outro vínculo, a árvore e seus dados relacionados são removidos.

## Início da réplica

`bootstrap_replica` devolve seleções, trilhas, progresso, comentários, metadados dos cursos e a posição atual do histórico de mudanças. O dispositivo grava esse conjunto em uma transação e baixa as árvores de conteúdo separadamente.

Uma árvore oficial é baixada de novo apenas quando a publicação mudou. Antes da troca, o dispositivo confere as relações e remonta o JSON v3. Material incompleto ou inválido não substitui o que já está disponível.

## Envio e recebimento

Cada alteração recebe um `mutationId`. A fila local conserva seleções, trilhas, progresso, comentários e alterações de cursos pessoais. Ela não guarda o curso inteiro nem envia a árvore oficial.

`apply_sync_batch` recebe essas alterações. O mesmo identificador pode ser reenviado depois de uma falha de rede sem criar uma segunda gravação. `pull_sync_changes` entrega as mudanças remotas em páginas; cada página é confirmada no dispositivo antes da seguinte.

A última alteração válida aceita pelo servidor passa a valer para a mesma informação pessoal. O horário usado nessa ordem é controlado pelo protocolo do servidor. A árvore oficial não pode ser alterada por esse caminho.

## Falhas esperadas

| Situação | Resultado |
| --- | --- |
| Sem rede, demora de resposta, 429 ou erro temporário do servidor | A alteração permanece na fila para nova tentativa. |
| Sessão ausente ou expirada | A fila é preservada e o aplicativo pede novo acesso. |
| Dado inválido, referência inexistente ou permissão revogada | A alteração é rejeitada e não volta à fila automaticamente. |

Uma falha ao enviar não impede o recebimento de mudanças remotas quando a sessão e a conexão continuam válidas.

## Atualização, retirada e limpeza

Quando um curso oficial muda, identidades preservadas mantêm progresso e comentários. Partes removidas deixam de usar os dados associados. Se houver uma alteração local ainda pendente para uma parte removida, a atualização é adiada até que essa alteração seja resolvida.

Ao retirar uma seleção em outro dispositivo, a réplica local deixa de mostrar o curso. Sem trabalho pendente, curso, progresso, comentários e referências de trilha são removidos juntos. Com trabalho pendente, o curso fica oculto e os dados locais são preservados até a resolução.

O histórico de sincronização é mantido enquanto houver dispositivos ativos que possam precisar dele. A limpeza usa o menor ponto já recebido por esses dispositivos e nunca elimina apenas parte de uma sequência. Dispositivos inativos fazem uma nova carga inicial quando voltam a ser usados.

## Acesso

As regras de acesso por linha protegem dados pessoais. Usuários autenticados podem ler cursos oficiais publicados; seleções, trilhas, progresso e comentários pertencem somente à própria conta. Tabelas internas de sincronização não ficam abertas ao navegador.

As funções de publicação, diagnóstico e limpeza administrativa exigem credenciais administrativas em ambiente seguro. Essas credenciais não são usadas pela aplicação web ou Android.
