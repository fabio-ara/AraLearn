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
- **núcleo (`kernel`)**: camada que organiza cards e pacotes sem incorporar as
  regras internas de cada representação.

O [glossário técnico](glossario-tecnico.md) reúne definições mais amplas e
remissões para os capítulos correspondentes.

O sistema separa quatro responsabilidades:

| Contrato | Responsabilidade |
|---|---|
| `aralearn.library.v1` | documento didático completo ou recortado |
| envelope de card | composição de conteúdo, resposta e feedback |
| contrato de cada pacote de recurso (`package`) | dados próprios de uma representação ou interação |
| `aralearn.resource-library.v1` | descoberta, inspeção e validação do catálogo de pacotes |

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

## 2. Envelope `aralearn.library.v1`

O envelope é a unidade de intercâmbio, persistência, validação e publicação:

```json
{
  "contract": "aralearn.library.v1",
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
            └── cards[]
```

### Curso, módulo e lição

- curso: `id`, `title`, `goal`, `modules`;
- módulo: `id`, `title`, `guide`, `lessons`;
- lição: `id`, `title`, `guide`, `topics`, `microsequences`.

Um `guide` declara `goal`, `include`, `exclude`, `notation` e `avoid`. Ele delimita a intenção de autoria: o que deve ser ensinado, o que fica fora do recorte, qual notação será adotada e quais erros de elaboração devem ser evitados.

Tópicos usam `id`, `label`, `kind`, `checks` e `errors`. `kind` vale `concept`, `procedure`, `representation` ou `term`. A distinção permite planejar se a aprendizagem exige compreender uma ideia, executar uma operação, ler uma forma de representação ou dominar vocabulário.

### Microssequência

Uma microssequência exige `id`, `title`, `goal`, `role`, `dependsOn`, `covers`, `checks` e `cards`; `errors` e `branchOf` são opcionais. `role` vale:

- `explain`: construir entendimento;
- `practice`: exercitar operações;
- `review`: recuperar e integrar;
- `support`: fornecer uma passagem auxiliar diante de dificuldade.

`dependsOn` aponta apenas para microssequência anterior da mesma lição e não pode formar ciclo. Essa restrição impede que a progressão declarada seja impossível de percorrer. Identidades estruturais são únicas nos escopos comparados pelo validador.

### Evidência normativa

`src/domain/aralearnProject.js` valida o domínio. `authoring/schemas/workspace-envelope.schema.json` descreve a fronteira de integração. Os testes de contrato devem ser consultados junto com ambos: o schema sozinho não expressa todas as relações semânticas.

## 3. Envelope de card

Todo card tem esta moldura:

```json
{
  "id": "card-id",
  "position": 1,
  "title": "Título curto",
  "role": "theory",
  "content": [],
  "response": null,
  "feedback": [],
  "topics": [],
  "sources": []
}
```

`position` é inteiro positivo e acompanha a ordem real no recipiente. `role` vale `theory` ou `practice`.

- card de teoria: ao menos uma instância em `content` e `response: null`;
- card de prática: exatamente uma instância em `response`; `content` pode ficar vazio quando a própria resposta contém todo o estímulo;
- `feedback`, `topics` e `sources`: sempre listas;
- ids de instância: únicos dentro do card.

Uma instância de `content`, `response` ou `feedback` tem:

```json
{
  "id": "instancia-no-card",
  "package": "aralearn.resource.paragraph",
  "version": "1.0.0",
  "data": {}
}
```

O kernel conhece `id`, `package`, `version` e o slot ocupado. O package conhece `data`. Essa fronteira é implementada em `src/resources/kernel/cardEnvelope.js` e `src/resources/kernel/packageRegistry.js`.

### Por que a pergunta não deve ser duplicada

Uma resposta `choice` já contém o estímulo e as alternativas quando esse é seu contrato. Repetir a mesma pergunta num `paragraph` cria dois focos, aumenta o custo de leitura e permite divergência durante edição. O validador de composição rejeita padrões conhecidos de duplicação; conteúdo adicional só deve existir quando fornece contexto necessário que não pertence à resposta.

## 4. Contrato unitário `aralearn.course.v1`

O kernel também oferece uma fronteira para um único curso:

```json
{
  "contract": "aralearn.course.v1",
  "course": {}
}
```

Ela é útil em testes e operações unitárias. Não aceita `courses`, não substitui `aralearn.library.v1` e não é o protocolo do catálogo. A implementação está em `src/resources/kernel/courseContract.js`.

Ter uma fronteira unitária explícita é preferível a inferir que qualquer objeto semelhante a curso está completo. A consequência é que o chamador precisa escolher deliberadamente o envelope adequado.

## 5. Contratos próprios dos packages

Cada package fornece:

- manifest com id, versão, propósito e slots;
- operações cognitivas e taxonomia acadêmica;
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

## 6. Protocolo `aralearn.resource-library.v1`

Esse protocolo descreve o catálogo de packages, não o conteúdo didático. Ele oferece descoberta progressiva:

1. `explore`: famílias e facetas instaladas;
2. `search`: candidatos ranqueados por intenção e restrições;
3. `inspect`: comparação de até oito perfis;
4. `contracts`: até quatro contratos exatos;
5. `validate_card`: forma, referências e composição;
6. `audit_representation`: ajuste semântico, affordance da resposta e legibilidade do feedback;
7. `preview_card`: capacidade de abrir a composição no renderer.

`preview_card` e `audit_representation` retornam `rendered: false`: não fingem simular viewport, Graphviz, Vega ou hidratação. Uma prévia geométrica exige o runtime real do aplicativo.

### Taxonomia e cobertura

Os tokens `canonical`, `versatile` e `substitute` são resultados do algoritmo de cobertura:

- `canonical`: package específico para as facetas pedidas;
- `versatile`: representação geral que preserva a intenção;
- `substitute`: melhor aproximação disponível, com alguma perda declarada.

Nesse protocolo, `canonical` não certifica consenso universal da área acadêmica. A evidência para escolher um package continua sendo seu propósito, convenções, contraindicações e exemplo.

Uma cobertura `substitute` não bloqueia a produção. O chat informa brevemente a aproximação; a pessoa pode manter, trocar ou solicitar um package futuro. Bloquear obrigatoriamente tornaria o catálogo incompleto incapaz de produzir qualquer curso novo; ocultar a substituição impediria curadoria consciente.

## 7. Fluxo de autoria

O planejamento didático precede o contrato:

```text
objetivo e progressão
→ gesto cognitivo necessário
→ busca por facetas
→ comparação da lista curta
→ carregamento dos contratos escolhidos
→ composição do card
→ validação estrutural
→ auditoria semântica
→ prévia real quando necessária
→ gravação por CAS
```

Essa sequência economiza contexto: o modelo recebe descrições e apenas os schemas que efetivamente usará. Carregar todos os contratos de uma vez seria simples para um catálogo pequeno, mas cresce linearmente e dificulta distinguir candidatos próximos.

Packages complementares podem coexistir no mesmo card quando cada um cumpre uma função necessária, como fórmula e gráfico. A prática possui uma única resposta formal, embora possa usar múltiplos conteúdos e feedbacks. O validador rejeita slots ou compatibilidades inválidos.

## 8. Publicação e completude

O documento não carrega estados burocráticos como “rascunho”, “pronto” ou “publicado”. Uma microssequência com cards válidos já é estudável; uma microssequência sem cards pode permanecer como parte do planejamento visível.

Publicação é uma operação externa: recompõe o documento, valida, canonicaliza, calcula hash, grava artefato imutável e move um ponteiro autorizado. Separar estado editorial do conteúdo impede que um mesmo JSON mude de significado apenas por um rótulo interno.

## 9. Limites e verificação

Validação estrutural não demonstra qualidade pedagógica, correção científica ou legibilidade em qualquer viewport. Auditoria semântica também depende de critérios implementados e não substitui revisão humana especializada. Por isso o fluxo combina:

- testes do kernel e dos packages;
- validação do documento recomposto;
- galeria visual e testes de interação;
- auditoria pedagógica da microssequência;
- revisão situada e possibilidade de correção.

Consulte [Packages de card](recursos-de-card.md), [Gateway MCP de autoria](autoria-mcp.md) e [Matriz de conformidade técnica](matriz-conformidade-tecnica.md).
