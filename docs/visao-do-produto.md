# Visão do produto

AraLearn é um app local-first/offline-first para autoria e estudo de trilhas didáticas. Seu objetivo é ajudar o usuário a transformar informação dispersa em percurso estruturado, revisável e praticável.

## Problema

A ubiquidade da internet e dos sistemas de IA ampliou radicalmente o acesso a informação. O problema deixou de ser apenas encontrar conteúdo. O estudante encontra PDFs, apostilas, slides, respostas geradas por modelos, listas de exercícios, documentação técnica e vídeos, mas muitas vezes não consegue ordenar esse material em uma sequência de estudo.

Sem estrutura externa, o acúmulo de informação tende a produzir desorientação. O usuário sabe que há conteúdo disponível, mas não sabe por onde começar, o que ignorar, quando praticar, como retomar ou como avaliar se já pode avançar.

## Proposta

O AraLearn organiza o estudo em uma árvore explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa estrutura não é apenas armazenamento. Ela funciona como forma de orientação. O curso delimita o domínio geral. O módulo recorta uma região. A lição define uma etapa de aprendizagem. A microssequência concentra uma função didática. O card materializa uma interação específica.

O app separa duas ações:

1. planejar uma trilha até microssequências;
2. materializar cards em uma microssequência escolhida.

Essa separação permite que o usuário veja o caminho antes de gerar detalhes, corrija o escopo antes de estudar e peça novas versões apenas onde houver necessidade.

## Lugar no ecossistema

AraLearn se situa entre ferramentas de flashcards, plataformas de prática guiada, sistemas de notas locais, wikis, versionamento e assistentes de IA.

Ele dialoga com esse ecossistema, mas tem uma direção específica: transformar informação heterogênea em percurso de estudo, com recorte explícito, prática situada, revisão e autoria local.

A discussão mais ampla está em [Contexto de produto e referências](contexto-produto-e-referencias.md).

## Microssequência

A microssequência é a unidade didática central do AraLearn.

Um card isolado pode explicar algo ou fazer uma pergunta, mas normalmente não basta para representar uma progressão. A microssequência reúne cards que trabalham juntos: uma ideia, um procedimento, um contraste, uma prática guiada, uma correção de erro comum ou uma ponte para a etapa seguinte.

A pergunta principal não é “quantos cards há?”, mas “esta etapa permite estudar e praticar uma pequena unidade de sentido?”.

## Papel da IA

A IA no AraLearn é um mecanismo de assistência. Ela ajuda a planejar estruturas, gerar cards, melhorar explicações, propor prática e criar complementos. Ela trabalha dentro de contratos e recebe contexto delimitado.

O app não usa a IA como autoridade única sobre o material. O usuário pode revisar, editar, descartar, gerar outra versão e manter o controle sobre a trilha.

## Autoria e revisão

AraLearn trata o usuário como autor do projeto de estudo.

A autoria aparece em decisões como:

- definir o curso e seus módulos;
- declarar o que entra e o que fica fora;
- aceitar ou revisar microssequências planejadas;
- gerar cards apenas quando a etapa será estudada;
- corrigir explicações ou exercícios;
- marcar uma microssequência como pronta.

A revisão humana é parte do fluxo, não exceção.

## Público

O produto foi pensado para estudantes, professores, monitores, autodidatas, pesquisadores e profissionais que precisam organizar estudo a partir de material heterogêneo.

Casos de uso típicos:

- disciplinas acadêmicas;
- preparação para provas e concursos;
- estudo de documentação técnica;
- organização de tópicos de programação;
- estudo guiado de artigos e capítulos;
- revisão de conceitos com prática frequente.

## Limites

AraLearn não promete aprendizagem automática nem substitui professor, monitor, bibliografia ou revisão humana. O que ele oferece é uma arquitetura para transformar material em percurso, produzir prática situada e manter o estudo sob controle do usuário.
