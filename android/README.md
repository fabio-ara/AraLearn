# Android do AraLearn

Este módulo empacota a aplicação web do AraLearn em um `WebView`, preservando a arquitetura central do produto em ambiente Android.

O wrapper não reescreve a lógica do app. Ele entrega no dispositivo móvel o mesmo desenho do runtime web:

- projeto local-first;
- top-down até microssequências;
- bottom-up para materialização e correção local;
- persistência do documento e do progresso;
- importação e exportação de arquivos;
- possibilidade de integração com provider local quando o ambiente permitir.

## O que o wrapper entrega

O APK existe para levar ao Android o mesmo fluxo do AraLearn:

- estudar a trilha planejada;
- abrir microssequências;
- gerar, corrigir e ampliar cards;
- criar branch local de aprendizagem e voltar à trilha principal;
- manter o projeto persistido no dispositivo.

O wrapper não substitui o contrato do domínio. Ele apenas hospeda a aplicação dentro do ambiente Android.

## Pré-requisitos para build local

- `JDK 17`
- Android SDK

## Build de depuração

Na raiz do projeto:

```powershell
npm run android:debug
```

Alternativa direta:

```powershell
cd android
.\gradlew.bat :app:assembleDebug --no-daemon
```

Saída esperada:

- `android/app/build/outputs/apk/debug/app-debug.apk`

## Build de release

Na raiz do projeto:

```powershell
npm run android:release
```

O comando agora assina o APK de release automaticamente.

Se estas variáveis estiverem definidas, o build usa o keystore informado:

- `ARALEARN_ANDROID_KEYSTORE_PATH`
- `ARALEARN_ANDROID_KEYSTORE_PASSWORD`
- `ARALEARN_ANDROID_KEY_ALIAS`
- `ARALEARN_ANDROID_KEY_PASSWORD`

Sem essas variáveis, o build local usa `~/.android/debug.keystore` como fallback para gerar um APK assinado e instalável.

Alternativa direta:

```powershell
cd android
.\gradlew.bat :app:assembleRelease --no-daemon
```

Saída esperada:

- `android/app/build/outputs/apk/release/app-release.apk`

Se o ambiente de build gerar variante diferente de nome, o artefato ficará na mesma pasta de saída de release.

## Persistência e arquivos

O app mantém um espaço de trabalho persistente dentro do `WebView`. Importação e exportação usam seletores nativos do Android. O compartilhamento de arquivos permite levar fontes para o fluxo estrutural do produto.

## Integração local

O wrapper libera o necessário para tráfego HTTP local quando o usuário quiser operar com provider local via bridge, inclusive em cenários de CLI local no Android.

## Layout e teclado

O módulo preserva o comportamento de insets e teclado necessário para que:

- a árvore do curso;
- a tela de estudo;
- a aba de edição;
- os painéis de feedback e intervenção

funcionem corretamente dentro do `WebView`.
