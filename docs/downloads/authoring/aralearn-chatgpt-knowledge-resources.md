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
- reconstrução de uma ordem pede `aralearn.response.ordering`.
- reconstrução de pares ou classificação pede `aralearn.response.matching`.

Essa orientação não substitui o catálogo. Nunca memorize um schema, invente campos, use coordenadas de tela ou presuma que todos os packages aceitam toda resposta. A combinação é válida somente quando manifest, contrato e validação do package concordam.

## Lacunas, ordenação e encaixe

Uma lacuna declara `targetInstanceId` e `targetPath` para um campo textual real de uma instância em `content`. A resposta precisa ocorrer nesse campo e será substituída pelo controle interativo somente na renderização. A notação de `targetPath` pertence ao contrato recuperado de `aralearn.response.gap`; não codifique lacunas em strings.

Uma ordenação aponta para uma instância de conteúdo que preserve a sequência e declara os identificadores na ordem correta. Os itens visíveis vêm da representação alvo. Não duplique a sequência no enunciado nem use a posição visual como resposta implícita.

Um encaixe declara origens, destinos e pares corretos. Ele pode reconstruir uma bijeção ou classificar várias origens na mesma categoria. A interface usa controles nativos acessíveis; arrastar nunca é obrigatório. Nenhuma modalidade é universal: use somente `responseCompatibility` e `practiceTargets` do contrato exato e confirme a composição com `validate_card`.

## Representações visuais

O JSON descreve significado; o renderer do package decide geometria e dimensionamento. Não tente alinhar pixels na autoria. Rótulos precisam ser curtos o suficiente para leitura móvel, mas não podem trocar nomes reais por códigos opacos que obriguem o estudante a consultar uma legenda distante.

Em `graph`, vértices são entidades estáveis e relações são apresentadas sem sobrepor rótulos às arestas. Use direção somente quando ela mudar a interpretação. Não force um grafo para representar uma simples sequência ou lista.

Em `relation_map`, deixe explícitos domínio, contradomínio e pares ordenados. O renderer apresenta os dois conjuntos e uma seta sem rótulo para cada par; a notação extensional complementar registra os pares sem disputar espaço com as arestas. Use-o somente quando imagem, preimagem ou cardinalidade fizer parte do raciocínio. Use `table` ou `matching` para uma simples correspondência e `set_diagram` quando interseção, união ou pertencimento simultâneo for o objeto. Nesse package, escolha `venn` quando todas as combinações lógicas precisam permanecer visíveis e `euler` quando a ausência de uma região é parte da topologia observada. Declare conjuntos, símbolos curtos e pertencimento; não declare círculos, coordenadas ou tamanhos. Mais de três conjuntos exigem outra representação, não um diagrama ilegível comprimido.

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
| reconhecer hierarquia ou classificação | `tree`, `matching` |
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

Packages são módulos independentes compatíveis com o kernel. A única ferramenta `consultarBibliotecaDeResources` expõe o contrato `aralearn.resource-library.v1` por descoberta progressiva:

1. `explore` apresenta famílias e facetas controladas;
2. `search` busca pela intenção e classifica `coverage.status` como `canonical`, `versatile` ou `substitute`;
3. `inspect` compara até oito perfis sem carregar schemas;
4. `contracts` entrega no máximo quatro contratos de versões exatas;
5. `validate_card` confere o envelope, referências e compatibilidades;
6. `audit_representation` avalia conteúdo, resposta e feedback;
7. `preview_card` descreve a composição sem tentar reproduzir o renderer.

O catálogo informa finalidade, operações cognitivas, slots, áreas, objetos de conhecimento, convenções acadêmicas, adequações, contraindicações, tecnologias, modalidades de prática, compatibilidades, limitações e acessibilidade. Não há enumeração documental paralela nem consulta que despeje todos os schemas. Acrescentar um package não muda o kernel ou a ferramenta. Famílias e facetas pertencem ao vocabulário controlado do catálogo; finalidade, convenções e limitações pertencem ao próprio package. A versão do catálogo é derivada desse conjunto semântico, portanto muda quando a capacidade ou a política de seleção muda, mesmo que os IDs instalados permaneçam iguais.

O card canônico não usa os antigos campos `resource`, `kind` ou `exercise`. Ele declara `role`, uma lista `content`, no máximo uma instância `response` e uma lista `feedback`. Cada instância possui `{ id, package, version, data }`; o kernel conhece o envelope e cada package conhece seus dados.

Um resultado `substitute` nunca bloqueia: o agente usa o melhor candidato e incorpora brevemente o `chatDisclosure` no feedback do chat. `preview_card` sempre devolve `rendered: false`; é um descritor, não screenshot nem simulação de viewport, Graphviz ou Vega.

Na recomposição assistida, o catálogo oferece composições com uma ou mais instâncias de conteúdo. Packages complementares podem coexistir quando cada um preserva uma parte necessária da intenção, por exemplo uma fórmula e um gráfico estatístico. A prática acrescenta somente uma resposta compatível; feedbacks podem ser compostos quando acrescentam explicação posterior pertinente. A escolha da composição precede o preenchimento dos contratos, para que o modelo leve receba apenas a lista curta e os schemas que realmente usará.

`graph` recebe vértices e arestas sem coordenadas. O package calcula a geometria móvel e mantém os rótulos completos numa lista semântica fora das arestas. `relation_map` recebe domínio, contradomínio e pares ordenados; apresenta cada elemento uma única vez, usa uma seta sem rótulo por par e complementa o desenho com notação extensional, sem cruzar texto. `matrix` representa somente arranjos algébricos, sem herdar a grade de uma tabela de registros.

Na autoria, escolha pelo trabalho cognitivo e não para variar visualmente. Explique referências e termos antes de exigir interpretação. Divida uma ideia quando densidade, número de relações ou carga verbal tornarem o recurso difícil de ler em 360 px.

Uma lacuna declara `targetInstanceId` e `targetPath`; não se codifica resposta em marcador textual. Uma escolha declara IDs corretos, e uma ordenação declara a ordem formal. Um encaixe declara origens, destinos e pares. A compatibilidade depende de `responseCompatibility` e, para lacuna ou digitação, dos `practiceTargets` declarados pelo contrato exato; `validate_card` decide se a composição é válida.

Essa validação é estrutural: verifica envelope, slots, schemas, referências e compatibilidades. `audit_representation` acrescenta três verificações de adequação: `semantic_fit` para saber se o conteúdo materializa a intenção, `response_affordance` para saber se a resposta realmente exercita a operação cognitiva e `feedback_legibility` para saber se a explicação posterior pode ser lida e relacionada à prática. Um card só está pronto para gravação depois das duas etapas.
