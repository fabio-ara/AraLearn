# Microssequências planejadas e versões

No AraLearn, uma microssequência pode existir antes de seus cards. Isso permite planejar a trilha antes de materializar conteúdo detalhado.

## Estados

Status possíveis:

- `planned`: etapa planejada, ainda sem versão de cards;
- `generated`: etapa com ao menos uma versão;
- `needs_review`: etapa que recebeu alteração e pede inspeção;
- `ready`: etapa considerada satisfatória pelo usuário.

Microssequências com status diferente de `planned` precisam ter ao menos uma versão válida.

## Versões

Cada intervenção local pode gerar uma nova versão:

- `generate`: primeira materialização de cards;
- `improve`: melhoria de explicação ou progressão;
- `more_practice`: prática adicional no mesmo foco;
- `support`: complemento para lacuna local;
- `repair`: ajuste de conteúdo.

A versão registra data, fonte, modo, pedido do usuário, cards, resumo e relatório de validação.

## Versão ativa

A microssequência pode apontar para uma versão ativa por meio de `activeVersionKey`.

A versão ativa é a usada para estudo. Manter outras versões ajuda a comparar mudanças, consultar uma formulação alternativa ou auditar a evolução do material.

## Complementos

Uma microssequência de apoio tem `type: "support"` e pode ser vinculada à microssequência de origem por `parentMicrosequenceKey`.

Complementos tratam lacunas locais sem refazer a organização inteira do curso.

## Regra operacional

O app não precisa materializar todos os cards no momento em que cria a trilha. A sequência recomendada é:

1. definir escopo;
2. gerar a trilha;
3. revisar a estrutura;
4. abrir uma microssequência;
5. materializar cards;
6. estudar e revisar;
7. marcar como pronta ou gerar outra versão.
