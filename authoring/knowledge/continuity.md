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
- restrições que devem ser preservadas.

O campo `ledger` da especificação é um recorte do registro completo. Ele contém as fontes permitidas, as afirmações aplicáveis à parte, os termos disponíveis ou planejados nos cards e as pendências relevantes. Partes aprovadas e seus deltas ficam em `continuity`; o recorte não repete esse histórico.

## Saída de uma parte

A submissão inclui um `stateDelta` com os fatos novos que serão incorporados após aprovação. O delta não pode alterar o passado. Se a nova parte demonstrar que uma escolha anterior ou a própria especificação precisa mudar, o auditor bloqueia a execução e descreve a decisão necessária. `rebuild` refaz somente o fragmento atual sob a mesma especificação.

## Dependências

Uma parte pode depender de várias bases anteriores. A justificativa explica o conhecimento mobilizado por cada aresta. Não use a parte imediatamente anterior como dependência automática.

## Hashes

A API calcula o hash canônico do fragmento depois de persistir a parte. A auditoria copia esse `fragmentHash` para `submissionSha256`; não calcula o hash do arquivo de submissão. Assim, a decisão só pode ser aplicada à tentativa que foi relida e examinada. O hash do plano e as chaves de requisição também impedem mudanças silenciosas e duplicação.
