# Padrões de autoria por área

O plano sempre parte de uma pessoa sem conhecimentos prévios, salvo quando o pedido ou os materiais comprovam um pré-requisito. A área muda a forma de representar, praticar e verificar o conteúdo; não muda a exigência de explicar símbolos, oferecer base causal e manter cada prática autossuficiente. Fidelidade terminológica à fonte não autoriza reproduzir sua densidade: apresente primeiro a situação em linguagem comum, use exemplo concreto quando útil e introduza depois os termos técnicos e suas relações, distribuindo conceitos novos independentes entre cards ou microssequências.

## Escolha da representação

Escolha o recurso pela operação que o estudante precisa realizar:

| Operação | Recursos mais prováveis |
|---|---|
| compreender uma definição ou distinção | `paragraph`, `choice` ou combinação justificada de packages |
| acompanhar execução, sintaxe ou comando | `code`, `algorithm_trace`, `flow` |
| comparar casos, registros ou valores | `table`, `chart`, `choice` |
| reconhecer hierarquia ou classificação | `tree`, `matching` |
| analisar conexões, dependências ou rotas | `graph`, `network_topology`, `flow` |
| distinguir limites, subsistemas e integrações | `system_map`, `graph`, `flow` |
| raciocinar com coordenadas, vetores ou distância | `plane`, `matrix`, `formula` |
| ler notação matemática | `formula`, `matrix` ou combinação justificada de packages |
| ler ou balancear uma equação de reação | `reaction`, `formula` ou combinação justificada de packages |
| avaliar proposições ou conectivos | `truth_table`, `formula` |
| analisar relações entre conjuntos | `relation_map`, `set_diagram` |
| interpretar cabeçalhos e offsets | `packet_layout`, `memory_layout` |
| inspecionar chaves e referências | `database_schema`, `table` |
| acompanhar eventos dependentes de estado | `state_machine` |

O recurso visual permanece no próprio card de prática. Não descreva um diagrama ausente nem peça que a pessoa se lembre dos valores apresentados anteriormente.

Registre o objetivo e a evidência em `microsequence.goal` e
`microsequence.checks`, delimite o recorte em `microsequence.covers` e
materialize a escolha diretamente em instâncias de package nos slots do card. A tabela acima orienta a
análise, mas não escolhe o recurso de modo automático e não autoriza metadados
adicionais fora do contrato.

## Programação, bancos de dados e automação

- Apresente a semântica da operação antes de cobrar a sintaxe.
- Use `code` com lacunas quando um token, uma expressão ou uma linha completa for a decisão principal.
- Use alternativas quando o objetivo for prever saída, encontrar defeito, escolher consulta ou distinguir efeitos colaterais.
- Preserve indentação, linguagem, versão e ambiente relevantes. SQL precisa indicar o esquema mínimo, as linhas necessárias e o dialeto quando isso mudar a resposta.
- Faça o estudante acompanhar o estado: valores de variáveis, pilha, resultado intermediário, linhas afetadas ou fluxo de controle.
- Use `algorithm_trace` para mudanças de variáveis por passo,
  `database_schema` para chaves e referências e `memory_layout` para
  endereços e segmentos. Uma tabela genérica não substitui essas convenções.
- Um fragmento executável não deve depender de arquivo, biblioteca ou tabela que não esteja declarada no card.
- Distratores devem representar erros reais: atribuição em lugar de comparação, índice incorreto, junção inadequada, filtro aplicado no estágio errado, mutação inesperada ou tratamento incompleto de ausência.

## Matemática, estatística, lógica e economia quantitativa

- Introduza cada símbolo, domínio, unidade e convenção antes do primeiro uso exigido.
- Use `formula` para a estrutura simbólica, `plane` para relações espaciais, `matrix` para posição e transformação e `table` para dados observados.
- Em `chart`, declare o tipo de cada eixo, unidades, domínio e escala. Use
  `lower`/`upper` somente para limites já calculados e nomeie em
  `uncertainty.label` o que eles significam, como intervalo de confiança de
  95%. Use `referenceLines` apenas quando o limiar tiver origem conceitual ou
  metodológica explícita. Não fabrique precisão, incerteza ou observação
  empírica; dados de demonstração são identificados como sintéticos.
- Em `plane`, declare domínios e diferencie `points`, `vectors` e `paths`.
  Vetor tem `from` e `to`; trajetória conserva a ordem; região fechada usa
  `closed`. Quando houver categorias semanticamente relevantes, declare poucos
  `groups` e associe cada objeto ao grupo correspondente; não crie uma cor por
  objeto. Grupo é categoria transversal, não tipo geométrico: ponto continua
  ponto, vetor continua vetor e região continua região em qualquer grupo. O
  renderer combina cor e traço para os grupos, conserva formas próprias dos
  objetos e produz uma legenda agrupada.
  Não use esse package para campo vetorial denso, contorno, superfície
  tridimensional ou outro objeto que necessite package disciplinar próprio.
- Em `formula`, descreva a expressão pelos nós semânticos do contrato. Prefira
  `integral`, `derivative`, `tensor`, `function` e `large_operator` a sequências
  de caracteres que imitem a notação. Não envie LaTeX, HTML ou MathML; o
  renderer compõe a forma acadêmica. A prosa que situa ou explica a expressão
  fica em `prompt` ou em um `paragraph` separado, e a leitura acessível
  verbaliza limites, variáveis, ordens e índices.
- Use `truth_table` para valorações e conectivos, `relation_map` para uma
  relação binária e `set_diagram` para regiões de Venn/Euler. Não use
  `matrix` como tabela com cabeçalhos.
- Um exemplo resolvido explicita as transformações decisivas. A prática seguinte altera dados e foco, não apenas a aparência.
- Arredondamento, precisão, intervalo, hipótese e unidade fazem parte do enunciado quando influenciam a resposta.
- Em estatística, diferencie descrição, estimação e inferência. Não transforme correlação em causalidade.
- Em lógica, declare linguagem, interpretação e regra de inferência empregadas.

## Física, química, biologia e engenharias

- Informe unidades, condições, escala e aproximações. Valores sem unidade só são aceitos quando a grandeza é adimensional e isso está claro.
- Em química, use `reaction` quando os lados de reagentes/produtos,
  coeficientes, estados e seta fizerem parte da operação. Use `formula` com
  `notation: chemistry` para outra relação simbólica admitida pela árvore do
  contrato. Não envie LaTeX, HTML ou MathML como conteúdo.
- Balanceamento, estequiometria e conversões precisam mostrar a grandeza conservada.
- Em física e engenharia, diferencie modelo, medida e condição de contorno.
- Em biologia, explicite nível de organização e evite atribuir intenção a processos naturais quando a explicação é mecanística.
- Procedimentos de segurança, limites normativos e riscos não podem ser omitidos para simplificar uma prática.

## Redes, infraestrutura e segurança

- Apresente a função observável antes da abstração: por exemplo, mostre a associação entre um nome e um endereço antes de introduzir hierarquia, registros distribuídos e resolução de nomes. Defina cada termo na primeira ocorrência e contraste serviços próximos somente depois que ambos tiverem função clara.
- Declare topologia, endereçamento, estado inicial, equipamento ou serviço e versão quando necessários.
- Use `system_map` quando limites e pertencimento a subsistemas importarem,
  `network_topology` para equipamentos, segmentos e enlaces, `graph` para
  topologia abstrata, `packet_layout` para campos de protocolo,
  `state_machine` para comportamento dependente do estado, `flow` para
  decisão procedural, `table` para configuração e `code` para comandos.
- Em `flow`, declare a lógica, não a geometria: terminais são `start`/`end`,
  entrada ou saída usa `input`/`output`, transformação usa `process` e decisões
  usam as estruturas condicionais com ramos nomeados. O renderer deriva os
  símbolos e conectores convencionais do fluxograma.
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
