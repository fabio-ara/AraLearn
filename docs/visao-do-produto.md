# Visão do produto

AraLearn é um app local-first/offline-first para autoria e estudo de trilhas didáticas. Ele ajuda o usuário a transformar material disperso em um percurso estruturado, persistente, revisável e praticável.

O ponto central é simples: o AraLearn não fornece o conteúdo. O usuário é o autor. A IA pode ajudar, mas o usuário define o assunto, delimita o escopo, revisa a trilha, aceita ou corrige os cards e decide quando uma etapa está pronta para estudo.

## Problema

Estudar não é apenas ter acesso a material. Em disciplinas acadêmicas, o estudante costuma lidar com ementas, slides, anotações, listas de exercícios, capítulos, documentação técnica, exemplos de código, dúvidas de aula e respostas geradas por IA. O problema aparece quando tudo isso precisa virar uma sequência concreta de estudo.

Sem estrutura, o estudante pode gastar energia demais perguntando:

- por onde começar;
- o que entra e o que fica fora;
- quando parar de ler e começar a praticar;
- que lacuna precisa ser revisada;
- que exercício comprova avanço;
- como continuar depois de uma dificuldade.

Esse custo pesa especialmente para estudantes-trabalhadores. O AraLearn foi pensado para quem estuda em tempo curto, em deslocamento, cansado, com atenção fragmentada e, muitas vezes, sem internet. Nesse contexto, configurar ferramenta ou fabricar material do zero pode competir com o estudo.

## Origem concreta

O app é usado pelo autor para estudar disciplinas do curso de Tecnologia em Análise e Desenvolvimento de Sistemas no IFSP. Essa origem influencia escolhas de produto: foco em disciplinas técnicas, prática progressiva, documentação, exercícios, revisão de lacunas e material persistido para consulta posterior.

O contexto profissional do autor também pesa. A experiência editorial favorece atenção à clareza, estrutura textual, revisão e persistência do material. A atuação com automação de negócios no serviço público reforça a preocupação com levantamento de requisitos, documentação de processos, formalização de fluxos operacionais e produção de material de formação para usuários.

Mesmo com essa origem concreta, o AraLearn foi desenhado para permanecer geral. Ele é content-agnostic: pode ser usado com disciplinas acadêmicas, concursos, pesquisa, autodidatismo, documentação técnica, treinamento, leitura orientada ou qualquer assunto que o usuário queira transformar em percurso de estudo.

## Proposta

O AraLearn organiza o estudo em uma árvore explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa estrutura não é só armazenamento. Ela orienta a ação do estudante.

- O curso delimita o tema geral.
- O módulo recorta uma parte do tema.
- A lição define uma etapa de aprendizagem.
- A microssequência concentra uma função didática pequena.
- O card materializa uma explicação, exercício, exemplo, tabela, código ou outro recurso de estudo.

A microssequência é a unidade central. Ela evita dois extremos: cards soltos demais e cursos grandes demais. O estudante trabalha uma etapa curta, mas essa etapa continua conectada à trilha.

## Dois momentos de geração

A documentação técnica usa os termos `top-down` e `bottom-up`, mas eles significam algo simples.

**Planejamento da trilha** é o momento em que o usuário informa o assunto, o objetivo e os recortes. A IA pode ajudar a criar curso, módulos, lições e microssequências. Nenhum card precisa ser gerado nessa etapa. O objetivo é enxergar o caminho.

**Materialização local** é o momento em que o usuário abre uma microssequência e cria os cards daquela etapa. A IA pode gerar, corrigir ou ampliar o material, mas sempre dentro do ponto selecionado.

Essa separação reduz atrito. O usuário não precisa produzir um curso inteiro antes de estudar, nem precisa transformar cada dúvida em conversa solta com IA.

## Diferença em relação a outros modos de estudo

AraLearn não é Anki, Duolingo, SoloLearn ou ChatGPT com outro nome.

Ferramentas como Anki e AnkiDroid dão liberdade, mas a criação de bons cards exige trabalho. O estudante precisa recortar conteúdo, escrever perguntas, revisar respostas, organizar decks e manter consistência. Essa liberdade é valiosa, mas pode ser pesada.

Apps como Duolingo, SoloLearn, Enki e Encode reduzem a fricção. O usuário abre o app e segue uma trilha. O problema é que a trilha geralmente vem pronta. Ela não parte da ementa, da prova, da lista de exercícios ou da lacuna concreta do usuário.

Chats com LLMs ajudam a explicar e gerar exemplos, mas a resposta fica na conversa. Ela não se torna automaticamente uma trilha persistida, renderizada, revisável e estudável offline.

O AraLearn tenta combinar três coisas que costumam aparecer separadas:

- a fluidez de uma trilha guiada;
- a autoria de uma ferramenta personalizável;
- a assistência de uma LLM.

## Papel da IA

A IA no AraLearn é ferramenta de assistência. Ela pode ajudar a:

- interpretar um escopo;
- planejar uma trilha;
- propor uma microssequência;
- gerar teoria e prática;
- criar mais cards;
- abrir uma microssequência adicional;
- corrigir cards existentes;
- sugerir continuação.

Mas a IA não é autora do projeto. O usuário continua responsável por decidir o que quer estudar, revisar o resultado, aceitar ou rejeitar material e marcar uma etapa como pronta.

## Público

O público inicial é o estudante-trabalhador, especialmente de disciplinas acadêmicas e técnicas. Esse usuário precisa estudar com pouco tempo, pouca energia e objetivos concretos.

O uso pode se estender a:

- estudantes de graduação;
- concurseiros;
- autodidatas;
- pesquisadores;
- professores e monitores;
- pessoas que estudam documentação técnica;
- profissionais que precisam transformar material informal em treinamento ou trilha de aprendizagem.

O ponto comum não é a disciplina. O ponto comum é a necessidade de planejar, organizar, estudar, revisar e persistir conteúdo com baixo atrito.

## Princípios de produto

O AraLearn segue alguns princípios:

- **Autoria do usuário**: o conteúdo pertence ao usuário, não ao app.
- **Baixa fricção**: o usuário deve gastar energia estudando, não configurando ferramenta.
- **Persistência local**: o material deve continuar acessível e exportável.
- **Estrutura sem rigidez excessiva**: a trilha orienta, mas o usuário pode corrigir, ampliar e criar desvios locais.
- **Teoria e prática juntas**: uma etapa deve explicar e permitir exercitar.
- **Cobertura sem resumo raso**: o conteúdo deve ser decomposto, não simplesmente encurtado.
- **Validação antes de aplicar**: respostas inválidas de IA não devem corromper o projeto.
- **Independência de modelo**: o app deve permitir diferentes providers de IA.

## Limites

AraLearn não promete aprendizagem automática. Ele não substitui professor, monitor, bibliografia, orientação humana ou revisão crítica. Também não garante que a IA sempre produza material correto.

O que ele oferece é uma arquitetura para transformar material em percurso estudável, reduzir atrito de autoria e preservar controle do usuário sobre o próprio estudo.
