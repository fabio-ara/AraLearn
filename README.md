# AraLearn

AraLearn é um aplicativo local-first para transformar materiais dispersos em trilhas de estudo planejadas, praticáveis e revisáveis.

A decisão central do produto é separar planejamento e materialização. O fluxo `top-down` cria a estrutura do estudo até o nível de microssequência. O fluxo `bottom-up` materializa, corrige e continua cards dentro de uma microssequência específica, sempre a partir do ponto em que o usuário está estudando.

```text
curso -> módulo -> lição -> microssequência -> card
```

O card é a unidade de interação. A microssequência é a unidade didática central. Uma microssequência pode existir sem cards: isso significa que ela foi planejada pelo top-down, mas ainda não foi materializada para estudo.

## Fluxo principal

1. O usuário fornece uma intenção de estudo e, quando necessário, fontes como texto, PDF, DOCX, Markdown, HTML, JSON ou CSV.
2. O motor top-down organiza o material em curso, módulos, lições e microssequências planejadas.
3. O usuário entra em uma microssequência vazia.
4. Na aba de edição, o usuário pede à IA para criar os cards daquela microssequência.
5. Depois de estudar, o usuário pode corrigir a microssequência, continuar gerando cards nela, ir para a próxima microssequência planejada ou criar uma microssequência extra.

Esse desenho evita pré-gerar uma trilha inteira de cards. O usuário enxerga o caminho antes, materializa uma etapa por vez e paga custo de IA apenas quando precisa de conteúdo estudável.

## Papel da IA

A IA não atua como chat solto. Ela recebe uma tarefa situada na árvore do projeto.

No top-down, ela ajuda a planejar a trilha. No bottom-up, ela trabalha localmente: criar cards, corrigir uma microssequência, continuar uma etapa ou inserir uma microssequência extra quando a trilha planejada não basta.

O AraLearn envolve essa chamada com contrato, contexto, auditoria, reparo e aplicação controlada de patch. O objetivo é que o modelo gere no lugar certo, sem fugir do escopo da lição e sem substituir o projeto inteiro por uma resposta opaca.

## O que existe por baixo

A lição pode carregar um `domainMap`, que funciona como contrato semântico interno. Ele registra conceitos, procedimentos, pré-requisitos, erros comuns, evidências esperadas e variantes de prática. As microssequências referenciam partes desse mapa por metadados leves, como `domainRefs`, `practiceVariantRefs`, `didacticPurpose` e `coverageRole`.

Esses metadados ajudam a IA a manter a trilha, mas não são expostos como formulário para o usuário comum no runtime. A interface comum pede apenas o necessário: pedido, ação, tags, materialização preferida, anexos e envio.

## O que o usuário pode fazer

- gerar uma estrutura de estudo a partir de uma intenção e fontes;
- revisar a árvore planejada de curso, módulo, lição e microssequência;
- abrir uma microssequência planejada ainda vazia;
- pedir os primeiros cards daquela microssequência;
- corrigir cards gerados;
- continuar a microssequência com novos cards;
- avançar para a próxima microssequência planejada;
- criar uma microssequência extra quando a trilha precisar de um degrau intermediário;
- estudar e revisar o material salvo mesmo sem conexão.

Operações com IA remota exigem internet. Operações com provedor local exigem configuração local. O projeto e o conteúdo já materializado ficam no dispositivo.

## Documentação

- [Índice da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Guia de uso](docs/uso-do-app.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Arquitetura](docs/arquitetura.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Contrato público](docs/aralearn-contract.md)
- [Rascunhos e microssequências](docs/rascunhos-e-microssequencias.md)
- [Perfis didáticos](docs/perfis-didaticos.md)
- [Codex CLI local](docs/codex-cli.md)
- [Abrir com AraLearn no Android](docs/android-share-import.md)

## Executar localmente

```bash
npm install
npm run dev
```

Testes:

```bash
npm test
```

Versão publicada:

<https://fabio-ara.github.io/AraLearn/>
