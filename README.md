# AraLearn

AraLearn é um aplicativo open source para transformar materiais dispersos em trilhas de estudo organizadas, praticáveis e revisáveis.

O ponto de partida é um problema comum a estudantes, professores, autodidatas e pessoas que trabalham com conhecimento: há informação em toda parte, mas nem sempre há forma. Apostilas, slides, anotações, listas de exercícios, artigos, vídeos, documentação técnica e respostas de IA podem se acumular sem se converter em caminho de estudo. O AraLearn foi criado para ajudar o usuário a dar forma a esse material, sem retirar dele o controle sobre o percurso.

O app organiza o estudo assim:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa árvore não é apenas uma forma de guardar dados. Ela ajuda a situar cada explicação, cada exercício e cada intervenção da IA. Uma microssequência não aparece como card solto nem como resposta avulsa de chat: ela pertence a uma lição, que pertence a um módulo, que pertence a um curso.

## O que o AraLearn faz

Com o AraLearn, o usuário pode:

- criar cursos, módulos, lições, microssequências e cards;
- importar material de apoio e usá-lo como fonte para organização do estudo;
- pedir à IA que proponha uma estrutura de curso a partir de textos, documentos ou dúvidas;
- materializar cards dentro de uma microssequência já planejada;
- revisar, corrigir, expandir e reorganizar o percurso;
- estudar no próprio app, com prática distribuída em pequenas etapas;
- manter o projeto salvo no dispositivo e retomar o estudo mesmo sem conexão, quando o conteúdo já estiver disponível.

As operações que dependem de um modelo de IA remoto continuam exigindo internet ou um provedor local configurado. O estudo, a navegação e a revisão do material já salvo não dependem de conexão contínua.

## Por que ele existe

AraLearn nasce de uma situação histórica bastante concreta: a internet tornou a informação ubíqua; a inteligência artificial ampliou ainda mais a produção, a recombinação e a disponibilidade de texto. O resultado não é apenas abundância. Muitas vezes é desorientação.

O problema não é “ter acesso”. O problema é conseguir selecionar, ordenar, praticar, revisar, discordar, corrigir e transformar informação em conhecimento próprio. Sem uma estrutura externa manejável, o usuário tende a ficar diante de blocos excessivos de conteúdo, acumulando material sem prática suficiente ou aceitando respostas prontas com pouca intervenção crítica.

O AraLearn não resolve esse problema por completo. Ele propõe uma resposta prática: oferecer uma forma de trabalho em que o usuário interage com a informação, organiza o percurso e consolida conhecimento por meio de prática, revisão e autoria.

## A unidade central: microssequência

O card é a unidade de interação. A microssequência é a unidade didática principal.

Uma microssequência reúne alguns cards em torno de uma finalidade clara: introduzir um conceito, explicar um procedimento, comparar ideias parecidas, treinar um passo, corrigir um erro recorrente ou preparar a etapa seguinte. Essa escolha evita dois extremos: cards soltos, sem contexto; e lições grandes demais para orientar prática localizada.

A proposta inicial do app foi transformar disciplinas acadêmicas em trilhas de flashcards sem pressupor conhecimento prévio forte do estudante. O usuário pode começar como leigo, seguir uma progressão e praticar antes de avançar. Ao mesmo tempo, a estrutura não é rígida: o usuário pode editar, excluir, reorganizar, complementar e conduzir o percurso conforme sua necessidade.

## IA como assistência, não como autoridade

A IA entra no AraLearn para reduzir atrito: ajudar a organizar material, propor uma sequência, materializar uma etapa, reformular cards ou continuar um percurso. Ela não substitui a autoria do usuário.

O app tenta governar a IA por meio da própria estrutura do produto: curso, módulo, lição, microssequência, fontes, contratos e validações. O modelo não recebe apenas um pedido genérico. Ele trabalha sobre um ponto situado da trilha e devolve conteúdo que ainda pode ser revisado, editado e testado pelo usuário.

Essa distinção é importante. O AraLearn não é um chat educacional com exportação de flashcards. Ele é um ambiente de organização e estudo que pode usar IA como colaboradora.

## Linguagem autoral simples

O conteúdo do AraLearn é persistido em uma linguagem autoral simples, baseada em JSON. Ela permite representar texto, perguntas, código, tabelas, fluxogramas, árvores, matrizes e outros recursos de estudo sem prender o usuário a um formato visual difícil de editar.

Essa camada intermediária serve a três públicos ao mesmo tempo:

- pessoas, que precisam entender e revisar o material;
- modelos de IA, que trabalham melhor quando recebem contratos explícitos;
- o app, que transforma a descrição em experiência de estudo.

O objetivo é manter o conteúdo legível, editável e reutilizável.

## Inspirações

O AraLearn dialoga com ferramentas e tradições diferentes.

De sistemas como Anki, retém a importância da revisão ativa e da prática. De produtos como Duolingo, observa o valor de percursos progressivos e retomáveis. De ambientes como Obsidian, conversa com a ideia de conhecimento organizado pelo usuário, não apenas consumido em sequência fixa.

O projeto também nasce de uma trajetória acadêmica cruzada. Seu autor estudou Letras, com habilitação em Linguística, na USP; foi estudante de Ciências Biológicas na USP; e hoje cursa Tecnologia em Análise e Desenvolvimento de Sistemas no IFSP. Essa combinação aparece no produto: atenção à linguagem, à estrutura conceitual, à aprendizagem, à prática e à implementação.

Há ainda diálogos mais amplos com pesquisas sobre recuperação ativa, carga cognitiva, exemplos resolvidos, prática orientada e autoria assistida. Em outro nível, o projeto também conversa com debates sobre informação, poder, condução dos sujeitos e conhecimento em sociedades saturadas de dados. O AraLearn usa técnicas de organização que podem disciplinar o estudo; ao mesmo tempo, tenta preservar revisão, autoria e discordância para reduzir a passividade diante do conteúdo.

## Para quem pode servir

O AraLearn foi pensado inicialmente para disciplinas acadêmicas, especialmente em contextos como cursos de tecnologia, matemática, programação, lógica e formação geral. Mas sua estrutura permite outros usos:

- preparação para provas e concursos;
- estudo de línguas estrangeiras;
- acompanhamento de artigos acadêmicos;
- organização de documentação técnica;
- formação profissional;
- estudo por projetos;
- criação de trilhas por professores, monitores ou estudantes.

Perfis didáticos podem ajustar a ênfase de cada uso: mais prática, mais conceituação, mais vocabulário, mais procedimento, mais comparação de fontes ou mais preparação para exercícios.

## Estado do projeto

O AraLearn é um produto em desenvolvimento. A arquitetura já contempla persistência local, organização hierárquica, importação e exportação, geração assistida por IA, materialização de microssequências e um contrato público em JSON.

O projeto ainda precisa de avaliação empírica mais sistemática. Ele não promete aprendizagem garantida. A proposta é oferecer uma forma melhor de organizar, praticar e revisar informação, mantendo o usuário no centro da decisão.

## Documentação

- [Visão do produto](docs/visao-do-produto.md)
- [Guia de uso](docs/uso-do-app.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Perfis didáticos](docs/perfis-didaticos.md)
- [Arquitetura](docs/arquitetura.md)
- [Arquitetura-alvo](docs/arquitetura-alvo.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Contrato público](docs/aralearn-contract.md)
- [Rascunhos e microssequências](docs/rascunhos-e-microssequencias.md)
- [Fundamentos e evidências](docs/fundamentos-e-evidencias.md)
- [Pesquisa e avaliação](docs/pesquisa-e-avaliacao.md)
- [Abrir com AraLearn no Android](docs/android-share-import.md)
- [Codex CLI local](docs/codex-cli.md)
- [Planejamento de Matemática para Informática](docs/planejamento-matematica-para-informatica.md)
- [Índice da documentação](docs/README.md)

## Executar localmente

```bash
npm install
npm run dev
```

Testes:

```bash
npm test
```

Versão publicada:

<https://fabio-ara.github.io/AraLearn/>
