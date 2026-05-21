# Contrato público do AraLearn

O contrato público define o formato persistido e exportável de um projeto AraLearn.

## Documento raiz

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

Campos:

- `contract`: deve ser `"aralearn.contract"`;
- `version`: versão numérica do contrato;
- `kind`: deve ser `"project"`;
- `courses`: lista de cursos.

## Curso

```json
{
  "key": "course-matematica-para-informatica",
  "title": "Matemática para Informática",
  "goal": "Estudar a disciplina com foco em exercícios e prova.",
  "evidencePriority": ["notebook", "exercise_list", "exam"],
  "modules": []
}
```

Campos:

- `key`: identificador estável;
- `title`: título exibido;
- `goal`: objetivo opcional;
- `evidencePriority`: fontes ou tipos de evidência mais importantes;
- `modules`: módulos do curso.

## Módulo

```json
{
  "key": "module-logica-proposicional",
  "title": "Lógica Proposicional",
  "include": [],
  "exclude": [],
  "notes": "Professor cobra resolução passo a passo.",
  "assessmentStyle": "mixed",
  "lessons": []
}
```

Campos:

- `key`;
- `title`;
- `include`;
- `exclude`;
- `notes`;
- `assessmentStyle`: `"theoretical"`, `"practical"` ou `"mixed"`;
- `lessons`.

## Termo de escopo

```json
{
  "id": "conectivos",
  "label": "conectivos",
  "normalizedLabel": "conectivos"
}
```

`include` e `exclude` usam termos de escopo normalizados. Isso ajuda a IA e o app a manterem o recorte definido pelo usuário.

## Lição

```json
{
  "key": "lesson-tabelas-verdade",
  "title": "Tabelas-verdade",
  "goal": "Construir e comparar tabelas-verdade de expressões proposicionais.",
  "microsequences": []
}
```

Campos:

- `key`;
- `title`;
- `goal`;
- `microsequences`.

## Microssequência

```json
{
  "key": "microsequence-conjuncao",
  "title": "Conjunção",
  "goal": "Entender quando uma conjunção é verdadeira.",
  "type": "main",
  "status": "planned",
  "dependsOn": [],
  "scopeRefs": ["conectivos"],
  "versions": []
}
```

Campos:

- `key`;
- `title`;
- `goal`;
- `type`: `"main"` ou `"support"`;
- `status`: `"planned"`, `"generated"`, `"needs_review"` ou `"ready"`;
- `dependsOn`: chaves de microssequências das quais depende;
- `scopeRefs`: termos de escopo relacionados;
- `parentMicrosequenceKey`: usado em complementos;
- `supportReason`: justificativa do complemento;
- `versions`: versões de cards;
- `activeVersionKey`: versão ativa.

## Versão de microssequência

```json
{
  "key": "version-001",
  "createdAt": "2026-05-19T12:00:00.000Z",
  "source": "llm",
  "mode": "generate",
  "userRequest": "Explique com exercício guiado.",
  "cards": [],
  "summary": "Introduz conjunção e propõe prática.",
  "validationReport": {
    "ok": true,
    "issues": []
  }
}
```

Campos:

- `key`;
- `createdAt`;
- `source`: `"llm"`, `"manual"` ou `"codex"`;
- `mode`: `"generate"`, `"improve"`, `"more_practice"`, `"support"` ou `"repair"`;
- `userRequest`;
- `cards`;
- `summary`;
- `validationReport`.

## Card

```json
{
  "key": "card-001",
  "title": "Quando P ∧ Q é verdadeira?",
  "resourceType": "say",
  "content": "A conjunção P ∧ Q só é verdadeira quando P e Q são verdadeiras.",
  "after": "Avance quando conseguir explicar a regra sem consultar a tabela."
}
```

Campos:

- `key`;
- `title`;
- `resourceType`;
- `content`;
- `after`.

## Recursos aceitos

`resourceType` pode ser:

- `say`;
- `table`;
- `code`;
- `flow`;
- `tree`;
- `graph`;
- `block_gap_fill`.

Cada recurso possui formato próprio em `content`. A validação do domínio rejeita recursos desconhecidos.

No caso de `graph`, o contrato público permanece propositalmente simples:

- `vertices` com `id`, `label` opcional e `x`/`y` opcionais;
- `edges` com `from`, `to`, `label` opcional e `weight` opcional;
- `highlight` com listas de vértices e pares de vértices.

Regras operacionais de `graph`:

- laços não são aceitos;
- multiarestas entre o mesmo par de vértices são aceitas quando o caso didático exigir;
- quando `x` e `y` são fornecidos, eles podem ser coordenadas relativas simples do desenho; o runtime ajusta automaticamente o grafo ao canvas do card.

## Contrato de escopo

O planejamento estrutural usa `aralearn.scope.v1` como entrada.

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

Esse contrato não substitui o projeto persistido. Ele é uma entrada controlada para gerar ou reorganizar a estrutura.
