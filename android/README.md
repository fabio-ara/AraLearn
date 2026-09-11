# Aplicativo Android do AraLearn

Site e Android compartilham uma única aplicação web. No Android, ela é empacotada numa
[`WebView`](https://developer.android.com/develop/ui/views/layout/webapps/webview),
componente nativo que exibe e executa o mesmo código JavaScript do site. O código comum
mantém as regras de autenticação, estudo, persistência e sincronização alinhadas nos
dois ambientes.

## Como o aplicativo é composto

O APK, arquivo usado para instalar o aplicativo, reúne duas camadas:

- a camada nativa abre a `WebView`, recebe o retorno da autenticação, aplica as
  restrições de navegação, hospeda os arquivos locais e abre o seletor do
  sistema para salvar exportações;
- a aplicação web executa a interface e acessa o
  [Supabase](../docs/supabase.md), serviço que fornece banco, autenticação e funções
  remotas. Sua cópia de estudo fica no IndexedDB, armazenamento estruturado oferecido
  pela WebView, e as filas sincronizam estado pessoal e observações pendentes.

Os arquivos são servidos por
[`WebViewAssetLoader`](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader)
na origem interna `https://appassets.androidplatform.net`. Uma origem HTTPS estável
permite que a sessão e o IndexedDB sobrevivam ao fechamento do aplicativo sem liberar
acesso universal a arquivos do aparelho.

O APK contém a aplicação, e o serviço remoto fornece o catálogo e o conteúdo dos
cursos. Depois que um curso é carregado, sua réplica e o estado de estudo da conta
podem ser usados sem conexão. Progresso, itens
para rever e observações possuem filas próprias. No modo
automático, elas voltam a ser enviadas quando o serviço fica disponível; no manual,
aguardam a ação de sincronizar.

PDFs e áudios são autorizados a cada abertura e não entram nessa réplica persistente.
Alterações de autoria também exigem conexão. Visitantes podem abrir cursos públicos;
uma conta acrescenta seu estado pessoal e os acessos recebidos.

## Limites de segurança

O aplicativo solicita somente a permissão Android `INTERNET`. A camada nativa:

- habilita JavaScript, o armazenamento DOM e o banco local da `WebView`;
- bloqueia acesso a `file://` e acesso universal entre origens;
- rejeita conteúdo misto na versão de publicação;
- abre links HTTP(S), telefone e e-mail em aplicativos externos;
- rejeita esquemas de navegação não autorizados e navegação externa em
  subframes;
- desabilita o backup Android, evitando exportar sessão e réplica local.

A [configuração de segurança de rede do
Android](https://developer.android.com/privacy-and-security/security-config) restringe
conexões HTTP sem criptografia à versão de depuração e aos destinos locais previstos. A
ponte de exportação aceita somente texto CSV ou JSON, com nome de arquivo restrito e até
32 MiB em UTF-8, o mesmo limite do artefato de curso exportado pela API e pelo
navegador. O destino é escolhido no seletor de documentos do Android, sem conceder ao
aplicativo acesso geral ao armazenamento. Enquanto o seletor está aberto, o texto
permanece em arquivo temporário privado e pode ser retomado se o sistema recriar o
processo. O arquivo temporário é apagado ao cancelar ou concluir a gravação. Mudanças
usuais de orientação preservam também o seletor de PDF ou avatar já aberto.

Somente a URL pública do projeto Supabase e sua chave publicável entram no artefato.
Chaves administrativas, senhas do banco e chaves `service_role` não pertencem ao APK; o
processo de montagem rejeita uma chave com aparência de segredo administrativo.

## Pré-requisitos

Para gerar um APK, são necessárias as ferramentas JavaScript e os conjuntos de
desenvolvimento Java (JDK) e Android (SDK). Instale:

- [Node.js 22](https://nodejs.org/en/download) ou mais recente;
- [JDK 17](https://developer.android.com/build/jdks);
- [Android SDK com API 36](https://developer.android.com/studio/intro/update#sdk-manager);
- dependências JavaScript, por meio de `npm ci` na raiz do repositório.

O Gradle coordena a compilação e o empacotamento. Seu inicializador, Gradle Wrapper, já
está versionado. Não é necessário instalar uma versão global do Gradle.

## Configurar o serviço remoto

### Pré-condição

Tenha a URL do projeto Supabase e a chave publicável desse projeto. Essas informações
identificam um serviço público; não concedem autoridade administrativa.

### Passos

No PowerShell, na raiz do repositório:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
```

No painel do Supabase, adicione o retorno móvel a **Authentication > URL Configuration >
Redirect URLs**:

```text
aralearn://auth/callback
```

### Resultado esperado

A compilação escreve essas duas informações em `runtime-config.js`. Ao iniciar, o
aplicativo consegue abrir a autenticação e acessar o serviço configurado.

A assistência por IA usa no APK o mesmo fluxo do site: a pessoa escolhe OpenAI, Gemini
ou DeepSeek e fornece uma chave efêmera, mantida somente na memória da sessão. A chamada
segue diretamente para o provedor; a chave não é salva no dispositivo.

### Uso local e sem conexão

No emulador Android, `http://10.0.2.2:54321` alcança o Supabase executado na máquina
hospedeira. HTTP é aceito apenas na compilação de depuração e somente para `10.0.2.2`,
`127.0.0.1` ou `localhost`. Em aparelho físico, use um endereço HTTPS acessível ao
aparelho. A versão de publicação exige HTTPS.

Uma compilação de depuração sem configuração pública serve para inspecionar o
artefato. A autenticação e a consulta de cursos exigem URL e chave publicável; na
ausência delas, a compilação permanece limitada à interface empacotada.

## Gerar um APK de depuração

### Pré-condição

Conclua os pré-requisitos. Configure o Supabase se pretender testar o fluxo completo.

### Passos

Na raiz do repositório:

```powershell
npm run android:debug
```

O comando equivale a executar o Gradle Wrapper com `:app:assembleDebug --no-daemon`,
depois de preparar a aplicação web.

### Resultado esperado

O arquivo é criado em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Recuperação

Se o Gradle não localizar Java, confirme `java -version` e aponte `JAVA_HOME` para um
JDK 17. Se o Android SDK não for encontrado, configure `sdk.dir` em
`android/local.properties` ou a variável reconhecida pelo Android Gradle Plugin. Se o
APK abrir apenas a tela de configuração, confira as duas variáveis públicas e gere
novamente o artefato.

## Gerar um APK de publicação

Um APK de publicação precisa de configuração HTTPS e
[assinatura](https://developer.android.com/studio/publish/app-signing). A assinatura
prova que uma atualização pertence ao mesmo aplicativo instalado; mudar a chave impede a
atualização direta de instalações anteriores.

### Pré-condição

Escolha uma destas formas de assinatura:

- informar um arquivo de assinatura próprio pelas quatro variáveis abaixo; ou
- reutilizar o arquivo histórico `~/.android/debug.keystore`, quando ele já
  existir e nenhuma das quatro variáveis explícitas tiver sido fornecida.

Para um arquivo de assinatura próprio:

```powershell
$env:ARALEARN_ANDROID_KEYSTORE_PATH = "C:\caminho\chave.jks"
$env:ARALEARN_ANDROID_KEYSTORE_PASSWORD = "<senha>"
$env:ARALEARN_ANDROID_KEY_ALIAS = "<alias>"
$env:ARALEARN_ANDROID_KEY_PASSWORD = "<senha-da-chave>"
```

As quatro informações formam uma única configuração; não deixe apenas parte delas
preenchida.

### Passos

```powershell
npm run android:release
```

Quando a URL e a chave pública não estiverem completas no ambiente, o script tenta
recuperá-las da configuração publicada em
`https://fabio-ara.github.io/AraLearn/runtime-config.js`. Uma configuração explícita
válida sempre prevalece.

### Resultado esperado

```text
android/app/build/outputs/apk/release/app-release.apk
```

### Recuperação

Se a compilação informar ausência de assinatura, confira o caminho do arquivo, o alias e
as quatro variáveis. Se recusar a URL, use HTTPS. Se recusar a chave, substitua-a pela
chave publicável do projeto; nunca contorne a verificação com uma credencial
administrativa.

## Autenticação móvel

O retorno `aralearn://auth/callback` transporta somente um código temporário. O fluxo
[PKCE](../docs/supabase.md) vincula esse código ao dispositivo que iniciou o login por
meio de um verificador guardado no IndexedDB. A tela nativa que recebe o retorno — uma
*Activity* Android — encaminha a consulta ao aplicativo interno. Retornos que tragam
tokens de acesso ou renovação diretamente são rejeitados.

O esquema personalizado é adequado ao ambiente atual, mas outro aplicativo pode
registrar o mesmo esquema e interromper o retorno. Uma distribuição em larga escala deve
preferir um [Android App Link](https://developer.android.com/training/app-links) HTTPS
verificado em domínio controlado, com o endereço de retorno correspondente configurado
no Supabase.

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

A pesquisa dentro do APK não produz resultado. O verificador confirma manifesto,
restrições da `WebView`, ausência de SDK Supabase nativo e regras de preparação do
artefato.

## Verificação automatizada de instalação e atualização

Uma atualização precisa ser reconhecida como continuação do aplicativo instalado e
preservar suas preferências. Antes da publicação, o teste automatizado instala o APK
candidato do zero e também sobre a versão pública 0.0.67, código 213. A versão
candidata vem do manifesto aprovado e precisa avançar em relação a essa base. O teste
confere a identidade do pacote e da assinatura, as versões, a impressão digital
SHA-256 e o identificador atribuído à instalação pelo Android.

O script `scripts/androidNativeGate.py` usa um emulador descartável. O conjunto de
ferramentas Android (SDK) e suas licenças precisam estar disponíveis; o script mantém
a entrada padrão fechada e verifica que não houve alteração de licenças. A execução
Linux exige aceleração de virtualização KVM. A ausência dessa aceleração interrompe
o ensaio.

A aplicação consulta a configuração pública antes do isolamento de rede, sem conta
ou curso. As ações são localizadas pela hierarquia nativa de controles. Na candidata,
o tema fica em **Configurações → Aparência**; na versão base, em **Conta e aparência**.
O teste escolhe o tema escuro na base, encerra o processo e o reabre antes de
atualizar. A preferência precisa sobreviver à atualização e à reinstalação com `-r`,
que preserva os dados existentes, antes de qualquer nova escolha. Na instalação
limpa, a preferência é escolhida e verificada na própria candidata.

Esse ensaio verifica instalação e preferências. As jornadas com dispositivo físico,
cursos e sessão autenticada continuam separadas. A vinculação entre o APK testado,
as capturas e os artefatos publicados está no
[procedimento de implantação](../docs/implantacao.md#gerar-e-verificar-o-android).

## Roteiro de teste manual

As jornadas abaixo conferem operações conectadas e continuidade de estudo. Use um
curso descartável de teste quando for alterar dados.

1. Instale o APK e confirme a entrada como visitante e a opção explícita de login.
2. Entre em uma conta, feche o aplicativo e confirme a restauração da sessão.
3. Selecione um curso remoto e abra ao menos uma unidade de estudo.
4. Desligue a rede, responda à prática da unidade e registre uma observação.
5. Feche e reabra o aplicativo ainda sem conexão; confirme curso e estado local.
6. Restaure a rede e confirme o envio automático ou a preservação das operações
   até sincronizar manualmente, conforme a preferência da conta.
7. Solicite recuperação de senha e confirme o retorno pelo link direto móvel.
8. Na análise de autoria, exporte o curso e sua análise em JSON pelo seletor do
   Android; em **Fontes**, salve uma exportação de proveniência JSON.
9. Abra **Configurações → Conta** e **Configurações → Aparência**; confira
   perfil, saída e persistência do tema escolhido.

Cursos próprios e compartilhados chegam pelo mesmo serviço relacional usado no site;
o menu **Compartilhar** do Android fica fora desse percurso.

## Diagnóstico rápido

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| A compilação termina, mas o aplicativo não autentica | Configuração pública ausente ou incorreta | Configure URL e chave publicável e gere o APK novamente. |
| O emulador não alcança `localhost` | `localhost` aponta para o próprio emulador | Use `http://10.0.2.2:54321` na compilação de depuração. |
| A instalação recusa a atualização | O APK foi assinado com outra chave | Assine com o mesmo arquivo da instalação existente ou desinstale conscientemente a versão anterior. |
| O retorno de login abre outro aplicativo ou não volta | Conflito no esquema `aralearn://` | Tente novamente; para distribuição controlada, migre para App Link HTTPS verificado. |
| Um curso não abre sem conexão | O curso ainda não havia sido replicado | Reconecte, abra o curso uma vez e aguarde a sincronização. |
