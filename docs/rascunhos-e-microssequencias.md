# Rascunhos e microssequências

## Estado normal do produto

Uma microssequência pode existir sem cards.

Isso não é erro. Significa apenas que ela foi planejada pelo top-down e ainda não foi materializada.

## Estados

- `planned`: existe na trilha, mas ainda sem versão de cards
- `generated`: versão criada e pronta para inspeção
- `needs_review`: houve melhoria ou expansão e a nova versão ainda precisa de aceite
- `ready`: etapa considerada satisfatória

## Versões

Cada intervenção local cria uma nova versão:

- `generate`
- `improve`
- `more_practice`
- `support`
- `repair`

Versões anteriores são preservadas.

## Complementos

Quando o usuário pede um complemento, o app cria uma microssequência `support`.

Ela:

- não substitui a trilha principal
- fica ligada à microssequência de origem
- existe para atacar uma lacuna local

## Regra prática

O AraLearn não tenta pré-gerar a trilha inteira em cards.

O uso esperado é:

1. planejar a trilha
2. abrir uma microssequência
3. materializar localmente
4. revisar e continuar

