# Persistência relacional e sincronização

O Supabase guarda o estado compartilhado. O IndexedDB mantém, em cada dispositivo, uma réplica para estudo sem conexão. O JSON v3 é usado para intercâmbio, validação e montagem em memória; não é a forma de armazenamento do aplicativo.

## O que fica no banco

O catálogo oficial usa tabelas relacionadas para cursos, módulos, lições, microssequências, dependências, cards, blocos e recursos visuais. Cada linha tem UUID, posição e vínculos reais com as demais linhas.

O estado pessoal ocupa tabelas separadas:

| Finalidade | PostgreSQL | IndexedDB |
| --- | --- | --- |
| Cursos selecionados | `user_course_selections` | `courseSelections` |
| Trilhas | `study_paths`, `study_path_courses` | `studyPaths`, `studyPathCourses` |
| Progresso | `lesson_progress`, `card_progress` | `lessonProgress`, `cardProgress` |
| Comentários | `card_comments` | `comments` |
| Sincronização | tabelas privadas | fila de envio (`outbox`) e estado da sincronização |

O dispositivo abre um banco por UUID de conta. O endereço de e-mail não participa dessa identidade. Uma conta não pode acessar os dados locais de outra.

## Selecionar, editar e remover

`select_catalog_course` registra que a conta selecionou uma publicação. `get_selected_course_graph` entrega a árvore para o dispositivo. Nenhuma dessas operações duplica o curso no PostgreSQL.

`fork_catalog_course_for_editing` cria uma árvore pessoal somente quando alguém confirma a primeira alteração de conteúdo. A transação troca a seleção para a nova árvore e preserva a relação com trilhas, progresso e comentários. Mudanças posteriores são comparadas e gravadas apenas nas linhas afetadas.

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
