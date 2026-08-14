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
2. **estado pessoal**, como seleção, grupo, cursor, conclusão, marca **Rever** e
   observação;
3. **controle operacional**, como revisão, cursor de sincronização, recibo de
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
| controle local | `outbox`, `syncState` | operações pendentes, curso instalado, curso adiado e curso de workspace |

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
- metadados e hash da revisão publicada;
- feeds, cursores e recibos necessários à repetição segura.

O PostgreSQL não conserva uma segunda decomposição de cada publicação oficial.
O artefato integral fica no Storage. Essa decisão evita pagar simultaneamente
pelo documento no Storage e por toda a mesma árvore em tabelas remotas.

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
5. revisões de cursos são baixadas como artefatos por hash.

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
`trail-personal-state-repository.test.js` protege essas fronteiras.

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
falhas de rede simuladas, isolamento de conta, retenção e Auth/PostgREST no
stack local. Esses testes não demonstram disponibilidade prolongada, perda
física do dispositivo, comportamento de todos os navegadores sob pressão de
armazenamento ou custo real em escala. A [Matriz de conformidade
técnica](matriz-conformidade-tecnica.md) explicita esse limite.
