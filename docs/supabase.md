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
- `unselect_catalog_course`: retira a seleção do usuário e elimina a árvore apenas quando ela é uma cópia pessoal sem outra seleção;
- `fork_catalog_course_for_editing`: cria sob demanda uma árvore pessoal independente e remapeia seleção, trilhas, progresso e comentários;
- `create_personal_course`: cria uma raiz pessoal vazia para um curso novo ou importado;
- `delete_own_account`: exige JWT e confirmação explícita, remove transacionalmente a conta autenticada e seus dados pessoais e não concede execução a `anon`;
- `apply_sync_batch`: aplica lote idempotente de estado pessoal e patches granulares de cursos pessoais pela regra da última mutação válida;
- `pull_sync_changes`: pagina somente mudanças pessoais e sinais compactos;
- `bootstrap_replica`: devolve seleções, progresso, comentários, trilhas, metadados e `highWaterSequence` da mesma visão transacional;
- `list_catalog_collections`: retorna coleções e metadados publicados;
- `list_catalog_collections_admin`: pagina coleções, inclusive vazias, para `owner` e `catalog_publisher`;
- `list_catalog_courses_admin` e `get_catalog_course_admin`: consultam metadados administrativos sem devolver a árvore;
- `get_catalog_course_structure_admin`: pagina seções formais da árvore e os componentes pedagógicos, sem permitir escrita direta;
- `create_catalog_collection_admin`, `rename_catalog_collection_admin` e `retire_catalog_collection_admin`: administram o ciclo de vida das coleções com idempotência e revisão;
- `reorder_catalog_collections_admin`, `move_catalog_course_admin` e `reorder_catalog_courses_admin`: alteram somente a classificação e a ordem do catálogo;
- `update_catalog_course_metadata_admin`: corrige somente título ou objetivo e incrementa a sequência pública;
- `list_user_course_summaries`: retorna os metadados dos cursos selecionados;
- `list_personal_library_courses`: pagina os cursos selecionados da própria conta e informa sua trilha atual;
- `get_personal_library_course_structure`: consulta módulos, lições, microssequências ou cards de um curso selecionado, um nível por vez;
- `list_personal_study_paths`: pagina as trilhas da própria conta e informa quantos cursos permanecem em **Sem trilha**;
- `rename_personal_library_course`: renomeia somente uma árvore que pertença à conta, sem alterar publicação oficial;
- `create_personal_study_path`, `rename_personal_study_path` e `delete_personal_study_path`: administram trilhas próprias; a exclusão preserva cursos e estado de estudo;
- `move_personal_course_selection`: move uma seleção para uma trilha própria ou para **Sem trilha**;
- `sync_storage_diagnostics`: informa watermark seguro, dispositivos e volume do histórico para administradores;
- `compact_sync_history`: simula ou executa a compactação administrativa abaixo do watermark seguro;
- `cleanup_abandoned_official_imports`: simula ou remove somente staging oficial incompleto e inativo.
- `current_user_capabilities`: informa à interface as permissões da conta sem expor tabelas privadas;
- `begin_authoring_request_v3`: registra a idempotência e adquire uma lease antes do trabalho pesado;
- `commit_authoring_transition_v3`: confirma hashes e muda o estado em transação curta;
- `get_authoring_run_control_v3`: devolve somente estado, partes e referências;
- `get_course_revision_artifact_v3`: autoriza a API a entregar uma revisão privada;
- `pull_course_revision_changes`: pagina sequência, curso e hash da revisão;
- `release_expired_authoring_artifact_links_v3`: libera vínculos intermediários depois da retenção;
- `claim_unreferenced_artifacts_v3` e `complete_artifact_gc_v3`: executam a coleta segura com tombstones.

As funções de dados de usuário exigem JWT autenticado. Operações administrativas de publicação não são concedidas a `anon` nem a usuários comuns.

## API de autoria

A função `aralearn-authoring-api` atende a interface, Actions e conectores REST.
A função `aralearn-authoring-mcp` atende agentes por MCP com uma chave
`arl_...`. Ambas aplicam o mesmo núcleo de validação e autorização.
`aralearn-course-revisions` autentica o estudante, autoriza o curso pelo plano
de controle e entrega o objeto privado depois de conferir tamanho e SHA-256. A
chave administrativa permanece no ambiente protegido das Edge Functions; ela
nunca é devolvida ao cliente.

No projeto hospedado, o Supabase fornece as secret keys à função pelo objeto `SUPABASE_SECRET_KEYS`. Se houver mais de uma, `ARALEARN_SUPABASE_SECRET_KEY_NAME` escolhe o nome usado pelo AraLearn. Não copie uma secret key para `SUPABASE_SERVICE_ROLE_KEY`: essa variável fica restrita à chave efêmera emitida pela Supabase CLI no ambiente local descartável.

As funções também recebem dois segredos próprios e distintos. `ARALEARN_AUTHORING_INTEGRATION_SECRET` permite emitir as chaves pessoais; `ARALEARN_AUTHORING_RECEIPT_SECRET` assina o comprovante HMAC-SHA-256 exigido antes da auditoria. O comprovante expira em cinco minutos e vincula execução, parte, tentativa, hash, usuário e cliente da API. A chave pública e a chave administrativa do banco nunca participam dessas duas operações.

O fluxo completo, os papéis e a criação de clientes estão em [Autoria e publicação do catálogo](autoria-do-catalogo.md). A especificação importável por ferramentas REST fica em [OpenAPI](openapi/aralearn-authoring-api.yaml). A configuração do transporte MCP está em [Gateway MCP de autoria](autoria-mcp.md).

Implante banco e funções pelo roteiro protegido:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply `
  -DeployAuthoringApi `
  -InitializeAuthoringSecrets `
  -AllowedOrigin "https://aplicacao.exemplo.org","http://localhost:4182","http://127.0.0.1:4182"
```

Na chamada de um script com `pwsh -File`, mantenha a lista de origens na mesma
linha e separada por vírgulas. A forma `@(...)` pode fazer o PowerShell
interpretar uma origem como outro parâmetro do script.

Use `-InitializeAuthoringSecrets` apenas na primeira implantação da autoria ou numa rotação intencional. Nas atualizações seguintes, omita a opção para conservar os valores já guardados no projeto.

`verify_jwt` fica desabilitado no gateway dessa função porque ela admite dois modos de autenticação e verifica ambos no próprio código. O JWT recebido é validado pelo Auth do projeto antes de qualquer comando; a chave de cliente é resumida em SHA-256 e resolvida no banco com expiração, revogação, escopos e limite de requisições.

As origens do upload pela interface são limitadas pelo segredo `ARALEARN_AUTHORING_ALLOWED_ORIGINS`. Não use `*`. O valor deve listar somente o site publicado, o servidor local e as origens do WebView realmente utilizadas.

`apply_sync_batch` recebe trilhas, progresso, comentários e linhas granulares de uma árvore pessoal; selecionar, remover, criar ou bifurcar curso usa as RPCs idempotentes próprias. O servidor rejeita qualquer tentativa de alterar uma publicação oficial pelo sincronizador. Cada operação traz `mutationId` e uma sequência causal do dispositivo. Repetir uma requisição após timeout devolve o resultado anterior sem duplicar a escrita. Para a mesma identidade, a última mutação válida aceita pelo servidor passa a ser o estado corrente. Uma rejeição determinística reverte somente aquela mutação, não deixa linha parcial e não impede as demais mutações válidas do lote.

`list_catalog_collections` expõe somente metadados pesquisáveis de coleções e cursos oficiais publicados. Coleções não concedem escrita a usuários comuns. Trilhas pessoais forçam `owner_id = auth.uid()`, participam do feed e do snapshot de `bootstrap_replica` e não fazem parte do contrato JSON v3.

O bootstrap hospedado retorna somente o estado pessoal pequeno, os metadados dos
cursos selecionados e o `highWaterSequence`. Para uma revisão endereçada por
SHA-256, o runtime compara o hash com a réplica local, baixa o JSON imutável pelo
endpoint `aralearn-course-revisions`, valida contrato e hash e só então projeta
o conteúdo no IndexedDB. A ausência dessa revisão é erro; o cliente não recorre
a uma árvore remota para o mesmo hash.

Uma publicação que remova alvo de mutação local não resolvida fica adiada no
dispositivo, sem descarte silencioso da outbox. Arquivar ou marcar uma publicação
como removida apaga seleções e estado pessoal dependente no mesmo commit, emite
tombstones pelo feed e a exclui de novos bootstraps.

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

O material editorial completo não ocupa mais o PostgreSQL. Planos, entregas,
auditorias e revisões ficam em buckets privados, endereçados por SHA-256. O
banco conserva somente execuções, partes, requests, hashes e referências.
Objetos continuam protegidos enquanto houver referência de execução, request ou
revisão. Para diagnosticar órfãos sem removê-los:

```sql
select public.list_unreferenced_artifacts_v3(interval '7 days', 100);
```

A RPC exige service role e apenas lista candidatos que continuam sem referência
no instante da consulta. O coletor oportunista reivindica esses hashes em lote,
move seus metadados para tombstones, apaga os objetos e confirma a exclusão. Se
o Storage ainda conservar o objeto, a referência é restaurada. Execuções ativas
e revisões vigentes nunca entram no alvo.

Não há quota de cards, bytes de staging por autor ou tamanho total de rascunhos
no PostgreSQL. O limite por objeto configurado localmente é 128 MiB para
respeitar a memória da Edge Function. Artefatos maiores que 6 MiB usam upload
TUS retomável; cursos extensos continuam divididos em plano, ledger e partes.

## Publicação web e Android

Antes de publicar pelo workflow do GitHub Pages, crie duas **Actions Variables** no repositório em **Settings → Secrets and variables → Actions → Variables**:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

O workflow recusa o deploy se alguma delas estiver vazia. São valores públicos; não cadastre chave administrativa nesse local. A CI de validação inicia o Supabase em runner Linux, reaplica migration/seed e executa o pgTAP sem usar credenciais do projeto remoto. Uma atualização de `main` só inicia a publicação automática depois do sucesso dessa validação. O fluxo de Pages repete os testes do aplicativo, consulta o manifesto do projeto hospedado e só gera o site quando migrations e recursos necessários estão disponíveis. Uma execução manual de Pages não depende da validação anterior e deve ser usada somente depois de conferir o mesmo commit.

O job `supabase` também executa `npm run test:supabase:smoke` contra Auth, PostgREST e RPCs reais. O smoke cria temporariamente usuários autenticados A e B e comprova: negação para `anon`; efeito real de `auth.uid()`; seleção compartilhada sem cópia da árvore; cópia sob demanda isolada na primeira autoria; rejeição de escrita na publicação oficial; isolamento de seleções, progresso, escrita e feed; bootstrap leve; regra de última mutação válida; remoção da seleção de A sem afetar B; e autorização das funções `SECURITY DEFINER`. Um segundo ensaio usa o Mailpit para testar cadastro, confirmação PKCE e recuperação de senha. A service role usada para criar e remover os sujeitos de teste vem apenas de `supabase status` no runner local e nunca entra no build.

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

Depois de aplicar as migrations, a API valida cada fixture, grava o documento
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

O script executa as verificações Deno, o lint do banco, pgTAP, RLS, PostgREST, Auth, e-mail, API REST e MCP. Ele descobre a URL e as chaves efêmeras do stack iniciado por `supabase status`; não use segredos do projeto remoto nessa validação. Se Docker, Supabase CLI ou Deno não estiverem disponíveis, rode a etapa em outra máquina ou confira o job `supabase` da CI antes da implantação. Isso não autoriza aplicar migrations diretamente em produção sem validar o banco iniciado do zero e a interface HTTP real.

O smoke do projeto hospedado, com duas contas temporárias e limpeza ao final, está descrito em [Implantação](implantacao.md#9-smoke-no-projeto-hospedado). Ele exige uma janela de manutenção e uma chave administrativa informada apenas pelo prompt protegido.
