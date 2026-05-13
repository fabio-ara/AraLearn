# Planejamento de Matemática para Informática

Este documento registra a revisão didática do seed do curso **Matemática para Informática**.

## Propósito

O curso prepara o aluno para resolver os procedimentos centrais do conteúdo, sem pressupor domínio prévio de lógica ou álgebra linear.

O escopo fica limitado a:

- lógica proposicional: proposições, conectivos, tabelas-verdade, equivalências, De Morgan, implicação, contrapositiva, XOR, bicondicional e detecção de equivalência falsa;
- vetores e matrizes: vetor como lista e seta, soma, multiplicação por escalar, módulo, distância, produto escalar, ortogonalidade, cosseno, matriz como arranjo, transformação linear pela base, composição e inversa simples.

Recorte operacional do app:

- não incluir Venn-Euler no seed deste curso, porque o app ainda não oferece contêiner próprio para esse tipo de leitura/prática;
- feedback final de card não deve funcionar como exercício nem como autocomplete da resposta; ele deve explicar a regra, justificar o critério ou comentar o procedimento usado.

## Critérios de Autoria

Cada microssequência deve seguir uma progressão enxuta:

1. conceito ou regra;
2. exemplo resolvido;
3. prática guiada com lacuna;
4. erro comum, revisão ou contraste com outro procedimento.

Cada exercício deve ser autossuficiente. O enunciado, os vetores, as matrizes, a fórmula ou a regra necessária devem aparecer no próprio card. O aluno não deve precisar voltar para recuperar valores numéricos.

Toda prática deve ser antecedida, na mesma microssequência, por microteoria ou exemplo resolvido que ensine a regra usada. Um exercício aparentemente dedutível pelo enunciado ainda precisa ter a regra ensinada antes, porque o objetivo do curso é formar o procedimento do aluno, não apenas testar interpretação.

Símbolos, conectivos, fórmulas e nomes breves devem aparecer destacados no corpo do card com acentos graves, como `p`, `q`, `¬`, `∧`, `∨`, `→`, `↔`, `XOR`, `2^n`, `v1` e `v2`. O título do card já aparece na interface e não deve ser repetido como título interno de tabela, linha solta ou primeira frase.

Quando a regra for abstrata, combinatória ou pouco intuitiva, a explicação deve abrir com casos pequenos concretos antes da fórmula geral. Em lógica, isso inclui quadros como `n = 1`, `n = 2`, `n = 3`; em vetores e matrizes, isso inclui exemplos numéricos breves antes de generalizações.

Cards que definem um conceito não devem parar na frase declarativa. Eles precisam mostrar pelo menos um exemplo mínimo, um contraste ou um quadro breve que deixe visível como a definição funciona.

Quando o objetivo for provar equivalência ou reescrever fórmula, a explicação deve mostrar a ponte do raciocínio: linha crítica, colunas intermediárias, ou uma linha resolvida passo a passo. Não basta afirmar que “a tabela coincide”.

Prática mecânica é mantida quando consolida procedimento de prova, mas ela deve variar entre:

- completar linhas de tabela;
- escolher uma equivalência correta;
- localizar um contraexemplo;
- completar uma entrada de matriz;
- distinguir distância, módulo, produto escalar e cosseno.

Em cálculos de vetores, o card deve mostrar o procedimento de forma legível e autossuficiente. Tabelas só devem ser usadas quando a própria atividade exigir comparação tabular. Para soma, módulo, distância, produto escalar, cosseno e transformação pela base, a forma preferida é uma expressão linha a linha.

Em soma geométrica no plano, a microssequência deve separar pelo menos dois momentos: entender a cópia deslocada do segundo vetor e só depois resolver a ponta do vetor soma. O card não pode expor a resposta final antes da lacuna pedida.

Para módulo, distância, produto escalar e ortogonalidade, a explicação deve começar por um caso 2D visível quando isso for possível. O aluno precisa ver o segmento, o triângulo, o ângulo reto ou o deslocamento antes de generalizar para a fórmula.

Quando surgir notação nova para iniciante, como `||v||` ou `cos θ`, a microssequência deve primeiro traduzir a leitura em linguagem comum e só depois cobrar substituição, cálculo ou interpretação.

Em tabelas de lógica, a preferência é por poucos casos e foco explícito na linha crítica ou nas colunas finais. Se uma linha ou coluna merecer atenção especial, o card deve usar `table.focus` em vez de despejar uma tabela larga sem guia visual.

## Progressão

### Lógica Proposicional

A sequência começa com valor lógico e conectivos simples, porque tabelas compostas dependem dessa leitura. Depois entra implicação, bicondicional e XOR, que aparecem nos exercícios. A terceira etapa trabalha equivalências e fecha com um enunciado falso, para treinar a postura esperada em prova: uma linha divergente basta para negar uma equivalência.

### Vetores e Matrizes

A sequência começa com vetor como lista e seta. Em seguida vem soma e escalar, porque esses cálculos são pré-requisitos para módulo, distância, produto escalar e transformações. O módulo de vetores, distância, produto escalar e cosseno usam os mesmos vetores dos exercícios para criar continuidade sem obrigar memorização. Matrizes aparecem primeiro como arranjo e soma, depois como transformação linear, composição e inversa.

## Revisão de Qualidade

Foram aplicados estes ajustes:

- práticas com referência vaga a "material" passaram a repetir os dados numéricos;
- tabelas de lógica passaram a incluir colunas intermediárias necessárias;
- a soma de matrizes passou a mostrar a resolução em cadeia no mesmo card;
- a notação textual de matriz que podia ser confundida com lacuna foi removida;
- foram adicionadas práticas de distributividade, contraexemplo e revisão mista de vetores.
- o plano cartesiano de soma passou a mostrar `w` saindo da origem e uma cópia deslocada de `w`, deixando explícito por que a seta desenhada a partir da ponta de `v` termina em outro ponto;
- cálculos de módulo, distância, produto escalar, cosseno e transformação pela base foram reescritos em formato linha a linha, sem tabelas artificiais;
- referências externas como caderno, aula, material e prova foram removidas dos cards quando não eram parte do próprio conteúdo;
- lacunas dentro de trechos marcados com acento grave passaram a preservar a renderização de código inline.
- tabelas sem subtítulo próprio deixaram de repetir internamente o título do card;
- a prática de número de linhas da tabela-verdade passou a ser precedida por microteoria sobre as `2^n` combinações;
- a microteoria sobre `2^n` linhas passou a mostrar um quadro com `n = 1`, `2`, `3` e `4`, para reduzir abstração desnecessária;
- várias definições secas de lógica passaram a incluir exemplos, contrastes e quadros breves para reduzir salto conceitual no começo do curso;
- equivalências como implicação, contrapositiva e distributividade passaram a mostrar linha crítica ou linha resolvida, em vez de só anunciar o resultado;
- símbolos e conectivos nos cards de lógica receberam destaque inline para reduzir ambiguidade de leitura.
- feedbacks de prática deixaram de repetir só a resposta certa e passaram a explicar o critério usado na correção;
- o reforço de prova em lógica ficou limitado a tabela, lacuna e múltipla escolha, sem introduzir Venn-Euler como pseudo-recurso.

## Referências

- MIT Open Learning: prática espaçada e intercalada.
- LibreTexts: equivalências lógicas, vetores, produto escalar, ortogonalidade, transformações lineares e inversa de matriz.
- ter Vrugte et al. (2017): exemplos resolvidos com lacunas progressivas em aprendizagem matemática.
