# Representações na auditoria de inspeção — 0.0.88

## Comportamento

A inspeção passou a reutilizar `inspectBpmnSemantics(data)`, de `src/resources/packages/bpmn-process/semantics.js`, para informar as inconsistências estáticas conhecidas de BPMN. As regras permanecem no pacote do recurso. O domínio não replica regras nem acrescenta formatos, parâmetros ou exigências de autoria.

`projectPedagogicalAudit(basis)` acrescenta `representationIssues` ao pacote de leitura. Cada diagnóstico conserva código, localização e identidades internas e inclui uma mensagem com o nome da unidade ou Explicação, o slot, a posição do diagrama e os nomes do fluxo/evento/participante pertinentes. A projeção humana remove os campos técnicos, mas conserva essa mensagem e o código em MCP e Actions.

`requirePedagogicalAuditConsistency(report, basis)` recusa `consistent` quando esse conjunto não está vazio, com o código existente `pedagogical_audit_contradiction`. A mensagem apresenta o primeiro diagnóstico e indica onde ler os demais. `needs_attention` continua registrável. O diagnóstico descreve a representação declarada; não simula execução nem certifica aprendizagem ou suficiência didática.

## Base e escopo

A definição SQL vigente de `private.course_pedagogical_basis_v1`, em `20260924175938_revisao_v7_focal_audit_basis.sql`, reúne as unidades filhas da microssequência do alvo em `studyUnits`. A própria Explicação fica em `microsequence.explanation`; outras microssequências aparecem separadamente em `dependencies`.

| Alvo da inspeção | Recursos examinados |
| --- | --- |
| `study_unit` | `content` e `feedback` somente da unidade identificada por `targetId` |
| `microsequence_explanation` | A própria Explicação e `content`/`feedback` das unidades do seu percurso |
| Dependências, citações e fontes | Continuam contexto, sem novos alvos de inspeção |

`inspectPedagogicalEvidence` permanece inalterado. A nova recusa não integra o caminho que permite preservar conteúdo legado na materialização. Nenhum conteúdo, aplicação instrucional, base canônica, hash ou referência de inspeção é reescrito por este patch.

## Consumidores

O domínio fonte e seu espelho em `supabase/functions/_shared/aralearn/runtime/domain/coursePedagogicalAudit.js` contêm a mesma alteração. Os handlers existentes de leitura e `registrar_inspecao` já consomem a projeção e a guarda comuns; não precisaram mudar. `representationIssues` pertence a cada alvo e atravessa o compartilhamento por foco, a paginação e os dois canais. Não houve mudança em schemas, catálogo, OpenAPI, RPC ou UI.

O script `scripts/auditRevisaoV10Course.mjs` também consome as regras compartilhadas, por `inspectBpmnAuthoring`, sem escrever no curso. A [prova no export completo](auditoria.md) localizou as nove ocorrências da revisão 122 e preservou o julgamento didático como não verificado. Quando houver uma base focal no formato SQL, `projectPedagogicalAudit(basis).representationIssues` já aplica o escopo de inspeção.

## Provas locais

Os dois testes de recusa, para unidade e Explicação, falharam antes da alteração com `Missing expected exception`. Depois do patch, passaram os 45 testes dos quatro arquivos focais:

```text
npm run test:focal -- tests/runtime/course-pedagogical-representations.test.js tests/runtime/course-pedagogical-audit.test.js tests/runtime/course-human-read-context.test.js tests/runtime/course-human-audit-context.test.js
```

As provas cobrem conteúdo e feedback; Explicação e percurso; base válida; registro de insuficiência; exclusão de outras unidades, dependências e fontes; preservação da validação compatível de materialização; reconstrução estruturalmente igual da base compartilhada; referências opacas; mensagens úteis e paridade MCP/Actions; continuidade e limites existentes de contexto/envelope. Os canais foram exercitados em memória com adaptador sintético, sem chamadas remotas.

## Limites

A igualdade estrutural integral foi inicialmente provada na projeção de domínio e na resolução do compartilhamento, antes do filtro humano. A leitura pelos canais revelou que `withoutTechnicalState` removia identidades disciplinares dentro de `auditoriaPedagogica.basis`. Esse limite motivou a correção autorizada descrita no adendo abaixo.

As regras cobrem o subconjunto BPMN declarado no pacote. Ausência de diagnóstico não substitui julgamento semântico ou inspeção visual. Estas provas são locais; a preparação integrada, a publicação e a verificação hospedada permanecem pendentes nesta etapa.

## Adendo — fronteira entre recurso literal e metadados

`withoutTechnicalState`, em `courseHumanTasks.js`, agora reconhece uma instância usando o registry instalado: pacote e versão precisam existir, e `validateInstance` precisa aceitar o objeto original em um dos slots declarados. Somente então copia o envelope integral antes de percorrer metadados. A verificação não normaliza os dados: normalizar poderia descartar campos extras e conceder a exceção a um objeto adulterado, além de alterar texto disciplinar.

O mecanismo vale para os recursos e respostas já suportados, sem regras por componente. Preserva `id`, `package`, `version` e `data`, incluindo identidades e relações internas. Não copia a base inteira, não altera o agrupamento por foco e não introduz esquema ou campo de autoria. Objetos não aceitos pelo registry seguem o filtro preexistente; campos técnicos externos continuam removidos.

O ramo `studyUnits` que preserva os envelopes públicos só é aplicado a listas cujos itens contêm `studyUnit`. Linhas canônicas `{id, content, application, design}` não passam por esse ramo e deixam de receber uma propriedade artificial `studyUnit: undefined`.

### Reprodução e validação

Antes do ajuste, dois testes falharam: comparação profunda perdeu IDs de nós/fluxos do BPMN e a linha da base continha `studyUnit: undefined`. Depois, **36/36 testes focais passaram**, além de ESLint focal e `git diff --check`:

```text
npm run test:focal -- tests/runtime/course-human-read-context.test.js tests/runtime/course-human-audit-context.test.js tests/runtime/course-pedagogical-representations.test.js
eslint supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js tests/runtime/course-human-read-context.test.js tests/runtime/course-human-audit-context.test.js tests/runtime/course-pedagogical-representations.test.js
```

Em MCP e Actions, por `preparar_revisao` e `retomar_curso`, os testes atravessam fragmentos reais e comparam os pacotes originais com aqueles recuperados da base compartilhada. Cobrem BPMN com `id/from/to`, resposta Lacuna com `targetInstanceId/targetPath`, recurso Código em conteúdo e feedback com CRLF/Unicode e literal JSON com `steps`, `duration`, `path` e `requestId`. Metadados externos e tentativas com campos extras no envelope/data, pacote desconhecido, versão não instalada ou dados inválidos não expõem os marcadores privados simulados. Referências opacas, digest/continuidade e limites de envelope permanecem cobertos.

Os contratos instalados não têm `steps` ou `duration` como propriedades de dados estruturados. O antigo exemplo de `step_sequence` nos testes não corresponde a um pacote instalado. A prova usa `targetPath` estruturado de uma resposta existente e `steps`/`duration` como texto disciplinar em Código; não inventa componente ou schema. A igualdade integral afirmada após os canais é dos **envelopes validados**, não de todos os metadados externos da base.

### SHA-256 deste adendo

| Arquivo | SHA-256 |
| --- | --- |
| `courseHumanTasks.js` | `8bed03d88e186d91b3c6f7efad3dc6b69d0d7a09fcfd01cca9c160429b6034a1` |
| `course-human-read-context.test.js` | `844e0da749fe38c40f235695a0490cf81f60c306eddbd9f3de5c8920004fa816` |

O adendo modifica somente essa fronteira comum e seus testes/documentação. Materialização, SQL, catálogo, OpenAPI e regras BPMN permanecem fora da alteração.
