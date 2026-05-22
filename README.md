# AraLearn

AraLearn é um app open source, local-first/offline-first, para autoria e estudo de trilhas didáticas. Ele ajuda o usuário a transformar ementas, slides, anotações, listas de exercícios, documentação técnica, dúvidas e objetivos de prova em um percurso estudável, persistente e revisável.

O AraLearn não é uma plataforma de conteúdo pronto. O conteúdo é criado, revisado, aceito e estudado pelo usuário. A IA pode ajudar a planejar, organizar, gerar cards, corrigir lacunas e propor prática, mas a autoria continua sendo do usuário.

```text
curso -> módulo -> lição -> microssequência -> card
```

A unidade central do app é a **microssequência**. Uma microssequência reúne cards em torno de uma função didática pequena e clara: introduzir uma ideia, explicar um procedimento, mostrar um exemplo, propor prática, revisar uma lacuna, corrigir um erro comum ou preparar a próxima etapa.

## Por que o AraLearn existe

O AraLearn nasceu de uma dificuldade prática: estudar exige mais do que acesso a conteúdo. Um estudante pode ter ementas, slides, anotações, listas de exercícios, respostas de IA, documentação técnica e capítulos de livros, mas ainda assim não ter um caminho claro de estudo.

Ferramentas como Anki e AnkiDroid dão liberdade, mas criar bons cards exige tempo, critério e energia. Esse trabalho pode competir com o estudo. Apps como Duolingo, SoloLearn, Enki e Encode reduzem o atrito, mas trabalham com trilhas fechadas ou pouco customizáveis. Chats com LLMs ajudam a explicar e gerar exemplos, mas o resultado costuma ficar disperso em conversas, sem virar material persistido, renderizado e estudável offline.

O AraLearn tenta ocupar esse espaço intermediário: manter a autoria do usuário e reduzir o atrito de planejar, organizar, gerar, revisar e estudar.

## Origem e público

O app é usado pelo autor para estudar disciplinas do curso de Tecnologia em Análise e Desenvolvimento de Sistemas no IFSP. Essa origem influencia o projeto: o AraLearn privilegia estudo técnico, prática progressiva, revisão de lacunas, documentação clara e uso em condições reais de pouco tempo, cansaço e atenção fragmentada.

Apesar dessa origem, o AraLearn foi desenhado para manter caráter geral. Ele pode servir a estudantes de graduação, estudantes-trabalhadores, concurseiros, autodidatas, pesquisadores, professores, monitores e qualquer pessoa que queira planejar, organizar, estudar, revisar e persistir conteúdo com baixo atrito.

## Autoria, conteúdo e modelos

O AraLearn é **content-agnostic**: ele não depende de uma disciplina, curso, instituição, base de conteúdo ou apostila específica. O usuário define o assunto, o escopo, o que entra, o que fica fora e quando uma etapa está pronta.

O AraLearn também é **model-agnostic**: a assistência por IA pode vir de diferentes providers. O app pode operar com APIs remotas, endpoints compatíveis com OpenAI, Gemini, DeepSeek, Codex CLI local ou provider falso de testes. O provider executa uma operação; o contrato, a validação e a decisão de aceitar o resultado pertencem ao app e ao usuário.

## Como o fluxo funciona

O fluxo tem dois momentos. Os termos técnicos aparecem na documentação, mas a ideia é simples:

1. **Planejamento da trilha**: o usuário informa o tema, módulos, recortes e objetivos. A IA pode ajudar a criar uma estrutura com curso, módulos, lições e microssequências. Essa etapa é chamada internamente de `top-down`, porque começa pelo desenho geral do percurso.
2. **Criação local dos cards**: o usuário abre uma microssequência e gera, melhora, corrige ou amplia cards apenas naquele ponto da trilha. Essa etapa é chamada internamente de `bottom-up`, porque parte da necessidade concreta da etapa em estudo.

Esse desenho evita que o usuário precise criar um curso inteiro antes de começar a estudar. A trilha dá orientação, mas os cards são materializados no ritmo do estudo.

## O que o AraLearn faz

O AraLearn ajuda o usuário a:

- criar um planejamento didático para qualquer assunto;
- organizar o estudo em curso, módulos, lições e microssequências;
- delimitar o que entra e o que fica fora de cada módulo;
- gerar uma trilha antes de criar os cards;
- abrir uma microssequência e materializar somente a etapa que será estudada;
- gerar teoria e prática em cards pequenos, legíveis e executáveis;
- criar mais cards dentro da microssequência atual;
- criar uma microssequência adicional quando aparece uma lacuna;
- corrigir cards já gerados;
- seguir para a próxima microssequência planejada;
- estudar offline depois que o conteúdo está persistido;
- exportar, importar e auditar o projeto em JSON.

## O que o AraLearn não faz

O AraLearn não fornece uma trilha oficial, não substitui professor, bibliografia, monitoria ou revisão humana, e não promete aprendizagem automática. Ele também não deve ser tratado como autoridade sobre o conteúdo gerado.

A função do app é reduzir atrito e dar estrutura. A função da IA é auxiliar. A função de decidir, revisar e estudar continua sendo do usuário.

## Princípio didático

O AraLearn não foi desenhado como resumidor. O objetivo não é encurtar o conteúdo até perder cobertura. O motor atual trata cobertura como efeito de:

- decomposição progressiva;
- prática distribuída;
- retomada cumulativa;
- variação suficiente para prova ou aplicação;
- cards com carga didática controlada.

No AraLearn, “pequeno” não significa “raso”. Significa estudável, legível, praticável e encadeado.

## Recursos de card

O contrato público aceita recursos renderizáveis simples. Eles podem ser escritos por humanos ou produzidos com auxílio de IA:

- `say`: explicação textual, enunciado ou síntese;
- `table`: tabelas, quadros comparativos e matrizes;
- `code`: código, comandos, pseudocódigo e exemplos técnicos;
- `flow`: fluxogramas e decisões;
- `tree`: hierarquias, pastas e estruturas aninhadas;
- `graph`: vértices, arestas, pesos e relações;
- `block_gap_fill`: parágrafos com lacunas e opções.

Esses recursos não existem para enfeitar o card. Eles aproximam o estudo da forma como o usuário terá de resolver exercícios, provas, problemas de programação, leitura técnica ou análise conceitual.

## Persistência, importação e exportação

O projeto AraLearn é persistido como JSON validado por contrato. Antes de salvar ou carregar, o documento passa por validação local. Se uma resposta de IA não respeita o formato esperado, ela não substitui o projeto anterior.

Há dois formatos principais de troca:

- **Projeto AraLearn**: contém o documento público do projeto, com `contract: "aralearn.contract"`, `version: 1`, `kind: "project"` e a lista de cursos.
- **Backup completo**: usa `format: "aralearn.storage"` e inclui projeto, data de exportação e progresso de estudo.

O progresso é separado do conteúdo. Ele registra posição de estudo e cards concluídos, sem misturar o estado de uso com o contrato público do projeto.

## Providers de IA

O AraLearn pode operar com diferentes providers:

- **Gemini**: útil para prototipação, testes e uso inicial; a free tier pode ser suficiente para experimentar, mas seus limites de requisições tendem a restringir estudo dedicado.
- **DeepSeek**: incluído para reduzir custo e latência em uso real. O projeto contempla `deepseek-v4-flash`, `deepseek-v4-pro` e o perfil `DeepSeek Quality`. No fluxo mais iterado, a prioridade é baixa latência e JSON estruturado validável.
- **Codex CLI local**: opção para quem já usa assinatura da OpenAI e prefere acionar o Codex por bridge local, sem necessariamente comprar créditos de outra API.
- **OpenAI compatível**: camada genérica para endpoints que sigam o formato esperado.
- **Fake provider**: usado em testes e harnesses.

A escolha do provider não altera a natureza do AraLearn. O conteúdo continua sendo do usuário e a saída continua sujeita ao contrato e à validação local.

## Executar localmente

```bash
npm install
npm run dev
```

Scripts úteis:

```bash
npm test
npm run validate:scope
npm run harness:scope
npm run harness:bottom-up
npm run smoke:provider
npm run codex:local
```

## Documentação

- [Índice da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Contexto de produto e referências](docs/contexto-produto-e-referencias.md)
- [Ética, poder e governança](docs/etica-poder-e-governanca.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Arquitetura](docs/arquitetura.md)
- [Arquitetura de geração por LLM e API](docs/nova-arquitetura-llm-api.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Contrato público](docs/aralearn-contract.md)
- [Uso do app](docs/uso-do-app.md)
- [Codex CLI local](docs/codex-cli.md)
- [Compartilhamento no Android](docs/android-share-import.md)

## Versão publicada

<https://fabio-ara.github.io/AraLearn/>
