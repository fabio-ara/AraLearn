# AraLearn

AraLearn é uma plataforma de estudo autodidata que transforma temas amplos em trilhas de cards organizados por **microssequências**, com apoio de LLMs por API. O estudante define o escopo; o sistema organiza o percurso, gera ou corrige cards dentro de etapas delimitadas e valida o resultado em JSON.

A ideia central é simples: ter acesso a conteúdo não significa ter um caminho de estudo. Tutoriais, PDFs, vídeos, fóruns, documentação técnica e respostas de IA podem se acumular sem formar progressão. Simon (1971) observou que a abundância de informação consome atenção. O AraLearn parte desse problema: ajudar o estudante a transformar material disperso em prática organizada, retomável e verificável.

O projeto não é apenas um aplicativo de flashcards, nem um chat livre com IA. Ele combina trilha didática, autoria assistida, contrato JSON, validação e cards capazes de aparecer como texto, código, tabela, matriz, plano cartesiano, grafo, mapa de relações, fluxograma ou árvore.

## O que é uma microssequência

A microssequência é a unidade central do AraLearn.

Ela é uma etapa delimitada dentro de uma lição. Cada microssequência possui objetivo, papel na trilha, dependências, conteúdos cobertos, critérios de verificação e seus cards. Ela é maior que um card isolado, porque preserva contexto; e menor que uma lição inteira, porque concentra um problema de aprendizagem específico.

Exemplo conceitual:

```text
trilha pessoal -> curso -> módulo -> lição -> microssequência -> card
```

A trilha pessoal é uma organização do usuário: um mesmo curso pode aparecer em mais de uma trilha, ser reordenado ou ficar temporariamente sem trilha. Ela não faz parte do contrato JSON v3 e não altera a árvore didática. No catálogo remoto, **coleções oficiais** agrupam cursos para pesquisa e descoberta; somente a administração do catálogo pode modificá-las.

Em uma microssequência, o estudante pode ver uma regra, acompanhar um exemplo, responder a uma pergunta, corrigir um erro provável e seguir para a próxima etapa. O card não fica solto: ele cumpre uma função dentro de uma sequência.

## Como a IA entra hoje

A geração por LLM via API é uma funcionalidade atual do AraLearn. O app trabalha com dois fluxos principais.

No **top-down**, o usuário informa tema, objetivo, conteúdos que entram, conteúdos que ficam fora e observações de notação ou abordagem. A LLM ajuda a propor uma estrutura de curso, módulos, lições e microssequências. Essa etapa organiza o caminho; ela não precisa gerar todos os cards finais.

No **bottom-up**, o usuário abre uma microssequência e pede uma intervenção local: gerar cards, corrigir cards, criar apoio para uma dificuldade específica ou continuar a próxima etapa planejada. A LLM recebe um pacote de contexto delimitado; o AraLearn compila a resposta, valida o contrato e aplica os cards resultantes.

O repositório prevê uso com Gemini, serviços compatíveis com a API de chat da OpenAI, DeepSeek por endpoint compatível e uma ponte local para Codex CLI. As documentações oficiais de OpenAI, Google AI for Developers e DeepSeek descrevem recursos de saída estruturada ou JSON que dialogam com essa arquitetura, embora o AraLearn também aplique validação própria depois da resposta do serviço.

A regra de autoria é: a LLM sugere; o aplicativo delimita, valida e registra; o usuário revisa e decide.

Essa dependência de API vale para planejamento, geração e correção assistida. A aplicação também precisa de conexão para autenticar, consultar o catálogo remoto e fazer a primeira sincronização. Depois disso, as linhas relacionais já sincronizadas, o progresso, os comentários e as mutações pendentes permanecem no IndexedDB e permitem continuar o estudo offline. Quando a conexão volta, a outbox é enviada ao PostgreSQL do Supabase, que é a fonte canônica compartilhada.

## Cards que aparecem como estrutura, não só como texto

Alguns conteúdos não ficam claros em parágrafo. Uma matriz precisa preservar linhas e colunas. Um vetor depende da relação com o plano. Um grafo mostra vértices e arestas. Um algoritmo pode pedir código ou fluxograma. Uma relação entre conjuntos pode ficar mais compreensível quando desenhada.

Por isso, o AraLearn não pede à LLM uma imagem pronta. A LLM fornece dados: valores da matriz, pontos do plano, vértices do grafo, nós de uma árvore, linhas de uma tabela, comandos de código. O aplicativo lê esses dados e monta o card na tela. Para o estudante, isso aparece como um recurso visual de estudo; para o sistema, é um objeto validável em JSON.

Esse desenho ajuda a reduzir improviso. O conteúdo continua editável, exportável e verificável, em vez de virar uma imagem fechada ou um texto difícil de conferir.

## O que o AraLearn oferece hoje

O estado atual do projeto inclui:

- autenticação Supabase com cadastro, confirmação, recuperação, sessão persistida e renovação;
- criação e edição de cursos, módulos, lições, microssequências e cards;
- planejamento top-down por LLM via API;
- geração e correção bottom-up por LLM via API;
- contrato público `aralearn.contract`, versão 3;
- PostgreSQL/Supabase como fonte canônica compartilhada, protegido por autenticação e RLS;
- réplica relacional offline em IndexedDB, com outbox, cursores e registro explícito de conflitos;
- persistência granular de estrutura, progresso e comentários, sem salvar o curso inteiro a cada alteração;
- importação e exportação pelo contrato JSON v3, sem usar o documento como unidade persistida;
- validações estruturais e didáticas mínimas;
- recursos de card: `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- aplicação web servida localmente;
- publicação web em GitHub Pages;
- empacotamento Android por WebView;
- catálogo exclusivamente remoto, consultado por metadados, com clonagem transacional de cursos oficiais;
- coleções oficiais pesquisáveis e trilhas pessoais ordenadas, sincronizadas pela mesma outbox relacional;
- testes, validações, harnesses, smoke tests e benchmarks de geração.

O app e o APK não incluem catálogo operacional. Uma pessoa autenticada escolhe um curso oficial publicado e o servidor cria uma cópia pessoal completa com novos UUIDs e rastreamento de origem. O JSON v3 continua sendo o contrato público para validação, importação, exportação, contexto de LLM e visão de domínio montada em memória.

## Para quem o projeto foi pensado

O AraLearn foi concebido a partir de condições reais de estudo: pouco tempo, deslocamento, celular como principal dispositivo, cansaço depois do trabalho, conexão instável e dificuldade de manter continuidade. O público principal é o estudante-trabalhador, especialmente quem precisa estudar conteúdos técnicos sem dispor de longos períodos livres.

Essa escolha não é apenas social; ela afeta a arquitetura. O projeto privilegia etapas delimitadas, persistência local, prática objetiva, retomada rápida e redução do contexto enviado à LLM.

## Rodar localmente

```bash
npm install
npm run dev
```

O runtime requer a URL pública do projeto Supabase e a publishable key. A configuração local e os comandos de migration estão em [Supabase: desenvolvimento e implantação](docs/supabase.md).

Comandos úteis:

```bash
npm test
npm run lint
npm run validate:example
npm run validate:cutover
npm run catalog:validate
npm run test:e2e
npm run pages:build
npm run validate:scope
npm run harness:scope
npm run harness:bottom-up
npm run smoke:deepseek:structured
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

O AraLearn já possui fluxos de geração por LLM via API, contrato JSON, recursos renderizáveis, validação e persistência relacional compartilhada com réplica offline. Ainda assim, permanece em desenvolvimento. O funcionamento autenticado depende de um projeto Supabase configurado; o uso offline pressupõe que a primeira sincronização do curso tenha sido concluída.

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
- [Persistência relacional e sincronização](docs/persistencia-relacional.md)
- [Supabase: desenvolvimento e implantação](docs/supabase.md)

Para avaliar fundamentos, limites e pesquisa:

- [Fundamentos, pesquisa e governança](docs/fundamentos-pesquisa-e-governanca.md)
- [Estado atual e próximos passos](docs/estado-atual-e-roadmap.md)

Publicação web:

<https://fabio-ara.github.io/AraLearn/>

## Contribuição

Mudanças no repositório público devem entrar por branch temática, com histórico revisado antes do merge. O guia curto de contribuição está em [CONTRIBUTING.md](CONTRIBUTING.md).

## Referências citadas

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>

Simon, H. A. (1971). Designing organizations for an information-rich world. In M. Greenberger (Ed.), *Computers, communication, and the public interest*. Johns Hopkins Press.
