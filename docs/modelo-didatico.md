# Modelo didático

## Unidade central

No AraLearn, o card não é a unidade principal de planejamento. A unidade principal é a microssequência.

Um card isolado pode explicar ou perguntar algo, mas não carrega sozinho uma progressão. A microssequência reúne alguns cards com uma função didática clara.

## Funções de microssequência

Uma microssequência pode:

- introduzir um conceito;
- explicar um procedimento;
- demonstrar um exemplo;
- propor prática guiada;
- diferenciar ideias parecidas;
- corrigir erro comum;
- consolidar uma etapa;
- preparar a próxima microssequência.

O número de cards é secundário. O essencial é que a etapa cumpra sua função antes de o usuário avançar.

## Top-down e bottom-up

O top-down planeja a sequência didática. Ele cria microssequências vazias de cards, mas não vazias de sentido.

O bottom-up materializa a etapa. Ele cria cards quando o usuário abre a microssequência e pede conteúdo para estudar.

Essa separação permite revisar a trilha antes de produzir detalhes e evita que a IA gere volume demais de uma vez.

## Progressão

Uma trilha boa reduz pressupostos ocultos.

Quando um conceito depende de outro, essa relação deve aparecer no `domainMap`, nas microssequências planejadas ou na própria progressão dos cards. O usuário não deveria ser cobrado por uma prática antes de receber base suficiente para executá-la.

## DomainMap como apoio didático

O `domainMap` registra conceitos, procedimentos, erros comuns, pré-requisitos, evidências esperadas e variantes de prática.

Ele ajuda o motor a responder perguntas como:

- que conceito esta microssequência cobre?
- que pré-requisito precisa aparecer antes?
- que erro comum deve ser diagnosticado?
- que tipo de prática é adequado aqui?
- que representação faz sentido?

O usuário comum não precisa editar essa camada no runtime.

## Suficiência

Uma microssequência está suficientemente materializada quando o usuário consegue:

- reconhecer o foco da etapa;
- ver explicação ou exemplo suficiente;
- praticar algo relevante;
- entender por que pode avançar.

Se isso não acontece, a ação correta é `Corrigir microssequência` ou `Continuar na microssequência`.

## Materialização

Materializar não é resumir. É transformar a etapa em cards estudáveis.

Um bom conjunto de cards pode combinar explicação, pergunta, lacuna, tabela, código, fluxograma, matriz ou outro recurso aceito. O formato deve servir à função da microssequência.

## Criar microssequência extra

Às vezes a trilha planejada pula um degrau. Nesse caso, o usuário pode criar uma microssequência extra depois da atual.

Essa etapa extra deve continuar ligada à lição e retornar à trilha planejada. Ela não deve virar replanejamento amplo do curso.

## Critério prático

Uma microssequência está bem desenhada quando responde:

- o que esta etapa ensina ou treina?
- que domínio da lição ela cobre?
- que prática ou evidência ela espera?
- que erro ou contraste ela previne?
- por que ela vem antes da próxima?
