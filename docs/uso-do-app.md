# Guia de uso do app

Este guia descreve o fluxo de uso do AraLearn no estado atual. Ele foi escrito para leitores que querem operar o app e, ao mesmo tempo, entender por que as ações aparecem nos níveis em que aparecem.

## Como o app está organizado

O AraLearn distribui o estudo em cinco níveis:

```text
curso -> módulo -> lição -> microssequência -> card
```

Cada nível tem uma função. O curso organiza uma trilha mais ampla; o módulo agrupa um bloco coerente dessa trilha; a lição concentra orientação didática local; a microssequência organiza um ponto estudável; o card é a unidade interativa por meio da qual o estudante lê, responde, compara, completa, acompanha um exemplo ou executa uma prática.

Essa distinção é importante porque o app não pede o mesmo tipo de operação em todos os níveis.

## O que se faz na home

Na home, o usuário encontra a lista de cursos e o ponto de entrada para operações mais amplas. Ali faz sentido:

- criar curso vazio;
- importar estrutura;
- importar backup local completo;
- abrir um curso já existente;
- usar geração estrutural contextual.

O que não faz sentido na home é gerar diretamente os cards de um problema pontual, porque ainda falta contexto suficiente para isso.

## O que se faz em curso, módulo e lição

À medida que o usuário desce na hierarquia, o tipo de ação muda.

No nível do curso, a geração por IA atua sobre módulos, lições e o planejamento descendente necessário. No nível do módulo, atua sobre lições e seus desdobramentos. No nível da lição, a geração estrutural atualiza a própria lição e planeja suas microssequências pelo `CourseForge`, sem materializar cards por padrão. Só no nível da microssequência a operação deixa de ser top-down e passa a atuar diretamente sobre o workbench local.

Essa distribuição não é arbitrária. Ela existe para conter a operação no menor escopo útil. Quanto mais localizado o problema, mais localizado deve ser o pedido.

## A lição como centro da orientação

A lição é o ponto mais importante da governança didática do app. É nela que se concentram campos como:

- `sourceGuideStructured`;
- `resourceTags`;
- `contentTypeTags`;
- `learningActionTags`;
- `supportLevel`;
- `presetId`;
- `domainMap`.

Na prática, isso significa que a qualidade da geração depende fortemente da qualidade da orientação presente na lição. Quando a lição está mal delimitada, a geração tende a perder foco. Quando a lição está bem orientada, o restante do fluxo fica mais previsível.

## Gerar estrutura

O painel contextual de geração já opera no fluxo estrutural único. Isso significa que o pedido pode atualizar a governança da lição e criar ou revisar microssequências planejadas no mesmo ciclo top-down. A materialização dos cards acontece depois, no runtime local de cada microssequência.

O objetivo desse nível continua sendo estruturar a trilha no menor escopo útil. Quando a lição já traz `domainMap`, `sourceGuideStructured` e sinais locais de cobertura, o `CourseForge` usa esses dados para decidir lacunas, progressão, prática, contraste e risco de redundância antes de aplicar o patch.

## Microssequências planejadas

No estado atual do produto, a trilha pode nascer com microssequências ainda vazias. Isso não significa erro nem conteúdo quebrado. Significa que a etapa foi planejada, mas ainda não foi materializada.

Essa decisão é importante porque permite que o usuário:

- veja a trilha antes de materializar tudo;
- escolha uma lição específica para começar;
- abra a próxima etapa do percurso sem depender de geração ampla do curso inteiro.

## O painel da microssequência

Ao abrir uma microssequência, o usuário entra no workbench. É ali que o estudo local, a revisão editorial e a materialização progressiva do conteúdo se encontram.

O fluxo normal é:

1. inspecionar a microssequência atual;
2. materializar, gerar, editar, expandir ou reformular localmente;
3. revisar a iteração aplicada;
4. aceitar ou excluir a iteração ativa.

Não existe mais uma camada separada de prévia privada. Se o resultado passa pelas validações locais, ele é aplicado diretamente e fica visível no próprio ambiente de trabalho.

## O que acontece durante o estudo

Uma vez dentro da microssequência, o AraLearn procura manter o estudo e a intervenção próximos. O usuário pode estudar, perceber um problema e pedir ajuda no próprio ponto em que o entendimento travou.

É isso que faz o fluxo bottom-up participar do runtime real: a autoria local não acontece só antes do estudo, mas também durante ele.

## O que entra no estudo

No modo de estudo, o AraLearn considera apenas material pronto para execução. Isso significa que:

- microssequências `draft` continuam fora do estudo;
- microssequências com `included: false` também ficam fora;
- o progresso é salvo localmente por caminho completo da lição.

Essa separação evita que estado de trabalho seja confundido com percurso executável.

## Fontes e anexos

O fluxo estrutural aceita texto e anexos para ingestão. Hoje isso cobre, entre outros formatos:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Quando a extração vier parcial, o sistema pode avisar. O objetivo não é prometer leitura perfeita de layout, e sim texto suficientemente utilizável para organização didática e grounding mínimo.

## Configuração de IA

O caminho normal de uso da IA é por API comum. `Codex CLI local` continua suportado, mas como integração mais avançada.

Antes de usar IA, convém:

1. abrir `Configuração da IA`;
2. escolher o modelo;
3. informar a chave da API, quando necessário;
4. testar o bridge local, se a escolha for `Codex CLI local`.

## O papel do usuário continua central

O AraLearn não elimina curadoria editorial. O usuário continua precisando revisar texto, confirmar fidelidade, ajustar orientação da lição e decidir quando uma microssequência já merece entrar no estudo.

Essa responsabilidade não é defeito da ferramenta. É parte da proposta do produto. O sistema existe para retirar atrito e oferecer estrutura externa, não para tomar posse do conteúdo no lugar do autor ou do estudante.

## Leituras complementares

- [Visão do produto](visao-do-produto.md)
- [Arquitetura](arquitetura.md)
- [Assistência por IA generativa](assistencia-por-ia.md)
- [Contrato público](aralearn-contract.md)
