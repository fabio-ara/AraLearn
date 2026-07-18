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

## Auth

Habilite login por e-mail e senha. Em **Authentication → URL Configuration**, cadastre os destinos utilizados:

```text
http://localhost:<porta>/
https://<domínio-da-aplicação>/<caminho>/
aralearn://auth/callback
```

O esquema customizado mantém o fluxo funcional no APK sem domínio próprio. O app usa PKCE: o redirect leva apenas um código curto e de uso único, enquanto o verifier necessário à troca permanece no IndexedDB do dispositivo que iniciou o fluxo. Callbacks implícitos com bearer no fragmento são recusados, e o Service Worker não grava navegações com query de autenticação no CacheStorage. Para produção pública, ainda é preferível um Android App Link HTTPS verificado em domínio controlado, eliminando a possibilidade de outro aplicativo interromper o callback; então atualize conjuntamente o redirect do Supabase, `buildAuthRedirectUrl` e o `intent-filter` Android.

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
- `replace_microsequence_cards`: troca o fragmento validado de uma microssequência usando `cards_revision`, separado da revisão de metadados;
- `validate_course_graph`: verifica integridade e completude da árvore;
- `publish_official_course`: publica atomicamente somente um curso completo e válido;
- `list_catalog_courses`: retorna apenas metadados publicados;
- `list_user_course_summaries`: retorna metadados e estado de atualização das cópias do usuário;
- `get_personal_course_graph`: disponibiliza a árvore relacional autorizada para a primeira réplica.

As funções de dados de usuário exigem JWT autenticado. Operações administrativas de publicação não são concedidas a `anon` nem a usuários comuns.

`apply_sync_batch` serializa as escritas autorais por curso, captura as revisões antes da primeira mutação e reconhece os efeitos causais das mutações anteriores do próprio lote. Conflito ou rejeição desfaz toda a transação: somente a bloqueadora recebe estado terminal, e as mutações irmãs permanecem repetíveis na outbox. `delete_personal_course` também falha fechado em revisão divergente e retorna a versão remota para resolução explícita; nunca exclui parcialmente uma árvore que mudou em outro dispositivo.

## Publicação web e Android

Antes de publicar pelo workflow do GitHub Pages, crie duas **Actions Variables** no repositório em **Settings → Secrets and variables → Actions → Variables**:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

O workflow recusa o deploy se alguma delas estiver vazia. São valores públicos; não cadastre a service role nesse local. A CI de validação inicia o Supabase em runner Linux, reaplica migration/seed e executa o pgTAP sem usar credenciais do projeto remoto.

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

As três fixtures de curso em `supabase/fixtures/catalog/` nunca são lidas pelo app. Primeiro valide localmente o contrato, o round-trip, o hash canônico e todas as relações:

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
npx --yes supabase@2.109.1 db reset
npx --yes supabase@2.109.1 test db
```

Se Docker ou Supabase CLI não estiverem disponíveis, as duas últimas verificações devem ser feitas em outra máquina ou na CI antes da implantação. Isso não autoriza aplicar a migration diretamente em produção sem o teste local.
