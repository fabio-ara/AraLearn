# Aplicativo Android do AraLearn

Este diretório contém o invólucro Android do AraLearn. Ele não reimplementa o
produto em Java ou Kotlin: uma `WebView`, componente nativo que exibe uma
aplicação web dentro do aplicativo, executa o mesmo código JavaScript do site.
Essa escolha mantém autenticação, estudo, persistência e
sincronização sob as mesmas regras nos dois ambientes e reduz o risco de duas
implementações divergirem.

## Como o aplicativo é composto

O APK reúne duas camadas:

- a camada nativa abre a `WebView`, recebe o retorno da autenticação, aplica as
  restrições de navegação e hospeda os arquivos locais;
- o runtime web executa a interface, acessa o Supabase — serviço de banco,
  autenticação e funções remotas —, guarda a réplica no IndexedDB — banco local
  oferecido pelo navegador — e sincroniza alterações pendentes.

Os arquivos são servidos pela origem interna
`https://appassets.androidplatform.net`. Uma origem HTTPS estável permite que a
sessão e o IndexedDB sobrevivam ao fechamento do aplicativo sem liberar acesso
universal a arquivos do aparelho.

O APK não leva cursos nem um catálogo operacional embutidos. A pessoa precisa
autenticar-se e replicar um curso ao menos uma vez. Depois disso, o conteúdo já
replicado e o estado de estudo continuam disponíveis sem conexão; alterações
locais aguardam na fila de sincronização até a rede voltar.

## Limites de segurança

O aplicativo solicita somente a permissão Android `INTERNET`. A camada nativa:

- habilita JavaScript, armazenamento DOM e banco da `WebView`;
- bloqueia acesso a `file://` e acesso universal entre origens;
- rejeita conteúdo misto em release;
- abre links HTTP(S), telefone e e-mail em aplicativos externos;
- rejeita esquemas de navegação não autorizados e navegação externa em
  subframes;
- desabilita o backup Android, evitando exportar sessão e réplica local.

Somente a URL pública do projeto Supabase e sua chave publicável entram no
artefato. Chaves administrativas, senhas do banco e chaves `service_role` não
pertencem ao APK; o processo de montagem rejeita uma chave com aparência de
segredo administrativo.

## Pré-requisitos

Antes de gerar um APK, instale:

- Node.js 22 ou mais recente;
- JDK 17;
- Android SDK com API 36;
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

O build escreve essas duas informações em `runtime-config.js`. Ao iniciar, o
aplicativo consegue abrir a autenticação e acessar o serviço configurado.

### Uso local e offline

No emulador Android, `http://10.0.2.2:54321` alcança o Supabase executado na
máquina hospedeira. HTTP é aceito apenas em build de depuração e somente para
`10.0.2.2`, `127.0.0.1` ou `localhost`. Em aparelho físico, use um endereço
HTTPS acessível ao aparelho. O build de release exige HTTPS.

Sem configuração pública, o APK de depuração ainda pode ser montado para
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
`:app:assembleDebug --no-daemon`, depois de preparar o runtime web.

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

## Gerar um APK de release

Um APK de release precisa de configuração HTTPS e assinatura. A assinatura
prova que uma atualização pertence ao mesmo aplicativo instalado; mudar a
chave impede a atualização direta de instalações anteriores.

### Pré-condição

Escolha uma destas formas de assinatura:

- informar uma keystore própria pelas quatro variáveis abaixo; ou
- reutilizar a keystore histórica `~/.android/debug.keystore`, quando ela já
  existir e nenhuma configuração explícita válida tiver sido fornecida.

Para uma keystore própria:

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
tenta recuperá-las do runtime publicado em
`https://fabio-ara.github.io/AraLearn/runtime-config.js`. Uma configuração
explícita válida sempre prevalece.

### Resultado esperado

```text
android/app/build/outputs/apk/release/app-release.apk
```

### Recuperação

Se o build informar ausência de assinatura, confira o caminho da keystore, o
alias e as quatro variáveis. Se recusar a URL, use HTTPS. Se recusar a chave,
substitua-a pela chave publicável do projeto; nunca contorne a verificação com
uma credencial administrativa.

## Autenticação móvel

O retorno `aralearn://auth/callback` transporta somente o código curto do fluxo
PKCE. O verificador necessário para trocar esse código permanece no IndexedDB
do mesmo dispositivo. A Activity conserva a consulta recebida e a encaminha ao
runtime interno; fragmentos com bearer token ou refresh token são rejeitados.

O esquema personalizado é adequado ao ambiente atual, mas outro aplicativo
pode registrar o mesmo esquema e interromper o retorno. Uma distribuição em
larga escala deve preferir um Android App Link HTTPS verificado em domínio
controlado, com o redirect correspondente configurado no Supabase.

## Verificar o artefato

### Pré-condição

Gere o APK de depuração ou release.

### Passos

```powershell
$apk = "android/app/build/outputs/apk/debug/app-debug.apk"
tar -tf $apk | Select-String -Pattern "embedded-courses|seed-course|catalog.*json|fixture"
```

Execute também:

```powershell
node --test tests/runtime/android-relational-cutover.test.js
```

### Resultado esperado

A pesquisa dentro do APK não produz resultado. O teste confirma manifesto,
restrições da `WebView`, ausência de SDK Supabase nativo e regras do staging.

## Roteiro de teste manual

1. Instale o APK e confirme que a autenticação é a única entrada sem sessão.
2. Entre em uma conta, feche o aplicativo e confirme a restauração da sessão.
3. Selecione um curso remoto e abra ao menos um card.
4. Desligue a rede, conclua um card e registre um comentário.
5. Feche e reabra o aplicativo ainda offline; confirme curso e estado local.
6. Restaure a rede e confirme o envio das operações pendentes.
7. Solicite recuperação de senha e confirme o retorno pelo deep link móvel.

O recebimento de JSON pelo menu **Compartilhar** ainda não constitui um fluxo
completo de importação. O estado e os limites dessa integração estão descritos
em [Compartilhamento de JSON no Android](../docs/integrations/android-share-import.md).

## Diagnóstico rápido

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| O build termina, mas o aplicativo não autentica | Configuração pública ausente ou incorreta | Configure URL e chave publicável e gere o APK novamente. |
| O emulador não alcança `localhost` | `localhost` aponta para o próprio emulador | Use `http://10.0.2.2:54321` no build de depuração. |
| A instalação recusa a atualização | O APK foi assinado com outra chave | Assine com a mesma keystore da instalação existente ou desinstale conscientemente a versão anterior. |
| O retorno de login abre outro aplicativo ou não volta | Conflito no esquema `aralearn://` | Tente novamente; para distribuição controlada, migre para App Link HTTPS verificado. |
| Um curso não abre offline | O curso ainda não havia sido replicado | Reconecte, abra o curso uma vez e aguarde a sincronização. |
