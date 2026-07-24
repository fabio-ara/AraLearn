# Continuidade entre partes

Partes são unidades de produção, não cursos independentes. A API mantém um estado acumulado para que o assistente conheça o que já foi aprovado sem reenviar o curso inteiro.

## Estado necessário

- estrutura e identificadores reservados;
- partes aprovadas e seus hashes;
- termos introduzidos;
- afirmações e fontes utilizadas;
- objetivos e critérios já cobertos;
- erros prováveis já trabalhados;
- notação e escolhas de linguagem;
- dependências disponíveis;
- pendências que afetam partes posteriores.

## Entrada de uma parte

A especificação deve trazer somente o contexto necessário:

- limite de propriedade da parte;
- estruturas que ela pode criar;
- resumos aprovados das bases anteriores;
- termos disponíveis;
- fontes permitidas;
- plano dos cards;
- `operationId`, `outcomeIds` e âncoras exatas do contexto de cada prática;
- restrições que devem ser preservadas.

O campo `ledger` da especificação é um recorte do registro completo. Ele contém as fontes permitidas, as afirmações aplicáveis à parte, os termos disponíveis ou planejados nos cards e as pendências relevantes. Partes aprovadas e seus deltas ficam em `continuity`; o recorte não repete esse histórico.

Uma prática pode usar um exemplo resolvido anterior da mesma parte. Também pode reutilizar um exemplo já aprovado quando a parte declara a dependência que o contém. Nesse caso, `continuity.workedOperations` informa o par exato de `operationId` e microssequência, e `dependencyMicrosequenceIds` confirma o caminho causal. A simples existência de uma explicação anterior não autoriza a prática.

## Relações conceituais

`conceptRelations` contém apenas as relações pertinentes à parte e o fecho de seus pré-requisitos. A relação é formal: `{ "from": "A", "to": "B", "relation": "requires" }` significa que A depende de B. Antes de uma prática ou retomada de A, B precisa ter sido apresentado por `foundation` ou `worked_example` na mesma cadeia causal, ou constar em `continuity.introducedConcepts` numa dependência aprovada. Pré-requisitos de B também são verificados.

O servidor recusa ciclos em `requires`. Os campos `from`, `to` e `relation` são identificadores do contrato; nenhuma frase é interpretada como aresta ou ordem conceitual.

## Retomada causal

Toda prática inclui em `retrievedConceptIds` os conceitos que exige. Um conceito só pode ser marcado como retomado quando:

- um card anterior de `foundation` ou `worked_example` o apresentou na mesma cadeia causal; ou
- `continuity.introducedConcepts` registra sua apresentação numa microssequência aprovada, e a microssequência atual depende dela.

A posição anterior no arquivo não basta. Entre microssequências, precisa existir um caminho em `dependsOn`. Entre partes, a continuidade precisa trazer o identificador aprovado. A autoria não cria ligação por semelhança de nome, rótulo ou descrição.

Essa regra permite distribuir a recuperação ao longo da trilha. O plano pode retomar um conceito depois de outras etapas e combiná-lo com uma operação nova, desde que preserve a dependência e limite a quantidade de componentes mobilizados no mesmo card.

## Progressão e alternância

Uma operação nova recebe `foundation` ou `worked_example` antes da primeira prática. Havendo prática guiada e prática com menor apoio, `guided_practice` aparece primeiro. O apoio retirado pode ser uma etapa resolvida, uma indicação de estratégia ou uma escolha reduzida; os dados particulares do problema continuam visíveis no card.

Operações relacionadas podem ser alternadas quando o estudante precisa decidir qual delas se aplica. A alternância ocorre depois da base necessária e não autoriza acrescentar operação, conceito ou equívoco fora do recorte persistido. `variationFocus` registra o que muda entre práticas próximas, como caso, representação, erro provável, estratégia ou apoio.

## Saída de uma parte

A submissão inclui um `stateDelta` com os fatos novos que serão incorporados após aprovação. O delta não pode alterar o passado. Se a nova parte demonstrar que uma escolha anterior ou a própria especificação precisa mudar, o auditor bloqueia a execução e descreve a decisão necessária. `rebuild` refaz somente o fragmento atual sob a mesma especificação.

## Dependências

Uma parte pode depender de várias bases anteriores. A justificativa explica o conhecimento mobilizado por cada aresta. Não use a parte imediatamente anterior como dependência automática.

## Hashes

A API calcula o hash canônico do fragmento depois de persistir a parte. A auditoria copia esse `fragmentHash` para `submissionSha256`; não calcula o hash do arquivo de submissão. Assim, a decisão só pode ser aplicada à tentativa que foi relida e examinada. O hash do plano e as chaves de requisição também impedem mudanças silenciosas e duplicação.
