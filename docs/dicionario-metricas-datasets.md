# Referência do snapshot de Analytics

Analytics descreve o estado corrente de um curso. O contrato
`aralearn.course-authoring-analytics.v3` organiza a leitura em **Desenho** e
**Autoria**; não possui conjuntos de eventos nem paginação.

## Escopo

| Campo | Significado |
| --- | --- |
| `course` | identidade, título e revisão corrente do curso |
| `scope.selected` | Curso, parte, microssequência ou StudyUnit consultada |
| `scope.options` | opções humanas disponíveis para mudar o recorte |
| `missingData` | ausências que não podem ser convertidas em zero |
| `deepLink` | endereço da área, quando a borda pode fornecê-lo |

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
| `sourcesByRole` | quantas fontes, Âncoras e Units aparecem por papel? |
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

## Exportação

**Exportar Analytics** salva o mesmo snapshot JSON que alimenta a tela. Não há
CSV nem coleta de linhas adicionais. O arquivo não contém a composição completa
do curso e não congela um artefato para pesquisa.

Consulte [Analytics da Autoria](analytics-instrucionais.md) para interpretar os
números e [Arquitetura](arquitetura.md#analytics) para sua derivação.
