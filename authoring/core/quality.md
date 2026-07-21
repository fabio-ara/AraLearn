# Critérios de qualidade

## Planejamento didático

- Cada resultado de aprendizagem precisa de evidência observável.
- As dependências formam um grafo justificável, não uma cadeia criada apenas pela ordem dos itens.
- A parte começa com a base necessária e avança até uma prática compatível com o objetivo.
- O plano prevê erros plausíveis e maneiras de distingui-los da resposta correta.
- O recurso escolhido corresponde à operação cognitiva. Uma tabela serve para comparar; um fluxo, para acompanhar decisões; um grafo, para observar relações; um plano, para raciocinar sobre posições ou vetores.

## Construção dos cards

- Um card de prática mede uma decisão principal.
- A prática é autossuficiente. O enunciado não depende de imagem, texto ou aula ausente.
- Toda prática declara `variationFocus`: o caso, a condição, a representação, a estratégia, o erro provável ou o grau de apoio que muda em relação às práticas próximas.
- O título não entrega a resposta.
- O enunciado não contém a resposta por repetição involuntária.
- Alternativas erradas representam equívocos plausíveis e não simples absurdos.
- O feedback explica a regra, o detalhe decisivo e o motivo do erro provável.
- Termos são apresentados com explicação antes do primeiro uso exigido.
- Uma expressão em outro idioma recebe tradução ou glosa quando isso ajuda o público previsto.
- Datas, versões, unidades e condições relevantes são explícitas.
- Referências temporais vagas, como “atualmente” ou “recentemente”, não substituem uma data necessária.

## Auditoria

A auditoria registra dez indicadores obrigatórios em `gates`:

| Indicador | Verificação |
|---|---|
| `planAlignment` | A parte corresponde ao plano e à sua especificação. |
| `contract` | O fragmento obedece ao contrato AraLearn v3. |
| `outcomeCoverage` | Objetivos, critérios e evidências previstos estão cobertos. |
| `sources` | As afirmações têm apoio nas fontes autorizadas. |
| `continuity` | A parte respeita dependências e o estado acumulado. |
| `interactionCoherence` | Recurso, interação e resposta aceita são coerentes. |
| `language` | A linguagem é clara e adequada ao público. |
| `fieldPreservation` | Nenhum campo foi perdido ou alterado sem autorização. |
| `structuredElements` | Tabelas, fluxos, grafos e demais estruturas são válidos. |
| `feedback` | O feedback corresponde à resposta aceita e explica a decisão. |

Os dez valores precisam ser verdadeiros e `findings` precisa estar vazio para
aprovar. Um aviso não resolvido impede a aprovação. O auditor usa `repair` para
correção localizada, `rebuild` para refazer o fragmento sob a mesma especificação
e `blocked` quando a especificação, as fontes ou uma decisão externa precisam mudar.
