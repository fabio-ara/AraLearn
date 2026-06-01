# AraLearn

AraLearn é um aplicativo de autoria e estudo com persistência local como referência primária do projeto. Ele é publicado como aplicação web e também empacotado como APK Android sobre `WebView`. Seu objetivo é transformar material disperso em trilhas didáticas editáveis, compostas por unidades pequenas o bastante para caber na rotina, mas articuladas o bastante para sustentar continuidade, revisão e prática.

O núcleo do produto não é o card isolado nem a conversa com um modelo de linguagem. A unidade central é a **microssequência**: uma etapa curta de aprendizagem que situa explicação, exemplo, exercício, correção de erro e passagem para o próximo passo dentro de uma trilha maior.

```text
curso -> módulo -> lição -> microssequência -> versão -> card
```

Essa estrutura permite tratar o estudo como trabalho organizável. Em vez de acumular anotações, PDFs, respostas de IA, exercícios soltos e links sem ordem clara, o usuário pode construir ou adaptar um percurso em que cada etapa tenha objetivo, fronteira, dependências e forma de prática.

## Em uma frase

AraLearn organiza estudo como projeto local versionado: primeiro estrutura o caminho, depois materializa uma etapa específica em cards renderizáveis, validáveis e revisáveis.

## O que o AraLearn oferece

O app permite:

- criar cursos organizados por módulos, lições, microssequências e cards;
- planejar uma trilha a partir de um escopo definido pelo usuário;
- gerar cards com apoio de serviços de geração textual acessados por API;
- revisar, corrigir, ampliar e versionar o material produzido;
- estudar em uma interface simples, com foco em etapas pequenas;
- importar, exportar e preservar o projeto em JSON;
- partir de cursos embarcados e editá-los localmente.

O ponto decisivo é a combinação entre estrutura, geração e revisão. O material produzido não entra no projeto como texto descartável: ele precisa caber no contrato público do app, passar por validação e permanecer disponível para nova leitura, correção e reaproveitamento.

## Como o produto funciona

O AraLearn organiza o trabalho em dois momentos.

O primeiro é o **planejamento da trilha**. O usuário informa tema, objetivo, itens que entram, itens que ficam fora, convenções e observações. A partir disso, o app pode propor curso, módulos, lições e microssequências.

O segundo é a **materialização local de cards**. O usuário abre uma microssequência específica e pede explicação, prática, correção ou apoio local. O serviço textual recebe apenas o contexto delimitado para aquela intervenção; o app recompila o resultado, valida o contrato e só então persiste a nova versão.

Na documentação técnica, esses dois movimentos aparecem como `top-down` e `bottom-up`. Para quem usa o produto, a lógica é mais direta: primeiro organizar o caminho; depois trabalhar uma etapa concreta.

## O papel da geração assistida

AraLearn usa modelos de linguagem como assistência de autoria, não como fonte final de verdade do projeto. O sistema continua responsável por:

- selecionar o contexto da intervenção;
- montar contratos objetivos para cada etapa;
- indicar recursos de card e campos permitidos;
- validar a saída antes de alterar o projeto;
- preservar versões e histórico de execução.

No fluxo atual, a robustez vem de duas escolhas combinadas:

- **seleção estrutural explícita de contexto**: o app envia a microssequência aberta, suas dependências, as referências escolhidas pelo usuário, a próxima etapa planejada, os cards existentes quando a operação é de correção e as fontes anexadas explicitamente resolvidas;
- **campos controlados e valores canônicos**: o serviço textual não escreve livremente o documento final inteiro; ele preenche decisões locais dentro de esquemas definidos pelo app, o que reduz ambiguidade e erro.

O repositório já contém integração com [DeepSeek API](https://api-docs.deepseek.com/), [Gemini API](https://ai.google.dev/api/), endpoints compatíveis com a interface de chat da OpenAI e um serviço local por linha de comando. Relatórios de verificação reais ficam em [`tests/reports/`](tests/reports/).

## Recursos de card

Os cards podem assumir formas diferentes porque o conteúdo nem sempre cabe bem em texto corrido. O contrato público hoje aceita:

- `paragraph`
- `choice`
- `code`
- `table`
- `matrix`
- `plane`
- `graph`
- `relation_map`
- `flow`
- `tree`

Esses recursos existem para preservar a representação que o conteúdo exige. Uma matriz deve poder aparecer como matriz; um vetor, como vetor; um fluxograma, como fluxograma; um grafo, como relação entre vértices e arestas. Isso melhora tanto a geração quanto a leitura didática do card.

## Cursos embarcados

O app inclui cursos oficiais já materializados, que funcionam como ponto de partida editável:

- `Matemática para Informática`, com um módulo de `Teoria dos Grafos`, `11` lições, `72` microssequências e `505` cards;
- `Práticas e Ferramentas de Desenvolvimento de Software`, voltado à família Visual Basic, com foco em VBA, VB 6.0, VB.NET, ambientes, interface e organização de código;
- `Organização e Arquitetura de Computadores`, com os módulos `MobileRAG` e `Filosofia da Computação Quântica`.

Esses cursos entram no projeto local como material que pode ser estudado, corrigido, ampliado e reorganizado pelo usuário.

## Estado atual

O projeto já possui:

- contrato público em JSON (`aralearn.contract`, versão `3`);
- planejamento estrutural de curso, módulo, lição e microssequência;
- geração local de cards por microssequência;
- versionamento de cards;
- validação estrutural e didática;
- renderer web;
- wrapper Android em `WebView`;
- cursos embarcados editáveis;
- integração com serviços textuais por API e com serviço falso para testes.

Para o enquadramento pedagógico, crítico e bibliográfico do projeto, leia [Fundamentos, pesquisa e governança](docs/fundamentos-pesquisa-e-governanca.md).

## Rodar localmente

```bash
npm install
npm run dev
```

Comandos úteis:

```bash
npm test
npm run validate:example
npm run validate:scope
npm run harness:scope
npm run harness:bottom-up
npm run smoke:provider
```

Smoke real com DeepSeek, se houver chave configurada:

```bash
DEEPSEEK_API_KEY=... npm run smoke:deepseek:real
```

Build Android de depuração:

```bash
npm run android:debug
```

## Documentação

O conjunto de documentação foi organizado por responsabilidade:

- [Mapa de leitura](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Uso do app](docs/uso-do-app.md)
- [Arquitetura](docs/arquitetura.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Fluxos, prompts e contratos de geração](docs/fluxos-prompts-e-contratos.md)
- [Contrato público](docs/aralearn-contract.md)
- [Recursos de card](docs/recursos-de-card.md)
- [Fundamentos, pesquisa e governança](docs/fundamentos-pesquisa-e-governanca.md)

Publicação web:

<https://fabio-ara.github.io/AraLearn/>
