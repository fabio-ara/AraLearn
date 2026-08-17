# Componentes didáticos e packages

No AraLearn, um **package de componente** é um módulo que representa um objeto de conhecimento ou uma forma de resposta cuja estrutura possui significado pedagógico. Ele reúne contrato, validação, renderização, acessibilidade, edição e avaliação. O kernel conhece apenas como packages ocupam os slots de uma Unidade de estudo; não conhece a estrutura interna de grafo, matriz, fórmula ou processo.

Essa separação resolve dois problemas:

- um catálogo crescente não obriga a refatorar o leitor e a persistência;
- uma representação especializada pode ser corrigida e testada sem criar exceções espalhadas pelo aplicativo.

## 1. Quando um package é justificável

Uma caixa visual não se torna um resource apenas por ter estilo próprio. O package é justificável quando texto, tabela genérica ou outro package existente perderia uma relação relevante, uma notação convencional ou uma operação-alvo da tarefa.

### Critério de decisão

Antes de criar um package, responda:

1. qual objeto ou relação precisa ser percebido;
2. qual gesto o estudante deverá executar;
3. qual convenção é usada na área acadêmica;
4. por que uma representação existente não preserva essa intenção;
5. como a forma continua legível, acessível e editável no celular;
6. quais situações tornam o package inadequado.

`matrix` é distinto de `table` porque posição algébrica, delimitadores e operações matriciais têm significado. `call-stack` é distinto de tabela quando precisa mostrar topo, ordem de quadros, ativação e retorno. Se um suposto “rastreamento de algoritmo” apenas listar linhas e valores, `table` é suficiente; a especialização só se sustenta quando o estado do algoritmo, sua transição e seus elementos ativos são materializados de modo que a grade genérica não expressa.

Representações múltiplas podem favorecer compreensão quando suas funções são coordenadas, mas aumentam carga quando apenas repetem ou decoram a mesma informação. Esse princípio é discutido no modelo DeFT de [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft).

## 2. Kernel e package

O kernel em `src/resources/kernel/` oferece:

- envelope e slots da Unidade de estudo;
- resolução de `package@version`;
- validação estrutural e de composição;
- montagem do renderer;
- mediação de lacunas, digitação e respostas;
- seleção de instâncias para edição e assistência.

Cada diretório em `src/resources/packages/` oferece:

- `manifest`: identidade, finalidade, taxonomia, operações e limites;
- `authoringContract`: linguagem de alto nível que o autor preenche;
- `schema`: forma de `data`;
- `normalize` e `validate`: canonicalização e invariantes;
- `render`: saída visual;
- `accessibleText`: equivalente textual;
- `editableTargets`: textos que podem ser alterados sem expor a estrutura;
- `practiceTargets`: campos internos aptos a lacuna ou digitação;
- `practiceValueLabel`: projeção textual opcional para apresentar ao estudante
  um valor canônico de prática sem alterar o dado persistido;
- `evaluate`: quando o package é uma resposta;
- `hydrate`: somente quando a interação exige comportamento posterior.

O registro rejeita packages que não implementam essas obrigações. Um package de conteúdo precisa declarar `exposition`; um package de resposta precisa avaliar sua resposta. Edição textual e seleção por assistência são obrigatórias, enquanto edição manual da estrutura permanece desabilitada.

## 3. Catálogo como vocabulário controlado

O catálogo não é uma lista solta de nomes. Ele descreve packages com facetas controladas:

- domínios e objetos de conhecimento;
- operações-alvo das tarefas;
- convenções acadêmicas;
- modalidades de prática;
- tecnologias de renderização;
- adequações e contraindicações;
- acessibilidade e limitações;
- slots e compatibilidades de resposta.

Essa organização combina três necessidades. O modelo precisa recuperar candidatos por intenção; a manutenção precisa acrescentar termos sem alterar um algoritmo gigante; a curadoria precisa confrontar por que um candidato foi escolhido.

`consultarComponentesDidaticos` expõe o protocolo `aralearn.resource-library.v1` de maneira progressiva:

1. `explore` mostra famílias e facetas;
2. `search` ranqueia candidatos;
3. `inspect` compara até oito perfis;
4. `contracts` entrega exatamente um contrato versionado por chamada;
5. `validate_study_unit` verifica estrutura e composição a partir de `studyUnitJson`;
6. `audit_representation` examina adequação e legibilidade;
7. `preview_study_unit` informa se o runtime pode abrir a composição.

Não se envia todo o catálogo nem todos os schemas ao modelo. A autoria planeja primeiro, busca depois e carrega apenas a lista curta. Assim, ampliar a biblioteca altera dados catalográficos e packages, não a interface da ferramenta.

## 4. Seleção e cobertura

O catálogo devolve um estado de cobertura:

- `canonical`: candidato específico para as facetas solicitadas;
- `versatile`: candidato geral que preserva a operação;
- `substitute`: aproximação possível com limitação declarada.

Esses termos descrevem o ajuste calculado, não proclamam que uma representação seja universal na academia. O agente deve confrontar convenções, exemplo e contraindicações depois da busca.

O ajuste calculado não autoriza o uso sozinho. A política de componentes
efetiva do Curso e do escopo fixa a revisão do catálogo, a disponibilidade
`all|allow_only`, as exclusões e as preferências. Exclusão vence; preferência
somente desempata candidatos ainda permitidos e semanticamente adequados.
Durante a materialização, o servidor confronta os `package@version` realmente
persistidos com essa política. Sem representação adequada, a autoria registra
a lacuna e não finge equivalência.

## 5. Composição da Unidade de estudo

Uma Unidade de estudo possui:

- zero ou mais instâncias `content`;
- no máximo uma instância `response`;
- zero ou mais instâncias `feedback`.

Packages complementares podem coexistir quando cada um desempenha uma função diferente, como um parágrafo que situa o fenômeno, uma fórmula que o formaliza e um gráfico que mostra o comportamento. A composição é inadequada quando duplica o estímulo ou obriga o estudante a reconciliar representações sem finalidade.

A prática acrescenta uma resposta compatível com o conteúdo. `choice` apresenta
alternativas próprias. `gap` e `ordering` atuam nos campos que os packages de
conteúdo declaram como alvos: não duplicam o texto numa lista ou num painel de
resposta. Uma correspondência simples é expressa por lacunas independentes nos
campos reais de um `paragraph` ou de uma `table`, sem um package paralelo de
encaixe.

## 6. Lacunas, digitação e ordenação internas

Uma lacuna não é um marcador embutido no enunciado. Ela aponta para:

```text
targetInstanceId + targetPath
```

`targetInstanceId` identifica a instância; `targetPath` identifica o campo
declarado por `practiceTargets`. Em campos textuais comuns, o valor é substituído
pelo marcador interativo. Uma referência estrutural só pode ser alvo quando o
package declara `preserveReference: true`: nesse caso, o marcador fica associado
ao caminho sem sobrescrever o identificador usado para resolver a estrutura.
Quando o valor canônico não é o melhor rótulo para leitura, como um id de estado,
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
seleção simultânea, portanto o kernel e os testes verificam unicidade e
materialização de cada alvo. O preenchimento real também é medido no navegador:
o controle precisa caber na reserva calculada antes da interação, sem ser
recortado nem redimensionar o resource depois de uma resposta.

### Ordenação situada

Uma ordenação aponta para pelo menos dois trechos já existentes em campos de
leitura textual de `paragraph` ou `table`. Cada alvo declara instância, caminho
e expressão; a lista de alvos segue a ordem correta de leitura. Durante a
prática, as expressões são permutadas entre esses mesmos pontos. Cada uma traz
botões de seta, apenas por ícone, para mover uma posição à esquerda ou à
direita.

O response não repete os itens numa lista própria. Ele apenas coordena o estado
da permutação e o feedback. Alvos em parágrafos e células diferentes podem
participar da mesma sequência, desde que a ordem de leitura seja inequívoca e
os textos permaneçam distintos. Diagramas, fluxos verticais e outras
representações espaciais não recebem essa modalidade por conveniência.

Em `paragraph`, o alvo precisa ser texto plano visível, fora de ênfase, código,
link ou outra marcação. A ordenação não corta sintaxe Markdown nem a apresenta
como se fosse conteúdo. Ocorrências repetidas ou sobrepostas são recusadas em
vez de receber uma posição inferida.

## 7. Edição manual e assistência contextual

O autor edita os textos visíveis no próprio resource, não JSON estrutural nem
uma tela paralela de campos. `editableTargets()` delimita os caminhos permitidos;
o renderer associa esses caminhos aos rótulos já apresentados e habilita apenas
contorno, cursor de texto e caret. Entrar no modo de edição não muda a geometria
da Unidade. Coordenadas, ids relacionais, tipos de nó, índices e textos apenas
acessíveis continuam fora da superfície editável.

A seleção visual pode abranger uma instância, uma Unidade ou um recorte hierárquico autorizado. A assistência por API recebe:

- objetivo e conversa curta;
- contexto didático de leitura;
- packages selecionados e seus contratos exatos;
- lista explícita de caminhos textuais graváveis;
- versão corrente para desfazer, refazer e restaurar.

Um modelo leve pode propor `edit_text` somente nos alvos autorizados. Uma recomposição estrutural exige a Unidade inteira e nova validação. O retorno nunca ganha autoridade apenas porque contém JSON bem-formado.

## 8. Motores de representação

O renderer escolhe tecnologia pela classe do problema:

| Necessidade | Tecnologia principal | Justificativa |
|---|---|---|
| grafos, fluxos e diagramas relacionais | [Graphviz/Viz.js](https://graphviz.org/) | cálculo automático de layout, rotas e dimensões a partir da topologia |
| gráficos estatísticos e planos com dados | [Vega/Vega-Lite](https://vega.github.io/vega-lite/docs/) | escalas, eixos, legendas e gramática declarativa de visualização |
| fórmulas, matrizes e reações | MathML | estrutura matemática nativa e dimensionamento tipográfico dos delimitadores |
| texto, código e tabelas | HTML semântico | seleção, reflow, acessibilidade e edição textual nativos |

O objetivo não é eliminar CSS, mas evitar que geometria acadêmica dependa de coordenadas autorais ou medições artesanais. Motores externos também têm limites: Graphviz não decide o valor pedagógico de um grafo, Vega não escolhe a escala cientificamente correta e MathML não valida uma equação.

## 9. Regras de representação acadêmica

Um contrato de alto nível deve usar conceitos da área. Exemplos:

- `graph`: vértices, arestas, direção, peso e agrupamentos, sem coordenadas;
- `relation-map`: domínio, contradomínio e pares ordenados, sem duplicar elementos;
- `matrix`: entradas, linhas, colunas e tipo de delimitador;
- `flow`: eventos, processos, decisões, ramos e junções;
- `chart`: variáveis, unidades, séries, incerteza, escala e nota metodológica;
- `interlinear-gloss`: forma, segmentação morfológica, glosas, tradução e abreviações;
- `reaction`: espécies, coeficientes, estados, cargas, condições e seta.

O contrato não pede SVG, LaTeX livre, uma tabela improvisada ou frases concatenadas. Isso reduz erro do modelo e permite que o renderer preserve convenções. Quando duas áreas usam diagramas superficialmente parecidos com semânticas distintas, packages separados são preferíveis a um contrato genérico repleto de exceções.

### Sessões textuais observáveis

`aralearn.resource.terminal_session` representa uma sequência temporal de
interações textuais entre pessoa e sistema. Ele é apropriado para acompanhar
entrada, resposta e efeito em shell, PowerShell, Git, SQL ou outra interface
textual quando a ordem e o estado observável fazem parte do objeto de estudo.

O contrato declara uma orientação pedagógica em `prompt`, o `environment`, um
`initialContext` opcional e uma lista ordenada de `interactions`. Cada interação
possui `input` e pode registrar separadamente o prompt visual, `stdout`,
`stderr`, `exitCode` e um efeito curto. Espaços e quebras de linha são
preservados num conteúdo declarativo e determinístico. Em `stdout` e `stderr`,
a string vazia significa que o stream foi observado sem conteúdo; a omissão
significa que ele não foi registrado ou não é pertinente.

As operações previstas são rastrear interação, interpretar saída, identificar
erro, relacionar ação e consequência, comparar estado, diagnosticar situação,
prever resultado e reconhecer comando.

Esse objeto não é `code`, que preserva código-fonte ou configuração estática;
não é `table`, que compara registros por atributos; e não é `paragraph`, que
expõe uma explicação em prosa. O package apresenta um registro fornecido pela
autoria: não executa nem interpreta comandos, não abre shell ou banco e não
acessa rede ou ambiente externo. O mesmo texto pode produzir outro resultado em
outro estado, sistema ou momento.

Quando houver prática, somente `interactions[i].input` pode receber lacuna de
escolha com alternativas exatas e inequívocas. O package não avalia digitação,
expressões regulares, equivalência semântica nem resposta livre por modelo. Sua
lista cronológica, os rótulos de streams e o texto monoespaçado selecionável
fornecem uma ordem de leitura acessível; no celular, conteúdo largo usa rolagem
local sem alterar espaços ou quebrar o fluxo da Unidade.

Observar e interpretar uma sessão pode preparar reconhecimento, previsão ou
diagnóstico, mas não substitui operar um ambiente real quando executar a ação é
o objetivo de aprendizagem. Nessa situação, a autoria precisa oferecer prática
externa adequada ou declarar explicitamente a limitação.

## 10. Leitura sem gramática adicional

O estudante não deve aprender uma legenda inventada pelo AraLearn para só então compreender o objeto. O package segue a notação reconhecida na área e a Unidade introduz termos ou convenções que façam parte do próprio conteúdo. Uma breve instrução de leitura é apropriada quando a disciplina realmente ensina aquela representação; vocabulário de implementação ou instruções óbvias de rolagem não são conteúdo didático.

Teoria e prática admitem densidades diferentes. Uma Unidade de teoria apresenta uma transformação conceitual delimitada, sem condensar vários pressupostos. Uma Unidade de prática pode conter contexto residente mais rico porque o estudante precisa operar sobre ela; ainda assim, rótulos e relações devem permanecer legíveis.

## 11. Mobile, orientação e escalabilidade

Os dez packages que usam a camada compartilhada `system-diagrams` apresentam um
único diagrama dentro de um quadro estável. A orientação continua favorecendo a
leitura vertical, mas o estudante pode ampliar e mover o próprio desenho no
corpo da Unidade. Em telas táteis, uma pinça com dois dedos altera a escala em torno do ponto
tocado; quando o conteúdo ampliado ultrapassa o quadro, o arraste percorre os
dois eixos sem redimensionar a Unidade.

Quando houver prática, o controle real da lacuna permanece no ponto semântico
do diagrama. Ele não é duplicado em painel, legenda ou projeção paralela. A
mesma ocorrência continua ativa depois do zoom e quando o desenho é levado para
tela cheia.

Uma faixa superior reservada no quadro apresenta, no canto direito e somente
por ícones e nomes acessíveis, os comandos de diminuir, aumentar e expandir. Ela
não é sobreposta ao desenho. A expansão move a mesma viewport para um diálogo cuja
largura não excede a largura móvel do aplicativo; ali, diminuir e aumentar ficam
à esquerda e o retorno à Unidade fica à direita. Não há botão visível de ajuste:
reduzir até o limite retoma automaticamente o enquadramento global e responsivo.
Pinça e arraste continuam disponíveis. Escala e posição são estado efêmero do
renderer: auxiliam a navegação corrente, mas não integram curso, progresso ou
sincronização.

A orientação continua decorrendo da estrutura. Hierarquias e sistemas tendem à
progressão de cima para baixo; o diagrama interno de bloco SysML usa agora esse
fluxo em bloco. Relações cuja leitura é genuinamente lateral podem conservar
elementos no mesmo nível, pois o zoom não depende de forçar toda topologia para
uma única coluna.

Essa política inicial abrange `bpmn_process`, `database_schema`,
`entity_relationship`, `network_topology`, `relation_map`, `software_container`,
`software_system_context`, `state_machine`, `system_internal_block` e `tree`.
`flow` e `graph` ainda usam seus navegadores próprios e não devem ser descritos
como se já compartilhassem essa camada. A galeria continua incluindo larguras
móveis, temas e exemplos não triviais para expor cruzamentos, overflow,
legendas, múltiplas lacunas e textos longos.

## 12. Acessibilidade

Todo package fornece `accessibleText()` e estrutura navegável quando há controles. Cor não pode ser o único código. Foco, seleção, resposta e erro precisam de contraste e forma. Alvos de toque seguem os critérios adotados pelo sistema visual.

Um equivalente textual não torna automaticamente um diagrama compreensível a todas as pessoas; ele oferece acesso ao conteúdo e base para tecnologia assistiva. Packages complexos precisam de ordem de leitura, nomes de relações e feedback contextualizados.

## 13. Validação e auditoria

`validate_study_unit` verifica:

- envelope e slots;
- `package@version` instalado;
- schema e semântica de `data`;
- ids e caminhos de prática;
- compatibilidades entre conteúdo e resposta.

`audit_representation` acrescenta:

- `semantic_fit`: a forma preserva a intenção;
- `response_affordance`: a interação exercita o gesto planejado;
- `feedback_legibility`: o retorno pode ser relacionado à resposta.

O renderer real e os testes de navegador verificam geometria e comportamento. Nenhuma dessas etapas isolada comprova correção científica ou efetividade pedagógica com estudantes. O conjunto fornece evidência técnica; avaliação acadêmica e empírica permanece necessária.

## 14. Adicionar ou revisar um package

1. registre a justificativa pedagógica e as alternativas recusadas;
2. escolha a convenção e a tecnologia adequadas;
3. defina manifest, taxonomia, contrato e exemplo complexo;
4. implemente normalização, validação, renderer e acessibilidade;
5. declare edição e alvos de prática sem expor estrutura;
6. teste exposição, lacunas independentes, digitação e respostas compatíveis;
7. teste claro/escuro, 360/390/430 px e desktop, textos longos e dados complexos;
8. regenere catálogo e packages de autoria;
9. execute auditoria de resíduos para impedir renderer ou alias antigo;
10. atualize documentação e evidência de conformidade.

Adicionar um package não muda o kernel. Alterar o envelope, os slots ou a semântica comum é mudança de kernel e exige revisão mais ampla.
