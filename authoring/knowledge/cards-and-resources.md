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

## Escolha e lacuna

Uma escolha precisa de pergunta, opções identificáveis e resposta aceita. As alternativas devem compartilhar forma gramatical e nível de detalhe. Evite pistas produzidas por comprimento, repetição, precisão excessiva ou palavras exclusivas do texto teórico.

Uma lacuna deve aceitar as opções previstas pelo contrato e preservar contexto suficiente para que a resposta dependa do conceito ensinado, não de adivinhação.

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
- Preserve indentação e quebras significativas.
- Não use reticências para esconder a parte necessária à resolução.
- Quando houver lacuna, deixe claro o ponto editável e as opções aceitas.
- O feedback deve explicar o comportamento do trecho, não apenas repetir a resposta.

## Verificação antes do envio

Confirme a forma completa de cada recurso em `docs/recursos-de-card.md`. Exemplos visuais ajudam a escolher o formato, mas não autorizam campos fora do contrato.
