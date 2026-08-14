# Contratos públicos de conteúdo

O AraLearn não possui um “contrato v4” monolítico de resources. A árvore
didática usa um envelope estável; cada representação ou forma de resposta usa
o contrato versionado de seu próprio package. Três identificadores próximos
atendem a finalidades diferentes.

## Envelope operacional `aralearn.library.v1`

Este é o documento de intercâmbio, persistência e publicação usado pelo
aplicativo e pelo workspace de autoria. A raiz aceita somente:

```json
{
  "contract": "aralearn.library.v1",
  "scope": "course",
  "courses": []
}
```

`scope` é opcional e, quando presente, vale `course`, `module`, `lesson` ou
`microsequence`. `courses` é sempre uma lista, inclusive em recortes que
contêm um único curso. A validação executável está em
`src/domain/aralearnProject.js`; o schema de integração da raiz está em
`authoring/schemas/workspace-envelope.schema.json`.

A hierarquia é:

```text
courses[]
└── modules[]
    └── lessons[]
        ├── topics[]
        └── microsequences[]
            └── cards[]
```

Curso exige `id`, `title`, `goal` e `modules`. Módulo exige `id`, `title`,
`guide` e `lessons`; lição exige `id`, `title`, `guide`, `topics` e
`microsequences`. Um `guide` contém `goal`, `include`, `exclude`, `notation` e
`avoid`. Tópicos usam `id`, `label`, `kind`, `checks` e `errors`; `kind` vale
`concept`, `procedure`, `representation` ou `term`.

Microssequência exige `id`, `title`, `goal`, `role`, `dependsOn`, `covers`,
`checks` e `cards`; `errors` e `branchOf` são opcionais. `role` vale `explain`,
`practice`, `review` ou `support`. Uma dependência aponta para uma
microssequência anterior da mesma lição e não pode formar ciclo. Identidades
estruturais são únicas dentro do curso nos escopos em que o validador as
compara.

## Envelope de card

Todo card aceita somente estes campos:

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

`position` é inteiro positivo e precisa acompanhar a ordem no recipiente.
`role` vale `theory` ou `practice`. Cards de teoria possuem pelo menos uma
instância em `content` e `response: null`; cards de prática possuem uma
instância em `response` e podem ter `content: []` quando a própria resposta
contém todo o estímulo visível. `feedback`, `topics` e `sources` são listas;
ids de instância são únicos no card.

Cada entrada de `content` ou `feedback`, e o valor não nulo de `response`, tem
a mesma moldura:

```json
{
  "id": "instancia-no-card",
  "package": "aralearn.resource.paragraph",
  "version": "1.0.0",
  "data": {}
}
```

O par `package@version` resolve a definição instalada. O campo `data` segue
somente o schema e a semântica daquele package. Um card de escolha não pode
repetir em `paragraph` a mesma pergunta já declarada em
`aralearn.response.choice`.

A implementação normativa desta camada está em
`src/resources/kernel/cardEnvelope.js` e
`src/resources/kernel/packageRegistry.js`.

## Contrato unitário `aralearn.course.v1`

O kernel independente de packages também fornece um documento para validar e
normalizar um único curso:

```json
{
  "contract": "aralearn.course.v1",
  "course": {}
}
```

Ele é usado na fronteira unitária do kernel e em seus testes. Não substitui o
envelope multi-curso `aralearn.library.v1`, não aceita `courses` e não é o
protocolo de busca do catálogo. Sua implementação está em
`src/resources/kernel/courseContract.js`.

## Protocolo de catálogo `aralearn.resource-library.v1`

As operações de descoberta retornam respostas identificadas por
`aralearn.resource-library.v1`. Esse valor identifica o protocolo do catálogo,
não um documento didático. O catálogo expõe:

1. `explore`, para famílias e facetas instaladas;
2. `search`, para ranquear candidatos por intenção e restrições;
3. `inspect`, para comparar até oito perfis;
4. `contracts`, para obter até quatro contratos exatos;
5. `validate_card`, para validar o envelope e sua composição;
6. `audit_representation`, para conferir estrutura e ajuste semântico;
7. `preview_card`, para informar se a composição pode ser aberta no renderer.

`preview_card` e `audit_representation` não simulam layout: devolvem
`rendered: false`. A prévia fiel requer o renderer do aplicativo, inclusive
para Graphviz, Vega, viewport e hidratação.

Os tokens públicos `canonical`, `versatile` e `substitute` pertencem a
`fit`/`coverage.status`. O primeiro significa “ajuste específico segundo as
facetas solicitadas”; não é certificação de que uma convenção acadêmica seja
universalmente canônica. A explicação completa está no
[glossário técnico](glossario-tecnico.md).

## Package e validação

Cada package precisa fornecer:

- manifest com id, versão SemVer, propósito, slots, operações cognitivas,
  taxonomia acadêmica, compatibilidades, limitações e acessibilidade;
- contrato autoral de alto nível e exemplo;
- schema de `data`;
- normalização, validação semântica, renderer, texto acessível e alvos de
  edição textual;
- alvos de prática quando ocupa `content`;
- avaliador quando ocupa `response`;
- hidratação opcional para comportamento pós-renderização.

O validador de schemas em `src/resources/kernel/schemaValidation.js`
implementa somente o subconjunto de palavras-chave necessário aos packages.
Ele não anuncia conformidade integral com JSON Schema 2020-12. A validação de
um card combina esse subconjunto, o validador semântico do package e as
relações entre conteúdo e resposta.

## Descoberta e materialização na autoria

O fluxo recomendado é progressivo, para não enviar todos os contratos ao
modelo:

1. planejar a microssequência e os gestos cognitivos;
2. explorar facetas e buscar pela intenção;
3. inspecionar a lista curta;
4. carregar somente os contratos escolhidos;
5. materializar o card completo;
6. validar e auditar a representação;
7. abrir a prévia real quando a geometria ou a interação forem relevantes.

Uma cobertura `substitute` não bloqueia a produção. O chat informa brevemente
a aproximação usada, e a pessoa pode solicitar outro package ou promover a
criação futura de um package mais específico.

Microssequências com cards ficam estudáveis imediatamente. Microssequências
sem cards podem permanecer visíveis como planejamento. Nenhum dos três
contratos cria estados de “publicado”, “rascunho”, “pronto” ou “concluído” no
documento didático; publicação é um processo de materialização e referência a
artefato.

Veja também [Recursos de card](recursos-de-card.md), [Gateway MCP de
autoria](autoria-mcp.md) e [Matriz de conformidade
técnica](matriz-conformidade-tecnica.md).
