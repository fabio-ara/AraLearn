# Atlas visual do AraLearn

Artefato temporário de investigação e desenho de UX/UI. Não altera o frontend real.

## Âncora funcional

Esta primeira edição é verificada contra `75e0a8e242cecc1a6bcac04d6edc99b0e03174cf` (`main`, 2026-08-21).

O atlas distingue três classes:

- **Existente**: capacidade comprovada no runtime, documentação corrente e/ou testes da revisão-âncora.
- **UX proposta**: reorganização de navegação, apresentação ou interação que não cria nova capacidade de domínio.
- **Extensão simples**: pequena melhoria de frontend que não depende de nova persistência ou nova semântica de domínio. Deve permanecer explicitamente marcada até decisão.

Exemplos e dados fictícios são identificados como **Exemplo sintético** e servem apenas para tornar o comportamento compreensível.

## Regra de segurança funcional

Nenhuma capacidade de domínio deve aparecer como existente por plausibilidade. Hipóteses levantadas durante a discussão precisam ser confrontadas com a revisão-âncora.

Correções já confirmadas nesta rodada:

- Actions não fazem parte do produto corrente; foram removidas no corte 0.0.23.
- A Autoria conversacional corrente é por MCP.
- A assistência textual de Unidade aceita provider `deepseek`, mas o modelo é configurável; não há um “DeepSeek V4” fixo no AraLearn.
- Em produção, a assistência usa serviço local/relay; credenciais diretas de providers pertencem apenas ao runtime explícito de desenvolvimento.

## Como usar

Abra `index.html`. A coluna esquerda mostra o mapa do produto. Cada item abre uma tela simplificada e uma explicação de: o que é, o que a pessoa faz, o que acontece e quais são os próximos caminhos.

Este atlas é deliberadamente sóbrio e grosseiro. A prioridade é compreender fluxos e decisões de interface; estética vem depois.
