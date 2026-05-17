# AraLearn

AraLearn é um aplicativo open source para organizar conteúdo didático em trilhas de estudo com flashcards, gerar novos cards quando necessário e permitir que o próprio percurso continue sendo editado, praticado e revisto ao longo do uso.

O ponto de partida do produto é simples: muita gente já tem material demais e estrutura de menos. Apostilas, slides, anotações, listas de exercícios, vídeos, artigos, documentação técnica e respostas de modelos de linguagem nem sempre se transformam, por si só, em um caminho estudável. O AraLearn foi pensado para responder a esse problema com organização explícita, prática localizada e autoria possível.

Essa proposta é especialmente importante para estudantes-trabalhadores e para outras pessoas que estudam em condições fragmentadas. Como o projeto fica salvo localmente no dispositivo, o app continua útil sem internet para abrir a trilha, reler etapas, revisar cards já existentes e retomar o estudo em deslocamentos, intervalos curtos ou lugares sem sinal. As operações criativas que dependem de modelos de linguagem continuam exigindo conexão ou provider local disponível.

## O que o app faz

O AraLearn organiza o estudo em uma hierarquia explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa hierarquia não serve apenas para armazenar conteúdo. Ela é a própria arquitetura de contexto do produto. Curso, módulo e lição situam o que a microssequência deve fazer; a microssequência, por sua vez, localiza o card dentro de uma progressão legível, cumulativa e editável.

A microssequência é a unidade didática central do app. Ela reúne poucos cards em torno de uma mesma função: introduzir um conceito, explicar um procedimento, contrastar ideias próximas, oferecer prática, revisar um ponto frágil ou preparar a continuação da trilha.

Na prática, o AraLearn combina dois movimentos:

- organizar material amplo em um esqueleto de curso navegável;
- continuar o trabalho dentro desse esqueleto, materializando, corrigindo, expandindo e reformulando etapas específicas.

## O que o AraLearn realmente traz de novo

O AraLearn não se distingue apenas por usar IA para gerar flashcards. Sua originalidade está em juntar, numa mesma arquitetura, organização do percurso, linguagem autoral simples, estudo local e intervenção editorial.

Primeiro, o app usa uma hierarquia explícita como forma de governar contexto. O que uma microssequência pede não depende só de um prompt momentâneo: depende da lição em que ela está, do módulo a que pertence, do que veio antes e do que ainda falta cobrir. Isso faz com que a geração e a continuação local ocorram sobre um percurso, e não sobre um tema solto.

Segundo, o produto se apoia numa linguagem autoral simples em JSON, legível tanto por pessoas quanto por modelos de linguagem. Em vez de depender apenas de texto corrido, o conteúdo pode ser expresso por estruturas como `say`, `code`, `table`, `flow`, `tree`, `plane` e `matrix`. Essa camada intermediária é uma das propostas mais próprias do AraLearn: ela mantém o material compreensível e editável, ao mesmo tempo que permite ao app renderizar experiências bem mais ricas no runtime.

Terceiro, o que o usuário escreve ou o modelo devolve não fica preso a um formato técnico opaco. Um card simples pode virar explicação, tabela ou código; um fluxograma, por exemplo, nasce de uma descrição autoral relativamente acessível e é convertido pelo app em geometria, nós, conexões e prática interativa.

Quarto, o produto tenta conciliar assistência e autoria legítima. Um usuário iniciante pode apenas fornecer material e deixar o app montar o esqueleto do curso para começar a estudar. Já um professor, pesquisador ou autor mais avançado pode intervir de modo fino no percurso, nos modelos, nos parâmetros, nos prompts e na forma final do conteúdo.

## Como a IA entra no produto

A IA é usada principalmente para:

- organizar material amplo em cursos, módulos, lições e microssequências;
- materializar conteúdo dentro de uma microssequência planejada;
- corrigir, expandir ou reformular conteúdo localizado;
- continuar a trilha sem perder o contexto do que já foi estudado.

O ponto decisivo é que isso não acontece como conversa solta. O app prepara a tarefa antes: ingere fontes, distribui contexto, trabalha com contratos explícitos, divide o fluxo em fases, valida o resultado e aplica mudanças por patch. Essa decomposição ajuda a usar melhor orçamento de tokens, separar parsing de geração e reduzir dependência de respostas longas e pouco controláveis.

## Linguagem autoral e runtime

Uma das ideias centrais do AraLearn é que o conteúdo didático não precisa existir apenas como texto livre nem como formato fechado demais para ser editado.

O contrato público do app usa uma linguagem autoral simples para representar explicações, perguntas, código, tabelas, árvores, planos cartesianos, matrizes e fluxogramas. Isso traz três vantagens ao mesmo tempo:

- o material continua legível para humanos;
- ele continua utilizável por modelos de linguagem;
- o runtime pode transformar essa descrição em apresentações e práticas mais sofisticadas.

Essa escolha permite que autoria humana, assistência algorítmica e renderização interativa trabalhem sobre uma base comum.

## Autoria, parametrização e controle

O AraLearn foi pensado para não reduzir o usuário a consumidor passivo do que o modelo gera.

O produto admite diferentes graus de intervenção. Quem quiser menos atrito pode subir material, pedir a organização do curso e começar a estudar a partir das microssequências planejadas. Quem quiser mais controle pode editar títulos, descrições, orientação da lição, cards, estrutura, parâmetros de geração, provider, modelo e outros campos de configuração.

Isso é importante também do ponto de vista pedagógico e político. Um produto educacional não deveria impor um único método como destino inevitável. O AraLearn tenta oferecer direção, memória e mediação sem fechar o espaço de apropriação, crítica e correção por parte de quem usa.

## Operação local e ingestão de fontes

O AraLearn roda como aplicação web com persistência local no navegador e também pode ser empacotado para Android via `WebView`.

Hoje o projeto já inclui ingestão textual para formatos importantes de estudo, como:

- `PDF`, com `pdfjs-dist`;
- `DOCX`, com `mammoth`.

O objetivo não é reproduzir visualmente o documento, e sim aproveitar o texto para organização didática, grounding, auditoria e continuação local do percurso.

## O que o usuário encontra

No app, o usuário pode:

- criar e navegar por cursos, módulos, lições e microssequências;
- importar e exportar projetos;
- anexar fontes para orientar a organização do estudo;
- escolher provider e modelo;
- abrir microssequências planejadas mesmo antes de elas terem cards;
- materializar conteúdo sob demanda;
- corrigir, expandir, reformular e editar cards;
- estudar os cards no próprio runtime;
- manter o material salvo localmente no dispositivo.

## Documentação

- [Visão do produto](docs/visao-do-produto.md)
- [Guia de uso](docs/uso-do-app.md)
- [Arquitetura](docs/arquitetura.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Fundamentos e evidências](docs/fundamentos-e-evidencias.md)
- [Contrato público](docs/aralearn-contract.md)
- [Documentação completa](docs/README.md)

## Execução local

```bash
npm install
npm run dev
```

Validação:

```bash
npm test
```

Versão web publicada:

<https://fabio-ara.github.io/AraLearn/>
