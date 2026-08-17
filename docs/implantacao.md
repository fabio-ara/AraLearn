# Implantação

Este documento é o roteiro operacional para preparar o AraLearn, seus serviços
remotos e o aplicativo Android num ambiente de uso. Ele apresenta primeiro os
conceitos necessários e depois as operações na ordem em que precisam ser
validadas.

## Conceitos operacionais

- **artefato executável**: arquivo produzido a partir do código e pronto para
  distribuição, como o site empacotado ou o aplicativo Android;
- **contrato de dados**: conjunto versionado de formas e regras que dois
  componentes precisam interpretar do mesmo modo;
- **Android Package (APK)**: arquivo instalável que distribui o aplicativo no
  Android;
- **Supabase**: plataforma dos serviços remotos de identidade, banco de dados,
  armazenamento de objetos e funções de servidor;
- **Indexed Database API (IndexedDB)**: banco de objetos local oferecido pelo
  navegador e usado para conservar a réplica de cada conta no dispositivo;
- **build**: transformação do código versionado em um site ou APK distribuível;
- **deployment**: instalação de um build ou de funções num ambiente;
- **migration**: alteração versionada do esquema e das funções do banco;
- **WebView**: componente Android que hospeda o motor web usado pelo APK para
  executar o mesmo HTML, CSS e JavaScript do site;
- **Service Worker**: script do navegador instalado separadamente da página,
  capaz de responder a requisições com arquivos em cache e de atualizar esse
  cache quando uma nova revisão da aplicação é publicada;
- **smoke test**: ensaio curto no ambiente real para verificar que os
  componentes essenciais se comunicam;
- **rollback**: retorno operacional a uma versão anterior; no banco, em geral
  exige uma migration corretiva, não a remoção do histórico aplicado.

O [glossário técnico](glossario-tecnico.md) aprofunda esses termos e as siglas
das ferramentas. O documento [Supabase no AraLearn](supabase.md) ensina os
componentes remotos em detalhe.

Implantar o AraLearn significa produzir os artefatos executáveis, preparar os
serviços remotos e demonstrar que ambos obedecem à mesma revisão de contrato. A
operação envolve três componentes:

1. o site estático, também incorporado ao APK Android;
2. o projeto Supabase, que oferece identidade, autorização, relações e
   artefatos privados;
3. a réplica IndexedDB de cada dispositivo, criada pelo próprio aplicativo e
   não transferida manualmente.

O IndexedDB permite estudo offline, mas não substitui o servidor como autoridade
compartilhada. Da mesma forma, publicar o site não aplica migrations, e aplicar
migrations não gera um APK. O procedimento mantém essas etapas separadas e as
valida na ordem de dependência: **banco → funções de servidor → aplicação →
smoke funcional**.

## Formas de implantação

O perfil deve ser escolhido pelo que o repositório consegue verificar, não apenas pelo que seria tecnicamente possível.

| Perfil | Estado de suporte | Fundamento e limite |
|---|---|---|
| GitHub Pages com Supabase gerenciado | suportado | os workflows validam o repositório, conferem a revisão remota, constroem e examinam o site |
| servidor estático HTTPS com Supabase gerenciado | artefato suportado; host deve ser qualificado | `.pages/` é reproduzível, mas MIME, cache, callback e Service Worker dependem do servidor escolhido |
| intranet estática HTTPS com Supabase gerenciado | possível sob requisitos de rede | exige saída HTTPS, DNS, certificados e redirects cadastrados |
| desenvolvimento local descartável | suportado para desenvolvimento e teste | a CI recria banco, Auth, e-mail, APIs e funções; não constitui produção |
| SharePoint ou SPFx | não implementado | não há pacote, autenticação nem suíte de conformidade; a página também não admite `iframe` |
| Supabase auto-hospedado em produção | não automatizado nem qualificado | o stack local não demonstra backup, TLS, observabilidade, atualização e operação institucional |
| backend diferente do Supabase | não implementado | não existem adaptadores nem testes de conformidade para outro BaaS |

Uma implantação auto-hospedada não é apenas “subir PostgreSQL”. Precisa reproduzir Auth, PostgREST, gateway, Storage, Edge Functions, e-mail, TLS, backup, monitoramento e atualização coordenada. Enquanto essa infraestrutura e sua suíte de conformidade não existirem, o perfil não deve ser apresentado como suportado.

A distinção evita um erro comum: reverter apenas o site quando o banco já mudou pode produzir incompatibilidade tão grave quanto publicar o site antes do banco.

## Ferramentas e nomes do Supabase

Todos os perfis usam Git, PowerShell 7, Node.js 22 ou posterior, npm e npx. O Supabase local acrescenta Docker e Deno. O APK acrescenta Java 17 e Android SDK. No Windows, use `npm.cmd` e `npx.cmd` para não depender da política que habilita scripts `.ps1` instalados pelo npm.

| Nome | Definição | Pode entrar no site/APK? |
|---|---|---|
| Project URL | origem pública das APIs | sim |
| Project Ref | identificador do projeto contido na URL | sim |
| publishable key | identificador público usado pelo cliente sob RLS | sim |
| secret key | credencial administrativa para processos protegidos | não |
| senha do banco | credencial de administração e migrations | não |

Publishable key não é um mecanismo de autorização. Ela pode ser pública porque RLS, JWT e funções de domínio limitam as operações. Secret key, token pessoal, senha, chave privada e keystore nunca pertencem ao repositório, ao host estático ou ao artefato.

## 1. Escolher e conferir o perfil

Gere um plano sem alterar ambiente remoto:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase
```

Perfis automatizados:

```text
GitHubPagesManagedSupabase
StaticHostManagedSupabase
LocalDevelopment
```

`-IncludeAndroid` acrescenta o APK. Para um host institucional, informe as origens finais:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile StaticHostManagedSupabase `
  -ApplicationUrl https://intranet.exemplo.org/aralearn `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -IncludeAndroid
```

Diagnostique a estação antes de baixar ou publicar artefatos:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -Authoring
```

O diagnóstico confere versões, executáveis, arquivos essenciais e dependências. `-Android` exige Java e SDK; `-Authoring` exige Deno; `-RequireRuntimeConfig` exige configuração pública completa e rejeita chave administrativa sem exibi-la. No perfil local, também testa Docker, portas e espaço. Os scripts aceitam `-AsJson` e retornam código diferente de zero diante de bloqueio.

## 2. Preparar o projeto Supabase hospedado

### Decisão operacional

Migrations são aplicadas antes do site porque o novo cliente pode chamar contratos que o banco antigo desconhece. O workflow de Pages consulta o manifesto público e recusa uma revisão remota atrasada, mas essa barreira não elimina a revisão humana do plano.

1. Crie o projeto em região próxima do público.
2. Guarde senha e secret key num gerenciador de segredos.
3. Não crie tabelas ou RPCs manualmente no SQL Editor.
4. Faça login na CLI e simule:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co
```

O script vincula o projeto, compara o histórico e executa `db push --dry-run`. Interrompa diante de migration desconhecida, histórico divergente ou objeto não reconhecido. O roteiro não executa reset, seed, `db pull` ou `migration repair` remoto.

Em uma instalação vazia, depois da revisão, aplique:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply
```

O terminal exige `APLICAR` e recebe a senha pelo prompt da CLI. Confirme:

```powershell
npx.cmd --yes supabase@2.109.1 migration list --linked
npx.cmd --yes supabase@2.109.1 db lint --linked --level warning --fail-on warning
```

As fixtures em `supabase/fixtures/catalog/` não são seed remoto e não entram no aplicativo. O procedimento correto está em [publicação inicial das fixtures oficiais](supabase.md#publicação-inicial-das-fixtures-oficiais).

### Corte único do projeto que já contém Cursos

Não aplique `20260817140000_course_identity_cutover.sql` nem
`20260817150000_course_profiles_access.sql` nem
`20260817160000_course_authoring_plan.sql` nem
`20260817170000_course_study_unit_inspection.sql` nem
`20260817180000_course_design_parameters.sql` nem
`20260817190000_course_sources_provenance.sql` por `db push` no projeto hospedado
que contém os oito Cursos anteriores. O corte de identidade precisa receber a
staging validada e as seis migrations precisam ser confirmadas na mesma sessão
e na mesma transação. O comando transitório é:

```powershell
node .\scripts\courseCutover\runCourseIdentityCutover.mjs --help
```

Sem `--apply`, o runner lê, converte e valida, mas não escreve no banco. Com
`--apply`, ele executa esta sequência fail-closed:

1. lê o snapshot e as resoluções semânticas privadas;
2. valida documentos, topologia, sobreposições, contagens e metadados técnicos;
3. grava a atestação privada `prepared`;
4. relê a origem e aborta se o hash mudou;
5. envia staging + as migrations `1400`, `1500`, `1600`, `1700`, `1800` e
   `1900` por uma única conexão e uma única transação PostgreSQL;
6. registra as seis versões em `supabase_migrations.schema_migrations` dentro
   dessa transação;
7. relê o modelo canônico, recompõe cada Curso e compara os hashes;
8. grava a atestação privada `verified`.

Senha do banco, publishable key e token da sessão humana entram somente por
variáveis efêmeras ou pelo objeto JSON de `--secrets-stdin`; nunca são
argumentos, logs ou arquivos de evidência. Resoluções semânticas também precisam
ficar fora do repositório público.

As atestações ficam, por padrão, em
`../AraLearn_private/evidence/course-cutover/`. Cada Curso registra somente
`courseId`, `manifestHash`, `documentHash`, `rowHash`, `entityStateHash`,
`sourceReferenceHash` e contagens. `sourceReferenceHash` sela a ordem das tuplas
`{studyUnitId, sourceOrdinal, sourceId}` e preserva a identidade literal. O
relatório inclui ainda os hashes do snapshot, das resoluções e do conjunto das
seis migrations; não inclui conteúdo, credenciais nem uma segunda
cópia do banco. O runner recusa gravá-lo dentro do repositório público.

A transação limita espera de lock a 15 segundos e cada instrução a 10 minutos;
o processo cliente tem 12 minutos. Lock indisponível, instrução demorada,
processo excedido, drift ou divergência pós-aplicação encerram o comando com
falha. O ensaio PostgreSQL focal mantém uma escrita-prova dentro da transação e
confirma que lock timeout, statement timeout e término do processo não deixam
essa escrita confirmada.

O preflight da `1800` possui duas cercas adicionais. Primeiro, bloqueia as
tabelas de tentativas e etapas e aborta se existir qualquer materialização
anterior ao novo contexto; não há retomada ou conversão implícita desse estado.
Depois, bloqueia cada relação legada de desenho antes de conferir que está
vazia. Assim, uma escrita concorrente não pode atravessar a janela entre
verificação e corte. Qualquer linha encontrada exige inspeção e decisão
explícita antes de uma nova execução.

O preflight da `1900` bloqueia materializações em andamento e referências
legadas malformadas. A migration retira `StudyUnit.sources`, cria revisões
`unresolved_legacy` e atribuições baseline na mesma identidade e ordem, e
confere contagem e hash. Não há leitura dupla nem preenchimento inferido de
título, URL ou Âncora.

Falhas durante a transação provocam rollback. A recomposição final acontece
depois do commit; se ela divergir, as migrations já foram aplicadas, mas API,
site e APK permanecem bloqueados até inspeção e correção explícitas. O relatório
`verified` não é produzido nesse caso.

Depois de um `verified`, confira imediatamente o ledger e o plano remoto:

```powershell
npx.cmd --yes supabase@2.109.1 migration list --linked
npx.cmd --yes supabase@2.109.1 db push --linked --dry-run
```

As versões `20260817140000`, `20260817150000`, `20260817160000`,
`20260817170000`, `20260817180000` e `20260817190000` precisam
constar como aplicadas e o dry-run não pode tentar reaplicá-las. Nunca execute
`db push` em modo Apply antes do runner nesse projeto: a `1600` converte o
estado autoral monolítico criado pela `1400`, e a `1700` conclui o corte para
`aralearn.course.v1`, `microsequence.studyUnits`, discriminador exclusivo
`study_unit` e Inspeção owner-only; a `1800` remove a orientação escalar do
plano e instala parâmetros, revisões de orientação e política de componentes;
a `1900` instala Fontes, Âncoras, atribuições e o corte limpo do conteúdo.
Não existe janela intermediária nem passo separado de `db push` para a `1700`,
a `1800` ou a `1900`. Só depois dessas provas o roteiro geral
pode publicar as funções e os clientes.

Depois do corte, regenere e revise o inventário vertical contra o schema
pós-`1900`. O resultado esperado é 2.010 objetos: 416 ligados aos seis casos
correntes e 1.594 isolados para remoção na #130. Divergência bloqueia a
aceitação; nenhum total produzido antes dessa migration serve como substituto.

No staging, entidades com raiz relacional levam sua versão e seus próprios
instantes. Os dois Cursos disponíveis somente como publicação não permitem
recuperar metadados históricos por entidade: usam versão `1` e os instantes do
registro do Curso, com a base `course_record` explicitamente atestada. Não se
deve descrever esse default como preservação de uma informação inexistente.

## 3. Configurar contas, e-mail e retorno de autenticação

No painel **Authentication**:

1. habilite e-mail e senha;
2. exija confirmação de e-mail;
3. mantenha login anônimo desabilitado;
4. mantenha rotação de refresh token e troca segura de senha;
5. configure SMTP institucional antes de abrir cadastros;
6. preserve `{{ .ConfirmationURL }}` nos modelos de confirmação e recuperação.

Em **URL Configuration**, use como Site URL o endereço público exato. Cadastre somente os retornos empregados:

```text
https://intranet.exemplo.org/aralearn/
https://intranet.exemplo.org/aralearn/**
http://localhost:4182/
http://localhost:4182/**
http://127.0.0.1:4182/
http://127.0.0.1:4182/**
aralearn://auth/callback
```

Um coringa global amplia desnecessariamente a superfície de redirecionamento. O callback `aralearn://` mantém o APK atual funcional; uma distribuição ampla deve adotar Android App Link HTTPS verificado.

## 4. Implantar no GitHub Pages

Em **Settings → Secrets and variables → Actions → Variables**, crie apenas:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Se a assistência usar outra origem HTTPS, acrescente opcionalmente `ARALEARN_ASSIST_ALLOWED_ORIGINS`, com origens separadas por vírgula e sem caminho ou credencial. A chave pessoal do provedor é informada dentro do aplicativo e permanece apenas na memória da página.

Uma atualização de `main` executa `.github/workflows/validacao.yml`. Somente seu sucesso inicia `.github/workflows/pages.yml`, que repete testes, confere a revisão do banco, verifica CORS da entrega de cursos, constrói e examina o site. Uma execução manual de Pages deve ser usada somente após validar o mesmo commit.

Reproduza localmente:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
$env:ARALEARN_ASSIST_ALLOWED_ORIGINS = "https://assistencia.exemplo.org" # opcional

pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -RequireRuntimeConfig

npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run pages:build

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Pages `
  -RequireRuntimeConfig
```

## 5. Implantar em servidor estático institucional

Gere o mesmo artefato com o perfil apropriado:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"

pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile StaticHostManagedSupabase `
  -RequireRuntimeConfig

npm.cmd ci
npm.cmd run pages:build

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Pages `
  -RequireRuntimeConfig
```

Publique o conteúdo de `.pages/`, não a pasta. O host deve:

- manter caminhos e MIME corretos;
- servir `service-worker.js` na raiz do caminho publicado, sem convertê-lo em HTML;
- preservar `code` e `auth_state` no callback;
- evitar cache prolongado de `index.html`, `runtime-config.js`, `asset-manifest.json` e `service-worker.js`;
- permitir que página e recursos essenciais compartilhem o caminho público previsto;
- usar HTTPS e certificados válidos.

O build deriva a revisão do cache do Service Worker do conteúdo do artefato. Não a substitua manualmente. Uma alteração pública precisa mudar o próprio worker e provocar atualização no navegador.

O problema resolvido por esse cache é a indisponibilidade do shell — HTML,
CSS, JavaScript e ativos necessários para abrir a interface — quando a conexão
falha. Depender sempre da rede impediria até a leitura de cursos já instalados;
guardar páginas autenticadas ou respostas de API, por outro lado, misturaria
conteúdo privado com o cache compartilhado do shell. Por isso, o Service Worker
mantém somente ativos públicos enumerados pelo build. Cursos, progresso e
operações pendentes continuam no IndexedDB da conta. O comportamento geral e o
ciclo de atualização desse mecanismo são definidos no padrão
[Service Workers](https://www.w3.org/TR/service-workers/).

Depois do envio:

```powershell
npm.cmd run deployment:verify-site -- `
  --url https://intranet.exemplo.org/aralearn/
```

O comando verifica recursos, MIME, runtime config, CSP, ausência de segredos, ausência de catálogo embarcado e preservação do callback. Ele não demonstra comportamento offline nem sincronização; esses pontos exigem ensaio funcional.

## 6. Executar o ambiente local completo

O stack local serve para reproduzir o banco e os protocolos sem tocar no projeto hospedado:

```powershell
npm.cmd ci
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O validador executa Deno, lint, pgTAP, RLS, PostgREST, cadastro, confirmação, recuperação, publicação temporária, entrega de revisões e MCP. O Mailpit em `http://127.0.0.1:54324` é parte do ensaio de Auth.

Use os valores públicos exibidos por `supabase status` para iniciar `npm.cmd run dev`. Para descartar o ambiente:

```powershell
npx.cmd --yes supabase@2.109.1 stop --no-backup
```

## 7. Construir o APK Android

Web e Android usam a mesma Project URL e publishable key. Para o build de desenvolvimento:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -Android `
  -RequireRuntimeConfig

npm.cmd run android:debug
.\android\gradlew.bat -p .\android :app:lintDebug --no-daemon

pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Android `
  -RequireRuntimeConfig
```

Uma release requer as variáveis protegidas:

- `ARALEARN_ANDROID_KEYSTORE_PATH`;
- `ARALEARN_ANDROID_KEYSTORE_PASSWORD`;
- `ARALEARN_ANDROID_KEY_ALIAS`;
- `ARALEARN_ANDROID_KEY_PASSWORD`.

Execute `npm.cmd run android:release`. Keystore e senhas não podem entrar no repositório nem no histórico compartilhado. O [roteiro Android](../android/README.md#gerar-um-apk-de-release) identifica o artefato e a assinatura esperados.

Antes de distribuir, teste instalação limpa e atualização sobre a versão anterior, callback, login, recuperação, sincronização, interrupção do processo e estudo sem rede num aparelho ou emulador.

## 8. Implantar autoria e entrega protegida

Implante a autoria somente depois que banco, Auth e aplicativo estiverem funcionais:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply `
  -DeployAuthoringFunctions `
  -PublicAppUrl https://intranet.exemplo.org/ `
  -AllowedOrigin "https://intranet.exemplo.org","http://localhost:4182","http://127.0.0.1:4182"
```

O roteiro publica somente `aralearn-authoring-mcp` e
`aralearn-course-api`. Também remove as funções remotas aposentadas de Action
e revisões, além dos segredos exclusivos desses transportes. Informe origens
na mesma linha, separadas por vírgulas; não use `*`. O script conserva as
origens obrigatórias, inclusive `https://appassets.androidplatform.net`.

O MCP usa OAuth 2.1 com PKCE; a API de Cursos usa a sessão autenticada do
AraLearn. Ambos aplicam a mesma identidade persistida de Curso. Não existe
bootstrap de papel global: ao criar um Curso, a conta autenticada torna-se sua
proprietária em `courses.owner_id` e somente ela pode editar. Acesso direto
concedido na seção **Pessoas** da Autoria — ou pelas ferramentas MCP
correspondentes — permite apenas Estudo; não concede coautoria nem papel
administrativo.

No Supabase, habilite OAuth 2.1 Server, Dynamic Client Registration, uma chave JWT assimétrica, tela de consentimento e o hook `public.aralearn_mcp_access_token_hook`. Confirme os metadados de autorização e de recurso protegido. O [guia de autoria MCP](autoria-mcp.md) contém os valores específicos do cliente.

## 9. Smoke no projeto hospedado

Execute o smoke somente depois de migrations, Auth, funções e ao menos um curso oficial. O ensaio cria duas contas temporárias, comprova isolamento, chama RPCs, materializa conteúdo e tenta limpar os dados. Use janela de manutenção.

Informe a secret key apenas num prompt protegido:

```powershell
Set-Location -LiteralPath "C:\caminho\para\AraLearn"
$env:SUPABASE_URL = "https://abc123abc123abc123ab.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
$segredo = Read-Host "Cole a chave administrativa do projeto" -AsSecureString
$ponte = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredo)
try {
  $env:SUPABASE_SECRET_KEY = `
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponte)
  npm.cmd run test:supabase:smoke
  if ($LASTEXITCODE -ne 0) { throw "O smoke hospedado falhou." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponte)
  Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  Remove-Variable segredo, ponte -ErrorAction SilentlyContinue
}
```

O resultado deve comprovar Auth, PostgREST, RLS, RPCs e artefatos. Se a limpeza falhar, procure contas com prefixos `smoke-a-` e `smoke-b-` e conclua a remoção pelo painel. Não afrouxe constraints nem execute reset remoto para facilitar o teste.

## 10. Verificação antes da abertura

Execute a suíte proporcional ao artefato que será distribuído:

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
```

Examine site e APK:

```powershell
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target All `
  -RequireRuntimeConfig
```

O verificador reprova segredo, `.env`, keystore, catálogo operacional embarcado, URL inválida, publishable key ausente ou administrativa, CSP ampla e marcadores não substituídos. Ele não confirma migrations, SMTP, RLS remoto, redirects nem disponibilidade; use lint, smoke e teste funcional para isso.

## 11. Aceitação funcional e operação contínua

Antes de abrir a instalação, demonstre:

1. cadastro, confirmação, recuperação, login e saída;
2. seleção e materialização de curso;
3. progresso, comentário, marcação de revisão e Fontes de Estudo carregadas
   somente ao abrir, com ocultação e link conforme visibilidade;
4. fechamento e reabertura sem rede;
5. reconexão e esvaziamento idempotente da fila;
6. continuidade em segundo dispositivo;
7. Inspeção owner-only e MCP `study_units` com os mesmos escopos, âncora,
   cursores e links profundos;
8. Inspeção vertical em 360, 390 e 430 px e desktop, com janela de até 36
   Unidades, retomada local, revisão, offline exato e purga após revogação;
9. sexta área **Fontes** em 360, 390 e 430 px e desktop, com catálogo de mais
   de 55 itens, paginação, revisão, aposentadoria, Âncoras e atribuição de
   conjunto completo no Planejamento e na Inspeção;
10. ausência de `StudyUnit.sources`, legado não resolvido oculto e resolução
    in-place sob a identidade literal;
11. composição e materialização confirmando entidades e atribuições
    atomicamente, somente com revisões e Âncoras permitidas pelo contexto;
12. edição, assistência, autoria externa e publicação conforme permissões;
13. atualização do site e do APK sem perda de estado local;
14. conflito CAS com resposta explícita e retry preservando intenção e
    `requestId`;
15. limites de página, cache e resposta sob orçamento do Free Plan;
16. concorrência e constraints após reset em PostgreSQL real;
17. inventário vertical pós-`1900` com 2.010 objetos: 416 correntes e 1.594
    isolados para remoção na #130;
18. restauração de backup ensaiada.

Defina responsáveis por backup, restauração, SMTP, domínio, certificados, atualização do Supabase, logs e incidentes. Testes automatizados reduzem risco conhecido; não substituem monitoramento nem um plano operacional exercitado.
