# Arquitetura do AraLearn

## Tese

O AraLearn é um compilador didático local-first. Ele transforma intenção, fontes e contexto em uma trilha estudável, usando IA como componente de produção, não como centro absoluto da arquitetura.

A arquitetura existe para manter uma distinção:

- `top-down`: planeja a trilha até microssequências;
- `bottom-up`: materializa ou corrige cards dentro de uma microssequência.

## Estrutura pública

O contrato público segue esta árvore:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

Essa estrutura é persistível, exportável e compreensível pelo usuário. O motor interno pode ter artefatos mais ricos, mas a árvore pública precisa continuar pequena e legível.

## Top-down

O top-down recebe intenção, escopo e fontes. O resultado esperado é estrutura:

- cursos;
- módulos;
- lições;
- microssequências planejadas;
- metadados semânticos necessários para manter coerência.

Ele não deve pré-materializar a trilha inteira em cards. Isso preserva custo, reduz volume prematuro e permite ao usuário revisar o caminho antes de produzir conteúdo detalhado.

No motor, esse fluxo passa por fases como normalização de intenção, ingestão de fontes, construção de perfil avaliativo, planejamento, auditoria, reparo, compilação de patch, validação e aplicação.

Internamente, `structure_only` significa estrutura sem cards, não estrutura sem microssequências. Portanto, esse roteiro ainda deve passar por planejamento, auditoria e reparo de microssequências. Um top-down que pare em curso, módulo e lição é incompleto para o produto atual, porque deixa o bottom-up sem a unidade didática que ele deve materializar.

## Bottom-up

O bottom-up começa quando o usuário está dentro de uma microssequência.

Ele recebe:

- a microssequência atual;
- a lição que a governa;
- tags selecionadas;
- pedido do usuário;
- materialização preferida;
- anexos;
- configuração de provedor/modelo.

Com isso, o motor cria ou corrige cards localmente. Se o usuário pedir uma microssequência extra, o alvo sobe para a lição, mas a inserção continua ancorada na microssequência atual.

## DomainMap

`domainMap` é o contrato semântico interno da lição.

Ele pode conter itens como:

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
- `assessmentFormats`;
- `practiceVariants`.

Esse mapa não é a UI do usuário comum. Ele serve para o motor saber quais conceitos, procedimentos, contrastes, pré-requisitos e práticas pertencem à lição.

## Metadados de microssequência

A microssequência não carrega todo o `domainMap`. Ela carrega referências leves:

- `domainRefs`: quais itens do mapa aquela etapa cobre;
- `practiceVariantRefs`: quais variantes de prática ela pode materializar;
- `didacticPurpose`: para que a etapa existe;
- `coverageRole`: papel da etapa na progressão, como introduzir, explicar, praticar, discriminar ou consolidar.

Esses metadados ajudam a IA a continuar a trilha sem fugir do assunto. Também permitem auditoria de cobertura e reparo determinístico quando a resposta vem incompleta.

## Cards

Cards materializam a microssequência. Eles devem ser pequenos, estudáveis e ligados à função local da etapa.

Um card pode usar recursos como texto, pergunta, código, tabela, fluxograma, árvore, matriz ou plano cartesiano. O formato é meio; a função didática continua sendo decidida pela microssequência e pela lição.

## Fontes

Fontes entram primeiro como material bruto. A ingestão extrai texto útil, preserva avisos e transforma anexos em contexto para o motor.

O objetivo não é reproduzir a fonte inteira. O objetivo é converter fonte em trilha: conceitos, relações, exemplos, erros comuns e prática.

## Patch e validação

O motor não deve aplicar texto bruto da IA diretamente no projeto.

O caminho esperado é:

1. compor pedido situado;
2. receber estrutura ou cards;
3. normalizar;
4. auditar;
5. reparar quando possível;
6. compilar patch;
7. validar patch;
8. aplicar ao projeto.

Esse processo evita que uma resposta malformada substitua o projeto inteiro ou corrompa a árvore.

## Providers

Providers executam chamadas a modelos remotos, modelos locais ou providers falsos de teste.

Provider não decide didática. Ele recebe uma tarefa já governada por contrato, prompt policy, perfil didático e escopo. A troca de modelo pode mudar qualidade, custo e latência, mas não deve mudar a identidade pedagógica do produto.

## UI comum

A UI comum do bottom-up não expõe o `domainMap`.

Ela mostra apenas:

- pedido;
- ação;
- tags;
- materialização preferida;
- anexos;
- modelo;
- envio.

Essa decisão reduz atrito e impede que o usuário comum edite metadados internos sem entender a consequência.

## Persistência

O projeto fica salvo localmente. Configurações de provider e estado transitório de UI não pertencem ao contrato público exportável.

O que deve persistir no projeto é a trilha, as microssequências, cards, fontes referenciadas e metadados didáticos que fazem parte do material. O que pertence à sessão de geração deve ficar fora do contrato público.

## Critério de coerência

A arquitetura está alinhada quando:

- top-down produz microssequências planejadas, não cards em massa;
- bottom-up materializa uma microssequência por vez;
- `domainMap` governa por baixo sem aparecer como formulário comum;
- cards são aplicados por patch validado;
- o usuário consegue estudar, corrigir, continuar e avançar;
- falhas de IA não corrompem o projeto.
