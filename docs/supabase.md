# Supabase: desenvolvimento e implantação

O projeto Supabase do AraLearn está em `supabase/`. Ele inclui configuração local, migration, testes SQL e dados mínimos de desenvolvimento. A aplicação usa as APIs HTTP do Supabase no mesmo runtime JavaScript da web e do WebView Android; não há SDK Supabase Kotlin.

## Pré-requisitos

- Node.js e npm;
- Docker Desktop ou outro runtime Docker;
- Supabase CLI;
- Java 17 e Android SDK apenas para o APK.

É possível usar a CLI sem instalação global:

```bash
npx --yes supabase@2.109.1 --version
npx --yes supabase@2.109.1 start
npx --yes supabase@2.109.1 db reset
npx --yes supabase@2.109.1 test db
```

`db reset` recria o banco local, aplica todas as migrations e executa `supabase/seed.sql`. Para interromper o ambiente:

```bash
npx --yes supabase@2.109.1 stop
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
npm run dev
```

Durante `npm run dev`, o servidor gera a resposta de `/runtime-config.js` em memória a partir dessas variáveis; não é necessário nem correto preencher o arquivo fonte. Nos builds, o staging gera `runtime-config.js` dentro do artefato. A configuração em `public/runtime-config.js` permanece vazia para impedir o commit acidental de configuração. Tanto o servidor quanto o build rejeitam chave com papel `service_role`. Fora de `localhost`, `127.0.0.1` e do endereço especial do emulador Android, a Project URL precisa usar HTTPS; a release Android exige configuração completa e HTTPS mesmo para um host local.

O mesmo staging gera a diretiva `connect-src` da CSP com a origem exata extraída de `ARALEARN_SUPABASE_URL`. Não existe `connect-src https:` nem wildcard de host local: um Supabase remoto permite apenas `https://<project-ref>.supabase.co`, e um stack local permite somente a origem e porta local efetivamente configuradas. Scripts continuam restritos a `'self'` e nenhuma chave administrativa entra na página.

## Auth

Habilite login por e-mail e senha. Em **Authentication → URL Configuration**, cadastre os destinos utilizados:

```text
http://localhost:<porta>/
https://<domínio-da-aplicação>/<caminho>/
aralearn://auth/callback
```

O esquema customizado mantém o fluxo funcional no APK sem domínio próprio. O app usa PKCE: o redirect leva apenas um código curto e de uso único, enquanto o verifier necessário à troca permanece no IndexedDB do dispositivo que iniciou o fluxo. Cada solicitação também cria um `auth_state` aleatório, de uso único e validade máxima de quinze minutos. O callback só troca o código quando state, verifier e prazo correspondem ao estado local; callbacks implícitos com bearer no fragmento são recusados, e o Service Worker não grava navegações com query de autenticação no CacheStorage.

O esquema `aralearn://` não prova ao Android que o AraLearn é seu único proprietário. PKCE impede que um aplicativo que intercepte o link troque o código sem o verifier, e a verificação de state impede a associação com outra tentativa, mas o interceptor ainda pode causar negação de serviço. Antes da distribuição pública, substitua-o por Android App Link HTTPS verificado em domínio controlado. `buildAuthRedirectUrl` já aceita um callback HTTPS validado; a migração futura precisa atualizar em conjunto o redirect permitido no Supabase, a constante do runtime, o `intent-filter` com `android:autoVerify="true"` e o arquivo `assetlinks.json` do domínio.

O app implementa cadastro, confirmação, reenvio de confirmação, recuperação e troca de senha, login, renovação, sessão persistida e saída. Sem sessão, somente a porta de autenticação é renderizada. Não existe catálogo anônimo.

No ambiente local, `enable_confirmations = true`; as mensagens de confirmação e recuperação podem ser abertas na caixa SMTP local exposta em `http://127.0.0.1:54324` depois de `npx --yes supabase@2.109.1 start`.

## Vincular um projeto remoto

Crie o projeto pelo painel Supabase e guarde senhas e chaves administrativas somente em um gerenciador de segredos. Depois execute:

```bash
npx --yes supabase@2.109.1 login
npx --yes supabase@2.109.1 link --project-ref <project-ref>
npx --yes supabase@2.109.1 migration list --linked
npx --yes supabase@2.109.1 db push
npx --yes supabase@2.109.1 db lint --linked
```

Revise a saída de `migration list --linked` e confirme que o histórico local e o remoto estão coerentes antes de executar `db push`. A aplicação usa Auth, PostgREST e as funções SQL transacionais versionadas na migration.

Este corte implanta somente migrations, RLS, RPCs e os artefatos web/Android da aplicação. Não há Edge Function, especificação OpenAPI, GPT Action ou componente Planner, Part Builder ou Auditor a implantar neste escopo.

## Funções transacionais da aplicação

- `clone_catalog_course`: cria uma cópia pessoal completa com UUIDs novos;
- `refresh_personal_course_from_source`: atualiza somente cópia não personalizada;
- `delete_personal_course`: remove por tombstones uma cópia pertencente ao owner, de forma idempotente e condicionada à revisão-base;
- `apply_sync_batch`: aplica um lote ordenado, idempotente, causal e atômico com revisão otimista;
- `pull_sync_changes`: pagina o feed incremental e seus tombstones;
- `bootstrap_replica`: devolve o snapshot relacional autorizado e o `highWaterSequence` da mesma visão transacional;
- `replace_microsequence_cards`: troca o fragmento validado de uma microssequência usando `cards_revision`, separado da revisão de metadados;
- `validate_course_graph`: verifica integridade e completude da árvore;
- `publish_official_course`: publica atomicamente somente um curso completo e válido;
- `list_catalog_courses`: retorna apenas metadados publicados;
- `list_user_course_summaries`: retorna metadados e estado de atualização das cópias do usuário;
- `get_personal_course_graph`: disponibiliza uma árvore relacional autorizada para operações escopadas;
- `sync_storage_diagnostics`: informa watermark seguro, dispositivos e volume do histórico para administradores;
- `compact_sync_history`: simula ou executa a compactação administrativa abaixo do watermark seguro.

As funções de dados de usuário exigem JWT autenticado. Operações administrativas de publicação não são concedidas a `anon` nem a usuários comuns.

`apply_sync_batch` serializa as escritas autorais por curso, captura as revisões antes da primeira mutação e reconhece os efeitos causais das mutações anteriores do próprio lote. Conflito ou rejeição desfaz toda a transação: somente a bloqueadora recebe estado terminal, e as mutações irmãs permanecem repetíveis na outbox. `delete_personal_course` também falha fechado em revisão divergente e retorna a versão remota para resolução explícita; nunca exclui parcialmente uma árvore que mudou em outro dispositivo.

As falhas retornadas ao runtime são classificadas como retentáveis, `auth_required`, conflitos ou rejeições definitivas. Rede, timeout, 429 e 5xx conservam `pending`; HTTP 401, JWT/refresh token inválido ou expirado e sessão ausente produzem `auth_required`, preservam integralmente a outbox e interrompem chamadas remotas até novo login; revisão divergente, `40001` e 409 geram `conflict`; erros determinísticos de payload, estrutura, referência, autorização efetivamente revogada (403) ou idempotência incompatível geram `rejected` e não são reenviados. A interface exige correção ou descarte explícito da rejeição. O pull incremental pode continuar após falha de push somente quando a autenticação e a conexão ainda são válidas.

## Retenção operacional da sincronização

Os padrões versionados são: dispositivo ativo por 90 dias, `sync_changes` por no mínimo 30 dias, `sync_mutations` por 180 dias e envelopes de idempotência por 365 dias. A compactação usa o menor cursor de dispositivos ativos como watermark e nunca apaga tombstones relacionais apenas por idade. Um dispositivo vencido é marcado inativo e precisa de `bootstrap_replica` antes de voltar ao feed; trabalho local pendente bloqueia a substituição por snapshot e abre reconciliação.

Execute primeiro o diagnóstico e o dry-run com uma sessão de administrador da aplicação:

```sql
select public.sync_storage_diagnostics();
select public.compact_sync_history(true, now());
```

Somente depois de revisar o watermark e as contagens, execute:

```sql
select public.compact_sync_history(false, now());
```

Essas RPCs são `SECURITY DEFINER`, fixam `search_path` e verificam `is_app_admin()` internamente. Embora o PostgREST conheça suas assinaturas, `anon` e usuários autenticados comuns são recusados; as tabelas internas de feed e idempotência também não possuem leitura direta para o cliente.

## Publicação web e Android

Antes de publicar pelo workflow do GitHub Pages, crie duas **Actions Variables** no repositório em **Settings → Secrets and variables → Actions → Variables**:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

O workflow recusa o deploy se alguma delas estiver vazia. São valores públicos; não cadastre a service role nesse local. A CI de validação inicia o Supabase em runner Linux, reaplica migration/seed e executa o pgTAP sem usar credenciais do projeto remoto.

O job `supabase` também executa `npm run test:supabase:smoke` contra Auth, PostgREST e RPCs reais. O smoke cria temporariamente usuários autenticados A e B no stack local e comprova: negação para `anon`; efeito real de `auth.uid()`; isolamento de leitura, escrita e feed entre A e B; encapsulamento das tabelas internas; clone autorizado do catálogo; rejeição de clone/edição indevidos; e autorização das funções `SECURITY DEFINER`. O teardown tenta desativar os usuários; se a retenção referencial de uma versão local do GoTrue impedir essa limpeza, o stack efêmero é descartado por `supabase stop --no-backup` na CI e deve ser reiniciado com `db reset` no uso manual. A service role usada para criar esses sujeitos de teste vem apenas de `supabase status` no runner local e nunca entra no build.

PowerShell:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
npm run pages:build
npm run android:debug
```

Verifique o artefato antes de distribuí-lo:

```powershell
rg -n "service_role|SUPABASE_SERVICE_ROLE|postgres(?:ql)?://" .pages android/app/build/generated/web-assets
rg --files .pages android/app/build/generated/web-assets | rg "embedded-courses|seed-course|catalog.*json"
```

Os dois comandos devem ficar sem resultados de segredo ou catálogo operacional. O APK precisa de Internet para autenticação e sincronização, mas a árvore já sincronizada, o progresso pendente e os comentários permanecem disponíveis pelo IndexedDB quando a rede cai.

## Publicação inicial das fixtures oficiais

As três fixtures de curso em `supabase/fixtures/catalog/` nunca são lidas pelo app. Primeiro valide localmente o contrato, o round-trip, o hash canônico, todas as relações e o estado editorial. A validação exige `status: "ready"` em todas as microssequências antes de qualquer chamada ao banco:

```bash
npm run catalog:validate
```

Depois de aplicar a migration, um processo administrativo local pode importar e publicar cada curso em uma única transação por meio de `import_official_course`. A service role é aceita somente nesse processo de terminal; ela não pode ser reutilizada nas variáveis públicas de build.

PowerShell:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role mantida no gerenciador de segredos>"
npm run catalog:publish
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

Para publicar apenas uma fixture:

```powershell
node ./scripts/publishCatalogFixtures.mjs --publish --course "fundamentos-ia-analise-dados-seed-course.json"
```

O script nunca imprime a chave. Uma repetição com o mesmo `contract_key` oficial ativo é rejeitada pela constraint do banco, evitando duplicação silenciosa. Para revisar antes de publicar, use `--import-draft` no lugar de `--publish`.

## Verificação

Execute antes de implantar:

```powershell
npm test
npm run lint
npm run validate:example
npm run validate:cutover
npm run catalog:validate
npm run pages:build
npm run test:e2e
npm run android:debug
.\android\gradlew.bat -p .\android :app:lintDebug --no-daemon
npx --yes supabase@2.109.1 start
npx --yes supabase@2.109.1 db reset
npx --yes supabase@2.109.1 test db
npm run test:supabase:smoke
npx --yes supabase@2.109.1 stop --no-backup
```

`npm run test:supabase:smoke` descobre URL, anon key e service role do stack iniciado por `supabase status`; não use segredos do projeto remoto para esse teste. Se Docker ou Supabase CLI não estiverem disponíveis, `start`, `db reset`, pgTAP e smoke devem ser executados em outra máquina ou no job `supabase` da CI antes da implantação. Isso não autoriza aplicar a migration diretamente em produção sem validar o banco iniciado do zero e a interface HTTP real.
