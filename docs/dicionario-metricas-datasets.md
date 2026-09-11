# Referência da leitura de autoria

[Dados de autoria](analytics-instrucionais.md) descreve o estado corrente de um
curso.
Os dados são transportados em JSON, formato que organiza informações em campos,
listas e objetos. O contrato define quais campos são admitidos e como devem ser
interpretados; os nomes entre crases correspondem aos identificadores presentes
no arquivo. A versão `aralearn.course-authoring-analytics.v4` conserva **Desenho** e **Autoria** e
acrescenta uma base explícita para comparar configurações, declarações e
contagens. Seu objeto é o estado salvo; eventos e percurso histórico exigem
outra fonte de dados.

## Escopo

| Campo | Significado |
| --- | --- |
| `course` | identidade, título e revisão corrente do curso |
| `scope.selected` | curso, parte, microssequência ou unidade de estudo consultada |
| `scope.options` | opções humanas disponíveis para mudar o recorte |
| `missingData` | ausências que não podem ser convertidas em zero |
| `deepLink` | endereço da área, quando a interface ou integração pode fornecê-lo |
| `basis` | inventário planejado integral do curso e observações por unidade do escopo |
| `dimensions` | distribuições calculadas pela mesma rotina usada na comparação |

## Base e dimensões

A **base** reúne os registros usados no cálculo. Uma **dimensão** é a propriedade
observada, como a quantidade de novidades declaradas ou a extensão em palavras.
O mesmo conjunto de registros alimenta a consulta de um curso e a comparação
entre cursos; assim, os cálculos usam a mesma regra.

Uma **unidade de análise** identifica um recorte de conhecimento planejado;
um **requisito de evidência** descreve o que uma prática precisa solicitar para
examinar um objetivo. O [protocolo instrucional](desenho-instrucional-parametrizado.md#protocolo-de-unidade-de-análise)
define esses registros. Eles podem estar planejados e ainda não ter sido
aplicados ao conteúdo.

`basis.inventoryScope` informa o alcance do inventário: sempre o curso inteiro,
inclusive quando a observação está limitada a uma unidade. `analysisUnits` e
`evidenceRequirements` incluem itens ainda não aplicados, com enunciado,
descrição e referência. `sources` contém metadados bibliográficos, âncoras e
identificadores lógicos dos anexos, sem caminhos internos ou links temporários.

Cada entrada de `basis.studyUnits` separa a intenção corrente da configuração
que produziu a unidade. Também conserva a declaração de quem a produziu e as
propriedades observáveis do conteúdo. Os campos correspondentes são
`requestedParameters`, `appliedParameters`, `declaration`, `components`,
`wordCount` e `sourceLinks`. Valores ou motivos históricos ausentes permanecem
nulos, em vez de receber a configuração atual.

| Dimensão | Cálculo por unidade | Base |
| --- | --- | --- |
| `novelty` | número de unidades de análise declaradas como introduzidas | declaração |
| `reuse` | número de unidades de análise declaradas como utilizadas | declaração |
| `revisits` | aplicações explicativas de ideias não declaradas como introduzidas na mesma unidade | declaração |
| `explanations` | soma das formas desenvolvidas declaradas | declaração |
| `practice` | pares distintos de exigência de evidência e oportunidade | declaração |
| `practice_position` | modo declarado e referências em ordem curricular | declaração |
| `representations` | instâncias nos espaços de conteúdo, resposta e feedback | contagem do conteúdo |
| `extent` | palavras nos campos autorais dos recursos | contagem do conteúdo |
| `sources` | fontes distintas efetivamente vinculadas à unidade | contagem do conteúdo |

Cada dimensão inclui definição, unidade, total, denominador e distribuição com
referências para inspeção. Ausência de declaração é `missingCount`; novidade,
explicação e retomada não se aplicam à unidade declarada somente prática, e
oportunidades de prática não se aplicam à unidade somente expositiva. Esses
casos são `notApplicableCount`. Sem observação aplicável, o total é nulo, isto é,
não há valor a informar; isso difere de uma contagem conhecida igual a zero. A
posição da prática é categórica e não recebe total ou diferença numérica.

`revisits` deriva da declaração disponível. O indicador pode incluir o
desenvolvimento continuado de uma ideia e deixar de fora uma reativação feita
somente durante a prática. A intenção do trecho é distinguida por leitura
contextual no protocolo editorial, e não por esse cálculo.

Em `practice`, a identidade contada é o par requisito–oportunidade, dentro de
cada unidade. Uma solicitação que atende a dois requisitos contribui com dois
pares; repetir a mesma oportunidade em outra unidade também contribui para a
soma. O total representa esses pares, e não solicitações globais deduplicadas
ou diferenças semânticas verificadas. A rotina calcula apenas a prática que
possui essa declaração.

`wordCount` e `extent` usam o contador
`private.count_course_component_authorial_words_v1`: ele percorre strings dos
dados dos componentes, exclui campos por nome e conta sequências alfanuméricas
com apóstrofos ou hífens internos. Essa aproximação operacional trabalha sobre
os dados, antes da apresentação, e usa a mesma segmentação para todos os
idiomas. Por isso, uma sequência contínua de caracteres chineses pode formar um
único grupo, em vez de palavras linguisticamente segmentadas. Novos campos
textuais também podem alterar o resultado. Comparações devem conservar algoritmo,
idioma e convenções do conteúdo. Extensão visual, tempo de leitura e complexidade
requerem outras medidas.

## Desenho

| Campo | Pergunta respondida |
| --- | --- |
| `studyUnitCount` | quantas unidades de estudo existem no escopo? |
| `parameters` | quais valores pedagógicos foram efetivamente usados e por quantas unidades de estudo? |
| `editorialDirections` | quais direções editoriais foram aplicadas? |
| `analysisUnits` | quais ideias foram acompanhadas e quantas vezes foram introduzidas, usadas e retomadas? |
| `introductionsByStudyUnit` | como a novidade se distribui pelas unidades de estudo? |
| `explanationForms` | quais formas explicativas foram aplicadas? |
| `components` | quais representações e formatos de resposta aparecem? |
| `practiceByRequirement` | quantas oportunidades respondem a cada requisito de evidência? |
| `practiceVariationDimensions` | quais dimensões variam na prática? |
| `practiceSequence` | qual função didática foi declarada em cada unidade, na ordem do escopo? |
| `practiceDistribution` | como essas declarações se distribuem por função, posição e trechos consecutivos? |
| `sourcesByRole` | quantas fontes, âncoras e unidades aparecem por papel do vínculo? |
| `wordCountsByStudyUnit` | como a extensão observada em palavras se distribui entre unidades de estudo? |

`parameters` acompanha o [catálogo canônico de parâmetros](../src/domain/courseDesignParameters.js).
Cada entrada exporta sua `definition` e os valores efetivamente aplicados, com
origem, motivo (`reason`, nulo quando não registrado) e escopo de origem. Os
alvos de palavras por resposta de autoria e por unidade de estudo são flexíveis:
são referências, e não limites de tamanho. O primeiro descreve a configuração,
pois **Dados de autoria** trabalha com o curso salvo e não com transcrições de
conversa. A direção editorial permanece em campo separado.

`practiceSequence` contém `studyUnitRef`, `position` e `mode`: `expository`,
`practice`, `mixed` ou nulo quando a função não foi declarada. A ordem segue a
hierarquia curricular do escopo. O cálculo não deduz função a partir de
componentes, respostas ou tamanho do conteúdo.

`practiceDistribution` é derivada dessa sequência pela
[rotina de cálculo da distribuição](../src/domain/coursePracticeDistribution.js).
`expositoryOnlyCount`, `practiceOnlyCount`, `mixedCount` e `undeclaredCount`
são categorias exclusivas e somam `studyUnitCount`. `expositionPositions` e
`practicePositions` incluem as unidades mistas em ambas as listas.
`expositoryRunLengths` registra o tamanho de cada trecho consecutivo somente
expositivo; uma unidade mista ou não declarada interrompe o trecho.
`longestExpositoryRun` é o maior desses tamanhos, ou zero sem trecho expositivo.

`practiceBeforeExpositionCount`, `practiceBetweenExpositionsCount` e
`practiceAfterExpositionCount` contam posições com prática antes da primeira
explicação, estritamente entre a primeira e a última, ou depois da última.
Uma unidade mista pode participar da contagem entre explicações; uma posição
igual à primeira ou à última explicação não entra nessas três contagens.
Sem explicação declarada, os campos numéricos são zero, mas a relação de ordem
não está definida. A interface explicita essa ausência, numera as posições
humanas a partir de 1 e conserva os dados originais na exportação. As contagens
não classificam alternância, qualidade ou atendimento à preferência configurada.

Cada linha de `editorialDirections` conta as unidades alcançadas por aquela
direção. Como direções herdadas de escopos diferentes são aplicadas em camadas,
as linhas podem se sobrepor; sua soma não precisa coincidir com
`studyUnitCount`.

## Autoria

| Campo | Significado |
| --- | --- |
| `observations` | observações criadas, abertas e resolvidas no estado consultável |
| `explicitParameterOverrideCount` | parâmetros definidos explicitamente e ainda vigentes |
| `manuallyRevisedStudyUnitCount` | unidades de estudo cuja última revisão observável foi humana |
| `studyUnitsByOrigin` | unidades de estudo agrupadas pela origem da criação e da última revisão |

Esses campos contam estados explícitos. Percentual de autoria, pontuação de
colaboração e aceitação exigiriam definições e dados diferentes.

## Dados ausentes

Se a autoria declarou que uma unidade expositiva não introduz recortes novos,
a novidade conhecida pode ser zero. Se não há declaração sobre a unidade,
a informação está ausente. Se ela foi declarada somente prática, essa dimensão
não se aplica segundo o cálculo corrente. Misturar essas três situações
produziria uma comparação enganosa.

Uma contagem conhecida pode ser zero. Uma origem que o estado corrente não
permite atribuir aparece em `missingData`. Interface e exportação preservam essa
diferença, sem criar uma categoria para preencher o desconhecido.

## Comparação e exportação

`aralearn.course-authoring-comparison.v1` compara duas seleções explícitas de
curso, revisão e escopo. Distribuições, configuração solicitada e aplicada
permanecem separadas. A diferença numérica é o total da direita menos o da
esquerda, somente quando ambos estão disponíveis. A comparação de inventários
usa os campos semânticos literais e a multiplicidade; ignora identidades locais
e não certifica equivalência semântica. `onlyLeft` e `onlyRight` conservam os
valores, as quantidades e as referências das diferenças.

**Exportar curso e análise** produz `aralearn.course-authoring-export.v2`, com
`course`, `scope`, `analytics` e `artifact`. O conteúdo integral do curso fica em
`artifact.document`, inclusive as explicações salvas; a leitura quantitativa
mantém o escopo escolhido. Os demais campos de `artifact` preservam metadados
separados do conteúdo importável:

| Campo | Conteúdo |
| --- | --- |
| `explanationSources` | vínculos de fontes de cada explicação, lidos na mesma revisão do curso |
| `appliedExplanationBases` | base explicativa aplicada a cada unidade, quando registrada, com sua origem |
| `contentReviews` | estado da declaração de revisão de cada explicação ou unidade e data, quando existente |

O código que valida e organiza a leitura aceita o formato anterior `v1`;
metadados que ele não continha permanecem ausentes. A serialização atual limita
o arquivo a 32 MiB (33.554.432 bytes) e falha se o total exceder esse limite.
O leitor percorre entidades com a mesma revisão e confere novamente a revisão
ao terminar. Uma falha ou mudança interrompe a exportação inteira, de modo que
o arquivo represente uma revisão consistente. PDFs e áudios aparecem por
referência; dados de pessoas, uso, credenciais e transcrições ficam fora do
contrato.

Os contratos são compartilhados pela interface, pelos canais humanos e pela
exportação em [courseAuthoringComparison.js](../src/domain/courseAuthoringComparison.js).
As dimensões são calculadas em
[courseAuthoringBasis.js](../src/domain/courseAuthoringBasis.js).

Consulte [Dados de autoria](analytics-instrucionais.md) para interpretar os
números e [Arquitetura](arquitetura.md#dados-de-autoria) para sua derivação.
