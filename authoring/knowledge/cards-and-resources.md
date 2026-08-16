# Cards e packages

O package representa a estrutura sobre a qual o estudante raciocina. Escolha-o
pela operação exigida, não pela aparência, por uma cota de variedade nem pela
facilidade de geração.

Uma representação visual não recebe um card auxiliar para ensinar uma
gramática inventada pela interface. O contexto disciplinar apresenta os
conceitos e convenções necessários em progressão; o package materializa essas
relações de forma canônica e mais direta que prosa, tabela ou outra alternativa
mais simples. Se isso não ocorrer, a seleção ou o package está errado.

O catálogo MCP é a fonte de verdade sobre os packages instalados. Use somente
`consultarBibliotecaDeResources`: `explore` apresenta famílias e facetas;
`search` procura pela intenção e classifica a cobertura; `inspect` compara até
oito perfis; `contracts` carrega exatamente uma versão por chamada.
Compare finalidade, operações, área, objeto, convenções, contraindicações,
modalidades, slots e compatibilidades com o gesto cognitivo planejado; não
escolha apenas pelo nome. O catálogo pode crescer sem alterar estas instruções.

Depois de compor o envelope, chame `validate_card` e então
`audit_representation`. A primeira operação confere estrutura, referências e
compatibilidade; a segunda separa a adequação semântica do conteúdo, a
possibilidade de resposta e a legibilidade do feedback. `preview_card` apenas
descreve a composição e sempre informa `rendered: false`; Graphviz, Vega,
viewport e screenshot pertencem ao renderer real do aplicativo.

`canonical` é o ajuste específico, `versatile` é uma convenção transversal e
`substitute` é uma aproximação. A política efetiva e o ResourceSet determinam
se cada ajuste pode ser usado. Quando houver admissão não canônica, preserve a
limitação e o `chatDisclosure`; quando houver bloqueio, não use alternativa
externa nem finja equivalência.

## Composição do card

O card usa apenas o envelope fechado de `aralearn.library.v1`:

- `content` contém zero ou mais packages de representação;
- `response` contém um único package de resposta em prática e é `null` em
  teoria;
- `feedback` contém packages mostrados depois da resposta;
- cada instância tem somente `id`, `package`, `version` e `data`.

Não existem `card.resource`, `card.kind`, `card.exercise`, `blocks`, `after`,
`afterBlocks`, marcador textual de lacuna ou outro contrato paralelo. Não
converta exemplos desses formatos. Se dados recebidos os utilizarem, relate que
eles precisam ser reconstruídos no envelope corrente.

Em `aralearn.response.choice`, `data.question` é o único enunciado da escolha.
Não repita essa pergunta em `paragraph`. Use `content: []` quando não houver
cenário, dado ou representação adicional.

## Seleção pedagógica

Use o manifest recuperado por MCP para comparar a operação cognitiva com a
finalidade do package. Em termos gerais:

- texto explicativo pede `aralearn.resource.paragraph`;
- código, tabela, fórmula, reação, gráfico quantitativo, fluxo,
  árvore, grafo, matriz, plano, diagramas de software, mapa de relações, diagrama de
  conjuntos, tabela-verdade, cabeçalho de pacote,
  esquema relacional, máquina de estados, topologia de rede, mapa de memória,
  glosa interlinear e texto anotado pedem seus packages estruturais
  específicos;
- discriminação por alternativas pede `aralearn.response.choice`;
- recuperação dentro de um campo textual visível pede
  `aralearn.response.gap`;
- reconstrução de uma ordem entre ao menos duas expressões já visíveis em
  `paragraph` ou células de `table` pede `aralearn.response.ordering`;
- reconstrução de pares ou classificação usa `gap` sobre os campos
  correspondentes de um `paragraph` ou de uma `table`.

Essa orientação não substitui o catálogo. Nunca memorize um schema, invente
campos, use coordenadas de tela ou presuma que todos os packages aceitam toda
resposta. A combinação é válida somente quando manifest, contrato e validação
do package concordam.

## Lacunas e ordenação

Uma lacuna declara `targetInstanceId` e `targetPath` para um campo textual real
de uma instância em `content`. A resposta precisa ocorrer nesse campo e será
substituída pelo controle interativo somente na renderização. A notação de
`targetPath` pertence ao contrato recuperado de
`aralearn.response.gap`; não codifique lacunas em strings.

Uma ordenação declara ao menos dois alvos com `targetInstanceId`, `targetPath`
e a expressão que já ocorre no campo textual. Os alvos aparecem na ordem
correta de leitura; o estudante move as expressões para esquerda ou direita
pelos ícones no próprio ponto. Quando mais de uma expressão pertence ao mesmo
campo, cada `targetPath` recebe um sufixo de ocorrência distinto. Use somente
texto plano visível, fora de marcação Markdown. Não duplique a sequência no
response nem aplique ordering a diagramas, fluxos ou outra leitura espacial.
Use somente `responseCompatibility` e
`practiceTargets` do contrato exato e confirme a composição com
`validate_card`.

Uma correspondência simples não cria outro tipo de resposta. Represente os
pares no resource textual adequado e aplique uma lacuna independente ao campo
a completar; cada lacuna conserva resposta, opções e estado próprios.

## Representações visuais

O JSON descreve significado; o renderer do package decide geometria e
dimensionamento. Não tente alinhar pixels na autoria. Rótulos precisam ser
curtos o suficiente para leitura móvel, mas não podem trocar nomes reais por
códigos opacos que obriguem o estudante a consultar uma legenda distante.

Em `graph`, vértices são entidades estáveis e relações são apresentadas sem
sobrepor rótulos às arestas. Use direção somente quando ela mudar a
interpretação. Não force um grafo para representar uma simples sequência ou
lista.

Em `relation_map`, deixe explícitos domínio, contradomínio e pares ordenados.
O renderer apresenta os dois conjuntos e uma seta sem rótulo para cada par; a
notação extensional complementar registra os pares sem disputar espaço com as
arestas. Use-o somente quando imagem, preimagem ou cardinalidade fizer parte
do raciocínio. Use `table` com lacunas para uma simples correspondência e
`set_diagram` quando interseção, união ou pertencimento simultâneo for o objeto.
Nesse package, escolha `venn` quando todas as combinações lógicas precisam
permanecer visíveis e `euler` quando a ausência de uma região é parte da
topologia observada. Declare conjuntos, símbolos curtos e pertencimento; não
declare círculos, coordenadas ou tamanhos. Mais de três conjuntos exigem outra
representação, não um diagrama ilegível comprimido.

`matrix` é reservado a arranjos algébricos de escalares ou expressões, sem
cabeçalhos de atributos nem grade de registros. Para dados tabulares use
`table`; para esquema relacional use `database_schema`. Mudanças de variáveis
por passo permanecem em `table` enquanto não houver uma representação
sincronizada de execução que preserve estrutura adicional.

Em `flow`, cada decisão explicita condição e consequência. Em `tree`, a
ligação preserva pai e filho. Nos demais packages, unidades, eixos, ordem,
notação, grupos e direção necessários precisam estar declarados nos campos
semânticos do contrato.

`flow` não é uma árvore indentada. Sua raiz lógica é uma sequência e o
renderer materializa terminais arredondados, processos retangulares,
entrada/saída em paralelogramos, decisões em losangos, conectores orientados e
junções. A autoria nunca declara coordenadas ou arestas.

`formula` recebe uma AST semântica, não uma string de notação. Integrais,
derivadas, tensores, funções, somatórios, produtos, limites, frações, raízes,
índices e cercas usam os respectivos nós do contrato. Use `prompt` ou
`paragraph` para a explicação em prosa; tokens textuais dentro da AST servem
somente a conectores matemáticos curtos. A leitura acessível acompanha a mesma
estrutura e não pode se limitar a repetir símbolos.

## Validação

Antes de gravar:

1. valide o envelope fechado do card;
2. valide cada instância contra o schema de seu package e versão;
3. valide as relações entre `response` e `content`;
4. confira que a composição materializa `goal`, `covers` e `checks`;
5. leia o card no tamanho móvel e confirme legibilidade, autonomia e ausência
   de resposta exposta.

Um erro de contrato deve ser corrigido explicitamente. Não existe renderer
antigo, projeção de card, compatibilidade ou fallback de formato.
