# Contrato JSON do AraLearn

O contrato único atual usa `contract: "aralearn.contract"`, `version: 1` e `kind: "project"`.

Ele declara intenção autoral simples. O motor interno deriva runtime, layout, exercícios, índices, ids e renderização.

## Raiz

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

## Hierarquia

```text
project
  course
    module
      lesson
        microsequence
          card
```

Campos estruturais:

- `title`: obrigatório em curso, módulo, lição e microssequência.
- `description`: opcional em curso, módulo e lição.
- `tags`: opcional em microssequência.
- `cards`: obrigatório em microssequência; pode ser vazio.
- `key`: opcional em qualquer nível; quando ausente, o validador gera chave estável a partir do título.

## Cards

Cards não usam `type`. A intenção principal é inferida por campos semânticos.

Campos comuns:

- `key`: opcional.
- `title`: opcional, mas recomendado.
- `say`: texto explicativo ou texto com lacunas.
- `after`: comentário final exibido no botão de continuação.
- `wrong`: distratores para `ask` ou para lacunas textuais simples.

Campos que definem a intenção principal:

- `ask`: múltipla escolha; exige `answer` e `wrong`.
- `code`: bloco de código; aceita `language`.
- `table`: tabela com `columns` e `rows`.
- `tree`: árvore de diretórios expositiva, sem prática.
- `flow`: fluxograma; aceita prática por `blank`.

Exemplo textual:

```json
{
  "title": "Ideia central",
  "say": "O modelo cascata organiza o trabalho em fases sequenciais.",
  "after": "A sequência é o ponto principal antes de discutir exceções."
}
```

Exemplo de escolha:

```json
{
  "title": "Leitura rápida",
  "ask": "Qual estrutura agrupa cards?",
  "answer": "Microssequência",
  "wrong": ["Curso", "Módulo"]
}
```

Exemplo de lacuna textual:

```json
{
  "title": "Complete",
  "say": "Todo card pertence a uma [[microssequência]].",
  "wrong": ["lição", "módulo"]
}
```

Exemplo de código:

```json
{
  "title": "Trecho de código",
  "say": "Observe o identificador do contrato.",
  "language": "json",
  "code": "{ \"contract\": \"aralearn.contract\" }"
}
```

Exemplo de tabela:

```json
{
  "title": "Campos principais",
  "table": {
    "columns": ["Campo", "Uso"],
    "rows": [
      ["say", "Explicação ou lacuna textual"],
      ["ask", "Pergunta de múltipla escolha"]
    ]
  }
}
```

Exemplo de árvore:

```json
{
  "title": "Árvore de diretórios",
  "say": "A árvore mostra o diretório atual.",
  "tree": {
    "base": "/",
    "current": "/home/aluno/projetos",
    "selected": "/home/aluno/projetos/README.txt",
    "closed": ["/home/aluno/downloads"],
    "items": {
      "home": {
        "aluno": {
          "downloads": {},
          "projetos": {
            "README.txt": null
          }
        }
      }
    }
  }
}
```

Em `tree.items`, objeto representa pasta e `null` representa arquivo.

Exemplo de fluxo:

```json
{
  "title": "Fluxo básico",
  "flow": [
    { "start": "Início" },
    { "process": "Validar", "blank": true },
    {
      "if": "Está correto?",
      "blank": { "target": "label", "key": "yes", "options": ["Sim", "Não"] },
      "then": [{ "output": "Renderizar" }],
      "else": [{ "process": "Revisar" }]
    },
    { "end": "Fim" }
  ]
}
```

`flow` aceita `start`, `end`, `input`, `output`, `process`, `if`, `while`, `do_while`, `for`, `chain` e `switch`. O campo público `blank` é convertido pelo motor para a prática interna de símbolo, texto ou rótulo.

## Regras

- Não use `type`, `text`, `runtime`, `intent`, `data`, `src`, `image` ou `simulator` no JSON público.
- `runtime` é sempre derivado pelo motor.
- `tree` é apenas expositivo no contrato atual.
- `flow` mantém toda a funcionalidade de fluxograma e prática por meio de `blank`.
- Importação e exportação usam o mesmo envelope `project`; recortes de curso, módulo, lição ou microssequência são projetos parciais com a mesma raiz.

Exemplo renderizável:

- `docs/examples/aralearn-contract.renderable.json`
