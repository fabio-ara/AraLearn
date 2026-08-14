# Cenários de planejamento contextual

Este diretório contém um corpus pequeno para regressão de engenharia das
instruções de autoria. Ele verifica se o assistente recebe contexto e rubricas
suficientes para produzir um plano revisável. Não avalia estudantes, não mede
resultados de aprendizagem e não sustenta alegações de eficácia.

## Procedimento

Para cada cenário:

1. a pessoa autora apresenta `initialRequest` e `knownContext`;
2. o assistente usa primeiro esse contexto e decide se
   `materialUnknowns` contém uma lacuna realmente decisiva;
3. quando `questionPolicy.mode` for `ask-material`, a pessoa fornece
   `authorContinuation`; nos demais casos, perguntas adicionais são
   regressão;
4. o assistente apresenta um plano humano com cobertura, dependências e os
   pares relevantes de dificuldade e resposta, depois pausa antes dos cards;
5. o revisor aplica `sharedRubric`, `difficultyResponseLinks`, a política de
   resources e a política de prática;
6. uma falha recorrente exige ajustar a fonte canônica de instruções e repetir
   a revisão.

O revisor examina propriedades observáveis do diálogo e do plano. Não exige
frase específica, estratégia pedagógica universal, seleção obrigatória de um
package ou quantidade fixa de cards.

## Replay versionado e revisão

`contextual-planning-runs.v1.json` registra uma execução estruturada dos cinco
cenários. O método é um fixture determinístico equivalente ao procedimento
manual para fins de regressão: mantém as entradas, separa os papéis de
assistente, pessoa e revisor, conserva as saídas observáveis em cada rodada e
registra a ordem divergência, revisão, ajuste, decisão humana e persistência.
Ele não é uma captura de provedor externo e não deve ser apresentado como
teste comportamental de um modelo em produção.

Cada run contém uma divergência controlada realmente presente na saída
inicial. O revisor independente aponta código, mensagem e caminho da evidência;
a rodada seguinte declara o finding atendido e mostra o valor corrigido. O
resultado final conserva os vínculos dificuldade→resposta do cenário, pausa
antes dos cards, prática determinística e apenas escopo e decisões compactas
depois da aprovação.

| Cenário | Divergência injetada | Finding esperado |
| --- | --- | --- |
| A | correção por julgamento semântico | `A.PRACTICE_NONDETERMINISTIC` |
| B | laboratório disponível tratado como ausente | `B.KNOWN_CONDITION_IGNORED` |
| C | resposta pedagógica global sem vínculo local | `C.DIFFICULTY_RESPONSE_MISMATCH` |
| D | transcrição não aprovada proposta para persistência | `D.PERSISTENCE_BOUNDARY` |
| E | teto de cards anterior à decomposição | `E.FIXED_CARD_TARGET` |

O avaliador cruza o replay com
`contextual-planning-scenarios.v1.json`; não considera o finding declarado no
próprio replay prova suficiente. As regras executáveis derivam findings dos
valores observados, e só depois os comparam à revisão independente. O avaliador
também verifica a evidência no caminho declarado, a ordem das rodadas, a
correção final, o gate humano, a ementa versionada de D e as chaves efetivamente
persistidas. As rodadas de persistência guardam a chamada canônica de
`gerirContinuidadeDaAutoria`; o avaliador a atravessa pelo mapper MCP e pelo
validador de protocolo reais de `record_approved_plan`, incluindo `parts`,
`decisions`, `pedagogicalDiagnosis` e `mandate`. Os testes de mutação removem ou
corrompem cada propriedade crítica para demonstrar que a regressão falha.

Execute:

```sh
node scripts/evaluateContextualPlanningRuns.mjs
node --test tests/runtime/authoring-contextual-planning-runs.test.js
```

Resultado registrado em 14 de agosto de 2026: a rodada inicial produziu cinco
findings derivados, a revisão registrou os cinco, e a reexecução final produziu
zero finding; 28/28 testes passaram, incluindo as mutações de pergunta, vínculo,
cobertura dos cinco escopos, gate humano, payload canônico, decisões não
aprovadas, prática contextual, revisão, finding e alegação indevida. Esses
resultados verificam somente conformidade de engenharia. Não medem aprendizagem,
eficácia educacional ou qualidade docente.

## Iteração das fontes canônicas

`contextual-planning-source-iteration.v1.json` registra uma segunda evidência,
independente dos runs simulados. A mesma auditoria lê diretamente duas revisões
de `authoring/platforms/chatgpt/INSTRUCTIONS.md` e
`supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js`:

- baseline Git `e720e703a2b4f491905c7be5e98967b8b7f9a470`;
- snapshot final identificado pelo SHA-256 de cada arquivo atual.

O artefato não copia as fontes. Ele guarda caminhos, tamanho, fingerprints,
findings derivados, ajustes que os atenderam e o resultado da reexecução. Os
fingerprints normalizam apenas finais de linha para LF, de modo que o mesmo
conteúdo tenha identidade estável em checkouts Windows e Linux. O
evaluator mantém fora do artefato os fingerprints canônicos do baseline e
reabre obrigatoriamente o objeto Git correspondente. No
baseline, a auditoria encontra nove gaps: contexto primeiro, diagnóstico,
perguntas materiais, vínculos dificuldade→resposta, plano humano, persistência,
prática determinística, coerência diagnóstico-plano-cards e calibração global.
Na revisão final, as mesmas regras encontram zero. O conteúdo Git antigo é
obrigatório: checkout raso falha, e o job de validação usa `fetch-depth: 0`.
Assim, conteúdo injetado, fingerprints vazios ou findings inventados não
substituem a releitura. Cada ajuste também precisa apontar exatamente para as
fontes nas quais o finding foi observado e cujo fingerprint efetivamente mudou.

A seção `scenarioLinkage` liga cada regra ao contrato
`aralearn.authoring-contextual-planning-scenarios.v1`, aos runs
`aralearn.authoring-contextual-planning-runs.v1`, aos cenários A–E e aos itens
correspondentes de `sharedRubric`. O evaluator lê os bytes dos dois corpora
versionados, vincula por igualdade o JSON parseado aos respectivos SHA-256 e
executa a auditoria dos runs A–E; falha se contrato,
conjunto de cenários, runs, conteúdo, mapa de aplicação ou relação de rubricas
divergirem. Os hashes dos corpora usam a mesma normalização exclusiva de finais
de linha e continuam rejeitando qualquer mutação semântica.

Execute:

```sh
node scripts/evaluateAuthoringSourceIteration.mjs
node --test tests/runtime/authoring-contextual-planning-source-iteration.test.js
```

Resultado registrado em 14 de agosto de 2026: baseline com 9 findings, revisão
final com 0 e 27/27 testes aprovados. Os testes regressivos alteram o conteúdo
final em memória, recalculam seu SHA e ainda exigem que a auditoria falhe;
incluem inversões `Nunca`→`Sempre`, `não aplique`→`aplique`, contexto depois e
uso de avaliação heurística, além de contradições e sinônimos contrapolares
acrescentados sem remover a frase correta. Também exercitam baseline forjado,
rubrica vazia, run sem corpo, objeto de corpus divergente dos bytes, contratos
coordenadamente inventados e rastreio causal incorreto. A auditoria lexical
protege formas proibidas catalogadas; não pretende interpretar toda paráfrase
possível. Esta evidência é somente uma iteração de engenharia no nível das
fontes; não é captura de execução de provedor ou modelo e não sustenta alegação
educacional.

## Cenários

| ID | Contraste exercitado |
| --- | --- |
| A | Conteúdo técnico com condição operacional inicialmente ausente |
| B | Mesmo tipo de conteúdo com laboratório já disponível |
| C | Área não técnica em que computador é irrelevante |
| D | Pedido que já informa todas as condições materiais |
| E | Escopo denso que precisa de decomposição sem teto de cards |

O arquivo JSON é versionado pelo campo `contract`. Mudança de semântica exige
nova versão; ampliação compatível pode acrescentar cenário ou critério sem
alterar a interpretação dos registros existentes.
