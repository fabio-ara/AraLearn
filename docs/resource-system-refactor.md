# Refatoração do sistema de recursos

## Objetivo

Consolidar o contrato dos cards em uma fonte canônica, ampliar as interações
sem multiplicar mecânicas de resposta e tornar a revisão bottom-up uma autoria
atômica validada por escopo. O runtime de estudo continua determinístico,
local-first e independente de LLM.

## Decisões

- O contrato vigente após o corte será `aralearn.resources.v4`; documentos
  anteriores serão aceitos somente pelo conversor de fronteira versionado.
- Cada recurso terá uma definição canônica com schema de card, schema de
  autoria, capacidades de interação, alvos de lacuna, limites semânticos,
  limites móveis e exemplos.
- Renderers, compiladores, schemas MCP, documentação e catálogos de geração
  serão projeções do registro, com testes de cobertura exata.
- `choice` usará `selectionMode`, `selectionCriterion`, `options` e
  `answerIds`. A correção será binária pelo conjunto exato e ocorrerá somente
  após confirmação.
- Cards automáticos usarão lacunas por escolha. A resposta digitada ficará
  restrita à autoria manual experimental enquanto existir suporte real.
- O provider bottom-up exporá `generateStructured`. JSON mode sem schema não
  será anunciado como saída estrita e não haverá retorno silencioso ao parser
  por slots.
- Uma revisão atômica devolverá apenas substituições identificadas. Contexto
  adjacente será somente leitura e a guarda comparará o documento antes e
  depois.
- Blocos de `composite` terão `id` estável obrigatório. Índices poderão existir
  apenas dentro do conversor de fronteira.
- Geometria, cores, rotas, ícones e layout permanecem responsabilidade do
  renderer.
- A quantidade de alternativas decorrerá da disponibilidade de distratores
  plausíveis. Cinco alternativas serão um perfil de simulação FGV, não uma
  quota universal.

## Linha de base

- Data: 28 de julho de 2026.
- `npm test`: 739 testes aprovados em aproximadamente 24 segundos.
- `npm run lint`: aprovado em aproximadamente 7 segundos.
- `npm run test:e2e`: a porta padrão 4182 estava ocupada por uma instância
  local; a linha de base foi reiniciada em porta isolada.
- Recursos vigentes: `paragraph`, `choice`, `composite`, `code`, `table`,
  `flow`, `tree`, `graph`, `relation_map`, `matrix`, `plane` e `formula`.
- Fixture visual migrada: `tests/fixtures/v4/project-visual.json`.

## Duplicações e divergências encontradas

- `src/domain/resources.js`, `src/core/cardExerciseSupport.js`,
  `src/core/authoringResourceContract.js`,
  `src/generation/resources/cardResourceDefinitions.js` e
  `src/generation/engine/resourceCatalog.js` declaram partes concorrentes do
  mesmo catálogo.
- `src/generation/engine/templateCatalog.js` e o motor bottom-up codificam
  `optionA`, `optionB`, `optionC` e `answerId`.
- O contrato aceita apenas três ou quatro opções e uma resposta, embora a UI
  já mantenha uma coleção de seleções.
- `composite` identifica blocos sem `id` obrigatório e a revisão granular usa
  índices.
- O adapter Gemini anuncia JSON Schema, mas não envia schema; o adapter
  compatível com OpenAI anuncia motor estruturado sem contrato estruturado.
- O contrato de `tree` usa `folder/file` para toda hierarquia.
- `graph` ainda aceita coordenadas autorais e não possui identidade de aresta.
- O schema MCP repete ramos de recurso que deveriam ser gerados.

## Fases e critérios

1. Registro canônico e conversor v3 → v4.
2. `choice` completo e confirmação acessível.
3. `generateStructured`, schemas por fase e erros explícitos.
4. Autoria atômica de card e blocos.
5. Estabilização de `graph`, `flow` e `tree`.
6. Polimento dos recursos existentes.
7. `chart`, `sequence`, `annotated_text` e `linguistic_example`.
8. `system_map` e `reaction`, após aprovação dos contratos-base.
9. Prompts, MCP/GPT, galeria, benchmark e documentação.

Cada fase exige schemas fechados, testes unitários, lint, E2E pertinente,
validação móvel objetiva, documentação atualizada e ausência de fallback
silencioso ou catálogo paralelo.

## Estado

- Fase 0: concluída.
- Fase 1: em execução.
- Demais fases: pendentes.

## Base técnica e acadêmica

As decisões usam JSON Schema 2020-12, documentação oficial dos providers, WCAG
2.2 e ELK Layered. A fundamentação pedagógica cobre carga cognitiva e atenção
dividida, coerência/sinalização/contiguidade, múltiplas representações,
exemplos resolvidos com retirada gradual de apoio, prática de recuperação,
espaçamento e feedback corretivo.

O DOI `10.1207/S1532690XCI2001_3`, indicado no prompt como referência de
Renkl, corresponde a Kozhevnikov, Hegarty e Mayer (2002), não a exemplos
resolvidos. Para fading, a referência pertinente é Renkl et al. (2002),
`10.1080/00220970209599510`.
