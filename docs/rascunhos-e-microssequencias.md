# Rascunhos e microssequências

Este documento descreve como o AraLearn cria, revisa e consolida rascunhos de microssequências dentro da estrutura real de cursos.

Ele registra a implementação pública atual.

## Função dos rascunhos

Rascunhos permitem transformar uma dúvida do usuário em unidades de autoria sem inserir material incompleto no modo de estudo.

A microssequência continua sendo a unidade mínima de autoria e estudo. Ela nasce dentro de uma lição e pode ficar em três situações relevantes:

- `draft`: rascunho visível na estrutura do curso, mas fora da execução;
- `ready`: microssequência pronta para entrar no modo de estudo por cards;
- `included: false`: microssequência visível, mas removida da execução do curso.

## Geração contextual

A criação de rascunhos acontece pelo painel contextual aberto no nível da lição.

Fluxo:

1. o usuário navega até a lição desejada;
2. o usuário abre a ação contextual de geração;
3. o usuário escreve uma dúvida, um pedido ou uma intenção de organização;
4. o AraLearn chama o serviço de IA generativa para planejar uma escada de microssequências;
5. a resposta é validada como JSON;
6. cada item válido da escada vira uma microssequência `draft` dentro da lição selecionada.

Na home, no curso e no módulo, a assistência estrutural atua em outro nível: ela propõe cursos, módulos e lições. A criação de microssequências `draft` fica reservada à lição.

## Árvore estrutural

A árvore de cursos continua sendo a fonte de verdade da estrutura estudável:

```text
Curso
  -> Módulo
    -> Lição
      -> Microssequência
        -> Cards
```

Rascunhos aparecem no mesmo lugar em que serão consolidados, com marcador visual de estado.

Essa escolha evita uma fila paralela fora da estrutura real. O contexto da autoria vem da posição do material na hierarquia, não de uma lista solta de pedidos anteriores.

## Painel da microssequência

O painel da microssequência é o espaço de revisão e edição.

Ele reúne:

- preview da versão em uso;
- navegação pelos cards;
- alternância entre `Preview` e `Edição`;
- geração ou edição por pedido textual;
- anexos temporários para o pedido atual;
- ações de movimentação, exclusão e edição estrutural;
- controle da iteração gerada atual quando houver uma alteração pendente.

Ao abrir uma microssequência `draft`, o painel pode gerar cards usando o título da microssequência e o contexto de curso, módulo e lição. Depois que uma versão válida com cards é aceita como conteúdo em uso e a microssequência é marcada como pronta, ela pode passar a `ready`.

## Aplicação e reversão de cards

Na microssequência, a geração e a edição assistidas de cards não criam mais uma prévia separada da árvore oficial.

O comportamento atual é:

1. o pedido é enviado ao pipeline de planejamento e geração;
2. a resposta validada substitui diretamente os cards da microssequência aberta;
3. a interface registra uma iteração local auxiliar;
4. quando essa iteração é nova, o painel expõe dois CTAs externos ao card:
   - aceitar a iteração atual;
   - excluir a iteração atual.

Excluir a iteração atual restaura imediatamente a versão anterior guardada em `localStorage`. Esse mecanismo opera hoje no nível da microssequência em uso, não como versionamento público exportável card a card.

## Execução

O modo de estudo ignora rascunhos.

Regras:

- microssequências `draft` não entram no play;
- microssequências com `included: false` também não entram no play;
- lições, módulos e cursos coletam apenas microssequências `ready` incluídas;
- quando não há conteúdo pronto no escopo selecionado, a interface informa que não há microssequências prontas para estudar ali.

## Persistência

Rascunhos são persistidos no próprio local em que foram criados: dentro da lição selecionada.

O formato persistido é o mesmo formato estrutural atual do projeto. Cada microssequência precisa declarar `status` explicitamente como `draft` ou `ready`.

Iterações locais da microssequência, ponteiros de versão em uso e anexos de sessão não entram nesse contrato público. Eles vivem em persistência auxiliar da interface.

## Decisões futuras

Pontos ainda dependentes de pesquisa e teste:

- como aproximar melhor geração bottom-up e navegação estrutural sem duplicar fluxos;
- como combinar melhor orientação top-down com criação bottom-up para reduzir desvio de finalidade;
- como registrar rastreabilidade entre pedido, fonte e cards;
- quando expor versões locais no formato exportável;
- como medir qualidade didática antes de marcar uma microssequência como pronta;
- como orientar modelos mais robustos para gerar fluxogramas;
- como apoiar revisão de cursos completos a partir de dúvidas pontuais do estudante.
