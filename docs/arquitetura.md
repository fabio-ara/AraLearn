# Arquitetura do AraLearn

## Ideia geral

O AraLearn não foi desenhado para enviar um pedido amplo a um modelo de linguagem e tomar a resposta como produto final. Sua arquitetura tenta colocar mais inteligência no sistema como um todo: estrutura pública do projeto, orientação da lição, ingestão de fontes, linguagem autoral, contratos, auditoria, validação e aplicação controlada de mudanças.

Em termos simples, o app procura organizar a tarefa antes de pedir texto.

## Estrutura pública como arquitetura de contexto

O contrato público organiza o conteúdo em:

```text
projeto -> curso -> módulo -> lição -> microssequência -> card
```

Essa hierarquia tem função arquitetural forte. Ela serve ao mesmo tempo para:

- persistência do material;
- navegação do usuário;
- contextualização das operações de geração e edição;
- continuidade entre planejamento amplo e intervenção local.

O modelo não trabalha “sobre qualquer coisa”. Ele trabalha sobre um ponto situado nessa estrutura e, por isso, pode herdar contexto do que veio antes, do que está ao lado e do que ainda falta cobrir.

## A linguagem autoral simples

Outra peça central da arquitetura é a linguagem autoral simples do produto. Em vez de depender apenas de texto corrido ou de formatos visuais de baixo nível, o AraLearn representa conteúdo em estruturas legíveis e editáveis, como `say`, `ask`, `code`, `table`, `flow`, `tree`, `plane` e `matrix`.

Essa escolha é importante por três razões:

- ela é compreensível para pessoas;
- ela é operável por modelos de linguagem;
- ela permite ao runtime renderizar experiências mais complexas a partir de uma base intermediária relativamente simples.

No caso do fluxograma, por exemplo, a representação autoral não precisa carregar manualmente toda a geometria final. O runtime calcula nós, conexões, layout e prática interativa a partir da descrição estrutural.

## As camadas principais

### Core didático

O core didático reúne as regras que definem o que conta como progressão aceitável, prática suficiente, contraste útil, revisão legítima, continuidade de trilha e microssequência bem formada.

Essa camada existe para que o comportamento do produto não dependa apenas do provider ou do modelo selecionado.

### Engine de produção

O motor de geração, hoje concentrado no `CourseForge`, executa fases menores, auditáveis e retomáveis. Em vez de uma operação única, ele pode separar ingestão, interpretação da intenção, planejamento estrutural, auditoria, reparo, compilação de patch, validação e aplicação.

Essa lógica aproxima o produto de uma arquitetura specification-driven: contratos e etapas explícitas reduzem ambiguidade e permitem governar melhor o que muda no projeto.

### Runtime de providers

Os providers cuidam da parte operacional:

- envio de prompt e anexos;
- adaptação ao modelo;
- retries, timeout e fallback;
- integração por API;
- integração local via `Codex CLI`.

Eles são importantes, mas não devem definir sozinhos a didática, a representação do conteúdo nem a estrutura do percurso.

### Runtime de estudo e edição

A microssequência não é apenas um lugar onde cards aparecem. Ela é a superfície em que o usuário estuda, revisa, corrige, expande e reformula conteúdo.

Por isso, o runtime local da microssequência é parte central da arquitetura do produto, e não camada decorativa de interface.

## Ingestão, grounding e divisão da tarefa

Antes de acionar o modelo, o AraLearn procura extrair e normalizar o texto das fontes. Hoje o projeto já usa:

- `pdfjs-dist`, para `PDF`;
- `mammoth`, para `DOCX`.

O objetivo não é reconstruir visualmente o documento, mas aproveitar o texto como base para organização didática, grounding, auditoria e uso mais cuidadoso de contexto.

Isso também ajuda a administrar orçamento de tokens. Parte do trabalho é resolvida por parsing e preparação local; parte segue para o modelo já com recorte melhor definido.

## Parametrização e autoria

A arquitetura do AraLearn procura manter o produto utilizável para quem quer simplicidade e também fértil para quem quer autoria mais forte.

Por isso, há espaço para parametrização de provider, modelo, perfis, contratos e conteúdo dos prompts, sem que a superfície principal do app precise se transformar num painel confuso para o usuário comum.

## Por que patch importa

Quando o sistema altera o projeto, a mudança não deveria ser uma substituição cega sempre que possível. A aplicação por patch torna a alteração mais legível, mais auditável e mais segura, sobretudo num produto em que o material pode ser estudado, editado e versionado localmente.

## Operação local e continuidade

O AraLearn mantém o projeto salvo no dispositivo do usuário. Essa persistência local permite continuar navegando e estudando mesmo sem internet, desde que o conteúdo já esteja materializado.

Quando entra em cena um modelo remoto, a conexão volta a ser necessária. A arquitetura, assim, combina autonomia local para continuidade do estudo com dependência pontual de rede para operações criativas.
