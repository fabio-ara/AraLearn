# Auditoria acadêmica dos componentes didáticos

## 1. Finalidade e escopo

Um componente didático precisa preservar a relação que o estudante deve compreender
ou utilizar. A auditoria examina sua finalidade pedagógica, a convenção acadêmica
adotada e as condições de leitura e interação. Um **pacote de componente** é um
módulo que reúne os dados aceitos, as regras de validação e a forma de apresentação.
A verificação acompanha esse módulo do catálogo aos testes. A
[fundamentação pedagógica](fundamentacao-pedagogica-dos-resources.md) desenvolve os
critérios de escolha; o [contrato de componentes](componentes-didaticos.md) descreve
sua implementação.

Três perguntas orientam a auditoria:

1. **Validade representacional:** o componente preserva o objeto e a notação da área?
2. **Conformidade técnica:** a implementação apresenta os dados conforme o contrato,
   com relações legíveis e interações independentes?
3. **Utilidade didática:** estudantes conseguem interpretar e usar a representação
   na tarefa pretendida?

As duas primeiras recebem evidências por inspeção especializada e testes. A terceira
exige participantes realizando tarefas. Cada conclusão conserva o método e as
condições que a sustentam.

## 2. Unidade de auditoria

A unidade examinada é o pacote completo. Seu **contrato** define os dados aceitos e
seu significado; seus **alvos de prática** são os campos que podem receber uma
resposta do estudante. A **operação-alvo da tarefa** é o que a pessoa precisa fazer
com o conteúdo, como comparar, calcular ou explicar.

O pacote também é examinado dentro do percurso. No AraLearn, uma
**microssequência didática** reúne unidades de estudo que desenvolvem um objetivo
delimitado. O [modelo didático](modelo-didatico.md#prática-orientada-pela-operação-alvo-da-tarefa)
relaciona esse objetivo às explicações e às práticas que o percurso oferece.

Um **componente de conteúdo** representa o objeto estudado. Um **formato de
resposta** organiza como a pessoa manifesta uma decisão. Uma tabela, por exemplo,
pode apresentar dados ou oferecer células para preenchimento: a representação
conserva as relações entre linhas e colunas, enquanto a lacuna organiza a resposta.

Cada pacote de conteúdo deve declarar:

- objeto preservado e domínio de uso;
- estrutura semântica do contrato;
- operações-alvo das tarefas compatíveis;
- convenção disciplinar ou normativa;
- situações indicadas e contraindicadas;
- limites de complexidade;
- campos textuais editáveis;
- alvos possíveis de lacuna ou digitação;
- descrição não visual equivalente;
- estratégia de disposição, responsividade e estado interativo.

Cada pacote de resposta deve declarar o ciclo completo da interação. A identidade
do alvo orienta como a resposta é avaliada e limpa; a confirmação determina quando
o retorno aparece. O ciclo também precisa conservar a acessibilidade. A composição
entre conteúdo e resposta é válida quando a modalidade corresponde à operação
planejada.

## 3. Decisão de admissão no catálogo

Um catálogo crescente pode acumular componentes redundantes ou notações que
funcionam apenas em exemplos simples. A autoria passa a examinar mais opções, e o
estudante precisa descobrir como ler figuras cuja diferença pode ser apenas aparente.

Um novo objeto pode ser apresentado por um recurso geral, como prosa ou tabela, ou
por um pacote especializado. A especialização precisa conservar uma relação que os
recursos existentes perdem, seguir uma convenção reconhecível e atender a uma
operação própria. Seu custo de manutenção também participa da decisão.

O pacote entra no catálogo produtivo quando atende aos critérios abaixo. Quando um
componente mais simples preserva a mesma informação e a operação necessária,
prevalece essa alternativa.

Representações externas podem apoiar funções diferentes, mas coordená-las também
exige trabalho cognitivo ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). A
**coerência** orienta retirar elementos sem função na tarefa; a **contiguidade**,
aproximar informações que precisam ser integradas
([Mayer (2009)](referencias.md#ref-mayer2009multimedia);
[Ginns (2006)](referencias.md#ref-ginns2006contiguity)). Esses cuidados procuram
reduzir demandas de apresentação dispensáveis à aprendizagem pretendida
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload);
[Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)).

### Critérios de admissão

1. Qual relação se perde em `paragraph`, `table` ou outro pacote instalado?
2. Qual operação-alvo da tarefa depende dessa relação?
3. Qual convenção acadêmica ou normativa orienta a leitura?
4. O contrato expressa uma classe de casos ou apenas um exemplo codificado?
5. O autor declara o significado dos elementos e das relações, deixando o cálculo
   da apresentação ao componente?
6. A representação admite rótulos longos, quantidade realista de elementos e casos
   complexos?
7. Lacuna e digitação aparecem no lugar estrutural da decisão?
8. Vários alvos possuem identidade, opções e estado independentes?
9. Edição e assistência recebem somente textos autorizados?
10. A estrutura pode ser descrita sem depender de cor ou visão?
11. Temas, ampliação, teclado, toque e larguras móveis permanecem operáveis?
12. As limitações e alternativas estão explícitas no catálogo?
13. Um especialista do domínio reconhece a convenção adotada?
14. Existe tarefa empírica capaz de testar sua utilidade didática?

Um pacote pode ser altamente especializado quando preserva uma operação necessária.
O catálogo também pode registrar lacunas de cobertura. A autoria pode prosseguir
com uma alternativa que preserve o objetivo; perdas relevantes precisam ser
explicitadas para decisão humana.

Especialistas julgam a fidelidade da representação, e a avaliação com estudantes
examina sua interpretação e uso. Os critérios organizam essas verificações;
decisões de manter, restringir, fundir ou retirar permanecem revisáveis à luz
dos resultados.

## 4. Matriz dos componentes de conteúdo

### 4.1 Texto, linguagem e programação

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `paragraph` | exposição verbal progressiva | situar, definir, exemplificar, contrastar e explicar causalmente | uma relação espacial, formal ou tabular seria perdida | texto pode expor conteúdo, solicitar uma operação ou conter alvos textuais de prática; a escolha depende da tarefa |
| `annotated_text` | trechos ancorados e comentários relacionados | localizar evidência, função discursiva, argumento, correferência ou comentário em passagem específica | notas não precisam apontar para trechos precisos | destaque e anotação têm navegação bidirecional; sobreposição de trechos deve permanecer interpretável |
| `interlinear_gloss` | forma original, segmentação morfêmica, glosa e tradução livre | análise linguística morfema a morfema | três linhas independentes ou tradução sem alinhamento | segue as [Leipzig Glossing Rules](https://www.eva.mpg.de/lingua/resources/glossing-rules.php); lacuna ocupa morfema ou glosa sem quebrar alinhamento |
| `code` | código-fonte com sintaxe, indentação e posição dos elementos do código | ler, explicar, executar mentalmente ou completar programa | pseudocódigo não possui convenção definida ou a tarefa é apenas descrever algoritmo | fonte monoespaçada, quebras preservadas e alvo dentro do código apresentado; a lacuna fica no trecho de código pertinente |
| `flow` | fluxo de controle algorítmico | acompanhar entrada, processo, decisão, laço, junção e saída | processo organizacional, árvore ou máquina de estados | formas convencionais de fluxograma e rótulos nas arestas; [Graphviz](https://graphviz.org/docs/layouts/), integrado por Viz.js, calcula a disposição a partir das relações declaradas |
| `tree` | hierarquia enraizada | ancestralidade, decomposição, árvore sintática ou estrutura de busca | grafo arbitrário ou lista decorativamente indentada | raiz, níveis, filhos e ordem devem ter significado definido; o algoritmo calcula a disposição procurando evitar cruzamentos |

### 4.2 Matemática, lógica e relações

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `formula` | expressão matemática ou química com estrutura e leitura acessível | apresentar notação no subconjunto de TeX admitido pelo contrato | comandos fora do subconjunto aceito ou tarefa que exija preencher um termo dentro da fórmula | a autoria fornece a expressão em TeX e uma leitura textual; o componente deriva [MathML](https://www.w3.org/TR/mathml-core/), formato estruturado para apresentar notação matemática no navegador, preservando agrupamentos e operadores; o pacote pode acompanhar resposta por escolha |
| `matrix` | entradas organizadas por linhas e colunas com delimitadores matemáticos | álgebra linear e operações matriciais | registros possuem cabeçalhos de atributos | delimitadores finos acompanham exatamente a altura das linhas; índice e símbolo conservam peso tipográfico matemático |
| `plane` | pontos, vetores aplicados, trajetórias e regiões em duas dimensões | geometria analítica, transformações e relações em eixos | série estatística ou figura sem coordenadas | eixos, domínios, unidades, origem e extremidade são explícitos; ponta do vetor termina na coordenada declarada |
| `graph` | grafo ou dígrafo matemático | vértices, arestas, direção, peso, multiplicidade, laço, caminho e conectividade | mapa conceitual, arquitetura de software ou rede física | topologia é completa e a disposição conserva as incidências; o cálculo procura reduzir cruzamentos, incluindo casos de grafos não planares |
| `truth_table` | valoração finita de fórmulas lógicas | equivalência, validade, satisfatibilidade e consequência | lista booleana sem fórmulas relacionadas | fórmulas ocupam colunas semanticamente identificadas; lacunas são células independentes |
| `set_diagram` | regiões lógicas de Venn ou topologia efetiva de Euler | pertencimento simultâneo, inclusão, interseção e complemento com poucos conjuntos | relação binária, classificação sem sobreposição ou mais de três conjuntos densos | símbolos e regiões precisam ser inequívocos; descrições longas ficam ancoradas fora da área geométrica |
| `relation_map` | incidência bipartida de pares de uma relação | domínio, contradomínio, imagem, preimagem, função e cardinalidade | a tarefa é apenas ler uma lista de pares | lados permanecem distintos, cada aresta liga elementos, e rótulos ficam legíveis junto das linhas; a disposição preserva a relação entre os dois conjuntos |

### 4.3 Dados e estruturas de execução

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `table` | registros comparáveis por atributos | cruzar valores entre linhas e colunas | o objeto é matriz, esquema relacional ou função de transição | cabeçalho, unidade e escopo são explícitos; cada lacuna de célula mantém opções e estado próprios |
| `entity_relationship` | modelo conceitual de dados | entidades, atributos, relacionamentos e cardinalidades do domínio | tabelas, chaves e nulabilidade já são o objeto | adota notação entidade–relacionamento declarada; nomes e cardinalidades ficam junto do elemento a que pertencem |
| `database_schema` | modelo relacional | relações, atributos, chaves primárias e estrangeiras, nulabilidade e dependências | modelagem conceitual ainda é o objetivo | tabelas representam relações e arestas representam referências; exemplos distinguem conceito de implementação |
| `memory_layout` | intervalos de endereços e direção de crescimento | segmentos, alocação e disposição relativa na memória | ativações de função são o foco | endereços, limites e orientação são explícitos; quando o tamanho visual difere da proporção entre os valores, a escala precisa ser sinalizada |
| `call_stack` | quadros de ativação e continuação no chamador | chamadas aninhadas, recursão, parâmetros, variáveis locais e retorno | mapa global de memória ou rastreamento tabular | topo, base e quadro ativo são inequívocos; valores longos quebram linha preservando o conteúdo |

### 4.4 Redes, comportamento e processos

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `packet_layout` | campos contíguos de uma unidade de protocolo | cabeçalhos definidos por RFC e posição/tamanho em bits | nomes e valores sem estrutura de bits | linhas, largura, unidade e deslocamento de cada campo em relação ao início — seu `offset` — seguem o protocolo; campos multilinha mantêm os rótulos visíveis |
| `network_topology` | dispositivos, interfaces, segmentos e enlaces | conectividade física ou lógica de rede | topologia matemática abstrata é o objeto | tipo de equipamento e tipo de enlace têm significados distintos; rótulos e rotas são calculados procurando evitar cruzamentos |
| `state_machine` | estados e transições causadas por eventos | ciclo de vida, protocolo ou comportamento reativo | sequência linear de etapas | estado, evento, condição que habilita a transição — a guarda — e ação são separados; transição liga origem e destino sem ambiguidade |
| `state_transition_table` | função de transição em forma tabular | comparar estado atual, evento, guarda, ação e próximo estado | tabela não possui semântica de estado | cada combinação é identificável; vários alvos de prática são independentes |
| `terminal_session` | sequência temporal observável entre entrada, resposta textual e efeito | rastrear uma sessão de shell, PowerShell, Git, SQL ou interface análoga; interpretar saída, localizar erro ou relacionar ação e consequência | código-fonte estático é o objeto, registros independentes devem ser comparados ou executar o sistema real é o próprio objetivo | ambiente e contexto são explícitos; o indicador visual de entrada, ou prompt, fica separado do comando; saída usual (`stdout`), saída de erro (`stderr`), código de saída e efeito permanecem distintos; espaços e ordem são preservados; somente a entrada admite lacuna de escolha inequívoca |
| `bpmn_process` | colaboração e processo BPMN | participantes, raias, eventos, atividades, decisões de fluxo e mensagens | algoritmo computacional é o objeto | segue [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/); os pontos de divisão ou reunião do fluxo, chamados gateways, conservam sua função; fluxos de sequência e de mensagem permanecem distintos |
| `reaction` | equação química | reagentes, produtos, coeficientes, estados, cargas, condições e tipo de seta | o fenômeno exige sozinho níveis macroscópico e submicroscópico | composição usa MathML; espaços entre coeficiente, espécie e operador preservam leitura científica; alvo fica na equação |

### 4.5 Arquitetura e sistemas de software

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `software_system_context` | fronteira de um sistema em relação a pessoas e sistemas externos | situar responsabilidades e dependências externas | abrir aplicações e armazenamentos internos | segue a finalidade do [diagrama de contexto C4](https://c4model.com/diagrams/system-context); tipos são discretos e nomes/responsabilidades têm hierarquia legível |
| `software_container` | unidades executáveis ou armazenamentos dentro do sistema | mostrar aplicações, serviços, bancos e relações internas | classes, componentes de código ou implantação física detalhada | segue a finalidade do [diagrama de contêineres C4](https://c4model.com/diagrams/container); texto integral determina a caixa antes da disposição |
| `system_internal_block` | partes, portas, conectores e itens transportados | composição interna segundo SysML | mapa genérico de caixas e setas | segue as convenções de [SysML](https://www.omg.org/sysml/sysmlv1/); a disposição preserva a incidência lateral e a posição relativa das portas |

### 4.6 Dados quantitativos

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `chart` | série quantitativa, escala, unidade e incerteza | linha, dispersão ou barras com método declarado | histograma, boxplot, regressão ou painel são improvisados pelo mesmo contrato | [Vega-Lite](https://vega.github.io/vega-lite/docs/) calcula a apresentação a partir de dados e especificações de escalas, eixos, legendas e marcas; séries recebem indicações além da cor, e a incerteza é nomeada |

O catálogo deve ser ampliado quando uma área exige convenções que os componentes
existentes representam de modo insuficiente, como uma árvore sintática, um mapa
filogenético ou uma partitura. Um novo estilo visual para relações já preservadas
usa o pacote existente.

### 4.7 Áudio e ferramentas de apoio

Áudio e calculadora são componentes de conteúdo apresentados como ferramentas da
unidade. Eles oferecem apoio à tarefa e possuem seus próprios controles, sem alvos
de lacuna. As condições de reprodução e uso estão em [Áudio](audio.md) e
[Ferramentas de cálculo e consulta](ferramentas-calculo-e-consulta.md).

| Pacote | Objeto ou apoio oferecido | Adequação e limite |
| --- | --- | --- |
| `audio` | escuta de faixas e acesso a alternativas textuais | quando ouvir participa da tarefa; alternativa e momento de exibição precisam respeitar o objetivo |
| `calculator` | cálculo numérico aproximado | quando conferir valores apoia o raciocínio; cálculo mental e demonstração exigem tarefas próprias quando forem a operação pretendida |

## 5. Matriz dos formatos de resposta

| Pacote | Operação principal | Requisito de uso | Falha que invalida a prática |
| --- | --- | --- | --- |
| `choice` | discriminar uma ou mais alternativas | distratores representam erros plausíveis; modo simples ou múltiplo é explícito | alternativa correta revelada antes da solicitação, enunciado duplicado ou avaliação a cada toque |
| `gap` | completar elemento localizado | alvo pertence ao pacote de conteúdo; cada lacuna tem opções e estado próprios | lacuna aparece no enunciado por conveniência, ou todas as lacunas compartilham resposta |
| `ordering` | reconstruir uma sequência entre trechos textuais | pelo menos dois alvos pertencem a `paragraph` ou `table`, aparecem na ordem correta de leitura e são movidos no próprio ponto por setas à esquerda ou à direita | itens são duplicados numa lista de resposta, a sequência é espacial/vertical ou a ordem não tem fundamento semântico |

Correspondências simples usam lacunas de escolha nos campos reais de um
`paragraph` ou de uma `table`. O pacote `relation_map` atende a outra necessidade:
apresentar a relação entre conjuntos quando imagem, preimagem ou cardinalidade são
o próprio objeto de estudo.

Digitação é uma modalidade de resposta aplicada a um alvo autorizado. A confirmação
pertence ao controle principal da unidade, que apresenta o retorno e permite o
avanço conforme o resultado. Cada componente conserva os controles necessários à
resposta; o [ciclo da prática](guia-estudante.md#responder-a-uma-prática) explica a
confirmação, a nova tentativa e a consulta à solução.

## 6. Decisão corrente e uso observado

### Decisão estática e adequação contextual

A **decisão estática** examina se um tipo de representação deve permanecer
instalado e quais limites delimitam seu uso. A **adequação contextual** compara
o componente com uma necessidade concreta: ele pode ser específico para essa
necessidade, versátil ou uma aproximação que exige adaptações. Essas categorias
são desenvolvidas na [seleção de componentes](fundamentacao-pedagogica-dos-resources.md#2-da-tarefa-à-escolha-do-componente).

Um pacote mantido pode ser inadequado para determinada tarefa; um pacote restrito
pode ser a escolha canônica dentro de seu recorte. A classificação abaixo considera
o contrato, a representação acessível, o curso de catálogo e os arquivos de teste.
`Restringir` conserva o pacote para a fronteira indicada, sujeito às mesmas
verificações dos demais.

| Pacote | Decisão estática | Razão e fronteira | Instâncias nos dez arquivos de curso |
| --- | --- | --- | ---: |
| `paragraph` | `manter` | exposição verbal progressiva e alternativa simples para relações que dispensam outra representação | 5.373 |
| `annotated_text` | `manter` | conserva a ligação precisa entre trecho e anotação, ausente na prosa comum | 0 |
| `interlinear_gloss` | `manter` | preserva o alinhamento entre forma, morfema, glosa e tradução | 0 |
| `code` | `manter` | sintaxe, indentação e posição dos elementos do código participam da tarefa | 859 |
| `flow` | `manter` | representa controle algorítmico com decisão ou repetição; processos organizacionais usam outra representação | 214 |
| `tree` | `manter` | preserva hierarquia enraizada, ancestralidade e caminho até a raiz | 52 |
| `formula` | `manter` | recebe notação TeX validada e conserva sua estrutura em MathML, com leitura textual equivalente | 0 |
| `matrix` | `manter` | a posição algébrica das entradas é distinta de registros tabulares | 46 |
| `plane` | `restringir` | admite somente duas dimensões, com pontos, vetores, trajetórias e regiões declaradas | 8 |
| `graph` | `manter` | preserva topologia matemática abstrata, inclusive direção, peso e multiplicidade | 183 |
| `truth_table` | `restringir` | limita cada unidade móvel a cinco variáveis e 32 valorações | 0 |
| `set_diagram` | `restringir` | cobre diagramas de Venn ou Euler com dois ou três conjuntos | 0 |
| `relation_map` | `manter` | preserva incidência bipartida, domínio, contradomínio, imagem e preimagem | 125 |
| `table` | `manter` | compara registros homogêneos por atributos e unidades explícitas | 541 |
| `entity_relationship` | `manter` | preserva a modelagem conceitual e a cardinalidade, com função distinta do esquema relacional | 0 |
| `database_schema` | `manter` | chaves, nulabilidade e referências constituem uma representação relacional própria | 0 |
| `memory_layout` | `manter` | intervalos de endereço e direção de crescimento são o objeto representado | 0 |
| `call_stack` | `manter` | quadros de ativação e continuação no chamador diferem do mapa global de memória | 0 |
| `packet_layout` | `restringir` | cobre campos binários contíguos com largura e deslocamento declarados | 0 |
| `network_topology` | `manter` | equipamentos, interfaces, segmentos e enlaces têm significado distinto de grafo abstrato | 0 |
| `state_machine` | `manter` | estados, eventos, guardas e ações preservam comportamento reativo | 0 |
| `state_transition_table` | `manter` | explicita cobertura e completude da função de transição em forma tabular | 0 |
| `terminal_session` | `restringir` | registra uma sessão contextual para leitura; a execução e a verificação de outro ambiente exigem procedimento próprio | 0 |
| `bpmn_process` | `restringir` | cobre o subconjunto didático de eventos, tarefas, gateways, raias e fluxos previsto no contrato | 0 |
| `reaction` | `restringir` | representa a equação simbólica; níveis macroscópico, microscópico e energético exigem complemento | 0 |
| `software_system_context` | `manter` | preserva a fronteira externa e as responsabilidades do diagrama de contexto C4 | 0 |
| `software_container` | `manter` | representa unidades executáveis e armazenamentos no nível de contêiner C4 | 0 |
| `system_internal_block` | `restringir` | cobre partes, portas, conectores e itens do diagrama interno de bloco previsto no contrato | 0 |
| `chart` | `restringir` | admite linhas, dispersão e barras; distribuições e painéis exigem outro contrato | 0 |
| `audio` | `manter` | conserva faixas, idioma e alternativa acessível quando a escuta participa da tarefa; disponibilizar uma gravação exige guardar o arquivo correspondente | 0 |
| `calculator` | `restringir` | confere expressões numéricas finitas com funções permitidas; demonstração algébrica e execução de código pertencem a outras tarefas | 0 |
| `choice` | `manter` | discriminação entre alternativas plausíveis constitui operação de resposta própria | 2.386 |
| `gap` | `manter` | completa um alvo semântico no componente de conteúdo, com estado independente por lacuna | 604 |
| `ordering` | `restringir` | atua somente em alvos textuais de `paragraph` e `table`; ordem espacial exige outra representação | 0 |

O catálogo corrente reúne os 34 pacotes da tabela. Conteúdos antigos que usavam
Dicionário, Gramática, Leitura ou resposta aberta seguem a conversão definida na
[migração de remoção desses componentes](../supabase/migrations/20260924172159_revisao_v7_component_removal.sql).
O leitor atual apresenta os pacotes do catálogo corrente.

O inventário sustenta sua conservação com as restrições indicadas. Problemas de
contrato, apresentação ou interação continuam gerando correções. Uma revisão
disciplinar ou a demonstração de equivalência representacional pode mudar a decisão;
a frequência de uso é uma das informações consideradas.

### Corpus de cursos

A comparação usa dez documentos completos de curso versionados no repositório:
cinco arquivos de teste de conteúdo, três cursos de catálogo do servidor e dois
arquivos integrais de regressão do estudo. Trata-se de um corpus técnico, distinto
do acervo hospedado e do uso por estudantes. Esses cursos contêm 10.391 instâncias
de onze pacotes. A contagem da tabela registra ocorrências no conteúdo.

Os arquivos estão em `tests/fixtures/course-catalog`, `supabase/fixtures/catalog`
e `tests/fixtures/package`. Os dois arquivos de regressão são
`tests/fixtures/package/project-minimal.json` e
`tests/fixtures/package/project-visual.json`. Os 23 pacotes com contagem zero na
tabela aparecem no curso de catálogo, mas ainda estão ausentes desse conjunto de
dez cursos.

O curso de catálogo deriva os 34 pacotes do registro. Cada pacote possui uma
microssequência independente com uma unidade de teoria e outra de prática. Os
exemplos e as respostas usam conteúdo disciplinar concreto; o teste recusa perguntas
que pedem apenas a finalidade ou o nome do pacote. Essa verificação demonstra a
cobertura e a validade dos contratos nos exemplos; não mede eficácia pedagógica.
Especialistas examinam a adequação da representação às convenções da área; estudos
com estudantes avaliam a interpretação do material e os resultados de aprendizagem.

Os arquivos de teste de [estresse acadêmico](../tests/fixtures/pedagogy/academic-stress-courses.json)
e de [notação matemática e química](../tests/fixtures/formulas-matematica-quimica.json)
complementam os dez cursos e possuem contagem separada. A matriz visual é construída
pelo [gerador de curso de teste](../scripts/buildResourceTestCourse.mjs), com
exemplos dos pacotes instalados. Ela inclui escolha, lacuna e ordenação.
Acrescentar um caso amplia a verificação do catálogo, mantendo as identidades dos
pacotes e dos cursos usados na contagem.

### Legendas, instruções e prova por pacote

As legendas e instruções são escolhidas conforme a necessidade de interpretar o
caso. Uma orientação útil situa o objeto ou a operação: num gráfico, por exemplo,
pode explicar o período observado. Campos opcionais permanecem disponíveis para
essa finalidade. Termos técnicos entram quando participam do conteúdo estudado.

Todos os pacotes passam pela verificação de contrato, exemplo, descrição acessível
e alvos editáveis no [teste do núcleo de pacotes](../tests/kernel/resource-package-kernel.test.js)
e pela composição disciplinar no [teste do curso de catálogo](../tests/kernel/resource-catalog-course.test.js).
A [matriz móvel](../tests/resource-course/resource-test-matrix.spec.js) acrescenta a
verificação de geometria nos temas claro e escuro. A coluna final identifica o caso
ou a regressão que examina uma propriedade específica da representação.

| Pacote | Rótulos, legendas e instruções a preservar | Caso ou prova focal |
| --- | --- | --- |
| `paragraph` | encadeamento do argumento e orientação quando necessária; títulos identificam o assunto | prosa e expressões situadas; texto formatado, idiomas e notação têm regressão própria |
| `annotated_text` | vínculo entre trecho e nota, rótulo e categoria quando informativa; numeração relaciona ocorrências | cliente e requisição; [toque, teclado e isolamento entre instâncias](../tests/resource-course/resource-annotations-open.spec.js) |
| `interlinear_gloss` | alinhamento, abreviações e tradução; rótulo de língua quando distingue camadas | forma, morfema e glosa alinhados no exemplo do catálogo |
| `code` | orientação da leitura, espaços e quebras do programa; sintaxe preservada | busca binária; [apresentação em Estudo e edição textual](../tests/runtime/package-study-rendering-regressions.test.js) |
| `flow` | condição, Sim/Não, casos e ordem de repetição; legenda acrescenta somente contexto necessário | [ramos, teclado, edição e área de visualização móvel](../tests/e2e/flow-viewport.spec.js) |
| `tree` | rótulos e relação pai–filho; legenda opcional para delimitar o recorte | ancestralidade e caminho na árvore do catálogo |
| `formula` | símbolos, estrutura e descrição acessível; contexto quando a expressão sozinha deixa a tarefa indefinida | [árvore da expressão e semântica da notação](../tests/runtime/formula-semantic-contract.test.js) |
| `matrix` | delimitadores, entradas e posição algébrica; orientação quando define a operação | dimensões e entradas no exemplo do catálogo |
| `plane` | eixos, escala, unidades e identificação de objetos quando declaradas | pontos, vetores e trajetórias no plano do catálogo |
| `graph` | vértices, direção e pesos; rótulo de aresta quando tem significado | caminhos e topologia no corpus de teoria dos grafos |
| `truth_table` | variáveis, fórmulas e valorações; explicação dos símbolos antes de exigir sua interpretação | comparação entre implicação e disjunção no catálogo |
| `set_diagram` | chave dos conjuntos e marcadores das regiões; cardinalidade representada pelos dados, separada do tamanho visual da área | [regiões e legenda ancorada na matriz móvel](../tests/resource-course/resource-test-matrix.spec.js) |
| `relation_map` | domínio, contradomínio e incidências; legenda opcional de contexto | imagem e preimagem no catálogo e no corpus |
| `table` | cabeçalhos, unidades e chave de linha quando necessária; legenda quando delimita o recorte | comparação de atributos; lacunas e ordenação na matriz |
| `entity_relationship` | entidades, relações, papéis e cardinalidades; legenda contextual opcional | modelagem conceitual no estresse acadêmico |
| `database_schema` | tabelas, colunas, chaves, nulabilidade e referências | esquema relacional no estresse acadêmico |
| `memory_layout` | intervalos, base e direção dos endereços; contexto de regiões omitidas ou sem escala | mapa do espaço virtual de um processo no catálogo |
| `call_stack` | topo ativo, base, quadros suspensos e continuação, preservados como estados do processo | [chamada recursiva e ordem dos quadros](../tests/resource-course/resource-test-matrix.spec.js) |
| `packet_layout` | deslocamento, largura, unidade e nome de campo; descrição ancorada quando explica sua função | cabeçalho binário no estresse acadêmico |
| `network_topology` | equipamentos, interfaces, segmentos e enlaces; protocolo quando distingue a conexão | topologia de rede no estresse acadêmico |
| `state_machine` | estado inicial/final, evento, guarda e ação; legenda quando acrescenta contexto | comportamento reativo no estresse acadêmico |
| `state_transition_table` | origem, evento e destino; legenda dos estados quando os símbolos precisam de expansão | [duas transições com o mesmo destino e lacunas independentes](../tests/resource-course/resource-test-matrix.spec.js) |
| `terminal_session` | ambiente, ordem das entradas, fluxos de saída e efeitos observados | [sessão não executável, espaços e lacuna no comando](../tests/resource-course/resource-test-matrix.spec.js) |
| `bpmn_process` | eventos, tarefas, gateways, raias e fluxos com significado; legenda contextual opcional | processo organizacional no estresse acadêmico |
| `reaction` | espécies, coeficientes, estados, carga e condição sobre a seta; a legenda acrescenta contexto além da condição já apresentada | [condição como alvo único e leitura acessível](../tests/runtime/reaction-representation.test.js); [digitação na seta no celular](../tests/resource-course/resource-annotations-open.spec.js) |
| `software_system_context` | pessoas, sistemas, fronteira e relações; contexto de responsabilidade | fronteira externa do sistema no catálogo |
| `software_container` | unidades executáveis, armazenamentos, responsabilidade e comunicação | arquitetura em contêineres no catálogo |
| `system_internal_block` | partes, portas, conectores e itens, com incidência lateral preservada | conexões internas no catálogo |
| `chart` | eixos, escalas, unidades, séries, incerteza e nota metodológica quando declaradas | observações quantitativas no catálogo; descrição acessível acompanha as marcas |
| `choice` | pergunta, critério e modo de seleção; confirmação pelo controle da unidade | discriminação entre alternativas na matriz e no corpus |
| `gap` | contexto do alvo e opções da lacuna ativa no próprio conteúdo | [preenchimento independente no próprio conteúdo](../tests/resource-course/resource-test-matrix.spec.js) |
| `ordering` | orientação da sequência e controles junto aos trechos a ordenar | reconstrução da resolução no parágrafo da matriz |
| `audio` | título, idioma, orientação e alternativa textual no momento apropriado | formatos, disponibilidade e reprodução descritos em [Áudio](audio.md) |
| `calculator` | expressão, unidade angular, resultado aproximado e erros compreensíveis | precedência, limites e teclado descritos em [Ferramentas](ferramentas-calculo-e-consulta.md#calculadora) |

A função de cada legenda orienta sua revisão. Repetir palavras pode ser necessário
para relacionar uma figura ao texto; a retirada depende da informação que a legenda
oferece naquele ponto. A alternativa textual produzida pelo pacote precisa ser
confrontada com tecnologia assistiva em uso, pois relação, ordem e foco participam
da leitura real. Os casos automatizados delimitam a cobertura técnica; outras
notações e a experiência com leitores de tela exigem verificações específicas.

### Descoberta, degradação e limites técnicos

Na descoberta progressiva, a busca devolve no máximo oito candidatos, e a etapa
seguinte compara os perfis resumidos de até oito deles. A consulta detalhada recebe
a identidade exata de um contrato por chamada. Se a autoria pedir uma árvore
sintática e a notação fizer parte da aprendizagem, por exemplo, `tree` aparece como
`substitute`: uma aproximação cuja perda precisa ser apresentada antes da produção.

A descoberta permite comparar a adequação de cada candidato antes de consultar seu
contrato. Quando uma alternativa perde uma relação necessária ao objetivo, essa
limitação orienta a decisão autoral. A adequação depende dessa relação semântica;
o tamanho da resposta técnica delimita outra parte do trabalho, a transmissão dos
dados entre aplicações.

Os limites de tamanho do catálogo, das consultas e do código são verificáveis no
[teste do curso de catálogo](../tests/kernel/resource-catalog-course.test.js).
Os guias de [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md) explicam
como as integrações fornecem ferramentas ao assistente e quais limites se aplicam
à comunicação; o [gerador OpenAPI](../scripts/buildChatGptActionOpenApi.mjs) verifica
o documento de operações.

Essas medidas técnicas ajudam a controlar a manutenção e o transporte dos dados.
O [ensaio de extensão e ocupação visual](benchmark-footprint-editorial.md) compara
conteúdo e espaço ocupado no leitor móvel. Tarefas com pessoas examinam como as
representações são interpretadas e utilizadas e que esforço exigem.

## 7. Processo de auditoria

### Etapa 1: auditoria conceitual

O revisor descreve o objeto e identifica a relação que precisa permanecer explícita.
Em seguida, compara prosa, tabela e pacotes próximos. O resultado possível é manter,
restringir, fundir, retirar ou propor novo pacote.

### Etapa 2: auditoria disciplinar

Um especialista confronta símbolos, terminologia, ordem de leitura e casos complexos
com fontes primárias da área. Divergências legítimas entre notações são declaradas
no manifesto; mistura inadvertida de tradições exige correção.

### Etapa 3: auditoria do contrato

O contrato deve:

- usar conceitos do domínio, reservando propriedades de estilo ao componente;
- separar identificadores estruturais e textos visíveis;
- impedir referências inexistentes e duplicidades indevidas;
- expressar cardinalidade e limites;
- produzir erros de validação compreensíveis;
- admitir casos diversos dentro do escopo declarado.

### Etapa 4: auditoria da apresentação

Casos de estresse incluem:

- rótulos curtos e longos;
- quantidade mínima e máxima admitida de elementos;
- grafos densos, ciclos, laços e paralelismo quando pertinentes;
- maior resposta válida já preenchida;
- idiomas com palavras mais extensas;
- temas claro e escuro;
- larguras móveis, ampliação e densidade de pixels diferentes;
- rolagem vertical da unidade e rolagem local da moldura;
- navegação por teclado, foco e leitor de tela.

São defeitos bloqueadores: texto cortado, elemento oculto, sobreposição que altera
significado, aresta ligada ao alvo errado, legenda ambígua, contraste insuficiente,
perda de foco, conteúdo excedente fora do contêiner e mudança de disposição que
revela a resposta.

### Etapa 5: auditoria da prática

Cada alvo é acionado separadamente. Selecionar, limpar, confirmar, tentar de novo e
revelar resposta são testados como estados distintos. Um teste com três ou mais
lacunas verifica a independência de opções, preenchimento, avaliação e retorno.

### Etapa 6: auditoria de edição e assistência

A edição textual mostra rótulos compreensíveis e seus agrupamentos. O JSON estrutural
permanece sob controle do contrato, enquanto a pessoa altera os campos autorizados.
A assistência recebe o objetivo e o contexto necessário para leitura, com os campos
graváveis e as restrições do pacote identificados. Orientações e observações
pertinentes delimitam a alteração. Depois da proposta, a validação e a confirmação
do estado salvo completam o percurso.

A revisão de conteúdo examina a correção e a adequação didática da resposta.
Diretrizes de interação humano–IA fundamentam a comunicação das capacidades e os
meios de corrigir propostas ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).
A literatura sobre alucinação examina erros e formas de mitigação em tarefas de
geração ([Ji et al. (2023)](referencias.md#ref-ji2023hallucination)). A inspeção do
componente aplica esses cuidados ao material concreto e ao seu objetivo.

### Etapa 7: auditoria pedagógica

O componente é examinado na microssequência em que será utilizado. A revisão verifica:

1. se o estudante encontra os conhecimentos necessários para ler a notação;
2. como a explicação desenvolve os pressupostos da tarefa;
3. se a prática de aplicação usa relações já ensinadas e se uma tentativa
   exploratória prepara um desenvolvimento posterior explícito;
4. qual relação a representação torna compreensível;
5. como o retorno orienta a revisão da resposta;
6. se uma alternativa mais simples preservaria a informação e a operação necessárias;
7. por que a densidade da unidade prática é adequada à tarefa.

## 8. Critérios de aceitação

Um pacote é aceito tecnicamente quando:

- esquema de validação, mecanismo de apresentação, catálogo e operações de autoria
  concordam;
- a mesma entrada produz estrutura equivalente;
- casos válidos e inválidos possuem testes;
- alvos interativos são independentes;
- os casos testados mantêm o conteúdo legível dentro de sua área, sem recorte ou
  sobreposição que altere o significado;
- a descrição acessível conserva entidades e relações;
- a edição textual respeita os campos autorizados e preserva a estrutura;
- dependências necessárias estão disponíveis no funcionamento sem conexão previsto.

A aceitação acadêmica depende do reconhecimento da convenção por especialistas,
dos limites declarados e de exemplos de estresse plausíveis. A aceitação didática
conserva o alcance apoiado por avaliação de interpretação e tarefa. O registro
identifica separadamente essas três conclusões.

## 9. Registro de resultados

Cada avaliação identifica o pacote, o escopo e o problema examinado. Registra a
alternativa comparada, a fonte disciplinar e os casos de estresse utilizados.
Evidência técnica, julgamento especializado e resultados com estudantes, quando
houver, permanecem separados. A decisão de manter, restringir, fundir, redesenhar
ou retirar aponta suas razões e as limitações remanescentes.

O relatório identifica os casos executados e os defeitos procurados, inclusive
quando todos passam. Esse alcance permite reutilizar a evidência em outra revisão
e reconhecer quais situações ainda precisam ser examinadas.

## 10. Referências normativas e técnicas

- [Graphviz: algoritmos de disposição](https://graphviz.org/docs/layouts/)
- [Vega-Lite: documentação](https://vega.github.io/vega-lite/docs/)
- [MathML Core](https://www.w3.org/TR/mathml-core/)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) ([World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22))
- [Business Process Model and Notation 2.0](https://www.omg.org/spec/BPMN/2.0/)
- [Unified Modeling Language](https://www.omg.org/spec/UML/)
- [Systems Modeling Language](https://www.omg.org/sysml/sysmlv1/)
- [C4 model](https://c4model.com/)
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [Leipzig Glossing Rules](https://www.eva.mpg.de/lingua/resources/glossing-rules.php)

A [fundamentação pedagógica dos componentes](fundamentacao-pedagogica-dos-resources.md)
desenvolve as relações entre representação e tarefa. As referências acadêmicas
completas estão em [`referencias.bib`](referencias.bib).

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Ginns (2006)](referencias.md#ref-ginns2006contiguity): Paul Ginns (2006). **Integrating Information: A Meta-Analysis of the Spatial Contiguity and Temporal Contiguity Effects.** *Learning and Instruction*, 16(6), p. 511–525.
- [Ji et al. (2023)](referencias.md#ref-ji2023hallucination): Ziwei Ji; Nayeon Lee; Rita Frieske; Tiezheng Yu; Dan Su; Yan Xu; Etsuko Ishii; Ye Jin Bang; Andrea Madotto; Pascale Fung (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys*, 55(12), p. 1–38.
- [Mayer (2009)](referencias.md#ref-mayer2009multimedia): Richard E. Mayer (2009). **Multimedia Learning.** 2. ed., Cambridge University Press.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [World Wide Web Consortium (2023)](referencias.md#ref-w3c2023wcag22): World Wide Web Consortium (2023). **Web Content Accessibility Guidelines (WCAG) 2.2.**

<!-- referências locais: fim -->
