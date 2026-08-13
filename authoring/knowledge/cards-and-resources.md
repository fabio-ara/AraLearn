# Cards e packages

O package representa a estrutura sobre a qual o estudante raciocina. Escolha-o
pela operação exigida, não pela aparência, por uma cota de variedade nem pela
facilidade de geração.

O catálogo MCP é a fonte de verdade sobre os packages instalados. Consulte-o
antes de escolher. Ele informa finalidade, operações cognitivas, áreas,
objetos de conhecimento, convenções acadêmicas, tecnologias, situações
apropriadas e contraindicadas, modalidades de prática, slots e
compatibilidades sem enviar todos os schemas. Compare esses campos com o gesto
cognitivo planejado; não escolha apenas pelo nome. Depois do planejamento,
consulte somente o contrato da versão exata de cada package escolhido. O
catálogo pode crescer sem alterar estas instruções.

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
- código, tabela, fórmula, reação, gráfico quantitativo, sequência, fluxo,
  árvore, grafo, matriz, plano, mapa de sistema, mapa de relações, diagrama de
  conjuntos, tabela-verdade, cabeçalho de pacote, rastreamento de algoritmo,
  esquema relacional, máquina de estados, topologia de rede, mapa de memória,
  exemplo linguístico e texto anotado pedem seus packages estruturais
  específicos;
- discriminação por alternativas pede `aralearn.response.choice`;
- recuperação dentro de um campo textual visível pede
  `aralearn.response.gap`;
- reconstrução de uma ordem pede `aralearn.response.ordering`.
- reconstrução de pares ou classificação pede
  `aralearn.response.matching`.

Essa orientação não substitui o catálogo. Nunca memorize um schema, invente
campos, use coordenadas de tela ou presuma que todos os packages aceitam toda
resposta. A combinação é válida somente quando manifest, contrato e validação
do package concordam.

## Lacunas, ordenação e encaixe

Uma lacuna declara `targetInstanceId` e `targetPath` para um campo textual real
de uma instância em `content`. A resposta precisa ocorrer nesse campo e será
substituída pelo controle interativo somente na renderização. A notação de
`targetPath` pertence ao contrato recuperado de
`aralearn.response.gap`; não codifique lacunas em strings.

Uma ordenação aponta para uma instância de conteúdo que preserve a sequência e
declara os identificadores na ordem correta. Os itens visíveis vêm da
representação alvo. Não duplique a sequência no enunciado nem use a posição
visual como resposta implícita.

Um encaixe declara origens, destinos e pares corretos. Ele pode reconstruir
uma bijeção ou classificar várias origens na mesma categoria. A interface usa
controles nativos acessíveis; arrastar nunca é obrigatório. Todo package de
conteúdo admite composição com lacuna/digitação e encaixe, mas isso não
autoriza deformar a convenção disciplinar do conteúdo: a interação permanece
no package de resposta.

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
O renderer apresenta cada elemento uma única vez e enumera a relação sem
cruzar rótulos. Use `set_diagram` quando interseção, união ou pertencimento
simultâneo for o objeto.

`matrix` é reservado a arranjos algébricos de escalares ou expressões, sem
cabeçalhos de atributos nem grade de registros. Para dados tabulares use
`table`; para esquema relacional use `database_schema`; para execução
variável por passo use `algorithm_trace`.

Em `flow`, cada decisão explicita condição e consequência. Em `tree`, a
ligação preserva pai e filho. Nos demais packages, unidades, eixos, ordem,
notação, grupos e direção necessários precisam estar declarados nos campos
semânticos do contrato.

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
