# AraLearn

AraLearn é uma plataforma de estudo autodidata que transforma temas amplos em trilhas de cards organizados por **microssequências**, com apoio de LLMs por API. O estudante define o escopo; o sistema organiza o percurso, gera ou corrige cards dentro de etapas delimitadas, valida o resultado e mantém versões editáveis em JSON.

A ideia central é simples: ter acesso a conteúdo não significa ter um caminho de estudo. Tutoriais, PDFs, vídeos, fóruns, documentação técnica e respostas de IA podem se acumular sem formar progressão. Simon (1971) observou que a abundância de informação consome atenção. O AraLearn parte desse problema: ajudar o estudante a transformar material disperso em prática organizada, retomável e verificável.

O projeto não é apenas um aplicativo de flashcards, nem um chat livre com IA. Ele combina trilha didática, autoria assistida, contrato JSON, validação, versionamento local e cards capazes de aparecer como texto, código, tabela, matriz, plano cartesiano, grafo, mapa de relações, fluxograma ou árvore.

## O que é uma microssequência

A microssequência é a unidade central do AraLearn.

Ela é uma etapa delimitada dentro de uma lição. Cada microssequência possui objetivo, papel na trilha, dependências, conteúdos cobertos, critérios de verificação e versões de cards. Ela é maior que um card isolado, porque preserva contexto; e menor que uma lição inteira, porque concentra um problema de aprendizagem específico.

Exemplo conceitual:

```text
curso -> módulo -> lição -> microssequência -> versão -> card
```

Em uma microssequência, o estudante pode ver uma regra, acompanhar um exemplo, responder a uma pergunta, corrigir um erro provável e seguir para a próxima etapa. O card não fica solto: ele cumpre uma função dentro de uma sequência.

## Como a IA entra hoje

A geração por LLM via API é uma funcionalidade atual do AraLearn. O app trabalha com dois fluxos principais.

No **top-down**, o usuário informa tema, objetivo, conteúdos que entram, conteúdos que ficam fora e observações de notação ou abordagem. A LLM ajuda a propor uma estrutura de curso, módulos, lições e microssequências. Essa etapa organiza o caminho; ela não precisa gerar todos os cards finais.

No **bottom-up**, o usuário abre uma microssequência e pede uma intervenção local: gerar cards, corrigir uma versão, criar apoio para uma dificuldade específica ou continuar a próxima etapa planejada. A LLM recebe um pacote de contexto delimitado; o AraLearn compila a resposta, valida o contrato e salva uma nova versão quando o resultado é aceito.

O repositório prevê uso com Gemini, serviços compatíveis com a API de chat da OpenAI, DeepSeek por endpoint compatível e uma ponte local para Codex CLI. As documentações oficiais de OpenAI, Google AI for Developers e DeepSeek descrevem recursos de saída estruturada ou JSON que dialogam com essa arquitetura, embora o AraLearn também aplique validação própria depois da resposta do serviço.

A regra de autoria é: a LLM sugere; o aplicativo delimita, valida e registra; o usuário revisa e decide.

## Cards que aparecem como estrutura, não só como texto

Alguns conteúdos não ficam claros em parágrafo. Uma matriz precisa preservar linhas e colunas. Um vetor depende da relação com o plano. Um grafo mostra vértices e arestas. Um algoritmo pode pedir código ou fluxograma. Uma relação entre conjuntos pode ficar mais compreensível quando desenhada.

Por isso, o AraLearn não pede à LLM uma imagem pronta. A LLM fornece dados: valores da matriz, pontos do plano, vértices do grafo, nós de uma árvore, linhas de uma tabela, comandos de código. O aplicativo lê esses dados e monta o card na tela. Para o estudante, isso aparece como um recurso visual de estudo; para o sistema, é um objeto validável em JSON.

Esse desenho ajuda a reduzir improviso. O conteúdo continua editável, exportável e verificável, em vez de virar uma imagem fechada ou um texto difícil de conferir.

## O que o AraLearn oferece hoje

O estado atual do projeto inclui:

- criação e edição de cursos, módulos, lições, microssequências e cards;
- planejamento top-down por LLM via API;
- geração e correção bottom-up por LLM via API;
- contrato público `aralearn.contract`, versão 3;
- persistência local e exportação/importação em JSON;
- versionamento de cards por microssequência;
- validações estruturais e didáticas mínimas;
- recursos de card: `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- aplicação web servida localmente;
- publicação web em GitHub Pages;
- empacotamento Android por WebView;
- cursos embarcados editáveis;
- testes, validações, harnesses, smoke tests e benchmarks de geração.

Os cursos embarcados funcionam como material inicial, não como conteúdo intocável. Eles podem ser estudados, corrigidos, ampliados e exportados pelo usuário.

## Para quem o projeto foi pensado

O AraLearn foi concebido a partir de condições reais de estudo: pouco tempo, deslocamento, celular como principal dispositivo, cansaço depois do trabalho, conexão instável e dificuldade de manter continuidade. O público principal é o estudante-trabalhador, especialmente quem precisa estudar conteúdos técnicos sem dispor de longos períodos livres.

Essa escolha não é apenas social; ela afeta a arquitetura. O projeto privilegia etapas delimitadas, persistência local, prática objetiva, retomada rápida, versionamento e redução do contexto enviado à LLM.

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
npm run benchmark:structured
npm run benchmark:topdown
npm run benchmark:didactic
```

Smoke real com DeepSeek, se houver chave configurada:

```bash
DEEPSEEK_API_KEY=... npm run smoke:deepseek:real
```

Build Android de depuração:

```bash
npm run android:debug
```

## Estado atual e limites

O AraLearn já possui fluxos de geração por LLM via API, contrato JSON, recursos renderizáveis, validação, versionamento e material embarcado. Ainda assim, permanece em desenvolvimento.

O projeto não substitui aula, professor, bibliografia, revisão humana ou estudo crítico. Também não trata a saída da IA como verdade final. O objetivo é oferecer uma estrutura de autoria e estudo em que o conteúdo possa ser produzido com assistência, conferido, corrigido e retomado.

Há uma direção de pesquisa para reduzir dependência de LLMs externas, com uso mais forte de bases locais e, possivelmente, modelos locais. Isso deve ser lido como horizonte de desenvolvimento, não como capacidade plenamente pronta no estado atual.

## Documentação

Para conhecer o produto:

- [Mapa da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Uso do app](docs/uso-do-app.md)

Para entender a implementação:

- [Arquitetura](docs/arquitetura.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Fluxos, prompts e contratos de geração](docs/fluxos-prompts-e-contratos.md)
- [Contrato público](docs/aralearn-contract.md)
- [Recursos de card](docs/recursos-de-card.md)

Para avaliar fundamentos, limites e pesquisa:

- [Fundamentos, pesquisa e governança](docs/fundamentos-pesquisa-e-governanca.md)
- [Estado atual e próximos passos](docs/estado-atual-e-roadmap.md)

Publicação web:

<https://fabio-ara.github.io/AraLearn/>

## Referências citadas

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>

Simon, H. A. (1971). Designing organizations for an information-rich world. In M. Greenberger (Ed.), *Computers, communication, and the public interest*. Johns Hopkins Press.
