# AraLearn

AraLearn e um motor local-first de organizacao didatica e estudo assistido por LLM. Ele transforma materiais extensos, duvidas localizadas e intencoes de estudo em uma trilha estruturada de:

```text
curso -> modulo -> licao -> microssequencia -> card
```

O ponto central do produto e simples:

- o `top-down` organiza material amplo em uma arquitetura estudavel;
- o `bottom-up` materializa, corrige, expande e reformula o estudo durante a execucao;
- o usuario continua autor do percurso, mas guiado por uma estrutura externa forte.

O AraLearn nao e um app de resumo. Ele existe para converter informacao em progressao didatica auditavel.

Versao web publicada:

https://fabio-ara.github.io/AraLearn/

## O que o produto faz

O AraLearn foi desenhado para cenarios em que existe material demais e percurso de menos: disciplina academica, bibliografia, lista de exercicios, slides, artigo cientifico, documentacao tecnica, trilha de formacao ou duvida pontual dentro de um estudo ja em andamento.

Hoje o produto permite:

- organizar conteudo em cursos, modulos, licoes, microssequencias e cards;
- importar material e usar LLM para gerar a trilha estrutural top-down;
- navegar pela trilha inteira mesmo quando as microssequencias ainda estao vazias;
- materializar cada microssequencia depois, no runtime local, sob demanda;
- corrigir, expandir, reformular ou editar uma microssequencia ja aberta;
- estudar no mesmo ambiente em que se revisa e se faz autoria;
- exportar estrutura publica e preservar backup local completo.

Em termos de experiencia, isso significa que o usuario pode:

1. subir um conjunto de materiais;
2. pedir ao app que organize a trilha;
3. abrir qualquer licao ou microssequencia planejada;
4. estudar e intervir localmente quando surgir duvida, erro ou lacuna;
5. deixar a trilha crescer progressivamente com apoio da IA.

## Missao atual

A missao atual do AraLearn e combinar dois movimentos que normalmente aparecem separados:

- `top-down`: organizar material amplo em uma sequencia didatica navegavel;
- `bottom-up`: intervir durante o estudo real, no ponto exato em que o entendimento trava.

O resultado esperado nao e um curso pronto e opaco entregue por uma LLM. O resultado esperado e um sistema em que:

- a estrutura externa vem do app;
- a LLM ajuda a planejar e preencher;
- o usuario pode auditar, corrigir e deslocar o conteudo;
- o estudo passa a ter um carater dialogico, quase socratico, mas guiado por uma trilha previamente estruturada.

## Como o produto pensa

O AraLearn assume que a unidade didatica central nao e o card isolado, mas a `microssequencia`.

- o `card` e a unidade interativa;
- a `microssequencia` e a unidade de progressao;
- a `licao` concentra a governanca didatica;
- `modulo` e `curso` organizam a trilha ampla.

Essa hierarquia nao e apenas navegacao. Ela funciona como estrutura de contexto para a geracao e para o estudo.

Quando o usuario abre uma microssequencia, o sistema sabe em que curso, modulo e licao ela esta. Isso permite restringir a tarefa da LLM e tornar a operacao mais verificavel.

## Top-down e bottom-up

### Top-down

O `top-down` e usado quando o problema e organizar uma massa de material:

- ementa;
- bibliografia;
- slides;
- lista de exercicios;
- artigo cientifico;
- documentacao;
- plano de curso;
- trilha de formacao.

No estado atual, o top-down:

- atua em `project`, `course`, `module` e `lesson`;
- gera a estrutura auditada da trilha;
- planeja microssequencias;
- nao materializa cards por padrao.

Isso e deliberado. O valor principal do top-down nao e pre-gerar centenas de cards. O valor principal e transformar material amplo em percurso estudavel.

### Bottom-up

O `bottom-up` acontece no runtime da microssequencia. Ele nao e um motor concorrente de curso; ele e a intervencao local durante o estudo.

Ali o usuario pode:

- materializar uma microssequencia planejada;
- corrigir uma microssequencia ruim;
- expandir com novos cards;
- reformular a proposta;
- editar card ou foco local;
- abrir a proxima microssequencia planejada.

Esse e o ponto em que a autoria do usuario entra junto da pratica.

## Arquitetura em uma frase

O AraLearn e inspirado por uma logica proxima de `specification-driven development`: em vez de pedir texto livre e confiar no resultado bruto da LLM, o app tenta transformar intencao em especificacoes intermediarias pequenas, auditaveis e recomponiveis.

Em termos práticos:

- o usuario faz um pedido;
- o sistema monta contratos e artefatos intermediarios;
- a LLM responde em JSON restrito;
- o app valida, audita, repara e so entao aplica patch no projeto.

## Pipeline principal

No fluxo estrutural, o `CourseForge` opera por fases pequenas. O conjunto exato depende do escopo, mas a logica geral e:

1. resolver a intencao e o escopo;
2. ingerir anexos e preparar texto aproveitavel;
3. derivar governanca de licao e trilha;
4. planejar microssequencias;
5. auditar cobertura, ordem, contraste, pratica e coerencia;
6. reparar quando necessario;
7. compilar patch;
8. validar o patch;
9. aplicar no projeto.

No fluxo local de microssequencia, a logica muda:

1. abrir a microssequencia no runtime;
2. montar contrato local para aquela intervencao;
3. pedir materializacao, correcao, expansao ou reformulacao;
4. validar estrutura e aderencia didatica local;
5. aplicar a iteracao;
6. permitir aceitar ou descartar a versao gerada.

## O que a LLM consome

O app nao envia apenas um prompt em linguagem solta. Ele combina prompt com artefatos estruturados em JSON.

No fluxo estrutural, a LLM pode consumir artefatos como:

- `intent`
- `sourceLedger`
- `lessonPlans`
- `courseGraph`
- `lessonGovernance`
- `microsequencePlans`
- `interventionPlan`

No fluxo local, ela pode consumir:

- contexto da licao;
- governanca local;
- contrato da microssequencia;
- pedido do usuario;
- tags, tipo didatico e anexos relevantes.

O ponto importante nao e decorar os nomes internos. E entender a arquitetura: a LLM trabalha sobre uma especificacao intermediaria, nao diretamente sobre a arvore inteira do projeto sem mediacao.

## Governanca didatica

A licao concentra o principal nucleo de orientacao do sistema. Ela pode carregar:

- `sourceGuideStructured`
- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`
- `domainMap`

Esses campos restringem o que faz sentido gerar. Eles ajudam o app a decidir:

- que tipo de microssequencia cabe ali;
- que formatos didaticos sao mais plausiveis;
- que contraste ou pratica esta faltando;
- que erros comuns merecem tratamento explicito.

## Auditoria e controle do usuario

O AraLearn foi desenhado para nao pedir fe cega na resposta da LLM.

O usuario pode auditar o resultado por varios meios:

- navegando pela trilha planejada antes de materializar tudo;
- editando a licao e sua governanca;
- intervindo localmente na microssequencia;
- aceitando ou descartando iteracoes geradas;
- marcando o que entra ou nao no estudo;
- exportando a estrutura publica;
- preservando backup local completo.

Na pratica, a LLM nao fecha o curso sozinha. Ela propoe e preenche dentro de limites; o usuario continua podendo deslocar o que foi criado.

## Ingestao de fontes

O app possui uma camada inicial de ingestao para evitar mandar documento cru para a LLM sempre da mesma forma.

Hoje o repositorio ja trabalha com:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Para isso, o projeto usa parsers open source ja integrados ao runtime:

- `pdfjs-dist` para leitura de PDF;
- `mammoth` para extracao de texto de DOCX.

Essa camada nao promete preservar layout perfeito. O objetivo dela e produzir texto aproveitavel, com warnings quando a extracao vier parcial ou degradada.

## Providers

O caminho normal de uso da IA e por API, com Gemini como provider configuravel ja integrado. Tambem existe suporte a `Codex CLI local`, tratado como modo avancado.

Isso permite dois estilos de uso:

- provider remoto por API, mais simples para o usuario comum;
- provider local via bridge HTTP, para quem quer operar mais perto do proprio ambiente.

Mais detalhes:

- [Assistencia por IA](docs/assistencia-por-ia.md)
- [Codex CLI local](docs/codex-cli.md)

## Contrato publico e persistencia

O projeto trabalha com dois formatos principais:

- `aralearn.contract`: estrutura publica de projeto e recortes;
- `aralearn.storage`: backup local completo, com progresso e estados auxiliares.

O contrato publico foi mantido pequeno de proposito. Estados de runtime, iteracoes e detalhes de provider ficam fora dele.

Mais detalhes:

- [Contrato publico](docs/aralearn-contract.md)

## Documentacao principal

Para ler o produto no estado atual:

- [Visao do produto](docs/visao-do-produto.md)
- [Arquitetura](docs/arquitetura.md)
- [Guia de uso do app](docs/uso-do-app.md)
- [Assistencia por IA](docs/assistencia-por-ia.md)
- [Fundamentos e evidencias](docs/fundamentos-e-evidencias.md)
- [Modelo didatico](docs/modelo-didatico.md)

Indice completo:

- [docs/README.md](docs/README.md)

## Stack e execucao local

Scripts principais:

```bash
npm install
npm start
npm test
```

Outros scripts:

- `npm run validate:example`
- `npm run smoke:gemini`
- `npm run codex:local`
- `npm run android:debug`
- `npm run pages:build`

## Estado atual

O produto ja esta numa fase em que:

- o fluxo estrutural unico esta consolidado no `CourseForge`;
- o top-down sem cards por padrao ja esta implementado;
- microssequencias planejadas vazias ja sao navegaveis;
- o runtime local ja materializa e reescreve o estudo no proprio percurso;
- a base automatizada principal esta verde.

O que ainda depende de ambiente real para validacao final:

- fluxo completo com provider real;
- browser E2E com Playwright instalado;
- bateria manual final de UX e didatica.

## Validacao automatizada

Suite principal:

```bash
npm test
```

No estado desta documentacao, a suite principal do repositorio esta verde no ambiente local usado para desenvolvimento, com testes de contrato, runtime, geracao, renderer, storage, navegacao e validacao do `CourseForge`.

## Licenca e direcao

AraLearn permanece em desenvolvimento ativo. A direcao atual do projeto e:

- organizar material amplo com top-down estrutural;
- deslocar a autoria para junto da pratica por bottom-up local;
- conter o papel da LLM por arquitetura, contratos e auditoria;
- manter o usuario como dono do percurso e dos dados.

O objetivo nao e competir com a web em abundancia informacional. O objetivo e oferecer forma estudavel.
