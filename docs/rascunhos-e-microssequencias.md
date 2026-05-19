# Microssequências planejadas e versões

No AraLearn, uma microssequência pode existir antes de seus cards. Isso é parte do desenho do produto.

## Microssequência planejada

Uma microssequência planejada indica que a trilha já sabe que aquela etapa precisa existir, mas os cards ainda não foram materializados.

Isso permite que o usuário revise a ordem e o escopo antes de gerar conteúdo detalhado.

## Estados

Status possíveis:

- `planned`: existe na trilha, mas não possui versão de cards;
- `generated`: possui ao menos uma versão;
- `needs_review`: recebeu alteração que precisa de inspeção;
- `ready`: foi considerada satisfatória pelo usuário.

Microssequências com status diferente de `planned` precisam ter ao menos uma versão válida.

## Versões

Cada intervenção local pode gerar uma nova versão:

- `generate`: primeira materialização de cards;
- `improve`: melhoria de explicação ou progressão;
- `more_practice`: prática adicional no mesmo foco;
- `support`: complemento para lacuna local;
- `repair`: correção de problema detectado.

A versão preserva data, fonte, modo, pedido do usuário, cards, resumo e relatório de validação.

## Versão ativa

A microssequência pode apontar para uma versão ativa por meio de `activeVersionKey`.

A versão ativa é a usada para estudo. Preservar versões preservadas ajuda a comparar mudanças, recuperar uma explicação melhor ou auditar a evolução do material.

## Complementos

Uma microssequência de apoio tem `type: "support"`.

Ela deve ter vínculo com a microssequência de origem, por meio de `parentMicrosequenceKey`, e pode registrar a razão do apoio em `supportReason`.

Complementos são úteis quando a trilha principal pulou uma transição, quando um erro comum precisa de tratamento específico ou quando a prática revelou uma lacuna.

## Regra operacional

O app não precisa materializar todos os cards no momento em que cria a trilha. A sequência recomendada é:

1. definir escopo;
2. gerar a trilha;
3. revisar a estrutura;
4. abrir uma microssequência;
5. materializar cards;
6. estudar e revisar;
7. marcar como pronta ou gerar outra versão.
