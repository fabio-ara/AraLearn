# AraLearn

AraLearn é um aplicativo local-first para estudo, autoria e organização de microssequências de aprendizagem.

## Estado atual

Este repositório contém a base pública inicial do projeto.

Nesta etapa, o projeto já define o contrato autoral `aralearn.intent.v1` e a validação estrutural mínima desse formato.
O repositório também já inclui a pipeline mínima do motor para carregar, validar, normalizar e compilar esse contrato.
Há também uma camada inicial de renderização HTML baseada apenas no modelo compilado.

## Estrutura

- `docs/` documentação pública
- `src/` código-fonte
- `public/` arquivos estáticos públicos
- `tests/` testes automatizados da fase atual

## Documentação pública

- `docs/aralearn.intent.v1.md`
- `docs/examples/`
- `src/core/`
- `src/model/`
- `src/render/`

## Validação

```powershell
npm test
npm run validate:example
```

## Próximos passos

As próximas fases vão definir contrato, motor e interface do novo produto.
