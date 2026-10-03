# Revisão v10 — relatório de estado final (0.0.100)

A revisão v10 encerrou a entrega em 03/10/2026 com a release [v0.0.100](https://github.com/fabio-ara/AraLearn/releases/tag/v0.0.100) publicada: site, backend e APK promovidos pela mesma cadeia de gates. Commit de produto [`2d19918`](https://github.com/fabio-ara/AraLearn/commit/2d19918e9010bbcbbdddf419cd8745cccad2b28b); `main` no fechamento [`3d2de2b4`](https://github.com/fabio-ara/AraLearn/commit/3d2de2b4571602388524257a484dc9040078eb7d). Site: <https://fabio-ara.github.io/AraLearn/>. APK: `sha256:06acea1a354568d442b32597781567fbf167842dc0820e4f7c07dd7113d78346`.

## Cobertura e limite de evidência

- Cobertura por cortes comprovados: **16/17 itens** aceitos (10/11 produções e 6/6 bibliografias), **24/25 microssequências** e **33/34 famílias**, sem redução de denominador.
- A entrega encerrou com limite de evidência na **MS22**, família `audio`: não houve produção nem escuta real verificável registradas. A ausência dessa prova não significa áudio quebrado no produto.

## Mudanças úteis publicadas pela revisão

- A inspeção pedagógica considera a posição curricular das unidades: reordenar ensino e prática desatualiza apenas os pareceres relacionados, e a conferência da Explicação confronta as práticas, os retornos e os parâmetros das unidades de sua base (0.0.99).
- Uma falha interna de credencial ou de arquivos (401) deixa de encerrar a sessão: o estado local é preservado e a indisponibilidade é informada como temporária (0.0.100).
- O estado físico de uma reação — (g), (s) ou (l) — permanece na mesma linha da fórmula na Explicação, sem quebrar em várias linhas (0.0.100).
- Dados guardados localmente por versões anteriores migram para o caminho corrente na primeira abertura, preservando conteúdo, revisões históricas e observações pendentes; uma observação que não caiba na fila corrente permanece recuperável e exportável como rascunho (0.0.100).
- Os caminhos executáveis das versões substituídas do legado foram removidos — a aceitação da exportação v1, a releitura da chave antiga da fila de observações e a conversão do parecer agregado no leitor — com migração única do armazenamento local. A migração de conteúdo e a leitura do parecer histórico de cinco dimensões permanecem por integridade.

## Legado, encerramento e histórico

- O curso legado passou por preservação com backup, restore real e frescor aprovados antes da exclusão; o Storage foi recuperado por cópia de sistema de arquivos, não pela API de Storage — limite mantido.
- Os rascunhos 0.0.84 a 0.0.99 foram removidos após revalidação de assets, metadados e manifesto; a 0.0.83 permanece publicada e as tags Git das versões publicadas seguem intactas.
- A [#404](https://github.com/fabio-ara/AraLearn/issues/404) foi encerrada: jornada residual de autoria por Actions aceita, Actions suportada no catálogo 11.1.0 (30 operações) e fixture descartável excluída pelo fluxo público de preparar/confirmar. O diagnóstico de terminal foi encerrado como falso positivo, sem defeito do produto a corrigir.
- A [PR425](https://github.com/fabio-ara/AraLearn/pull/425) corrigiu a autenticação interna do perfil e a [PR426](https://github.com/fabio-ara/AraLearn/pull/426) integrou o relatório final desta revisão. As revisões intermediárias 0.0.85 a 0.0.99 ficam no histórico do Git e no [registro de mudanças](../CHANGELOG.md).
