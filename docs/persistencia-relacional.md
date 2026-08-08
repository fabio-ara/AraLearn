# Persistência relacional e sincronização

O Supabase guarda o estado compartilhado. O IndexedDB mantém, em cada
dispositivo, uma projeção relacional para estudo sem conexão. Cursos oficiais
selecionados vêm de uma publicação JSON v4 imutável no Storage; planos e cursos
em materialização são compostos diretamente das partes correntes do workspace
no PostgreSQL.

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
| Identidade de Trilhas | `private.trail_items` | projeção em `syncState` |
| Grupos e vínculos | `study_paths`, `study_path_items` | projeção em `syncState` |
| Progresso, Rever e observações | `trail_personal_states` | cache por `trailItemId` em `syncState` |
| Sincronização de seleção oficial | tabelas privadas | fila leve de envio (`outbox`) |

A tela inicial não possui uma árvore remota paralela. `list_trail_items_v1` projeta planos e
cursos correntes, com cursor estável por UUID, sem copiar conteúdo. O dispositivo
sobrescreve uma única entrada `learning.spaces.v1:<userId>` em `syncState` com
a projeção completa de Trilhas, depois de percorrer todas as páginas. Resultado
parcial e Coleções não são persistidos por essa superfície. O registro é uma
lembrança offline sem autoridade: os indicadores de edição, exclusão e retirada
ficam falsos até uma nova leitura autenticada completa.

O dispositivo não pode descobrir uma revogação enquanto está desconectado. Na
primeira leitura autenticada posterior, compara a projeção anterior com a nova e
remove composição e estado pessoal de todo item cuja última autoridade acabou;
uma nova sessão executa a mesma reconciliação antes de reutilizar caches.

Pessoas e governança ficam em `educational_workspace_members` e
`educational_workspace_invitations`. O papel é uma relação pequena; não cria
outra árvore. Convites guardam hash do código e expiram em sete dias. Recibos
idempotentes também expiram. O workspace aparece em Trilhas por sua identidade
estável, sem publicação nem cópia por participante. Um artefato privado só é
fixado quando necessário para uma submissão editorial.

O dispositivo abre um banco por UUID de conta no namespace físico
`aralearn-relational-v4-r3`. O endereço de e-mail não participa dessa identidade.
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
um grupo e classificar qualquer `trailItemId` continuam sendo comandos pessoais
idempotentes vinculados ao UUID do proprietário. Excluir o grupo conserva os
cursos e seu estado de estudo; os itens passam a aparecer sem grupo até serem
movidos.

O catálogo possui outro plano de controle. Coleções e classificações guardam
identidade e revisão; alterações administrativas deixam recibos privados de
idempotência. O conteúdo integral é uma revisão JSON imutável no Storage.
Título e objetivo permanecem como metadados pequenos. Qualquer alteração de
conteúdo passa novamente pelo fluxo de autoria, validação e troca atômica do
ponteiro de revisão. O aplicativo pode expor a administração desses metadados a
contas editoriais, mas a semelhança visual com uma trilha pessoal não muda o
alcance global da operação.

A coleção `outros` é estrutural: o banco conserva seu nome e publicação, recusa
sua retirada e permite usá-la como destino ao retirar a última coleção
temática. Coleções e cursos são apresentados alfabeticamente; transferências
entre coleções exigem a revisão corrente e deixam recibo idempotente curto.

## Selecionar, editar e remover

`select_catalog_course` é chamado somente pela ação explícita de adicionar um
curso oficial a Trilhas e registra que a conta selecionou a publicação. O
dispositivo recebe o `revision_hash` e baixa o documento pelo endpoint
`aralearn-course-revisions`. A rota que remontava a árvore remota foi removida.
O endpoint responde ao preflight da origem pública com `GET`, `apikey` e
`Authorization`; essa verificação faz parte do bloqueio de publicação do site.

Abrir um card de curso ou pressionar `play` não chama essa RPC nem qualquer
comando de organização. É uma navegação de leitura sobre a seleção já existente
ou sobre o curso consultado em Coleções.

Os controles de autoria alteram somente as linhas correspondentes ao escopo
selecionado. Resources e card inteiro são o limite no card; uma
microssequência pode receber cards quando seu recipiente foi autorizado; uma
lição pode receber no máximo uma nova microssequência quando todos os filhos
foram selecionados. Não há escrita bottom-up em módulo ou curso.

Cada gravação consulta a revisão carregada e a confere novamente dentro da
transação IndexedDB. O commit das linhas e o avanço da revisão são indivisíveis.
Se outra aba gravou antes, a operação obsoleta falha e recarrega o conteúdo
corrente; não há sobrescrita por último escritor. Pedido, contexto e resposta
do provider não entram nas tabelas do curso.

Somente a última alteração concluída conserva uma inversa compacta do fragmento
necessário a **Desfazer**. Uma nova escrita substitui essa inversa; o aplicativo
não cria snapshots integrais nem histórico de respostas.

Curso privado próprio mantém seu `courseId`. Curso oficial é somente leitura
para conta comum; uma conta administrativa ou editorial altera a continuidade
oficial. Curso privado de outra pessoa não é editável neste recorte. A origem
desconhecida falha fechada, e nenhuma dessas operações cria fork automático.

Para publicar um workspace, o comando informa sua revisão esperada. Ao
atualizar um curso, informa também o hash publicado que serviu de base. Se
qualquer um avançou, a publicação é recusada e nunca faz merge silencioso. A
promoção de curso privado ao catálogo continua exclusiva da autoria com MCP.

`unselect_catalog_course` retira um curso da biblioteca da conta. A publicação
oficial e sua revisão corrente continuam intactas.

Pelo Chatbot ou Plugin, `remove_course_from_personal_library_v5` usa a seleção,
o curso e o hash que acabaram de ser lidos. Em um curso oficial, conserva a
mesma retirada de seleção. Em publicação privada da própria conta, também
arquiva o artefato e remove sua referência corrente; submissão editorial ativa
bloqueia essa limpeza. Uma composição de workspace ainda existente preserva o
mesmo `trailItemId`, o grupo e o estado pessoal.

## Início da réplica

`bootstrap_replica` devolve seleções leves e o ponto atual do histórico de
mudanças. Grupos e estado pessoal usam as RPCs de Trilhas e são gravados por
`trailItemId`; revisões oficiais ausentes são baixadas separadamente.

Uma revisão é baixada apenas quando o hash mudou. Antes da troca, o dispositivo
confere o contrato v4 e o SHA-256, projeta o documento em linhas locais e
substitui a cópia do curso na mesma transação do IndexedDB. Material incompleto
ou inválido não substitui o que já está disponível.

## Envio e recebimento

Cada alteração recebe um identificador idempotente, mas os fluxos permanecem
separados pelo que realmente sincronizam:

- a outbox relacional e `apply_sync_batch` transportam somente a seleção leve
  de cursos oficiais;
- criar, renomear e excluir grupos ou mover um item entre grupos usa uma RPC transacional de
  Trilhas e um `requestId`, sem projeção otimista concorrente;
- cursor, conclusão, **Rever** e o texto autoral da observação usam operações
  pontuais sobre a única linha corrente de `trail_personal_states`.

O cache do estado pessoal conserva apenas a revisão atual e uma fila compacta
de `set|delete` por chave estável. `mutate_trail_personal_state_v1` recebe no máximo
512 operações ou 64 KiB por lote, aplica compare-and-swap e devolve somente
revisão e data. O documento inteiro não volta no recibo nem é enviado a cada
mudança. Uma resposta perdida pode repetir o mesmo `mutationId`; conflito faz o
cliente reler a linha corrente e reaplicar somente os patches ainda pendentes.
O progresso v3 usa o `id` estável da lição como chave e guarda apenas
`cursorCardId` e o conjunto `completedCardIds`; não cria uma entrada com
timestamp para cada card. O
orçamento canônico do cliente é 256 KiB, inclusive nos cursos grandes do
catálogo.

O feed de `pull_sync_changes` continua pequeno porque comunica seleções, não
grupos nem o estado funcional. Abertura, tempo, tentativa e resultado não
pertencem a nenhum desses contratos. A revisão do curso também não pode ser
alterada por esse caminho.

## Falhas esperadas

| Situação | Resultado |
| --- | --- |
| Sem rede, demora de resposta, 429 ou erro temporário do servidor | Seleção e estado pessoal permanecem nas filas próprias; organização remota não é simulada localmente. |
| Sessão ausente ou expirada | O aplicativo preserva a pendência local e pede novo acesso. |
| Dado inválido ou referência inexistente | A operação é recusada sem escrita parcial. |
| Permissão revogada | Na próxima sincronização online, composição, estado e cache de autoridade são apagados; a operação falha fechada. |
| A revisão do conteúdo mudou durante a escrita | A operação obsoleta é recusada e a tela recarrega o estado corrente. |
| A seleção avançou durante o download da revisão | A revisão capturada não é instalada; a operação pode ser repetida com o novo hash. |

Uma falha em um canal não autoriza gravação por outro nem altera o conteúdo
do curso.

## Atualização, retirada e limpeza

Quando uma publicação oficial muda ou uma composição é promovida, o
`trailItemId` preservado mantém grupo, progresso, **Rever** e observações. O
dispositivo valida uma revisão oficial antes de trocar sua projeção e conserva
a anterior se o download ou a validação falhar. Partes que deixaram a árvore
não reaparecem na navegação.

Retirar a seleção de um curso oficial o oculta de Trilhas sem apagar a
publicação global. Se a mesma identidade também possui workspace acessível, o
item continua visível pela composição. Excluir de fato a última fonte de um
item remove por cascata seus vínculos de grupo e estado pessoal; itens e cursos
homônimos independentes não são atingidos.

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
