# Guia de uso do app

Este guia descreve o fluxo normal do AraLearn no estado atual.

## Visão geral

O AraLearn organiza o estudo em:

```text
curso -> módulo -> lição -> microssequência -> card
```

A unidade didática central é a microssequência. O card é a unidade de interação.

## Tela inicial

Na home, o usuário pode:

- criar curso vazio;
- importar contrato estrutural;
- importar backup completo;
- abrir um curso existente;
- usar geração estrutural contextual.

O foco da home é organizar cursos, não gerar cards diretamente.

## Curso, módulo e lição

Cada nível estrutural tem papel específico:

- `curso`: agrupa módulos de uma mesma disciplina ou trilha;
- `módulo`: organiza um bloco coerente de lições;
- `lição`: concentra a orientação didática operacional;
- `microssequência`: reúne os cards de um ponto estudável.

Na prática:

- em `curso`, a geração por IA atua sobre módulos e lições;
- em `módulo`, a geração por IA atua sobre lições;
- em `lição`, a geração por IA atua sobre microssequências draft;
- em `microssequência`, a geração por IA atua sobre cards.

## Fonte-guia da lição

A lição é o centro da governança didática.

Ela pode carregar:

- `sourceGuideStructured`;
- `resourceTags`;
- `contentTypeTags`;
- `learningActionTags`;
- `supportLevel`;
- `presetId`.

Isso serve para restringir a geração e manter coerência local.

Na interface, a edição da fonte-guia da lição deve ser feita antes de exigir boa geração de cards.

## Geração de microssequências na lição

Na lição, o usuário pode pedir:

- gerar microssequências;
- gerar e reposicionar microssequências.

Esse passo:

- cria `drafts`;
- não gera cards;
- não coloca automaticamente a microssequência no estudo;
- pode considerar `domainMap`, quando a lição já o tiver.

O objetivo é montar a trilha da lição sem ainda entrar na escrita fina dos cards.

## Painel da microssequência

Ao abrir uma microssequência, o usuário entra no workbench.

Ali, o fluxo principal é:

1. revisar a microssequência atual;
2. gerar ou editar cards;
3. inspecionar a iteração aplicada;
4. aceitar ou excluir a iteração atual.

Não existe mais prévia privada separada do conteúdo aplicado.

## Geração de cards

Quando o usuário pede geração de cards:

1. o app monta um contrato de planejamento;
2. a LLM devolve um plano curto;
3. o app valida o plano;
4. o app monta o `cardPlan` determinístico;
5. a LLM preenche os cards;
6. o app valida;
7. o resultado validado é aplicado.

Se a geração falhar em regra estrutural ou declarativa relevante, o app pode tentar continuação automática antes da entrega final.

## Estudo

No modo de estudo:

- apenas microssequências `ready` entram normalmente;
- `draft` fica fora do estudo;
- `included: false` também fica fora do estudo;
- o progresso é salvo localmente por caminho completo da lição.

Os cards podem incluir:

- explicação breve;
- lacunas;
- múltipla escolha;
- código;
- tabela;
- árvore;
- fluxograma;
- plano cartesiano;
- matriz.

## Importação e exportação

O AraLearn trabalha com dois formatos:

- `aralearn.contract`: estrutura autoral;
- `aralearn.storage`: backup completo local.

Uso recomendado:

- exporte `contract` quando quiser portar conteúdo;
- exporte `storage` quando quiser preservar também progresso e estado local.

## Snapshots

Snapshots são explícitos.

O app não grava snapshot automaticamente a cada edição.

Eles podem ser usados para:

- congelar um estado estável;
- comparar estrutura em momentos diferentes;
- voltar a uma versão anterior de um nível.

## Configuração de IA

O app suporta:

- Gemini/API comum como caminho normal;
- `Codex CLI local` como integração avançada.

Antes de usar IA:

1. abra `Configuração da IA`;
2. escolha o modelo;
3. informe a chave da API, quando necessário;
4. teste o bridge local, se estiver usando `Codex CLI local`.

## O que esperar da IA no AraLearn

A IA no AraLearn:

- não decide a arquitetura didática;
- não escolhe livremente o percurso;
- não controla o `cardPlan`;
- não deve produzir resumo genérico.

O app usa IA para preencher contratos fechados e depois valida localmente.

## O que o usuário ainda precisa fazer

O AraLearn não elimina curadoria editorial.

O usuário ainda precisa:

- revisar o texto gerado;
- confirmar fidelidade ao conteúdo;
- ajustar a lição quando a orientação estiver ruim;
- decidir quando um rascunho já está pronto para estudo.

## Limites operacionais

O app atual é mais forte quando:

- a lição já está bem orientada;
- o pedido é específico;
- a microssequência cobre um ponto pequeno;
- os recursos permitidos combinam com o domínio.

O app é mais fraco quando:

- o pedido é amplo demais;
- a lição não tem fonte-guia clara;
- o usuário espera que a IA “entenda tudo sozinha”;
- o tema exige interpretação semântica profunda sem estrutura local suficiente.
