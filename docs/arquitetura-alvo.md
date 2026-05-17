# Arquitetura-alvo do AraLearn

## Finalidade deste documento

Este documento registra a direção de consolidação do AraLearn. Ele não descreve apenas o que já está pronto; descreve a forma que o produto procura estabilizar.

A meta é que organização estrutural, geração assistida, estudo, revisão e autoria pertençam ao mesmo sistema, em vez de parecerem módulos sem relação.

## Tese central

O AraLearn se torna mais coerente quando a mesma lógica governa dois momentos:

1. a construção da trilha;
2. a intervenção dentro de uma microssequência.

No primeiro momento, o usuário organiza cursos, módulos, lições e etapas planejadas. No segundo, ele estuda, corrige, reformula e materializa conteúdo. A arquitetura-alvo exige continuidade entre esses momentos.

## Princípios

A arquitetura-alvo preserva estes princípios:

- a microssequência é a unidade didática principal;
- o card é unidade de interação;
- a lição governa o recorte local;
- a árvore pública situa o contexto;
- a linguagem autoral mantém o conteúdo legível;
- a IA assiste, mas não decide sozinha;
- o usuário pode revisar, corrigir e reorganizar;
- uma falha operacional não deve corromper o projeto;
- versões e alterações precisam ser compreensíveis.

## O que precisa se consolidar

### Core didático

O core didático deve concentrar critérios de progressão, prática, suficiência e coerência. Ele precisa ser independente do serviço de IA escolhido.

### Produção por fases

A geração deve continuar dividida em fases menores: ingestão, planejamento, auditoria, reparo, validação e aplicação. Isso reduz dependência de uma única resposta extensa do modelo.

### Orientação por lição

A lição deve carregar orientação suficientemente clara para guiar microssequências: escopo, notação, prática, limites e erros comuns. Essa orientação não deve ser confundida com simples descrição publicitária da lição.

### Materialização progressiva

O app deve permitir que microssequências planejadas existam antes dos cards. O usuário enxerga o caminho, escolhe prioridades e materializa o conteúdo quando fizer sentido.

### Versionamento compreensível

O versionamento deve permitir recuperar decisões anteriores sem confundir o usuário. Alterações em subestruturas devem poder ser reaproveitadas sem obrigar retorno completo a estados antigos da árvore.

### Provedores substituíveis

Serviços de IA remotos ou locais devem poder variar sem reescrever o produto. A didática pertence ao AraLearn; o provedor executa uma parte do fluxo.

## Critério de sucesso

O produto se aproxima da arquitetura-alvo quando consegue:

- transformar material amplo em trilha navegável;
- mostrar o que está planejado e o que já está pronto para estudo;
- materializar uma etapa sem replanejar tudo;
- preservar contexto entre curso, lição e microssequência;
- permitir correção humana em qualquer ponto relevante;
- manter o contrato público estável e exportável;
- continuar útil mesmo quando a IA não está disponível.
