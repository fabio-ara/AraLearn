# Contrato público do AraLearn

## Finalidade

O contrato público define a forma persistível de um projeto AraLearn. Ele deve ser legível, exportável, importável e estável o bastante para que o material continue pertencendo ao usuário.

O motor interno pode usar artefatos ricos durante uma geração, mas nem tudo isso deve ir para o contrato público.

## Árvore

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

## Projeto

O projeto é a unidade exportável mais ampla. Ele reúne cursos e metadados gerais.

Não deve guardar credenciais, estado transitório de UI nem respostas intermediárias completas de IA.

## Curso

Curso representa um campo de estudo: disciplina, prova, tema, corpus, documentação ou projeto.

Ele organiza o escopo amplo. A governança didática fina aparece principalmente na lição.

## Módulo

Módulo divide o curso em blocos. Ele ajuda a navegação e o planejamento, mas não precisa conter conteúdo estudável diretamente.

## Lição

A lição é o ponto de governança didática local.

Ela pode conter:

- título e descrição;
- orientação estruturada;
- fontes ou referências;
- `domainMap`;
- microssequências.

### `sourceGuideStructured`

`sourceGuideStructured` registra orientação didática estruturada, como escopo, notação, erros comuns, foco de prática e limites do recorte.

Ele ajuda o top-down e o bottom-up a não começarem do zero.

### `domainMap`

`domainMap` é o mapa semântico interno da lição. Ele pode conter itens de domínio e variantes de prática.

Um item de domínio pode registrar:

- `id`;
- `label`;
- `kind`;
- `priority`;
- `status`;
- `sourceRefs`;
- `expectedEvidence`;
- `commonErrors`;
- `prerequisites`;
- `representations`;
- `assessmentFormats`.

Uma variante de prática pode registrar:

- `id`;
- `domainItemRef`;
- `variantKind`;
- `purpose`;
- `difficulty`;
- `representation`;
- `expectedStudentAction`;
- `commonErrorTarget`.

O `domainMap` não é formulário do usuário comum. Ele é contrato semântico para o motor.

## Microssequência

A microssequência é a unidade didática central.

Ela pode existir sem cards. Nesse caso, está planejada, mas ainda não materializada.

Campos didáticos possíveis:

- `title`;
- `description`;
- `status`;
- `included`;
- `tags`;
- `domainRefs`;
- `practiceVariantRefs`;
- `didacticPurpose`;
- `coverageRole`;
- `cards`.

### `domainRefs`

`domainRefs` aponta para itens do `domainMap`. Isso diz que a microssequência cobre determinado conceito, procedimento, contraste ou erro.

### `practiceVariantRefs`

`practiceVariantRefs` aponta para variantes de prática adequadas à etapa.

### `didacticPurpose`

`didacticPurpose` resume a função da microssequência em linguagem didática.

### `coverageRole`

`coverageRole` indica o papel da etapa na progressão, por exemplo introduzir, explicar, demonstrar, praticar, discriminar, diagnosticar erro, consolidar ou integrar.

## Card

Card é a unidade de interação. Ele materializa parte da microssequência.

Recursos públicos aceitos incluem:

- `say`;
- `ask`;
- `code`;
- `table`;
- `flow`;
- `tree`;
- `plane`;
- `matrix`;
- lacunas e exercícios aceitos pelo runtime.

O card não deve carregar todo o mapa semântico da lição. Ele deve permanecer simples e renderizável.

## Fontes

`sourceRefs` e referências correlatas preservam vínculo mínimo com fontes usadas. Elas ajudam auditoria e revisão, sem transformar o contrato em sistema bibliográfico completo.

## O que fica fora

Não pertencem ao contrato público:

- credenciais;
- tokens;
- estado aberto/fechado de painéis;
- rascunho temporário de prompt;
- resposta bruta completa de provider;
- configuração privada de modelo;
- cálculos visuais de runtime.

## Validação

Todo projeto gerado ou importado deve passar por validação. Quando possível, o app repara problemas estruturais simples. Quando a inconsistência compromete sentido ou segurança do patch, a operação deve falhar sem corromper o projeto.
