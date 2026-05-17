# Arquitetura-alvo do AraLearn

## O que este documento descreve

Este texto registra a direção arquitetural do produto. Não é uma promessa de marketing nem um mapa fechado para qualquer versão futura. Ele descreve a forma que o AraLearn procura consolidar: um sistema em que organização ampla do estudo e intervenção local durante a prática pertençam à mesma arquitetura.

## A tese central

O app fica mais coerente quando a trilha estrutural e a ajuda local deixam de parecer produtos quase separados. A mesma lógica que organiza o material precisa continuar válida quando o usuário entra numa microssequência, pede reforço, corrige um card ou materializa uma etapa ainda vazia.

## Princípios que a arquitetura tenta preservar

- a microssequência é a unidade didática central;
- o card é a unidade de interação, não de planejamento;
- a IA ajuda, mas não decide sozinha a didática;
- o usuário preserva possibilidade real de autoria, revisão e correção;
- o fluxo estrutural e o fluxo local compartilham o mesmo núcleo conceitual;
- falha operacional não deve corromper o projeto.

## O que isso implica

Na prática, a arquitetura-alvo pede quatro frentes articuladas:

- um core didático com regras mais estáveis;
- um motor de produção por fases;
- runtimes de provider claramente separados da didática;
- persistência local com aplicação controlada de mudanças.

Esse desenho faz mais sentido para o produto do que uma sequência de integrações isoladas com modelos diferentes.

## Critério de sucesso

O AraLearn se aproxima dessa arquitetura quando consegue:

- organizar material amplo em trilha navegável;
- deixar claro o que já está planejado e o que já está pronto para estudo;
- materializar conteúdo localmente sem replanejar tudo;
- preservar coerência entre o percurso e a intervenção local;
- manter o projeto utilizável, auditável e editável pelo próprio usuário.
