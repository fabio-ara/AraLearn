# Arquitetura do AraLearn

## A ideia geral

O AraLearn não foi desenhado para enviar um pedido solto a uma LLM e tomar a resposta como produto final. Sua arquitetura tenta colocar mais inteligência no sistema como um todo: estrutura do projeto, orientação da lição, ingestão de fontes, contratos, auditoria, validação e aplicação controlada do resultado.

Em termos simples, isso significa que o app procura organizar a tarefa antes de pedir texto.

## Estrutura pública do projeto

O contrato público organiza o conteúdo em:

```text
projeto -> curso -> módulo -> lição -> microssequência -> card
```

Essa hierarquia é importante porque serve a três coisas ao mesmo tempo:

- persistência do material;
- navegação do usuário;
- contextualização das operações de geração e edição.

O modelo não trabalha “sobre qualquer coisa”. Ele trabalha sobre um ponto localizado nessa estrutura.

## As camadas principais

### Core didático

O core didático reúne as regras que dizem o que conta como progressão aceitável, prática suficiente, contraste útil, revisão legítima e microssequência bem formada.

Essa camada existe para que o comportamento do produto não dependa apenas do modelo ou do provider.

### Engine de produção

O motor de geração, hoje concentrado no `CourseForge`, executa fases menores e auditáveis. Ele permite separar ingestão, interpretação do pedido, planejamento estrutural, geração localizada, auditoria, reparo, compilação de patch e aplicação.

Essa lógica é próxima de specification-driven development: o sistema usa contratos e etapas explícitas para reduzir ambiguidade e manter mais controle sobre o que será alterado no projeto.

### Runtime de providers

Os providers cuidam da parte operacional:

- envio de prompt e anexos;
- adaptação ao modelo;
- retries, timeout e fallback;
- integração por API;
- integração local via `Codex CLI`.

Eles são importantes, mas não devem definir a didática.

### Runtime de estudo e edição

A microssequência não é apenas um lugar onde cards aparecem. Ela é a superfície em que o usuário estuda, revisa, corrige, expande e reformula conteúdo.

Por isso, o runtime local da microssequência é parte central da arquitetura do produto, e não acessório de interface.

## O papel da lição

A lição é o ponto mais importante de governança local. É ali que o app concentra objetivo, foco de prática, convenções, notação, limites e possíveis erros comuns.

Essa orientação ajuda o sistema a produzir saídas mais situadas e também facilita auditoria posterior. Em vez de depender só do prompt do momento, o produto preserva uma memória didática do contexto em que cada microssequência faz sentido.

## Ingestão e grounding

Antes de acionar o modelo, o AraLearn procura extrair e normalizar o texto das fontes. Hoje o projeto já usa:

- `pdfjs-dist`, para `PDF`;
- `mammoth`, para `DOCX`.

O objetivo não é reconstruir visualmente o documento, mas aproveitar o texto como base para organização didática, grounding e verificação.

Há aqui elementos de recuperação localizada de informação, mas o produto não se resume a um fluxo RAG clássico. O material importado serve menos para “responder perguntas sobre o documento” e mais para sustentar uma trilha de estudo editável.

## Por que patch importa

Quando o sistema altera o projeto, ele não deveria substituir cegamente blocos inteiros de conteúdo sempre que possível. A aplicação por patch existe para tornar a mudança mais legível, auditável e segura.

Isso é especialmente importante num app em que o usuário pode estudar, editar e versionar o material localmente.

## Operação local e continuidade

O AraLearn mantém o projeto salvo no dispositivo do usuário. Essa persistência local permite continuar navegando e estudando mesmo sem internet, desde que o conteúdo já esteja materializado.

Quando entra em cena uma LLM remota, a conexão volta a ser necessária. A arquitetura, portanto, combina autonomia local para continuidade do estudo com dependência pontual de rede para operações criativas.
