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

- `core/` reúne o protocolo e os invariantes estáveis;
- `knowledge/` contém ciência, critérios, exemplos e políticas recuperáveis
  somente quando pertinentes; para o desenho parametrizado, há chunks de
  análise instrucional, granularidade semântica, elaboração explicativa,
  evidência e prática, tarefa profissional complexa, resolução de parâmetros,
  descoberta sob `ResourceSet` e auditoria de conformidade;
- `schemas/` contém os esquemas que definem os formatos executáveis aceitos pelo
  servidor;
- `platforms/` adapta instalação e instruções às plataformas compatíveis;
- `examples/` mostra envelopes e operações completas.

O modelo recebe instruções curtas no início e consulta knowledge JIT adicional
sob demanda. O prompt não enumera parâmetros nem teorias. MCP e Action operam
estado tipado, enquanto o workspace persistido permanece canônico; a conversa e
o cache offline nunca substituem esse estado. O servidor não confia apenas nas
instruções: valida esquemas, relações, revisão e autorização antes de gravar. O
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
3. registrar mapa e Partes em lotes pequenos, sem cards;
4. para cada microssequência, ler o slice e recuperar somente o knowledge
   pertinente;
5. gravar a análise; quando Auto precisar de conjunto novo, propor facetas,
   persistir referências exatas em um `ResourceSet` e só então criar o
   assignment;
6. resolver o snapshot efetivo;
7. descobrir somente packages autorizados por `workspaceId` e `snapshotRef`,
   percorrendo facetas, lista curta, inspeção e exatamente um contrato por
   chamada;
8. ligar análise, snapshot, requisitos e seleções no blueprint v2;
9. compor cards em memória, validar e auditar a representação, persistir e
   reler o estado;
10. registrar o manifesto factual depois da releitura;
11. auditar conteúdo e representação em rodada separada, corrigir somente
   achados autorizados e reauditar;
12. estudar o que já está pronto em Trilhas e fixar artefato somente quando
   houver submissão ou publicação.

“Parte” é uma unidade de organização da conversa; “microssequência” é a unidade
didática e técnica que recebe cards. A diferença permite produzir cursos
extensos sem enviar toda a árvore a cada turno. Uma Parte já autorizada avança
microssequência por microssequência sem pedir confirmação automática; decisão
humana volta a ser necessária quando o mandato ou uma escolha material exigir.

As operações de desenho são agrupadas em `gerirDesenhoInstrucional`:
`read_slice`, consulta de contrato promovido, gravação de análise, criação ou
remoção de assignment, persistência de `ResourceSet`, resolução efetiva,
binding do blueprint e registro do manifesto. Isso evita ferramenta genérica e
permite que uma nova sessão retome o trabalho sem memória da conversa.

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

As instruções e o conhecimento em `authoring/` são fontes versionadas. Para os
seis contratos de desenho parametrizado, a fonte canônica é
`src/authoring/instructionalDesignContracts.js`; os respectivos JSONs em
`authoring/schemas/` são gerados e não devem ser editados diretamente. Para
regenerar somente esses schemas, execute:

```powershell
npm run authoring:schemas
```

Os pacotes distribuídos em `docs/downloads/authoring/` também são derivados e
não devem ser editados diretamente. Depois de qualquer alteração em instruções,
conhecimento ou contratos, regenere-os com o procedimento canônico:

```powershell
npm run authoring:packages
```

Esse comando sincroniza primeiro os schemas de desenho e depois produz os
arquivos de conhecimento, o prompt, a especificação OpenAPI, manifests,
checksums e arquivos compactados para cada plataforma. A chamada direta ao
script de build recusa schemas divergentes, para que um artefato nunca seja
empacotado com contratos obsoletos.

## Validação

Execute:

```powershell
npm run test:authoring-packages
node --test tests/runtime/authoring-guidance-regression.test.js
npm run audit:docs
npm run lint
```

O primeiro comando verifica paridade, tamanho e integridade dos pacotes. A
validação também recusa os seis schemas de desenho quando eles divergem da fonte
JavaScript canônica. A regressão JIT cobre cenários determinísticos de
engenharia; não valida aprendizagem ou adequação pedagógica. A auditoria
documental confere links, estrutura e afirmações obsoletas. O lint detecta erros
estáticos. Durante a sequência de Autoria, cada issue executa testes
proporcionais ao escopo; a regressão integral é concentrada no fechamento da
#109.

Exemplos em [`examples/`](examples/) servem para aprender o formato, não como
credenciais nem como dados de produção. Segredos administrativos nunca devem
entrar em prompts, pacotes, APKs ou repositórios.
