# Contratos públicos de conteúdo

Um **contrato de dados** define a forma, os significados e os invariantes que
produtores e consumidores compartilham. No AraLearn, ele permite que a
aplicação, o banco de dados e as ferramentas de autoria evoluam sem interpretar
o mesmo documento de maneiras incompatíveis.

## Vocabulário de entrada

- **JavaScript Object Notation (JSON)**: formato textual estruturado usado para
  intercambiar os documentos de conteúdo;
- **esquema (`schema`)**: conjunto de regras legíveis por programa que descreve
  os campos e valores admitidos por um documento;
- **pacote de componente (`package`)**: módulo que reúne contrato, validação e
  renderização de uma representação ou interação didática;
- **núcleo (`kernel`)**: camada que organiza Unidades de estudo e pacotes sem
  incorporar as regras internas de cada representação.

O [glossário técnico](glossario-tecnico.md) reúne definições mais amplas e
remissões para os capítulos correspondentes.

O preparo de upload de PDF usa o contrato autenticado; a abertura usa o contrato
temporário de leitura. As projeções minimizadas dos clientes conectados e as
credenciais OAuth confinadas descritas abaixo integram o ambiente hospedado.

Alguns identificadores dessas projeções conservam o prefixo histórico `mcp-`.
O nome do envelope não limita seu transporte: MCP e Actions consomem a mesma
forma minimizada pelo executor compartilhado. Quando há envio de dado sensível,
`dataDisclosure` distingue o cliente MCP do GPT conectado por Actions.

O sistema separa responsabilidades de conteúdo, proveniência, observação e
auditoria:

| Contrato | Responsabilidade |
|---|---|
| `aralearn.course.v1` | documento didático completo ou recortado |
| envelope de Unidade de estudo | composição de conteúdo, resposta e feedback |
| contrato de cada pacote de componente (`package`) | dados próprios de uma representação ou interação |
| `aralearn.resource-library.v1` | descoberta, inspeção e validação do catálogo de pacotes |
| `aralearn.course-sources.v1` | catálogo privado, revisões, Âncoras e atribuições de Fontes na Autoria |
| `aralearn.course-source-change.v1` | recibo estrito de uma mutação de Fonte, Âncora ou atribuição |
| `aralearn.course-source-attachment-access.v1` | abertura temporária de PDF privado |
| `aralearn.course-source-attachment-access.v2` | preparação de envio autenticado de PDF privado de uma Fonte |
| `aralearn.mcp-course-sources.v1` | projeção autoral de Fontes para MCP ou Actions, sem identidades pessoais, resumo interno do alvo nem caminhos do Storage |
| `aralearn.mcp-course-source-attachment-access.v1` | metadados do anexo e, somente após declaração explícita, URL assinada de 60 segundos para o cliente conectado |
| `aralearn.course-access-grant-request.v1` | confirmação imediata e genérica de uma solicitação de acesso ao Estudo |
| `aralearn.course-study-citations.v1` | projeção redigida e sob demanda das citações visíveis no Estudo |
| `aralearn.course-anchored-annotation-page.v1`, `aralearn.course-anchored-annotation.v1` e `aralearn.course-anchored-annotation-change.v1` | página, item protegido e recibo de Anotações ancoradas |
| `aralearn.mcp-anchored-annotation-page.v1` e `aralearn.mcp-anchored-annotation-change.v1` | projeção minimizada para MCP ou Actions, sem referência protegida, caminhos ou texto comum |
| `aralearn.course-audit-context.v1` | contexto focal corrente que pode ser auditado |
| `aralearn.course-instructional-audit-run.v1`, `aralearn.course-audit-finding.v1` e `aralearn.course-authoring-correction.v1` | rodada imutável, achado versionado e ponto de controle da correção |
| `aralearn.course-audit-cycle-page.v1` e `aralearn.course-audit-cycle-change.v1` | leitura paginada/detalhada e recibo estrito do ciclo |
| `aralearn.course-variant-comparison.v1`, `aralearn.course-variant-comparison-list.v1` e `aralearn.course-variant-comparison-change.v1` | comparação, listagem e mudança de Variantes independentes |
| `aralearn.course-authoring-analytics.v1` e `aralearn.course-authoring-analytics-export.v1` | fatos, métricas e exportação da área Pesquisa |

Essa separação evita um esquema monolítico: acrescentar uma representação não
exige alterar o núcleo, e consultar o catálogo não exige enviar todos os
contratos ao modelo.

## 1. Forma, semântica e versão

Validar um documento não é apenas conferir nomes de campos. Há três camadas:

1. **forma**: tipos, campos obrigatórios e valores permitidos;
2. **semântica**: relações como posições coerentes, ids únicos e dependências sem ciclo;
3. **composição**: compatibilidade entre pacotes de conteúdo, resposta e
   feedback.

Os pacotes usam [versionamento semântico](https://semver.org/), convenção que
expressa a natureza de uma mudança por três números. O par `package@version`
identifica um contrato exato. Uma versão nova não substitui silenciosamente a
antiga numa instância já materializada.

Os esquemas se inspiram no vocabulário de [JSON Schema](https://json-schema.org/draft/2020-12), mas `src/resources/kernel/schemaValidation.js` implementa apenas o subconjunto necessário aos pacotes instalados. Portanto, não se deve supor suporte a qualquer palavra-chave do padrão.

## 2. Documento `aralearn.course.v1`

O documento é a unidade de intercâmbio e validação da composição:

```json
{
  "contract": "aralearn.course.v1",
  "scope": "course",
  "courses": []
}
```

`scope` é opcional e, quando presente, vale `course`, `module`, `lesson` ou `microsequence`. `courses` continua sendo uma lista mesmo quando o recorte contém um único Curso. Essa regularidade permite que as mesmas ferramentas componham e validem documentos completos e recortes sem criar envelopes paralelos. No modelo relacional, cada item dessa lista corresponde a uma única raiz de Curso; Estudo, Autoria, API de Cursos, MCP e Actions preservam essa identidade.

A hierarquia é:

```text
courses[]
└── modules[]
    └── lessons[]
        ├── topics[]
        └── microsequences[]
            └── studyUnits[]
```

### Curso, módulo e lição

- curso: `id`, `title`, `goal`, `modules`;
- módulo: `id`, `title`, `guide`, `lessons`;
- lição: `id`, `title`, `guide`, `topics`, `microsequences`.

Um `guide` declara `goal`, `include`, `exclude`, `notation` e `avoid`. Ele delimita a intenção de autoria: o que deve ser ensinado, o que fica fora do recorte, qual notação será adotada e quais erros de elaboração devem ser evitados.

Tópicos usam `id`, `label`, `kind`, `checks` e `errors`. `kind` vale `concept`, `procedure`, `representation` ou `term`. A distinção permite planejar se a aprendizagem exige compreender uma ideia, executar uma operação, ler uma forma de representação ou dominar vocabulário.

### Microssequência

Uma microssequência exige `id`, `title`, `goal`, `role`, `dependsOn`, `covers`, `checks` e `studyUnits`; `errors` e `branchOf` são opcionais. `role` vale:

- `explain`: construir entendimento;
- `practice`: exercitar operações;
- `review`: recuperar e integrar;
- `support`: fornecer uma passagem auxiliar diante de dificuldade.

`dependsOn` aponta apenas para microssequência anterior da mesma lição e não pode formar ciclo. Essa restrição impede que a progressão declarada seja impossível de percorrer. Identidades estruturais são únicas nos escopos comparados pelo validador.

### Evidência normativa

`src/domain/aralearnProject.js` valida o documento e
`src/domain/courseEntities.js` realiza o roundtrip relacional. Os testes de
contrato precisam ser consultados junto com ambos: uma descrição de forma não
expressa sozinha todas as relações semânticas.

## 3. Envelope de Unidade de estudo

Toda Unidade de estudo tem esta moldura:

```json
{
  "id": "study-unit-id",
  "position": 1,
  "title": "Título curto",
  "role": "theory",
  "content": [],
  "response": null,
  "feedback": [],
  "topics": []
}
```

`position` é inteiro positivo e acompanha a ordem real no recipiente. `role` vale `theory` ou `practice`.

- Unidade de teoria: ao menos uma instância em `content` e `response: null`;
- Unidade de prática: exatamente uma instância em `response`; `content` pode ficar vazio quando a própria resposta contém todo o estímulo;
- `feedback` e `topics`: sempre listas;
- ids de instância: únicos dentro da Unidade.

`sources` não pertence ao envelope nem ao conteúdo de uma Unidade. O corte é
estrito: produtores e consumidores rejeitam esse campo; não há nome alternativo
nem leitura dupla do formato anterior.

Uma instância de `content`, `response` ou `feedback` tem:

```json
{
  "id": "instancia-na-unidade",
  "package": "aralearn.resource.paragraph",
  "version": "1.0.0",
  "data": {}
}
```

O núcleo conhece `id`, `package`, `version` e o espaço ocupado. O pacote conhece
`data`. Essa fronteira é implementada em
`src/resources/kernel/studyUnitEnvelope.js` e
`src/resources/kernel/packageRegistry.js`.

### Por que a pergunta não deve ser duplicada

Uma resposta `choice` já contém o estímulo e as alternativas quando esse é seu contrato. Repetir a mesma pergunta num `paragraph` cria dois focos, aumenta o custo de leitura e permite divergência durante edição. O validador de composição rejeita padrões conhecidos de duplicação; conteúdo adicional só deve existir quando fornece contexto necessário que não pertence à resposta.

## 4. Fontes, Âncoras e atribuições fora do envelope

Uma Fonte possui identidade estável e revisões somente por acréscimo. Uma Âncora aponta
para uma revisão exata por página, tempo, fragmento URI ou trecho textual. A
atribuição registra, em ordem, quais revisões e Âncoras sustentam um item do
plano ou uma Unidade de estudo e qual relação foi declarada:
`informed_by`, `supported_by`, `adapted_from`, `quoted_from`,
`contrasted_with`, `exemplified_by`, `inspired_by` ou `needs_verification`.

Toda atribuição nova não vazia exige ao menos uma Âncora ativa da revisão exata
para cada Fonte. O limite de escrita é 32 Fontes por alvo e oito identidades de
Âncora por revisão de Fonte. Salvar substitui o conjunto completo sob revisão esperada do Curso e
versão exata do alvo; o histórico permanece somente por acréscimo.

Referências anteriores ao contrato são preservadas, na mesma identidade e
ordem, como `legacy_reference`. Enquanto não resolvidas, têm estado
`unresolved_legacy`, metadados nulos, visibilidade `hidden` e podem não possuir
Âncora. Resolver significa acrescentar uma revisão ativa sob a identidade
literal existente, inclusive seus espaços; não significa criar uma Fonte
paralela nem inventar metadados.

O catálogo exclusivo do proprietário usa `aralearn.course-sources.v1` e pagina os modos
`catalog`, `source` e `target` sob a revisão esperada. O Estudo não recebe esse
catálogo. Ao abrir Fontes numa Unidade, ele solicita
`aralearn.course-study-citations.v1`: Fontes ocultas ou ainda não resolvidas são
omitidas, `citation` não entrega URL e `citation_and_link` pode entregá-la. A
projeção não contém trecho privado de verificação, ator, canal nem histórico.

Uma escrita geral de composição declara exatamente uma aplicação de
atribuição para cada Unidade incluída ou substituída, mesmo vazia, na mesma
transação das entidades. Uma etapa de materialização só pode aplicar Fontes e
Âncoras seladas a partir dos itens do plano e confirma conteúdo, atribuições,
evento e recibo atomicamente.

`prepare_upload` emite somente
`aralearn.course-source-attachment-access.v2`. A resposta devolve o caminho e
uma intenção privada de dez minutos, com `signedUrl` e `expiresAt` nulos. O
navegador faz POST autenticado no bucket; a política exige sessão viva e
consome a intenção na inserção. O backend não emite v1 para essa operação e não
restaura uma URL assinada de upload. Uma URL de download já emitida continua
independente da sessão até expirar; o inventário registra essa janela.

`download` emite `aralearn.course-source-attachment-access.v1`, com URL assinada
de 60 segundos. O normalizador aceita v1 somente quando a operação é `download`;
o upload usa v2 e falha de modo fechado diante de envelope incompatível. A
seleção não inspeciona `User-Agent`. Uma URL de download emitida não pode ser
revogada individualmente antes de expirar.

MCP e Actions não recebem o contrato interno de Fontes. A projeção
`aralearn.mcp-course-sources.v1` omite ator, identidade de atribuição, resumo do
alvo, Curso de origem do objeto e caminho do Storage. Preparar upload permanece
exclusivo da aplicação autenticada. O download por um cliente conectado exige
`includeAttachmentDownloadUrl: true` antes de acessar o adaptador e responde
com `aralearn.mcp-course-source-attachment-access.v1`; `dataDisclosure` registra
que a URL incluída é uma credencial temporária de 60 segundos e identifica como
destinatário o cliente MCP ou o GPT conectado por Actions. No detalhe de Fontes,
o disclosure enumera título, autoria declarada, identificador, citação, endereço,
edição ou versão, trecho de verificação e valores textuais dos seletores
`text_quote` e `uri_fragment` como texto livre potencialmente pessoal, conforme
os tipos de seletor efetivamente presentes.

### Solicitação de acesso sem resposta enumerável

`aralearn.course-access-grant-request.v1` contém apenas `courseId`, a operação
`grant_access`, `accepted: true` e a indicação de repetição idempotente. A
resposta imediata tem a mesma forma para conta existente, inexistente, própria,
já favorecida ou tentativa limitada. Cada ator pode fazer dez tentativas em dez
minutos; os contadores agregados não guardam e-mail nem resumo criptográfico do
e-mail.

Esse contrato reduz o oráculo na chamada de concessão, mas não torna a relação
futura indistinguível. O proprietário autorizado pode reler a lista de Pessoas
e perceber que um acesso passou a existir. Esse é um risco residual aceito da
gestão direta corrente; o contrato não cria convite pendente nem outra entidade
para ocultá-lo.

### Credencial de recurso do MCP

Os metadados OAuth anunciam exatamente o escopo
`offline_access`. A troca do código e a renovação emitem access token e refresh
token, sem `id_token`. O access token é uma credencial para o recurso MCP, não
uma sessão reutilizável da aplicação: `sub` e `session_id` são aliases pareados,
distintos entre si e derivados para o cliente OAuth, sem UUID da pessoa,
metadados do perfil ou e-mail.

O JWT ainda contém `aralearn_session_id`, o UUID real da sessão de origem usado
exclusivamente na resolução de vida pelo servidor. Esse identificador técnico é
correlacionável e continua sendo dado pessoal ou pseudonimizado; portanto, a
credencial inteira não é anônima nem plenamente desvinculável entre clientes que
partam da mesma sessão. Ela permanece um segredo e nunca integra respostas ou
logs públicos.

A Edge Function verifica a assinatura ES256 com chave EC P-256 publicada na
JWKS do emissor, além de emissor, destinatário, tempos, cliente e escopo exato.
Depois, uma função SQL exclusiva do papel de serviço resolve a pessoa a partir
da sessão de origem e exige que sessão, cliente e consentimento OAuth ainda
estejam vivos. O mesmo bearer é recusado quando usado diretamente no GoTrue, na
API de dados ou no Storage.

Consentimentos e sessões OAuth encerrados não renovam acesso. Um token já
emitido permanece criptograficamente válido somente até `exp`. O roteiro de
verificação está em [Implantação](implantacao.md).

### Anotações ancoradas fora do conteúdo e do estado pessoal

Uma Anotação ancorada liga uma manifestação a Curso, Módulo, Lição, Tópico,
Microssequência didática, Unidade de estudo, Fonte ou Âncora. Há N registros por
ator e alvo; os estados são somente `open`, `considered`, `resolved` e
`withdrawn`. Origem e
canal formam pares coerentes entre pessoa autora, estudante, auditoria humana,
auditoria automática e legado desconhecido. As superfícies correntes criam
apenas origens autorais ou estudantis.

Texto bruto aceita 2.000 escalares Unicode e 16 KiB em UTF-8; síntese breve,
500/4 KiB; resposta do proprietário, 2.000/16 KiB. A classificação automática
usa `exact_topic_target` somente quando o alvo é exatamente um Tópico. Os demais
alvos usam `target_scope_unclassified`, o legado pode usar
`legacy_unclassified` e uma escolha humana posterior usa
`human_topic_selection` sem substituir o fato automático.

Uma resposta usa `answer` sem lista de Fontes consideradas ou `reformulation`
com ao menos uma revisão vigente de Fonte e suas Âncoras. Assim, a reformulação
preserva a base consultada sem copiar o documento de referência para a
Anotação.

Leituras `inbox`, `target` e `detail` usam até 24 itens, cursor opaco de até 240
caracteres e resposta de até 256 KiB. O item informa caminho observado e
corrente, certeza da revisão observada, classificação, capacidades e link
profundo. Ao proprietário, `contributor` é um `protected_person` com papel e
pseudônimo aleatório persistido `person-` + 16 hex, não derivado do UUID ou do
Curso. A interface mostra apenas seu `label`
pseudônimo protegido, nunca `ref`, UUID ou e-mail. Cada estudante recebe
somente os próprios registros.

O estado pessoal v2 continua limitado a `progress` e `reviewMarks`.
`courses.annotation_set_version` é o contador global entregue ao proprietário;
Estudo recebe no mesmo campo de DTO um contador monotônico privado por pessoa e
Curso. A versão privada contém somente coordenação, sem texto ou autoridade de
domínio, e não muda por atividade alheia. Ela permanece até excluir a pessoa ou
o Curso para manter a monotonicidade da cópia local e não se sujeita aos prazos
de expiração de conteúdo, registros de retirada ou recibos. Nenhum contador avança a revisão de
conteúdo em revisão de texto, resposta ou mudança de estado. Criação e correção
de assuntos também confrontam a revisão do Curso. O servidor limita 128 linhas
correntes por ator/Curso/alvo, 512 por ator/Curso e 256 versões ou eventos em
operações ordinárias; retirada e exclusão de conta permanecem possíveis no
teto.

Retirada redige texto, síntese e resposta imediatamente. Registros de retirada
e recibos expiram logicamente em até 14 dias: deixam de ser legíveis,
pagináveis, contar cota ou admitir repetição. A limpeza física é oportunista durante
leituras ou mutações do Curso e processa, a cada operação, até 128 registros de
retirada e 256 recibos expirados. Uma rotina diária também
processa até 512 linhas de cada classe e devolve contagens; assim a limpeza não
depende apenas de atividade no Curso. Anotações ativas e resolvidas continuam
sem expiração automática por idade.
Eventos guardam resumos criptográficos e metadados pequenos, nunca o texto
anterior. Categoria,
resposta, resolução e timestamps não autorizam inferência de aprendizagem,
dificuldade, atenção, qualidade ou eficácia.

### Auditoria e correções fora do conteúdo

O ciclo de auditoria também não entra em `aralearn.course.v1`. Um contexto
exclusivo do proprietário fixa a Unidade corrente, sua Microssequência, plano, parâmetros,
intenção representacional, Fontes/Âncoras e até 12 Anotações selecionadas. A
rodada registra verificações públicas nas dimensões estrutural, pedagógica, factual e
editorial; o servidor acrescenta a conformidade estrutural às três verificações
humanos.

O contrato interno pode conter o texto autorizado das Observações. A projeção
MCP o omite por padrão e só acrescenta `rawText` quando
`includeObservationText: true`; referência e rótulo protegidos, caminhos,
links, horários e texto da resposta autoral permanecem fora.

Rodadas são imutáveis e permanecem enumeráveis quando não geram achado. A
leitura `audit_cycle` usa `context|findings|runs|detail`; achados e rodadas são
paginados e aceitam filtro opcional pela Unidade. `detail` exige exatamente um
entre `findingId` e `auditRunId`, e o detalhe da rodada expõe todas as verificações e
evidências; a página separa a lista `runs` de `runDetail`. Achados e correções
preservam versões somente por acréscimo. Um
achado nasce apenas de resultado `failed|uncertain`; aplicar uma correção o move
para `awaiting_verification`, e outra rodada o leva a `resolved` ou novamente a
`open`. A correção v1 só altera o conteúdo próprio e as atribuições de Fontes
de uma Unidade existente, preserva `topics` legítimos e não cria, apaga, move,
reposiciona ou muda o pai. O ponto de controle `before|after` permite conferir a
aplicação e, enquanto o estado aplicado continuar exato, executar a reversão sem
apagar a história.

Uma conclusão factual positiva exige Fonte e Âncora atuais e ativas. A relação
`supported_by` sustenta afirmações; `quoted_from` é aceita somente pelo critério
de fidelidade de citação. Vincular uma Observação conserva a origem situada,
mas não a transforma em prova factual. Ações `resolve|reopen` devolvidas para
essas Observações são sugestões: outro comando explícito precisa executá-las.

A junção conserva apenas identidade e versão da Anotação. Retirada ainda
presente como registro de retirada é projetada indisponível e sem link; a remoção
física remove somente o vínculo e seu identificador por exclusão em cascata. Texto, pseudônimo e pessoa não
são copiados, e rodada, achado e correção permanecem.

Leituras do ciclo são limitadas a 24 itens, cursor de 240 caracteres e 240 KiB.
Comandos aceitam até 192 KiB; estados registrados, 48 KiB; pontos de controle, 96 KiB; recibos,
64 KiB. Há até 12 Observações selecionadas, 16 achados por rodada, 32 verificações,
256 rodadas com reserva, 1.024 identidades de achado, 64 correções por Curso e
oito por achado. Auditoria não possui réplica nem fila de envio no IndexedDB. O
contrato completo e seus limites estão em
[Auditoria e correções do Curso](auditoria-de-conformidade-instrucional.md).

## 5. Perfil unitário do mesmo contrato

O kernel também oferece uma fronteira unitária para validar um único Curso:

```json
{
  "contract": "aralearn.course.v1",
  "course": {}
}
```

Ela é útil em testes e operações unitárias. Não aceita `courses` e não é o
protocolo do catálogo. Tanto o perfil de intercâmbio quanto este perfil usam o
contrato final `aralearn.course.v1`; não existe nome alternativo para o termo substituído.
A implementação está em `src/resources/kernel/courseContract.js`.

Ter uma fronteira unitária explícita é preferível a inferir que qualquer objeto semelhante a curso está completo. A consequência é que o chamador precisa escolher deliberadamente o envelope adequado.

## 6. Contratos próprios dos pacotes

O catálogo corrente contém 32 pacotes, sendo 29 de conteúdo e três de resposta.
Cada pacote fornece:

- manifesto com identidade, versão, propósito e espaços admitidos;
- operações-alvo das tarefas e taxonomia acadêmica;
- adequações, contraindicações, limitações e acessibilidade;
- contrato autoral de alto nível e exemplo;
- esquema de `data`;
- normalização e validação semântica;
- renderizador e texto acessível;
- alvos textuais editáveis;
- alvos de prática quando pode receber lacuna ou digitação;
- avaliador quando ocupa `response`;
- ativação opcional quando há interação após a renderização.

### Decisão de alto nível

O contrato autoral descreve objetos do domínio, não coordenadas de desenho. Um grafo recebe vértices e arestas; um gráfico estatístico recebe variáveis, séries e intervalos; uma matriz recebe células algébricas. O renderizador especializado calcula geometria e notação.

A alternativa seria pedir ao autor ou ao modelo que produzisse SVG, HTML ou posições. Isso aumentaria ambiguidades, permitiria sobreposição e acoplaria conteúdo a uma largura de tela. O custo da decisão adotada é construir um pacote competente para cada convenção que não possa ser representada adequadamente por outro.

## 7. Protocolo `aralearn.resource-library.v1`

Esse protocolo descreve o catálogo de pacotes, não o conteúdo didático. Ele oferece descoberta progressiva:

1. `explore`: famílias e facetas instaladas;
2. `search`: candidatos ranqueados por intenção e restrições;
3. `inspect`: comparação de até oito perfis;
4. `contracts`: exatamente um contrato versionado por chamada;
5. `validate_study_unit`: forma, referências e composição, recebida em
   `studyUnitJson`;
6. `audit_representation`: ajuste semântico, possibilidade de resposta e legibilidade do retorno;
7. `preview_study_unit`: capacidade de abrir a composição no renderizador.

`preview_study_unit` e `audit_representation` retornam `rendered: false`: não
fingem simular a área visível, Graphviz, Vega ou ativação interativa. Uma prévia geométrica
exige o aplicativo real.

### Taxonomia e cobertura

Os tokens `canonical`, `versatile` e `substitute` são resultados do algoritmo de cobertura:

- `canonical`: pacote específico para as facetas pedidas;
- `versatile`: representação geral que preserva a intenção;
- `substitute`: melhor aproximação disponível, com alguma perda declarada.

Nesse protocolo, `canonical` não certifica consenso universal da área acadêmica. A evidência para escolher um pacote continua sendo seu propósito, convenções, contraindicações e exemplo.

Cobertura não é autorização. A política de componentes efetiva fixa a revisão
do catálogo, a disponibilidade `all|allow_only`, as exclusões e as
preferências. Exclusão vence; preferência apenas desempata entre pacotes ainda
permitidos e semanticamente adequados. Na materialização, o servidor confronta
as referências `package@version` realmente gravadas com a política selada.
Ausência de representação adequada permanece registrada e nunca vira
equivalência presumida.

## 8. Fluxo de autoria

O planejamento didático precede o contrato:

```text
objetivo e progressão
→ operação-alvo necessária à tarefa
→ política efetiva e busca por facetas
→ comparação da lista curta
→ carregamento dos contratos escolhidos
→ composição da Unidade de estudo
→ validação estrutural
→ auditoria semântica
→ prévia real quando necessária
→ gravação por CAS
```

Essa sequência economiza contexto: o modelo recebe descrições e apenas os esquemas que efetivamente usará. Carregar todos os contratos de uma vez seria simples para um catálogo pequeno, mas cresce linearmente e dificulta distinguir candidatos próximos.

Pacotes complementares podem coexistir na mesma Unidade quando cada um cumpre uma função necessária, como fórmula e gráfico. A prática possui uma única resposta formal, embora possa usar múltiplos conteúdos e retornos. O validador rejeita espaços ou compatibilidades inválidos.

## 9. Curso vivo e completude

O documento não carrega estados burocráticos como “rascunho”, “pronto” ou
“publicado”. Uma Microssequência com Unidades válidas já é estudável; uma
Microssequência sem Unidades pode permanecer como parte do planejamento
visível.

O aplicativo corrente não oferece publicação pública. Estudo, Autoria, API de Cursos, MCP e Actions operam
o mesmo Curso vivo, cuja composição relacional é validada sem mudar de
identidade por um rótulo editorial.

## 10. Limites e verificação

Validação estrutural não demonstra qualidade pedagógica, correção científica ou legibilidade em qualquer tamanho de tela. Auditoria semântica também depende de critérios implementados e não substitui revisão humana especializada. Por isso, a verificação inclui:

- testes do núcleo e dos pacotes;
- validação do documento recomposto;
- galeria visual e testes de interação;
- auditoria pedagógica da microssequência;
- revisão situada e possibilidade de correção.

Consulte [Componentes didáticos e pacotes](componentes-didaticos.md), [Autoria por
MCP](autoria-mcp.md) e [Matriz de conformidade técnica](matriz-conformidade-tecnica.md).
