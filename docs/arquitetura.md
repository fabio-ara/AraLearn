# Arquitetura do AraLearn

O AraLearn está em refundação arquitetural. O centro de gravidade da documentação deixa de ser o histórico de iterações e passa a ser a arquitetura-alvo do produto.

## Leitura correta

O contrato público continua simples, mas a operação interna precisa ser rigorosa.

O AraLearn deve ser entendido como:

- um `core didático`, que define progressão, cobertura, prática e auditoria;
- uma `engine de produção`, que executa fases pequenas e auditáveis;
- um `runtime de providers`, separado da lógica pedagógica;
- um `registry de configuração`, que torna prompts, contratos e policies parametrizáveis.

## Estado atual

O repositório já contém partes reais dessa direção:

- `generation/` concentra políticas, planejamento, validação e reparo;
- `generation/courseForge/` já opera como motor interno por fases;
- `domainMap`, `studyTrackPolicy` e o contrato de produção didática já restringem melhor a geração;
- a ordenação de microssequências já recebe reparo determinístico local.

Ainda assim, o projeto não deve ser lido como arquitetura final pronta. Ele ainda carrega mistura histórica entre camadas e documentação.

## Documento principal

A referência arquitetural principal passa a ser [arquitetura-alvo.md](./arquitetura-alvo.md).

Este arquivo fica como ponte curta entre:

- a arquitetura hoje implementada em partes;
- a arquitetura correta que deve orientar a refatoração profunda do projeto.
