# Contrato público do AraLearn

O contrato público define o formato persistido e exportável de um projeto AraLearn.

Ele existe por três razões:

1. permitir que o projeto seja salvo e carregado com segurança;
2. permitir importação, exportação e auditoria em JSON;
3. dar à IA um alvo estruturado, sem transformar a resposta do modelo em texto solto.

O contrato não é apenas detalhe técnico. Ele preserva a autoria do usuário: o conteúdo produzido ou revisado com auxílio de IA vira um documento controlado, validável e portável.

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
- `include`: termos que entram no módulo;
- `exclude`: termos que ficam fora;
- `notes`: observações do usuário;
- `assessmentStyle`: `"theoretical"`, `"practical"` ou `"mixed"`;
- `lessons`.

Declarar `include` e `exclude` é importante. O objetivo não é gerar uma enciclopédia, mas uma trilha com recorte definido pelo usuário.

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

A microssequência é a unidade didática central. Ela não é só uma pasta de cards. Ela tem objetivo, posição na trilha, estado, versões e possibilidade de apoio.

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

Versões existem para preservar histórico. Uma melhoria não deve apagar automaticamente a versão anterior.

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

O card é a unidade de interação. A microssequência é a unidade de estudo.

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

### `graph`

No caso de `graph`, o contrato público permanece propositalmente simples:

- `vertices` com `id`, `label` opcional e `x`/`y` opcionais;
- `edges` com `from`, `to`, `label` opcional e `weight` opcional;
- `highlight` com listas de vértices e pares de vértices.

Regras operacionais de `graph`:

- laços não são aceitos;
- multiarestas entre o mesmo par de vértices são aceitas quando o caso didático exigir;
- quando `x` e `y` são fornecidos, eles podem ser coordenadas relativas simples do desenho; o runtime ajusta automaticamente o grafo ao canvas do card.

## Contrato de escopo

O planejamento da trilha usa `aralearn.scope.v1` como entrada.

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

## Projeto e backup completo

O AraLearn reconhece dois formatos principais de troca.

### Projeto público

Representa o conteúdo estruturado:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

### Backup completo

Representa projeto e progresso:

```json
{
  "format": "aralearn.storage",
  "exportedAt": "2026-05-22T00:00:00.000Z",
  "project": {},
  "progress": {}
}
```

O progresso fica separado do conteúdo. Isso permite exportar a trilha como material e, quando necessário, exportar também o estado de estudo.

## Validação

A validação local é parte da arquitetura. Ela impede que um JSON inválido, uma resposta incompleta da IA ou um recurso desconhecido substitua o projeto.

O contrato público é, portanto, uma fronteira entre geração e persistência. A IA pode sugerir. O app valida. O usuário decide.
