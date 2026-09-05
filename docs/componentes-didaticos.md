# Componentes didáticos e pacotes

No AraLearn, um **componente didático** produz uma representação externa, uma
forma de resposta ou ambas dentro de uma unidade de estudo. Seu **pacote de
componente** reúne contrato, validação, apresentação, acessibilidade e avaliação.
O núcleo de execução conhece as posições ocupadas na Unidade, mas não incorpora
a estrutura interna de grafos, matrizes, fórmulas ou processos.

Essa separação permite ampliar o catálogo sem duplicar leitura e persistência.
Também permite corrigir e testar uma representação especializada sem espalhar
exceções pelo aplicativo.

## 1. Quando um pacote é justificável

Uma caixa visual não se torna um componente didático apenas por ter estilo
próprio. Um pacote especializado se justifica quando texto, tabela genérica ou
outro componente instalado perderia uma relação relevante, uma notação
convencional ou uma operação-alvo da tarefa.

### Critério de decisão

Antes de criar um pacote, responda:

1. qual objeto ou relação precisa ser percebido;
2. qual operação-alvo a tarefa deverá exercitar;
3. qual convenção é usada na área acadêmica;
4. por que uma representação existente não preserva essa intenção;
5. como a forma continua legível, acessível e editável no celular;
6. quais situações tornam o componente inadequado.

`matrix` é distinto de `table` porque posição algébrica, delimitadores e
operações matriciais têm significado. `call-stack` é distinto de tabela quando
precisa mostrar topo, ordem de quadros, ativação e retorno. Se um suposto
“rastreamento de algoritmo” apenas listar linhas e valores, `table` é
suficiente. A especialização se sustenta quando materializa o estado do
algoritmo, sua transição e seus elementos ativos de uma forma que a grade
genérica não expressa.

Representações múltiplas podem favorecer compreensão quando suas funções são
coordenadas, mas aumentam carga quando apenas repetem ou decoram a mesma
informação. Esse princípio é discutido no modelo DeFT de
[Ainsworth (2006)](referencias.md#ref-ainsworth2006deft).

## 2. Núcleo de execução e pacote

O núcleo em `src/resources/kernel/` oferece:

- estrutura externa e posições da unidade de estudo;
- resolução de `package@version`;
- validação estrutural e de composição;
- montagem da apresentação;
- mediação de lacunas, digitação e respostas;
- seleção de instâncias para edição e assistência.

Cada diretório em `src/resources/packages/` oferece:

- identidade, finalidade, taxonomia, operações e limites no manifesto
  (`manifest`);
- linguagem de alto nível para autoria (`authoringContract`);
- formato dos dados (`schema` e `data`);
- normalização e verificação de invariantes (`normalize` e `validate`);
- apresentação visual (`render`) e equivalente textual (`accessibleText`);
- textos editáveis (`editableTargets`) e campos aptos a lacuna ou digitação
  (`practiceTargets`);
- rótulo textual opcional para apresentar um valor de referência sem alterar o
  dado persistido (`practiceValueLabel`);
- avaliação da resposta (`evaluate`);
- ativação posterior quando a interação exigir (`hydrate`).

O registro rejeita pacotes que não cumprem essas obrigações. Um pacote de
conteúdo declara `exposition`; um pacote de resposta implementa sua avaliação.
Todo pacote delimita os textos autorizados e pode participar da busca autoral,
enquanto a estrutura permanece protegida.

## 3. Catálogo como vocabulário controlado

O registro instalado reúne 33 pacotes: 29 de conteúdo e quatro de resposta.
O inventário e a decisão de manter ou restringir cada gramática estão na
[auditoria dos componentes](auditoria-academica-dos-resources.md#6-decisão-corrente-e-uso-observado).
Diretórios auxiliares, como `system-diagrams`, não são pacotes adicionais.

O catálogo descreve os pacotes com facetas controladas:

- domínios e objetos de conhecimento;
- operações-alvo das tarefas;
- convenções acadêmicas;
- modalidades de prática;
- mecanismos de apresentação;
- adequações e contraindicações;
- acessibilidade e limitações;
- posições e compatibilidades de resposta.

Essa organização atende a três necessidades. O modelo recupera candidatos por
intenção, a manutenção acrescenta termos sem ampliar um algoritmo central e a
curadoria confronta a justificativa de cada escolha.

`consultarComponentesDidaticos` expõe o protocolo
`aralearn.resource-library.v1` de maneira progressiva:

1. `explore` mostra famílias e facetas;
2. `search` ordena candidatos por adequação;
3. `inspect` compara até oito perfis;
4. `contracts` entrega exatamente um contrato versionado por chamada;
5. `validate_study_unit` verifica estrutura e composição a partir de `studyUnitJson`;
6. `preview_study_unit` informa se a aplicação pode abrir a composição.

A ferramenta não envia todo o catálogo nem todos os esquemas ao modelo. A
Autoria planeja primeiro, busca depois e carrega uma lista de até oito
candidatos. Ampliar a biblioteca altera os dados catalográficos e os pacotes,
preservando a interface da ferramenta.

Em `search`, a Autoria pode declarar, além da frase de intenção, papel da
Unidade, disciplina, estrutura, operação-alvo, modalidade de
prática, objetos de conhecimento, relações que precisam ser preservadas e se a
notação é objeto de aprendizagem. Essas facetas já pertencem ao catálogo e
evitam que uma frase livre esconda o contraste entre, por exemplo, explicar em
prosa e comparar por tabela, ou entre reconhecer uma alternativa e produzir
uma resposta por digitação.

O retorno preserva frase e facetas em `producerDeclaration`, marcada como não
verificada pelo backend. Com facetas presentes, o ajuste usa essas propriedades
determinísticas e mantém `query` apenas como localizador curto; interpretar a
intenção livre continua sendo responsabilidade do GPT e da pessoa autora.

## 4. Seleção e cobertura

O catálogo devolve um estado de cobertura:

- `canonical`: candidato específico para as facetas solicitadas;
- `versatile`: candidato geral que preserva a operação;
- `substitute`: aproximação possível com limitação declarada.

Esses termos descrevem o ajuste calculado; não proclamam que uma representação
seja universal na academia. O assistente ainda precisa confrontar convenções,
exemplo e contraindicações depois da busca.

A escolha segue a função instrucional, não uma meta de variedade. `paragraph`
continua adequado quando prosa é a melhor forma; `choice`, quando reconhecer
entre alternativas é a operação pretendida. Contraste, sequência, estrutura,
código, tabela, classificação e relações visuais devem levar a Autoria a
considerar os componentes correspondentes quando preservarem melhor o objeto.

O ajuste calculado não autoriza o uso sozinho. A política de componentes
efetiva do curso e do escopo fixa a revisão do catálogo, a disponibilidade
total ou restrita (`all|allow_only`), as exclusões e as preferências. Exclusão vence; preferência
somente desempata candidatos ainda permitidos e semanticamente adequados.
Durante a materialização, o servidor confronta os `package@version` realmente
persistidos com essa política. Sem representação adequada, a autoria registra
a lacuna e não finge equivalência.

## 5. Composição da Unidade de estudo

Uma unidade de estudo possui:

- zero ou mais representações de conteúdo (`content`);
- no máximo um formato de resposta (`response`);
- zero ou mais retornos (`feedback`).

Componentes complementares podem coexistir quando cada um desempenha uma função
diferente, como um parágrafo que situa o fenômeno, uma fórmula que o formaliza e
um gráfico que mostra o comportamento. A composição é inadequada quando duplica
o estímulo ou obriga o estudante a reconciliar representações sem finalidade.

A prática acrescenta uma resposta compatível com o conteúdo. `choice` apresenta
alternativas próprias. `open` recebe explicação, justificativa ou previsão em
texto livre sem fingir correção semântica automática. `gap` e `ordering` atuam nos campos que os pacotes de
conteúdo declaram como alvos: não duplicam o texto numa lista ou num painel de
resposta. Uma correspondência simples é expressa por lacunas independentes nos
campos reais de um `paragraph` ou de uma `table`, sem um pacote paralelo de
encaixe.

## 6. Lacunas, digitação e ordenação internas

Uma lacuna não é um marcador embutido no enunciado. Ela aponta para:

```text
targetInstanceId + targetPath
```

`targetInstanceId` identifica a instância; `targetPath` identifica o campo
declarado por `practiceTargets`. Em campos textuais comuns, o valor é substituído
pelo marcador interativo. Uma referência estrutural só pode ser alvo quando o
pacote declara `preserveReference: true`: nesse caso, o marcador fica associado
ao caminho sem sobrescrever o identificador usado para resolver a estrutura.
Quando o valor de referência não é o melhor rótulo para leitura, como um identificador de estado,
`practiceValueLabel` projeta a forma apresentada nas alternativas e no controle.

### Independência entre lacunas

Cada lacuna possui índice e estado próprios. Suas alternativas pertencem apenas
àquela lacuna e aparecem quando ela recebe foco. Tocar numa lacuna preenchida
novamente a esvazia sem alterar as demais. Digitação segue a mesma identidade,
mas usa entrada textual e normalização declarada.

Identidade não é deduzida pelo valor da resposta. Duas transições que apontam
para o mesmo estado, por exemplo, continuam sendo lacunas distintas porque usam
caminhos e índices distintos; preencher ou abrir as opções de uma não altera a
outra. Reutilizar o mesmo caminho ou chave para várias lacunas produziria
seleção simultânea, portanto o núcleo e os testes verificam unicidade e
materialização de cada alvo. O preenchimento real também é medido no navegador:
o controle precisa caber na reserva calculada antes da interação, sem ser
recortado nem redimensionar a representação depois de uma resposta.

### Ordenação situada

Uma ordenação aponta para pelo menos dois trechos já existentes em campos de
leitura textual de `paragraph` ou `table`. Cada alvo declara instância, caminho
e expressão; a lista de alvos segue a ordem correta de leitura. Durante a
prática, as expressões são permutadas entre esses mesmos pontos. Cada uma traz
botões de seta, apenas por ícone, para mover uma posição à esquerda ou à
direita.

O formato de resposta não repete os itens numa lista própria. Ele apenas
coordena o estado da permutação e o retorno. Alvos em parágrafos e células diferentes podem
participar da mesma sequência, desde que a ordem de leitura seja inequívoca e
os textos permaneçam distintos. Diagramas, fluxos verticais e outras
representações espaciais não recebem essa modalidade por conveniência.

Em `paragraph`, o alvo precisa ser texto plano visível, fora de ênfase, código,
link ou outra marcação. A ordenação não corta sintaxe Markdown nem a apresenta
como se fosse conteúdo. Ocorrências repetidas ou sobrepostas são recusadas em
vez de receber uma posição inferida.

## 7. Autoria e campos protegidos

Cada pacote declara em `editableTargets()` quais textos podem ser alterados sem
expor a estrutura. Coordenadas, identidades relacionais, tipos de nó, índices e
textos destinados apenas à acessibilidade ficam fora desse conjunto.

Essa declaração sustenta validação e correções focais, mas não transforma o
renderer de Conteúdo em editor irrestrito. A interface visual mostra a Unidade com respostas
desativadas. Uma correção aprovada pode alterar os campos autorizados e precisa
validar novamente a Unidade inteira; uma mudança estrutural usa a operação de
composição. JSON bem-formado, por si só, não concede autoridade nem demonstra
validade semântica.

## 8. Mecanismos de apresentação

O pacote escolhe a tecnologia conforme a classe do problema:

| Necessidade | Tecnologia principal | Justificativa |
|---|---|---|
| grafos, fluxos e diagramas relacionais | [Graphviz/Viz.js](https://graphviz.org/) | cálculo automático de disposição, rotas e dimensões a partir da topologia |
| gráficos estatísticos e planos com dados | [Vega/Vega-Lite](https://vega.github.io/vega-lite/docs/) | escalas, eixos, legendas e gramática declarativa de visualização |
| fórmulas, matrizes e reações | [MathML](https://developer.mozilla.org/en-US/docs/Web/MathML) | estrutura matemática nativa e dimensionamento tipográfico dos delimitadores |
| texto, código e tabelas | [HTML semântico](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html) | seleção, reorganização responsiva, acessibilidade e edição textual nativas |

O objetivo não é eliminar CSS, mas evitar que geometria acadêmica dependa de coordenadas autorais ou medições artesanais. Motores externos também têm limites: Graphviz não decide o valor pedagógico de um grafo, Vega não escolhe a escala cientificamente correta e MathML não valida uma equação.

## 9. Regras de representação acadêmica

Um contrato de alto nível deve usar conceitos da área. Exemplos:

- grafos com vértices, arestas, direção, peso e agrupamentos, sem coordenadas
  (`graph`);
- relações com domínio, contradomínio e pares ordenados, sem duplicar elementos
  (`relation-map`);
- matrizes com entradas, linhas, colunas e tipo de delimitador (`matrix`);
- fluxos com eventos, processos, decisões, ramos e junções (`flow`);
- gráficos com variáveis, unidades, séries, incerteza, escala e nota
  metodológica (`chart`);
- glosas com forma, segmentação morfológica, abreviações e tradução
  (`interlinear-gloss`);
- reações com espécies, coeficientes, estados, cargas, condições e seta
  (`reaction`).

O contrato usa conceitos da área em vez de pedir SVG, LaTeX livre, uma tabela
improvisada ou frases concatenadas. Isso reduz ambiguidades e permite que o
pacote preserve convenções. Quando duas áreas usam diagramas superficialmente
parecidos com semânticas distintas, pacotes separados são preferíveis a um
contrato genérico repleto de exceções.

### Sessões textuais observáveis

A sessão textual entre pessoa e sistema, identificada por
`aralearn.resource.terminal_session`, preserva uma sequência temporal. Ela é
apropriada para acompanhar entrada, resposta e efeito em um terminal de
comandos, PowerShell, Git, SQL ou outra interface
textual quando a ordem e o estado observável fazem parte do objeto de estudo.

O contrato declara uma orientação pedagógica em `prompt`, o `environment`, um
`initialContext` opcional e uma lista ordenada de `interactions`. Cada interação
possui `input` e pode registrar separadamente o sinal visual de entrada, `stdout`,
`stderr`, `exitCode` e um efeito curto. Espaços e quebras de linha são
preservados num conteúdo declarativo e determinístico. Em `stdout` e `stderr`,
a cadeia de caracteres vazia significa que o fluxo foi observado sem conteúdo; a omissão
significa que ele não foi registrado ou não é pertinente.

As operações previstas são rastrear interação, interpretar saída, identificar
erro, relacionar ação e consequência, comparar estado, diagnosticar situação,
prever resultado e reconhecer comando.

Esse objeto não é `code`, que preserva código-fonte ou configuração estática;
não é `table`, que compara registros por atributos; e não é `paragraph`, que
expõe uma explicação em prosa. O pacote apresenta um registro fornecido pela
Autoria: não executa nem interpreta comandos, não abre terminal ou banco e não
acessa rede ou ambiente externo. O mesmo texto pode produzir outro resultado em
outro estado, sistema ou momento.

Quando houver prática, somente `interactions[i].input` pode receber lacuna de
escolha com alternativas exatas e inequívocas. O pacote não avalia digitação,
expressões regulares, equivalência semântica nem resposta livre por modelo. Sua
lista cronológica, os rótulos dos fluxos de saída e o texto monoespaçado selecionável
fornecem uma ordem de leitura acessível; no celular, conteúdo largo usa rolagem
local sem alterar espaços ou quebrar o fluxo da Unidade.

Observar e interpretar uma sessão pode preparar reconhecimento, previsão ou
diagnóstico, mas não substitui operar um ambiente real quando executar a ação é
o objetivo de aprendizagem. Nessa situação, a autoria precisa oferecer prática
externa adequada ou declarar explicitamente a limitação.

## 10. Leitura sem gramática adicional

O estudante encontra a notação reconhecida na área. O pacote preserva essa
convenção, e a Unidade introduz os termos necessários quando a leitura da
representação faz parte do conteúdo. Uma instrução breve é adequada quando a
disciplina ensina aquela forma; vocabulário de implementação e instruções
óbvias de rolagem ficam fora do conteúdo didático.

Legendas e instruções são decididas pelo papel que cumprem naquele exemplo:

| Papel | Decisão | Exemplos |
| --- | --- | --- |
| necessário para interpretar | preservar junto ao elemento correspondente | unidade de eixo, cardinalidade, condição de um ramo, abreviação de glosa, direção dos endereços |
| contexto ou orientação opcional | incluir quando acrescentar informação à tarefa | recorte de uma tabela, pressuposto da medição, orientação para comparar dois casos |
| repetição sem função adicional | retirar a cópia e conservar a ocorrência que ancora o significado | repetir abaixo da reação a mesma condição já apresentada sobre a seta |
| informação de implementação | manter fora do material de estudo | identidade interna do pacote, nome de um campo de JSON ou estado do motor de desenho |

Essa decisão não é uma lista de palavras proibidas. `stdout`, `stderr` e código
de saída, por exemplo, são objetos pertinentes de uma sessão de terminal.
Rótulos acessíveis também podem repetir uma informação visual para oferecer
outra forma de acesso; essa repetição não cria um segundo alvo interativo.
A [matriz de legendas](auditoria-academica-dos-resources.md#legendas-instruções-e-prova-por-pacote)
registra as escolhas por pacote, sem retirar eixos, unidades ou relações para
reduzir o tamanho do cartão.

Teoria e prática admitem densidades diferentes. Uma Unidade de teoria apresenta
uma transformação conceitual delimitada, sem condensar vários pressupostos. Uma
Unidade de prática pode conter um contexto mais rico porque o estudante precisa
operar sobre ela; ainda assim, rótulos e relações devem permanecer legíveis.

## 11. Telas móveis, orientação e ampliação

Os dez pacotes que usam a camada compartilhada `system-diagrams` e o pacote
`flow` compartilham o mecanismo de navegação `diagramViewport`. Apresentam um
único diagrama dentro de um quadro estável. A orientação continua favorecendo a
leitura vertical, mas o estudante pode ampliar e mover o próprio desenho no
corpo da Unidade. Em telas táteis, uma pinça com dois dedos altera a escala em
torno do ponto
tocado; quando o conteúdo ampliado ultrapassa o quadro, o arraste percorre os
dois eixos sem redimensionar a Unidade.

Quando houver prática, o controle real da lacuna permanece no ponto semântico
do diagrama. Ele não é duplicado em painel, legenda ou projeção paralela. A
mesma ocorrência continua ativa depois da ampliação e quando o desenho é levado para
tela cheia.

Uma faixa superior reservada no quadro apresenta, no canto direito e somente
por ícones e nomes acessíveis, os comandos de diminuir, aumentar e expandir. Ela
não é sobreposta ao desenho. A expansão move a mesma área visível para um diálogo cuja
largura não excede a largura móvel do aplicativo; ali, diminuir e aumentar ficam
à esquerda e o retorno à Unidade fica à direita. Não há botão visível de ajuste:
reduzir até o limite retoma automaticamente o enquadramento global e responsivo.
Pinça e arraste continuam disponíveis. Escala e posição são estado efêmero do
componente: auxiliam a navegação, mas não integram curso, progresso ou
sincronização.

A orientação continua decorrendo da estrutura. Hierarquias e sistemas tendem à
progressão de cima para baixo; o diagrama interno de bloco SysML adota esse
fluxo em bloco. Relações cuja leitura é genuinamente lateral podem conservar
elementos no mesmo nível, pois a ampliação não depende de forçar toda topologia para
uma única coluna.

A camada compartilhada abrange `bpmn_process`, `database_schema`,
`entity_relationship`, `network_topology`, `relation_map`, `software_container`,
`software_system_context`, `state_machine`, `system_internal_block` e `tree`.
`flow` abre na escala natural, com rolagem local para conservar a leitura dos
rótulos; oferece o mesmo mecanismo de ampliação e expansão. `graph` mantém seu
mecanismo próprio de navegação. A validação visual
inclui larguras móveis, temas e exemplos capazes de expor cruzamentos,
transbordamento, legendas, múltiplas lacunas e textos extensos.

## 12. Acessibilidade

Todo pacote fornece `accessibleText()` e estrutura navegável quando há
controles. Cor não pode ser o único código. Foco, seleção, resposta e erro
precisam de contraste e forma. Alvos de toque seguem os critérios adotados pelo
sistema visual.

Um equivalente textual oferece acesso ao conteúdo e base para tecnologia
assistiva, mas ainda precisa de ordem de leitura e nomes de relações adequados.
Pacotes complexos também devem apresentar retorno contextualizado.

A interação específica permanece no próprio pacote. Em `annotated_text`,
selecionar um trecho destaca as notas associadas e traz a primeira nota para
a área visível; selecionar uma nota destaca os trechos correspondentes. Os
botões funcionam por toque e teclado e expõem seu estado pressionado. A
hidratação pode ser chamada novamente sem duplicar listeners nem alterar
outra instância da unidade.

## 13. Validação e escolha

`validate_study_unit` verifica:

- estrutura externa e posições;
- `package@version` instalado;
- formato e semântica de `data`;
- identificadores e caminhos de prática;
- compatibilidades entre conteúdo e resposta.

`search` e `inspect` comparam as facetas declaradas com metadados determinísticos
do catálogo. Essa comparação ajuda a escolher candidatos, mas não prova que o
texto, a interação ou o feedback cumpram a intenção. O GPT confronta o conteúdo
produzido com a função instrucional e a pessoa autora decide ambiguidades.

A apresentação real e os testes de navegador verificam geometria e
comportamento. Essas etapas fornecem evidência técnica; correção científica e
efeito pedagógico com estudantes exigem avaliação acadêmica e empírica.

## 14. Adicionar ou revisar um pacote

1. registre a justificativa pedagógica e as alternativas recusadas;
2. escolha a convenção e a tecnologia adequadas;
3. defina manifesto (`manifest`), taxonomia, contrato e exemplo complexo;
4. implemente normalização, validação, apresentação e acessibilidade;
5. declare edição e alvos de prática sem expor estrutura;
6. teste exposição, lacunas independentes, digitação e respostas compatíveis;
7. teste claro/escuro, 360/390/430 px e computador, textos extensos e dados complexos;
8. regenere o índice, o espelho da Edge, a projeção SQL e os dados de Autoria;
9. verifique a coerência de nomes, contratos e comportamentos com o modelo corrente;
10. atualize documentação e evidência de conformidade.

Adicionar um pacote preserva o núcleo. Alterar a estrutura externa, as posições ou a
semântica comum modifica o núcleo e exige revisão mais ampla.

Uma pasta em `src/resources/packages` exporta uma definição com manifesto,
esquema, contrato de autoria, exemplo, normalização, validação, apresentação,
texto acessível e alvos textuais pertinentes. `generateResourcePackageIndex.mjs`
descobre a pasta; a sequência anterior permanece estável porque dela derivaram
identificadores de exemplos publicados. O catálogo, a consulta de contratos e
os canais de Autoria usam esse registro. O envelope conserva `package`,
`version` e `data`, sem acrescentar uma lista de tipos em cada canal.

Respostas declaram `responseInteraction` com `createState`, `submit` e `bind`,
além de `evaluate`. O pacote controla seus campos, validação de preenchimento e
interação; o aplicativo fornece acesso ao estado da instância, foco, apresentação
e submissão. A ligação de eventos suporta nova hidratação sem duplicar listeners.
Quando uma resposta depende de um trecho do conteúdo, o próprio pacote declara
`prepareContentInstance`, a validação da relação e, quando necessário,
`reconcileContentEdit`. Uma ambiguidade na edição textual impede a gravação.
Assim, acrescentar uma resposta compatível não exige um desvio por identidade
no controlador de Estudo.

`version` identifica a compatibilidade do formato e do significado dos dados.
Uma ampliação explícita que conserva as entradas anteriores e sua normalização
pode manter a versão: `paragraph@1.0.0` admite texto simples e o formato rico
distinto, e `flow@1.0.0` mantém os dados ao corrigir sua apresentação. Uma mudança
que invalida ou reinterpreta dados exige nova versão e conversão única dos dados
úteis. Não se mantêm parsers antigos ou aliases para ocultar a mudança.

O fingerprint SHA-256 do catálogo identifica exatamente manifestos, esquemas e
contratos de autoria instalados. A revisão de descoberta e esse fingerprint
acompanham a projeção SQL; o cliente e a Edge recusam divergência ou omissão. O
SHA do código publicado identifica a implementação completa, incluindo os
renderizadores. Para preparar uma atualização, execute o gerador do índice,
`syncEdgeResourceRuntime.mjs` e `syncResourcePackageCatalog.mjs --print`; inclua
o bloco resultante em uma **nova migration**, com as verificações de transição
necessárias. O modo padrão do último script apenas confere a migration corrente
e integra a validação do runtime. Uma migration aplicada não é regravada.

A atualização compatível conserva literalmente os snapshots de configuração
já aplicada. Preferências atuais podem receber a revisão corrente quando o
conjunto de referências permanece igual. A materialização seguinte registra a
configuração corrente. A edição conserva o snapshot histórico literalmente.
Somente uma mudança de título, com conteúdo e hierarquia idênticos, conserva
também a aplicação semântica atual. Alterar prosa, resposta ou estrutura
invalida essa aplicação: referências de componentes iguais não demonstram que
o conteúdo continua realizando a mesma análise instrucional.

A prova de extensão em `tests/kernel/resource-package-extension.test.js`
acrescenta um pacote apenas a uma cópia temporária: verifica descoberta,
contrato, normalização, ida e volta relacional, apresentação e interação, além
de conferir que o núcleo não mudou. Esse pacote de teste não integra o produto.
Uma futura ferramenta de áudio, cálculo ou leitura deverá usar o mesmo registro:
a extensão mínima será a identidade `aralearn.tool.*` e a posição própria na
Unidade quando existir a primeira ferramenta consumidora. Esta etapa não instala
um executor ou metadados de ferramentas sem uso.

<!-- referências locais: início -->

## Referências

- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.

<!-- referências locais: fim -->
