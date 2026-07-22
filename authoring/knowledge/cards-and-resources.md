# Cards e recursos

O recurso deve tornar mais clara a operação que o estudante realiza. Não escolha um formato apenas para variar a aparência.

| Recurso | Uso adequado |
|---|---|
| `paragraph` | Explicação textual ou lacuna em texto. |
| `choice` | Decisão entre alternativas com uma resposta verificável. |
| `composite` | Combinação necessária de blocos, como dois grafos e uma escolha. |
| `code` | Leitura, explicação ou conclusão de código. |
| `table` | Comparação por linhas e colunas. |
| `flow` | Sequência, decisão, ramificação ou repetição. |
| `tree` | Hierarquia e relações entre pai e filho. |
| `graph` | Vértices, arestas, caminhos e conectividade. |
| `relation_map` | Correspondências entre dois conjuntos. |
| `matrix` | Posição, padrão ou operação matricial. |
| `plane` | Pontos, segmentos, vetores e relações no plano cartesiano. |
| `formula` | Frações, radicais, potências, índices e fórmulas químicas. |

Os doze recursos são possibilidades reais de planejamento, não uma lista decorativa. Examine a operação que será aprendida antes de escolher o formato. Programação pede `code` quando a sintaxe ou a execução importam; comparação pode pedir `table`; percurso e decisão podem pedir `flow`; hierarquia pode pedir `tree`; conectividade pode pedir `graph`; correspondência pode pedir `relation_map`; raciocínio espacial pode pedir `matrix` ou `plane`; notação matemática ou química pode pedir `formula`; elementos inseparáveis podem pedir `composite`.

Não imponha variedade artificial. Também não use `paragraph` e `choice` por hábito quando outro recurso tornar visível a estrutura do problema. Os recursos contextuais podem propor prática por escolha quando o contrato permitir. Nessa situação, a representação contém todos os dados necessários e a pergunta avalia uma decisão sobre ela.

## Escolha e lacuna

Uma escolha precisa de pergunta, opções identificáveis e resposta aceita. As alternativas devem compartilhar forma gramatical e nível de detalhe. Evite pistas produzidas por comprimento, repetição, precisão excessiva ou palavras exclusivas do texto teórico.

Uma lacuna deve preservar contexto suficiente para que a resposta dependa do conceito ensinado. Use `[[resposta]]` quando a evidência esperada for evocação digitada. Use `[[resposta::resposta|distrator 1|distrator 2]]` quando a evidência for distinguir alternativas plausíveis.

Uma prática nunca manda apenas “considerar o exemplo anterior”. Repita no próprio card os valores, nomes, trechos, relações ou demais dados particulares que serão usados. O estudante pode recuperar um conceito já ensinado, mas não deve reconstruir um caso que deixou de estar visível.

Na especificação, registre esses dados em `contextAnchors`. Use trechos exatos e discriminantes, como `pedidos(id, total)`, `12 mg/L`, `Lei 14.133/2021` ou `كتاب`. A âncora precisa aparecer em conteúdo visível ao estudante, como título, enunciado, texto, código, rótulo, valor ou alternativa. Identificadores internos, metadados, `after`, `answer` e respostas escondidas por `[[...]]` não satisfazem o vínculo.

## Recursos estruturados

Nós, arestas, células, pontos, linhas, opções e blocos têm identidade e ordem próprias na persistência. Produza somente relações válidas:

- uma aresta aponta para nós existentes;
- um nó filho aponta para pai existente ou para a raiz permitida;
- uma célula pertence à linha, coluna ou item definido pelo recurso;
- destaques apontam para elementos existentes;
- uma relação liga itens dos conjuntos declarados;
- coordenadas e vetores usam números finitos;
- respostas apontam para opções existentes.

## Cards compostos

Use `composite` quando os blocos formarem uma única tarefa que perderia sentido se fosse dividida. Cada bloco segue as regras de seu próprio tipo. A interação principal continua sendo única e verificável.

## Código

- Declare a linguagem.
- Repita a linguagem em `codeLanguage` no plano; a submissão não pode trocá-la.
- Preserve indentação e quebras significativas.
- Não use reticências para esconder a parte necessária à resolução.
- Quando houver lacuna, deixe claro o ponto editável. Só ofereça opções quando elas fizerem parte da decisão ensinada.
- O feedback deve explicar o comportamento do trecho, não apenas repetir a resposta.

## Fórmulas

- Use `formula` quando a estrutura da notação fizer parte do que será aprendido.
- Declare `notation` como `mathematics` ou `chemistry`.
- Preserve no card a mesma `notation` fixada no plano.
- Preencha `accessibleText` com a leitura completa da expressão.
- Construa `expression` com a árvore descrita em `docs/recursos-de-card.md`.
- Não envie HTML, MathML, LaTeX ou código executável. O AraLearn produz MathML a partir da árvore validada.
- Uma prática contextual conserva a expressão no próprio card e usa escolha entre alternativas.

## Verificação antes do envio

Confirme a forma completa de cada recurso em `docs/recursos-de-card.md`. Exemplos visuais ajudam a escolher o formato, mas não autorizam campos fora do contrato.
