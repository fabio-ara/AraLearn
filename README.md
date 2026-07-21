# AraLearn

AraLearn é um aplicativo de estudo autodidata organizado em **microssequências**: etapas curtas, contextualizadas e retomáveis, compostas por cards de explicação e prática. O produto atual é voltado ao estudante e funciona com o mesmo runtime JavaScript na web e no Android.

A proposta responde a uma dificuldade simples: ter muito conteúdo disponível não significa ter um percurso de estudo. O AraLearn organiza esse percurso para uso frequente no celular, inclusive quando a conexão é instável.

## Organização do estudo

A árvore didática de um curso segue esta estrutura:

```text
curso -> módulo -> lição -> microssequência -> card
```

Uma microssequência concentra um objetivo específico e preserva a relação entre explicações, exemplos e exercícios. Os cards podem apresentar texto, código, tabela, matriz, plano cartesiano, grafo, mapa de relações, fluxograma ou árvore.

Duas camadas de navegação ficam fora da árvore:

- **coleções** agrupam cursos oficiais no catálogo e são administradas pelo AraLearn;
- **trilhas** são organizações pessoais que permitem ao estudante agrupar e ordenar os cursos selecionados.

## O que existe hoje

O runtime atual oferece:

- autenticação Supabase com cadastro, confirmação, recuperação, sessão persistida e renovação;
- catálogo oficial exclusivamente remoto, pesquisado por coleções e metadados;
- seleção leve de cursos, sem criar uma cópia completa da árvore para cada usuário;
- estudo, criação e edição granular de cursos, módulos, lições, microssequências e cards;
- planejamento top-down e geração ou correção bottom-up por LLM configurada pelo usuário;
- trilhas pessoais, progresso por lição e card e comentários por usuário;
- PostgreSQL/Supabase como fonte canônica compartilhada;
- um IndexedDB relacional separado por UUID de usuário;
- cache local apenas das árvores oficiais selecionadas, para estudo offline;
- sincronização automática e oportunista do estado pessoal;
- aplicações web e Android com o mesmo runtime JavaScript;
- contrato público `aralearn.contract`, versão 3, e validadores para todos os recursos de card.

Cada publicação oficial existe uma única vez no PostgreSQL. Ao adicionar um curso, o servidor grava somente `user_course_selections`; o dispositivo baixa a árvore oficial para seu cache IndexedDB. Se o usuário apenas estuda, a sincronização envia somente seleção, trilhas, progresso e comentários. A primeira alteração de conteúdo cria transacionalmente um curso pessoal independente; depois disso, somente as linhas realmente modificadas entram na outbox.

Quando há rede e o app está ativo, a outbox local é enviada e o feed remoto é consultado em páginas. Sem rede, o estudo e as gravações locais continuam. Para o mesmo estado pessoal, vale a última mutação válida confirmada pelo servidor; o estudante não precisa administrar versões, revisões ou merges.

O site e o APK não incluem cursos operacionais embarcados, documentos integrais de progresso ou segredos administrativos.

## Contrato e publicação

O JSON AraLearn v3 permanece como contrato público de intercâmbio, validação e montagem da visão de domínio em memória. Ele não é a unidade persistida pelo aplicativo.

A publicação de cursos oficiais é um processo administrativo externo ao runtime do estudante: um documento válido é normalizado em linhas relacionais, validado integralmente e só então publicado no catálogo. Fixtures JSON servem a validação, testes e publicação administrativa; não são lidas pelo app como catálogo.

O runtime mantém as superfícies de autoria top-down e bottom-up do AraLearn. Os módulos e harnesses de geração estruturada também sustentam testes e pesquisa; a resposta de um provedor nunca substitui a validação relacional e do contrato. A futura autoria administrativa por GPT personalizado continua sendo um sistema separado.

## Rodar localmente

```bash
npm install
npm run dev
```

O runtime exige a URL pública do projeto Supabase e a publishable key. Consulte [Supabase: desenvolvimento e implantação](docs/supabase.md).

Validação principal:

```bash
npm test
npm run lint
npm run validate:example
npm run validate:cutover
npm run catalog:validate
npm run test:e2e
npm run pages:build
npm run android:debug
```

Os comandos `harness:*`, `benchmark:*` e `smoke:deepseek:*` exercitam tecnicamente os mesmos contratos e motores usados pelas superfícies de autoria.

## Estado e limites

O AraLearn permanece em desenvolvimento. O uso autenticado depende de um projeto Supabase configurado, e o funcionamento offline de um curso começa depois do primeiro download da árvore selecionada.

O curso oficial permanece imutável no catálogo. Ao iniciar uma alteração autoral, o AraLearn cria automaticamente uma árvore pessoal independente antes de gravar o primeiro diff. Selecionar ou estudar um curso nunca cria essa cópia, não inicia versionamento e não faz merge com o catálogo.

A futura integração com GPT personalizado, Action restrita e serviço de autoria também não faz parte deste corte. Ela será implementada separadamente, depois da estabilização do aplicativo e do banco enxuto.

## Documentação

- [Mapa da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Uso do app](docs/uso-do-app.md)
- [Arquitetura](docs/arquitetura.md)
- [Contrato público](docs/aralearn-contract.md)
- [Recursos de card](docs/recursos-de-card.md)
- [Persistência relacional e sincronização](docs/persistencia-relacional.md)
- [Supabase: desenvolvimento e implantação](docs/supabase.md)
- [Estado atual e próximos passos](docs/estado-atual-e-roadmap.md)

Publicação web: <https://fabio-ara.github.io/AraLearn/>

## Contribuição

Mudanças devem entrar por branch temática, com histórico revisado antes do merge. Consulte [CONTRIBUTING.md](CONTRIBUTING.md).
