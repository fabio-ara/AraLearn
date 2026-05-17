# AraLearn

AraLearn é um ambiente local-first de organização pedagógica e estudo assistido. Seu objetivo é transformar material amplo, dúvida concreta e intenção de aprendizagem em percursos didáticos pequenos, auditáveis, editáveis e praticáveis, sem transferir à inteligência artificial a autoridade final sobre a didática.

O produto foi pensado, antes de tudo, para o estudante-trabalhador perdido em um mundo hiperinformacional: alguém que dispõe de muitas fontes, pouco tempo, atenção fragmentada e necessidade real de avançar. Em vez de prometer síntese mágica, o AraLearn procura oferecer estrutura externa: recorte, ordem, progressão, prática e possibilidade de revisão.

Essa proposta vale também para outros contextos: disciplinas acadêmicas, documentação técnica, trilhas profissionais, concursos, leitura de artigos científicos, estudo de línguas, oficinas, cursos autorais e organização de corpus heterogêneos.

## O que o produto faz

O AraLearn organiza o estudo em uma hierarquia explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Uma microssequência é a unidade didática central do produto. Ela reúne um pequeno conjunto de cards em torno de uma mesma finalidade: introduzir um conceito, contrastar dois conceitos, praticar um procedimento, corrigir um erro recorrente, revisar um passo ou preparar a transição para o próximo ponto da trilha.

O produto combina dois movimentos complementares:

- organização estrutural de material amplo em trilha pedagógica;
- intervenção local durante o estudo para materializar, corrigir, expandir, reformular ou editar microssequências.

No fluxo estrutural, o app ajuda a transformar fontes como ementa, bibliografia, slides, listas de exercícios, documentação, anotações ou artigo científico em uma arquitetura pedagógica navegável. No fluxo local, essa mesma arquitetura é usada como contexto para que o usuário continue produzindo o curso durante a prática, com controle editorial direto.

## Posição filosófica e pedagógica

O AraLearn não trata a IA como professora soberana nem como simples geradora de flashcards. Seu uso de modelos de linguagem é arquitetado: o sistema delimita escopo, organiza a informação, prepara o contexto, solicita saídas estruturadas, audita o resultado e só então aplica mudanças ao projeto.

Isso importa por razões pedagógicas, políticas e éticas.

Pedagógicas, porque aprender não é apenas receber texto: é percorrer uma ordem, praticar, errar, revisar, comparar, reformular e estabilizar noções em contexto. Políticas, porque o produto procura devolver ao estudante condições de orientação diante da abundância informacional, em vez de aprofundar dependência opaca de sistemas externos. Éticas, porque a automação não deve apagar autoria, criticidade nem possibilidade de correção humana.

O usuário pode ocupar papéis diferentes no mesmo ambiente:

- planejador, ao orientar a organização geral do percurso;
- auditor, ao revisar, corrigir, excluir ou reformular o que foi gerado;
- estudante, ao interagir com as microssequências e pedir continuação situada;
- autor, ao editar títulos, descrições, fonte-guia, tags, cards e estrutura.

Esse desenho aproxima o estudo de uma prática dialógica: a trilha existe, mas não fecha o pensamento do usuário. Ela fornece apoio, direção e memória; a continuidade nasce da interação crítica com o próprio percurso.

## Como a IA entra no produto

O AraLearn usa modelos de linguagem para dois tipos de tarefa.

Primeiro, para organizar material amplo em arquitetura pedagógica. Isso inclui a transformação de fontes extensas em cursos, módulos, lições e microssequências planejadas. Esse processo é ancorado em documentos, contratos e auditorias; o valor principal não está em “escrever tudo”, mas em dar forma didática a um conjunto de materiais.

Segundo, para sugerir ou reescrever conteúdo localizado dentro da trilha já planejada. Isso acontece quando o usuário quer materializar uma microssequência vazia, corrigir um card, pedir reforço, expandir um ponto, reformular um trecho ruim ou continuar a progressão.

Em ambos os casos, a IA trabalha sob restrição:

- o contexto é hierárquico;
- a lição concentra a governança didática;
- a saída esperada é estruturada;
- o resultado pode ser auditado e reparado;
- o patch é validado antes de alterar o projeto;
- o usuário pode aceitar, editar, excluir, exportar ou versionar.

## Arquitetura em termos simples

O núcleo do produto segue uma lógica próxima de specification-driven development. Em vez de confiar apenas em prompt livre, o app trabalha com contratos explícitos, artefatos intermediários, validações, policies didáticas e aplicação controlada de patch.

Na prática, isso significa:

- ingestão determinística das fontes antes do envio ao modelo;
- organização do material em artefatos intermediários;
- geração orientada por contratos públicos e internos;
- auditoria do que foi produzido;
- reparo quando necessário;
- aplicação segura no projeto local.

Esse desenho permite usar tanto providers por API quanto integração local. Hoje o AraLearn opera com LLMs acessadas por API e também com provider local via `Codex CLI`.

## Fontes, parsers e operação local

O produto faz uso de parsers open source para reduzir custo, ruído e fragilidade na ingestão. Entre os componentes já usados no projeto estão:

- `pdfjs-dist`, para extração textual de PDF;
- `mammoth`, para extração textual de `DOCX`.

O objetivo não é reconstruir visualmente o documento, e sim obter matéria textual suficientemente boa para organização pedagógica, grounding e auditoria.

O AraLearn foi desenhado para uso predominantemente local:

- aplicação web;
- uso local no navegador;
- publicação estática;
- empacotamento Android via `WebView`.

Depois que o material está salvo, o estudo pode continuar sem depender de conexão contínua. A persistência do projeto fica no dispositivo do usuário.

## O que o usuário encontra na interface

O usuário pode:

- criar e navegar por cursos, módulos, lições e microssequências;
- importar e exportar projetos ou recortes estruturais;
- anexar fontes para organização pedagógica;
- escolher provider e modelo;
- ajustar parâmetros avançados quando quiser mais controle;
- abrir microssequências planejadas mesmo antes de existirem cards;
- materializar conteúdo localmente;
- corrigir, expandir, reformular ou editar cards e microssequências;
- estudar os cards no próprio runtime;
- manter histórico local, progresso e versão do material.

Em termos de experiência, isso produz um ambiente único para planejar, estudar, revisar e autorar.

## Documentação

- [Visão do produto](docs/visao-do-produto.md)
- [Guia de uso](docs/uso-do-app.md)
- [Arquitetura](docs/arquitetura.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Contrato público](docs/aralearn-contract.md)
- [Fundamentos e evidências](docs/fundamentos-e-evidencias.md)
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
