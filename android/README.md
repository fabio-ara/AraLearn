# Android do AraLearn

Este módulo empacota a aplicação web do AraLearn em um `WebView`, preservando a proposta local-first do produto em ambiente Android.

## O que o wrapper entrega

O wrapper Android existe para levar ao dispositivo móvel a mesma arquitetura central do app:

- organização pedagógica local;
- persistência no dispositivo;
- estudo e intervenção em microssequências;
- integração com arquivos do sistema;
- possibilidade de uso com provider local quando o ambiente comporta isso.

## Build local

Pré-requisitos:

- `JDK 17`
- Android SDK

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

- `app/build/outputs/apk/debug/app-debug.apk`

## Persistência e arquivos

O app mantém um espaço de trabalho persistente dentro do `WebView`. Importação e exportação usam seletores nativos do Android. O compartilhamento de arquivos permite levar fontes para o fluxo estrutural do produto.

## Integração local

O wrapper libera o necessário para tráfego HTTP local quando o usuário quiser operar com provider local via bridge, inclusive em cenários de `Codex CLI` no Android.

## Observação de layout

O módulo preserva o comportamento de insets e teclado necessário para que a tela de estudo, a navegação e os painéis do AraLearn funcionem corretamente no `WebView`.
