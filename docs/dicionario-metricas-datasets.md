# Referência do snapshot de Analytics

Analytics descreve o estado corrente de um curso. O contrato
`aralearn.course-authoring-analytics.v2` organiza a leitura em **Desenho** e
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
| `sourcesByRole` | quantas fontes, Âncoras e Units aparecem por papel? |
| `wordCountsByStudyUnit` | como a extensão observada em palavras se distribui entre unidades de estudo? |

`parameters` contém as seis definições do catálogo: quatro parâmetros
pedagógicos e dois alvos editoriais quantitativos flexíveis, palavras por
resposta de autoria e por unidade de estudo. Os alvos não são limites nem
autorizam compressão. O primeiro descreve configuração, não uma conversa
observada; não há transcrição em Analytics. Direção editorial permanece em
campo separado.

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
