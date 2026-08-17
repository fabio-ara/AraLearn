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
- **pacote de recurso (`package`)**: módulo que reúne contrato, validação e
  renderização de uma representação ou interação didática;
- **núcleo (`kernel`)**: camada que organiza Unidades de estudo e packages sem
  incorporar as regras internas de cada representação.

O [glossário técnico](glossario-tecnico.md) reúne definições mais amplas e
remissões para os capítulos correspondentes.

O sistema separa oito responsabilidades:

| Contrato | Responsabilidade |
|---|---|
| `aralearn.course.v1` | documento didático completo ou recortado |
| envelope de Unidade de estudo | composição de conteúdo, resposta e feedback |
| contrato de cada pacote de recurso (`package`) | dados próprios de uma representação ou interação |
| `aralearn.resource-library.v1` | descoberta, inspeção e validação do catálogo de pacotes |
| `aralearn.course-sources.v1` | catálogo privado, revisões, Âncoras e atribuições de Fontes na Autoria |
| `aralearn.course-source-change.v1` | recibo estrito de uma mutação de Fonte, Âncora ou atribuição |
| `aralearn.course-study-citations.v1` | projeção redigida e sob demanda das citações visíveis no Estudo |
| `aralearn.course-anchored-annotation-page.v1`, `aralearn.course-anchored-annotation.v1` e `aralearn.course-anchored-annotation-change.v1` | página, item protegido e recibo de Anotações ancoradas |

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

`scope` é opcional e, quando presente, vale `course`, `module`, `lesson` ou `microsequence`. `courses` continua sendo uma lista mesmo quando o recorte contém um único curso. Essa regularidade permite que as mesmas ferramentas componham e validem documentos completos e recortes sem criar envelopes paralelos.

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
estrito: produtores e consumidores rejeitam esse campo; não há alias, fallback
ou leitura dupla do formato anterior.

Uma instância de `content`, `response` ou `feedback` tem:

```json
{
  "id": "instancia-na-unidade",
  "package": "aralearn.resource.paragraph",
  "version": "1.0.0",
  "data": {}
}
```

O kernel conhece `id`, `package`, `version` e o slot ocupado. O package conhece
`data`. Essa fronteira é implementada em
`src/resources/kernel/studyUnitEnvelope.js` e
`src/resources/kernel/packageRegistry.js`.

### Por que a pergunta não deve ser duplicada

Uma resposta `choice` já contém o estímulo e as alternativas quando esse é seu contrato. Repetir a mesma pergunta num `paragraph` cria dois focos, aumenta o custo de leitura e permite divergência durante edição. O validador de composição rejeita padrões conhecidos de duplicação; conteúdo adicional só deve existir quando fornece contexto necessário que não pertence à resposta.

## 4. Fontes, Âncoras e atribuições fora do envelope

Uma Fonte possui identidade estável e revisões append-only. Uma Âncora aponta
para uma revisão exata por página, tempo, fragmento URI ou trecho textual. A
atribuição registra, em ordem, quais revisões e Âncoras sustentam um item do
plano ou uma Unidade de estudo e qual relação foi declarada:
`informed_by`, `supported_by`, `adapted_from` ou `quoted_from`.

Toda atribuição nova não vazia exige ao menos uma Âncora ativa da revisão exata
para cada Fonte. O limite de escrita é 32 Fontes por alvo e oito identidades de
Âncora por revisão de Fonte. Salvar substitui o conjunto completo sob revisão esperada do Curso e
versão exata do alvo; o histórico permanece append-only.

Referências anteriores ao contrato são preservadas, na mesma identidade e
ordem, como `legacy_reference`. Enquanto não resolvidas, têm estado
`unresolved_legacy`, metadados nulos, visibilidade `hidden` e podem não possuir
Âncora. Resolver significa acrescentar uma revisão ativa sob a identidade
literal existente, inclusive seus espaços; não significa criar uma Fonte
paralela nem inventar metadados.

O catálogo owner-only usa `aralearn.course-sources.v1` e pagina os modos
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

### Anotações ancoradas fora do conteúdo e do estado pessoal

Uma Anotação ancorada liga uma manifestação a Curso, Módulo, Lição, Tópico,
Microssequência didática ou Unidade de estudo. Há N registros por ator e alvo;
os estados são somente `open`, `considered`, `resolved` e `withdrawn`. Origem e
canal formam pares coerentes entre pessoa autora, estudante, auditoria humana,
auditoria automática e legado desconhecido. As superfícies correntes criam
apenas origens autorais ou estudantis.

Texto bruto aceita 2.000 escalares Unicode e 16 KiB em UTF-8; síntese breve,
500/4 KiB; resposta do proprietário, 2.000/16 KiB. A classificação automática
usa `exact_topic_target` somente quando o alvo é exatamente um Tópico. Os demais
alvos usam `target_scope_unclassified`, o legado pode usar
`legacy_unclassified` e uma escolha humana posterior usa
`human_topic_selection` sem substituir o fato automático.

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
o Curso para manter monotonicidade do cache e não entra no TTL de conteúdo,
tombstone ou recibo. Nenhum contador avança a revisão de
conteúdo em revisão de texto, resposta ou mudança de estado. Criação e correção
de assuntos também confrontam a revisão do Curso. O servidor limita 128 linhas
correntes por ator/Curso/alvo, 512 por ator/Curso e 256 versões ou eventos em
operações ordinárias; retirada e exclusão de conta permanecem possíveis no
teto.

Retirada redige texto, síntese e resposta imediatamente. Tombstones e recibos
expiram logicamente em até 14 dias: deixam de ser legíveis, pagináveis, contar
quota ou admitir replay. A limpeza física é oportunista durante
leituras/mutações do Curso e processa por toque um lote de até 128 tombstones e
256 recibos expirados; Curso inativo pode conservar lixo físico porque não há
cron nem prazo de hard delete.
Eventos
guardam hashes e metadados pequenos, nunca o texto anterior. Categoria,
resposta, resolução e timestamps não autorizam inferência de aprendizagem,
dificuldade, atenção, qualidade ou eficácia.

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
contrato final `aralearn.course.v1`; não existe alias para o nome substituído.
A implementação está em `src/resources/kernel/courseContract.js`.

Ter uma fronteira unitária explícita é preferível a inferir que qualquer objeto semelhante a curso está completo. A consequência é que o chamador precisa escolher deliberadamente o envelope adequado.

## 6. Contratos próprios dos packages

Cada package fornece:

- manifest com id, versão, propósito e slots;
- operações-alvo das tarefas e taxonomia acadêmica;
- adequações, contraindicações, limitações e acessibilidade;
- contrato autoral de alto nível e exemplo;
- schema de `data`;
- normalização e validação semântica;
- renderer e texto acessível;
- alvos textuais editáveis;
- alvos de prática quando pode receber lacuna ou digitação;
- avaliador quando ocupa `response`;
- hidratação opcional quando há interação pós-renderização.

### Decisão de alto nível

O contrato autoral descreve objetos do domínio, não coordenadas de desenho. Um grafo recebe vértices e arestas; um gráfico estatístico recebe variáveis, séries e intervalos; uma matriz recebe células algébricas. O renderer especializado calcula geometria e notação.

A alternativa seria pedir ao autor ou ao modelo que produzisse SVG, HTML ou posições. Isso aumentaria ambiguidades, permitiria sobreposição e acoplaria conteúdo a uma largura de tela. O custo da decisão adotada é construir um package competente para cada convenção que não possa ser representada adequadamente por outro.

## 7. Protocolo `aralearn.resource-library.v1`

Esse protocolo descreve o catálogo de packages, não o conteúdo didático. Ele oferece descoberta progressiva:

1. `explore`: famílias e facetas instaladas;
2. `search`: candidatos ranqueados por intenção e restrições;
3. `inspect`: comparação de até oito perfis;
4. `contracts`: exatamente um contrato versionado por chamada;
5. `validate_study_unit`: forma, referências e composição, recebida em
   `studyUnitJson`;
6. `audit_representation`: ajuste semântico, affordance da resposta e legibilidade do feedback;
7. `preview_study_unit`: capacidade de abrir a composição no renderer.

`preview_study_unit` e `audit_representation` retornam `rendered: false`: não
fingem simular viewport, Graphviz, Vega ou hidratação. Uma prévia geométrica
exige o runtime real do aplicativo.

### Taxonomia e cobertura

Os tokens `canonical`, `versatile` e `substitute` são resultados do algoritmo de cobertura:

- `canonical`: package específico para as facetas pedidas;
- `versatile`: representação geral que preserva a intenção;
- `substitute`: melhor aproximação disponível, com alguma perda declarada.

Nesse protocolo, `canonical` não certifica consenso universal da área acadêmica. A evidência para escolher um package continua sendo seu propósito, convenções, contraindicações e exemplo.

Cobertura não é autorização. A política de componentes efetiva fixa a revisão
do catálogo, a disponibilidade `all|allow_only`, as exclusões e as
preferências. Exclusão vence; preferência apenas desempata entre packages ainda
permitidos e semanticamente adequados. Na materialização, o backend confronta
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

Essa sequência economiza contexto: o modelo recebe descrições e apenas os schemas que efetivamente usará. Carregar todos os contratos de uma vez seria simples para um catálogo pequeno, mas cresce linearmente e dificulta distinguir candidatos próximos.

Packages complementares podem coexistir na mesma Unidade quando cada um cumpre uma função necessária, como fórmula e gráfico. A prática possui uma única resposta formal, embora possa usar múltiplos conteúdos e feedbacks. O validador rejeita slots ou compatibilidades inválidos.

## 9. Curso vivo e completude

O documento não carrega estados burocráticos como “rascunho”, “pronto” ou
“publicado”. Uma Microssequência com Unidades válidas já é estudável; uma
Microssequência sem Unidades pode permanecer como parte do planejamento
visível.

O runtime corrente não oferece publicação pública. Estudo, Autoria e MCP operam
o mesmo Curso vivo, cuja composição relacional é validada sem mudar de
identidade por um rótulo editorial.

## 10. Limites e verificação

Validação estrutural não demonstra qualidade pedagógica, correção científica ou legibilidade em qualquer viewport. Auditoria semântica também depende de critérios implementados e não substitui revisão humana especializada. Por isso o fluxo combina:

- testes do kernel e dos packages;
- validação do documento recomposto;
- galeria visual e testes de interação;
- auditoria pedagógica da microssequência;
- revisão situada e possibilidade de correção.

Consulte [Componentes didáticos e packages](componentes-didaticos.md), [Autoria por
MCP](autoria-mcp.md) e [Matriz de conformidade técnica](matriz-conformidade-tecnica.md).
