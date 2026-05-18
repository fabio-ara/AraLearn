# Arquitetura-alvo do AraLearn

## Direção

A arquitetura-alvo do AraLearn é a consolidação de um fluxo único:

1. planejar top-down até microssequências;
2. estudar e materializar bottom-up;
3. aplicar mudanças por patch validado;
4. manter a camada semântica interna fora da UI comum.

## Invariantes

- A microssequência é a unidade didática central.
- O card é unidade de interação.
- Top-down não deve gerar todos os cards por padrão.
- Bottom-up deve operar no ponto atual da trilha.
- `domainMap` governa por baixo, mas não vira formulário comum.
- Provider não decide didática.
- Patch inválido não deve corromper o projeto.
- O projeto público permanece exportável e legível.

## Produto esperado

O usuário comum deve conseguir:

- gerar uma trilha planejada;
- reconhecer microssequências ainda vazias;
- abrir uma microssequência;
- pedir os primeiros cards;
- estudar;
- corrigir;
- continuar;
- ir para a próxima microssequência planejada;
- criar uma microssequência extra quando faltar um degrau.

## Motor esperado

O motor deve manter fases pequenas e auditáveis:

- intenção;
- ingestão;
- estrutura;
- domínio;
- planejamento de microssequências;
- contrato local;
- plano de cards;
- geração;
- auditoria;
- reparo;
- patch;
- validação;
- aplicação.

Nem todo fluxo usa todas as fases. Top-down estrutural para antes dos cards. Bottom-up local entra nas fases de materialização.

## Critério de sucesso

O produto está alinhado quando a pessoa usuária não precisa entender a arquitetura para usar o fluxo, mas a arquitetura continua clara para quem precisa auditar, manter ou evoluir o motor.
