# Publicação 0.0.91 — site e backend; APK em rascunho

**Marco de 28/09/2026: site e backend 0.0.91 publicados; APK Android 237 em rascunho.** A publicação transporta a autonomia opcional na materialização, o [contexto de inspeção compartilhado](contexto-inspecao-091.md) e a [restauração da posição dos diagramas](../estudo/viewport-e-cartao-091.md). Não conclui o curso nem a intervenção, não exclui o legado e não constitui validação humana.

## Da candidata à publicação

A candidata `1ed78063927fc03e9956721496263675c310ae3d` passou os seis gates locais entre 04:30:07 e 04:40:42 UTC: runtime com 2.611 testes aprovados, zero falhas e 15 ignorados, 6 casos E2E aprovados e `candidate:ready` com exit 0. Nenhuma suíte válida foi repetida nesse preparo.

| Marco 0.0.91 | Identidade e resultado |
| --- | --- |
| CI protegida | [36378836870/1](https://github.com/fabio-ara/AraLearn/actions/runs/36378836870): cinco jobs PASS, às 05:14:20 UTC |
| Integração | [PR 415](https://github.com/fabio-ara/AraLearn/pull/415), merge `eab2ee319fd54615620146efca9d062703b8f426`; tree `c6e9ea311506466077501e1ed3f932b8757617af` |
| Preparação oficial | [36382652771/1](https://github.com/fabio-ara/AraLearn/actions/runs/36382652771): APK assinado 237 e instalação/upgrade PASS; site e finalização pulados |
| Backend | Aplicação canônica exit 0, sem migração nova: 241/241 e três funções publicadas |
| Site | [36383602388/1](https://github.com/fabio-ara/AraLearn/actions/runs/36383602388): 203 recursos efetivamente servidos conferidos; finalização da release pulada |

As contagens de testes pertencem a seus recortes e não devem ser somadas como casos únicos.

## Backend, contrato e clientes

A implantação não criou migração: o histórico permaneceu 241/241, sem seeds nem alteração de roles, e as três funções de canal foram republicadas. Passaram as 213/213 verificações automatizadas do contrato de autoria e os smokes de OAuth inicial e renovado, fronteiras, autoria de fixture e limpeza. São diagnósticos de engenharia, **não autoria do curso pelo ChatGPT**.

O catálogo hospedado é **11.1.0**, com 56 tarefas e 30 operações Actions, fingerprint `sha256:b0fdcd6922a3cca6cd1fa71b48949303ea76f63747a606e43b2e1ae00873b9a1`. O contrato importável servido é 0.0.91 e ocupa 97.552 caracteres minificados.

O recibo instrumentado de **28/09/2026 às 05:57 UTC** registra a atualização das Actions por **Importar de URL** com o arquivo publicado. Depois de salvar e recarregar o editor, foram relidos versão 0.0.91, catálogo 11.1.0, fingerprint, 30 operações e o esquema OAuth preservado; `autonomo` aparece em `retomar_curso` e `materializar_parte`. É configuração persistida, não jornada nem autoria.

Antes da produção, uma leitura do curso pelo Chat normal em modo Médio, às 06:00 UTC, encontrou a revisão 330, o mapa em rascunho e a etapa em foco sem unidades. Em seguida, às 06:02:32 UTC, o mesmo Chat recebeu o pedido de produção, levou 18m38s e declarou a etapa materializada com oito unidades — três de ensino e cinco de prática —, mapa ainda em rascunho e inspeções de IA vigentes e consistentes. A leitura focal seguinte descreveu oito unidades de estudo reais, cada alvo referenciando a própria unidade e a explicação compartilhada. O export integral de leitura, capturado em 28/09/2026 (06:38–06:47 UTC) por MCP de diagnóstico e com autoria web, confirmou a revisão 341: 25 microssequências, 55 unidades, sete microssequências produzidas e 19/34 componentes usados. As 24 microssequências externas permaneceram byte-idênticas à 330, as condições fixas da MS1 e da MS2 e o mapa em rascunho foram preservados, e a única alteração foi a MS15, com oito unidades. O export projeta as 67 revisões de conteúdo apenas como `state=draft`, então a consistência declarada pelo modelo não é verificável por esse caminho e a auditoria semântica continua pendente. Atualizar ferramentas do MCP foi acionado segundo o registro do operador, sem aviso visível de conclusão e com conta e OAuth preservados; isso não equivale a conferir o JSON compartilhado. A inspeção hospedada da projeção compartilhada continua pendente. O ensaio não demonstrou defeito material de código.

## Artefatos e limites

O gate nativo aprovou instalação limpa 237, upgrade público 213→237 e reinstalação 237, com UID e tema escuro preservados. Três capturas receberam inspeção visual autônoma: abertura limpa, seleção de tema e estado após o upgrade. IME e rotação não foram observados.

| Artefato | SHA-256 |
| --- | --- |
| APK oficial `AraLearn-0.0.91.apk` | `5c725b4f975ff760ae299d53afb978dedb7f0b8eba6cd8b67f1f8b094492dda9` |
| Certificado da assinatura v2 | `c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296` |

A release 397981415, `AraLearn v0.0.91`, tag `v0.0.91`, aponta para o merge acima e conserva `draft=true`, `prerelease=false` e `published_at=null`. Os três assets foram baixados pela API autenticada e comparados byte a byte com a preparação. Não há anúncio de download público do APK.

No corte documental de **28/09/2026**, o último export integral confirmado é a **revisão 341**: 25 microssequências, 55 unidades em sete produzidas e 19/34 componentes usados, preservando as 24 microssequências externas byte-idênticas à 330. A auditoria semântica da MS15 e a leitura hospedada da projeção compartilhada continuam pendentes. Curso completo, inspeções pendentes, cobertura restante, release final e substituição segura do legado continuam abertos. **Nenhum resultado desta intervenção constitui validação humana pós-correção.**
