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

O app implementa cadastro, confirmação, reenvio de confirmação, recuperação e troca de senha, login, renovação, sessão persistida, saída e exclusão da própria conta. O servidor de desenvolvimento resolve o arquivo pelo pathname e preserva a query `code`/`auth_state` na URL do navegador, permitindo que o runtime conclua o callback PKCE local. Sem sessão, somente a porta de autenticação é renderizada. Não existe catálogo anônimo.

No ambiente local, `enable_confirmations = true`; as mensagens de confirmação e recuperação podem ser abertas na caixa SMTP local exposta em `http://127.0.0.1:54324` depois de `npx --yes supabase@2.109.1 start`.

## Vincular um projeto remoto

Crie o projeto pelo painel Supabase e guarde senhas e chaves administrativas somente em um gerenciador de segredos. Depois execute:

```bash
npx --yes supabase@2.109.1 login
npx --yes supabase@2.109.1 link --project-ref <project-ref>
npx --yes supabase@2.109.1 migration list --linked
npx --yes supabase@2.109.1 db push
npx --yes supabase@2.109.1 db lint --linked --level warning --fail-on warning
```

Revise a saída de `migration list --linked` e confirme que o histórico local e o remoto estão coerentes antes de executar `db push`. A aplicação usa Auth, PostgREST e as funções SQL transacionais versionadas na migration.

Se o PostgREST responder que não encontrou uma RPC no cache do schema, compare primeiro o histórico local e o remoto. Esse erro normalmente indica que o runtime e as migrations implantadas estão em revisões diferentes; não limpe o IndexedDB para tentar corrigi-lo. Faça o `dry-run`, aplique somente as migrations versionadas pendentes e repita o lint e o smoke hospedado. Uma RPC existente, porém chamada sem sessão, deve responder com erro de autenticação ou autorização — nunca com `PGRST202`/“schema cache”.

Este corte implanta somente migrations, RLS, RPCs e os artefatos web/Android da aplicação. Não há Edge Function, especificação OpenAPI, GPT Action ou componente Planner, Part Builder ou Auditor a implantar neste escopo.

## Funções transacionais da aplicação

- `select_catalog_course`: registra a seleção de uma publicação oficial sem copiar sua árvore;
- `unselect_catalog_course`: retira somente a seleção do usuário;
- `get_selected_course_graph`: devolve a publicação atual de um curso selecionado;
- `delete_own_account`: exige JWT e confirmação explícita, remove transacionalmente a conta autenticada e seus dados pessoais e não concede execução a `anon`;
- `apply_sync_batch`: aplica lote idempotente de estado pessoal pela regra da última mutação válida;
- `pull_sync_changes`: pagina somente mudanças pessoais e sinais compactos;
- `bootstrap_replica`: devolve seleções, progresso, comentários, trilhas, metadados e `highWaterSequence` da mesma visão transacional;
- `validate_course_graph`: verifica integridade e completude da árvore;
- `publish_official_course`: publica atomicamente somente um curso completo e válido;
- `list_catalog_collections`: retorna coleções e metadados publicados;
- `list_user_course_summaries`: retorna os metadados dos cursos selecionados;
- `sync_storage_diagnostics`: informa watermark seguro, dispositivos e volume do histórico para administradores;
- `compact_sync_history`: simula ou executa a compactação administrativa abaixo do watermark seguro;
- `cleanup_abandoned_official_imports`: simula ou remove somente staging oficial incompleto e inativo.

As funções de dados de usuário exigem JWT autenticado. Operações administrativas de publicação não são concedidas a `anon` nem a usuários comuns.

`apply_sync_batch` recebe somente trilhas, progresso e comentários; selecionar ou remover curso usa as RPCs idempotentes próprias. Cada operação traz `mutationId` e uma sequência causal do dispositivo. Repetir uma requisição após timeout devolve o resultado anterior sem duplicar a escrita. Para a mesma identidade natural, a última mutação válida aceita pelo servidor passa a ser o estado corrente. Uma rejeição determinística reverte somente aquela mutação, não deixa linha parcial e não impede as demais mutações válidas do lote.

`list_catalog_collections` expõe somente metadados pesquisáveis de coleções e cursos oficiais publicados. Coleções não concedem escrita a usuários comuns. Trilhas pessoais forçam `owner_id = auth.uid()`, participam do feed e do snapshot de `bootstrap_replica` e não fazem parte do contrato JSON v3.

O bootstrap hospedado retorna somente o estado pessoal pequeno, os metadados dos cursos selecionados e o `highWaterSequence`. O runtime aplica snapshot e cursor numa transação e então chama `get_selected_course_graph` somente para árvores ausentes ou cuja `publicationSeq`/`contentHash` mudou. A árvore oficial existe uma única vez no PostgreSQL e cada dispositivo conserva sua réplica offline.

Antes de trocar essa réplica, o cliente valida a integridade relacional e o documento v3 remontado. Uma publicação que remova alvo de mutação local não resolvida fica adiada no dispositivo, sem descarte silencioso da outbox. Arquivar ou marcar uma publicação como removida apaga seleções e estado pessoal dependente no mesmo commit, emite tombstones pelo feed e a exclui de novos bootstraps. A exclusão física direta de curso canônico é bloqueada.

As falhas retornadas ao runtime são retentáveis, `auth_required` ou rejeições definitivas. Rede, timeout, 429 e 5xx conservam `pending`; HTTP 401, JWT/refresh token inválido ou expirado e sessão ausente produzem `auth_required`, preservam integralmente a outbox e interrompem chamadas remotas até novo login. Erros determinísticos de payload, referência, autorização efetivamente revogada (403) ou reutilização incompatível de idempotência geram `rejected` e não são reenviados. O pull pode continuar após falha de push somente quando autenticação e conexão ainda são válidas.

## Retenção operacional da sincronização

Os padrões versionados são: dispositivo ativo por 90 dias, `private.sync_changes` por no mínimo 30 dias e idempotência de mutações de dispositivo por 90 dias. Não existe `sync_mutations` no corte enxuto. A compactação usa o menor cursor de dispositivos ativos como watermark; nunca remove uma parte não contígua do feed. Um dispositivo vencido precisa de `bootstrap_replica` antes de voltar ao feed, mas sua outbox pessoal permanece preservada para envio idempotente e o contador causal do dispositivo impede reaplicação depois da compactação do ledger. O diagnóstico inclui também quantidade e bytes do staging administrativo.

Execute primeiro o diagnóstico e o dry-run por um canal administrativo seguro com papel `service_role`; essas RPCs não são executáveis pelo frontend nem por usuários autenticados comuns:

```sql
select public.sync_storage_diagnostics();
select public.compact_sync_history(true, now());
select public.cleanup_abandoned_official_imports(true, interval '7 days', now());
```

Somente depois de revisar o watermark e as contagens, execute:

```sql
select public.compact_sync_history(false, now());
select public.cleanup_abandoned_official_imports(false, interval '7 days', now());
```

Essas RPCs são `SECURITY DEFINER`, fixam `search_path`, verificam `is_app_admin()` internamente e têm `EXECUTE` concedido somente a `service_role`. A limpeza de staging usa sete dias como retenção padrão e só alcança imports incompletos com `status = 'staging'`; drafts concluídos e publicações visíveis nunca entram no alvo. Finalização e limpeza recuperam as páginas transitórias com `TRUNCATE` apenas quando não resta nenhuma importação ativa, sob o mesmo lock transacional usado pelo importador. As tabelas internas de feed e idempotência também não possuem leitura direta para o cliente.

## Publicação web e Android

Antes de publicar pelo workflow do GitHub Pages, crie duas **Actions Variables** no repositório em **Settings → Secrets and variables → Actions → Variables**:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

O workflow recusa o deploy se alguma delas estiver vazia. São valores públicos; não cadastre a service role nesse local. A CI de validação inicia o Supabase em runner Linux, reaplica migration/seed e executa o pgTAP sem usar credenciais do projeto remoto.

O job `supabase` também executa `npm run test:supabase:smoke` contra Auth, PostgREST e RPCs reais. O smoke cria temporariamente usuários autenticados A e B e comprova: negação para `anon`; efeito real de `auth.uid()`; seleção compartilhada sem cópia da árvore; isolamento de seleções, progresso, escrita e feed; bootstrap leve; regra de última mutação válida; remoção da seleção de A sem afetar B; e autorização das funções `SECURITY DEFINER`. A service role usada para criar esses sujeitos de teste vem apenas de `supabase status` no runner local e nunca entra no build.

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

Depois de aplicar as migrations, um processo administrativo local importa cursos pequenos ou grandes sem depender de uma única requisição longa. `begin_official_course_import` cria um draft privado, `apply_official_course_import_chunk` confirma lotes idempotentes e retomáveis, e `finalize_official_course_import` só publica depois de conferir o manifesto e validar integralmente o grafo. Um draft nunca pode materializar por cima de uma publicação já visível: substituir a árvore live exige finalização com publicação atômica. Os nós e casos de cada bloco `flow`, que possuem referências circulares legítimas, são confirmados juntos por `apply_official_course_import_flow_chunk`; uma retomada limpa somente um `flow` parcial antes de reconstruí-lo por bloco e preserva os demais lotes já confirmados. Um timeout pode repetir o mesmo lote sem duplicá-lo; nenhum staging parcial aparece no catálogo. A publicação gera UUIDs estáveis pela `identityKey`, não pelo hash nem pela sequência das linhas, e a árvore oficial continua única para todos os estudantes. Depois de uma mudança de cards, o banco reconcilia os resumos de lição a partir do prefixo contíguo canônico de `card_progress`. A service role é aceita somente nesse processo de terminal e não pode ser reutilizada nas variáveis públicas de build.

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
