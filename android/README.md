# Aplicativo Android do AraLearn

Este diretório contém o invólucro Android do AraLearn. Ele não reimplementa o
produto em Java ou Kotlin: uma
[`WebView`](https://developer.android.com/develop/ui/views/layout/webapps/webview),
componente nativo que exibe uma aplicação web dentro do aplicativo, executa o
mesmo código JavaScript do site.
Essa escolha mantém autenticação, estudo, persistência e
sincronização sob as mesmas regras nos dois ambientes e reduz o risco de duas
implementações divergirem.

## Como o aplicativo é composto

O APK reúne duas camadas:

- a camada nativa abre a `WebView`, recebe o retorno da autenticação, aplica as
  restrições de navegação, hospeda os arquivos locais e abre o seletor do
  sistema para salvar exportações;
- a aplicação web executa a interface, acessa o Supabase, que fornece banco,
  autenticação e funções remotas, guarda a réplica no IndexedDB, o banco local
  oferecido pelo navegador, e sincroniza estado pessoal e Observações pendentes.

Os arquivos são servidos por
[`WebViewAssetLoader`](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader)
na origem interna `https://appassets.androidplatform.net`. Uma origem HTTPS estável permite que a
sessão e o IndexedDB sobrevivam ao fechamento do aplicativo sem liberar acesso
universal a arquivos do aparelho.

O APK não leva cursos nem um catálogo operacional embutidos. A pessoa precisa
autenticar-se e replicar um curso ao menos uma vez. Depois disso, o conteúdo já
replicado e o estado de estudo continuam disponíveis sem conexão. Progresso,
itens para rever e Observações usam filas próprias até a rede voltar. Alterações
de Autoria exigem conexão e não entram numa fila offline genérica.

## Limites de segurança

O aplicativo solicita somente a permissão Android `INTERNET`. A camada nativa:

- habilita JavaScript, armazenamento DOM e banco da `WebView`;
- bloqueia acesso a `file://` e acesso universal entre origens;
- rejeita conteúdo misto na versão de publicação;
- abre links HTTP(S), telefone e e-mail em aplicativos externos;
- rejeita esquemas de navegação não autorizados e navegação externa em
  subframes;
- desabilita o backup Android, evitando exportar sessão e réplica local.

A [configuração de segurança de rede do Android](https://developer.android.com/privacy-and-security/security-config)
mantém tráfego aberto restrito ao build de depuração e aos destinos locais
previstos. A ponte de exportação aceita somente texto CSV ou JSON, com nome de arquivo
restrito e até 8 MiB. O destino é escolhido no seletor de documentos do Android,
sem conceder ao aplicativo acesso geral ao armazenamento. Enquanto o seletor
está aberto, o texto permanece em arquivo temporário privado e pode ser retomado
se o sistema recriar o processo. O arquivo temporário é apagado ao cancelar ou
concluir a gravação. Mudanças usuais de orientação preservam também o seletor de
PDF ou avatar já aberto.

Somente a URL pública do projeto Supabase e sua chave publicável entram no
artefato. Chaves administrativas, senhas do banco e chaves `service_role` não
pertencem ao APK; o processo de montagem rejeita uma chave com aparência de
segredo administrativo.

## Pré-requisitos

Antes de gerar um APK, instale:

- [Node.js 22](https://nodejs.org/en/download) ou mais recente;
- [JDK 17](https://developer.android.com/build/jdks);
- [Android SDK com API 36](https://developer.android.com/studio/intro/update#sdk-manager);
- dependências JavaScript, por meio de `npm ci` na raiz do repositório.

O Gradle Wrapper já está versionado. Não é necessário instalar uma versão
global do Gradle.

## Configurar o serviço remoto

### Pré-condição

Tenha a URL do projeto Supabase e a chave publicável desse projeto. Essas
informações identificam um serviço público; não concedem autoridade
administrativa.

### Passos

No PowerShell, na raiz do repositório:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
```

No painel do Supabase, adicione o retorno móvel a **Authentication > URL
Configuration > Redirect URLs**:

```text
aralearn://auth/callback
```

### Resultado esperado

A compilação escreve essas duas informações em `runtime-config.js`. Ao iniciar, o
aplicativo consegue abrir a autenticação e acessar o serviço configurado.

A Assistência por IA usa no APK o mesmo fluxo do site: a pessoa escolhe OpenAI,
Gemini ou DeepSeek e fornece uma chave efêmera, mantida somente na memória da
sessão. O aplicativo não instala relay local nem persiste essa chave.

### Uso local e sem conexão

No emulador Android, `http://10.0.2.2:54321` alcança o Supabase executado na
máquina hospedeira. HTTP é aceito apenas na compilação de depuração e somente para
`10.0.2.2`, `127.0.0.1` ou `localhost`. Em aparelho físico, use um endereço
HTTPS acessível ao aparelho. A versão de publicação exige HTTPS.

Sem configuração pública, o APK de depuração ainda pode ser gerado para
inspeção do artefato, mas não consegue autenticar nem obter cursos. Isso não
ativa catálogo anônimo ou conteúdo embutido.

## Gerar um APK de depuração

### Pré-condição

Conclua os pré-requisitos. Configure o Supabase se pretender testar o fluxo
completo.

### Passos

Na raiz do repositório:

```powershell
npm run android:debug
```

O comando equivale a executar o Gradle Wrapper com
`:app:assembleDebug --no-daemon`, depois de preparar a aplicação web.

### Resultado esperado

O arquivo é criado em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Recuperação

Se o Gradle não localizar Java, confirme `java -version` e aponte `JAVA_HOME`
para um JDK 17. Se o Android SDK não for encontrado, configure `sdk.dir` em
`android/local.properties` ou a variável reconhecida pelo Android Gradle
Plugin. Se o APK abrir apenas a porta de configuração, confira as duas
variáveis públicas e gere novamente o artefato.

## Gerar um APK de publicação

Um APK de publicação precisa de configuração HTTPS e
[assinatura](https://developer.android.com/studio/publish/app-signing). A assinatura
prova que uma atualização pertence ao mesmo aplicativo instalado; mudar a
chave impede a atualização direta de instalações anteriores.

### Pré-condição

Escolha uma destas formas de assinatura:

- informar um arquivo de assinatura próprio pelas quatro variáveis abaixo; ou
- reutilizar o arquivo histórico `~/.android/debug.keystore`, quando ele já
  existir e nenhuma configuração explícita válida tiver sido fornecida.

Para um arquivo de assinatura próprio:

```powershell
$env:ARALEARN_ANDROID_KEYSTORE_PATH = "C:\caminho\chave.jks"
$env:ARALEARN_ANDROID_KEYSTORE_PASSWORD = "<senha>"
$env:ARALEARN_ANDROID_KEY_ALIAS = "<alias>"
$env:ARALEARN_ANDROID_KEY_PASSWORD = "<senha-da-chave>"
```

As quatro informações formam uma única configuração; não deixe apenas parte
delas preenchida.

### Passos

```powershell
npm run android:release
```

Quando a URL e a chave pública não estiverem completas no ambiente, o script
tenta recuperá-las da configuração publicada em
`https://fabio-ara.github.io/AraLearn/runtime-config.js`. Uma configuração
explícita válida sempre prevalece.

### Resultado esperado

```text
android/app/build/outputs/apk/release/app-release.apk
```

### Recuperação

Se a compilação informar ausência de assinatura, confira o caminho do arquivo, o
alias e as quatro variáveis. Se recusar a URL, use HTTPS. Se recusar a chave,
substitua-a pela chave publicável do projeto; nunca contorne a verificação com
uma credencial administrativa.

## Autenticação móvel

O retorno `aralearn://auth/callback` transporta somente o código curto do fluxo
PKCE. O verificador necessário para trocar esse código permanece no IndexedDB
do mesmo dispositivo. A Activity conserva a consulta recebida e a encaminha ao
aplicativo interno; fragmentos com token de acesso ou de renovação são rejeitados.

O esquema personalizado é adequado ao ambiente atual, mas outro aplicativo
pode registrar o mesmo esquema e interromper o retorno. Uma distribuição em
larga escala deve preferir um
[Android App Link](https://developer.android.com/training/app-links) HTTPS verificado em domínio
controlado, com o redirect correspondente configurado no Supabase.

## Verificar o artefato

### Pré-condição

Gere o APK de depuração ou publicação.

### Passos

```powershell
$apk = "android/app/build/outputs/apk/debug/app-debug.apk"
tar -tf $apk | Select-String -Pattern "embedded-courses|seed-course|catalog.*json|fixture"
```

Execute também:

```powershell
pwsh -NoProfile -File .\scripts\verifyDeploymentArtifacts.ps1 -Target Android
```

### Resultado esperado

A pesquisa dentro do APK não produz resultado. O verificador confirma
manifesto, restrições da `WebView`, ausência de SDK Supabase nativo e regras de
preparação do artefato.

## Roteiro de teste manual

1. Instale o APK e confirme que a autenticação é a única entrada sem sessão.
2. Entre em uma conta, feche o aplicativo e confirme a restauração da sessão.
3. Selecione um Curso remoto e abra ao menos uma Unidade de estudo.
4. Desligue a rede, responda à prática da Unidade e registre uma Observação.
5. Feche e reabra o aplicativo ainda sem conexão; confirme Curso e estado local.
6. Restaure a rede e confirme o envio das operações pendentes.
7. Solicite recuperação de senha e confirme o retorno pelo link direto móvel.
8. Em **Pesquisa**, salve uma exportação CSV e outra JSON pelo seletor do
   Android; em **Fontes**, salve uma exportação de proveniência JSON.

O aplicativo não importa Cursos pelo menu **Compartilhar** do Android. Cursos
próprios e compartilhados chegam pelo mesmo serviço relacional usado no site.

## Diagnóstico rápido

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| A compilação termina, mas o aplicativo não autentica | Configuração pública ausente ou incorreta | Configure URL e chave publicável e gere o APK novamente. |
| O emulador não alcança `localhost` | `localhost` aponta para o próprio emulador | Use `http://10.0.2.2:54321` na compilação de depuração. |
| A instalação recusa a atualização | O APK foi assinado com outra chave | Assine com o mesmo arquivo da instalação existente ou desinstale conscientemente a versão anterior. |
| O retorno de login abre outro aplicativo ou não volta | Conflito no esquema `aralearn://` | Tente novamente; para distribuição controlada, migre para App Link HTTPS verificado. |
| Um Curso não abre sem conexão | O Curso ainda não havia sido replicado | Reconecte, abra o Curso uma vez e aguarde a sincronização. |
