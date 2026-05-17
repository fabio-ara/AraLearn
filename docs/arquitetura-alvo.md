# Arquitetura-alvo do AraLearn

## O que este documento registra

Este texto registra a direção arquitetural do produto. Ele descreve a forma que o AraLearn procura consolidar: um sistema em que organização ampla do estudo, linguagem autoral, materialização progressiva e intervenção local pertençam à mesma arquitetura.

## A tese central

O app fica mais coerente quando a trilha estrutural e a ajuda local deixam de parecer produtos paralelos. A mesma lógica que organiza o material precisa continuar válida quando o usuário entra numa microssequência, pede reforço, corrige um card ou materializa uma etapa ainda vazia.

## Princípios que essa arquitetura tenta preservar

- a microssequência é a unidade didática central;
- o card é a unidade de interação, não de planejamento;
- a estrutura pública governa contexto de geração e de estudo;
- a linguagem autoral simples continua sendo ponte entre autoria, modelo e runtime;
- a IA ajuda, mas não decide sozinha a didática;
- o usuário preserva possibilidade real de revisão, correção e reautoria;
- falha operacional não deve corromper o projeto.

## O que isso implica

Na prática, a arquitetura-alvo pede:

- um core didático mais estável;
- um motor de produção por fases;
- runtimes de provider claramente separados da didática;
- persistência local com aplicação controlada de mudanças;
- representação intermediária suficientemente simples para autoria humana e colaboração com modelos.

## Critério de sucesso

O AraLearn se aproxima dessa arquitetura quando consegue:

- organizar material amplo em trilha navegável;
- mostrar com clareza o que já está planejado e o que já está pronto para estudo;
- materializar conteúdo localmente sem replanejar tudo;
- preservar coerência entre estrutura, prática e intervenção localizada;
- manter o projeto legível, auditável e editável pelo próprio usuário.
