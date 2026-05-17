# Contrato público do AraLearn

## O que é este contrato

O contrato público descreve a forma persistível do projeto AraLearn. Ele existe para:

- manter interoperabilidade;
- permitir importação e exportação;
- estabilizar a estrutura visível do produto;
- preservar uma linguagem autoral pública e legível;
- separar o que é material do usuário do que é runtime interno.

O contrato público é deliberadamente menor do que a arquitetura interna. Ele mostra o que precisa permanecer compreensível, editável e versionável.

## A árvore pública do projeto

O documento público do projeto organiza uma árvore que parte de:

```text
project
```

e desce por:

```text
course -> module -> lesson -> microsequence -> card
```

Cada nível preserva um papel semântico e estrutural. Essa forma não serve apenas para persistir dados: ela também sustenta a arquitetura de contexto do produto.

## Curso

O curso é a unidade mais ampla de organização pública. Ele pode representar disciplina, trilha temática, corpus, projeto formativo ou conjunto instrumental.

Ele oferece contexto amplo, não governança didática fina.

## Módulo

O módulo agrupa partes do percurso dentro do curso. Ele é unidade intermediária de organização e navegação.

## Lição

A lição é o ponto central de governança local. Além de título e descrição, ela pode carregar orientação estruturada suficiente para guiar organização pedagógica e geração localizada.

### `sourceGuideStructured`

`sourceGuideStructured` representa a orientação didática legível pelo sistema. Pode incluir, conforme o caso:

- escopo;
- notação;
- passos esperados;
- erros comuns;
- exclusões;
- foco de prática.

### Tags, presets e `domainMap`

O contrato também pode registrar presets, tags didáticas e um `domainMap` local para orientar o comportamento do produto sem expor toda a maquinaria interna.

`domainMap` descreve o domínio conceitual local da lição: conceitos, relações, alvos de prática, comparações ou pré-requisitos relevantes.

## Microssequência

A microssequência é a unidade didática central do AraLearn. Ela reúne um pequeno conjunto de cards orientados por uma finalidade comum.

Uma microssequência pode nascer planejada antes de ter cards. Isso significa que ela já faz parte da trilha, ainda que o conteúdo interativo seja materializado depois.

### `status`

O campo `status` torna explícito o estado público da microssequência. Ele distingue, por exemplo, uma etapa ainda em preparação de uma etapa pronta para estudo.

### `included`

O campo `included` indica se aquela microssequência entra no fluxo estudável naquele momento.

### Microssequência planejada

Uma microssequência planejada sem cards é estado válido do contrato público. Ela não é erro nem resíduo provisório. É etapa legítima da arquitetura pedagógica.

## Card

O card é a unidade de interação. Ele pode assumir diferentes formas de apresentação e prática, desde que permaneça dentro do contrato público aceito pelo app.

Esse ponto importa porque o AraLearn não trabalha apenas com texto corrido. O contrato público participa de uma linguagem autoral simples, capaz de representar formas distintas de conteúdo didático sem perder legibilidade para humanos.

## Recursos públicos e linguagem autoral

O contrato aceita recursos públicos que façam sentido para estudo e renderização local. Entre eles estão estruturas textuais, código, tabela, fluxograma, árvore, plano cartesiano e matriz.

O valor dessa escolha está em manter uma camada intermediária simples: suficientemente expressiva para o produto e suficientemente inteligível para pessoas e modelos de linguagem.

## `sourceRefs`

Quando presentes, `sourceRefs` registram ancoragem mínima do conteúdo em fontes usadas na geração ou curadoria. Isso contribui para inspeção, grounding e rastreabilidade.

## O que fica fora do contrato público

O contrato público não deve carregar:

- detalhes de provider;
- metadados internos de renderização e operação;
- estado interno transitório;
- políticas operacionais de execução;
- artefatos intermediários completos do motor;
- mecanismos internos de cálculo visual.

Esses elementos pertencem à arquitetura interna.

## Relação com o runtime

O mesmo contrato serve tanto para a trilha estrutural quanto para o estudo local. A diferença está no uso que o produto faz dele:

- na organização estrutural, ele representa a arquitetura do percurso;
- no runtime local, ele recebe materializações e intervenções situadas;
- na renderização, ele funciona como base autoral para saídas mais complexas.

## Exemplos e leituras complementares

- [Exemplos JSON](examples/)
- [Arquitetura](arquitetura.md)
- [Rascunhos e microssequências](rascunhos-e-microssequencias.md)
