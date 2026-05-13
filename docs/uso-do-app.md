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

No nível do curso, a geração por IA atua sobre módulos e lições. No nível do módulo, atua sobre lições. No nível da lição, atua sobre microssequências draft. Só no nível da microssequência a geração passa a atuar diretamente sobre os cards.

Essa distribuição não é arbitrária. Ela existe para conter a operação no menor escopo útil. Quanto mais localizado o problema, mais localizado deve ser o pedido.

## A lição como centro da orientação

A lição é o ponto mais importante da governança didática do app. É nela que se concentram campos como:

- `sourceGuideStructured`;
- `resourceTags`;
- `contentTypeTags`;
- `learningActionTags`;
- `supportLevel`;
- `presetId`.

Na prática, isso significa que a qualidade da geração depende fortemente da qualidade da orientação presente na lição. Quando a lição está mal delimitada, a geração tende a perder foco. Quando a lição está bem orientada, o restante do fluxo fica mais previsível.

Por isso, antes de exigir bons resultados da IA, convém verificar se a lição já explicita meta, notação, confusões prováveis e formatos didáticos coerentes com o que se pretende ensinar.

## Gerar microssequências na lição

Na tela da lição, o usuário pode pedir geração de microssequências ou geração com reposicionamento. Esse passo ainda não escreve os cards. Ele produz rascunhos.

Esses rascunhos:

- entram na árvore real da lição;
- nascem fora do estudo;
- não abrem automaticamente o painel da microssequência;
- podem carregar metadados didáticos quando a lição já dispõe de mapa de domínio.

O objetivo desse nível não é redigir o material final, mas estruturar a trilha da lição: que microssequências faltam, que lacunas ainda existem, que sequência precisa ser reorganizada.

## O painel da microssequência

Ao abrir uma microssequência, o usuário entra no workbench. É ali que o estudo local, a revisão editorial e a geração de cards se encontram.

O fluxo normal é:

1. inspecionar a microssequência atual;
2. pedir geração ou edição de cards;
3. revisar a iteração aplicada;
4. aceitar ou excluir a iteração ativa.

Não existe mais uma camada separada de prévia privada. Se o resultado passa pelas validações locais, ele é aplicado diretamente e fica visível no próprio ambiente de trabalho.

## O que acontece quando se pede geração de cards

Quando o usuário pede geração de cards, o app não envia um pedido livre do tipo “crie uma boa explicação”. Ele segue um pipeline mais contido.

Primeiro, monta um contrato de planejamento. Depois, a LLM devolve um plano enxuto. O app valida esse plano e monta, por conta própria, o `cardPlan` determinístico. Só então a LLM preenche o conteúdo correspondente às posições já decididas pelo sistema. Em seguida, o app valida estrutura, coerência didática local e vínculo mínimo com fonte, quando houver. Se surgir uma falha estrutural ou declarativa relevante, pode haver nova iteração automática antes da entrega final.

Do ponto de vista do usuário, isso significa que a geração não é um salto único; é uma operação mediada pelo próprio sistema.

## Como o estudo funciona

No modo de estudo, o AraLearn considera apenas material pronto para execução. Isso significa que:

- microssequências `draft` ficam fora do estudo;
- microssequências com `included: false` também ficam fora do estudo;
- o progresso é salvo localmente por caminho completo da lição.

Essa separação evita que rascunho seja confundido com percurso executável.

## Formatos de apresentação e prática

Os cards podem assumir formas diferentes conforme o domínio e a tarefa: explicação, lacuna, escolha, código, tabela, árvore de diretórios, fluxograma, plano cartesiano ou matriz. A escolha desses formatos não deveria ser tratada como efeito visual, mas como escolha didática. Alguns domínios pedem mais leitura comparativa; em outros, execução operacional; em outros, visualização espacial ou procedimental. O critério correto não é “variedade por variedade”, mas adequação entre forma de representação e o tipo de operação cognitiva que se quer favorecer.

## Importar, exportar e preservar

O AraLearn trabalha com dois formatos principais. `aralearn.contract` é o formato estrutural e portátil do conteúdo. `aralearn.storage` é o backup local completo, que preserva também progresso e estados auxiliares.

Em termos práticos:

- exporte `contract` quando o objetivo é portar ou publicar estrutura;
- exporte `storage` quando o objetivo é preservar o ambiente local completo.

## Snapshots

Snapshots são explícitos. O app não os grava automaticamente a cada alteração. Isso é intencional. Versionar tudo de modo invisível pode gerar ruído e obscurecer a responsabilidade do usuário sobre o que quer preservar.

No uso normal, snapshots servem para congelar estados relevantes, comparar trajetórias e manter reversibilidade sem transformar cada gesto em evento de versionamento formal.

## Configuração de IA

O caminho normal de uso da IA é Gemini/API comum. `Codex CLI local` continua suportado, mas como integração mais avançada.

Antes de usar IA, convém:

1. abrir `Configuração da IA`;
2. escolher o modelo;
3. informar a chave da API, quando necessário;
4. testar o bridge local, se a escolha for `Codex CLI local`.

## O que esperar da IA, e o que não esperar

No AraLearn, a IA:

- não decide sozinha a arquitetura didática;
- não escolhe livremente o percurso;
- não controla o `cardPlan`;
- não deve ser usada para produzir resumo genérico como finalidade principal.

Ela funciona melhor quando o pedido é específico, a lição já está bem orientada e a microssequência cobre um ponto delimitado. Funciona pior quando o pedido é amplo demais, quando falta orientação local ou quando se espera que o modelo “entenda o domínio inteiro” sem mediação do app.

## O papel do usuário continua central

O AraLearn não elimina curadoria editorial. O usuário continua precisando revisar texto, confirmar fidelidade, ajustar orientação da lição e decidir quando um rascunho já merece entrar no estudo.

Essa responsabilidade não é defeito da ferramenta. É parte de sua proposta. O sistema existe para retirar atrito e oferecer estrutura externa, não para tomar posse do conteúdo em lugar do autor ou do estudante.
