# Contrato público do AraLearn

## O que é o contrato público

O contrato público descreve a forma persistível de um projeto AraLearn.

Ele define o que precisa permanecer compreensível, exportável, importável e editável. A arquitetura interna pode ter mais detalhes, mas o contrato público deve ser estável o bastante para que o conteúdo continue pertencendo ao usuário.

## Funções do contrato

O contrato existe para:

- representar a árvore do projeto;
- preservar uma linguagem autoral legível;
- permitir importação e exportação;
- separar conteúdo do usuário de estado interno do app;
- facilitar validação;
- permitir versionamento;
- tornar a assistência por IA mais governável.

## Árvore pública

A forma geral é:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

Cada nível tem papel próprio.

## Projeto

O projeto reúne cursos e metadados gerais. Ele é a unidade exportável mais ampla.

## Curso

O curso representa um campo de estudo: disciplina, prova, trilha temática, corpus ou projeto formativo.

Ele oferece contexto amplo, mas não precisa carregar toda a orientação didática fina.

## Módulo

O módulo organiza partes do curso. Ele pode representar blocos temáticos, unidades curriculares, etapas de uma prova ou conjuntos de habilidades.

## Lição

A lição é o ponto de governança local.

Além de título e descrição, ela pode carregar orientação estruturada para o sistema e para o usuário. Essa orientação pode incluir:

- escopo;
- objetivos;
- notação;
- fontes;
- tipos de exercício;
- erros comuns;
- limites do recorte;
- relações conceituais relevantes.

Essa orientação não deve ser tratada como simples texto de apresentação. Ela participa da geração e da revisão de microssequências.

## `sourceGuideStructured`

`sourceGuideStructured` representa orientação didática estruturada. Ele pode registrar o que deve ser respeitado quando o app organiza ou materializa conteúdo.

Exemplos de campos possíveis:

- `scope`: o que entra na etapa;
- `notation`: formas e símbolos preferidos;
- `expectedSteps`: passos esperados;
- `commonErrors`: erros comuns;
- `exclusions`: o que não deve entrar;
- `practiceFocus`: foco de exercício;
- `sourceNotes`: observações retiradas das fontes.

O contrato deve evitar fallback implícito que confunda orientação didática com descrição genérica. Se uma orientação estruturada não existe, o sistema deve tratar essa ausência com clareza.

## `domainMap`

`domainMap` pode registrar o mapa conceitual local da lição. Ele ajuda a representar conceitos, relações, contrastes, pré-requisitos e alvos de prática.

Esse campo é útil quando a geração precisa distinguir termos próximos ou manter coerência entre etapas.

## Microssequência

A microssequência é a unidade didática principal.

Ela pode ter título, descrição, status, inclusão no fluxo de estudo, orientação local e cards. Uma microssequência pode existir sem cards: nesse caso, está planejada, mas ainda não materializada.

## `status`

O status indica a condição pública da microssequência. Exemplos possíveis:

- planejada;
- em rascunho;
- pronta para estudo;
- arquivada.

O app pode usar esse estado para decidir o que aparece no fluxo de estudo.

## `included`

`included` indica se aquela microssequência participa do fluxo estudável naquele momento.

Isso permite manter etapas no projeto sem obrigar o usuário a estudá-las agora.

## Card

O card é a unidade de interação. Ele pode apresentar informação, pedir resposta, criar lacuna, mostrar código, exibir tabela, representar fluxograma, matriz ou outro recurso previsto.

Um card deve permanecer ligado à microssequência. Sua qualidade depende da função que cumpre dentro da sequência.

## Recursos públicos

O contrato aceita recursos que preservam legibilidade e prática. Entre eles:

- `say`: explicação ou enunciado;
- `ask`: pergunta;
- `code`: código ou pseudocódigo;
- `table`: tabela;
- `flow`: fluxograma;
- `tree`: árvore;
- `plane`: plano cartesiano;
- `matrix`: matriz;
- lacunas e variações de prática quando aceitas pelo app.

Esses recursos formam uma linguagem autoral simples. O objetivo é permitir que pessoas e IA trabalhem sobre uma representação comum.

## `sourceRefs`

`sourceRefs` registram vínculos com fontes usadas na criação ou revisão do conteúdo. Eles ajudam na rastreabilidade e na auditoria.

Não precisam transformar o contrato em sistema bibliográfico complexo. Devem preservar o vínculo mínimo necessário para inspeção.

## O que fica fora

O contrato público não deve carregar:

- estado transitório de interface;
- detalhes internos do motor de apresentação;
- credenciais;
- configuração privada de provedor;
- respostas intermediárias completas de IA;
- cálculos visuais de baixo nível;
- dados que pertencem apenas à execução temporária.

Esses elementos podem existir internamente, mas não devem contaminar o material exportável do usuário.

## Validação

Todo projeto importado ou gerado deve passar por validação. Quando possível, o app pode reparar problemas simples. Quando o erro compromete sentido ou estrutura, deve mostrar o problema ao usuário.

A validação preserva a integridade do projeto e evita que uma resposta malformada de IA destrua material existente.

## Critério de bom contrato

O contrato público é bom quando:

- uma pessoa consegue reconhecer a estrutura do curso;
- o app consegue renderizar e estudar o conteúdo;
- a IA consegue produzir material dentro de limites claros;
- o projeto pode ser exportado, importado e versionado;
- detalhes internos não se misturam com autoria do usuário.
