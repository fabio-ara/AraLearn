# Recursos de card

Os recursos de card definem como o conteúdo é apresentado e praticado no AraLearn. Texto, código, tabela, árvore, grafo e fórmula não são variações decorativas. Cada recurso conserva uma estrutura que faz parte do conhecimento estudado.

O conteúdo enviado para autoria é formado por objetos JSON com campos conhecidos. O AraLearn valida esses campos, compila as lacunas e renderiza o resultado de modo determinístico. O servidor não interpreta uma descrição em português para decidir onde inserir controles nem transforma prosa em HTML.

A API e o gateway MCP permitem listar os recursos e consultar a forma completa de cada um. A consulta devolve finalidade, campos, alvos de lacuna e exemplo aceito. O assistente deve usá-la antes de produzir uma representação que ainda não examinou na parte, em vez de completar o esquema por memória ou acrescentar propriedades livres.

## Campos comuns

Todo card possui:

| Campo | Finalidade |
|---|---|
| `id` | identidade estável dentro do curso |
| `position` | ordem do card na microssequência |
| `resource` | forma de apresentação |
| `kind` | `theory` ou `exercise` |
| `exercise` | `none`, `gap` ou `choice` |
| `title` | título apresentado ao estudante |
| `after` | explicação mostrada depois da resposta |

O recurso define os demais campos. Um card `matrix` usa linhas e colunas; um `graph` usa vértices e arestas; um `formula` usa uma árvore de expressão.

### Idioma e direção

`languageTag` recebe uma etiqueta BCP 47, como `pt-BR`, `en`, `ar`, `zh-Hant` ou `ja`. `textDirection` aceita `auto`, `ltr` ou `rtl`.

```json
{
  "id": "card-saudacao-arabe",
  "position": 1,
  "resource": "paragraph",
  "kind": "theory",
  "exercise": "none",
  "title": "التحية",
  "text": "مرحبًا تحية شائعة.",
  "languageTag": "ar",
  "textDirection": "rtl",
  "after": "تُستخدم هذه العبارة عند اللقاء."
}
```

Em `composite`, cada bloco também pode declarar idioma e direção. Quando esses campos não aparecem no bloco, ele acompanha o card.

## Lacunas na autoria

Uma lacuna é declarada em dois lugares do mesmo card:

1. o campo exato do recurso recebe `{gap:id}`;
2. `gaps` informa a resposta e a forma de interação para esse `id`.

```json
{
  "id": "card-operador-endereco",
  "position": 2,
  "resource": "paragraph",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Operador de endereço",
  "text": "Em C, {gap:operador} obtém o endereço de uma variável.",
  "gaps": [
    {
      "id": "operador",
      "response": "choice",
      "answer": "&",
      "distractors": ["*", "%", "&&"]
    }
  ],
  "after": "`&` devolve o endereço do objeto ao qual é aplicado."
}
```

O `id` liga o marcador à sua definição. Não se informa caminho, seletor, coordenada ou trecho de HTML. A posição do marcador no próprio campo já determina o alvo.

Cada `id` deve:

- aparecer uma única vez no recurso;
- possuir uma definição em `gaps`;
- usar letras, números, ponto, hífen, sublinhado ou dois-pontos;
- identificar uma resposta de até 120 caracteres e uma única linha.

O mesmo card pode conter várias lacunas, desde que cada uma tenha um `id` distinto.

### Resposta por alternativas

Use `response: "choice"` quando o objetivo for discriminar opções plausíveis. Informe de um a cinco distratores.

```json
{
  "id": "indice",
  "response": "choice",
  "answer": "i",
  "distractors": ["n", "lista", "1"]
}
```

A resposta e os distratores precisam ser distintos. O servidor monta as alternativas e preserva a resposta correta.

### Resposta digitada

Use `response: "text"` quando houver uma resposta inequívoca e adequada ao teclado do estudante. Nesse modo, omita `distractors`. Se houver poucas grafias literais objetivamente equivalentes, declare-as em `acceptedAnswers`.

```json
{
  "id": "resultado",
  "response": "text",
  "answer": "42",
  "acceptedAnswers": ["quarenta e dois"]
}
```

`acceptedAnswers` admite no máximo oito valores distintos da resposta principal. Cada valor ocupa uma linha e tem no máximo 120 caracteres. A comparação aplica somente a normalização objetiva do runtime, como espaços externos, caixa e forma Unicode. Não há regex, expansão de abreviações nem inferência semântica.

Digitação não é adequada quando as variações não podem ser enumeradas de maneira finita, literal e auditável. Nessa situação, prefira alternativas.

### Compilação e contrato público

Antes de persistir o fragmento, o servidor:

1. confere se o recurso aceita lacuna;
2. localiza cada `{gap:id}` somente nos campos interativos previstos;
3. rejeita marcador ausente, repetido ou não declarado;
4. converte a declaração para a representação interna do contrato v3;
5. valida o card compilado com os mesmos validadores usados pelo aplicativo.

Arquivos v3 importados ou exportados podem conter a sintaxe interna `[[...]]`. Ela existe para o runtime e para o round-trip do contrato público. Agentes e integrações de autoria não devem produzi-la nem misturá-la com `{gap:id}`.

## Campos que aceitam lacunas

| Recurso | Campos autorais interativos |
|---|---|
| `paragraph` | `text` |
| `code` | `code` |
| `table` | células de `rows` |
| `flow` | campo textual completo de um nó ou condição; formas e rótulos usam `structure.practice` |
| `tree` | `nodes[].label` |
| `graph` | `vertices[].label`, `edges[].label`, `edges[].weight` |
| `relation_map` | rótulos dos itens, rótulos das relações, `pairList` e células de `relationTable.rows` |
| `matrix` | células de `values` ou `sequence[].values` |
| `plane` | `result`, quando for texto |
| `formula` | `value` de uma folha da expressão, com espelho em `accessibleText` |
| `composite` | os campos interativos dos blocos internos |

`choice` já é uma interação por alternativas e não recebe `gaps`.

## `paragraph`

Apresenta explicação, definição, regra, síntese ou contraste. Em prática, a lacuna fica em `text`.

```json
{
  "id": "card-conjuncao",
  "position": 1,
  "resource": "paragraph",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Conjunção",
  "text": "A conjunção é verdadeira quando {gap:condicao}.",
  "gaps": [
    {
      "id": "condicao",
      "response": "choice",
      "answer": "as duas proposições são verdadeiras",
      "distractors": [
        "ao menos uma proposição é verdadeira",
        "as duas proposições são falsas"
      ]
    }
  ],
  "after": "A conjunção exige que ambas as proposições sejam verdadeiras."
}
```

Não use `paragraph` como substituto automático de uma estrutura que precisa ser vista em código, tabela, grafo ou outro recurso.

## `choice`

Apresenta uma pergunta objetiva com alternativas. Use quando a decisão entre opções é a própria operação praticada.

```json
{
  "id": "card-endereco-choice",
  "position": 2,
  "resource": "choice",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Valor ou endereço",
  "question": "Qual expressão obtém o endereço de `x` em C?",
  "options": [
    { "id": "a", "text": "&x" },
    { "id": "b", "text": "*x" },
    { "id": "c", "text": "x++" }
  ],
  "answer": "a",
  "after": "`&x` obtém o endereço da variável."
}
```

Uma sequência inteira de cards não deve recorrer a `choice` apenas por ser simples de produzir. Quando a estrutura estudada puder receber a resposta no próprio lugar, use a lacuna incorporada ao recurso.

No plano de autoria, cada operação declara `representation.preferredResources`, `representation.allowedResources` e `representation.rationale`. Os recursos preferenciais são as representações mais adequadas à operação. Os permitidos delimitam alternativas válidas e contêm todos os preferenciais. Todo card da operação respeita essa lista; cada parte usa ao menos um recurso preferencial e o aplica numa prática quando houver atividade da operação. A regra não estabelece cota de recursos nem exige variedade sem finalidade.

## `code`

Conserva linguagem, sintaxe, ordem e indentação. A lacuna fica dentro de `code`.

```json
{
  "id": "card-laco-python",
  "position": 3,
  "resource": "code",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Percorrer uma lista",
  "prompt": "Complete o identificador usado para receber cada item.",
  "language": "python",
  "code": "total = 0\nfor {gap:item} in valores:\n    total += item",
  "gaps": [
    {
      "id": "item",
      "response": "choice",
      "answer": "item",
      "distractors": ["valores", "total", "for"]
    }
  ],
  "after": "`item` recebe um elemento de `valores` a cada iteração."
}
```

O marcador substitui somente o trecho omitido. Todo o contexto necessário, inclusive a indentação, permanece no próprio card.

## `table`

Apresenta relações em linhas e colunas. Uma célula textual de `rows` pode conter a lacuna.

```json
{
  "id": "card-tabela-conjuncao",
  "position": 4,
  "resource": "table",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Tabela-verdade da conjunção",
  "columns": ["P", "Q", "P ∧ Q"],
  "rows": [
    ["V", "V", "{gap:vv}"],
    ["V", "F", "F"],
    ["F", "V", "F"],
    ["F", "F", "F"]
  ],
  "gaps": [
    {
      "id": "vv",
      "response": "choice",
      "answer": "V",
      "distractors": ["F"]
    }
  ],
  "after": "A conjunção é verdadeira apenas na primeira linha."
}
```

O cabeçalho permanece fixo. A lacuna deve ocupar a célula cuja determinação representa o objetivo da prática.

## `tree`

Apresenta hierarquia. Cada nó possui `id`, `label`, `type` e `parentId`. `folder` representa um ramo; `file`, uma folha.

```json
{
  "id": "card-arvore-classificacao",
  "position": 5,
  "resource": "tree",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Classificação biológica",
  "prompt": "Complete o táxon intermediário.",
  "nodes": [
    {
      "id": "animalia",
      "label": "Animalia",
      "type": "folder",
      "parentId": null
    },
    {
      "id": "chordata",
      "label": "{gap:filo}",
      "type": "folder",
      "parentId": "animalia"
    },
    {
      "id": "sapiens",
      "label": "Homo sapiens",
      "type": "file",
      "parentId": "chordata"
    }
  ],
  "gaps": [
    {
      "id": "filo",
      "response": "choice",
      "answer": "Chordata",
      "distractors": ["Mammalia", "Primates", "Hominidae"]
    }
  ],
  "after": "Chordata é o filo situado entre o reino Animalia e os níveis inferiores mostrados."
}
```

A prática preserva a posição do nó e pede o elemento da hierarquia no próprio lugar.

## `graph`

Apresenta vértices e arestas direcionadas ou não direcionadas. Vértices aceitam lacunas em `label`; arestas, em `label` ou `weight`.

```json
{
  "id": "card-grafo-peso",
  "position": 6,
  "resource": "graph",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Peso da aresta",
  "prompt": "Complete o custo do caminho direto.",
  "vertices": [
    { "id": "A", "label": "A", "x": 20, "y": 50 },
    { "id": "B", "label": "B", "x": 80, "y": 50 }
  ],
  "edges": [
    {
      "from": "A",
      "to": "B",
      "weight": "{gap:peso}",
      "directed": true
    }
  ],
  "gaps": [
    {
      "id": "peso",
      "response": "text",
      "answer": "7"
    }
  ],
  "after": "A aresta dirigida de A para B possui peso 7."
}
```

`x` e `y` são opcionais e variam de 0 a 100. Quando não aparecem, o renderer calcula uma disposição legível.

## `relation_map`

Apresenta dois conjuntos e as relações entre seus elementos. Aceita lacunas nos rótulos dos itens, nos rótulos das relações, em `pairList` e nas células de `relationTable.rows`.

```json
{
  "id": "card-relacao-pares",
  "position": 7,
  "resource": "relation_map",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Diagrama e pares ordenados",
  "prompt": "Complete o segundo par.",
  "leftSet": {
    "label": "U",
    "items": [
      { "id": "A", "label": "A" },
      { "id": "B", "label": "B" }
    ]
  },
  "rightSet": {
    "label": "V",
    "items": [
      { "id": "1", "label": "1" },
      { "id": "2", "label": "2" }
    ]
  },
  "relations": [
    { "from": "A", "to": "1" },
    { "from": "B", "to": "2" }
  ],
  "pairList": ["(A, 1)", "{gap:segundo-par}"],
  "gaps": [
    {
      "id": "segundo-par",
      "response": "choice",
      "answer": "(B, 2)",
      "distractors": ["(B, 1)", "(A, 2)"]
    }
  ],
  "after": "Cada ligação do diagrama corresponde a um par ordenado."
}
```

Os identificadores usados em `relations` apontam para os itens dos conjuntos. A lacuna altera o conteúdo praticado, não essas referências estruturais.

## `matrix`

Apresenta uma matriz ou uma sequência de matrizes. Células textuais de `values` e de `sequence[].values` aceitam lacunas.

```json
{
  "id": "card-matriz-produto",
  "position": 8,
  "resource": "matrix",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Produto por escalar",
  "prompt": "Complete o elemento inferior direito da matriz resultante.",
  "sequence": [
    {
      "name": "A",
      "values": [["1", "2"], ["3", "4"]]
    },
    {
      "name": "2A",
      "connector": "→",
      "values": [["2", "4"], ["6", "{gap:elemento}"]]
    }
  ],
  "gaps": [
    {
      "id": "elemento",
      "response": "text",
      "answer": "8"
    }
  ],
  "after": "Cada elemento de A foi multiplicado por 2."
}
```

Não converta a matriz em texto linear. Linha, coluna e sequência precisam continuar visíveis.

## `plane`

Apresenta ponto, vetor, soma, escala ou distância no plano cartesiano. `result` aceita lacuna quando seu valor é textual.

```json
{
  "id": "card-vetor-soma",
  "position": 9,
  "resource": "plane",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Soma de vetores",
  "prompt": "Determine a soma representada.",
  "sum": [[2, 1], [1, 3]],
  "result": "{gap:soma}",
  "gaps": [
    {
      "id": "soma",
      "response": "choice",
      "answer": "(3, 4)",
      "distractors": ["(1, 2)", "(3, 3)", "(2, 4)"]
    }
  ],
  "after": "As componentes são somadas por posição: (2 + 1, 1 + 3)."
}
```

As formas numéricas `x`, `y`, `vector`, `vectors`, `sum`, `scale` e `distance` continuam estruturadas. A resposta textual ocupa `result`.

## `formula`

Apresenta notação matemática ou química por meio de uma árvore de expressão. O AraLearn converte essa árvore em MathML. O conteúdo não envia HTML, MathML nem LaTeX.

Uma lacuna fica no `value` de uma folha da expressão. `accessibleText` deve repetir os mesmos marcadores, na mesma ordem, para que a versão acessível e a representação visual nunca divirjam.

```json
{
  "id": "card-formula-fracao",
  "position": 10,
  "resource": "formula",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Numerador da fração",
  "prompt": "Complete o numerador.",
  "notation": "mathematics",
  "accessibleText": "{gap:numerador} sobre quatro",
  "expression": {
    "type": "fraction",
    "numerator": {
      "type": "identifier",
      "value": "{gap:numerador}"
    },
    "denominator": {
      "type": "number",
      "value": "4"
    }
  },
  "gaps": [
    {
      "id": "numerador",
      "response": "choice",
      "answer": "x",
      "distractors": ["4", "y", "2"]
    }
  ],
  "after": "O numerador é o elemento acima da barra da fração."
}
```

`notation` aceita `mathematics` ou `chemistry`. Os nós da expressão são:

| Tipo | Campos próprios |
|---|---|
| `number`, `identifier`, `operator`, `text` | `value` |
| `row` | `children` |
| `fraction` | `numerator`, `denominator` |
| `root` | `radicand` e, quando necessário, `index` |
| `superscript` | `base`, `exponent` |
| `subscript` | `base`, `subscript` |
| `subsup` | `base`, `subscript`, `superscript` |
| `fenced` | `open`, `close`, `content` |

Os delimitadores aceitos em `fenced` são `()`, `[]`, `{}`, `||`, `‖‖` e `⟨⟩`. A árvore aceita Unicode e rejeita marcação, campos desconhecidos, profundidade excessiva ou nós desconectados.

## `flow`

Apresenta sequência, decisão, repetição ou desvio. A raiz de `structure` é sempre `sequence`.

Na autoria declarativa, `{gap:id}` ocupa sozinho o campo textual completo:

- `text` em `start`, `end`, `input`, `output` ou `process`;
- `condition` em `if_then`, `if_then_else`, `while`, `do_while` ou `for`;
- `condition` de um caso em `if_chain`.

```json
{
  "id": "card-fluxo-condicao",
  "position": 11,
  "resource": "flow",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Condição do desvio",
  "prompt": "Complete a condição que separa valores positivos.",
  "structure": {
    "id": "raiz",
    "kind": "sequence",
    "items": [
      {
        "id": "decisao",
        "kind": "if_then_else",
        "condition": "{gap:condicao}",
        "thenBranch": [
          {
            "id": "saida-positiva",
            "kind": "output",
            "text": "imprimir positivo"
          }
        ],
        "elseBranch": [
          {
            "id": "saida-restante",
            "kind": "output",
            "text": "imprimir não positivo"
          }
        ]
      }
    ]
  },
  "gaps": [
    {
      "id": "condicao",
      "response": "choice",
      "answer": "x > 0",
      "distractors": ["x < 0", "x = 0", "x >= 0"]
    }
  ],
  "after": "`x > 0` encaminha somente os valores positivos ao primeiro ramo."
}
```

O servidor conserva a resposta completa em `condition` e cria o `practice.text` estrutural que indica ao renderer onde esconder e recolher a resposta. O marcador não pode ser misturado a outro texto no mesmo campo de `flow`.

Formas dos nós e rótulos dos ramos não são texto comum. Para praticá-los, `structure.practice` declara a operação diretamente:

```json
{
  "id": "decisao",
  "kind": "if_then_else",
  "condition": "temperatura > limite",
  "practice": {
    "blankShape": true,
    "shapeOptions": ["process", "input_output"],
    "labels": {
      "yes": {
        "blank": true,
        "mode": "choice",
        "options": [
          { "id": "nao", "value": "Não", "enabled": true }
        ]
      }
    }
  },
  "thenBranch": [],
  "elseBranch": []
}
```

`practice.blankShape` oculta a forma correta, derivada do `kind` do nó. `shapeOptions` acrescenta alternativas de forma. `practice.labels` identifica o ramo por uma chave estrutural, como `yes`, `no`, `match` ou `default`; o rótulo correto deriva da aresta projetada. Para texto digitado, a entrada aceita `blank: true` e pode declarar grafias equivalentes em `variants`; para alternativas, usa `mode: "choice"` e `options`.

Esses alvos não usam `{gap:id}`. Um card `flow` pode ter somente essa prática estruturada e, nesse caso, não declara `gaps`. Se o mesmo card também ocultar `text` ou `condition`, esses campos usam os marcadores e as definições formais normais.

## `composite`

Apresenta vários blocos no mesmo card. Use quando a operação depende da proximidade entre explicação e representação.

As lacunas são declaradas no card e os marcadores ficam nos campos interativos dos blocos.

```json
{
  "id": "card-composite-sql",
  "position": 12,
  "resource": "composite",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Consulta e resultado",
  "blocks": [
    {
      "kind": "paragraph",
      "value": "A consulta deve conservar apenas as linhas com situação ativa."
    },
    {
      "kind": "code",
      "language": "sql",
      "prompt": "Complete a cláusula de filtro.",
      "code": "SELECT nome\nFROM pessoas\n{gap:filtro};"
    },
    {
      "kind": "table",
      "columns": ["nome", "situação"],
      "rows": [
        ["Ana", "ativa"],
        ["Beto", "inativa"]
      ]
    }
  ],
  "gaps": [
    {
      "id": "filtro",
      "response": "choice",
      "answer": "WHERE situacao = 'ativa'",
      "distractors": [
        "ORDER BY situacao = 'ativa'",
        "GROUP BY situacao = 'ativa'"
      ]
    }
  ],
  "after": "`WHERE` filtra as linhas antes da apresentação do resultado."
}
```

O card possui uma única ordem de lacunas, mesmo quando elas aparecem em blocos diferentes. Cada bloco conserva as regras do seu próprio recurso.

## Escolha didática

O recurso deve preservar a operação que o estudante precisa compreender ou executar:

- complete código dentro de `code`, sem convertê-lo em pergunta solta;
- complete uma célula no próprio `table` ou `matrix`;
- complete um nó no lugar que ele ocupa em `tree`;
- complete rótulo ou peso sobre o `graph`;
- complete o elemento dentro da árvore de `formula`;
- use `choice` quando comparar alternativas for a operação pretendida.

Uma microssequência pode variar recursos e focos de prática sem aumentar a densidade de cada card. A variação deve decorrer do objetivo didático, não de uma distribuição artificial de formatos.

Cada exercício precisa conter o contexto necessário para ser respondido. `after` explica por que a resposta é correta e, quando houver distratores, distingue os erros plausíveis.

## Referência

Mayer, R. E. (2009). *Multimedia learning* (2nd ed.). Cambridge University Press. <https://doi.org/10.1017/CBO9780511811678>
