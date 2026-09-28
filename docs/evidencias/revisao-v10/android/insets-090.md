# Área segura da janela Android — 0.0.90

Na preparação da versão 0.0.89/235, a execução [36362395756, tentativa 1](https://github.com/fabio-ara/AraLearn/actions/runs/36362395756) falhou ao abrir Aparência depois de tocar Configurações. Os pixels de `clean-initial.png` e `failure.png` foram inspecionados: o cabeçalho ocupava a faixa da barra de status. O XML localizava Configurações em `[939,23][1057,144]`, com o centro na região do sistema. São capturas anteriores à correção; o par transitório PNG/XML da versão 0.0.88 não sustenta comparação visual contemporânea.

A janela usava `setDecorFitsSystemWindows(false)`, sem aplicar os espaços reservados pelo sistema no contêiner nativo. O CSS dependia de `env(safe-area-inset-*)`. A [documentação Android sobre insets em WebViews](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets?hl=en) descreve suporte desses valores restrito a tela inteira no M136 e ampliado às demais WebViews no M144, além do tratamento recomendado no contêiner.

A correção acrescenta 25 linhas em `MainActivity.java` e `activity_main.xml`. O `FrameLayout` existente recebe padding absoluto de `systemBars | displayCutout` a cada atualização, sem acumular deslocamentos. A moldura escura conserva ícones claros. O retorno usa `WindowInsetsCompat.Builder` e zera somente os tipos já aplicados, evitando padding duplicado na WebView. Não usa `CONSUMED`; preserva notificações do teclado e `adjustResize`. Não há coordenadas fixas nem alteração do gate nativo.

## Provas locais anteriores à preparação oficial

- Nove testes focais existentes de segurança do runtime Android e área segura passaram. Verificam contratos de fonte; não comprovam a interface nativa.
- Build focal isolado e lint vital passaram. O APK experimental 0.0.89/235 manteve os 200 arquivos web do APK de referência, conferidos pelo verificador oficial. Assinatura v2 e certificado histórico foram verificados. SHA-256 experimental: `e312332b7e725835c49155ca21d0dc4902bf6c1c5b794d2fd920a1300660bd99`.
- A [CI da candidata 0.0.89](https://github.com/fabio-ara/AraLearn/actions/runs/36360515040) permanece uma prova anterior, distinta da preparação nativa que falhou e desta correção.

Não havia emulador, imagem Android ou dispositivo conectado no ambiente local. Naquele marco, não havia captura nativa pós-correção: os nove testes e o APK experimental não constituíam prova visual ou artefato oficial 0.0.90/236. O limite local foi superado pela execução oficial descrita a seguir, sem instalar infraestrutura local nem substituir o gate.

## Prova nativa pós-correção

A [CI 36365593878/1](https://github.com/fabio-ara/AraLearn/actions/runs/36365593878) aprovou os cinco jobs da candidata `694a755af9cefeb1bddf75c039356bd017a1da3a`. O merge `8ca514d51bdfa9d4bbabecbe35808525f030f036` conserva a árvore `616ea83bb2eb67c0861cfff7ca2bea08cfcf233b`. A [preparação 36367838390/1](https://github.com/fabio-ara/AraLearn/actions/runs/36367838390) aprovou o APK assinado e o job nativo 108758392816. A prova ocorreu no emulador Android 36 da CI, com KVM e rede desligada após a hidratação.

O gate fez instalação limpa 236, upgrade da base pública 0.0.67/213 para 0.0.90/236 e reinstalação 236. Conservou UID, certificado e preferência escura escolhida na base, sem escolher novamente o tema na candidata durante o upgrade. O APK oficial tem SHA-256 `609d97dc05a5b66dee86069dfaeb550e72f9b0549989e4cea65a0dffebd4e1a9`; sua assinatura v2 e o certificado histórico foram conferidos. Dezesseis arquivos PNG/XML foram verificados por tamanho e SHA-256; o `proof.json` tem hash `cc26ecee0c5f773148759bf188e368db3b6a96bd00d5533333804ac693068c94`.

Foram inspecionados os pixels das três capturas abaixo, copiadas sem edição. Na abertura limpa, cabeçalho e Configurações ficam abaixo da barra de status; Aparência aparece aberta após a seleção do tema e após o upgrade. O XML contemporâneo situa Configurações em `[939,159][1057,280]`, diferente de `[939,23][1057,144]` na falha 089. A interação foi executada pelo gate; a revisão visual foi estática e autônoma.

| Captura | Evidência observada | SHA-256 |
| --- | --- | --- |
| [Abertura limpa](imagens/clean-initial.png) | Cabeçalho e controle Configurações fora da barra de status, tema inicial claro | `0d107f298045c69c430de4080870a34a19a74754fd1f2718144834e1a5dfc810` |
| [Aparência após seleção](imagens/clean-selected.png) | Painel aberto, tema escuro selecionado e ícones do sistema claros | `b8e79119efe3adaadc535dbfbd4387ae31b04feadad891a46e6bf96b1e9c517d` |
| [Aparência após upgrade](imagens/upgraded.png) | Preferência escura preservada, painel acessível | `91de9681ed58859c2b3a2f6d89cc5efd463ccffc3dd66a1408ad2760d12defb1` |

## Limites atuais

**IME e rotação não foram observados.** Preservar suas notificações no código não equivale a testar sua apresentação. As capturas não provam o Estudo do curso novo nem acessibilidade integral. A [publicação 090](../autoria/publicacao-090.md) reutilizou os mesmos bytes e manteve a release em rascunho. O APK experimental 235, a preparação 089 falha e suas capturas continuam como evidência histórica distinta. Nenhum resultado constitui validação humana.
