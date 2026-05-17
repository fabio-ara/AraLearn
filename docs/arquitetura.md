# Arquitetura do AraLearn

Este documento descreve a arquitetura do produto no estado atual do repositorio. Ele substitui a ideia antiga de "refundacao" por uma descricao operacional do que ja existe.

## Leitura curta

O AraLearn pode ser lido como a composicao de quatro camadas:

1. `contrato publico`: estrutura exportavel e editavel pelo usuario;
2. `core didatico`: regras de orientacao, cobertura, progressao e formatos;
3. `engine de geracao`: pipeline `CourseForge` e runtime local;
4. `superficie de uso`: navegacao, estudo, edicao e configuracao de provider.

## Principio central

A arquitetura atual e inspirada por uma logica proxima de `specification-driven development`.

Em vez de delegar uma tarefa ampla diretamente a uma LLM, o AraLearn tenta quebrar a operacao em especificacoes intermediarias pequenas:

- intencao;
- escopo;
- anexos ingeridos;
- governanca da licao;
- planos de microssequencia;
- contratos locais de geracao;
- auditorias;
- patch final.

O sistema nao trata a resposta da LLM como produto final. Ele a trata como insumo para uma pipeline controlada.

## Estrutura publica

O contrato publico segue esta hierarquia:

```text
project
  -> course
    -> module
      -> lesson
        -> microsequence
          -> card
```

Essa estrutura e ao mesmo tempo:

- forma de persistencia;
- forma de navegacao;
- forma de contexto para a IA.

O contrato publico continua pequeno de proposito. Estados de runtime, historico de iteracoes e detalhes de provider ficam fora dele.

## Camada de governanca didatica

A licao concentra o principal nucleo de governanca usado pela geracao. Os campos mais importantes sao:

- `sourceGuideStructured`
- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`
- `domainMap`

Essa camada faz duas coisas ao mesmo tempo:

- fornece orientacao humana editavel;
- restringe o espaco de decisao da LLM.

## Camada de ingestao

Antes da geracao estrutural, o sistema tenta transformar anexos em texto utilizavel.

Hoje a base do repositorio ja opera com:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Parsers open source ja integrados:

- `pdfjs-dist`
- `mammoth`

O objetivo dessa camada nao e preservar diagrama ou layout perfeitamente. E produzir material textual suficiente para grounding e planejamento.

## `CourseForge`: engine estrutural

O `CourseForge` e o runtime publico da geracao top-down.

Ele recebe:

- `intent`
- escopo (`project`, `course`, `module`, `lesson` ou `microsequence`)
- provider configurado
- artefatos estruturados
- projeto atual

Ele devolve:

- artefatos intermediarios;
- auditorias;
- patch validado;
- projeto atualizado.

## Artefatos principais

Os nomes exatos podem variar por fase, mas os artefatos centrais hoje giram em torno de:

- `intent`
- `sourceLedger`
- `lessonPlans`
- `courseGraph`
- `lessonGovernance`
- `microsequencePlans`
- `interventionPlan`
- `microsequenceContracts`
- `cardDrafts`
- `patch`

Esses artefatos sao importantes porque mostram que a LLM nao opera diretamente sobre a arvore inteira do produto de uma vez.

## Semantica nova do top-down

No estado atual, o top-down:

- gera estrutura auditada;
- planeja microssequencias;
- nao materializa cards por padrao.

Isso vale para os escopos amplos:

- `project`
- `course`
- `module`
- `lesson`

O escopo `microsequence` continua sendo o ponto de materializacao local de cards.

## Runtime local da microssequencia

O runtime local e a segunda metade da arquitetura do produto.

Ele recebe uma microssequencia real ou planejada e permite:

- materializar conteudo;
- corrigir;
- expandir;
- reformular;
- editar localmente;
- abrir a proxima microssequencia planejada.

Esse runtime existe para deslocar a autoria para junto do estudo.

## Pipeline local

No fluxo local, a operacao deixa de ser reorganizacao ampla e passa a ser intervencao situada.

O runtime monta um contrato local com:

- contexto da licao;
- titulo e tags da microssequencia;
- tipo didatico;
- pedido do usuario;
- anexos locais, quando houver.

Depois disso:

1. envia o pedido ao provider;
2. valida a resposta;
3. registra a iteracao;
4. aplica a versao gerada;
5. deixa o usuario aceitar ou descartar.

## Auditoria

O sistema usa auditoria em varios pontos.

No minimo, isso inclui:

- validacao estrutural do JSON;
- checagens de coerencia didatica local;
- checagens de cobertura e ordem no fluxo estrutural;
- grounding minimo quando ha fontes;
- validacao semantica do patch antes da aplicacao.

O valor da arquitetura esta justamente aqui: a LLM nao escreve diretamente no projeto sem passar por mediacao.

## Providers

Os providers ficam desacoplados da camada pedagogica.

O repositorio hoje ja contempla:

- Gemini por API;
- `Codex CLI local` via bridge HTTP;
- provider falso de teste para validacao offline.

Esse desacoplamento permite:

- testar pipeline sem depender sempre de provider real;
- trocar provider sem reescrever a didatica;
- manter a engine acima da infraestrutura de inferencia.

## UI e runtime

A superficie de uso principal fica em `src/ui/`.

Ela reune:

- navegacao entre cursos, modulos, licoes e microssequencias;
- painel estrutural contextual de geracao top-down;
- workbench local da microssequencia;
- estudo em runtime;
- historico de versoes e estados locais;
- configuracao de provider.

## O que o usuario ve e o que a LLM ve

E importante separar essas duas perspectivas.

O usuario ve:

- hierarquia do curso;
- licao e governanca editavel;
- microssequencias planejadas ou prontas;
- cards e iteracoes;
- botoes de materializacao, correcao e expansao.

A LLM ve:

- prompt contextual;
- contratos JSON;
- artefatos parciais;
- restricoes de formato;
- orientacao derivada da licao;
- pedidos locais de intervencao.

Essa diferenca e parte central da arquitetura.

## Relacao com o contrato publico

O contrato publico nao precisa expor toda a engine. Ele registra a estrutura que o usuario possui e edita.

Em especial:

- o contrato nao precisa carregar estado interno de fase;
- o contrato nao precisa carregar detalhes de provider;
- o contrato nao precisa carregar runtime autorado da UI;
- o contrato pode continuar legivel e portavel.

## O que a arquitetura tenta evitar

Ela tenta evitar quatro erros comuns:

1. pedir ao modelo que invente a didatica inteira em texto livre;
2. misturar planejamento estrutural com materializacao local sem fronteira clara;
3. tratar fluencia textual como prova de qualidade didatica;
4. acoplar o produto inteiro a um unico provider ou a uma unica fase de geracao.

## Mapa de leitura complementar

- [Visao do produto](visao-do-produto.md)
- [Assistencia por IA](assistencia-por-ia.md)
- [Guia de uso do app](uso-do-app.md)
- [Contrato publico](aralearn-contract.md)
- [Fundamentos e evidencias](fundamentos-e-evidencias.md)
