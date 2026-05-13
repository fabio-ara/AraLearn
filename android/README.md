# Android do AraLearn

Este wrapper empacota a base web do AraLearn em um `WebView`.

## O que entra no APK

- `public/`
- `src/`

Durante o build, esses arquivos são copiados para os assets gerados do módulo Android.

## Build local

1. Garanta `JDK 17` e Android SDK instalados.
2. Na raiz do repositório, rode `npm run android:debug`.

Alternativa direta:

```powershell
cd android
.\gradlew.bat :app:assembleDebug --no-daemon
```

Saída esperada:

- `app/build/outputs/apk/debug/app-debug.apk`

## Publicação manual

- valide a raiz do projeto antes de anexar um APK em release manual;
- use o APK gerado em `app/build/outputs/apk/debug/app-debug.apk` como artefato base para publicação;
- se a versão já existir e o problema estiver apenas no binário anexado, substitua o arquivo existente em vez de abrir uma nova release para o mesmo escopo.

## Insets, teclado e `WebView`

- em `WebView` moderno, o layout web deve preferir `safe-area-inset-*` para barras do sistema e confiar no redimensionamento nativo da viewport para o teclado;
- nesse caminho, o wrapper não deve espelhar `systemBars` e `IME` no CSS do app;
- o corte conservador adotado no projeto é Chromium `140`: abaixo disso, o caminho de compatibilidade aplica padding nativo na `WebView` e consome os insets antes de entregá-los ao conteúdo;
- a tela de lição não deve criar vão externo extra acima da barra superior nem abaixo do rodapé de ações; o espaçamento visível entre topo, card e rodapé pertence ao layout interno da lição.

Referências:

- Android Developers: <https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets>
- Chromium WebView: <https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/insets.md>

## Persistência e arquivos

- o app mantém um espaço de trabalho persistente dentro do `WebView`;
- importação de pacote usa o seletor nativo de arquivos do Android;
- exportação de pacote usa o seletor nativo de salvamento;
- não existe vínculo contínuo com arquivo externo.

## HTTP local para Codex CLI no Android

- o wrapper atual libera tráfego HTTP local para `127.0.0.1` e `localhost` via `network_security_config`;
- a `WebView` também foi configurada para tolerar mixed content necessário ao bridge local do Codex CLI;
- no Android, o setup operacional desse provider usa Termux e o endpoint padrão `http://127.0.0.1:4183`.
