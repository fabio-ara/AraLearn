# Android do AraLearn

O módulo Android hospeda o mesmo runtime JavaScript da aplicação web em um `WebView`. Não há uma segunda implementação nativa do domínio nem SDK Supabase para Kotlin: autenticação, catálogo, edição, progresso e sincronização passam pelos mesmos módulos JavaScript usados na web.

## Arquitetura no APK

- PostgreSQL/Supabase é a fonte canônica compartilhada.
- O IndexedDB do `WebView` mantém a réplica relacional offline, a outbox, o cursor de sincronização e os conflitos.
- A sessão do Supabase Auth é persistida nessa réplica e renovada pelo runtime JavaScript.
- Sem sessão válida, o aplicativo mostra somente a porta de autenticação.
- Depois da primeira sincronização, os cursos já replicados continuam disponíveis offline; mutações locais ficam na outbox até a conexão voltar.
- Importação e exportação do JSON AraLearn v3 continuam manuais. Um documento importado é validado e imediatamente normalizado em linhas; ele não permanece como unidade de persistência.

O APK não contém catálogo ou cursos operacionais. A listagem consulta somente metadados remotos, e a cópia de um curso oficial é criada no servidor por uma operação transacional. O staging rejeita arquivos de catálogo, fixtures, caminhos documentais legados e chaves `service_role` antes de montar o artefato.

## Configuração pública do Supabase

Defina as duas variáveis públicas no ambiente que executa o build:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:ARALEARN_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
npm run android:debug
```

Somente a URL do projeto e a publishable key entram em `runtime-config.js`. Nunca use `service_role`, senha do banco ou outro segredo administrativo nessas variáveis. O build rejeita uma chave identificada como `service_role`.

Sem essas variáveis o build de desenvolvimento ainda pode ser gerado para validação local do artefato, mas o aplicativo permanece na porta de configuração/autenticação; ele não ativa catálogo anônimo nem fallback embarcado.

Para testar o Supabase local no emulador Android, use `http://10.0.2.2:54321`. O tráfego HTTP é permitido apenas para `10.0.2.2`, `127.0.0.1` e `localhost` no build de depuração; qualquer serviço remoto deve usar HTTPS. Em aparelho físico, exponha o ambiente local por HTTPS em um endereço acessível ao aparelho. O build de release exige as duas variáveis públicas preenchidas e recusa inclusive uma URL HTTP local, evitando gerar um APK de produção que o próprio `WebView` bloquearia.

Cadastre esta URL em **Authentication > URL Configuration > Redirect URLs** no projeto Supabase:

```text
aralearn://auth/callback
```

O callback móvel atual usa um esquema customizado porque este repositório não possui um domínio HTTPS próprio associado ao aplicativo. Confirmação e recuperação usam PKCE: o deep link transporta somente um código curto, de uso único, que só pode ser trocado com o verifier criado e guardado no IndexedDB do mesmo dispositivo. Outro aplicativo ainda pode registrar o esquema e interromper o retorno, mas não consegue trocar o código interceptado por tokens. Para eliminar também esse risco de interrupção numa distribuição pública, configure um Android App Link HTTPS verificado em domínio controlado, cadastre esse redirect no Supabase e substitua o filtro `aralearn://` no manifesto.

O `MainActivity` recebe esse deep link, conserva a query com o código de confirmação ou recuperação e a entrega ao runtime em sua origem HTTPS interna. Bearer e refresh token em fragmento são rejeitados. A Activity é única durante o fluxo, evitando uma segunda instância após voltar do navegador.

## Pré-requisitos

- Node.js 22.13+ ou 24
- JDK 17
- Android SDK compatível com API 36
- dependências instaladas com `npm ci`

## Build de depuração

Na raiz do projeto:

```powershell
npm run android:debug
```

Ou diretamente:

```powershell
cd android
.\gradlew.bat :app:assembleDebug --no-daemon
```

Artefato esperado:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Build de release

Além das variáveis públicas do Supabase, configure o keystore exclusivamente pelo ambiente:

- `ARALEARN_ANDROID_KEYSTORE_PATH`
- `ARALEARN_ANDROID_KEYSTORE_PASSWORD`
- `ARALEARN_ANDROID_KEY_ALIAS`
- `ARALEARN_ANDROID_KEY_PASSWORD`

Depois execute:

```powershell
npm run android:release
```

O build interrompe a release se as quatro variáveis de assinatura estiverem incompletas ou se o keystore não existir. O APK esperado fica em `android/app/build/outputs/apk/release/app-release.apk`.

## WebView, rede e persistência

O conteúdo local é servido por `WebViewAssetLoader` na origem estável `https://appassets.androidplatform.net`. Essa origem permite que IndexedDB e sessão persistam entre aberturas sem conceder acesso universal a arquivos locais. O shell já está dentro do APK; por isso o funcionamento offline no Android não depende de Service Worker.

O wrapper:

- solicita somente a permissão de plataforma `INTERNET`;
- habilita JavaScript, DOM Storage e banco do `WebView`;
- desabilita acesso do runtime a `file://` e acesso universal entre origens;
- bloqueia mixed content em release;
- permite mixed content local apenas em build depurável;
- abre navegação HTTP(S), telefone e e-mail fora do `WebView`;
- bloqueia navegações externas em subframes e esquemas não autorizados;
- desabilita backup Android para não exportar a sessão ou a réplica local.

Importação, compartilhamento e exportação de JSON continuam usando os seletores nativos do Android. Nenhuma credencial administrativa é usada por essa ponte.

## Verificação do artefato

Depois do build, confirme que não há curso, catálogo ou segredo empacotado:

```powershell
$apk = "android/app/build/outputs/apk/debug/app-debug.apk"
tar -tf $apk | Select-String -Pattern "embedded-courses|seed-course|catalog.*json|fixture"
```

O comando não deve produzir resultados. O teste `android-relational-cutover.test.js` também verifica o manifesto, as proteções do `WebView`, a ausência de SDK Supabase nativo e as garantias do staging.

## Teste manual recomendado

1. Instale o APK e confirme que, sem sessão, somente a autenticação aparece.
2. Crie ou acesse uma conta, feche o aplicativo e confirme que a sessão foi restaurada.
3. Liste o catálogo remoto e clone um curso oficial.
4. Abra o curso, desligue a rede, altere uma entidade e conclua um card.
5. Reabra o aplicativo ainda offline e confirme a réplica local.
6. Restaure a rede e confirme o envio da outbox e o pull incremental.
7. Solicite recuperação de senha e confirme o retorno por `aralearn://auth/callback`.
