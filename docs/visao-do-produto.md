# Visão do produto

## Problema

O AraLearn parte de uma dificuldade recorrente: o usuário tem fontes, anotações, PDFs, slides, listas, documentação e respostas de IA, mas não tem uma trilha de estudo clara.

Informação abundante não vira automaticamente aprendizagem. Para estudar, o usuário precisa de ordem, progressão, prática, revisão e possibilidade de corrigir o caminho. Sem isso, o material se acumula como texto passivo.

## Resposta do AraLearn

O AraLearn transforma material e intenção em uma trilha local-first:

```text
curso -> módulo -> lição -> microssequência -> card
```

O top-down cria a estrutura: curso, módulos, lições e microssequências planejadas. Ele não deve pré-gerar todos os cards. O bottom-up materializa uma microssequência por vez, no momento em que o usuário decide estudá-la.

Essa separação é o centro do produto.

## Por que microssequência

A microssequência é pequena o bastante para ser estudada com foco e grande o bastante para não virar card isolado.

Ela pode introduzir uma ideia, explicar um procedimento, demonstrar um exemplo, propor prática, contrastar conceitos, corrigir erro comum ou preparar a próxima etapa. O card é a interação; a microssequência é a unidade didática.

## Fluxo do usuário comum

1. O usuário pede uma estrutura a partir de uma intenção e fontes.
2. O AraLearn gera uma trilha planejada até microssequências.
3. O usuário navega pela trilha e abre uma microssequência vazia.
4. Na aba de edição, pede os cards daquela microssequência.
5. Depois de estudar, pode corrigir, continuar, ir à próxima microssequência planejada ou criar uma microssequência extra.

O usuário comum não precisa entender `domainMap`, `coverageRole`, `practiceVariantRefs` ou outros metadados internos. Esses elementos existem para guiar o motor e a IA.

## Papel da IA

A IA reduz atrito, mas não é a autoridade do produto.

No top-down, ela ajuda a planejar a trilha. No bottom-up, ela cria ou ajusta cards dentro de uma microssequência específica. O AraLearn fornece contexto, contrato e validação para que a IA trabalhe dentro da trilha, em vez de responder como chat genérico.

## Autoria

O produto preserva autoria de duas formas.

Primeiro, o usuário vê a estrutura antes de materializar cards. Segundo, cada intervenção local é revisável e aplicada como alteração controlada. A IA sugere e produz, mas o projeto permanece do usuário.

## Limite do produto

AraLearn não promete aprendizagem automática. Ele organiza condições melhores para estudar: progressão, prática localizada, revisão, continuidade e intervenção situada.
