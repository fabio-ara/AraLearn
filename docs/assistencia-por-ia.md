# Assistência por IA generativa

Este documento descreve o estado atual da assistência por IA no AraLearn.

## Posição do produto

O AraLearn não trata a LLM como autora da arquitetura didática.

O app decide:

- contexto hierárquico;
- tipo didático permitido;
- tamanho permitido;
- `cardPlan` determinístico;
- recurso por posição;
- schemas enviados;
- validação estrutural, didática e de fonte;
- aplicação local do resultado validado.

A LLM preenche somente conteúdo dentro de contrato fechado.

O alvo operacional é modelo fraco ou barato. No Gemini, a referência atual é `gemini-2.5-flash`, tratada como perfil `weak-structured-json`.

## Weak model mode

O pipeline bottom-up de cards opera em `weakModelMode`.

Isso significa:

- a etapa de planejamento devolve só `typeId`, `sizeId`, `microsequenceGoal`, `selectedExtraResourceTypes`, `sourceUsePlan` e `reason`;
- a LLM não devolve `cardPlan`;
- a LLM não escolhe `position`;
- a LLM não escolhe `resourceType` por card;
- o app monta o `cardPlan` de forma determinística;
- o prompt final de geração pede apenas preenchimento dos cards planejados;
- o app repara estrutura de forma determinística antes de tentar reparo por LLM.

## Governança da lição

A ordem de precedência do pedido é fixa:

1. `sourceGuideStructured` da lição;
2. `selectedLessonTopicRefs`;
3. `userPrompt`.

`description` não substitui `sourceGuideStructured`.

`selectedLessonTopicRefs` são contexto operacional. Eles não viram tags persistentes por padrão.

`freeNotes` e descrições legadas não entram como governança forte na geração.

## Recursos permitidos

Recursos base seguros:

- `paragraph`
- `block_gap_fill`
- `multiple_choice`

Recursos permitidos com cautela:

- `table`
- `code_editor`

Recursos avançados:

- `flowchart`
- `tree`
- `matrix`
- `plane`

Recursos avançados só entram quando a policy libera. A liberação exige:

- a lição declarar o recurso em `resourceTags`;
- o tipo didático justificar o recurso;
- escolha explícita do usuário ou indicação forte da própria lição.

Se isso não acontecer, o recurso não entra em `availableResources`, não entra nos schemas enviados e não entra no `cardPlan`.

## Pipeline de cards

Fluxo atual:

1. o usuário abre a microssequência;
2. o app monta o contrato de planejamento;
3. a LLM devolve um plano pequeno;
4. o app valida o plano;
5. o app monta `cardPlan` determinístico;
6. o app resolve os recursos efetivos;
7. o app monta o contrato de geração;
8. a LLM devolve os cards;
9. o app faz parse e normalização;
10. o app executa reparo estrutural determinístico;
11. o app valida estrutura;
12. o app valida didática;
13. o app valida grounding mínimo de fonte;
14. só então tenta reparo por LLM, se ainda necessário;
15. o resultado válido é adaptado ao contrato público;
16. os cards são aplicados diretamente na microssequência-alvo.

## Validação

As validações agora são separadas.

### Estrutural

Bloqueia:

- JSON incorreto;
- `cards` ausentes;
- quantidade errada;
- `position` errada;
- `resourceType` diferente do plano;
- campo fora do schema;
- campo obrigatório ausente;
- `optionId` ou `correctOptionId` inválido;
- `blankId` ou `blockId` inválido;
- `highlight` inválido.

### Didática

Bloqueia:

- referência a card anterior;
- referência a tabela, figura ou trecho acima;
- “como vimos”;
- “na aula”;
- “no material”;
- “no PDF”;
- linguagem de bastidor;
- lacuna longa;
- prática sem contexto local;
- resposta revelada no mesmo card;
- prática antes de microteoria, quando detectável pelo plano.

### Grounding mínimo de fonte

Quando houver `sources` ou `sourceUsePlan`, o card precisa:

- declarar `sourceRefs`; ou
- justificar ausência com `sourceNote`.

`sourceRefs` precisam existir no contrato da operação.

## Aplicação direta

Não existe mais prévia privada.

O fluxo oficial é:

1. a LLM gera ou edita;
2. o app valida;
3. o app aplica diretamente na microssequência;
4. a UI mostra que existe uma iteração gerada ativa;
5. o usuário pode aceitar ou excluir essa iteração;
6. excluir restaura a versão anterior pelo histórico local;
7. o modo de estudo ignora `draft` e `included: false`.

## Fontes e anexos

`sourceGuideStructured` da lição continua sendo a governança principal.

Quando houver anexos:

- o planejamento pode devolver `sourceUsePlan`;
- a geração pode carregar `sourceRefs`;
- o contrato público agora aceita `sourceRefs` em cards.

Isso é grounding mínimo, não RAG avançado.

## Codex local

`codex-cli-local` continua suportado, mas como integração avançada de desenvolvedor.

O fluxo normal do estudante continua sendo Gemini/API comum.

Regras mantidas:

- `GET /health` continua sendo o health check do bridge local;
- anexos textuais continuam serializados com limite;
- anexos binários continuam devolvendo mensagem clara;
- erros do bridge local continuam sendo expostos de forma compreensível.
