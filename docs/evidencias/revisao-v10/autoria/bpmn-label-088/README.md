# Tarefa BPMN: título completo no HTML interativo

Prova local com dados integrais do diagrama da unidade 1, revisão 122 do curso novo. O renderer é o da candidata 0.0.88. A origem, medidas e hashes estão no [manifesto](manifesto.json).

O título “Avisar chegada para entrega” ocupava 139,74 px numa janela de 110,55 px: o CSS impunha uma linha ao HTML, embora Graphviz tivesse reservado duas. A correção compartilha a classe de tarefa entre a sonda de medição e o HTML final. A janela mantém 110,55 px; o título completo usa duas linhas e 23,54 px de altura a zoom 0,64.

| Estado | Unidade | Explicação |
| --- | --- | --- |
| Antes, escuro | [Captura](bpmn-label-088-rev122-baseline-dark-390-unidade.png) | [Captura](bpmn-label-088-rev122-baseline-dark-390-explicacao.png) |
| Depois, escuro | [Captura](bpmn-label-088-rev122-fixed-dark-390-unidade.png) | [Captura](bpmn-label-088-rev122-fixed-dark-390-explicacao.png) |
| Depois, claro | [Captura](bpmn-label-088-rev122-fixed-light-390-unidade.png) | [Captura](bpmn-label-088-rev122-fixed-light-390-explicacao.png) |

As quatro provas finais usam 390 × 844 px, abertura de tela inteira, zoom e pan. O nó focal está inteiro; dez títulos de tarefas foram medidos em cada caso, sem ultrapassar sua própria caixa, e não houve erro de página. Objetos vizinhos podem ficar parcialmente fora do viewport durante a exploração. O executor inspecionou os quatro resultados; a raiz conferiu visualmente Unidade escura e Explicação clara.

A regressão versionada em `tests/e2e/revisao-v10-diagrams.spec.js` usa outro título longo nos dois hosts com HTML de edição/seleção habilitado. Três testes focais passaram, incluindo o vínculo do rótulo de aresta já existente. A prova não escreve conteúdo, não certifica a conformidade semântica do processo salvo e ainda não representa o site publicado. **Nenhum resultado constitui validação humana.**
