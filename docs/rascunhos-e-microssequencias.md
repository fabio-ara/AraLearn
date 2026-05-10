# Rascunhos e microssequências

Este documento descreve como o AraLearn cria, revisa e consolida rascunhos de microssequências dentro da estrutura real de cursos.

Ele registra a implementação pública atual. A documentação não assume ainda a oficina como curso especial na home, porque esse fluxo não está entregue no código deste repositório.

## Função dos rascunhos

Rascunhos permitem transformar uma dúvida do usuário em unidades de autoria sem inserir material incompleto no modo de estudo.

A microssequência continua sendo a unidade mínima de autoria e estudo. Ela nasce dentro de uma lição e pode ficar em dois estados:

- `draft`: rascunho visível na estrutura do curso, mas fora da execução;
- `ready`: microssequência pronta para entrar no modo de estudo por cards.
- `included: false`: microssequência visível, mas removida da execução do curso.

## Aba Gerar

A aba `Gerar` é a entrada para criação de rascunhos.

Fluxo:

1. o usuário escolhe curso, módulo e lição;
2. o usuário escreve uma dúvida ou comentário;
3. o AraLearn chama o serviço de IA generativa para planejar uma escada de microssequências;
4. a resposta é validada como JSON;
5. cada item da escada vira uma microssequência `draft` dentro da lição selecionada.

A aba `Gerar` não mantém uma lista permanente da escada. Depois da criação, ela mostra apenas um feedback breve e permite ir para a aba `Cursos`.

Isso significa que o fluxo bottom-up atual é dividido em duas superfícies:

1. criação do rascunho na home;
2. revisão e consolidação na árvore de cursos.

## Aba Cursos

A aba `Cursos` é a fonte de verdade da estrutura estudável:

```text
Curso
  -> Módulo
    -> Lição
      -> Microssequência
        -> Cards
```

Rascunhos aparecem no mesmo lugar em que serão consolidados, com marcador visual `rascunho`.

Essa escolha evita uma fila separada da estrutura real. O contexto da autoria vem da posição do material na hierarquia, não de tags, nível ou audiência declarados pelo usuário.

Ao mesmo tempo, esse desenho ainda cobra do usuário a lembrança de onde o rascunho foi criado. A aplicação ajuda pelo contexto estrutural, mas a transição entre `Gerar` e `Cursos` ainda é um ponto de fricção.

## Painel da microssequência

O painel da microssequência é o espaço de revisão e edição.

Ele reúne:

- preview da versão ativa;
- navegação pelos cards;
- alternância entre `Preview` e `Edição`;
- edição por pedido textual;
- versões locais;
- geração ou revisão de cards;
- anexos temporários para o pedido atual;
- ações de movimentação, exclusão e edição estrutural.

Ao abrir uma microssequência `draft`, o painel pode gerar cards usando o título da microssequência e o contexto de curso, módulo e lição. Depois que uma versão válida com cards é aceita, a microssequência pode mudar para `ready`.

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

Versões locais da microssequência e anexos de sessão não entram nesse contrato público. Eles vivem em persistência auxiliar da interface.

## Decisões futuras

Pontos ainda dependentes de pesquisa e teste:

- como aproximar melhor geração bottom-up e navegação estrutural sem duplicar fluxos;
- como combinar melhor orientação top-down com criação bottom-up para reduzir desvio de finalidade;
- como registrar rastreabilidade entre pedido, fonte e cards;
- quando expor versões locais no formato exportável;
- como medir qualidade didática antes de marcar uma microssequência como pronta;
- como orientar modelos mais robustos para gerar fluxogramas;
- como apoiar revisão de cursos completos a partir de dúvidas pontuais do estudante.
