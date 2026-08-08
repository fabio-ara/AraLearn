# Contrato público do AraLearn

O contrato público é a representação JSON interoperável do conteúdo do
AraLearn. Ele define o que o aplicativo, os assistentes e as ferramentas de
pesquisa podem importar, exportar, validar, enviar como contexto e montar como
visão de domínio. Na geração assistida, contratos transitórios precedem a
montagem desse formato. O documento se torna imutável quando é materializado
como uma revisão publicada; uma submissão editorial ativa retém essa revisão
exata.

JSON é um formato textual de dados estruturados, conforme apresenta a MDN Web Docs (2026). JSON Schema define regras sobre esses dados, como campos obrigatórios, tipos e valores aceitos (JSON Schema, 2026). No AraLearn, o contrato cumpre função técnica e didática: ele descreve um documento portátil e as formas de estudo que o sistema aceita.

## Documento raiz

```json
{
  "contract": "aralearn.contract",
  "version": 4,
  "kind": "project",
  "courses": []
}
```

Campos obrigatórios:

| Campo | Função |
|---|---|
| `contract` | Identifica o contrato. Deve ser `aralearn.contract`. |
| `version` | Indica a versão do contrato: `4`. |
| `kind` | Indica o tipo do documento. Deve ser `project`. |
| `courses` | Lista de cursos do projeto. |

## Hierarquia

```text
project -> course -> module -> lesson -> microsequence -> card
```

Os cards pertencem diretamente à microssequência na visão pública e seguem a
ordem declarada em `position`. Essa hierarquia preserva a ordem de estudo e
fornece contexto para ferramentas de autoria ou pesquisa. A revisão publicada
é armazenada no Storage e projetada em linhas no IndexedDB de cada dispositivo.
Durante a autoria remota, o documento é composto a partir das partes correntes
do workspace no PostgreSQL.

As identidades são estáveis. `course.id` é único no projeto; os identificadores
de `module`, `lesson`, `topic`, `microsequence` e `card` são únicos por tipo em
todo o curso, inclusive entre ramos diferentes. Cursos independentes podem usar
o mesmo identificador interno. Um workspace de autoria aplica a restrição mais
forte de unicidade por tipo em toda a área de trabalho, inclusive entre cursos,
porque suas partes são endereçadas diretamente. Um movimento preserva a
identidade; uma cópia ou importação para o workspace remapeia as identidades da
parte copiada. A validação rejeita uma repetição e informa a ocorrência original
e a duplicada.

## Relação com a persistência

No PostgreSQL, o workspace em edição usa linhas para projeto, cursos, módulos,
lições, tópicos, microssequências e cards. O servidor recompõe essas linhas no
formato v4 e valida a árvore. Já uma revisão publicada não é decomposta numa
segunda árvore remota: curso e ponteiro usam UUIDs e hashes. No IndexedDB, a
revisão baixada é projetada em linhas locais para navegação eficiente e estudo
offline.

Na publicação, o documento válido é canonicalizado, identificado por SHA-256 e
gravado como revisão JSON imutável no Storage. Catálogo e biblioteca privada
usam o mesmo motor de artefatos, com autorizações distintas. Campos
desconhecidos ou sem mapeamento são rejeitados; não há descarte silencioso.
Consulte [Persistência relacional e sincronização](persistencia-relacional.md).

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
  "errors": ["confundir a conjunção com uma regra que aceita apenas uma proposição verdadeira"],
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
| `errors` | Erros plausíveis ligados à etapa que devem orientar explicação, prática e feedback. |
| `cards` | Cards da etapa, em ordem de estudo. |

`dependsOn` existe para preservar ordem local e permitir seleção de contexto sem enviar o curso inteiro à LLM.

## Núcleo comum de `card`

Todo card possui:

| Campo | Função |
|---|---|
| `id` | Identidade estável do card. |
| `position` | Ordem dentro da microssequência. |
| `resource` | Forma do card: parágrafo, código, matriz, grafo etc. |
| `kind` | `theory` ou `exercise`. |
| `exercise` | `none`, `gap` ou `choice`. |
| `title` | Título apresentado ao estudante. |
| `after` | Comentário, síntese ou feedback após o card. |

Campos opcionais comuns:

- `sources`: referências usadas no card;
- `topics`: tags textuais associadas;
- `afterBlocks`: de um a cinco blocos adicionais depois do comentário
  principal, cada um com `id` único no card.

`card.topics` é um array de strings únicas e não vazias. Essas strings são tags livres: podem repetir o `id` de um objeto estruturado em `lesson.topics`, caso em que a camada relacional registra também a referência, mas não precisam fazê-lo. Uma tag sem tópico correspondente continua válida e é preservada integralmente no round-trip. Isso é diferente de `lesson.topics`, cujos itens são objetos com `id`, `label`, `kind`, `checks` e `errors`.

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
- `plane`;
- `formula`;
- `chart`;
- `sequence`;
- `annotated_text`;
- `linguistic_example`;
- `system_map`;
- `reaction`.

Cada recurso tem campos próprios, descritos em [Recursos de card](recursos-de-card.md).

## Exemplos mínimos

### `paragraph` teórico

```json
{
  "id": "card-regra-conjuncao",
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
  "id": "card-escolha-conjuncao",
  "position": 2,
  "resource": "choice",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Escolha a opção correta",
  "question": "Em qual situação P e Q é verdadeira?",
  "selectionMode": "single",
  "selectionCriterion": "correct",
  "options": [
    { "id": "a", "text": "Quando as duas proposições são verdadeiras." },
    { "id": "b", "text": "Quando apenas P é verdadeira." },
    { "id": "c", "text": "Quando apenas Q é verdadeira." }
  ],
  "answerIds": ["a"],
  "after": "A conjunção exige que as duas proposições sejam verdadeiras."
}
```

### `matrix`

```json
{
  "id": "card-posicao-matriz",
  "position": 3,
  "resource": "matrix",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Posição na matriz",
  "prompt": "Observe a matriz.",
  "values": [["1", "2"], ["3", "4"]],
  "question": "Qual valor aparece na posição (2, 1)?",
  "selectionMode": "single",
  "selectionCriterion": "correct",
  "options": [
    { "id": "a", "text": "3" },
    { "id": "b", "text": "2" },
    { "id": "c", "text": "4" }
  ],
  "answerIds": ["a"],
  "after": "A posição (2, 1) indica segunda linha e primeira coluna."
}
```

### `formula`

```json
{
  "id": "card-fracao",
  "position": 4,
  "resource": "formula",
  "kind": "theory",
  "exercise": "none",
  "title": "Fração",
  "prompt": "Observe a expressão.",
  "notation": "mathematics",
  "accessibleText": "x é igual a um dividido pela raiz quadrada de y.",
  "expression": {
    "type": "row",
    "children": [
      { "type": "identifier", "value": "x" },
      { "type": "operator", "value": "=" },
      {
        "type": "fraction",
        "numerator": { "type": "number", "value": "1" },
        "denominator": {
          "type": "root",
          "radicand": { "type": "identifier", "value": "y" }
        }
      }
    ]
  },
  "after": "A raiz forma o denominador da fração."
}
```

A estrutura completa da árvore de expressão está em
[Recursos de card](recursos-de-card.md#table-relation_map-matrix-plane-e-formula).

## Referências citadas

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

MDN Web Docs. (2026). *Working with JSON*. <https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON>
