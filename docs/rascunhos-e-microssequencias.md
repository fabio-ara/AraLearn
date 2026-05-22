# Microssequências planejadas e versões

No AraLearn, uma microssequência pode existir antes de seus cards. Isso é intencional. O usuário pode planejar a trilha primeiro e materializar conteúdo apenas quando chegar à etapa que será estudada.

Essa decisão reduz atrito. O estudante não precisa criar um curso inteiro antes de começar. Ele pode revisar a estrutura, abrir uma etapa pequena, gerar cards, estudar, corrigir e continuar.

## O que é uma microssequência planejada

Uma microssequência planejada tem título, objetivo e posição na trilha, mas ainda não tem cards. Ela funciona como uma promessa de estudo: indica que aquela pequena etapa fará parte do percurso, mas deixa a materialização para o momento certo.

Isso ajuda o usuário a enxergar o caminho sem pagar imediatamente o custo de gerar e revisar todo o material.

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

A versão registra:

- data;
- fonte;
- modo;
- pedido do usuário;
- cards;
- resumo;
- relatório de validação.

A versão é importante porque o app trabalha com IA e revisão humana. Uma tentativa nova não deve apagar automaticamente uma versão anterior que ainda pode ser útil.

## Versão ativa

A microssequência pode apontar para uma versão ativa por meio de `activeVersionKey`.

A versão ativa é a usada para estudo. Outras versões podem permanecer disponíveis para comparação, recuperação ou auditoria da evolução do material.

## Complementos

Uma microssequência de apoio tem `type: "support"` e pode ser vinculada à microssequência de origem por `parentMicrosequenceKey`.

Complementos tratam lacunas locais sem refazer a organização inteira do curso. Eles são importantes para o fluxo semiaberto do AraLearn: o usuário pode seguir a trilha, mas também pode criar uma ponte quando percebe que falta uma etapa intermediária.

## Relação com as quatro ações locais

A versão e a microssequência de apoio sustentam as quatro ações locais do bottom-up:

1. seguir para a próxima microssequência planejada;
2. criar mais cards na microssequência atual;
3. criar uma microssequência adicional de apoio;
4. corrigir cards da microssequência atual.

Essas ações preservam autoria. O usuário pode estudar a partir do plano, mas também pode corrigir o plano quando a prática mostra uma lacuna.

## Regra operacional

O app não precisa materializar todos os cards no momento em que cria a trilha. A sequência recomendada é:

1. definir escopo;
2. gerar a trilha;
3. revisar a estrutura;
4. abrir uma microssequência;
5. materializar cards;
6. estudar e revisar;
7. marcar como pronta ou gerar outra versão.

## Critério de segurança

Uma nova versão só deve entrar no projeto depois de validada. Se a resposta da IA falhar, o estado anterior deve permanecer preservado.

Essa regra é central: a IA auxilia, mas não tem permissão automática para corromper o material persistido do usuário.
