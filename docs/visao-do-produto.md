# Visão do produto

## O problema a que o AraLearn responde

O AraLearn parte de um diagnóstico recorrente em contextos de estudo: não falta informação; falta forma. Muitas pessoas já têm acesso a material de sobra, mas ainda assim não conseguem transformá-lo em percurso. Sabem que precisam estudar, mas não sabem por onde começar, o que vem antes do quê, o que já entenderam, o que ainda não foi praticado e como retomar o fio depois de uma interrupção.

Essa dificuldade pesa ainda mais sobre quem estuda em condições irregulares: estudantes-trabalhadores, pessoas com dupla jornada, professores em formação continuada, autodidatas que dependem de material heterogêneo e qualquer usuário que precise estudar em janelas curtas, com atenção dividida e conexão nem sempre disponível.

## A resposta do produto

O AraLearn organiza o estudo em uma estrutura explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa hierarquia não é só uma árvore de navegação. Ela organiza contexto didático. Cada nível informa o seguinte, de modo que a microssequência não surge como card solto nem como resposta avulsa de chat, mas como etapa situada num percurso maior.

A microssequência é a unidade didática central do app. Ela reúne poucos cards em torno de uma finalidade concreta: introduzir uma noção, preparar um passo, oferecer prática, comparar ideias, revisar um erro recorrente ou conduzir à etapa seguinte.

## O que torna o produto singular

O AraLearn reúne quatro coisas que normalmente aparecem separadas:

- organização estrutural do percurso;
- linguagem autoral simples para representar conteúdo didático;
- estudo ativo no próprio runtime;
- possibilidade contínua de revisão, correção e reautoria.

Isso muda o papel do usuário. Em vez de apenas receber conteúdo gerado, ele pode usar o app como estudante, autor, revisor ou organizador de trilhas. Também muda o papel da IA: ela deixa de ocupar o centro do produto e passa a operar dentro de uma arquitetura mais explícita.

## A linguagem autoral como contribuição do produto

Uma das propostas mais originais do AraLearn é o uso de uma linguagem autoral simples em JSON para representar conteúdo didático. Essa linguagem é suficientemente legível para humanos e suficientemente operacional para modelos de linguagem.

Com ela, o conteúdo pode ser descrito por elementos como explicação, código, tabela, fluxograma, árvore, plano cartesiano e matriz. O runtime do app transforma essa base comum em experiências mais complexas de leitura e prática, sem exigir que o autor ou o modelo tenham de escrever diretamente em formatos visuais de baixo nível.

## Assistência sem apagamento da autoria

O produto foi pensado para funcionar em mais de um regime de uso. Um usuário pode simplesmente fornecer material, deixar o app organizar o esqueleto do curso e seguir estudando. Outro pode intervir com muito mais detalhe: editar percurso, revisar cards, ajustar orientação da lição, mudar parâmetros do fluxo e reescrever conteúdo.

Essa diferença importa porque o produto não foi pensado para substituir autoria por automatismo. Ele tenta combinar assistência, legibilidade e autonomia.

## Persistência local e continuidade

O projeto fica salvo localmente no dispositivo do usuário. Por isso, o app continua disponível sem internet para navegação, revisão e retomada do estudo. Já as operações criativas que dependem de modelos de linguagem exigem conexão ou provider local configurado.

Esse ponto é menos um detalhe de infraestrutura do que parte da proposta pedagógica: o estudo precisa continuar existindo mesmo quando a rede falha ou a rotina fica fragmentada.

## Uma posição educacional

Pedagogicamente, o AraLearn aposta em percurso, progressão, prática e revisão. Politicamente, ele procura devolver ao usuário alguma capacidade de orientação diante do excesso de informação. Filosoficamente, o produto recusa tanto a fantasia de neutralidade absoluta quanto a delegação cega de autoridade a um modelo.

Em vez de impor um método fechado ou dissolver tudo em personalização sem forma, o app tenta oferecer estrutura suficiente para orientar e abertura suficiente para permitir apropriação crítica.
