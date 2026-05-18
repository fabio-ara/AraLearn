# Rascunhos e microssequências

## Distinção central

O AraLearn separa:

1. planejar a microssequência;
2. materializar seus cards.

Uma microssequência planejada pode estar vazia. Isso é parte normal do fluxo.

## Planejada

Uma microssequência planejada já tem lugar na trilha. Ela pode ter título, tags, propósito, `domainRefs`, `coverageRole` e relação com a lição.

Ela ainda não tem cards porque o top-down não deve materializar toda a trilha de uma vez.

## Materializada

Uma microssequência materializada tem cards estudáveis.

Ela pode ser estudada, corrigida e continuada. O usuário pode gerar mais cards se a etapa ficou curta ou pedir correção se a progressão ficou ruim.

## Por que deixar vazia

Microssequências vazias permitem:

- ver o percurso antes de gerar conteúdo;
- reduzir custo de IA;
- evitar volume prematuro;
- priorizar o que será estudado agora;
- revisar a ordem antes da materialização;
- manter o top-down como planejamento e o bottom-up como execução.

## Ações no runtime

Na aba de edição, as ações têm papéis distintos:

- `Continuar na microssequência`: cria primeiros cards ou adiciona mais cards à etapa atual.
- `Corrigir microssequência`: repara a etapa atual.
- `Ir a nova microssequência`: abre a próxima etapa planejada.
- `Criar nova microssequência`: insere uma etapa extra depois da atual.

Essa diferença importa: ir para a próxima é navegação; criar uma nova etapa é geração por IA.

## Rascunho

Rascunho é estado de trabalho, não descarte.

Uma microssequência pode estar em rascunho porque foi planejada, porque ainda precisa de cards, porque uma geração está pendente de aceite ou porque a etapa precisa de revisão.

## Versões

Versões servem para comparar e recuperar material local sem reverter o projeto inteiro.

O usuário deve conseguir entender:

- qual versão está em uso;
- o que foi gerado;
- o que foi aceito;
- o que pode ser descartado.

## Critério de bom fluxo

O fluxo está correto quando o usuário entende:

- que top-down planejou a trilha;
- que a microssequência vazia é esperada;
- que cards são pedidos localmente;
- que correção e continuação não replanejam o curso inteiro;
- que avançar para a próxima etapa não precisa de IA;
- que criar uma microssequência extra é uma intervenção excepcional e situada.
