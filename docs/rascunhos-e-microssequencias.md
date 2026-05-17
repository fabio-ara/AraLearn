# Rascunhos e microssequências

## A distinção central

O AraLearn separa duas tarefas:

1. planejar uma etapa da trilha;
2. materializar o conteúdo estudável dessa etapa.

Essa separação evita que toda geração vire um bloco único. O app pode primeiro mostrar o percurso e só depois produzir cards para as etapas escolhidas.

## Planejar

Planejar significa criar ou revisar a arquitetura do estudo.

No nível da lição, o app pode propor microssequências, ordenar etapas, ajustar títulos, registrar objetivos e indicar o que cada parte deve cobrir. Nesse momento, o foco é o caminho.

Uma microssequência planejada já tem lugar na trilha. Ela pode ter título, descrição e orientação, mesmo sem cards.

## Materializar

Materializar significa transformar uma microssequência planejada em conteúdo estudável.

Dentro da microssequência, o app pode criar cards, propor prática, usar recursos visuais, corrigir problemas e ajustar a progressão local. Nesse momento, o foco é a execução da etapa.

## Por que uma microssequência pode estar vazia

Uma microssequência sem cards não é sobra nem erro. Ela representa uma etapa prevista.

Isso permite ao usuário:

- ver o percurso antes de gerar conteúdo;
- revisar a ordem;
- excluir ou renomear etapas;
- escolher prioridade;
- reduzir produção prematura;
- manter controle sobre custo e volume;
- materializar apenas o que será estudado agora.

## Rascunho

Rascunho é estado de trabalho. Não significa descarte.

Uma etapa pode estar em rascunho porque ainda precisa de revisão, porque a IA produziu algo insuficiente, porque o usuário ainda não decidiu se a versão será usada ou porque a microssequência está esperando comparação com outra proposta.

## Versões

Como o AraLearn permite correção e reautoria, versões são importantes.

Uma versão deve ajudar o usuário a responder:

- o que mudou?
- por que mudou?
- quando mudou?
- qual versão está ativa?
- o que pode ser recuperado sem afetar o restante da árvore?

A implementação deve evitar que recuperar uma subestrutura obrigue retorno completo a estados antigos do curso.

## Relação com a IA

A separação entre planejamento e materialização torna a IA mais controlável.

Na geração estrutural, o modelo propõe o caminho. Na microssequência, ele trabalha em uma tarefa delimitada. O usuário pode revisar a trilha antes de pedir detalhes, e pode revisar os cards antes de estudar.

## Critério de bom fluxo

O fluxo está funcionando quando o usuário entende:

- o que já está planejado;
- o que já tem cards;
- o que está pronto para estudo;
- o que ainda precisa de revisão;
- onde pedir continuidade;
- onde intervir manualmente.
