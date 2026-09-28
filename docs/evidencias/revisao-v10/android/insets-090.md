# Área segura da janela Android — 0.0.90

Na preparação da versão 0.0.89/235, a execução [36362395756, tentativa 1](https://github.com/fabio-ara/AraLearn/actions/runs/36362395756) falhou ao abrir Aparência depois de tocar Configurações. Os pixels de `clean-initial.png` e `failure.png` foram inspecionados: o cabeçalho ocupava a faixa da barra de status. O XML localizava Configurações em `[939,23][1057,144]`, com o centro na região do sistema. São capturas anteriores à correção; o par transitório PNG/XML da versão 0.0.88 não sustenta comparação visual contemporânea.

A janela usava `setDecorFitsSystemWindows(false)`, sem aplicar os espaços reservados pelo sistema no contêiner nativo. O CSS dependia de `env(safe-area-inset-*)`. A [documentação Android sobre insets em WebViews](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets?hl=en) descreve suporte desses valores restrito a tela inteira no M136 e ampliado às demais WebViews no M144, além do tratamento recomendado no contêiner.

A correção acrescenta 25 linhas em `MainActivity.java` e `activity_main.xml`. O `FrameLayout` existente recebe padding absoluto de `systemBars | displayCutout` a cada atualização, sem acumular deslocamentos. A moldura escura conserva ícones claros. O retorno usa `WindowInsetsCompat.Builder` e zera somente os tipos já aplicados, evitando padding duplicado na WebView. Não usa `CONSUMED`; preserva notificações do teclado e `adjustResize`. Não há coordenadas fixas nem alteração do gate nativo.

## Evidência e limites

- Nove testes focais existentes de segurança do runtime Android e área segura passaram. Verificam contratos de fonte; não comprovam a interface nativa.
- Build focal isolado e lint vital passaram. O APK experimental 0.0.89/235 manteve os 200 arquivos web do APK de referência, conferidos pelo verificador oficial. Assinatura v2 e certificado histórico foram verificados. SHA-256 experimental: `e312332b7e725835c49155ca21d0dc4902bf6c1c5b794d2fd920a1300660bd99`.
- A [CI da candidata 0.0.89](https://github.com/fabio-ara/AraLearn/actions/runs/36360515040) permanece uma prova anterior, distinta da preparação nativa que falhou e desta correção.

Não havia emulador, imagem Android ou dispositivo conectado no ambiente local. Não há captura nativa pós-correção; temas, rotação, teclado, instalação limpa e atualização permanecem sem observação após o patch. O APK experimental não é artefato oficial da versão 0.0.90/236. A candidata terá sua própria validação; a prova nativa obrigatória ocorrerá pelo gate existente na fase de preparação, antes de qualquer publicação. Os registros anteriores permanecem preservados. Não se declara validação humana nem prova nativa aprovada.
