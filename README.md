# AraLearn

AraLearn é um aplicativo local-first para estudo, autoria e organização de microssequências de aprendizagem.

## Estado atual

Este repositório contém a base pública inicial do projeto.

Nesta etapa, o projeto já define o contrato autoral `aralearn.intent.v1` e a validação estrutural mínima desse formato.
O repositório também já inclui a pipeline mínima do motor para carregar, validar, normalizar e compilar esse contrato.
Há também uma camada inicial de renderização HTML baseada apenas no modelo compilado.
Nesta etapa, a persistência local simples já fica atrás de uma camada própria, separando projeto e progresso.
Também já existe uma camada inicial de edição manual de microssequências e cards, separada da renderização e da persistência.
O projeto agora também conta com uma casca navegável provisória da interface local, cobrindo a hierarquia `curso -> módulo -> lição -> microssequência -> cards`.
Essa casca já inclui leitura de cards, painel provisório da microssequência para interação com LLM por API e uma UI provisória de editor de cards.

Importante: a interface atual existe para validação de fluxo e integração local. Ela ainda não representa a semântica final do projeto.

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
- `src/storage/`
- `src/editor/`
- `src/ui/`

## Validação

```powershell
npm test
npm run validate:example
```

## Próximos passos

As próximas fases vão definir contrato, motor e interface do novo produto.
