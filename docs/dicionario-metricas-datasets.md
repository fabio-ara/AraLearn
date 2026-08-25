# Dicionário de métricas e conjuntos de dados

O contrato `aralearn.course-authoring-analytics-dictionary.v1` acompanha cada
consulta da área **Pesquisa**. Uma definição de métrica informa identidade,
versão, rótulo, pergunta, regra de cálculo, unidade, denominador, tratamento da
ausência e inferências vedadas. Mudar o significado exige outra versão.

## Métricas correntes

| Identidade | Versão | Pergunta | Unidade | Denominador |
| --- | ---: | --- | --- | --- |
| `facts_by_dataset` | 1 | Como os fatos do processo de criação se distribuem neste recorte? | contagem | todos os fatos que correspondem ao recorte informado |
| `facts_by_kind` | 1 | Quais fatos e estados aparecem no conjunto selecionado? | contagem | todos os fatos que correspondem ao recorte informado |

`facts_by_dataset` conta cada fato uma vez no conjunto de origem.
`facts_by_kind` conta cada fato uma vez pela combinação de tipo e estado. Uma
consulta sem fatos possui contagem zero. Revisão ou valor ausente dentro de um
fato permanece indicado no próprio registro.

As duas métricas proíbem inferir aprendizagem, atenção, qualidade didática ou
causalidade a partir da contagem.

## Conjuntos de fatos

| Chave | Registros incluídos | Objetos relacionados frequentes |
| --- | --- | --- |
| `activity` | operações confirmadas no Curso | Curso, mudança |
| `materializations` | produção por Partes e suas etapas | Parte, materialização, Microssequência |
| `design` | parâmetros, orientações, atribuições do plano e políticas de componentes | escopo, parâmetro, componente |
| `sources` | Fonte, Âncora, atribuição e PDF | Fonte, alvo atribuído |
| `annotations` | criação e tratamento de Observações | Observação, Unidade |
| `audits` | rodada, achado, correção, verificação e reversão | auditoria, achado, Unidade |
| `variants` | ponto comum, vínculo e comparação | conjunto, Curso derivado |

Esses conjuntos são projeções das relações operacionais correntes. Eles não
armazenam conversa completa nem formam um depósito analítico paralelo.

## Canais

| Chave | Significado |
| --- | --- |
| `authoring_interface` | operação feita na interface de Autoria |
| `authoring_chat` | operação solicitada por conversa conectada, via MCP ou Actions |
| `study_interface` | fato originado no Estudo |
| `audit_process` | fato produzido pelo ciclo de auditoria e correção |

Canal `null` informa ausência do dado. O sistema não escolhe um canal por
aproximação.

## Recorte de consulta

O recorte aceita:

| Campo | Regra |
| --- | --- |
| `datasets` | um ou mais dos sete conjuntos; a ausência seleciona todos |
| `channels` | zero ou mais canais; lista vazia não restringe o canal |
| `origins` | até 16 origens identificadas |
| `states` | até 24 estados identificados |
| `from` e `to` | instantes inclusivos; início deve anteceder o fim |
| `limit` | de 1 a 200 fatos; padrão 100 |
| `cursor` | cursor opaco da página seguinte, ou `null` |

O cursor pertence ao recorte, à revisão do Curso e ao instante de corte. Uma
página de outro contexto é recusada.

## Forma da página

O contrato de leitura é `aralearn.course-authoring-analytics.v1`. A página
contém:

| Campo | Regra |
| --- | --- |
| `dictionaryVersion` | versão do dicionário usada na projeção |
| `courseId` e `courseRevision` | identidade e revisão exatas do Curso |
| `generatedAt` | instante de geração da página |
| `query` | recorte normalizado que produziu a resposta |
| `metrics` | até 32 definições versionadas |
| `overview` | métrica selecionada, pergunta e até 64 linhas de resumo |
| `facts` | até 200 fatos distintos |
| `nextCursor` | continuação do mesmo recorte, ou `null` |
| `limitations` | até 16 limites de interpretação |
| `deepLink` | endereço da área Pesquisa no Curso |

Cada linha do resumo informa chave, rótulo, valor, unidade, denominador e
ausência. O campo `missing` é verdadeiro exatamente quando `value` é `null`.

## Forma de um fato

| Campo | Regra |
| --- | --- |
| `factId` | identidade estável dentro da projeção |
| `dataset` | conjunto ao qual o fato pertence |
| `kind` | tipo operacional do fato |
| `occurredAt` | instante registrado |
| `courseRevision` | revisão vinculada, ou `null` quando ausente |
| `channel` | canal reconhecido, ou `null` |
| `origin` e `state` | proveniência e estado quando aplicáveis |
| `subject` | objeto principal, com tipo, identidade e rótulo opcional |
| `related` | objeto relacionado, ou `null` |
| `values` | até 24 valores escalares |
| `missingData` | até 32 descrições de lacunas conhecidas |
| `deepLink` | endereço do objeto relacionado, ou `null` |

Os valores aceitam texto, número finito, booleano e `null`. Chaves sensíveis
como identidade de conta, endereço de correio eletrônico, texto bruto e cópias
integrais de antes e depois são recusadas pelo contrato.

## Exportação JSON

O contrato `aralearn.course-authoring-analytics-export.v1` reúne páginas do
mesmo Curso, revisão e recorte. Ele conserva:

- versão do dicionário;
- instante de exportação;
- identidade e revisão do Curso;
- consulta sem cursor;
- definições das métricas;
- fatos sem duplicação;
- limites de interpretação.

A montagem falha se uma página pertencer a outro recorte ou repetir um
`factId`.

## Exportação CSV

O CSV usa uma linha por fato e estas colunas estáveis:

```text
dictionary_version,course_id,course_revision,fact_id,dataset,fact_kind,
occurred_at,fact_course_revision,channel,origin,state,subject_kind,
subject_id,subject_label,related_kind,related_id,related_label,values_json,
missing_data,deep_link
```

`values_json` preserva as chaves e os valores escalares do fato. Ausências
conhecidas são separadas por ` | `. O arquivo usa UTF-8 com marcador inicial
para facilitar a abertura em programas de planilha.

Consulte [Pesquisa sobre a Autoria](analytics-instrucionais.md) para o uso pela
interface, pelo MCP e por Actions.
