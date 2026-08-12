# Supabase: desenvolvimento e implantação

O projeto Supabase do AraLearn está em `supabase/`. Ele inclui configuração local, migrations, testes SQL e dados mínimos de desenvolvimento. A aplicação usa as APIs HTTP do Supabase na mesma aplicação JavaScript da web e do WebView Android; não há SDK Supabase Kotlin. O caminho de produção validado usa Supabase gerenciado. O ambiente Docker descrito aqui é descartável e não equivale a uma instalação auto-hospedada para produção.

Para instalar o sistema, siga primeiro o roteiro [Implantação](implantacao.md). Este documento descreve o banco, as funções e os procedimentos de diagnóstico que sustentam aquele roteiro.

## Pré-requisitos

- Node.js e npm;
- Supabase CLI para migrations, funções e testes do banco;
- Docker Desktop ou ambiente compatível com Docker para o stack local;
- Deno para validar as Edge Functions;
- Java 17 e Android SDK apenas para o APK.

É possível usar a CLI sem instalação global:

```powershell
npx.cmd --yes supabase@2.109.1 --version
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
npx.cmd --yes supabase@2.109.1 test db
```

`db reset` recria o banco local, aplica todas as migrations e executa `supabase/seed.sql`. Para interromper o ambiente:

```powershell
npx.cmd --yes supabase@2.109.1 stop --no-backup
```

## Configuração pública da aplicação

O servidor de desenvolvimento e os builds leem exatamente estas variáveis:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Exemplo PowerShell para o ambiente local padrão:

```powershell
$env:ARALEARN_SUPABASE_URL = "http://127.0.0.1:54321"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key exibida por supabase status>"
npm.cmd run dev
```

Durante `npm.cmd run dev`, o servidor gera a resposta de `/runtime-config.js` em memória a partir dessas variáveis; não é necessário nem correto preencher o arquivo fonte. Nos builds, a preparação gera `runtime-config.js` dentro do artefato. A configuração em `public/runtime-config.js` permanece vazia para impedir o commit acidental de configuração. Tanto o servidor quanto o build rejeitam chave administrativa. Fora de `localhost`, `127.0.0.1` e do endereço especial do emulador Android, a Project URL precisa usar HTTPS; a versão Android de produção exige configuração completa e HTTPS mesmo para um host local.

O mesmo staging gera a diretiva `connect-src` da CSP com a origem exata extraída de `ARALEARN_SUPABASE_URL`. Não existe `connect-src https:` nem wildcard de host local: um Supabase remoto permite apenas `https://<project-ref>.supabase.co`, e um stack local permite somente a origem e porta local efetivamente configuradas. Scripts continuam restritos a `'self'` e nenhuma chave administrativa entra na página.

## Auth

Habilite login por e-mail e senha. Em **Authentication → URL Configuration**, cadastre os destinos utilizados:

```text
http://localhost:<porta>/
https://<domínio-da-aplicação>/<caminho>/
aralearn://auth/callback
```

O esquema customizado mantém o fluxo funcional no APK sem domínio próprio. O aplicativo usa PKCE: o redirecionamento leva apenas um código de uso único, enquanto o verificador necessário à troca permanece no IndexedDB do dispositivo que iniciou o fluxo. Cada solicitação também cria um `auth_state` aleatório, de uso único e validade máxima de quinze minutos. O retorno só troca o código quando estado, verificador e prazo correspondem ao estado local; retornos implícitos com bearer no fragmento são recusados, e o Service Worker não grava navegações com parâmetros de autenticação no armazenamento de cache.

O esquema `aralearn://` não prova ao Android que o AraLearn é seu único proprietário. PKCE impede que um aplicativo que intercepte o link troque o código sem o verifier, e a verificação de state impede a associação com outra tentativa, mas o interceptor ainda pode causar negação de serviço. Antes da distribuição pública, substitua-o por Android App Link HTTPS verificado em domínio controlado. `buildAuthRedirectUrl` já aceita um callback HTTPS validado; a migração futura precisa atualizar em conjunto o redirect permitido no Supabase, a constante do runtime, o `intent-filter` com `android:autoVerify="true"` e o arquivo `assetlinks.json` do domínio.

O app implementa cadastro, confirmação, reenvio de confirmação, recuperação e troca de senha, login, renovação, sessão persistida, saída e exclusão da própria conta. O servidor de desenvolvimento resolve o arquivo pelo pathname e preserva a query `code`/`auth_state` na URL do navegador, permitindo que o runtime conclua o callback PKCE local. Sem sessão, somente a porta de autenticação é renderizada. Não existe catálogo anônimo.

No ambiente local, `enable_confirmations = true`. O Mailpit exposto em `http://127.0.0.1:54324` recebe as mensagens de confirmação e recuperação depois de `npx.cmd --yes supabase@2.109.1 start`. Não inicie o ambiente com esse serviço excluído. A CI cria uma conta pendente, abre o link no Mailpit, confirma o retorno PKCE com `auth_state`, recupera e troca a senha e autentica novamente com a nova senha.

## Vincular um projeto remoto

Crie o projeto pelo painel Supabase e guarde senhas e chaves administrativas somente em um gerenciador de segredos. Faça a simulação protegida do roteiro de implantação:

```powershell
npx.cmd --yes supabase@2.109.1 login
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co
```

O script vincula o projeto, mostra `migration list --linked` e executa `db push --linked --dry-run`. Revise a lista e confirme que o histórico local e o remoto estão coerentes. Não prossiga se houver migration desconhecida ou divergência. Depois aplique somente as migrations versionadas:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply
```

O terminal exige a confirmação `APLICAR` e recebe a senha do banco pelo prompt da Supabase CLI. O script não executa reset remoto, seed, `db pull` ou `migration repair`. Ao final, confira:

```powershell
npx.cmd --yes supabase@2.109.1 migration list --linked
npx.cmd --yes supabase@2.109.1 db lint --linked --level warning --fail-on warning
```

Se o PostgREST responder que não encontrou uma RPC no cache do schema, compare primeiro o histórico local e o remoto. Esse erro normalmente indica que o aplicativo e as migrations implantadas estão em revisões diferentes; não limpe o IndexedDB para tentar corrigi-lo. Faça o `dry-run`, aplique somente as migrations versionadas pendentes e repita o lint e o smoke hospedado. Uma RPC existente, porém chamada sem sessão, deve responder com erro de autenticação ou autorização, nunca com `PGRST202` ou “schema cache”.

Implante migrations e regras de acesso antes das Edge Functions e da aplicação. O site consulta um manifesto público de compatibilidade e deve recusar a publicação quando o banco hospedado ainda não oferece a revisão exigida. A geração do site e do APK é uma etapa separada do `db push`.

## Funções transacionais da aplicação

- `select_catalog_course`: registra a seleção de uma publicação oficial sem copiar sua árvore;
- `unselect_catalog_course`: retira a seleção do usuário sem alterar a publicação;
- `delete_own_account`: exige JWT e confirmação explícita, remove transacionalmente a conta autenticada e seus dados pessoais e não concede execução a `anon`;
- `apply_sync_batch`: conserva somente a associação leve de cursos oficiais à
  conta; estado de estudo e organização não passam por esse canal;
- `pull_sync_changes`: pagina somente mudanças pessoais e sinais compactos;
- `bootstrap_replica`: devolve seleções leves e `highWaterSequence` da mesma visão transacional;
- `list_catalog_collections`: retorna coleções e metadados publicados;
- `list_authoring_catalog_collections_v4` e `list_authoring_catalog_courses_v4`: são leitores internos do catálogo publicado, expostos pelo chat somente quando o principal possui `catalog:read`;
- `create_catalog_collection_v5`, `update_catalog_collection_v5` e
  `retire_catalog_collection_v5`: administram o ciclo de vida das coleções com
  capacidade editorial, idempotência e revisão;
- `move_catalog_course_v5`: transfere um curso entre coleções, sem ordem manual,
  por compare-and-swap;
- `list_trail_items_v1`: pagina a projeção canônica de grupos, planos, cursos em
  materialização e seleções, com identidade estável e progresso agregado;
- `mutate_trails_v1`: cria, renomeia e exclui grupos e transfere qualquer
  `trailItemId` entre eles, sem copiar conteúdo;
- `get_trail_workspace_course_v1`: pagina as partes correntes de um curso de
  workspace sob uma revisão fixa, para montagem e validação no cliente;
- `load_trail_personal_state_v1` e `mutate_trail_personal_state_v1`: leem e
  alteram o estado corrente de progresso, **Rever** e observações por
  `trailItemId`, com CAS e operações pequenas;
- `compact_sync_history`: simula ou executa a compactação administrativa abaixo do watermark seguro;
- `current_user_capabilities`: informa à interface as permissões da conta sem expor tabelas privadas;
- `create_authoring_workspace_v5`: cria o workspace composto, opcionalmente a partir de um curso ou de uma submissão assumida;
- `replay_authoring_workspace_request_v5`: recupera um resultado confirmado dentro da janela de idempotência;
- `commit_authoring_workspace_changes_v5`: aplica somente as partes criadas, atualizadas ou excluídas e valida o documento recomposto;
- `get_authoring_workspace_v5` e `list_authoring_workspaces_v5`: leem as partes correntes ou uma página de workspaces;
- `list_authoring_workspace_events_v5`: devolve resumos recentes, sem cópias antigas da árvore;
- `get_authoring_workspace_continuity_v1`: compõe a retomada compacta com
  Partes, decisões, mandato, achados ativos e sínteses, sem copiar cards;
- `update_authoring_workspace_continuity_v1`: altera por CAS o contexto estável
  ou o estado corrente de continuidade com operações fechadas e idempotentes;
- `manage_authoring_workspace_finding_v1`: registra, decide, vincula, verifica
  ou exclui achados compactos de auditoria;
- `list_authoring_workspace_observations_for_actor_v1`: pagina notas e achados
  visíveis ao ator, com filtros e cursor estável;
- `list_authoring_workspace_microsequence_cards_v5`: pagina metadados curtos
  dos cards filhos diretamente nas rows correntes, sem recompor o documento;
- `resume_or_reserve_authoring_workspace_v1`: localiza a composição ativa de
  um curso-fonte ou reserva atomicamente a identidade do novo workspace;
- `finalize_reserved_authoring_workspace_v1`: materializa a reserva depois de
  conferir novamente curso, revisão, ator e payload;
- `delete_authoring_workspace_v5`: exclui o workspace mutável por
  `expectedRevision`, sem remover cursos já publicados;
- `get_current_educational_workspace_v1`: projeta papel, capacidades, pessoas e
  convites permitidos do workspace corrente;
- `manage_current_educational_workspace_v1`: cria e atualiza espaços, aceita ou
  cancela convites, altera participação e transfere propriedade com recibo
  idempotente;
- `remove_course_from_personal_library_v5`: retira a seleção exata e, quando
  pertinente, arquiva seu artefato privado, sem apagar uma composição de
  workspace que ainda exista sob o mesmo `trailItemId`;
- `remove_catalog_course_v5`: retira uma publicação oficial, suas seleções e
  seu alias distribuído, mas preserva a composição vinculada, com CAS da
  classificação e do hash do curso;
- `submit_private_course_for_catalog_review_v5`: envia uma revisão privada específica para avaliação;
- `list_catalog_reviews_v5`, `get_catalog_review_artifact_v5`, `claim_catalog_review_v5`, `link_catalog_review_workspace_v5`, `decide_catalog_review_v5` e `withdraw_catalog_review_v5`: controlam a fila editorial;
- `register_authoring_artifact_v5`: pré-registra, somente para a Edge Function, o descritor coletável de uma publicação antes do upload;
- `publish_authoring_workspace_course_v5`: materializa uma revisão privada ou completa a publicação editorial;
- `reuse_unchanged_authoring_publication_v5`: confirma de forma transacional uma publicação já idêntica sem upload, nova revisão ou sincronização;
- `get_course_revision_artifact_v4`: autoriza a Edge Function a entregar uma revisão privada;
- `pull_course_revision_changes`: pagina sequência, curso e hash da revisão;
- `claim_unreferenced_artifacts_v4` e `complete_artifact_gc_v4`: executam a coleta segura com tombstones.

As funções de dados de usuário exigem JWT autenticado. Operações administrativas de publicação não são concedidas a `anon` nem a usuários comuns.

## Gateway de autoria e entrega de revisões

A função `aralearn-authoring-mcp` é a única superfície remota de autoria
estrutural extensa. Ela atende agentes por MCP exclusivamente com OAuth 2.1 do
Supabase Auth e aplica o núcleo de validação e autorização de workspaces
compostos. O mesmo gateway expõe autoria privada, submissão, revisão e
publicação conforme as capacidades da conta; não existe um gateway
administrativo separado. A função `aralearn-authoring-action` também oferece
ao aplicativo uma rota `app/` restrita. Ela valida o JWT da sessão comum,
resolve as capacidades no banco e reutiliza o mesmo registro, mapeamento e
executor das ferramentas; a lista fechada contém apenas as operações privadas
necessárias à edição contextual.
`aralearn-course-revisions` autentica o estudante, autoriza o curso pelo plano
de controle e entrega o objeto privado depois de conferir tamanho e SHA-256. A
chave administrativa permanece no ambiente protegido das Edge Functions; ela
nunca é devolvida ao cliente.

As duas funções aceitam somente origens CORS explícitas. A entrega de revisões
usa `ARALEARN_COURSE_REVISIONS_ALLOWED_ORIGINS` quando esse segredo está
definido e, caso contrário, reutiliza `ARALEARN_AUTHORING_ALLOWED_ORIGINS`.
O MCP usa `ARALEARN_AUTHORING_MCP_ALLOWED_ORIGINS` ou, quando ele não está
definido, a mesma lista comum.
Inclua a origem do site sem caminho, como `https://fabio-ara.github.io`, e nunca
use `*`. O preflight deve permitir `GET`, `apikey` e `Authorization`; sem isso,
o bootstrap recebe as trilhas, mas o navegador não consegue materializar seus
cursos. `deploySupabase.ps1` grava separadamente o segredo da entrega de
revisões e sempre une às origens adicionais o site, o servidor local e
`https://appassets.androidplatform.net`; `-AllowedOrigin` nunca substitui esse
conjunto obrigatório.

No projeto hospedado, o Supabase fornece as secret keys à função pelo objeto `SUPABASE_SECRET_KEYS`. Se houver mais de uma, `ARALEARN_SUPABASE_SECRET_KEY_NAME` escolhe o nome usado pelo AraLearn. Não copie uma secret key para `SUPABASE_SERVICE_ROLE_KEY`: essa variável fica restrita à chave efêmera emitida pela Supabase CLI no ambiente local descartável.

O fluxo completo e os papéis estão em [Autoria e
publicação](autoria-do-catalogo.md). A conexão OAuth e a autoria extensa estão
descritas em [Gateway MCP](autoria-mcp.md).

No manifesto público, `granular-sync` designa somente a sincronização
relacional incremental de progresso, trilhas, seleções e comentários. A
autoria remota pelo Chatbot ou Plugin, incluindo consulta de contratos de
resources e mutações focadas em workspaces compostos, é
`atomic-resource-authoring`. A assistência bottom-up local por API usa
`atomic-card-assistance` para reparar resources ou o card inteiro e escopos
hierárquicos próprios para operar em cards de uma microssequência ou, no máximo,
criar uma microssequência em uma lição. As capacidades coexistem e não são
alternativas intercambiáveis.

Implante banco e funções pelo roteiro protegido:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply `
  -DeployAuthoringFunctions `
  -AllowedOrigin "https://aplicacao.exemplo.org","http://localhost:4182","http://127.0.0.1:4182"
```

Na chamada de um script com `pwsh -File`, mantenha a lista de origens na mesma
linha e separada por vírgulas. A forma `@(...)` pode fazer o PowerShell
interpretar uma origem como outro parâmetro do script.

`verify_jwt` fica desabilitado nas duas funções porque cada uma faz a
verificação completa no próprio código. O gateway MCP aceita somente access
token OAuth válido para a URL do recurso. O Supabase não emite permissões de
aplicação como claims do token; o banco resolve a autoridade efetiva da conta
antes de qualquer comando.

As origens são limitadas por `ARALEARN_AUTHORING_ALLOWED_ORIGINS` e pelos
segredos específicos de cada função. Não use `*`. Informe em
`-AllowedOrigin` somente origens adicionais; o roteiro já conserva o site, o
servidor local e a origem estável do WebView Android.

`apply_sync_batch` recebe somente a associação leve entre curso oficial e
conta. Grupos, estado de estudo e observações usam suas RPCs contextuais próprias;
selecionar ou remover um curso também usa operações idempotentes dedicadas.
Conteúdo pedagógico nunca passa pelo sincronizador. Cada operação traz
`mutationId` e uma sequência causal do dispositivo. Repetir uma requisição
após timeout devolve o resultado anterior
sem duplicar a escrita. Para a mesma identidade, a última mutação válida aceita
pelo servidor passa a ser o estado corrente. Uma rejeição determinística
reverte somente aquela mutação, não deixa linha parcial e não impede as demais
mutações válidas do lote.

`list_catalog_collections` expõe somente metadados pesquisáveis de coleções e
cursos oficiais publicados. Coleções não concedem escrita a usuários comuns.
`list_trail_items_v1` deriva a visão autenticada de `trail_items`, workspaces e
seleções; grupos e posições pertencem à conta e não fazem parte do contrato
`aralearn.library.v1`.

O bootstrap hospedado retorna somente as seleções leves e o
`highWaterSequence`. Para uma revisão endereçada por
SHA-256, o runtime compara o hash com a réplica local, baixa o JSON imutável pelo
endpoint `aralearn-course-revisions`, valida contrato e hash e só então projeta
o conteúdo no IndexedDB. A ausência dessa revisão é erro; o cliente não recorre
a uma árvore remota para o mesmo hash.

Uma publicação que remova alvo de mutação local não resolvida fica adiada no
dispositivo, sem descarte silencioso da outbox. Arquivar ou marcar uma publicação
como removida apaga sua seleção. Se uma composição de workspace ainda existir,
`trailItemId`, grupo e estado pessoal permanecem e a projeção continua mostrando
o mesmo item; sua exclusão exige um comando autoral próprio.

`authoring_workspace_publications` admite uma única composição ativa por
`course_id` e destino. Ao criar um workspace com `sourceCourseId`, o gateway
reutiliza o vínculo ativo acessível em vez de materializar outro. A restrição
não usa título: workspaces independentes com o mesmo nome continuam válidos.

`list_trail_items_v1` continua paginado no servidor. O cliente percorre todas
as páginas, deduplica por `trailItemId`, rejeita cursor repetido e só substitui a
entrada única do cache depois de obter a projeção completa. Cache e fallback de
tela são sempre sem autoridade: todos os controles de escrita e as capacidades
editoriais ficam falsos até uma leitura autenticada completa.

As falhas retornadas ao runtime são retentáveis, `auth_required` ou rejeições definitivas. Rede, timeout, 429 e 5xx conservam `pending`; HTTP 401, JWT/refresh token inválido ou expirado e sessão ausente produzem `auth_required`, preservam integralmente a outbox e interrompem chamadas remotas até novo login. Erros determinísticos de payload, referência, autorização efetivamente revogada (403) ou reutilização incompatível de idempotência geram `rejected` e não são reenviados. O pull pode continuar após falha de push somente quando autenticação e conexão ainda são válidas.

## Retenção operacional da sincronização

Os padrões versionados são: dispositivo ativo por 90 dias,
`private.sync_changes` por no mínimo 30 dias e idempotência de mutações de
dispositivo por 90 dias. Não existe `sync_mutations` no corte enxuto. A
compactação usa o menor cursor de dispositivos ativos como watermark; nunca
remove uma parte não contígua do feed. Um dispositivo vencido precisa de
`bootstrap_replica` antes de voltar ao feed, mas sua outbox pessoal permanece
preservada para envio idempotente e o contador causal do dispositivo impede
reaplicação depois da compactação do ledger.

Um trigger por statement tenta a manutenção depois de inserções em
`private.sync_changes`. Um advisory try-lock global e
`sync_retention_policy.updated_at` permitem no máximo uma execução automática
por dia. Ela inativa dispositivos vencidos e compacta feed e ledger pela mesma
janela e pelo mesmo watermark da operação administrativa; a linha recém-inserida
fica dentro da retenção mínima e não pode ser removida.

Para diagnóstico ou intervenção, execute primeiro o dry-run por um canal
administrativo seguro com papel `service_role`; a RPC não é executável pelo
frontend nem por usuários autenticados comuns:

```sql
select public.compact_sync_history(true, now());
```

Somente depois de revisar `safeWatermark`, `compactedThroughSequence` e as
contagens de candidatos, execute:

```sql
select public.compact_sync_history(false, now());
```

`compact_sync_history` permanece disponível para dry-run e manutenção manual.
Ela é `SECURITY DEFINER`, fixa `search_path`, verifica `is_app_admin()`
internamente e tem `EXECUTE` concedido somente a `service_role`. O trigger e
sua função privada não são executáveis por clientes. As tabelas internas de
feed e idempotência também não possuem leitura direta para o cliente.

O workspace mutável ocupa linhas pequenas em
`private.authoring_workspace_entities`. Um ajuste pontual não cria um objeto no
Storage. O banco conserva também recibos idempotentes por 14 dias e até 200
resumos recentes por workspace; esses eventos não são revisões restauráveis.
Governança educacional acrescenta uma linha por membro, convites e recibos de
sete dias. A seleção de uma publicação privada aponta para o mesmo curso; não
cria artefato por pessoa. O orçamento medido está em
[Workspaces educacionais](workspaces-educacionais.md#persistência-e-custo).

Revisões publicadas ficam em bucket privado, endereçadas por SHA-256; uma
submissão editorial referencia exatamente um desses artefatos. Objetos
continuam protegidos enquanto houver referência de um curso ou de uma
submissão. O descritor é pré-registrado antes do upload: se o upload ou o CAS
falhar, o objeto ou a reserva continuam visíveis ao coletor em vez de formar um
arquivo sem registro. Para diagnosticar órfãos sem removê-los:

```sql
select public.list_unreferenced_artifacts_v4(interval '7 days', 100);
```

A RPC exige service role e apenas lista candidatos que continuam sem referência
no instante da consulta. O coletor oportunista reivindica esses hashes em lote,
move seus metadados para tombstones, apaga os objetos e confirma a exclusão. Se
o Storage ainda conservar o objeto, a referência é restaurada. Revisões de curso
e submissões referenciadas nunca entram no alvo; workspaces não possuem objetos
próprios. Uma reserva sem objeto é concluída quando o Storage responde `404`.

Não há quota local de cards ou bytes de staging por autor. O workspace aceita
até 10 mil partes, 1 MiB por parte e 32 MiB quando recomposto. Cada artefato de
publicação também é limitado a 32 MiB para manter upload, validação e releitura
dentro de um orçamento explícito no runtime Edge. Objetos maiores que 6 MiB
usam upload TUS retomável; tamanho declarado, `Content-Length` e bytes recebidos
são conferidos. Permanecem também os limites físicos e comerciais da
infraestrutura contratada.

### Orçamento operacional do plano Free

Os limites publicados para um projeto no plano Free, consultados em
30 de julho de 2026, formam o orçamento compartilhado de referência:

| Recurso | Limite publicado |
| --- | --- |
| banco de dados | 500 MB; acima desse tamanho o banco entra em modo somente leitura |
| Storage | 1 GB |
| egress | 5 GB por ciclo de faturamento |
| egress em cache | 5 GB por ciclo de faturamento |
| invocações de Edge Functions | 500 mil por ciclo de faturamento |
| memória por execução Edge | 256 MB |
| duração total por execução Edge no Free | 150 segundos |
| CPU por execução Edge | 2 segundos |

As cotas comerciais devem ser reconfirmadas nas páginas de
[faturamento](https://supabase.com/docs/guides/platform/billing-on-supabase) e
[preços](https://supabase.com/pricing); o comportamento ao atingir o limite do
banco está na documentação de
[tamanho do banco](https://supabase.com/docs/guides/platform/database-size), e
os limites do runtime estão em
[Edge Functions](https://supabase.com/docs/guides/functions/limits).

A composição relacional, o artefato publicado corrente, a retenção curta de
recibos e eventos e a coleta de objetos sem referência reduzem consumo, mas
não criam uma quota rígida por usuário. Todos os usuários competem pelo mesmo
orçamento do projeto. A operação precisa medir banco, Storage, egress e
invocações e definir alertas; ao se aproximar dos limites, a decisão correta é
ampliar a capacidade ou estabelecer uma política explícita de produto, não
contar com a economia estrutural como bloqueio automático.

## Publicação web e Android

Antes de publicar pelo workflow do GitHub Pages, crie duas **Actions Variables** no repositório em **Settings → Secrets and variables → Actions → Variables**:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

O workflow recusa o deploy se alguma delas estiver vazia. São valores públicos; não cadastre chave administrativa nesse local. A CI de validação inicia o Supabase em runner Linux, reaplica migration/seed e executa o pgTAP sem usar credenciais do projeto remoto. Uma atualização de `main` só inicia a publicação automática depois do sucesso dessa validação. O fluxo de Pages repete os testes do aplicativo, consulta o manifesto do projeto hospedado e só gera o site quando migrations e recursos necessários estão disponíveis. Uma execução manual de Pages não depende da validação anterior e deve ser usada somente depois de conferir o mesmo commit.

O job `supabase` também executa `npm run test:supabase:smoke` contra Auth,
PostgREST e RPCs reais. O smoke cria temporariamente usuários autenticados A e
B e comprova: negação para `anon`; efeito real de `auth.uid()`; seleção
compartilhada sem cópia da árvore; isolamento de seleções, progresso, escrita e
feed; bootstrap leve; regra de última mutação válida; remoção da seleção de A
sem afetar B; e autorização das funções `SECURITY DEFINER`. Um segundo ensaio
usa o Mailpit para testar cadastro, confirmação PKCE e recuperação de senha. A
service role usada para criar e remover os sujeitos de teste vem apenas de
`supabase status` no runner local e nunca entra no build.

PowerShell:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
npm.cmd run pages:build
npm.cmd run android:debug
```

Verifique o artefato antes de distribuí-lo:

```powershell
rg -n "service_role|SUPABASE_SERVICE_ROLE|postgres(?:ql)?://" .pages android/app/build/generated/web-assets
rg --files .pages android/app/build/generated/web-assets | rg "embedded-courses|seed-course|catalog.*json"
```

Os dois comandos devem ficar sem resultados de segredo ou catálogo operacional. O APK precisa de Internet para autenticação e sincronização, mas a árvore já sincronizada, o progresso pendente e os comentários permanecem disponíveis pelo IndexedDB quando a rede cai.

## Publicação inicial das fixtures oficiais

As três fixtures de curso em `supabase/fixtures/catalog/` nunca são lidas pelo app. Primeiro valide localmente o contrato, o round-trip, o hash canônico, todas as relações e o estado editorial. A validação exige `status: "ready"` em todas as microssequências antes de qualquer chamada ao banco:

```powershell
npm.cmd run catalog:validate
```

Depois de aplicar as migrations, o roteiro valida cada fixture, grava o documento
canônico no bucket de revisões e confirma sua referência. A publicação oficial
insere a revisão validada e troca o ponteiro do catálogo na mesma transação. Um
timeout pode repetir o mesmo `requestId`; nenhuma etapa rematerializa o curso e
nenhuma revisão parcial substitui a anterior. A chave administrativa continua
restrita ao processo de terminal e não pode entrar nas variáveis públicas do
build.

PowerShell:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$segredo = Read-Host "Cole a chave administrativa do projeto" -AsSecureString
$ponte = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredo)
try {
  $env:SUPABASE_SECRET_KEY = `
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponte)
  npm.cmd run catalog:publish
  if ($LASTEXITCODE -ne 0) { throw "A publicação do catálogo falhou." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponte)
  Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:ARALEARN_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Variable segredo, ponte -ErrorAction SilentlyContinue
}
```

Para publicar apenas uma fixture, substitua `npm.cmd run catalog:publish` dentro do mesmo bloco `try` pelo comando abaixo. Ele depende das variáveis temporárias criadas antes do `try` e deve ser executado antes do `finally` removê-las:

```powershell
node.exe .\scripts\publishCatalogFixtures.mjs --publish --course "fundamentos-ia-analise-dados-seed-course.json"
```

O script nunca imprime a chave. Uma repetição com o mesmo `contract_key` oficial ativo é rejeitada pela constraint do banco, evitando duplicação silenciosa. Para revisar antes de publicar, use `--import-draft` no lugar de `--publish`.

## Verificação

Primeiro valide o aplicativo:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run validate:example
npm.cmd run validate:cutover
npm.cmd run catalog:validate
npm.cmd run pages:build
npm.cmd run test:e2e
npm.cmd run android:debug
.\android\gradlew.bat -p .\android :app:lintDebug --no-daemon
npm.cmd run test:authoring-packages
```

Em seguida, recrie e valide o stack local:

```powershell
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
npx.cmd --yes supabase@2.109.1 stop --no-backup
```

O script executa as verificações Deno, o lint do banco, pgTAP, RLS,
PostgREST, Auth, e-mail, entrega de revisões e a jornada MCP autenticada. Para
o MCP, ele registra um cliente OAuth público descartável, passa por
Authorization Code com PKCE e consentimento e cria, lê e exclui um workspace
com o token destinado ao recurso; cliente e usuário temporários são removidos
mesmo se a jornada falhar. Ele descobre a URL e as chaves efêmeras do stack
iniciado por `supabase status`; a service role prepara o Auth, mas nunca é
usada como bearer do MCP. Não use segredos do projeto remoto nessa validação.
Se Docker, Supabase CLI ou Deno não estiverem disponíveis, rode a etapa em
outra máquina ou confira o job `supabase` da CI antes da implantação. Isso não
autoriza aplicar migrations diretamente em produção sem validar o banco
iniciado do zero e as interfaces HTTP reais.

O smoke do projeto hospedado, com duas contas temporárias e limpeza ao final, está descrito em [Implantação](implantacao.md#9-smoke-no-projeto-hospedado). Ele exige uma janela de manutenção e uma chave administrativa informada apenas pelo prompt protegido.
