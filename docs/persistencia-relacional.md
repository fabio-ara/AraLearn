# Persistência relacional e sincronização

O Supabase guarda o estado compartilhado. O IndexedDB mantém, em cada
dispositivo, uma projeção relacional para estudo sem conexão. Uma publicação
JSON v4 imutável no Storage é a fonte de verdade do curso disponível para
estudo; a autoria remota em andamento usa partes mutáveis no PostgreSQL.

## O que fica no banco

O PostgreSQL remoto guarda metadados de curso, seleção, trilhas, autorização,
progresso, revisão vigente e feed de sincronização. Também compõe o workspace
de autoria com uma linha corrente por projeto, curso, módulo, lição, tópico,
microssequência e card.

Quando o curso é publicado, essa árvore deixa de depender das linhas de autoria
para ser estudada: o servidor materializa um documento canônico no Storage. A
publicação não é decomposta numa segunda árvore de tabelas remotas.

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

Para artefatos publicados, o PostgreSQL conserva hashes, ponteiros e metadados;
texto e estrutura dos cards não recebem uma segunda cópia relacional. No
workspace, cada parte corrente existe uma vez e deixa de ser duplicada num
arquivo integral a cada alteração.

A consulta paginada de cards de uma microssequência usa diretamente o índice
de filhos de `authoring_workspace_entities`. Ela devolve somente identidade,
posição, `kind`, resource, título resumido e a revisão corrente. Não compõe o
documento, não baixa Storage e não duplica conteúdo. O card integral é lido
como entidade apenas quando uma operação pontual realmente precisa dele.

O estado pessoal ocupa tabelas separadas:

| Finalidade | PostgreSQL | IndexedDB |
| --- | --- | --- |
| Cursos selecionados | `user_course_selections` | `courseSelections` |
| Trilhas | `study_paths`, `study_path_courses` | `studyPaths`, `studyPathCourses` |
| Progresso | `lesson_progress`, `card_progress` | `lessonProgress`, `cardProgress` |
| Comentários | `card_comments` | `comments` |
| Sincronização | tabelas privadas | fila de envio (`outbox`) e estado da sincronização |

O painel não possui tabela nem snapshot. `list_trail_items_v1` projeta planos e
cursos correntes, com cursor composto, sem copiar conteúdo. O dispositivo
sobrescreve uma única entrada `learning.spaces.v1:<userId>` em `syncState` com
a projeção completa de Trilhas, depois de percorrer todas as páginas. Resultado
parcial e Coleções não são persistidos por essa superfície. O registro é uma
lembrança offline sem autoridade: os indicadores de edição, exclusão e retirada
ficam falsos até uma nova leitura autenticada completa.

Pessoas e governança ficam em `educational_workspace_members` e
`educational_workspace_invitations`. O papel é uma relação pequena; não cria
outra árvore. Convites guardam hash do código e expiram em sete dias. Recibos
idempotentes também expiram. Publicações privadas são disponibilizadas aos
membros por seleção e referência ao mesmo curso, sem cópia por participante.

O dispositivo abre um banco por UUID de conta no namespace físico
`aralearn-relational-v4-r2`. O endereço de e-mail não participa dessa identidade.
Esse namespace é uma geração limpa do contrato v4: cópias locais de gerações
encerradas não são abertas, migradas nem disputadas. Após autenticar, a seleção
e as revisões oficiais são reconstruídas pela sincronização remota.
Namespaces de contratos anteriores não são abertos nem migrados. Uma conta não
pode acessar os dados locais de outra.

Uma revisão baixada que não passe na validação do contrato v4 ou na conferência
do hash é isolada daquele curso e removida da projeção local. A biblioteca
continua abrindo os demais cursos; o leitor nunca reutiliza a revisão inválida.

As consultas usadas por assistentes também respeitam essa separação. Uma conta
autora comum lê seus planos e cursos em Trilhas. Uma conta revisora
lê somente o artefato submetido à fila que ela pode atender. Leituras grandes
são recortadas por árvore, entidade ou documento. Criar, renomear ou excluir
uma trilha e mover uma seleção continuam sendo comandos pessoais idempotentes
vinculados ao UUID do proprietário. Excluir a trilha conserva os cursos e seu
estado de estudo; as seleções passam a aparecer sem grupo até serem movidas.

O catálogo possui outro plano de controle. Coleções e classificações guardam
posição e revisão; alterações administrativas deixam recibos privados de
idempotência. O conteúdo integral é uma revisão JSON imutável no Storage.
Título e objetivo permanecem como metadados pequenos. Qualquer alteração de
conteúdo passa novamente pelo fluxo de autoria, validação e troca atômica do
ponteiro de revisão. O aplicativo pode expor a administração desses metadados a
contas editoriais, mas a semelhança visual com uma trilha pessoal não muda o
alcance global da operação.

A coleção `outros` é estrutural: o banco conserva seu nome, publicação e posição
final, recusa sua retirada e permite usá-la como destino ao retirar a última
coleção temática. Reordenações de coleção exigem sua revisão corrente e deixam
recibo idempotente curto.

## Selecionar, editar e remover

`select_catalog_course` é chamado somente pela ação explícita de adicionar um
curso oficial a Trilhas e registra que a conta selecionou a publicação. O
dispositivo recebe o `revision_hash` e baixa o documento pelo endpoint
`aralearn-course-revisions`. A rota que remontava a árvore remota foi removida.
O endpoint responde ao preflight da origem pública com `GET`, `apikey` e
`Authorization`; essa verificação faz parte do bloqueio de publicação do site.

Abrir um card de curso ou pressionar `play` não chama essa RPC nem qualquer
comando de organização. É uma navegação de leitura sobre a seleção já existente
ou sobre a prévia consultada em Coleções.

Os controles do aplicativo editam a projeção do curso selecionado numa área de
autoria local. A primeira mutação grava em `syncState` um marcador com
`basePublicationSeq` e `baseContentHash`; módulos, lições, microssequências,
cards, blocos e recursos alterados continuam nas tabelas locais. Essas linhas
não entram na outbox e não são tratadas como uma publicação.

A assistência contextual mantém, na mesma entrada auxiliar já limitada, até
doze caminhos de microssequência pendentes e no máximo uma troca de seleção em
andamento. Não guarda cards, curso, prompt ou resposta nessa fila. Com conexão,
o aplicativo reutiliza o motor composto, cria o workspace por `requestId`
determinístico, grava ou retira apenas as microssequências indicadas e atualiza
o curso corrente em Trilhas. A repetição após resposta perdida é idempotente; cada
mutação continua usando a revisão que acabou de ler.

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

Para publicar o resultado, o workspace informa sua revisão esperada. Ao
atualizar um curso, informa também o hash publicado que serviu de base. Se
qualquer um avançou, a publicação é recusada e nunca faz merge silencioso.

Quando a origem é `catalog`, a prévia recebe um novo curso privado e a seleção
oficial é retirada somente depois de a publicação ser confirmada. Um marcador
compacto permite retomar essa troca após falha de rede. Quando a origem é
`private`, o mesmo `courseId` é atualizado por hash. Nos dois casos, a réplica
validada substitui o `localDraft` e não conserva duas versões correntes.

`unselect_catalog_course` retira um curso da biblioteca da conta. A publicação
oficial e sua revisão corrente continuam intactas.

Pelo Chatbot ou Plugin, `remove_course_from_personal_library_v5` usa a seleção,
o curso e o hash que acabaram de ser lidos. Em um curso oficial, conserva a
mesma retirada de seleção. Em publicação privada da própria conta, também
arquiva a publicação e remove sua referência corrente; submissão editorial
ativa bloqueia essa limpeza, mas submissões encerradas não.

## Início da réplica

`bootstrap_replica` devolve seleções, trilhas, estado funcional de estudo, comentários,
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

`apply_sync_batch` recebe somente trilhas e sua organização. Cursor, conclusão
estrutural e a marca pessoal **Rever** usam
`apply_non_punitive_study_state_batch_v1`. Abertura, tempo, tentativa e resultado
não pertencem ao schema. Observações usam `apply_situated_comment_batch_v1`,
que aceita somente categoria, texto e referências pequenas; o endpoint genérico
rejeita os dois contratos. O transporte preserva a sequência da outbox ao
alternar entre eles. O mesmo identificador
pode ser reenviado depois de uma falha de rede sem criar uma segunda gravação.
`pull_sync_changes` entrega todas as mudanças pessoais em páginas; cada página
é confirmada no dispositivo antes da seguinte.

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

O feed separado de revisões de curso é ainda mais compacto: mantém somente a
linha de maior sequência para cada combinação de audiência e curso, inclusive
o tombstone de retirada. Uma nova publicação ou retirada sempre recebe uma
sequência maior, portanto `afterSequence` continua encontrando o estado atual
sem acumular sinais superados.

## Acesso

As regras de acesso por linha protegem dados pessoais. Usuários autenticados podem ler cursos oficiais publicados; seleções, trilhas, estado funcional e o texto mutável da própria observação pertencem à conta. Em workspace, funções contextuais permitem que papéis de revisão leiam categoria, texto e resposta necessários à triagem; estudantes continuam vendo somente os próprios registros. A tabela de observações não aceita acesso direto do navegador, e a página compartilhada não entra no cache leve do painel. Tabelas internas de sincronização também permanecem fechadas. Os limites de interpretação estão em [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md).

Autoria privada, submissão, revisão e publicação editorial são capacidades
calculadas para a conta autenticada. Funções de diagnóstico, limpeza e
implantação continuam exigindo credenciais administrativas em ambiente seguro;
essas credenciais não são usadas pela aplicação web ou Android.
