# Auditoria acadêmica dos resources

## Finalidade

Esta matriz transforma a revisão do catálogo em um processo repetível. Um
package existe somente quando conserva uma estrutura disciplinar que seria
perdida em prosa, tabela ou desenho genérico. O contrato declara o objeto e sua
semântica; bibliotecas de layout e notação calculam a geometria. O autor e o
GPT não fornecem coordenadas, pixels, cores ou rotas.

“Canônico” não significa que uma única figura seja universal. Significa que o
package explicita a tradição de representação adotada, limita seu escopo e não
improvisa símbolos de outra área. A validação automatizada verifica contrato,
materialização, interação e geometria; a eficácia pedagógica continua sendo
uma hipótese que exige estudo com pessoas.

## Matriz de seleção

| Família | Package | Objeto preservado | Use quando | Não use como |
|---|---|---|---|---|
| Texto | `paragraph` | prosa progressiva | situar, explicar e articular conceitos | recipiente para tabela, código ou fórmula estrutural |
| Texto | `annotated_text` | trechos e anotações ancoradas | localizar evidência, função ou comentário no próprio texto | parágrafo seguido de notas soltas |
| Linguística | `interlinear_gloss` | forma, segmentação, glosa e tradução | analisar morfemas segundo glosa interlinear | três linhas de texto alinhadas por espaços |
| Programação | `code` | código com sintaxe e lacuna interna | ler ou completar programa executável | pseudocódigo sem convenção declarada |
| Programação | `algorithm_trace` | estados sucessivos de execução | prever variáveis e decisões de um algoritmo | tabela genérica de resultados finais |
| Programação | `flow` | fluxo de controle algorítmico | acompanhar condição, laço, junção, entrada e saída | BPMN, árvore ou máquina de estados |
| Estruturas | `sequence` | ordem linear sem decisão | observar uma sucessão simples | fluxograma ou exercício de ordenação |
| Estruturas | `tree` | hierarquia enraizada | ancestralidade, decomposição e árvores de busca | grafo arbitrário ou lista indentada decorativa |
| Matemática | `formula` | AST matemática e operadores | expressões, integrais, derivadas, produtos e tensores | LaTeX livre ou texto matemático ambíguo |
| Matemática | `matrix` | matriz sem cabeçalhos tabulares | álgebra linear e transformações matriciais | tabela entre colchetes |
| Matemática | `plane` | pontos, vetores, trajetórias e regiões em ℝ² | geometria analítica e transformações lineares | gráfico estatístico ou desenho sem eixos |
| Matemática discreta | `graph` | grafo ou dígrafo matemático | vértices, arestas, pesos, laços e caminhos | mapa conceitual, rede física ou arquitetura de software |
| Lógica | `truth_table` | valoração de fórmulas | equivalência, validade e consequência em casos finitos | lista de respostas booleanas |
| Conjuntos | `set_diagram` | regiões de conjuntos | pertencimento e interseção espacial | relação binária entre dois domínios |
| Relações | `relation_map` | pares de uma relação binária | domínio, contradomínio, imagem e propriedades de função | arquitetura ou fluxo entre componentes |
| Dados | `entity_relationship` | modelo conceitual ER | entidades, atributos identificadores e cardinalidades | esquema físico ou tabela de dados |
| Dados | `database_schema` | modelo relacional | relações, atributos, PK, FK, nulabilidade e dependências | diagrama ER com caixas renomeadas |
| Sistemas | `memory_layout` | intervalos de endereços | segmentos de memória e crescimento relativo | pilha de chamadas |
| Sistemas | `call_stack` | ativações e quadros de função | retorno, parâmetros, variáveis locais e profundidade | mapa global do processo |
| Redes | `packet_layout` | campos contíguos em linhas de bits | cabeçalhos definidos em RFCs e protocolos | tabela comum de nomes e valores |
| Redes | `network_topology` | dispositivos, segmentos e enlaces | conectividade física ou lógica de rede | grafo abstrato de teoria dos grafos |
| Comportamento | `state_machine` | estados e transições rotuladas | ciclo de vida dependente de eventos | sequência linear de passos |
| Comportamento | `state_transition_table` | função de transição tabular | comparar estado atual, evento, guarda, ação e próximo estado | tabela de dados sem semântica de estado |
| Processos | `bpmn_process` | colaboração BPMN | pools, raias, tarefas, gateways e mensagens | fluxograma de algoritmo |
| Software | `software_system_context` | contexto C4 | sistema em foco, pessoas e sistemas externos | diagrama de contêineres internos |
| Software | `software_container` | contêineres C4 | aplicações, armazenamentos e relações dentro do sistema | classes ou implantação física detalhada |
| Sistemas | `system_internal_block` | bloco interno SysML | partes, portas, conectores e itens transportados | mapa genérico de caixas e setas |
| Química | `reaction` | equação química | reagentes, produtos, coeficientes, estados, condições e tipo de seta | descrição completa dos níveis macro e submicroscópico |
| Dados quantitativos | `chart` | séries, escalas e incerteza | linha, dispersão ou barras com unidades e método | histograma, boxplot ou regressão improvisados |
| Comparação | `table` | registros comparáveis por atributo | leitura cruzada entre linhas e colunas | matriz matemática ou esquema relacional |

`choice`, `gap`, `ordering` e `matching` são packages de resposta, não
representações de conteúdo. Lacuna e digitação só podem atingir folhas
declaradas pelo package de conteúdo e aparecem dentro da representação.

## Casos de estresse e critérios de aceitação

O curso **Teste de Recursos** contém exposição e práticas internas para todo o
catálogo. Exemplos triviais foram substituídos por casos capazes de revelar
defeitos: busca binária com estados, cabeçalho TCP multilinha, relação
muitos-para-muitos, transformação linear com regiões, série estatística com
incerteza, processo BPMN com dois participantes e retorno, grafo com pesos e
paralelismo e esquemas conceitual e relacional distintos.

Os **Laboratórios acadêmicos** em `/teste-academico` materializam recortes de
Algoritmos e Bancos de Dados de um curso superior de tecnologia, além de TCP e
BPMN em um recorte de edital público. Eles não são cursos publicados: são ensaios de
autoria usados para provar ou refutar as seguintes hipóteses:

1. a primeira explicação situa o problema sem presumir vocabulário técnico;
2. notação densa só aparece depois do referente concreto;
3. cada prática depende de uma microssequência expositiva e cobra somente
   tópicos já ensinados;
4. o resource é escolhido depois da operação cognitiva e não por variedade;
5. a prática inclui recuperação, discriminação, ordenação e transferência;
6. todo card conserva proveniência oficial;
7. diagramas complexos preservam tamanho legível numa viewport local, sem
   obrigatoriedade de caber na largura móvel.

Há verificações automáticas para essas propriedades do corpus, para a ausência
de geometria autoral nos contratos automáticos, para temas claro e escuro e
para larguras móveis. A auditoria visual mede o SVG final no Chromium; não se
limita aos valores anteriores à compilação.

## Referências normativas e técnicas principais

- IFSP São Paulo. [Tecnologia em Análise e Desenvolvimento de Sistemas](https://spo.ifsp.edu.br/tads).
- OMG. [Business Process Model and Notation 2.0](https://www.omg.org/spec/BPMN/2.0/).
- OMG. [Unified Modeling Language](https://www.omg.org/spec/UML/).
- OMG. [SysML v1](https://www.omg.org/sysml/sysmlv1/).
- RFC Editor. [RFC 9293 — Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html).
- Graphviz. [`dot`: hierarchical drawing of directed graphs](https://graphviz.org/docs/layouts/dot/).
- Vega-Lite. [Documentation](https://vega.github.io/vega-lite/docs/).
- Leipzig Glossing Rules. [Conventions for interlinear morpheme-by-morpheme glosses](https://www.eva.mpg.de/lingua/resources/glossing-rules.php).

Outras fontes pedagógicas e disciplinares estão reunidas em
[`fundamentacao-pedagogica-dos-resources.md`](./fundamentacao-pedagogica-dos-resources.md).
