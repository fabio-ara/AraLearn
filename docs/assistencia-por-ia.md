# Assistência por IA generativa

Este documento descreve o estado atual da assistência por IA no AraLearn.

## Posição do produto

O AraLearn não trata a LLM como autora da arquitetura didática.

O AraLearn também não usa a LLM para fazer resumo genérico.

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

O modo meticuloso precisa continuar compatível com esse limite. Por isso a governança extra fica concentrada em contratos pequenos, validação local e iteração curta, sem delegar raciocínio amplo ao modelo.

## Modo meticuloso

A geração bottom-up e a geração de microssequências da lição agora podem carregar uma policy explícita de rigor didático.

Essa policy reforça:

- não fazer resumo genérico;
- decompor o ponto didático pedido;
- só criar nova microssequência se houver função didática nova;
- pedir variação de prática quando a cobertura já existe, mas ainda está fraca;
- rejeitar repetição sem nova finalidade;
- marcar item fraco quando existe explicação sem prática ou prática sem variação suficiente.

Na lição, a governança adicional pode usar um `domainMap` interno com:

- `items`: capacidades ou componentes didáticos reais;
- `practiceVariants`: variações de prática associadas a essas capacidades.

Microssequências podem declarar:

- `domainRefs`;
- `practiceVariantRefs`;
- `didacticPurpose`;
- `coverageRole`.

Isso ajuda o app a saber se uma nova sequência introduz, demonstra, pratica, discrimina, diagnostica erro, consolida ou aplica em prova.

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

Na geração de microssequências da lição, o fluxo também deixa de depender só de títulos soltos. O app passa a enviar ao modelo:

- `sourceGuideStructured`;
- `domainMap`, quando existir;
- cobertura atual da lição;
- microssequências já existentes com seus papéis didáticos.

O objetivo é sugerir rascunhos que cubram lacunas reais, não aumentar volume.

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

O AraLearn agora separa três camadas:

- checks estruturais e de política fechada;
- checks declarativos de cobertura;
- heurísticas textuais fracas.

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
- prática antes de microteoria, quando detectável pelo plano;
- redundância didática sem função nova.

Também pode bloquear, quando a regra é declarativa e local:

- microssequência explicativa sem prática;
- duplicação de cobertura declarada sem função nova.

Além disso, a checagem de profundidade pode apontar sinais fracos:

- definição sem exemplo mínimo;
- salto para exercício sem exemplo guiado suficiente;
- conteúdo genérico demais para o domínio;
- notação sem preparação suficientemente evidente no texto.

E pode apontar lacunas de lição:

- item explicado sem prática;
- prática sem variação;
- ausência de tratamento de erro comum relevante;
- falta de formato avaliativo quando a lição pede prova.

## Continuação automática

A checagem didática não existe para despejar um relatório ao usuário.

Quando a falha é estrutural ou declarativa o bastante, o AraLearn usa a checagem para decidir a continuação da geração antes da entrega final.

Fluxo:

1. a LLM gera os cards;
2. o app faz reparo estrutural local;
3. o app valida estrutura, didática e fonte;
4. se a falha restante for didática e acionável, o app monta um plano determinístico de continuação;
5. esse plano pode:
   - reescrever cards específicos;
   - inserir um card de exemplo;
   - inserir preparação de notação;
   - inserir uma prática mínima;
   - decidir que a lacuna não pertence à microssequência atual e deve virar outra microssequência da lição;
6. o app chama a LLM de novo com esse alvo fechado;
7. só então entrega a microssequência validada.

Heurística textual isolada não deve forçar essa continuação automática.

Essa continuação não deve competir com o pedido textual do usuário. Ela existe para preservar o pedido e fechar a lacuna detectada pelo motor.

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

## Ações públicas de aprofundamento

O app passa a oferecer ações simples de aprofundamento, como `Completar lacunas`, em vez de expor termos internos.

Essas ações verificam:

- superficialidade;
- redundância;
- lacunas de domínio;
- necessidade real de nova microssequência ou nova prática.

Se não houver ganho didático claro, a ação não deve inflar a quantidade de cards.

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
