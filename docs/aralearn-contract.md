# Contrato público do AraLearn

## Objetivo do contrato

O contrato público descreve a forma persistível do projeto AraLearn. Ele existe para:

- manter interoperabilidade;
- permitir importação e exportação;
- estabilizar a estrutura visível do produto;
- separar o que é dado do usuário do que é runtime interno.

O contrato público é deliberadamente menor do que a arquitetura interna.

## Envelope raiz

O documento público do projeto organiza uma árvore que parte de:

```text
project
```

e desce por:

```text
course -> module -> lesson -> microsequence -> card
```

Cada nível preserva seu papel semântico e estrutural.

## Curso

O curso é a unidade mais ampla de organização pública. Ele pode representar:

- disciplina;
- trilha temática;
- corpus;
- projeto formativo;
- conjunto instrumental.

O curso fornece contexto amplo, não governança didática fina.

## Módulo

O módulo agrupa partes do percurso dentro do curso. Ele é uma unidade intermediária de organização e navegação.

## Lição

A lição é o ponto central da governança local. Além de título e descrição, ela pode carregar orientação estruturada suficiente para guiar a organização pedagógica e a geração localizada.

### `sourceGuideStructured`

`sourceGuideStructured` representa a orientação didática legível pelo sistema. Pode incluir, conforme o caso:

- escopo;
- notação;
- passos esperados;
- erros comuns;
- exclusões;
- foco de prática.

### Tags e presets

O contrato também pode registrar presets e tags didáticas para orientar o comportamento do produto sem expor detalhes de runtime.

### `domainMap`

`domainMap` descreve o domínio conceitual local da lição: conceitos, relações, alvos de prática, comparações ou pré-requisitos relevantes.

## Microssequência

A microssequência é a unidade didática central do AraLearn. Ela reúne um pequeno conjunto de cards orientados por uma finalidade comum.

Uma microssequência pode nascer planejada antes de ter cards. Isso significa que ela já faz parte da trilha, ainda que o conteúdo interativo seja materializado depois.

### `status`

O campo `status` torna explícito o estado público da microssequência. Ele distingue, por exemplo, uma etapa ainda em preparação de uma etapa pronta para estudo.

### `included`

O campo `included` indica se aquela microssequência entra no fluxo estudável naquele momento.

### Microssequência planejada

Uma microssequência planejada sem cards é estado válido do contrato público. Ela não é erro nem lixo provisório. É uma etapa legítima da arquitetura pedagógica.

## Card

O card é a unidade de interação. Ele pode assumir diferentes formas de apresentação e prática, desde que permaneça dentro do contrato público aceito pelo app.

## Recursos públicos

O contrato aceita recursos públicos que façam sentido para o estudo e para a renderização local. Recursos de runtime interno, metadados operacionais de provider e detalhes de execução ficam fora do envelope público.

## `sourceRefs`

Quando presentes, `sourceRefs` registram ancoragem mínima do conteúdo em fontes usadas na geração ou curadoria. Isso contribui para inspeção e grounding.

## O que fica fora do contrato público

O contrato público não deve carregar:

- detalhes de provider;
- runtime autorado;
- estado interno transitório;
- políticas operacionais de execução;
- artefatos intermediários completos do motor.

Esses elementos pertencem à arquitetura interna.

## Relação com a organização estrutural e o runtime local

O mesmo contrato serve tanto para a trilha estrutural quanto para o estudo local. A diferença está no uso que o produto faz dele:

- na organização estrutural, ele representa a arquitetura do percurso;
- no runtime local, ele recebe materializações e intervenções situadas.

## Exemplos e leituras complementares

- [Exemplos JSON](examples/)
- [Arquitetura](arquitetura.md)
- [Rascunhos e microssequências](rascunhos-e-microssequencias.md)
