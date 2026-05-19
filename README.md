# AraLearn

AraLearn é um app local-first para montar e estudar trilhas guiadas por LLM sem depender de um top-down pesado.

A arquitetura atual parte de duas decisões:

- `top-down` planeja a trilha até `microssequência`, sem gerar cards;
- `bottom-up` gera, melhora, expande e consolida uma microssequência por vez.

Árvore pública:

```text
curso -> módulo -> lição -> microssequência -> card
```

O fluxo principal deixou de ser “prompt livre + anexos + curso completo”. Agora ele é:

```text
contrato de escopo pequeno -> trilha planejada -> microssequência selecionada -> cards locais
```

## O que o usuário faz

1. Preenche a trilha por módulos com chips de `O que entra` e `O que não entra`.
2. Gera a estrutura do curso até microssequências planejadas.
3. Entra em uma microssequência.
4. Materializa os cards localmente.
5. Pede melhoria, mais prática, complemento ou próxima microssequência.

## Providers

O app suporta:

- `Codex local` via bridge HTTP local;
- `Gemini` por API;
- `OpenAI compatível`;
- `Fake` para teste e harness.

O `Codex local` continua disponível para o mesmo conjunto de operações do caminho por API:

- `plan-scope`
- `generate-microsequence`
- `improve-microsequence`
- `add-practice`
- `create-support`
- `generate-next`

## Estrutura de código

Núcleo relevante:

- `src/domain/`: contratos `scope` e `project v1`, microssequência, versão e cards.
- `src/generation/topDown/`: planejamento estrutural a partir do contrato de escopo.
- `src/generation/bottomUp/`: materialização e evolução local por microssequência.
- `src/generation/runtime/`: integração direta do top-down e do bottom-up com o documento do app.
- `src/generation/providers/`: registry e adapters de provider.
- `src/ui/lessonEditorApp.js`: casca principal restaurada do produto.
- `src/ui/scopeBuilder/`: builder com chips por módulo para o top-down.
- `src/ui/study/`: estudo e ações locais sobre a microssequência aberta.

## Scripts

```bash
npm run dev
npm test
npm run validate:scope
npm run harness:scope
npm run harness:bottom-up
npm run smoke:provider
```

## Documentação

- [Índice](docs/README.md)
- [Nova arquitetura LLM/API](docs/nova-arquitetura-llm-api.md)
- [Arquitetura](docs/arquitetura.md)
- [Uso do app](docs/uso-do-app.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Contrato público](docs/aralearn-contract.md)
- [Codex CLI local](docs/codex-cli.md)

## Executar localmente

```bash
npm install
npm run dev
```

Versão publicada:

<https://fabio-ara.github.io/AraLearn/>
