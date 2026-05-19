# Contrato público do AraLearn

## `aralearn.contract` v1

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

## Curso

- `key`
- `title`
- `goal?`
- `evidencePriority`
- `modules`

## Módulo

- `key`
- `title`
- `include: ScopeTerm[]`
- `exclude: ScopeTerm[]`
- `notes?`
- `assessmentStyle`
- `lessons`

## ScopeTerm

- `id`
- `label`
- `normalizedLabel`

## Lição

- `key`
- `title`
- `goal`
- `microsequences`

## Microssequência

- `key`
- `title`
- `goal`
- `type: "main" | "support"`
- `status: "planned" | "generated" | "needs_review" | "ready"`
- `dependsOn: string[]`
- `scopeRefs: string[]`
- `parentMicrosequenceKey?`
- `supportReason?`
- `versions`
- `activeVersionKey?`

## Versão de microssequência

- `key`
- `createdAt`
- `source: "llm" | "manual" | "codex"`
- `mode: "generate" | "improve" | "more_practice" | "support" | "repair"`
- `userRequest?`
- `cards`
- `summary`
- `validationReport`

## Card

- `key`
- `title?`
- `resourceType`
- `content`
- `after?`

Recursos públicos mínimos:

- `say`
- `table`
- `code`
- `flow`
- `tree`
- `graph`
- `block_gap_fill`

## Contrato de escopo

O top-down não parte do contrato público. Ele parte de `aralearn.scope.v1`.

Estrutura:

```json
{
  "schemaVersion": "aralearn.scope.v1",
  "course": {
    "title": "Matemática para Informática",
    "goal": "Estudar a disciplina com foco na cobrança real.",
    "evidencePriority": ["notebook", "exercise_list", "exam"]
  },
  "modules": [
    {
      "title": "Lógica Proposicional",
      "include": ["conectivos", "tabela-verdade"],
      "exclude": ["lógica de predicados"],
      "notes": "Professor cobra resolução passo a passo.",
      "assessmentStyle": "mixed"
    }
  ]
}
```
