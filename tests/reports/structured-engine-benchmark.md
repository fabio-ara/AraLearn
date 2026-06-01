# Structured Engine Benchmark

- Data: 2026-05-29T04:21:30.656Z
- Modelo: deepseek-v4-flash
- Tentativas por cenário: 5
- formatSuccessRate: 0.96
- parseErrorRate: 0
- retryCount: 10
- failClosedCount: 2
- semanticValidationRate: 0.95
- structuralLeakRate: 0
- auditPatchRate: 1
- topDownDependencyErrorRate: 2

## Cenários
- matrix-aij: success=5/5; retries=0; failClosed=0; resources=matrix, matrix, matrix, matrix, matrix
- graph-path: success=4/5; retries=4; failClosed=1; resources=graph, graph, graph, graph
- relation-map: success=5/5; retries=0; failClosed=0; resources=relation_map, relation_map, relation_map, relation_map, relation_map
- tree-path: success=5/5; retries=0; failClosed=0; resources=tree, tree, tree, tree, tree
- flow-linear: success=5/5; retries=0; failClosed=0; resources=flow, flow, flow, flow, flow
- code-output: success=4/5; retries=0; failClosed=1; resources=code, code, code, code
- table-choice: success=5/5; retries=5; failClosed=0; resources=table, table, table, table, table
- paragraph-gap: success=5/5; retries=0; failClosed=0; resources=paragraph, paragraph, paragraph, paragraph, paragraph
- audit-feedback-correction: success=5/5; retries=0; failClosed=0; resources=matrix
- top-down-course: success=5/5; retries=0; failClosed=0; resources=nenhum

## Recursos escolhidos
- matrix: 5
- relation_map: 5
- tree: 5
- flow: 5
- table: 5
- paragraph: 5
- graph: 4
- code: 4