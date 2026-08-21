# Auditoria acadêmica dos componentes didáticos

## 1. Finalidade e escopo

Esta auditoria verifica se cada componente didático possui razão pedagógica para
existir, preserva uma convenção acadêmica identificável e pode ser operado sem
defeitos visuais ou interativos evitáveis. Um **pacote de componente** é um módulo
que reúne dados, validação e apresentação próprias. A auditoria examina o
pacote completo: descrição no catálogo, contrato, validação, mecanismo de
renderização, alvos de prática, campos editáveis, descrição acessível e testes.

A auditoria separa três perguntas:

1. **validade representacional**: o componente preserva o objeto e a notação da
   área?
2. **conformidade técnica**: a implementação materializa o contrato sem
   recorte, sobreposição, ambiguidade ou estado compartilhado indevido?
3. **utilidade didática**: estudantes conseguem interpretar e usar a
   representação na tarefa pretendida?

As duas primeiras podem receber evidência por inspeção especializada e testes.
A terceira exige participantes e tarefas. Um pacote tecnicamente correto não
é, por esse motivo, pedagogicamente eficaz.

## 2. Unidade de auditoria

Um **componente de conteúdo** representa o objeto estudado. Um **formato de
resposta** organiza como a pessoa manifesta uma decisão. Essa distinção evita
tratar “lacuna” como uma figura independente ou transformar toda figura em
questionário.

Cada pacote de conteúdo deve declarar:

- objeto preservado e domínio de uso;
- estrutura semântica do contrato;
- operações-alvo das tarefas compatíveis;
- convenção disciplinar ou normativa;
- situações indicadas e contraindicadas;
- limites de complexidade;
- folhas textuais editáveis;
- alvos possíveis de lacuna ou digitação;
- descrição não visual equivalente;
- estratégia de disposição, responsividade e estado interativo.

Cada pacote de resposta deve declarar identidade, avaliação, limpeza,
confirmação, retorno e acessibilidade. A composição entre conteúdo e resposta
é válida somente quando a modalidade corresponde à operação-alvo planejada.

## 3. Decisão de admissão no catálogo

### Problema

Um catálogo crescente pode acumular componentes redundantes, notações
improvisadas e exemplos que funcionam apenas em casos simples. Isso aumenta o
contexto de autoria e transfere ao estudante o custo de descobrir como ler cada
figura.

### Alternativas e requisitos

Um novo objeto pode ser representado por prosa, tabela, pacote existente ou
pacote especializado. A última alternativa exige estrutura distintiva,
convenção reconhecível, operação própria e manutenção justificável.

### Decisão

O pacote só entra no catálogo produtivo quando responde satisfatoriamente à
porta de admissão abaixo. Se a mesma informação e operação forem preservadas
por componente mais simples, prevalece a alternativa mais simples.

### Fundamentação

Representações externas podem apoiar funções diferentes, mas sua coordenação
também impõe demanda cognitiva ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Coerência e contiguidade
desaconselham elementos sem função e separação de informações que precisam ser
integradas ([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)). A carga criada pela
interface não deve competir desnecessariamente com a tarefa
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)).

### Operacionalização: porta de admissão

1. Qual relação se perde em `paragraph`, `table` ou outro pacote instalado?
2. Qual operação-alvo da tarefa depende dessa relação?
3. Qual convenção acadêmica ou normativa orienta a leitura?
4. O contrato expressa uma classe de casos ou apenas um exemplo codificado?
5. O autor declara semântica sem fornecer pixels, cores, posições ou rotas?
6. A representação admite rótulos longos, cardinalidade realista e casos
   complexos?
7. Lacuna e digitação aparecem no lugar estrutural da decisão?
8. Vários alvos possuem identidade, opções e estado independentes?
9. Edição e assistência recebem somente textos autorizados?
10. A estrutura pode ser descrita sem depender de cor ou visão?
11. Temas, zoom, teclado, toque e larguras móveis permanecem operáveis?
12. As limitações e alternativas estão explícitas no catálogo?
13. Um especialista do domínio reconhece a convenção adotada?
14. Existe tarefa empírica capaz de testar sua utilidade didática?

### Consequências

Um pacote pode ser altamente especializado, desde que sua especialização
preserve uma operação necessária. O catálogo também pode registrar lacunas de
cobertura sem bloquear autoria; a alternativa usada precisa ser explicitada
quando houver perda relevante.

### Limites e evidência

A porta organiza julgamento e conformidade, mas não substitui revisão por
especialistas nem avaliação com estudantes. Decisões de manter, restringir,
fundir ou retirar permanecem revisáveis.

## 4. Matriz dos componentes de conteúdo

### 4.1 Texto, linguagem e programação

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `paragraph` | exposição verbal progressiva | situar, definir, exemplificar, contrastar e explicar causalmente | uma relação espacial, formal ou tabular seria perdida | estrutura textual sem marcação autorreferente; prática apenas quando a própria linguagem é o objeto |
| `annotated_text` | trechos ancorados e comentários relacionados | localizar evidência, função discursiva, argumento, correferência ou comentário em passagem específica | notas não precisam apontar para trechos precisos | destaque e anotação têm navegação bidirecional; sobreposição de trechos deve permanecer interpretável |
| `interlinear_gloss` | forma original, segmentação morfêmica, glosa e tradução livre | análise linguística morfema a morfema | três linhas independentes ou tradução sem alinhamento | segue as [Leipzig Glossing Rules](https://www.eva.mpg.de/lingua/resources/glossing-rules.php); lacuna ocupa morfema ou glosa sem quebrar alinhamento |
| `code` | código-fonte com sintaxe, indentação e posição de token | ler, explicar, executar mentalmente ou completar programa | pseudocódigo não possui convenção definida ou a tarefa é apenas descrever algoritmo | fonte monoespaçada, quebras preservadas e alvo dentro do editor; enunciado nunca recebe a lacuna do código |
| `flow` | fluxo de controle algorítmico | acompanhar entrada, processo, decisão, laço, junção e saída | processo organizacional, árvore ou máquina de estados | formas convencionais de fluxograma e rótulos nas arestas; disposição calculada por Graphviz/Viz.js, sem coordenadas autorais |
| `tree` | hierarquia enraizada | ancestralidade, decomposição, árvore sintática ou estrutura de busca | grafo arbitrário ou lista decorativamente indentada | raiz, níveis, filhos e ordem devem ser semanticamente definidos; cruzamentos evitados pelo algoritmo de disposição |

### 4.2 Matemática, lógica e relações

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `formula` | árvore de expressão matemática | representar frações, limites, integrais, derivadas, somatórios, produtos, funções e tensores | texto com símbolos soltos ou sintaxe LaTeX livre | MathML mantém agrupamento, operadores e delimitadores proporcionais; lacuna substitui subexpressão sem destruir a árvore |
| `matrix` | entradas organizadas por linhas e colunas com delimitadores matemáticos | álgebra linear e operações matriciais | registros possuem cabeçalhos de atributos | delimitadores finos acompanham exatamente a altura das linhas; índice e símbolo conservam peso tipográfico matemático |
| `plane` | pontos, vetores aplicados, trajetórias e regiões em duas dimensões | geometria analítica, transformações e relações em eixos | série estatística ou figura sem coordenadas | eixos, domínios, unidades, origem e extremidade são explícitos; ponta do vetor termina na coordenada declarada |
| `graph` | grafo ou dígrafo matemático | vértices, arestas, direção, peso, multiplicidade, laço, caminho e conectividade | mapa conceitual, arquitetura de software ou rede física | topologia é completa e a disposição não altera incidência; cruzamento é reduzido, mas grafos não planares continuam possíveis |
| `truth_table` | valoração finita de fórmulas lógicas | equivalência, validade, satisfatibilidade e consequência | lista booleana sem fórmulas relacionadas | fórmulas ocupam colunas semanticamente identificadas; lacunas são células independentes |
| `set_diagram` | regiões lógicas de Venn ou topologia efetiva de Euler | pertencimento simultâneo, inclusão, interseção e complemento com poucos conjuntos | relação binária, classificação sem sobreposição ou mais de três conjuntos densos | símbolos e regiões precisam ser inequívocos; descrições longas ficam ancoradas fora da área geométrica |
| `relation_map` | incidência bipartida de pares de uma relação | domínio, contradomínio, imagem, preimagem, função e cardinalidade | a tarefa é apenas ler uma lista de pares | lados permanecem distintos, cada aresta liga elementos, e rótulos não disputam espaço com linhas; não deve degenerar em tabela |

### 4.3 Dados e estruturas de execução

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `table` | registros comparáveis por atributos | cruzar valores entre linhas e colunas | o objeto é matriz, esquema relacional ou função de transição | cabeçalho, unidade e escopo são explícitos; cada lacuna de célula mantém opções e estado próprios |
| `entity_relationship` | modelo conceitual de dados | entidades, atributos, relacionamentos e cardinalidades do domínio | tabelas, chaves e nulabilidade já são o objeto | adota notação ER declarada; nomes e cardinalidades ficam junto do elemento a que pertencem |
| `database_schema` | modelo relacional | relações, atributos, chaves primárias e estrangeiras, nulabilidade e dependências | modelagem conceitual ainda é o objetivo | tabelas representam relações e arestas representam referências; exemplos distinguem conceito de implementação |
| `memory_layout` | intervalos de endereços e direção de crescimento | segmentos, alocação e disposição relativa na memória | ativações de função são o foco | endereços, limites e orientação são explícitos; tamanho visual não pode contradizer valor sem sinalização de escala |
| `call_stack` | quadros de ativação e continuação no chamador | chamadas aninhadas, recursão, parâmetros, variáveis locais e retorno | mapa global de memória ou rastreamento tabular | topo, base e quadro ativo são inequívocos; valores longos quebram linha sem truncar conteúdo |

### 4.4 Redes, comportamento e processos

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `packet_layout` | campos contíguos de uma unidade de protocolo | cabeçalhos definidos por RFC e posição/tamanho em bits | nomes e valores sem estrutura de bits | linhas, offsets, largura e unidade seguem o protocolo; campos multilinha não podem ocultar rótulos |
| `network_topology` | dispositivos, interfaces, segmentos e enlaces | conectividade física ou lógica de rede | topologia matemática abstrata é o objeto | tipo de equipamento e tipo de enlace têm semântica distinta; rótulos e rotas são calculados sem cruzamentos evitáveis |
| `state_machine` | estados e transições causadas por eventos | ciclo de vida, protocolo ou comportamento reativo | sequência linear de etapas | estado, evento, guarda e ação são separados; transição liga origem e destino sem ambiguidade |
| `state_transition_table` | função de transição em forma tabular | comparar estado atual, evento, guarda, ação e próximo estado | tabela não possui semântica de estado | cada combinação é identificável; vários alvos de prática são independentes |
| `terminal_session` | sequência temporal observável entre entrada, resposta textual e efeito | rastrear uma sessão de shell, PowerShell, Git, SQL ou interface análoga; interpretar saída, localizar erro ou relacionar ação e consequência | código-fonte estático é o objeto, registros independentes devem ser comparados ou executar o sistema real é o próprio objetivo | ambiente e contexto são explícitos; prompt visual não integra a entrada; `stdout`, `stderr`, código de saída e efeito permanecem distintos; espaços e ordem são preservados; somente a entrada admite lacuna de escolha inequívoca |
| `bpmn_process` | colaboração e processo BPMN | participantes, raias, eventos, atividades, gateways e mensagens | algoritmo computacional é o objeto | segue [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0/); fluxo de sequência e de mensagem não podem ser confundidos |
| `reaction` | equação química | reagentes, produtos, coeficientes, estados, cargas, condições e tipo de seta | o fenômeno exige sozinho níveis macroscópico e submicroscópico | composição usa MathML; espaços entre coeficiente, espécie e operador preservam leitura científica; alvo fica na equação |

### 4.5 Arquitetura e sistemas de software

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `software_system_context` | fronteira de um sistema em relação a pessoas e sistemas externos | situar responsabilidades e dependências externas | abrir aplicações e armazenamentos internos | segue a finalidade do [diagrama de contexto C4](https://c4model.com/diagrams/system-context); tipos são discretos e nomes/responsabilidades têm hierarquia legível |
| `software_container` | unidades executáveis ou armazenamentos dentro do sistema | mostrar aplicações, serviços, bancos e relações internas | classes, componentes de código ou implantação física detalhada | segue a finalidade do [diagrama de contêineres C4](https://c4model.com/diagrams/container); texto integral determina a caixa antes da disposição |
| `system_internal_block` | partes, portas, conectores e itens transportados | composição interna segundo SysML | mapa genérico de caixas e setas | segue a gramática de [SysML](https://www.omg.org/sysml/sysmlv1/); incidência lateral e portas não devem ser verticalizadas artificialmente |

### 4.6 Dados quantitativos

| Pacote | Objeto preservado | Use quando | Não use quando | Convenção e exigência de prática |
| --- | --- | --- | --- | --- |
| `chart` | série quantitativa, escala, unidade e incerteza | linha, dispersão ou barras com método declarado | histograma, boxplot, regressão ou painel são improvisados pelo mesmo contrato | Vega-Lite deriva escalas, eixos, legendas e marcas; cor não é canal único e incerteza precisa ser nomeada |

O catálogo deve ser ampliado quando uma área exige outra gramática, por
exemplo, árvore sintática com operações próprias, mapa filogenético, via
metabólica, partitura ou estrutura cristalina, e não quando se deseja apenas
um novo estilo para relações já preservadas.

## 5. Matriz dos formatos de resposta

| Pacote | Operação principal | Requisito de uso | Falha que invalida a prática |
| --- | --- | --- | --- |
| `choice` | discriminar uma ou mais alternativas | distratores representam erros plausíveis; modo simples ou múltiplo é explícito | alternativa correta revelada antes da solicitação, enunciado duplicado ou avaliação a cada toque |
| `gap` | completar elemento localizado | alvo pertence ao pacote de conteúdo; cada lacuna tem opções e estado próprios | lacuna aparece no enunciado por conveniência, ou todas as lacunas compartilham resposta |
| `ordering` | reconstruir uma sequência entre trechos textuais | pelo menos dois alvos pertencem a `paragraph` ou `table`, aparecem na ordem correta de leitura e são movidos no próprio ponto por setas à esquerda ou à direita | itens são duplicados numa lista de resposta, a sequência é espacial/vertical ou a ordem não tem fundamento semântico |

Correspondências simples são lacunas de escolha aplicadas aos campos reais de
um `paragraph` ou de uma `table`. Não constituem outro pacote de resposta. Um
`relation_map` continua apropriado quando a relação, a imagem, a preimagem ou a
cardinalidade são o próprio objeto de estudo, e não apenas o formato de uma
pergunta.

Digitação é uma modalidade de resposta aplicada a um alvo autorizado. Ela não
constitui pacote de conteúdo. O controle principal da Unidade confirma a
resposta, apresenta retorno e, no acionamento seguinte, avança; controles
redundantes de “conferir” não pertencem ao componente.

## 6. Decisão corrente e uso observado

### Decisão estática e adequação contextual

A decisão estática responde se uma gramática deve permanecer instalada e qual
fronteira limita seu uso. A adequação contextual responde se essa gramática é
canônica, versátil ou substitutiva diante de uma intenção concreta. Um pacote
mantido pode ser inadequado para determinada tarefa; um pacote restrito pode
ser a escolha canônica dentro de seu recorte declarado.

A classificação abaixo considera o contrato, a representação acessível, o
Curso de catálogo e o corpus corrente. `Restringir` significa conservar o
pacote com a fronteira indicada. Não representa reprovação do código nem
autoriza uso fora desse recorte.

| Pacote | Decisão estática | Razão e fronteira | Instâncias nos dez Cursos correntes |
| --- | --- | --- | ---: |
| `paragraph` | `manter` | exposição verbal progressiva e alternativa simples para relações que não exigem outra gramática | 5.370 |
| `annotated_text` | `manter` | conserva a ligação precisa entre trecho e anotação, ausente na prosa comum | 0 |
| `interlinear_gloss` | `manter` | preserva o alinhamento entre forma, morfema, glosa e tradução | 0 |
| `code` | `manter` | sintaxe, indentação e posição de token participam da tarefa | 859 |
| `flow` | `manter` | representa controle algorítmico com decisão ou repetição; processos organizacionais usam outra gramática | 214 |
| `tree` | `manter` | preserva hierarquia enraizada, ancestralidade e caminho até a raiz | 52 |
| `formula` | `manter` | conserva a árvore da expressão matemática em MathML | 0 |
| `matrix` | `manter` | a posição algébrica das entradas é distinta de registros tabulares | 46 |
| `plane` | `restringir` | admite somente duas dimensões, com pontos, vetores, trajetórias e regiões declaradas | 8 |
| `graph` | `manter` | preserva topologia matemática abstrata, inclusive direção, peso e multiplicidade | 183 |
| `truth_table` | `restringir` | limita cada Unidade móvel a cinco variáveis e 32 valorações | 0 |
| `set_diagram` | `restringir` | cobre diagramas de Venn ou Euler com dois ou três conjuntos | 0 |
| `relation_map` | `manter` | preserva incidência bipartida, domínio, contradomínio, imagem e preimagem | 125 |
| `table` | `manter` | compara registros homogêneos por atributos e unidades explícitas | 541 |
| `entity_relationship` | `manter` | modelagem conceitual e cardinalidade não se confundem com esquema relacional | 0 |
| `database_schema` | `manter` | chaves, nulabilidade e referências constituem uma gramática relacional própria | 0 |
| `memory_layout` | `manter` | intervalos de endereço e direção de crescimento são o objeto representado | 0 |
| `call_stack` | `manter` | quadros de ativação e continuação no chamador diferem do mapa global de memória | 0 |
| `packet_layout` | `restringir` | cobre campos binários contíguos com largura e offset, não registros gerais | 0 |
| `network_topology` | `manter` | equipamentos, interfaces, segmentos e enlaces têm semântica distinta de grafo abstrato | 0 |
| `state_machine` | `manter` | estados, eventos, guardas e ações preservam comportamento reativo | 0 |
| `state_transition_table` | `manter` | explicita cobertura e completude da função de transição em forma tabular | 0 |
| `terminal_session` | `restringir` | registra uma sessão contextual e não executável; não comprova outro ambiente | 0 |
| `bpmn_process` | `restringir` | cobre o subconjunto didático de eventos, tarefas, gateways, raias e fluxos, não toda a BPMN | 0 |
| `reaction` | `restringir` | representa a equação simbólica; níveis macroscópico, microscópico e energético exigem complemento | 0 |
| `software_system_context` | `manter` | preserva a fronteira externa e as responsabilidades do diagrama de contexto C4 | 0 |
| `software_container` | `manter` | representa unidades executáveis e armazenamentos no nível de contêiner C4 | 0 |
| `system_internal_block` | `restringir` | cobre partes, portas, conectores e itens do diagrama interno de bloco, não toda a SysML | 0 |
| `chart` | `restringir` | admite linhas, dispersão e barras; distribuições e painéis exigem outro contrato | 0 |
| `choice` | `manter` | discriminação entre alternativas plausíveis constitui operação de resposta própria | 2.386 |
| `gap` | `manter` | completa um alvo semântico no componente de conteúdo, com estado independente por lacuna | 604 |
| `ordering` | `restringir` | atua somente em alvos textuais de `paragraph` e `table`, sem representar ordem espacial | 0 |

Os artefatos atuais não demonstram motivo para fundir, redesenhar ou retirar
um pacote. Essa conclusão pode mudar diante de revisão disciplinar, defeito
estrutural ou equivalência representacional demonstrada. Pouco uso, por si só,
não decide a retirada.

### Corpus de Cursos

A comparação usa dez documentos completos de Curso fora dos artefatos de
galeria e do Curso de catálogo. O conjunto reúne os cinco arquivos de teste de
conteúdo em `tests/fixtures/course-catalog`, os três Cursos em
`supabase/fixtures/catalog` e os dois arquivos integrais usados na regressão do
Estudo, `project-minimal` e `project-visual`. Esses Cursos contêm 10.388
instâncias de onze pacotes. A contagem da tabela registra instâncias, não
número de Cursos nem frequência de uso por pessoas.

Os outros 21 pacotes aparecem no Curso de catálogo, mas ainda não no corpus
de dez Cursos: `annotated_text`, `interlinear_gloss`, `chart`, `formula`,
`reaction`, `truth_table`, `set_diagram`, `bpmn_process`, `call_stack`,
`state_machine`, `state_transition_table`, `terminal_session`,
`database_schema`, `entity_relationship`, `software_container`,
`software_system_context`, `system_internal_block`, `memory_layout`,
`network_topology`, `packet_layout` e `ordering`.

O Curso de catálogo deriva os 32 pacotes do registro. Cada pacote possui uma
microssequência independente com uma Unidade de teoria e outra de prática. Os
exemplos e as respostas usam conteúdo disciplinar concreto; perguntas que
pedem apenas a finalidade ou o nome do pacote são recusadas pelo teste. Essa
evidência comprova cobertura e validade de contrato. Não mede eficácia nem
substitui avaliação por especialistas e estudantes.

### Descoberta, degradação e limites técnicos

A busca de componentes devolve no máximo oito candidatos. A inspeção admite oito
perfis e a consulta de contrato recebe uma identidade exata por chamada. Uma
solicitação por árvore sintática, quando a notação é parte do objeto de
aprendizagem, classifica `tree` como `substitute` e informa que a representação
é uma aproximação. O aviso impede que a materialização seja apresentada como
equivalência silenciosa.

As medidas abaixo usam JSON em UTF-8 e o estado corrente do registro. São
limites de regressão técnica, não estimativas de unidades de texto processadas
pelo modelo (tokens).

| Medida | Estado corrente | Limite automatizado |
| --- | ---: | ---: |
| resumo exploratório do catálogo | 9.069 bytes | 10 KiB |
| busca mais pesada entre as facetas correntes, com oito candidatos | 5.542 bytes | 8 KiB |
| inspeção dos oito perfis individuais mais extensos | 14.461 bytes | 16 KiB |
| maior resposta de um contrato exato | 13.117 bytes | 16 KiB |
| soma das 32 respostas de contrato, consultadas separadamente | 191.078 bytes | 200 KiB |
| Curso de catálogo completo em disco | 361.088 bytes | lido por recortes no produto |
| definições das cinco ferramentas MCP da candidata | 79.392 bytes | 85.000 bytes |
| código dos componentes espelhado no navegador e na Edge | 51 arquivos; 548.156 bytes | 560 KiB |

O fluxo candidato permanece com cinco ferramentas MCP e não cria tabela ou objeto de
Storage por Unidade. Os dados versionados do pacote ficam no conteúdo
relacional da Unidade. Ainda faltam medições com o GPT hospedado para tokens,
número de chamadas, reparos, latência e retomada, além de CPU, memória e partida
fria da Edge e consumo efetivo de banco, transferência e Storage. Os limites acima
impedem regressões locais conhecidas, mas não comprovam esses custos externos.

## 7. Processo de auditoria

### Etapa 1: auditoria conceitual

O revisor descreve o objeto sem mencionar o componente visual e pergunta qual
relação precisa permanecer explícita. Em seguida, compara prosa, tabela e
pacotes próximos. O resultado possível é manter, restringir, fundir, retirar
ou propor novo pacote.

### Etapa 2: auditoria disciplinar

Um especialista confronta símbolos, terminologia, ordem de leitura e casos
complexos com fontes primárias da área. Divergências legítimas entre notações
devem ser declaradas no manifesto; mistura inadvertida de tradições precisa ser
corrigida.

### Etapa 3: auditoria do contrato

O contrato deve:

- usar conceitos do domínio, não propriedades de CSS ou da biblioteca;
- separar identificadores estruturais e textos visíveis;
- impedir referências inexistentes e duplicidades indevidas;
- expressar cardinalidade e limites;
- produzir erros de validação compreensíveis;
- admitir casos diversos dentro do escopo declarado.

### Etapa 4: auditoria de renderização

Casos de estresse incluem:

- rótulos curtos e longos;
- cardinalidade mínima e máxima admitida;
- grafos densos, ciclos, laços e paralelismo quando pertinentes;
- maior resposta válida já preenchida;
- idiomas com palavras mais extensas;
- temas claro e escuro;
- larguras móveis, zoom e densidade de pixels diferentes;
- rolagem vertical da Unidade e rolagem local da moldura;
- navegação por teclado, foco e leitor de tela.

São defeitos bloqueadores: texto cortado, elemento oculto, sobreposição que
altera significado, aresta ligada ao alvo errado, legenda ambígua, contraste
insuficiente, perda de foco, conteúdo excedente fora do contêiner e mudança de
disposição que revela a resposta.

### Etapa 5: auditoria da prática

Cada alvo é acionado separadamente. Selecionar, limpar, confirmar, tentar de
novo e revelar resposta são testados como estados distintos. Um teste com três
ou mais lacunas verifica que opções, preenchimento, avaliação e retorno não
são compartilhados acidentalmente.

### Etapa 6: auditoria de edição e assistência

O modo de edição mostra somente rótulos compreensíveis e seus agrupamentos. O
JSON estrutural não aparece como texto editável. A seleção enviada à assistência
contém:

- objetivo e contexto somente para leitura;
- campos explicitamente graváveis;
- identificação do pacote e suas restrições;
- histórico conversacional necessário à iteração;
- mecanismo de validação e reversão.

Uma resposta estruturalmente válida ainda precisa ser revisada quanto a
correção e adequação didática ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai); [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)).

### Etapa 7: auditoria pedagógica

O componente é inserido em uma microssequência, não avaliado apenas como figura
isolada. A revisão verifica se:

1. o estudante recebeu os conhecimentos necessários para ler a notação;
2. a teoria não concentra premissas ocultas;
3. a prática cobra somente o que foi ensinado;
4. a representação é necessária à operação;
5. o retorno explica como agir;
6. uma alternativa mais simples produziria o mesmo resultado;
7. a densidade da Unidade prática se justifica pelo contexto da tarefa.

## 8. Critérios de aceitação

Um pacote é aceito tecnicamente quando:

- esquema de validação, mecanismo de renderização, catálogo e projeção de
  autoria concordam;
- a mesma entrada produz estrutura equivalente;
- casos válidos e inválidos possuem testes;
- alvos interativos são independentes;
- não há recorte, sobreposição semântica nem conteúdo excedente fora do
  contêiner nos casos testados;
- a descrição acessível conserva entidades e relações;
- o escopo de edição não alcança estrutura;
- dependências necessárias estão disponíveis no funcionamento sem conexão
  previsto.

É aceito academicamente quando especialistas reconhecem a convenção, os limites
estão declarados e o exemplo de estresse representa uso plausível. É aceito
didaticamente apenas na extensão apoiada por avaliação de interpretação e
tarefa. Esses três estados não devem ser fundidos em um selo único de
“aprovado”.

## 9. Registro de resultados

Cada rodada de auditoria registra:

```text
pacote e escopo
→ problema examinado
→ alternativa comparada
→ fonte disciplinar
→ caso de estresse
→ evidência técnica
→ julgamento especializado
→ evidência com estudantes, se houver
→ decisão: manter, restringir, fundir, redesenhar ou retirar
→ limitações remanescentes
```

“Nenhum defeito encontrado” significa apenas que os casos executados não
revelaram o defeito procurado. Não autoriza inferência de universalidade nem de
eficácia.

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

A [Fundamentação pedagógica dos
componentes](fundamentacao-pedagogica-dos-resources.md) explica as decisões gerais.
As referências acadêmicas completas estão em
[`referencias.bib`](referencias.bib).
