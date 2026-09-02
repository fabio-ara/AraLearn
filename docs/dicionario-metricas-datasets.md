# Referência do snapshot de Analytics

Analytics descreve o estado corrente de um Curso. O contrato
`aralearn.course-authoring-analytics.v2` organiza a leitura em **Desenho** e
**Autoria**; não possui conjuntos de eventos nem paginação.

## Escopo

| Campo | Significado |
| --- | --- |
| `course` | identidade, título e revisão corrente do Curso |
| `scope.selected` | Curso, Parte, Microssequência ou StudyUnit consultada |
| `scope.options` | opções humanas disponíveis para mudar o recorte |
| `missingData` | ausências que não podem ser convertidas em zero |
| `deepLink` | endereço da área, quando a borda pode fornecê-lo |

## Desenho

| Campo | Pergunta respondida |
| --- | --- |
| `studyUnitCount` | quantas StudyUnits existem no escopo? |
| `parameters` | quais valores pedagógicos foram efetivamente usados e por quantas Units? |
| `editorialDirections` | quais direções editoriais foram aplicadas? |
| `analysisUnits` | quais novidades foram inventariadas e quantas vezes introduzidas? |
| `introductionsByStudyUnit` | como a novidade se distribui pelas StudyUnits? |
| `explanationForms` | quais formas explicativas foram aplicadas? |
| `components` | quais representações e formatos de resposta aparecem? |
| `practiceByRequirement` | quantas oportunidades respondem a cada requisito de evidência? |
| `practiceVariationDimensions` | quais dimensões variam na prática? |
| `sourcesByRole` | quantas Fontes, Âncoras e Units aparecem por papel? |

`parameters` contém exatamente os quatro parâmetros pedagógicos. Direção
editorial permanece em campo separado.

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
do Curso e não congela um artefato para pesquisa.

Consulte [Analytics da Autoria](analytics-instrucionais.md) para interpretar os
números e [Arquitetura](arquitetura.md#analytics) para sua derivação.
