# Arquitetura do AraLearn

## Leitura correta

O AraLearn não foi desenhado para enviar um pedido livre a uma LLM e aceitar sua resposta como produto final. Sua arquitetura procura deslocar parte da inteligência do modelo para o sistema: contratos, hierarquia, ingestão, governança da lição, artefatos intermediários, auditoria e aplicação controlada.

Essa é a chave para entender o projeto.

## Estrutura pública

O contrato público do AraLearn organiza o projeto em:

```text
projeto -> curso -> módulo -> lição -> microssequência -> card
```

Essa estrutura serve ao mesmo tempo para navegação, persistência, contextualização do pedido e controle didático. O modelo não responde “sobre qualquer coisa”; ele responde sobre um ponto situado na hierarquia.

## Camadas principais

### Core didático

O core didático define invariantes pedagógicas do produto:

- o que conta como microssequência;
- quais funções didáticas ela pode cumprir;
- que lacunas, redundâncias ou pressupostos ocultos devem ser combatidos;
- como prática, explicação, contraste e revisão se articulam;
- como ler uma microssequência vazia, um rascunho e uma etapa pronta para estudo.

### Engine de produção

O motor de geração, hoje concentrado no `CourseForge`, executa fases pequenas, auditáveis e retomáveis. Ele trabalha com artefatos intermediários e permite separar:

- ingestão de fontes;
- interpretação da intenção;
- organização estrutural;
- planejamento local;
- auditoria;
- reparo;
- compilação de patch;
- validação e aplicação.

Essa lógica é próxima de specification-driven development: o sistema não pede apenas “gere conteúdo”, mas conduz uma sequência de transformações com contratos explícitos.

### Runtime de providers

Os providers cuidam de transporte e execução operacional:

- envio de prompt e anexos;
- adaptação ao modelo;
- retries, timeout e fallback;
- integração por API;
- integração local via `Codex CLI`.

A camada de provider não deve decidir a didática.

### Runtime de estudo e edição local

O runtime da microssequência é a superfície em que o usuário estuda e intervém. Ali o produto materializa, corrige, expande, edita ou reformula conteúdo já situado dentro de uma trilha.

Esse runtime é parte central da arquitetura, não um acessório de interface.

## Governança da lição

A lição é o ponto mais importante de governança didática do contrato público. É nela que o produto concentra orientação mais fina sobre escopo, notação, limites, passos esperados, erros comuns, foco de prática e domínio conceitual.

Essa governança aparece sobretudo por meio de:

- `sourceGuideStructured`;
- `presetId`;
- tags didáticas;
- `domainMap`.

Curso e módulo fornecem moldura estrutural mais ampla; a lição fornece o contexto didático local mais decisivo.

## Ingestão e parsing

Antes de envolver o modelo, o AraLearn procura extrair e normalizar o texto das fontes. Isso reduz custo, ruído e fragilidade. O projeto já usa parsers open source como:

- `pdfjs-dist`, para PDF;
- `mammoth`, para `DOCX`.

O objetivo não é reconstrução visual completa, e sim grounding textual suficientemente bom para organização pedagógica.

## Fluxo estrutural

Quando o usuário quer organizar material amplo, o AraLearn gera uma trilha estrutural auditada: cursos, módulos, lições e microssequências planejadas. O valor principal desse fluxo está em produzir ordem, não em pré-materializar todo o curso em cards.

Por isso, microssequências podem nascer vazias e ainda assim serem plenamente válidas como parte da arquitetura pedagógica.

## Fluxo local

Quando o usuário já está no estudo concreto, o problema é outro: uma dúvida localizada, um contraste ausente, um card ruim, uma prática insuficiente, uma formulação confusa. Nesse caso, o AraLearn aciona a geração local, sempre dentro da trilha já planejada.

Esse fluxo preserva o restante do percurso e opera por patch mínimo.

## Artefatos internos

A arquitetura usa artefatos explícitos para não depender apenas de texto solto. Entre eles estão:

- `SourceLedger`;
- `CourseIntent`;
- `AssessmentProfile`;
- `CourseGraph`;
- `LessonGovernance`;
- `MicrosequencePlan`;
- `CardPlan`;
- `AuditFinding`;
- `RepairAction`;
- `Patch`;
- `InterventionRequest`;
- `InterventionPlan`.

Esses artefatos não existem para burocratizar o produto, e sim para tornar o comportamento verificável.

## Auditoria

O AraLearn não parte da suposição de que a primeira resposta do modelo já é didaticamente adequada. A arquitetura prevê auditoria sobre:

- alinhamento estrutural;
- coerência didática;
- grounding mínimo na fonte;
- lacunas ou pressupostos ocultos;
- desvios de escopo;
- defeitos localmente inaceitáveis.

Quando necessário, o sistema repara antes de aplicar.

## O que o usuário vê e o que a LLM vê

O usuário vê cursos, lições, microssequências, cards, botões de ação, histórico e superfícies de edição. A LLM, por sua vez, recebe um recorte muito mais controlado: contexto hierárquico, governança da lição, pedido do usuário, artefatos resumidos, contratos e limites da operação.

Essa diferença é essencial. A boa experiência pública do AraLearn depende de forte preparação privada do problema.

## Documentos complementares

- [Visão do produto](visao-do-produto.md)
- [Assistência por IA generativa](assistencia-por-ia.md)
- [Contrato público](aralearn-contract.md)
- [Arquitetura-alvo](arquitetura-alvo.md)
