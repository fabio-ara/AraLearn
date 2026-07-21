# Recursos de card

Recursos de card são as formas que o conteúdo pode assumir no AraLearn. Nem todo conteúdo técnico se explica bem em texto linear. Quando há relação espacial, tabular, algorítmica ou hierárquica, a forma de apresentação faz parte do que se aprende.

Mayer (2009) argumenta que palavras e representações visuais podem favorecer a compreensão quando combinadas de modo coerente. O aplicativo mostra cards oficiais ou pessoais já validados. A assistência de linguagem pode propor dados, mas o contrato e os validadores determinam o que pode ser aceito.

## Núcleo comum

Todo card possui `position`, `resource`, `kind`, `exercise`, `title` e `after`. O recurso define os demais campos. Um `matrix` usa valores em linhas e colunas; um `graph` usa vértices e arestas; um `plane` usa coordenadas; um `code` usa linguagem e trecho de código.

## `paragraph`

Representa explicação textual ou exercício com lacuna por opções.

Use quando o conteúdo pode ser formulado em texto: definição, regra, síntese, contraste ou pergunta de preenchimento.

Exemplo:

```json
{
  "position": 1,
  "resource": "paragraph",
  "kind": "theory",
  "exercise": "none",
  "title": "Endereço de uma variável",
  "text": "Em C, o operador & obtém o endereço de uma variável.",
  "after": "Endereço é a posição onde o valor está armazenado."
}
```

Erro que ajuda a evitar: transformar todo conteúdo em pergunta objetiva quando uma explicação direta é suficiente.

## `choice`

Representa uma pergunta objetiva com alternativas.

Use quando o estudante precisa tomar uma decisão clara: identificar uma saída, escolher uma definição, reconhecer um erro ou selecionar o próximo passo.

```json
{
  "position": 2,
  "resource": "choice",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Valor ou endereço",
  "question": "Qual expressão obtém o endereço de x em C?",
  "options": [
    { "id": "a", "text": "&x" },
    { "id": "b", "text": "*x" },
    { "id": "c", "text": "x++" }
  ],
  "answer": "a",
  "after": "`&x` obtém o endereço da variável."
}
```

Erro que ajuda a evitar: pedir resposta aberta em contexto móvel quando o objetivo é discriminar alternativas.

## `composite`

Representa um card com vários blocos: texto, código, tabela, grafo, matriz ou outro recurso aceito.

Use quando uma etapa precisa combinar explicação e representação no mesmo card.

```json
{
  "position": 3,
  "resource": "composite",
  "kind": "theory",
  "exercise": "none",
  "title": "Variável e memória",
  "blocks": [
    { "kind": "paragraph", "value": "A variável guarda um valor." },
    { "kind": "code", "language": "c", "code": "int x = 5;" }
  ],
  "after": "O nome da variável permite acessar o valor armazenado."
}
```

Erro que ajuda a evitar: separar artificialmente elementos que precisam ser vistos juntos.

## `code`

Representa trecho de código, comando ou exercício com código.

Use quando sintaxe, ordem, indentação, comando ou saída esperada fazem parte do conteúdo.

```json
{
  "position": 4,
  "resource": "code",
  "kind": "exercise",
  "exercise": "gap",
  "title": "Atribuição",
  "prompt": "Complete a linha que atribui 5 a x.",
  "language": "c",
  "code": "int x;\n[[x = 5;::x = 5;|x == 5;|int = x;]]",
  "after": "`x = 5;` atribui valor. `x == 5` compara."
}
```

Erro que ajuda a evitar: explicar programação sem mostrar forma concreta de código.

## `table`

Representa informação em linhas e colunas.

Use quando a relação tabular é essencial: comparação, tabela-verdade, parâmetros, comandos ou casos.

```json
{
  "position": 5,
  "resource": "table",
  "kind": "theory",
  "exercise": "none",
  "title": "Tabela-verdade da conjunção",
  "columns": ["P", "Q", "P && Q"],
  "rows": [["V", "V", "V"], ["V", "F", "F"], ["F", "V", "F"], ["F", "F", "F"]],
  "after": "A conjunção só é verdadeira quando P e Q são verdadeiras."
}
```

Erro que ajuda a evitar: descrever relações tabulares em prosa difícil de comparar.

## `matrix`

Representa matriz ou sequência de matrizes.

Use quando posição, linha, coluna, diagonal ou transformação matricial importam.

```json
{
  "position": 6,
  "resource": "matrix",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Linha e coluna",
  "prompt": "Observe a matriz.",
  "values": [["1", "2"], ["3", "4"]],
  "question": "Qual valor está na segunda linha e primeira coluna?",
  "options": [
    { "id": "a", "text": "3" },
    { "id": "b", "text": "2" },
    { "id": "c", "text": "4" }
  ],
  "answer": "a",
  "after": "Segunda linha e primeira coluna indica o valor 3."
}
```

Erro que ajuda a evitar: perder a estrutura espacial da matriz em texto corrido.

## `plane`

Representa plano cartesiano, ponto, vetor, soma, escala ou distância.

Use quando a relação espacial é parte do conceito.

```json
{
  "position": 7,
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
  "after": "O primeiro valor indica deslocamento horizontal; o segundo, deslocamento vertical."
}
```

Erro que ajuda a evitar: tratar vetor como par abstrato antes de o estudante reconhecer deslocamento.

## `graph`

Representa grafo com vértices e arestas.

Use em teoria dos grafos, dependências, redes, relações e estruturas conectadas.

```json
{
  "position": 8,
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

Erro que ajuda a evitar: falar de relações sem mostrar as conexões.

## `relation_map`

Representa dois conjuntos e relações entre seus elementos.

Use quando o estudante precisa ver pares, domínio, contradomínio, imagem ou correspondência.

```json
{
  "position": 9,
  "resource": "relation_map",
  "kind": "exercise",
  "exercise": "choice",
  "title": "Relação entre conjuntos",
  "prompt": "Observe os conjuntos e as relações.",
  "leftSet": {
    "label": "U",
    "items": [{ "id": "A", "label": "A" }, { "id": "B", "label": "B" }]
  },
  "rightSet": {
    "label": "V",
    "items": [{ "id": "1", "label": "1" }, { "id": "2", "label": "2" }]
  },
  "relations": [
    { "from": "A", "to": "1" },
    { "from": "B", "to": "2" }
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

Erro que ajuda a evitar: confundir relação visual com lista de pares sem correspondência clara.

## `flow`

Representa sequência, decisão ou repetição em forma de fluxo.

Use para algoritmo, processo, regra operacional, procedimento administrativo ou desvio condicional.

```json
{
  "position": 10,
  "resource": "flow",
  "kind": "theory",
  "exercise": "none",
  "title": "Decisão simples",
  "prompt": "Observe o teste condicional.",
  "structure": {
    "kind": "sequence",
    "items": [
      {
        "kind": "if_then_else",
        "condition": "x > 0",
        "thenBranch": [{ "kind": "process", "text": "imprimir positivo" }],
        "elseBranch": [{ "kind": "process", "text": "imprimir não positivo" }]
      }
    ]
  },
  "after": "A condição decide qual ramo será executado."
}
```

Erro que ajuda a evitar: explicar controle de fluxo sem mostrar a ramificação.

## `tree`

Representa estrutura hierárquica.

Use para pastas e arquivos, sintaxe, classificação, árvore de decisão ou decomposição de conteúdo.

```json
{
  "position": 11,
  "resource": "tree",
  "kind": "theory",
  "exercise": "none",
  "title": "Estrutura de arquivos",
  "prompt": "Observe a hierarquia.",
  "nodes": [
    { "id": "root", "label": "projeto", "type": "folder", "parentId": null },
    { "id": "src", "label": "src", "type": "folder", "parentId": "root" },
    { "id": "app", "label": "app.js", "type": "file", "parentId": "src" }
  ],
  "after": "A árvore mostra relação de pertencimento entre pasta e arquivo."
}
```

Erro que ajuda a evitar: descrever hierarquia sem deixar visível o nível de cada elemento.

## Critério didático

A pergunta para escolher um recurso não é “qual fica mais bonito?”, mas “qual forma preserva melhor a estrutura que o estudante precisa compreender?”. Se a estrutura não importa, `paragraph` ou `choice` costumam bastar. Se a estrutura importa, o recurso visual ou composto deixa de ser complemento e passa a fazer parte do ensino.

## Referências citadas

Mayer, R. E. (2009). *Multimedia learning* (2nd ed.). Cambridge University Press. <https://doi.org/10.1017/CBO9780511811678>
