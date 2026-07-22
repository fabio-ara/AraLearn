# Critérios de qualidade

## Ponto de partida

- Na falta de evidência concreta, planeje para uma pessoa sem conhecimentos prévios sobre o tema.
- Não pergunte se a pessoa é iniciante, intermediária ou avançada. Pergunte somente por um pré-requisito observável quando a resposta mudar o plano, como saber ler uma fórmula, executar um comando ou interpretar uma tabela.
- Apresente termos, símbolos, notações e operações antes de exigi-los. Familiaridade presumida precisa estar apoiada no pedido, nos materiais ou em uma resposta objetiva do autor.

## Planejamento didático

- Cada resultado de aprendizagem precisa de evidência observável.
- As dependências formam um grafo justificável, não uma cadeia criada apenas pela ordem dos itens.
- A progressão é causal: base conceitual, exemplo resolvido quando a operação não for imediata, prática guiada e prática com menor apoio.
- Uma microssequência que ensina uma operação nova não começa pela cobrança da operação nem termina apenas na explicação.
- Cada operação nova recebe ao menos duas oportunidades de prática com `variationFocus` distinto. Uma única prática só basta para reconhecer um fato indivisível, e essa escolha precisa ser justificada na especificação.
- O plano prevê erros plausíveis e maneiras de distingui-los da resposta correta.
- O recurso escolhido corresponde à operação cognitiva. Considere os doze recursos do contrato v3: `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix`, `plane` e `formula`. Não reduza o plano aos dois primeiros quando outro recurso preservar melhor o raciocínio.
- A diversidade de recursos decorre do conteúdo. Não estabeleça cota e não troque o formato apenas para variar a aparência.

## Construção dos cards

- Um card de prática mede uma decisão principal.
- A prática é autossuficiente. O enunciado não depende de imagem, texto ou aula ausente.
- Dados voláteis aparecem no próprio card: valores, nomes, trechos de código, tabelas, casos, coordenadas, opções e demais elementos particulares da questão não podem existir apenas em um card anterior. Conceitos e notações já ensinados podem ser mobilizados, mas o caso que será resolvido precisa estar completo.
- Toda prática declara `variationFocus`: o caso, a condição, a representação, a estratégia, o erro provável ou o grau de apoio que muda em relação às práticas próximas.
- O título não entrega a resposta.
- O enunciado não contém a resposta por repetição involuntária.
- Alternativas erradas representam equívocos plausíveis e não simples absurdos.
- O feedback explica a regra, o detalhe decisivo e o motivo do erro provável.
- Termos são apresentados com explicação antes do primeiro uso exigido.
- Uma expressão em outro idioma recebe tradução ou glosa quando isso ajuda o público previsto.
- Datas, versões, unidades e condições relevantes são explícitas.
- Referências temporais vagas, como “atualmente” ou “recentemente”, não substituem uma data necessária.

## Linguagem do curso

- Escreva em português natural, direto e preciso, de acordo com a variante pedida pelo autor.
- O texto destinado ao estudante não menciona plano, parte, card, geração, auditoria, API, modelo ou instruções de produção.
- Não anuncie o que a explicação fará nem descreva o próprio texto. Apresente diretamente o conceito, o caso ou a ação.
- Não use travessão. Reestruture a frase com ponto, vírgula, dois-pontos ou parênteses.
- As palavras `curto` e `curta` não aparecem no conteúdo do curso. Informe o recorte ou a extensão de modo concreto quando isso for necessário.
- Evite fórmulas de redação repetidas, como iniciar parágrafos com “A leitura...” ou apresentar enumerações pela construção “X combina Y, Z e W”. Diga diretamente o que o estudante precisa compreender ou fazer.
- Títulos nomeiam o conceito ou a ação. Não transforme um parágrafo explicativo em título.

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
