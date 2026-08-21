# Implantação do AraLearn

A implantação reúne quatro entregas coordenadas: contrato do Supabase, funções
de borda, site estático e aplicativo Android. A linha 0.0.25 usa a revisão
hospedada `20260820224424`, a API de Cursos na revisão 5 e o MCP na revisão 120.
Essa atualização altera somente os clientes; não promove migração nem função. O
contrato público das ferramentas e do recurso MCP permanece 0.0.23; a nova
origem estruturada existe somente na rota autenticada do aplicativo.

O corte 0.0.23 instalou a identidade única de Curso, acesso direto somente para
Estudo, API de Cursos, MCP, Fontes com PDFs privados, Pesquisa, Variantes e o
catálogo de 32 componentes didáticos. A versão 0.0.24 acrescenta a gravação
contextual de uma Unidade, com origem auditável e carga estrita da proveniência
anterior; ela não reinstala a arquitetura anterior ao corte.

Na atualização de 0.0.22 para 0.0.23, o contrato antigo permaneceu ativo
enquanto a revisão nova entrou em `main` e concluiu a validação ampla. O corte
do banco começou somente com essa revisão aprovada e abriu a janela de
manutenção descrita adiante. Instalações Android 0.0.22 precisam ser atualizadas.

## Ambientes apoiados

| Perfil | Aplicativo | Serviços |
|---|---|---|
| desenvolvimento local | servidor local e APK de depuração | Supabase local descartável |
| publicação oficial | GitHub Pages e APK assinado | projeto Supabase gerenciado |
| hospedagem estática própria | conteúdo de `.pages` em HTTPS | projeto Supabase gerenciado |

O gerador de roteiro apresenta os passos aplicáveis a cada perfil:

```powershell
pwsh -NoProfile -File .\scripts\planDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -ApplicationUrl https://fabio-ara.github.io/AraLearn `
  -ProjectUrl https://<project-ref>.supabase.co `
  -IncludeAndroid
```

## Ferramentas

O desenvolvimento e a publicação usam:

- Git e GitHub CLI para integração e acompanhamento dos fluxos;
- Node.js 22 e `npm ci` para dependências reproduzíveis;
- Docker e Supabase CLI 2.109.1 para o banco local;
- Deno 2.x para as Edge Functions;
- Java 17 e Android SDK para o APK;
- PowerShell 7 para os roteiros de validação e implantação.

O diagnóstico verifica o perfil sem promover nada:

```powershell
pwsh -NoProfile -File .\scripts\diagnoseDeployment.ps1 `
  -Profile GitHubPagesManagedSupabase `
  -Authoring `
  -Android `
  -RequireRuntimeConfig
```

## Configuração pública e segredos

Site e APK recebem somente:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

O artefato também publica `assistAllowedOrigins`, uma lista sem credenciais que
precisa coincidir com `connect-src` na política de conteúdo. As origens padrão
são somente `127.0.0.1`, `localhost` e `10.0.2.2`, na porta 4183, para o relay
cuja credencial permanece fora do AraLearn. Não use curingas. Origens diretas de
OpenAI, Gemini e DeepSeek só entram no runtime explícito de desenvolvimento,
que também mostra o alerta de credencial descartável. Cada adaptador verifica
que o provider escolhido corresponde à sua própria origem.

Na montagem de Pages ou Android, `ARALEARN_ASSIST_ALLOWED_ORIGINS` não amplia
essa lista: o artefato de produção ignora origens configuradas externamente, e o
verificador reprova `developmentRuntime`, origem adicional, credencial ou campo
inesperado. Somente o servidor local de desenvolvimento lê essa variável para
um ensaio explícito.

Para a chamada feita pelo navegador, `127.0.0.1` e `localhost` exigem
`targetAddressSpace: "loopback"`; `10.0.2.2` exige `"local"`. Usar `local` para
um endereço de loopback faz o navegador bloquear o relay. Essa classificação
passou 21/21 verificações focais, mas o Pages ainda exige o ensaio real da
permissão de acesso à rede local.

Essa lista, sozinha, não cria paridade no APK de release. O WebView serve a
aplicação por `https://appassets.androidplatform.net` e conserva
`MIXED_CONTENT_NEVER_ALLOW`. Desde a versão 0.0.24, o Android encaminha somente a chamada ao relay
local por uma ponte nativa Android, fixa em
`http://127.0.0.1:4183/v1/chat/completions`, em vez de liberar conteúdo misto no
WebView. Ela aceita somente POST JSON originado do quadro principal do aplicativo,
sem credencial do navegador, limita pedido e resposta a 128 KiB, aplica espera
de 45 segundos e propaga cancelamento. Não enfraqueça essa política nem habilite
tráfego aberto como atalho. A compilação de depuração passou; a validação externa
ainda precisa instalar e exercer a ponte no APK de release, em dispositivo real, e
provar o acesso à rede local a partir do Pages HTTPS.

No GitHub, esses valores ficam em `Settings > Secrets and variables > Actions
> Variables`. A chave precisa ser `sb_publishable_...` ou a chave pública
legada com papel `anon`. Chaves administrativas são recusadas pelo gerador e
pelo verificador de artefatos.

As credenciais de assinatura Android ficam em **Actions > Secrets**:

```text
ARALEARN_ANDROID_KEYSTORE_BASE64
ARALEARN_ANDROID_KEYSTORE_PASSWORD
ARALEARN_ANDROID_KEY_ALIAS
ARALEARN_ANDROID_KEY_PASSWORD
```

Senha do banco, chave administrativa, token da CLI e sessões de teste
permanecem em cofre, variável efêmera ou entrada padrão. Eles não pertencem ao
repositório, ao site, ao APK nem ao relatório de execução.

## Preparação do Supabase hospedado

O projeto precisa ter e-mail transacional configurado para cadastro,
confirmação, recuperação e troca segura de senha. Em Auth, cadastre:

- a URL do Pages como Site URL;
- os redirecionamentos exatos do Pages;
- `http://127.0.0.1:4182/**` para desenvolvimento;
- `https://appassets.androidplatform.net/**` e `aralearn://auth/callback` para Android;
- OAuth Server com registro dinâmico e caminho de autorização `/`;
- chave JWT assimétrica e `public.aralearn_mcp_access_token_hook` como gancho de token.

A URL pública do aplicativo e as origens permitidas das funções são promovidas
por `deploySupabase.ps1`. Origens de produção usam HTTPS e não contêm caminho,
consulta, fragmento ou curinga.

As funções hospedadas exigem uma chave `sb_secret_` no ambiente protegido,
fornecida por `SUPABASE_SECRET_KEY` ou pelo conjunto nomeado
`SUPABASE_SECRET_KEYS`, além da chave pública em
`SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_PUBLISHABLE_KEYS`. A
`SUPABASE_SERVICE_ROLE_KEY` efêmera é aceita somente no Supabase local. Nenhuma
credencial administrativa entra nas variáveis públicas do GitHub.

## Validação local antes da promoção

Instale dependências e recrie o banco local:

```powershell
npm.cmd ci
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

Depois execute o conjunto completo da aplicação:

```powershell
pwsh -NoProfile -File .\scripts\validateDeployment.ps1 `
  -Scope Full `
  -RequireRuntimeConfig
```

O validador de aplicação abrange testes JavaScript, análise estática, exemplo público,
manifesto de Curso, Deno, site, verificação de artefato, navegador, APK de
depuração e análise estática do Android. A validação local do Supabase acrescenta migrações do
zero, análise do PostgreSQL, segurança por linha, PostgREST, API de Cursos, e-mails de Auth e MCP
OAuth. O fluxo de integração contínua confere ainda o inventário exato e a
concorrência em PostgreSQL real.

Falha em qualquer etapa impede a promoção da revisão correspondente. Depois de
corrigir código, migração, configuração ou dependência, repita os testes cujo
risco foi alterado e o conjunto final de integração.

## Verificação visual

Os testes automatizados cobrem fluxos de Estudo e Autoria, mas a publicação
também exige inspeção do produto real. Verifique ao menos:

- larguras de 360, 390 e 430 px em altura de telefone representativa;
- computador em 1280 × 720 ou área maior;
- área segura, rolagem e ausência de corte horizontal;
- títulos, fontes e resultados extensos;
- abertura e fechamento de menus por clique externo e tecla Esc;
- modais, avisos e mensagens que possam cobrir o conteúdo de estudo;
- foco visível, navegação por teclado e tabela equivalente aos gráficos;
- retomada após ficar sem rede e depois reconectar.

Na entrada de Estudo, verifique ainda um único combobox, uma única prévia rica,
os rótulos **Começar**, **Continuar** e **Retomar**, a disponibilidade local e o
fallback após revogação. Leve o foco a **Rever**, abra e feche por `Enter` e
confira a orientação do indicador. A série da 0.0.25 conserva oito capturas nas
quatro larguras e nos temas claro e escuro.

Na Autoria, repita essa inspeção com a superfície centralizada e limitada a
430 px também em 1280 px. A presença de uma tela larga não autoriza segunda
coluna, painel ou variação exclusiva para desktop. Exercite também edição
manual, prévia da assistência por API e retorno ao mesmo alvo.

Uma captura isolada demonstra aparência naquele quadro. Interações, foco,
rolagem e retomada precisam ser exercitados no navegador.

## Reconciliação do banco hospedado

Primeiro simule a implantação:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co
```

O comando vincula o projeto, lista migrações e executa `db push --dry-run`.
Revise a direção da diferença e confirme que o destino é o projeto correto.

Se o ambiente ainda tiver Cursos anteriores à identidade corrente, prepare a
migração dedicada:

```powershell
node .\scripts\courseCutover\runCourseIdentityCutover.mjs --help
node .\scripts\courseCutover\runCourseIdentityCutover.mjs
```

O segundo comando não escreve no banco. Ele valida a fonte e produz atestação
privada. A aplicação usa `--apply` e credenciais efêmeras somente quando a
preparação corresponde ao estado observado. Todas as etapas rodam em uma
transação; divergência de resumo criptográfico ou recomposição provoca reversão.

Depois da migração de identidade, repita `migration list` e `db push --dry-run`. O resultado deve
estar em paridade com `supabase/runtime-manifest.json` na revisão
`20260820224424`.

## Promoção do esquema e das Edge Functions

Com a migração de identidade aplicável verificada:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Mode Apply `
  -DeployAuthoringFunctions `
  -PublicAppUrl https://fabio-ara.github.io/AraLearn/
```

O script repete a simulação, exige a confirmação literal `APLICAR`, promove
migrações, executa a análise hospedada do banco e implanta:

```text
aralearn-course-api
aralearn-authoring-mcp
```

Depois da aprovação do Pages 0.0.23, o ambiente hospedado conserva somente
essas duas funções correntes. Os pontos de entrada da versão anterior foram
retirados e o manifesto, o site e o OAuth MCP foram verificados novamente.

Em seguida valida CORS do Pages e o fluxo OAuth hospedado. Os pontos de entrada
da versão 0.0.22 permanecem implantados até o novo site entrar no ar, mas o
banco pós-corte já não oferece seus contratos. Site e APK 0.0.22 ficam
incompatíveis nesse intervalo. A revisão de 0.0.23 precisa estar aprovada em
`main` antes do corte; depois dos testes hospedados, publique Pages e Android
manualmente para o mesmo SHA já validado.

Confirme o manifesto por acesso público restrito:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
npm.cmd run deployment:verify-hosted
```

Esse verificador não usa chave administrativa. Ele comprova a revisão, a versão
e as capacidades que o próximo artefato exigirá.

## Publicação do site

O fluxo `.github/workflows/pages.yml` recebe somente uma revisão de `main` já
aprovada por `validacao.yml`. Essa validação anterior executa testes, análise
estática, contrato de Curso, navegador, Supabase local e Android para o mesmo
SHA. O fluxo de publicação então:

1. confirma a prova da validação quando o acionamento é manual;
2. consulta o manifesto hospedado;
3. gera `.pages` com a configuração pública;
4. procura segredos, configuração inválida e conteúdo operacional indevido;
5. valida o exemplo público;
6. envia o artefato ao GitHub Pages;
7. abre o endereço publicado e verifica recursos, tipos, política de conteúdo e OAuth.

Para reproduzir o artefato localmente:

```powershell
npm.cmd run pages:build
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 `
  -Target Pages `
  -RequireRuntimeConfig
```

Hospedagem estática própria recebe o conteúdo de `.pages`, não a pasta que o
contém. O servidor deve preservar caminhos, tipos MIME e HTTPS. Depois do
envio:

```powershell
npm.cmd run deployment:verify-site -- --url https://<endereco-publicado>/
```

## Publicação do Android

`package.json` e `android/app/build.gradle.kts` precisam declarar `0.0.25`. O
`versionCode` desta entrega é 171. O APK usa a mesma URL e chave pública do
site.

Uma compilação local de depuração usa:

```powershell
npm.cmd run android:debug
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Android
```

O fluxo `.github/workflows/android-release.yml` acompanha uma validação bem
sucedida da ponta corrente de `main`. Ele confirma versão, estado da tag e da
Release, configuração pública e identidade histórica de assinatura; repete
testes e análise estática; produz o APK assinado; verifica o certificado; e cria
a GitHub Release `v0.0.25` com `AraLearn-0.0.25.apk`.

Se `main` avançar durante a compilação, o fluxo não publica a revisão superada.
Tag sem Release, Release parcial, rascunho, alvo divergente ou APK ausente
interrompem a publicação. Uma Release já completa para a mesma revisão e com o
APK esperado é aceita sem repetir o envio depois que o arquivo publicado passa
pela mesma verificação de identidade, certificado e runtime.

## Ordem de integração

Para uma entrega que muda o contrato remoto, a sequência segura é:

1. concluir revisão de código, dados e documentação;
2. executar validação local completa e inspeção visual;
3. preparar e verificar a migração de dados, quando necessário;
4. integrar a revisão validada em `main` e enviá-la enquanto o backend anterior
   ainda funciona;
5. aguardar `Validar repositório` aprovar o SHA exato de `main`;
6. cancelar os fluxos automáticos de Pages e Android iniciados por essa
   validação, ou confirmar que eles terminaram sem publicar porque o verificador
   hospedado ainda encontrou o manifesto anterior;
7. promover o esquema transacional e as duas funções correntes;
8. comprovar o manifesto e os testes hospedados;
9. disparar manualmente Pages e Android para o mesmo SHA já aprovado;
10. verificar o endereço publicado, a Release e o APK baixado;
11. retirar as funções substituídas ainda implantadas e repetir a verificação
    hospedada.

O site só é promovido depois de os serviços remotos aceitarem seu manifesto. A
Release Android só parte de uma validação verde da ponta corrente de `main`.
Antes do corte, os dois fluxos de publicação falham de forma fechada na
verificação hospedada; depois do corte, a execução manual reutiliza a validação
já aprovada para o mesmo SHA. Essa ordem reduz a indisponibilidade do cliente
conectado `0.0.22` ao intervalo entre o corte e a publicação efetiva.

Depois que o novo Pages estiver acessível e aprovado, liste as funções
hospedadas e retire apenas pontos de entrada sem consumidor na revisão
corrente. Repita o verificador do site, do manifesto e do MCP depois da
retirada. Se o site novo não puder ser confirmado, não inicie essa etapa.

Na promoção da 0.0.24, a etapa 7 incluiu obrigatoriamente
`20260820224424_canonical_study_unit_composition_edits.sql` e a implantação da
API de Cursos que expõe a rota contextual. O verificador hospedado precisa
observar `contextual-study-unit-edit-v1` antes de qualquer cliente correspondente
ser publicado. A versão pública do recurso e das seis ferramentas MCP pode continuar
0.0.23 porque sua forma não mudou.

## Recuperação

Uma falha antes do `db push` não altera o banco. Falha na migração transacional
reverte o conjunto. Uma Edge Function nova pode ser reimplantada a partir da
revisão validada. Os pontos de entrada substituídos permanecem fisicamente até
os testes da nova versão, mas não constituem reversão funcional depois do corte
do esquema. Recuperar a versão anterior exige restaurar a cópia verificada do
banco e do Storage como uma única operação coordenada.

GitHub Pages conserva o artefato associado ao fluxo anterior. Uma correção é
publicada por nova revisão validada, sem reescrever a revisão distribuída. A
Release Android usa tag e certificado históricos; um APK incorreto exige nova
versão e novo `versionCode`.

Remoção física de tabelas ou buckets substituídos segue o plano em
`scripts/courseCutover/prepareLegacyCleanup.mjs`. Cópia verificada, ensaio de
restauração e token ligado ao inventário são condições da execução. Incerteza
nessa etapa bloqueia somente a remoção destrutiva, não a publicação já segura
do restante.

## Estado de conclusão da entrega 0.0.23

| Critério | Evidência de aprovação |
|---|---|
| código e contratos | `npm test`, análise estática e `validate:course-runtime` sem falha |
| banco local | recriação completa, inventário, análise, concorrência e testes de funcionamento aprovados |
| interface | testes no navegador e inspeção real em celular e computador |
| artefatos | verificadores de Pages e Android sem segredo ou configuração divergente |
| banco hospedado | aprovado: migrações em paridade, oito Cursos, 5.056 entidades e manifesto `20260820101500` |
| funções hospedadas | aprovado: CORS da API e OAuth MCP |
| site | aprovado: Pages 0.0.23 e 122 recursos publicados verificados |
| Android | aprovado: validação verde, certificado esperado e publicação `v0.0.23` com APK |
| limpeza destrutiva | isolada: inventário, cópia anterior e restauração comprovados; remoção física não executada |

## Estado da entrega 0.0.24

| Critério | Estado corrente |
|---|---|
| esquema e API | aprovados: `20260820224424`, API de Cursos revisão 5 e MCP revisão 120 hospedados e verificados antes dos clientes |
| clientes | site e Android 0.0.24 publicados pelos canais oficiais a partir da mesma revisão validada |
| interface | limite de 430 px, quatro grupos progressivos, edição manual e assistência por API possuem cobertura automatizada e integram os artefatos publicados; a descoberta humana continua pendente |
| relay da assistência | duas passagens HTTP locais aprovadas, a mais recente 1/1 em 14,2 s; a compilação Android de release e os 28/28 testes de implantação passaram, com ponte nativa presente no APK e ausente no Pages, sem relaxar `MIXED_CONTENT_NEVER_ALLOW`; instalação do APK, prova em dispositivo real e teste de acesso à rede local no Pages permanecem pendentes |
| ChatGPT | a versão publicada ainda precisa repetir materialização, retorno ao AraLearn, recurso visual e medidas disponíveis no cliente conectado |
| aceitação humana | pendente conforme o roteiro por descoberta de tarefas; nomes de áreas não são ensinados previamente |

## Estado da entrega 0.0.25

| Critério | Estado da release |
|---|---|
| escopo remoto | sem alteração: manifesto `20260820224424`, API de Cursos revisão 5 e MCP revisão 120 |
| versões de cliente | npm e Android `0.0.25`; Android `versionCode` 171 |
| runtime | `npm test`: 990 aprovações e nove verificações condicionais, 999 no total |
| navegador | Playwright: 111 aprovações e dois casos condicionais, 113 no total |
| entrada de Estudo | um combobox, uma prévia rica, **Começar**, **Continuar** e **Retomar**, disponibilidade local comprovada, revogação com fallback e nenhum identificador técnico visível |
| matriz visual | oito capturas em 360, 390, 430 e 1280 px, nos temas claro e escuro; shell de até 430 px centralizado e sem overflow global |
| teclado e divulgação progressiva | **Rever** recebe foco, abre e fecha por `Enter` e atualiza a orientação do indicador |
| pós-publicação | confrontar o Pages e o APK com o SHA validado e repetir a entrada de Estudo no Chrome real |
