# Dicionário de métricas e datasets

Cada métrica tem id e versão imutáveis, pergunta, definição, tipo, unidade,
derivação, tratamento de ausências, interpretação permitida, limite e
denominador. Alterar significado exige nova versão.

| Métrica `@1.0.0` | Dataset | Unidade/denominador | Interpretação permitida | Inferência proibida |
| --- | --- | --- | --- | --- |
| `design.assignment_origin` | `authoring_design` | valor efetivo / valores dos snapshots correntes | composição entre catálogo, Auto, override e protocolo | qualidade, acerto ou esforço |
| `design.resource_package` | `authoring_design` | seleção / seleções dos manifestos correntes | packages efetivamente selecionados | variedade como qualidade |
| `design.resource_role` | `authoring_design` | seleção / seleções correntes | papel instrucional declarado | prática ou teoria inferida pelo clique |
| `design.resource_fit` | `authoring_design` | seleção / seleções correntes | fit declarado e substituições a revisar | canônico como melhor resultado |
| `design.resource_set_use` | `authoring_design` | seleção / seleções correntes | conjuntos exatos usados | permitido como usado |
| `process.materialization_coverage` | `authoring_process` | proporção / microssequências correntes | cobertura operacional | qualidade ou aprendizagem |
| `process.finding_status` | `authoring_process` | finding / ocorrências não superseded | pendências e decisões formais | nota única do curso |
| `process.part_microsequence_count` | `authoring_process` | microssequência / Parte | distribuição estrutural | tamanho ideal universal |
| `learning.structural_progress` | `authoring_process` | card × seleção / cards aplicáveis das seleções | conclusão explícita e lacuna de estado | atenção, domínio, esforço ou abandono |
| `experiment.assignment_count` | `experiment_assignments` | participante atribuído / assignments | N realizado por condição | adesão ou efeito |
| `experiment.outcome_numeric` | `experiment_outcomes` | unidade do instrumento / observações esperadas | N, ausentes, média, mínimo e máximo | causalidade ou significância |
| `experiment.outcome_category` | `experiment_outcomes` | observação / valores não ausentes | frequências por condição e onda | ordem ou superioridade implícita |

## Linhas e proveniência

`authoring_design` contém linhas `parameter` e `resource`, com refs exatas de
snapshot, manifesto e `ResourceSet`. `authoring_process` contém `part`,
`finding`, `materialization` e `learning`. `experiment_assignments` contém
pseudônimo local, condição e revisão congelada; `experiment_outcomes` fixa
instrumento, outcome, onda, tipo, valor ou motivo de ausência.

`datasetSetRef` inclui revisão relevante do workspace ou experimento e a revisão
append-only do dataset. Em progresso estrutural também inclui o estado corrente
das conclusões explícitas; assim uma página posterior não pode combinar
snapshots diferentes. Cursores nunca substituem o pin.

## Dados ausentes

Ausência não vira zero de aprendizagem. Outcome `missing` conserva motivo e fica
fora da média; estado de conclusão inexistente aparece como indisponível. Uma
onda não declarada pelo protocolo não é fabricada como ausência. A análise deve
relatar denominador, cobertura e limitações junto de qualquer número.

