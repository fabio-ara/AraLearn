# Referência da leitura de autoria

Analytics descreve o estado corrente de um curso. O contrato
`aralearn.course-authoring-analytics.v4` conserva **Desenho** e **Autoria** e
acrescenta uma base explícita para comparar configurações, declarações e
contagens. Não possui conjuntos de eventos ou percurso histórico.

## Escopo

| Campo | Significado |
| --- | --- |
| `course` | identidade, título e revisão corrente do curso |
| `scope.selected` | Curso, parte, microssequência ou StudyUnit consultada |
| `scope.options` | opções humanas disponíveis para mudar o recorte |
| `missingData` | ausências que não podem ser convertidas em zero |
| `deepLink` | endereço da área, quando a borda pode fornecê-lo |
| `basis` | inventário planejado integral do curso e observações por unidade do escopo |
| `dimensions` | distribuições calculadas pelo mesmo observador usado na comparação |

## Base e dimensões

`basis.inventoryScope` informa o alcance do inventário: sempre o curso inteiro,
inclusive quando a observação está limitada a uma unidade. `analysisUnits` e
`evidenceRequirements` incluem itens ainda não aplicados, com enunciado,
descrição e referência. `sources` contém metadados bibliográficos, âncoras e
identificadores lógicos dos anexos, sem caminhos internos ou links temporários.

Cada entrada de `basis.studyUnits` distingue `requestedParameters` (resolução
canônica atual), `appliedParameters` (valores registrados na aplicação),
`declaration` (composição declarada pelo produtor), `components`, `wordCount` e
`sourceLinks` (presença observável). Valores ou motivos históricos ausentes
permanecem nulos; não são preenchidos com a configuração atual.

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
| `sources` | Fontes distintas efetivamente vinculadas à unidade | contagem do conteúdo |

Cada dimensão inclui definição, unidade, total, denominador e distribuição com
referências para inspeção. Ausência de declaração é `missingCount`; novidade,
explicação e retomada não se aplicam à unidade declarada somente prática, e
oportunidades de prática não se aplicam à unidade somente expositiva. Esses
casos são `notApplicableCount`. Sem observação aplicável, o total é nulo. A
posição da prática é categórica e não recebe total ou diferença numérica.

`revisits` é um indicador da declaração disponível, não uma classificação da
intenção do trecho. Pode incluir o desenvolvimento continuado de uma ideia e
não cobre toda reativação feita durante a prática. O protocolo editorial
distingue esses casos por leitura contextual; o cálculo atual não os resolve
semanticamente.

Em `practice`, a identidade contada é o par requisito–oportunidade, dentro de
cada unidade. Uma solicitação que atende a dois requisitos contribui com dois
pares; repetir a mesma oportunidade em outra unidade também contribui para a
soma das observações. Portanto, o total não é uma deduplicação global de
solicitações nem comprova sua distinção semântica. Prática informal sem essa
declaração não é estimada pelo observador.

`wordCount` e `extent` usam o contador
`private.count_course_component_authorial_words_v1`: ele percorre strings dos
dados dos componentes, exclui campos por nome e conta sequências alfanuméricas
com apóstrofos ou hífens internos. É uma aproximação operacional, sem
segmentação específica por idioma nem leitura do texto renderizado. Notação,
marcação e campos textuais novos podem alterar o resultado; uma sequência de
caracteres chineses não é segmentada em palavras linguísticas por essa regra.
Comparações devem conservar algoritmo, idioma e convenções do conteúdo. O
total não representa extensão visual, tempo de leitura ou complexidade.

## Desenho

| Campo | Pergunta respondida |
| --- | --- |
| `studyUnitCount` | quantas StudyUnits existem no escopo? |
| `parameters` | quais valores pedagógicos foram efetivamente usados e por quantas Units? |
| `editorialDirections` | quais direções editoriais foram aplicadas? |
| `analysisUnits` | quais ideias foram acompanhadas e quantas vezes foram introduzidas, usadas e retomadas? |
| `introductionsByStudyUnit` | como a novidade se distribui pelas StudyUnits? |
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
não são limites nem autorizam compressão. O primeiro descreve configuração,
não uma conversa observada; não há transcrição em Analytics. Direção editorial
permanece em campo separado.

`practiceSequence` contém `studyUnitRef`, `position` e `mode`: `expository`,
`practice`, `mixed` ou nulo quando a função não foi declarada. A ordem segue a
hierarquia curricular do escopo. O cálculo não deduz função a partir de
componentes, respostas ou tamanho do conteúdo.

`practiceDistribution` é derivada dessa sequência pelo
[observador determinístico](../src/domain/coursePracticeDistribution.js).
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
| `observations` | Observações criadas, abertas e resolvidas no estado consultável |
| `explicitParameterOverrideCount` | parâmetros definidos explicitamente e ainda vigentes |
| `manuallyRevisedStudyUnitCount` | StudyUnits cuja última revisão observável foi humana |
| `studyUnitsByOrigin` | Units agrupadas pela origem da criação e da última revisão |

Esses campos contam estados explícitos. Eles não produzem percentual de autoria,
score de colaboração ou inferência sobre aceitação.

## Dados ausentes

Uma contagem conhecida pode ser zero. Uma origem que o estado corrente não
permite atribuir aparece em `missingData` e não entra numa categoria inventada.
Consumidores devem manter essa diferença na interface e na exportação.

## Comparação e exportação

`aralearn.course-authoring-comparison.v1` compara duas seleções explícitas de
curso, revisão e escopo. Distribuições, configuração solicitada e aplicada
permanecem separadas. A diferença numérica é o total da direita menos o da
esquerda, somente quando ambos estão disponíveis. A comparação de inventários
usa os campos semânticos literais e a multiplicidade; ignora identidades locais
e não certifica equivalência semântica. `onlyLeft` e `onlyRight` conservam os
valores, as quantidades e as referências das diferenças.

**Exportar curso e análise** produz `aralearn.course-authoring-export.v1`:
`course`, `scope`, `analytics` e `artifact.document`. O documento inclui o
conteúdo integral do curso; a leitura quantitativa mantém o escopo escolhido.
O leitor percorre entidades com a mesma revisão e confere novamente a revisão
ao terminar. Falha ou mudança interrompe a exportação inteira; não há retorno
parcial ou substituição por cache. O arquivo não inclui bytes PDF/áudio,
registros de pessoas, progresso pessoal, credenciais ou transcrições.

Os contratos são compartilhados pela interface, pelos canais humanos e pela
exportação em [courseAuthoringComparison.js](../src/domain/courseAuthoringComparison.js).
As dimensões são calculadas em
[courseAuthoringBasis.js](../src/domain/courseAuthoringBasis.js).

Consulte [Analytics da Autoria](analytics-instrucionais.md) para interpretar os
números e [Arquitetura](arquitetura.md#analytics) para sua derivação.
