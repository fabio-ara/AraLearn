# Arquitetura do AraLearn

Este documento descreve a arquitetura do AraLearn no estado atual do repositório, mas sem reduzir o produto a inventário de arquivos. O interesse principal aqui é mostrar como o app organiza a relação entre contrato público, governança didática, pipeline estrutural, runtime local e providers.

## Leitura correta

O contrato público continua simples, mas a operação interna precisa ser rigorosa.

O AraLearn pode ser entendido como a composição de quatro camadas:

- um `core didático`, que define progressão, cobertura, contraste, prática e auditoria;
- uma `engine de produção`, que executa fases pequenas, reordenáveis e auditáveis;
- um `runtime de providers`, separado da lógica pedagógica;
- uma `superfície de uso`, em que estudo, geração, edição e revisão aparecem ao usuário.

## Princípio central

Uma das ideias fortes da arquitetura do AraLearn é evitar o salto bruto entre pedido humano amplo e resultado final aceito sem mediação. Em vez de delegar uma tarefa inteira a um prompt solto, o produto tenta quebrar a operação em especificações intermediárias menores, algo próximo do que, em engenharia, se reconhece como desenvolvimento orientado por especificação.

Na prática, isso significa trabalhar com artefatos como:

- intenção;
- escopo;
- ingestão de anexos;
- governança da lição;
- planos de lição;
- planos de microssequência;
- auditorias;
- contratos locais de geração;
- patch final.

A LLM não opera diretamente sobre a árvore inteira do projeto como se fosse autora soberana do sistema. Ela entra dentro desses envelopes menores.

## Contrato público

A estrutura pública continua sendo:

```text
project
  -> course
    -> module
      -> lesson
        -> microsequence
          -> card
```

Essa estrutura aparece:

- na persistência exportável;
- na navegação do usuário;
- na forma como o contexto é entregue à IA.

Ela não é apenas decoração hierárquica. Ela resolve um problema concreto: restringir contexto e dar posição semântica às unidades didáticas.

## Governança da lição

A lição concentra o principal núcleo de orientação do produto. Hoje, esse núcleo passa por campos como:

- `sourceGuideStructured`;
- `presetId`;
- `resourceTags`;
- `contentTypeTags`;
- `learningActionTags`;
- `supportLevel`;
- `domainMap`.

Essa camada tem dupla função:

- servir como orientação humana editável;
- restringir o espaço de decisão da LLM.

## Ingestão e parsing

O AraLearn não trata o envio bruto de documentos para LLM como solução suficiente. Antes da geração estrutural, o sistema tenta extrair texto utilizável e reduzir ruído.

Hoje o repositório já contempla ingestão de:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Para isso, o projeto usa bibliotecas open source já integradas ao runtime, como:

- `pdfjs-dist`;
- `mammoth`.

O objetivo dessa camada não é preservação visual perfeita do layout original, mas extração textual suficiente para grounding, planejamento e warnings auditáveis quando a fonte vier degradada.

## CourseForge

O `CourseForge` é o runtime público da geração estrutural.

Ele recebe:

- intenção;
- escopo (`project`, `course`, `module`, `lesson` ou `microsequence`);
- provider configurado;
- anexos ingeridos;
- projeto atual.

Ele pode produzir:

- artefatos intermediários;
- auditorias;
- patch validado;
- projeto atualizado.

## Top-down estrutural

No estado atual, o top-down atua nos escopos amplos:

- `project`;
- `course`;
- `module`;
- `lesson`.

Seu trabalho principal é:

- organizar a trilha;
- planejar microssequências;
- atualizar a governança local;
- validar ordem, cobertura, contraste e prática;
- compilar patch auditado.

O top-down atual não materializa cards por padrão. Essa decisão não é empobrecimento do produto; é clarificação de responsabilidade. A organização ampla fica no fluxo estrutural. A materialização didática fina se desloca para o runtime local.

## Runtime local da microssequência

O runtime local é a segunda metade da arquitetura atual.

Ele existe para permitir que o usuário trabalhe sobre uma microssequência concreta, planejada ou já pronta. Nesse nível, o app permite:

- materializar uma microssequência vazia;
- corrigir uma sequência fraca;
- expandir com mais prática, contraste ou explicação;
- reformular a proposta local;
- editar conteúdo durante o próprio estudo;
- abrir a próxima microssequência planejada.

Esse runtime é decisivo porque desloca a autoria para junto da prática.

## Artefatos intermediários

Os nomes internos variam por fase, mas a arquitetura já gira em torno de artefatos como:

- `intent`;
- `sourceLedger`;
- `lessonPlans`;
- `courseGraph`;
- `lessonGovernance`;
- `microsequencePlans`;
- `interventionPlan`;
- `microsequenceContracts`;
- `cardDrafts`;
- `patch`.

O ponto importante não é decorar a lista, e sim entender a arquitetura: a LLM trabalha sobre recortes estruturados, e não sobre um vazio textual genérico.

## Auditoria

O produto usa auditoria em vários níveis.

Isso pode incluir:

- validação estrutural do JSON;
- coerência didática local;
- checagem de cobertura e ordem;
- grounding mínimo quando houver fonte;
- validação semântica do patch antes da aplicação.

Essa camada é parte constitutiva da arquitetura. Sem ela, o AraLearn cairia facilmente na lógica do “prompt entra, texto sai”.

## Providers

Os providers ficam desacoplados da camada pedagógica.

Hoje o repositório já contempla:

- Gemini por API;
- `Codex CLI local` via bridge HTTP;
- provider falso de teste para validação offline da engine.

Essa separação é importante porque a didática do produto não pode depender do provider específico do momento.

## Interface e operação

A superfície principal do produto continua em `src/ui/`.

Ela reúne:

- navegação entre cursos, módulos, lições e microssequências;
- painel estrutural contextual de geração top-down;
- workbench local da microssequência;
- execução de cards;
- histórico de versões e reversão local;
- configuração de provider.

## O que o usuário vê e o que a LLM vê

É importante separar essas duas perspectivas.

O usuário vê:

- a hierarquia do curso;
- a governança editável da lição;
- microssequências planejadas ou prontas;
- cards e iterações;
- ações de materialização, correção, expansão e revisão.

A LLM vê:

- prompt contextual;
- artefatos JSON;
- restrições de formato;
- governança da lição;
- pedidos locais de intervenção;
- contratos de geração ou reparo.

Essa diferença é parte central do desenho do produto.

## Documento complementar

A referência de direção mais ampla continua em [arquitetura-alvo.md](./arquitetura-alvo.md), que funciona como documento de tese arquitetural do projeto. Este arquivo, por sua vez, descreve o que já está suficientemente consolidado para leitura pública do estado atual.
