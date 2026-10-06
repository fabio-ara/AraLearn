# Revisão v10 — encerramento da versão 0.0.100

Este relatório conserva o resultado da entrega encerrada em 03/10/2026, com a
[versão 0.0.100](https://github.com/fabio-ara/AraLearn/releases/tag/v0.0.100)
publicada. Site, backend e aplicativo Android passaram pela mesma cadeia de
verificações para publicação. A descrição corrente do produto está no
[mapa da documentação](README.md).

| Artefato no encerramento | Identificação |
| --- | --- |
| Código do produto | Commit [`2d19918`](https://github.com/fabio-ara/AraLearn/commit/2d19918e9010bbcbbdddf419cd8745cccad2b28b) |
| `main` no fechamento documental | Commit [`3d2de2b4`](https://github.com/fabio-ara/AraLearn/commit/3d2de2b4571602388524257a484dc9040078eb7d) |
| Site | [AraLearn](https://fabio-ara.github.io/AraLearn/) |
| Arquivo instalável Android (APK) | SHA-256 `06acea1a354568d442b32597781567fbf167842dc0820e4f7c07dd7113d78346` |

## Cobertura e limite de evidência

- Cobertura por cortes comprovados: **16/17 itens** aceitos (10/11 produções e 6/6 bibliografias), **24/25 microssequências** e **33/34 famílias**, sem redução de denominador.
- A entrega encerrou com limite de evidência na **MS22**, família `audio`: a produção e a escuta real verificável permaneceram sem registro, deixando essa capacidade pendente de demonstração na revisão.

## Mudanças úteis publicadas pela revisão

- A inspeção pedagógica considera a posição curricular das unidades: reordenar ensino e prática desatualiza apenas os pareceres relacionados, e a conferência da Explicação confronta as práticas, os retornos e os parâmetros das unidades de sua base (0.0.99).
- Uma falha interna de credencial ou de arquivos (401) deixa de encerrar a sessão: o estado local é preservado e a indisponibilidade é informada como temporária (0.0.100).
- O estado físico de uma reação — (g), (s) ou (l) — permanece na mesma linha da fórmula na Explicação, sem quebrar em várias linhas (0.0.100).
- Dados guardados localmente por versões anteriores migram para o caminho corrente na primeira abertura, preservando conteúdo, revisões históricas e observações pendentes; uma observação que não caiba na fila corrente permanece recuperável e exportável como rascunho (0.0.100).
- Os caminhos executáveis das versões substituídas do legado foram removidos — a aceitação da exportação v1, a releitura da chave antiga da fila de observações e a conversão do parecer agregado no leitor — com migração única do armazenamento local. A migração de conteúdo e a leitura do parecer histórico de cinco dimensões permanecem por integridade.

## Legado, encerramento e histórico

- O curso legado passou por cópia de segurança, restauração real e conferência de atualização antes da exclusão. Os arquivos do Storage foram recuperados por cópia do sistema de arquivos; o ensaio ficou limitado a esse caminho de restauração.
- Os rascunhos 0.0.84 a 0.0.99 foram removidos após nova conferência dos arquivos, metadados e manifesto. No encerramento, a 0.0.83 permanecia publicada e as tags Git das versões publicadas estavam intactas.
- A [#404](https://github.com/fabio-ara/AraLearn/issues/404) foi encerrada: jornada residual de autoria por Actions aceita, Actions suportada no catálogo 11.1.0 (30 operações) e fixture descartável excluída pelo fluxo público de preparar/confirmar. O diagnóstico de terminal foi encerrado como falso positivo, sem defeito do produto a corrigir.
- A [PR425](https://github.com/fabio-ara/AraLearn/pull/425) corrigiu a autenticação interna do perfil e a [PR426](https://github.com/fabio-ara/AraLearn/pull/426) integrou o relatório final desta revisão. As revisões intermediárias 0.0.85 a 0.0.99 ficam no histórico do Git e no [registro de mudanças](../CHANGELOG.md).
