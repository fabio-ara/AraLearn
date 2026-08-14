# Conhecimento didático dos resources do AraLearn

Critérios pedagógicos para escolher e combinar resources. Na única consultarBibliotecaDeResources, percorra explore, search, inspect e contracts; valide e audite cada card antes de salvá-lo.

---

## knowledge/cards-and-resources.md

# Cards e packages

O package representa a estrutura sobre a qual o estudante raciocina. Escolha-o pela operação exigida, não pela aparência, por uma cota de variedade nem pela facilidade de geração.

Uma representação visual não recebe um card auxiliar para ensinar uma gramática inventada pela interface. O contexto disciplinar apresenta os conceitos e convenções necessários em progressão; o package materializa essas relações de forma canônica e mais direta que prosa, tabela ou outra alternativa mais simples. Se isso não ocorrer, a seleção ou o package está errado.

O catálogo MCP é a fonte de verdade sobre os packages instalados. Use somente `consultarBibliotecaDeResources`: `explore` apresenta famílias e facetas; `search` procura pela intenção e classifica a cobertura; `inspect` compara até oito perfis; `contracts` carrega no máximo quatro versões exatas por chamada. Compare finalidade, operações, área, objeto, convenções, contraindicações, modalidades, slots e compatibilidades com o gesto cognitivo planejado; não escolha apenas pelo nome. O catálogo pode crescer sem alterar estas instruções.

Depois de compor o envelope, chame `validate_card` e então `audit_representation`. A primeira operação confere estrutura, referências e compatibilidade; a segunda separa a adequação semântica do conteúdo, a possibilidade de resposta e a legibilidade do feedback. `preview_card` apenas descreve a composição e sempre informa `rendered: false`; Graphviz, Vega, viewport e screenshot pertencem ao renderer real do aplicativo.

`canonical` é o ajuste específico e `versatile` é uma convenção transversal adequada. `substitute` é a melhor aproximação disponível e nunca bloqueia a autoria: prossiga e inclua o `chatDisclosure` devolvido em uma linha natural no chat, sem inseri-lo no conteúdo estudado.

## Composição do card

O card usa apenas o envelope fechado de `aralearn.library.v1`:

- `content` contém zero ou mais packages de representação;
- `response` contém um único package de resposta em prática e é `null` em teoria;
- `feedback` contém packages mostrados depois da resposta;
- cada instância tem somente `id`, `package`, `version` e `data`.

Não existem `card.resource`, `card.kind`, `card.exercise`, `blocks`, `after`, `afterBlocks`, marcador textual de lacuna ou outro contrato paralelo. Não converta exemplos desses formatos. Se dados recebidos os utilizarem, relate que eles precisam ser reconstruídos no envelope corrente.

Em `aralearn.response.choice`, `data.question` é o único enunciado da escolha. Não repita essa pergunta em `paragraph`. Use `content: []` quando não houver cenário, dado ou representação adicional.

## Seleção pedagógica

Use o manifest recuperado por MCP para comparar a operação cognitiva com a finalidade do package. Em termos gerais:

- texto explicativo pede `aralearn.resource.paragraph`;
- código, tabela, fórmula, reação, gráfico quantitativo, fluxo, árvore, grafo, matriz, plano, diagramas de software, mapa de relações, diagrama de conjuntos, tabela-verdade, cabeçalho de pacote, esquema relacional, máquina de estados, topologia de rede, mapa de memória, glosa interlinear e texto anotado pedem seus packages estruturais específicos;
- discriminação por alternativas pede `aralearn.response.choice`;
- recuperação dentro de um campo textual visível pede `aralearn.response.gap`;
- reconstrução de uma ordem entre ao menos duas expressões já visíveis em `paragraph` ou células de `table` pede `aralearn.response.ordering`;
- reconstrução de pares ou classificação usa `gap` sobre os campos correspondentes de um `paragraph` ou de uma `table`.

Essa orientação não substitui o catálogo. Nunca memorize um schema, invente campos, use coordenadas de tela ou presuma que todos os packages aceitam toda resposta. A combinação é válida somente quando manifest, contrato e validação do package concordam.

## Lacunas e ordenação

Uma lacuna declara `targetInstanceId` e `targetPath` para um campo textual real de uma instância em `content`. A resposta precisa ocorrer nesse campo e será substituída pelo controle interativo somente na renderização. A notação de `targetPath` pertence ao contrato recuperado de `aralearn.response.gap`; não codifique lacunas em strings.

Uma ordenação declara ao menos dois alvos com `targetInstanceId`, `targetPath` e a expressão que já ocorre no campo textual. Os alvos aparecem na ordem correta de leitura; o estudante move as expressões para esquerda ou direita pelos ícones no próprio ponto. Quando mais de uma expressão pertence ao mesmo campo, cada `targetPath` recebe um sufixo de ocorrência distinto. Use somente texto plano visível, fora de marcação Markdown. Não duplique a sequência no response nem aplique ordering a diagramas, fluxos ou outra leitura espacial. Use somente `responseCompatibility` e `practiceTargets` do contrato exato e confirme a composição com `validate_card`.

Uma correspondência simples não cria outro tipo de resposta. Represente os pares no resource textual adequado e aplique uma lacuna independente ao campo a completar; cada lacuna conserva resposta, opções e estado próprios.

## Representações visuais

O JSON descreve significado; o renderer do package decide geometria e dimensionamento. Não tente alinhar pixels na autoria. Rótulos precisam ser curtos o suficiente para leitura móvel, mas não podem trocar nomes reais por códigos opacos que obriguem o estudante a consultar uma legenda distante.

Em `graph`, vértices são entidades estáveis e relações são apresentadas sem sobrepor rótulos às arestas. Use direção somente quando ela mudar a interpretação. Não force um grafo para representar uma simples sequência ou lista.

Em `relation_map`, deixe explícitos domínio, contradomínio e pares ordenados. O renderer apresenta os dois conjuntos e uma seta sem rótulo para cada par; a notação extensional complementar registra os pares sem disputar espaço com as arestas. Use-o somente quando imagem, preimagem ou cardinalidade fizer parte do raciocínio. Use `table` com lacunas para uma simples correspondência e `set_diagram` quando interseção, união ou pertencimento simultâneo for o objeto. Nesse package, escolha `venn` quando todas as combinações lógicas precisam permanecer visíveis e `euler` quando a ausência de uma região é parte da topologia observada. Declare conjuntos, símbolos curtos e pertencimento; não declare círculos, coordenadas ou tamanhos. Mais de três conjuntos exigem outra representação, não um diagrama ilegível comprimido.

`matrix` é reservado a arranjos algébricos de escalares ou expressões, sem cabeçalhos de atributos nem grade de registros. Para dados tabulares use `table`; para esquema relacional use `database_schema`. Mudanças de variáveis por passo permanecem em `table` enquanto não houver uma representação sincronizada de execução que preserve estrutura adicional.

Em `flow`, cada decisão explicita condição e consequência. Em `tree`, a ligação preserva pai e filho. Nos demais packages, unidades, eixos, ordem, notação, grupos e direção necessários precisam estar declarados nos campos semânticos do contrato.

`flow` não é uma árvore indentada. Sua raiz lógica é uma sequência e o renderer materializa terminais arredondados, processos retangulares, entrada/saída em paralelogramos, decisões em losangos, conectores orientados e junções. A autoria nunca declara coordenadas ou arestas.

`formula` recebe uma AST semântica, não uma string de notação. Integrais, derivadas, tensores, funções, somatórios, produtos, limites, frações, raízes, índices e cercas usam os respectivos nós do contrato. Use `prompt` ou `paragraph` para a explicação em prosa; tokens textuais dentro da AST servem somente a conectores matemáticos curtos. A leitura acessível acompanha a mesma estrutura e não pode se limitar a repetir símbolos.

## Validação

Antes de gravar:

1. valide o envelope fechado do card;
2. valide cada instância contra o schema de seu package e versão;
3. valide as relações entre `response` e `content`;
4. confira que a composição materializa `goal`, `covers` e `checks`;
5. leia o card no tamanho móvel e confirme legibilidade, autonomia e ausência de resposta exposta.

Um erro de contrato deve ser corrigido explicitamente. Não existe renderer antigo, projeção de card, compatibilidade ou fallback de formato.

---

## knowledge/domain-patterns.md

# Padrões de autoria por área

O plano sempre parte de uma pessoa sem conhecimentos prévios, salvo quando o pedido ou os materiais comprovam um pré-requisito. A área muda a forma de representar, praticar e verificar o conteúdo; não muda a exigência de explicar símbolos, oferecer base causal e manter cada prática autossuficiente. Fidelidade terminológica à fonte não autoriza reproduzir sua densidade: apresente primeiro a situação em linguagem comum, use exemplo concreto quando útil e introduza depois os termos técnicos e suas relações, distribuindo conceitos novos independentes entre cards ou microssequências.

## Escolha da representação

Escolha o recurso pela operação que o estudante precisa realizar:

| Operação | Recursos mais prováveis |
|---|---|
| compreender uma definição ou distinção | `paragraph`, `choice` ou combinação justificada de packages |
| acompanhar execução, sintaxe ou comando | `code`, `table`, `flow` |
| comparar casos, registros ou valores | `table`, `chart`, `choice` |
| reconhecer hierarquia ou classificação | `tree`, ou `table` com `gap` quando for preciso completar categorias |
| analisar adjacência, caminhos, ciclos ou conectividade abstrata | `graph` |
| analisar equipamentos, segmentos ou rotas de rede | `network_topology` |
| situar pessoas e sistemas externos em relação a um software | `software_system_context` |
| distinguir aplicações e armazenamentos internos de um software | `software_container` |
| analisar partes, portas e conectores internos de um bloco | `system_internal_block` |
| raciocinar com coordenadas, vetores ou distância | `plane`, `matrix`, `formula` |
| ler notação matemática | `formula`, `matrix` ou combinação justificada de packages |
| ler ou balancear uma equação de reação | `reaction`, `formula` ou combinação justificada de packages |
| avaliar proposições ou conectivos | `truth_table`, `formula` |
| analisar relações entre conjuntos | `relation_map`, `set_diagram` |
| interpretar cabeçalhos e offsets | `packet_layout`, `memory_layout` |
| inspecionar chaves e referências | `database_schema`, `table` |
| acompanhar eventos dependentes de estado | `state_machine` |

O recurso visual permanece no próprio card de prática. Não descreva um diagrama ausente nem peça que a pessoa se lembre dos valores apresentados anteriormente.

Registre o objetivo e a evidência em `microsequence.goal` e `microsequence.checks`, delimite o recorte em `microsequence.covers` e materialize a escolha diretamente em instâncias de package nos slots do card. A tabela acima orienta a análise, mas não escolhe o recurso de modo automático e não autoriza metadados adicionais fora do contrato.

## Programação, bancos de dados e automação

- Apresente a semântica da operação antes de cobrar a sintaxe.
- Use `code` com lacunas quando um token, uma expressão ou uma linha completa for a decisão principal.
- Use alternativas quando o objetivo for prever saída, encontrar defeito, escolher consulta ou distinguir efeitos colaterais.
- Preserve indentação, linguagem, versão e ambiente relevantes. SQL precisa indicar o esquema mínimo, as linhas necessárias e o dialeto quando isso mudar a resposta.
- Faça o estudante acompanhar o estado: valores de variáveis, pilha, resultado intermediário, linhas afetadas ou fluxo de controle.
- Para mudanças de variáveis por passo, use `table` somente quando a leitura cruzada entre passos e variáveis for suficiente; coordene-a com `code` quando a linha executada também fizer parte da explicação. Não existe package de rastreamento enquanto não houver uma representação sincronizada que acrescente algo demonstrável à tabela. Use `database_schema` para chaves e referências e `memory_layout` para endereços e segmentos.
- Um fragmento executável não deve depender de arquivo, biblioteca ou tabela que não esteja declarada no card.
- Distratores devem representar erros reais: atribuição em lugar de comparação, índice incorreto, junção inadequada, filtro aplicado no estágio errado, mutação inesperada ou tratamento incompleto de ausência.

## Matemática, estatística, lógica e economia quantitativa

- Introduza cada símbolo, domínio, unidade e convenção antes do primeiro uso exigido.
- Use `formula` para a estrutura simbólica, `plane` para relações espaciais, `matrix` para posição e transformação e `table` para dados observados.
- Em `chart`, declare o tipo de cada eixo, unidades, domínio e escala. Use `lower`/`upper` somente para limites já calculados e nomeie em `uncertainty.label` o que eles significam, como intervalo de confiança de 95%. Use `referenceLines` apenas quando o limiar tiver origem conceitual ou metodológica explícita. Não fabrique precisão, incerteza ou observação empírica; dados de demonstração são identificados como sintéticos.
- Em `plane`, declare domínios e diferencie `points`, `vectors` e `paths`. Vetor tem `from` e `to`; trajetória conserva a ordem; região fechada usa `closed`. Quando houver categorias semanticamente relevantes, declare poucos `groups` e associe cada objeto ao grupo correspondente; não crie uma cor por objeto. Grupo é categoria transversal, não tipo geométrico: ponto continua ponto, vetor continua vetor e região continua região em qualquer grupo. O renderer combina cor e traço para os grupos, conserva formas próprias dos objetos e produz uma legenda agrupada. Não use esse package para campo vetorial denso, contorno, superfície tridimensional ou outro objeto que necessite package disciplinar próprio.
- Em `formula`, descreva a expressão pelos nós semânticos do contrato. Prefira `integral`, `derivative`, `tensor`, `function` e `large_operator` a sequências de caracteres que imitem a notação. Não envie LaTeX, HTML ou MathML; o renderer compõe a forma acadêmica. A prosa que situa ou explica a expressão fica em `prompt` ou em um `paragraph` separado, e a leitura acessível verbaliza limites, variáveis, ordens e índices.
- Use `truth_table` para valorações e conectivos, `relation_map` para uma relação binária e `set_diagram` para regiões de Venn/Euler. Não use `matrix` como tabela com cabeçalhos.
- Um exemplo resolvido explicita as transformações decisivas. A prática seguinte altera dados e foco, não apenas a aparência.
- Arredondamento, precisão, intervalo, hipótese e unidade fazem parte do enunciado quando influenciam a resposta.
- Em estatística, diferencie descrição, estimação e inferência. Não transforme correlação em causalidade.
- Em lógica, declare linguagem, interpretação e regra de inferência empregadas.

## Física, química, biologia e engenharias

- Informe unidades, condições, escala e aproximações. Valores sem unidade só são aceitos quando a grandeza é adimensional e isso está claro.
- Em química, use `reaction` quando os lados de reagentes/produtos, coeficientes, estados e seta fizerem parte da operação. Use `formula` com `notation: chemistry` para outra relação simbólica admitida pela árvore do contrato. Não envie LaTeX, HTML ou MathML como conteúdo.
- Balanceamento, estequiometria e conversões precisam mostrar a grandeza conservada.
- Em física e engenharia, diferencie modelo, medida e condição de contorno.
- Em biologia, explicite nível de organização e evite atribuir intenção a processos naturais quando a explicação é mecanística.
- Procedimentos de segurança, limites normativos e riscos não podem ser omitidos para simplificar uma prática.

## Redes, infraestrutura e segurança

- Apresente a função observável antes da abstração: por exemplo, mostre a associação entre um nome e um endereço antes de introduzir hierarquia, registros distribuídos e resolução de nomes. Defina cada termo na primeira ocorrência e contraste serviços próximos somente depois que ambos tiverem função clara.
- Declare topologia, endereçamento, estado inicial, equipamento ou serviço e versão quando necessários.
- Use `software_system_context` para a fronteira externa de um sistema de software, `software_container` para unidades executáveis e armazenamentos dentro dessa fronteira e `system_internal_block` para partes, portas e conectores de engenharia de sistemas. Use `network_topology` para equipamentos, segmentos e enlaces, `graph` somente para topologia matemática abstrata, `packet_layout` para campos de protocolo, `state_machine` para comportamento dependente do estado, `flow` para decisão procedural, `table` para configuração e `code` para comandos.
- Em `flow`, declare a lógica, não a geometria: terminais são `start`/`end`, entrada ou saída usa `input`/`output`, transformação usa `process` e decisões usam as estruturas condicionais com ramos nomeados. O renderer deriva os símbolos e conectores convencionais do fluxograma.
- Diferencie observação, diagnóstico e ação. Uma evidência isolada não prova uma causa sem as condições correspondentes.
- Não apresente credenciais reais, dados pessoais, endereços internos nem comandos destrutivos sem ambiente seguro e finalidade didática explícita.
- Distratores podem representar camada errada, direção invertida, máscara incompatível, porta inadequada ou interpretação incorreta de log.

## Direito, administração, contabilidade e políticas públicas

- Declare jurisdição, data de vigência e fonte normativa quando elas afetarem a resposta.
- Separe texto normativo, interpretação, procedimento e exemplo. Não apresente uma conclusão controvertida como regra única.
- Use casos com fatos suficientes, sem esconder a condição que decide a aplicação da norma.
- Em contabilidade, indique regime, período, natureza da conta e unidade monetária.
- Em administração, diferencie conceito, instrumento e contexto de uso; evite listas sem decisão observável.
- Conteúdo sujeito a alteração recebe fonte versionada e data de acesso no registro de autoria.

## Idiomas, linguística e sistemas de escrita

- Preserve Unicode e a direção de escrita. Não translitere quando o objetivo é reconhecer ou produzir o sistema original.
- Introduza forma, leitura, significado, registro e contexto de uso conforme a necessidade da etapa.
- Tradução e glosa ajudam no início, mas não substituem o contato com a forma original.
- Em fonética, morfologia, sintaxe, semântica e pragmática, declare a convenção analítica adotada.
- Um exercício de interpretação contém no próprio card a frase, o trecho ou o diálogo necessário.
- Variação regional, histórica e social não deve ser tratada automaticamente como erro.

## Educação, ciências humanas e áreas interpretativas

- Diferencie afirmação do autor, evidência, interpretação e aplicação.
- Apresente conceitos no contexto intelectual necessário, sem transformar escolas teóricas em caricaturas.
- Uma prática pode pedir discriminação entre explicações, análise de caso ou relação entre argumento e evidência, sempre por uma decisão verificável.
- Quando houver mais de uma leitura defensável, formule critérios e não invente uma única resposta correta.

## Revisão do recorte

Antes de aprovar, verifique:

1. se o estudante recebeu a base necessária para a operação;
2. se símbolos, dados, fontes e condições estão no próprio card quando forem particulares do caso;
3. se a representação preserva a estrutura da área;
4. se resposta e feedback podem ser verificados;
5. se a segunda prática altera uma dimensão didaticamente relevante;
6. se não há simplificação que produza erro técnico, normativo ou conceitual;
7. se o conteúdo funciona no celular, por teclado e com tecnologia assistiva.

---

## docs/recursos-de-card.md

# Packages de card

No AraLearn, um **package de card** é um módulo que representa um objeto de conhecimento ou uma forma de resposta cuja estrutura possui significado pedagógico. Ele reúne contrato, validação, renderização, acessibilidade, edição e avaliação. O kernel conhece apenas como packages ocupam um card; não conhece a estrutura interna de grafo, matriz, fórmula ou processo.

Essa separação resolve dois problemas:

- um catálogo crescente não obriga a refatorar o leitor e a persistência;
- uma representação especializada pode ser corrigida e testada sem criar exceções espalhadas pelo aplicativo.

## 1. Quando um package é justificável

Uma caixa visual não se torna um resource apenas por ter estilo próprio. O package é justificável quando texto, tabela genérica ou outro package existente perderia uma relação relevante, uma notação convencional ou uma operação cognitiva.

### Critério de decisão

Antes de criar um package, responda:

1. qual objeto ou relação precisa ser percebido;
2. qual gesto o estudante deverá executar;
3. qual convenção é usada na área acadêmica;
4. por que uma representação existente não preserva essa intenção;
5. como a forma continua legível, acessível e editável no celular;
6. quais situações tornam o package inadequado.

`matrix` é distinto de `table` porque posição algébrica, delimitadores e operações matriciais têm significado. `call-stack` é distinto de tabela quando precisa mostrar topo, ordem de quadros, ativação e retorno. Se um suposto “rastreamento de algoritmo” apenas listar linhas e valores, `table` é suficiente; a especialização só se sustenta quando o estado do algoritmo, sua transição e seus elementos ativos são materializados de modo que a grade genérica não expressa.

Representações múltiplas podem favorecer compreensão quando suas funções são coordenadas, mas aumentam carga quando apenas repetem ou decoram a mesma informação. Esse princípio é discutido no modelo DeFT de [Ainsworth (2006)](https://github.com/fabio-ara/AraLearn/blob/main/docs/referencias.md#ref-ainsworth2006deft).

## 2. Kernel e package

O kernel em `src/resources/kernel/` oferece:

- envelope e slots de card;
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
- `practiceValueLabel`: projeção textual opcional para apresentar ao estudante um valor canônico de prática sem alterar o dado persistido;
- `evaluate`: quando o package é uma resposta;
- `hydrate`: somente quando a interação exige comportamento posterior.

O registro rejeita packages que não implementam essas obrigações. Um package de conteúdo precisa declarar `exposition`; um package de resposta precisa avaliar sua resposta. Edição textual e seleção por assistência são obrigatórias, enquanto edição manual da estrutura permanece desabilitada.

## 3. Catálogo como vocabulário controlado

O catálogo não é uma lista solta de nomes. Ele descreve packages com facetas controladas:

- domínios e objetos de conhecimento;
- operações cognitivas;
- convenções acadêmicas;
- modalidades de prática;
- tecnologias de renderização;
- adequações e contraindicações;
- acessibilidade e limitações;
- slots e compatibilidades de resposta.

Essa organização combina três necessidades. O modelo precisa recuperar candidatos por intenção; a manutenção precisa acrescentar termos sem alterar um algoritmo gigante; a curadoria precisa confrontar por que um candidato foi escolhido.

`consultarBibliotecaDeResources` expõe o protocolo `aralearn.resource-library.v1` de maneira progressiva:

1. `explore` mostra famílias e facetas;
2. `search` ranqueia candidatos;
3. `inspect` compara até oito perfis;
4. `contracts` entrega até quatro contratos exatos;
5. `validate_card` verifica estrutura e composição;
6. `audit_representation` examina adequação e legibilidade;
7. `preview_card` informa se o runtime pode abrir a composição.

Não se envia todo o catálogo nem todos os schemas ao modelo. A autoria planeja primeiro, busca depois e carrega apenas a lista curta. Assim, ampliar a biblioteca altera dados catalográficos e packages, não a interface da ferramenta.

## 4. Seleção e cobertura

O catálogo devolve um estado de cobertura:

- `canonical`: candidato específico para as facetas solicitadas;
- `versatile`: candidato geral que preserva a operação;
- `substitute`: aproximação possível com limitação declarada.

Esses termos descrevem o ajuste calculado, não proclamam que uma representação seja universal na academia. O agente deve confrontar convenções, exemplo e contraindicações depois da busca.

Um resultado `substitute` não interrompe a construção. O chat informa brevemente a aproximação usada e sua perda. Essa política permite produzir em áreas ainda não completamente cobertas e transforma a observação do usuário em insumo para expansão futura do catálogo.

## 5. Composição do card

Um card possui:

- zero ou mais instâncias `content`;
- no máximo uma instância `response`;
- zero ou mais instâncias `feedback`.

Packages complementares podem coexistir quando cada um desempenha uma função diferente, como um parágrafo que situa o fenômeno, uma fórmula que o formaliza e um gráfico que mostra o comportamento. A composição é inadequada quando duplica o estímulo ou obriga o estudante a reconciliar representações sem finalidade.

A prática acrescenta uma resposta compatível com o conteúdo. `choice` apresenta alternativas próprias. `gap` e `ordering` atuam nos campos que os packages de conteúdo declaram como alvos: não duplicam o texto numa lista ou num painel de resposta. Uma correspondência simples é expressa por lacunas independentes nos campos reais de um `paragraph` ou de uma `table`, sem um package paralelo de encaixe.

## 6. Lacunas, digitação e ordenação internas

Uma lacuna não é um marcador embutido no enunciado. Ela aponta para:

```text
targetInstanceId + targetPath
```

`targetInstanceId` identifica a instância; `targetPath` identifica o campo declarado por `practiceTargets`. Em campos textuais comuns, o valor é substituído pelo marcador interativo. Uma referência estrutural só pode ser alvo quando o package declara `preserveReference: true`: nesse caso, o marcador fica associado ao caminho sem sobrescrever o identificador usado para resolver a estrutura. Quando o valor canônico não é o melhor rótulo para leitura, como um id de estado, `practiceValueLabel` projeta a forma apresentada nas alternativas e no controle.

### Independência entre lacunas

Cada lacuna possui índice e estado próprios. Suas alternativas pertencem apenas àquela lacuna e aparecem quando ela recebe foco. Tocar numa lacuna preenchida novamente a esvazia sem alterar as demais. Digitação segue a mesma identidade, mas usa entrada textual e normalização declarada.

Identidade não é deduzida pelo valor da resposta. Duas transições que apontam para o mesmo estado, por exemplo, continuam sendo lacunas distintas porque usam caminhos e índices distintos; preencher ou abrir as opções de uma não altera a outra. Reutilizar o mesmo caminho ou chave para várias lacunas produziria seleção simultânea, portanto o kernel e os testes verificam unicidade e materialização de cada alvo. O preenchimento real também é medido no navegador: o controle precisa caber na reserva calculada antes da interação, sem ser recortado nem redimensionar o resource depois de uma resposta.

### Ordenação situada

Uma ordenação aponta para pelo menos dois trechos já existentes em campos de leitura textual de `paragraph` ou `table`. Cada alvo declara instância, caminho e expressão; a lista de alvos segue a ordem correta de leitura. Durante a prática, as expressões são permutadas entre esses mesmos pontos. Cada uma traz botões de seta, apenas por ícone, para mover uma posição à esquerda ou à direita.

O response não repete os itens numa lista própria. Ele apenas coordena o estado da permutação e o feedback. Alvos em parágrafos e células diferentes podem participar da mesma sequência, desde que a ordem de leitura seja inequívoca e os textos permaneçam distintos. Diagramas, fluxos verticais e outras representações espaciais não recebem essa modalidade por conveniência.

Em `paragraph`, o alvo precisa ser texto plano visível, fora de ênfase, código, link ou outra marcação. A ordenação não corta sintaxe Markdown nem a apresenta como se fosse conteúdo. Ocorrências repetidas ou sobrepostas são recusadas em vez de receber uma posição inferida.

## 7. Edição manual e assistência contextual

O autor edita os textos visíveis no próprio resource, não JSON estrutural nem uma tela paralela de campos. `editableTargets()` delimita os caminhos permitidos; o renderer associa esses caminhos aos rótulos já apresentados e habilita apenas contorno, cursor de texto e caret. Entrar no modo de edição não muda a geometria do card. Coordenadas, ids relacionais, tipos de nó, índices e textos apenas acessíveis continuam fora da superfície editável.

A seleção visual pode abranger uma instância, um card ou um recorte hierárquico autorizado. A assistência por API recebe:

- objetivo e conversa curta;
- contexto didático de leitura;
- packages selecionados e seus contratos exatos;
- lista explícita de caminhos textuais graváveis;
- versão corrente para desfazer, refazer e restaurar.

Um modelo leve pode propor `edit_text` somente nos alvos autorizados. Uma recomposição estrutural exige o card inteiro e nova validação. O retorno nunca ganha autoridade apenas porque contém JSON bem-formado.

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

`aralearn.resource.terminal_session` representa uma sequência temporal de interações textuais entre pessoa e sistema. Ele é apropriado para acompanhar entrada, resposta e efeito em shell, PowerShell, Git, SQL ou outra interface textual quando a ordem e o estado observável fazem parte do objeto de estudo.

O contrato declara uma orientação pedagógica em `prompt`, o `environment`, um `initialContext` opcional e uma lista ordenada de `interactions`. Cada interação possui `input` e pode registrar separadamente o prompt visual, `stdout`, `stderr`, `exitCode` e um efeito curto. Espaços e quebras de linha são preservados num conteúdo declarativo e determinístico. Em `stdout` e `stderr`, a string vazia significa que o stream foi observado sem conteúdo; a omissão significa que ele não foi registrado ou não é pertinente.

As operações previstas são rastrear interação, interpretar saída, identificar erro, relacionar ação e consequência, comparar estado, diagnosticar situação, prever resultado e reconhecer comando.

Esse objeto não é `code`, que preserva código-fonte ou configuração estática; não é `table`, que compara registros por atributos; e não é `paragraph`, que expõe uma explicação em prosa. O package apresenta um registro fornecido pela autoria: não executa nem interpreta comandos, não abre shell ou banco e não acessa rede ou ambiente externo. O mesmo texto pode produzir outro resultado em outro estado, sistema ou momento.

Quando houver prática, somente `interactions[i].input` pode receber lacuna de escolha com alternativas exatas e inequívocas. O package não avalia digitação, expressões regulares, equivalência semântica nem resposta livre por modelo. Sua lista cronológica, os rótulos de streams e o texto monoespaçado selecionável fornecem uma ordem de leitura acessível; no celular, conteúdo largo usa rolagem local sem alterar espaços ou quebrar o fluxo do card.

Observar e interpretar uma sessão pode preparar reconhecimento, previsão ou diagnóstico, mas não substitui operar um ambiente real quando executar a ação é o objetivo de aprendizagem. Nessa situação, a autoria precisa oferecer prática externa adequada ou declarar explicitamente a limitação.

## 10. Leitura sem gramática adicional

O estudante não deve aprender uma legenda inventada pelo AraLearn para só então compreender o objeto. O package segue a notação reconhecida na área e o card introduz termos ou convenções que façam parte do próprio conteúdo. Uma breve instrução de leitura é apropriada quando a disciplina realmente ensina aquela representação; vocabulário de implementação ou instruções óbvias de rolagem não são conteúdo didático.

Teoria e prática admitem densidades diferentes. Um card de teoria apresenta uma transformação conceitual delimitada, sem condensar vários pressupostos. Um card de prática pode conter contexto residente mais rico porque o estudante precisa operar sobre ele; ainda assim, rótulos e relações devem permanecer legíveis.

## 11. Mobile, orientação e escalabilidade

Os dez packages que usam a camada compartilhada `system-diagrams` apresentam um único diagrama dentro de um quadro estável. A orientação continua favorecendo a leitura vertical, mas o estudante pode ampliar e mover o próprio desenho no card. Em telas táteis, uma pinça com dois dedos altera a escala em torno do ponto tocado; quando o conteúdo ampliado ultrapassa o quadro, o arraste percorre os dois eixos sem redimensionar o card.

Quando houver prática, o controle real da lacuna permanece no ponto semântico do diagrama. Ele não é duplicado em painel, legenda ou projeção paralela. A mesma ocorrência continua ativa depois do zoom e quando o desenho é levado para tela cheia.

O botão de expansão, apresentado somente por ícone e com nome acessível, move a mesma viewport para um diálogo dedicado. Nesse modo, ícones permitem diminuir, aumentar, ajustar ou recolher o diagrama; pinça e arraste continuam disponíveis. Escala e posição são estado efêmero do renderer: auxiliam a navegação corrente, mas não integram curso, progresso ou sincronização.

A orientação continua decorrendo da estrutura. Hierarquias e sistemas tendem à progressão de cima para baixo; o diagrama interno de bloco SysML usa agora esse fluxo em bloco. Relações cuja leitura é genuinamente lateral podem conservar elementos no mesmo nível, pois o zoom não depende de forçar toda topologia para uma única coluna.

Essa política inicial abrange `bpmn_process`, `database_schema`, `entity_relationship`, `network_topology`, `relation_map`, `software_container`, `software_system_context`, `state_machine`, `system_internal_block` e `tree`. `flow` e `graph` ainda usam seus navegadores próprios e não devem ser descritos como se já compartilhassem essa camada. A galeria continua incluindo larguras móveis, temas e exemplos não triviais para expor cruzamentos, overflow, legendas, múltiplas lacunas e textos longos.

## 12. Acessibilidade

Todo package fornece `accessibleText()` e estrutura navegável quando há controles. Cor não pode ser o único código. Foco, seleção, resposta e erro precisam de contraste e forma. Alvos de toque seguem os critérios adotados pelo sistema visual.

Um equivalente textual não torna automaticamente um diagrama compreensível a todas as pessoas; ele oferece acesso ao conteúdo e base para tecnologia assistiva. Packages complexos precisam de ordem de leitura, nomes de relações e feedback contextualizados.

## 13. Validação e auditoria

`validate_card` verifica:

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
7. teste claro/escuro, 360/390/412 px, textos longos e dados complexos;
8. regenere catálogo e packages de autoria;
9. execute auditoria de resíduos para impedir renderer ou alias antigo;
10. atualize documentação e evidência de conformidade.

Adicionar um package não muda o kernel. Alterar o envelope, os slots ou a semântica comum é mudança de kernel e exige revisão mais ampla.
