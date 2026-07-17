# Contrato público do AraLearn

O contrato público é o JSON salvo pelo AraLearn. Ele define o que pode ser persistido, exportado, importado, validado e apresentado na interface. Durante a geração, o app usa contratos transitórios; ao final, o projeto precisa caber neste formato.

JSON é um formato textual de dados estruturados, conforme apresenta a MDN Web Docs (2026). JSON Schema define regras sobre esses dados, como campos obrigatórios, tipos e valores aceitos (JSON Schema, 2026). No AraLearn, o contrato cumpre função técnica e didática: ele diz não apenas como salvar o projeto, mas que formas de estudo o sistema aceita.

## Documento raiz

```json
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "courses": []
}
```

Campos obrigatórios:

| Campo | Função |
|---|---|
| `contract` | Identifica o contrato. Deve ser `aralearn.contract`. |
| `version` | Indica a versão do contrato. No estado atual, `3`. |
| `kind` | Indica o tipo do documento. Deve ser `project`. |
| `courses` | Lista de cursos do projeto. |

## Hierarquia

```text
project -> course -> module -> lesson -> microsequence -> version -> card
```

Essa hierarquia preserva ordem de estudo, contexto de geração e local de persistência.

## `course`

```json
{
  "id": "course-logica",
  "title": "Lógica proposicional",
  "goal": "Estudar conectivos básicos com teoria e prática.",
  "modules": []
}
```

Um curso delimita o campo geral. Ele não precisa conter todo o conhecimento sobre uma disciplina; precisa declarar um recorte estudável.

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

O módulo organiza uma região do curso. O `guide` funciona como orientação local: objetivo, inclusões, exclusões, notação e desvios a evitar.

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

A lição agrupa microssequências de um mesmo recorte. Ela possui `topics` e `guide` próprio.

## `guide`

`guide` define fronteiras. Seus campos são:

| Campo | Função |
|---|---|
| `goal` | Objetivo local. |
| `include` | Conteúdos que devem entrar. |
| `exclude` | Conteúdos que devem ficar fora. |
| `notation` | Convenções de símbolo, escrita ou representação. |
| `avoid` | Desvios a evitar. |

`exclude` não é comentário decorativo. Se uma resposta reintroduz conteúdo excluído em título, objetivo, enunciado, exemplo ou alternativa, o resultado deve ser rejeitado.

## `topic`

```json
{
  "id": "topic-conjuncao",
  "label": "Conjunção",
  "kind": "concept",
  "checks": ["o aluno reconhece quando a conjunção é verdadeira"],
  "errors": ["achar que basta uma proposição verdadeira"]
}
```

`topic` explicita conceitos, procedimentos, representações ou termos. O campo `errors` permite registrar erros plausíveis que podem virar objeto de estudo.

Valores de `kind`:

- `concept`;
- `procedure`;
- `representation`;
- `term`.

## `microsequence`

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
  "cards": []
}
```

Campos principais:

| Campo | Função |
|---|---|
| `role` | Papel da etapa: explicar, praticar, revisar ou apoiar. |
| `status` | Estado da etapa: planejada, gerada, precisando de revisão ou pronta. |
| `dependsOn` | Microssequências anteriores da mesma lição que servem de pré-requisito. |
| `covers` | Conteúdos cobertos pela etapa. |
| `checks` | Critérios mínimos de verificação. |
| `cards` | Cards da etapa, em ordem de estudo. |

`dependsOn` existe para preservar ordem local e permitir seleção de contexto sem enviar o curso inteiro à LLM.

## Núcleo comum de `card`

Todo card possui:

| Campo | Função |
|---|---|
| `position` | Ordem dentro da microssequência. |
| `resource` | Forma do card: parágrafo, código, matriz, grafo etc. |
| `kind` | `theory` ou `exercise`. |
| `exercise` | `none`, `gap` ou `choice`. |
| `title` | Título apresentado ao estudante. |
| `after` | Comentário, síntese ou feedback após o card. |

Campos opcionais comuns:

- `sources`: referências usadas no card;
- `topics`: tópicos associados;
- `afterBlocks`: blocos adicionais depois do comentário principal.

## Recursos aceitos

O contrato aceita:

- `paragraph`;
- `choice`;
- `composite`;
- `code`;
- `table`;
- `flow`;
- `tree`;
- `graph`;
- `relation_map`;
- `matrix`;
- `plane`.

Cada recurso tem campos próprios, descritos em [Recursos de card](recursos-de-card.md).

## Exemplos mínimos

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

### `choice`

```json
{
  "position": 2,
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

### `matrix`

```json
{
  "position": 3,
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

## Referências citadas

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

MDN Web Docs. (2026). *Working with JSON*. <https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON>
