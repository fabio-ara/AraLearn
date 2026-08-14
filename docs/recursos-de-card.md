# Packages de card

Packages são módulos independentes compatíveis com o kernel. A única
ferramenta `consultarBibliotecaDeResources` expõe o contrato
`aralearn.resource-library.v1` por descoberta progressiva:

1. `explore` apresenta famílias e facetas controladas;
2. `search` busca pela intenção e classifica `coverage.status` como
   `canonical`, `versatile` ou `substitute`;
3. `inspect` compara até oito perfis sem carregar schemas;
4. `contracts` entrega no máximo quatro contratos de versões exatas;
5. `validate_card` confere o envelope, referências e compatibilidades;
6. `audit_representation` avalia conteúdo, resposta e feedback;
7. `preview_card` descreve a composição sem tentar reproduzir o renderer.

O catálogo informa finalidade, operações cognitivas, slots, áreas, objetos de
conhecimento, convenções acadêmicas, adequações, contraindicações,
tecnologias, modalidades de prática, compatibilidades, limitações e
acessibilidade. Não há enumeração documental paralela nem consulta que despeje
todos os schemas. Acrescentar um package não muda o kernel ou a ferramenta.
Famílias e facetas pertencem ao vocabulário controlado do catálogo; finalidade,
convenções e limitações pertencem ao próprio package. A versão do catálogo é
derivada desse conjunto semântico, portanto muda quando a capacidade ou a
política de seleção muda, mesmo que os IDs instalados permaneçam iguais.

Esses três valores são tokens públicos do protocolo. Nesse campo,
`canonical` quer dizer apenas que o algoritmo encontrou um package específico
para as facetas consultadas; não é uma certificação de consenso acadêmico. O
catálogo de resources também não é o catálogo de cursos mostrado em
**Coleções**.

O envelope de card vigente não usa os antigos campos `resource`, `kind` ou `exercise`. Ele
declara `role`, uma lista `content`, no máximo uma instância `response` e uma
lista `feedback`. Cada instância possui `{ id, package, version, data }`; o
kernel conhece o envelope e cada package conhece seus dados.

Um resultado `substitute` nunca bloqueia: o agente usa o melhor candidato e
incorpora brevemente o `chatDisclosure` no feedback do chat. `preview_card`
sempre devolve `rendered: false`; é um descritor, não screenshot nem simulação
de viewport, Graphviz ou Vega.

Na recomposição assistida, o catálogo oferece composições com uma ou mais
instâncias de conteúdo. Packages complementares podem coexistir quando cada um
preserva uma parte necessária da intenção, por exemplo uma fórmula e um gráfico
estatístico. A prática acrescenta somente uma resposta compatível; feedbacks
podem ser compostos quando acrescentam explicação posterior pertinente. A
escolha da composição precede o preenchimento dos contratos, para que o modelo
leve receba apenas a lista curta e os schemas que realmente usará.

`graph` recebe vértices e arestas sem coordenadas. O package calcula a
geometria móvel e mantém os rótulos completos numa lista semântica fora das
arestas. `relation_map` recebe domínio, contradomínio e pares ordenados;
apresenta cada elemento uma única vez, usa uma seta sem rótulo por par e
complementa o desenho com notação extensional, sem cruzar texto.
`matrix` representa somente arranjos algébricos, sem herdar a grade de uma
tabela de registros.

Na autoria, escolha pelo trabalho cognitivo e não para variar visualmente.
Explique referências e termos antes de exigir interpretação. Divida uma ideia
quando densidade, número de relações ou carga verbal tornarem o recurso difícil
de ler em 360 px.

Uma lacuna declara `targetInstanceId` e `targetPath`; não se codifica resposta
em marcador textual. Uma escolha declara IDs corretos, e uma ordenação declara
a ordem formal. Um encaixe declara origens, destinos e pares. A compatibilidade
depende de `responseCompatibility` e, para lacuna ou digitação, dos
`practiceTargets` declarados pelo contrato exato; `validate_card` decide se a
composição é válida.

Essa validação é estrutural: verifica envelope, slots, schemas, referências e
compatibilidades. `audit_representation` acrescenta três verificações de
adequação: `semantic_fit` para saber se o conteúdo materializa a intenção,
`response_affordance` para saber se a resposta realmente exercita a operação
cognitiva e `feedback_legibility` para saber se a explicação posterior pode ser
lida e relacionada à prática. Um card só está pronto para gravação depois das
duas etapas.
