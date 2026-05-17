# AraLearn

AraLearn é um aplicativo open source para organizar conteúdo didático em trilhas de estudo com flashcards e apoiar a criação de novos cards a partir do que o usuário realmente precisa estudar.

Em vez de tratar o estudo como uma coleção solta de resumos, PDFs, anotações e respostas de IA, o app procura dar forma a esse material. A proposta é transformar acervo amplo, dúvida concreta e objetivo de aprendizagem em um percurso menor, editável e praticável.

Essa proposta foi pensada sobretudo para estudantes-trabalhadores: gente com pouco tempo, atenção interrompida, rotina irregular e estudo feito em janelas curtas do dia. Como a persistência do projeto é local, o app continua disponível sem internet para tarefas não criativas, como navegar pela trilha, revisar microssequências, ler cards já existentes e retomar o estudo no ponto em que ficou. Os recursos de geração com modelos de linguagem, por sua vez, dependem de conexão.

## O que o app faz

O AraLearn organiza o estudo em uma hierarquia explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A microssequência é a unidade didática central do produto. Ela reúne poucos cards em torno de uma mesma finalidade: introduzir uma noção, contrastar conceitos, praticar um procedimento, corrigir um erro recorrente, revisar um passo ou preparar a continuação da trilha.

Na prática, o app combina dois movimentos:

- organizar material amplo em uma trilha de estudo navegável;
- continuar o trabalho dentro da própria trilha, com geração, correção, expansão e edição localizadas.

Isso permite usar o AraLearn tanto para montar a estrutura de um curso quanto para melhorar uma etapa específica já durante o estudo.

## O que o app realmente traz de novo

O ponto mais característico do AraLearn não é apenas usar IA para gerar cards. O que ele propõe é outra forma de integrar IA, autoria e estudo.

Em vez de um chat solto que responde e desaparece, o app mantém um projeto estruturado e persistente. Em vez de gerar tudo de uma vez, ele pode planejar a trilha e materializar o conteúdo aos poucos. Em vez de confiar no texto fluente como sinal de qualidade, ele preserva contexto, estrutura, revisão e possibilidade de correção.

Esse desenho aproxima o produto de discussões recentes sobre desenvolvimento orientado por especificação, porque o trabalho com modelos de linguagem não acontece só por prompt livre. O sistema prepara contexto, usa contratos e validações, aplica mudanças por patch e mantém a trilha como referência do que faz sentido gerar em seguida.

Também há elementos de grounding e recuperação localizada de informação a partir das fontes importadas, mas o AraLearn não é melhor descrito como um chat RAG clássico. Seu núcleo está mais próximo de uma arquitetura de organização didática e autoria assistida do que de um sistema de pergunta e resposta sobre documentos.

## Como a IA entra no produto

A IA é usada principalmente em dois tipos de tarefa:

- organização estrutural de material amplo em cursos, módulos, lições e microssequências;
- intervenção localizada dentro da trilha já existente, para materializar, corrigir, expandir, reformular ou editar conteúdo.

Em ambos os casos, o resultado não precisa ser aceito como veio. O usuário pode revisar, editar, excluir, reexecutar, exportar e versionar o projeto.

## Operação local e ingestão de fontes

O AraLearn roda como aplicação web com persistência local no navegador e também pode ser empacotado para Android via `WebView`.

Hoje o projeto já inclui ingestão textual para alguns formatos importantes de estudo:

- `PDF`, com `pdfjs-dist`;
- `DOCX`, com `mammoth`.

O objetivo dessa ingestão não é reproduzir o documento visualmente, e sim aproveitar o texto como base para organização didática, grounding e auditoria.

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
