# Assistência por IA

## Papel da IA

A IA no AraLearn executa tarefas didáticas situadas. Ela não é chat geral, não é autoridade final e não deve decidir a arquitetura sozinha.

O produto prepara o pedido, define escopo, injeta contexto, exige contrato, valida resposta e aplica patch. A IA produz dentro desse percurso.

## Dois fluxos

### Top-down

No top-down, a IA ajuda a transformar intenção e fontes em estrutura:

- curso;
- módulo;
- lição;
- microssequência planejada;
- mapa semântico interno da lição.

O objetivo é criar uma trilha revisável. Cards ficam para o bottom-up.

### Bottom-up

No bottom-up, a IA atua dentro de uma microssequência.

As ações comuns são:

- criar os primeiros cards de uma microssequência vazia;
- continuar uma microssequência que já tem cards;
- corrigir uma microssequência;
- criar uma microssequência extra depois da atual.

Avançar para a próxima microssequência planejada é navegação, não chamada de IA.

## Pedido local

Um pedido bottom-up combina:

- texto do usuário;
- ação escolhida;
- tags da microssequência;
- materialização preferida;
- anexos ingeridos;
- contexto da lição;
- metadados internos como `domainMap` e `domainRefs`.

O usuário comum vê só os parâmetros operacionais. O motor acrescenta a semântica interna.

## Como a IA se mantém na trilha

O motor usa a estrutura do projeto para restringir a chamada:

- a seleção atual indica curso, módulo, lição e microssequência;
- a lição fornece governança e `domainMap`;
- a microssequência fornece `domainRefs`, `coverageRole` e propósito;
- as tags indicam ancoragem local;
- o contrato limita formatos de cards;
- auditorias verificam coerência, fonte, progressão e patch.

Isso permite usar modelos mais baratos em tarefas delimitadas sem entregar toda a didática ao prompt livre.

## Correção

`Corrigir microssequência` deve atuar localmente. A IA pode reescrever cards, preencher lacunas, ajustar progressão ou trocar materialização inadequada, mas não deve replanejar a lição inteira sem necessidade.

## Continuação

`Continuar na microssequência` cria cards adicionais dentro da etapa atual. Em uma microssequência vazia, isso equivale a criar os primeiros cards.

## Criar microssequência extra

`Criar nova microssequência` usa a capacidade de expansão local do motor. Ela deve inserir uma etapa depois da atual, mantendo retorno explícito à trilha planejada.

Essa ação é útil quando a próxima microssequência planejada pressupõe um degrau que o usuário ainda não tem.

## Falhas

Uma falha de provider, resposta inválida ou patch reprovado não deve corromper o projeto. O app deve preservar o estado anterior e mostrar erro operacional compreensível.

## Autoria

A assistência por IA só faz sentido se o usuário continua podendo revisar e recusar. O AraLearn usa IA para diminuir atrito, não para esconder decisões didáticas.
