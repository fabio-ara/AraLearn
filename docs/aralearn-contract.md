# Contrato público do AraLearn

O contrato público do AraLearn é o formato JSON persistido pelo app. Ele serve de base para autoria, importação, exportação, validação, renderização e versionamento. Tudo o que o usuário estuda ou edita precisa caber nele.

Durante a execução, o sistema monta contratos transitórios de planejamento, preenchimento e auditoria, mas a referência final do projeto continua sendo este contrato.

## Documento raiz

O documento raiz usa:

```json
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "courses": []
}
```

Campos obrigatórios:

- `contract`: deve ser `"aralearn.contract"`;
- `version`: deve ser `3`;
- `kind`: deve ser `"project"`;
- `courses`: lista de cursos.

## Hierarquia persistida

```text
course -> module -> lesson -> microsequence -> version -> card
```

## `course`

```json
{
  "id": "course-logica",
  "title": "Lógica proposicional",
  "goal": "Estudar conectivos básicos com teoria e prática.",
  "modules": []
}
```

Campos obrigatórios:

- `id`
- `title`
- `goal`
- `modules`

## `module`

```json
{
  "id": "module-conectivos",
  "title": "Conectivos",
  "guide": {
    "goal": "Delimitar o recorte do módulo.",
    "include": ["conjunção", "disjunção"],
    "exclude": ["predicados"],
    "notation": ["Use P e Q."],
    "avoid": ["Não abrir outro tópico."]
  },
  "lessons": []
}
```

Campos obrigatórios:

- `id`
- `title`
- `guide`
- `lessons`

## `lesson`

```json
{
  "id": "lesson-conjuncao",
  "title": "Conjunção",
  "guide": {
    "goal": "Cobrir definição, tabela-verdade e uso básico da conjunção.",
    "include": ["definição", "tabela-verdade", "interpretação da conjunção"],
    "exclude": ["predicados"],
    "notation": ["Use P e Q."],
    "avoid": ["Não introduzir disjunção."]
  },
  "topics": [],
  "microsequences": []
}
```

Campos obrigatórios:

- `id`
- `title`
- `guide`
- `topics`
- `microsequences`

## `guide`

`guide` define o recorte didático de módulo ou lição.

```json
{
  "goal": "Explicar a regra local.",
  "include": ["conjunção"],
  "exclude": ["predicados"],
  "notation": ["Use P e Q."],
  "avoid": ["Não abrir outro tópico."]
}
```

Campos:

- `goal`: objetivo local;
- `include`: itens que devem entrar;
- `exclude`: fronteiras rígidas;
- `notation`: convenções de escrita, símbolo ou representação;
- `avoid`: desvios a evitar.

Regra importante: `exclude` não é lembrete decorativo. O validador rejeita seu uso em títulos, objetivos, enunciados, exemplos e alternativas quando esse uso reintroduz o conteúdo proibido.

## `topic`

`topics` explicita conceitos, procedimentos, representações e termos relevantes da lição.

```json
{
  "id": "topic-conjuncao",
  "label": "Conjunção",
  "kind": "concept",
  "checks": ["o aluno reconhece quando a conjunção é verdadeira"],
  "errors": ["achar que basta uma proposição verdadeira"]
}
```

Valores permitidos em `kind`:

- `concept`
- `procedure`
- `representation`
- `term`

## `microsequence`

`microsequence` é a unidade principal de progressão.

```json
{
  "id": "micro-conjuncao-definicao",
  "title": "Definição da conjunção",
  "goal": "Explicar quando P e Q formam uma conjunção verdadeira.",
  "role": "explain",
  "status": "planned",
  "dependsOn": [],
  "covers": ["definição", "interpretação da conjunção"],
  "checks": ["o aluno reconhece a regra principal"],
  "versions": [],
  "activeVersion": null
}
```

Campos obrigatórios:

- `id`
- `title`
- `goal`
- `role`
- `status`
- `dependsOn`
- `covers`
- `checks`
- `versions`
- `activeVersion`

Valores permitidos em `role`:

- `explain`
- `practice`
- `review`
- `support`

Valores permitidos em `status`:

- `planned`
- `generated`
- `needs_review`
- `ready`

Regras:

- `dependsOn` aponta apenas para microssequências anteriores da mesma lição;
- referências inexistentes, auto-dependência, dependência futura e ciclo são rejeitados.

## `version`

Cada geração ou edição de cards cria uma versão.

```json
{
  "id": "version-2026-05-24T10-30-00Z",
  "createdAt": "2026-05-24T10:30:00.000Z",
  "source": "llm",
  "action": "generate",
  "request": "Explique a regra e proponha prática suficiente.",
  "summary": "Versão inicial com explicação, exemplo e prática.",
  "cards": [],
  "validation": {
    "ok": true,
    "issues": []
  }
}
```

Campos obrigatórios:

- `id`
- `createdAt`
- `source`
- `action`
- `request`
- `summary`
- `cards`
- `validation`

Valores permitidos em `source`:

- `llm`
- `manual`
- `codex`

Valores permitidos em `action`:

- `generate`
- `improve`
- `practice`
- `support`
- `repair`

`activeVersion` em `microsequence` aponta para a versão usada no estudo.

## Núcleo comum de `card`

Todo card possui este núcleo:

- `position`
- `resource`
- `kind`
- `exercise`

Valores permitidos em `kind`:

- `theory`
- `exercise`

Valores permitidos em `exercise`:

- `none`
- `gap`
- `choice`

Recursos aceitos:

- `paragraph`
- `choice`
- `code`
- `table`
- `matrix`
- `plane`
- `graph`
- `relation_map`
- `flow`
- `tree`

## Exemplos de cards

### `paragraph` teórico

```json
{
  "position": 1,
  "resource": "paragraph",
  "kind": "theory",
  "exercise": "none",
  "title": "Quando a conjunção é verdadeira",
  "text": "A conjunção P e Q só é verdadeira quando as duas proposições são verdadeiras.",
  "after": "A regra central é exigir as duas proposições verdadeiras."
}
```

### `paragraph` com lacuna

```json
{
  "position": 2,
  "resource": "paragraph",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Complete a regra",
  "text": "A conjunção é verdadeira quando [[P e Q são verdadeiras::P e Q são verdadeiras|só P é verdadeira|só Q é verdadeira]].",
  "after": "As duas partes precisam ser verdadeiras."
}
```

Regras:

- `paragraph` de exercício usa `exercise = "gap"`;
- a lacuna usa a sintaxe `[[resposta::opção correta|distrator 1|distrator 2]]`;
- teoria em `paragraph` não pode conter lacuna.

### `choice`

```json
{
  "position": 3,
  "resource": "choice",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Escolha a opção correta",
  "question": "Em qual situação P e Q é verdadeira?",
  "options": [
    { "id": "a", "text": "Quando as duas proposições são verdadeiras." },
    { "id": "b", "text": "Quando apenas P é verdadeira." },
    { "id": "c", "text": "Quando apenas Q é verdadeira." }
  ],
  "answer": "a",
  "after": "A conjunção exige que as duas proposições sejam verdadeiras."
}
```

Regras:

- `choice` usa `kind = "exercise"` e `exercise = "choice"`;
- deve haver 3 ou 4 opções;
- `answer` aponta para um `id` existente.

### `matrix`

```json
{
  "position": 1,
  "resource": "matrix",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Posição na matriz",
  "prompt": "Observe a matriz.",
  "values": [["1", "2"], ["3", "4"]],
  "question": "Qual valor aparece na posição (2, 1)?",
  "options": [
    { "id": "a", "text": "3" },
    { "id": "b", "text": "2" },
    { "id": "c", "text": "4" }
  ],
  "answer": "a",
  "after": "A posição (2, 1) indica segunda linha e primeira coluna."
}
```

### `plane`

```json
{
  "position": 1,
  "resource": "plane",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Vetor no plano",
  "prompt": "Observe o vetor representado a partir da origem.",
  "vector": [2, 1],
  "question": "Qual vetor está representado?",
  "options": [
    { "id": "a", "text": "(2, 1)" },
    { "id": "b", "text": "(1, 2)" },
    { "id": "c", "text": "(-2, 1)" }
  ],
  "answer": "a",
  "after": "O primeiro valor indica deslocamento horizontal; o segundo indica deslocamento vertical."
}
```

### `graph`

```json
{
  "position": 1,
  "resource": "graph",
  "kind": "theory",
  "exercise": "none",
  "title": "Grafo mínimo",
  "prompt": "Observe os dois vértices e a aresta entre eles.",
  "vertices": [
    { "id": "A", "label": "A" },
    { "id": "B", "label": "B" }
  ],
  "edges": [
    { "from": "A", "to": "B" }
  ],
  "after": "A aresta indica relação entre os vértices."
}
```

### `relation_map`

```json
{
  "position": 1,
  "resource": "relation_map",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Relação entre conjuntos",
  "prompt": "Observe os conjuntos e as relações.",
  "leftSet": {
    "label": "U",
    "items": ["A", "B"]
  },
  "rightSet": {
    "label": "V",
    "items": ["1", "2"]
  },
  "relations": [
    ["A", "1"],
    ["B", "2"]
  ],
  "question": "Qual conjunto de pares corresponde ao diagrama?",
  "options": [
    { "id": "a", "text": "{(A,1), (B,2)}" },
    { "id": "b", "text": "{(A,2), (B,1)}" },
    { "id": "c", "text": "{(A,1)}" }
  ],
  "answer": "a",
  "after": "Cada ligação indica um par ordenado entre os conjuntos."
}
```

### `flow`

```json
{
  "position": 1,
  "resource": "flow",
  "kind": "theory",
  "exercise": "none",
  "title": "Decisão simples",
  "prompt": "Observe o fluxograma.",
  "structure": {
    "kind": "sequence",
    "items": [
      { "kind": "start", "text": "Ler a condição" },
      {
        "kind": "if_then_else",
        "condition": "A condição é verdadeira?",
        "thenBranch": [{ "kind": "end", "text": "Executar ação A" }],
        "elseBranch": [{ "kind": "end", "text": "Executar ação B" }]
      }
    ]
  },
  "after": "O fluxograma materializa a decisão no próprio card."
}
```

Regras:

- `flow` exige `structure` semântica;
- a raiz deve ser `kind = "sequence"`;
- a geometria é derivada pelo motor do app.

## Invariantes de integridade

O app valida:

- estrutura geral do projeto;
- presença dos campos obrigatórios;
- coerência de `guide`;
- dependências entre microssequências;
- existência e validade de `activeVersion`;
- contrato dos cards;
- condições didáticas mínimas.

Entre as regras mais importantes:

- exercício textual aberto falha;
- `choice` exige resposta válida;
- recursos visuais precisam de dados suficientes;
- `flow` deve trazer estrutura semântica válida;
- resposta inválida do serviço textual não é persistida.

## Exemplo mínimo completo

```json
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "courses": [
    {
      "id": "course-logica",
      "title": "Lógica proposicional",
      "goal": "Estudar conectivos básicos com teoria e prática.",
      "modules": [
        {
          "id": "module-conectivos",
          "title": "Conectivos",
          "guide": {
            "goal": "Cobrir os conectivos previstos no módulo.",
            "include": ["conjunção"],
            "exclude": ["predicados"],
            "notation": ["Use P e Q."],
            "avoid": ["Não abrir outro conectivo nesta etapa."]
          },
          "lessons": [
            {
              "id": "lesson-conjuncao",
              "title": "Conjunção",
              "guide": {
                "goal": "Explicar definição e prática básica da conjunção.",
                "include": ["definição", "interpretação"],
                "exclude": ["predicados"],
                "notation": ["Use P e Q."],
                "avoid": []
              },
              "topics": [],
              "microsequences": [
                {
                  "id": "micro-conjuncao-definicao",
                  "title": "Definição da conjunção",
                  "goal": "Explicar quando P e Q é verdadeira.",
                  "role": "explain",
                  "status": "generated",
                  "dependsOn": [],
                  "covers": ["definição", "interpretação"],
                  "checks": ["o aluno reconhece a regra central"],
                  "versions": [
                    {
                      "id": "version-1",
                      "createdAt": "2026-05-24T12:00:00.000Z",
                      "source": "llm",
                      "action": "generate",
                      "request": "Explique e proponha prática suficiente.",
                      "summary": "Versão inicial da microssequência.",
                      "cards": [
                        {
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Regra da conjunção",
                          "text": "A conjunção P e Q só é verdadeira quando as duas proposições são verdadeiras.",
                          "after": "A regra exige as duas proposições verdadeiras."
                        }
                      ],
                      "validation": {
                        "ok": true,
                        "issues": []
                      }
                    }
                  ],
                  "activeVersion": "version-1"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```
