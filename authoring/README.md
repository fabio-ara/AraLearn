# Kit de autoria do AraLearn

Este diretório contém as instruções, os contratos e o conhecimento usados por
modelos de linguagem para trabalhar com cursos do AraLearn. Ele não contém os
cursos e não substitui a interface de estudo. Sua função é tornar a autoria
externa reproduzível: clientes diferentes recebem as mesmas regras, chamam o
mesmo conjunto de operações e produzem estruturas validadas pelo mesmo núcleo
de execução, chamado de `kernel` nos identificadores técnicos.

Para usar a autoria sem estudar sua implementação, consulte
[Criar cursos pelo chat](../docs/criar-cursos-pelo-chat.md). Para compreender o
serviço e seu modelo de segurança, leia
[Autoria remota por modelos de linguagem](../docs/autoria-mcp.md).

## Duas escalas de autoria

O AraLearn possui duas formas complementares de assistência:

1. **assistência contextual no aplicativo** — atua sobre o card, a
   microssequência ou a lição selecionada. É adequada a correções e pequenas
   recomposições durante a leitura;
2. **autoria remota de estrutura extensa** — planeja, materializa, reorganiza,
   audita e submete cursos por um cliente que implemente o **Model Context
   Protocol (MCP)**, protocolo de integração entre modelos e ferramentas, ou
   por um GPT personalizado com uma **Action**, conexão HTTP descrita por um
   contrato OpenAPI.

As duas formas usam o mesmo modelo de card e a mesma biblioteca de pacotes de
recursos,
mas não têm a mesma autoridade. A seleção feita no aplicativo delimita o que a
assistência contextual pode alterar. A autoria remota opera em um espaço de
trabalho autoral (`workspace`), com revisão, capacidades da conta e ferramentas
explícitas.

## Por que há instruções, conhecimento e esquemas separados

Um único prompt extenso mistura responsabilidades diferentes:

- regras invariantes do produto;
- orientação pedagógica consultada conforme o problema;
- formato exato dos dados;
- particularidades da plataforma que hospeda o modelo.

Essa mistura torna a manutenção difícil e ocupa contexto mesmo quando uma
parte não é necessária. O kit separa essas funções:

- `core/` reúne o procedimento estável, a segurança e os critérios de
  qualidade;
- `knowledge/` contém conhecimento recuperável sobre cards, representações,
  publicação e continuidade;
- `schemas/` contém os esquemas que definem os formatos executáveis aceitos pelo
  servidor;
- `platforms/` adapta instalação e instruções às plataformas compatíveis;
- `examples/` mostra envelopes e operações completas.

O modelo recebe instruções curtas no início e consulta conhecimento adicional
sob demanda. O servidor, porém, não confia apenas nessas instruções: valida
esquemas, relações, revisão e autorização antes de gravar. O
[glossário técnico](../docs/glossario-tecnico.md) aprofunda os termos usados
neste kit.

## Pacotes de recursos e núcleo

Cada representação de card é um **pacote de recurso** (`package`) independente.
O pacote declara:

- quando a representação é apropriada ou deve ser evitada;
- quais operações cognitivas ela apoia;
- seu contrato de conteúdo;
- os alvos válidos de prática;
- como validar e renderizar a estrutura.

O **núcleo** (`kernel`) conhece a interface comum dos pacotes, mas não incorpora os
detalhes de cada gráfico, fórmula ou diagrama. Essa separação permite adicionar
uma representação sem criar outra versão monolítica do contrato e sem alterar
o fluxo básico de autoria.

Três identificadores aparecem nos arquivos porque representam camadas
distintas:

| Identificador | O que descreve |
| --- | --- |
| `aralearn.library.v1` | envelope operacional que reúne um ou mais cursos, ou um recorte indicado por `scope` |
| `aralearn.course.v1` | contrato de um curso consumido pelo núcleo de estudo e pelos recursos |
| `aralearn.resource-library.v1` | protocolo de consulta progressiva ao catálogo de pacotes |

Eles não são versões concorrentes do mesmo objeto. A distinção impede que uma
estrutura de armazenamento seja confundida com um curso ou com uma resposta
de busca no catálogo.

## Fluxo de autoria remota

Uma produção completa segue esta ordem:

1. interpretar finalidade, público, profundidade e fontes;
2. ler o workspace existente ou criar um vazio;
3. registrar a estrutura planejada em lotes pequenos;
4. dividir o trabalho em Partes coerentes;
5. materializar uma microssequência por vez;
6. descobrir recursos pela intenção e carregar somente seus contratos;
7. validar cada composição antes da gravação;
8. mostrar uma síntese para revisão humana;
9. auditar conteúdo e representação em rodada separada;
10. corrigir somente achados autorizados e reauditar;
11. estudar o que já está pronto em Trilhas;
12. fixar um artefato apenas quando houver submissão ou publicação.

“Parte” é uma unidade de organização da conversa; “microssequência” é a unidade
didática e técnica que recebe cards. A diferença permite produzir cursos
extensos sem enviar toda a árvore a cada turno.

## Concorrência e repetição segura

Toda mutação informa:

- `expectedRevision`, a revisão que o cliente leu;
- `requestId`, a identidade estável daquela tentativa;
- o hash dos argumentos relevantes.

Se outra sessão alterou o workspace, a revisão esperada deixa de coincidir e a
escrita é recusada. Se a rede perde apenas a resposta, repetir o mesmo
`requestId` com os mesmos argumentos recupera o resultado já produzido. O
primeiro mecanismo protege contra sobrescrita concorrente; o segundo protege
contra duplicação acidental.

O PostgreSQL conserva as entidades correntes do workspace. O Storage recebe
artefatos integrais e imutáveis somente quando uma versão precisa ser fixada.
Essa arquitetura reduz cópias redundantes e mantém a identidade exata do que
foi submetido ou publicado.

## Continuidade e revisão

O transcript do chat não é o estado do curso. O servidor conserva um resumo
estruturado do que precisa sobreviver entre sessões: brief, Partes, decisões,
mandato vigente e achados de auditoria. O assistente retoma por esse estado e
pela leitura dos objetos atuais.

Construção, auditoria, reparo e reauditoria são rodadas diferentes. Uma
auditoria registra problemas; ela não se autoriza a corrigi-los. O reparo atua
apenas sobre achados aprovados, e a reauditoria verifica se a correção resolveu
o problema sem introduzir outro.

## Integrações disponíveis

- [GPT personalizado com Action](platforms/chatgpt/SETUP.md)
- [Cliente MCP genérico](platforms/generic/INTEGRATION.md)
- [Claude](platforms/claude/SETUP.md)
- [Gemini](platforms/gemini/SETUP.md)
- [Microsoft 365](platforms/microsoft-365/SETUP.md)

Os arquivos de instrução em cada pasta são lidos pela plataforma ou enviados
ao modelo. Os guias `SETUP.md` são destinados a pessoas e explicam a
configuração. Não acrescente explicações extensas aos prompts executáveis
quando elas pertencem à documentação humana: isso aumenta custo de contexto e
pode enfraquecer a prioridade das regras operacionais.

## Fontes e arquivos gerados

Os arquivos em `authoring/` são fontes versionadas. Os pacotes distribuídos em
`docs/downloads/authoring/` são derivados dessas fontes e não devem ser
editados diretamente. Depois de qualquer alteração em instruções, conhecimento
ou schemas, regenere-os:

```powershell
npm run authoring:packages
```

O processo produz os arquivos de conhecimento, o prompt, a especificação
OpenAPI, manifests, checksums e arquivos compactados para cada plataforma.

## Validação

Execute:

```powershell
npm run test:authoring-packages
npm run audit:docs
npm run lint
```

O primeiro comando verifica paridade, tamanho e integridade dos pacotes. A
auditoria documental confere links, estrutura e afirmações obsoletas. O lint
detecta erros estáticos. Alterações no executor, nos schemas ou na persistência
também exigem a suíte geral do projeto.

Exemplos em [`examples/`](examples/) servem para aprender o formato, não como
credenciais nem como dados de produção. Segredos administrativos nunca devem
entrar em prompts, pacotes, APKs ou repositórios.
