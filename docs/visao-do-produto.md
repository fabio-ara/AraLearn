# Visão do produto

AraLearn nasce de um problema simples de formular e difícil de resolver: hoje é fácil reunir informação, mas continua sendo difícil transformá-la em estudo organizado, retomável e verificável.

Em disciplinas acadêmicas, técnicas e profissionais, o estudante costuma ter acesso a ementas, slides, PDFs, vídeos, documentação, fóruns, listas de exercício, anotações pessoais e respostas produzidas por modelos de linguagem. O obstáculo raramente é apenas “encontrar conteúdo”. O obstáculo é dar forma ao estudo: escolher recorte, definir sequência, decidir onde praticar, registrar erro, preservar revisão e conseguir retomar depois de uma interrupção.

## O problema que o AraLearn enfrenta

Ferramentas diferentes resolvem partes desse problema, mas nenhuma delas, isoladamente, fecha o ciclo.

[Google Search](https://www.google.com/search/about/) e a [Wikipédia](https://www.wikipedia.org/) ajudam a localizar informação e panorama. [NotebookLM](https://notebooklm.google/) aproxima geração textual e fontes explicitamente selecionadas. [Anki](https://apps.ankiweb.net/) consolida bem a revisão por cartões. [Duolingo](https://www.duolingo.com/) e [SoloLearn](https://www.sololearn.com/) mostram a força de percursos guiados com unidades pequenas. [Obsidian](https://obsidian.md/) reforça a autonomia na organização local do conhecimento.

O AraLearn se instala em outro ponto do ecossistema: ele tenta transformar material heterogêneo em **trilha didática editável**, um percurso em que cada etapa tenha função, ordem, fronteira, continuidade e forma de prática.

## A proposta

O produto organiza o estudo em uma árvore explícita:

```text
curso -> módulo -> lição -> microssequência -> versão -> card
```

Essa árvore não existe para burocratizar o conteúdo. Ela existe para tornar o estudo manipulável.

- O **curso** delimita o campo geral.
- O **módulo** recorta uma região do curso.
- A **lição** organiza uma etapa coerente desse recorte.
- A **microssequência** concentra uma unidade curta de aprendizagem.
- A **versão** preserva uma materialização específica dessa etapa.
- O **card** realiza explicação, exemplo, exercício ou representação.

O centro do produto é a microssequência. Ela é grande o bastante para situar um problema local e pequena o bastante para caber no ritmo de quem estuda entre trabalho, deslocamento, aula e obrigações familiares.

## Por que a microssequência é decisiva

O card isolado é rápido, mas pode perder contexto. O curso inteiro é completo, mas costuma ser grande demais para resolver uma dúvida ou praticar uma operação específica. A microssequência ocupa o espaço intermediário.

Ela permite:

- explicar uma regra local;
- mostrar um caso suficiente;
- propor prática fechada;
- corrigir um erro provável;
- preparar a continuação.

Com isso, o produto evita dois defeitos comuns: explicação sem aplicação e exercício sem contexto.

## Dois momentos de trabalho

O AraLearn separa o processo em dois movimentos.

O primeiro é **planejar a trilha**. O usuário define assunto, objetivo, itens que entram, itens que ficam fora, convenções de notação, observações de prova ou de uso profissional. A partir disso, o app pode propor módulos, lições e microssequências.

O segundo é **materializar uma etapa local**. O usuário abre uma microssequência específica e pede explicação, prática, correção, apoio local ou continuação. O serviço textual trabalha sobre aquele recorte; o app valida o resultado e preserva a nova versão.

Na documentação técnica, esses movimentos aparecem como `top-down` e `bottom-up`. Essa distinção importa porque evita que uma única chamada ao modelo precise planejar o curso inteiro e escrever todos os cards finais de uma vez.

## Autoria assistida, não delegada

O AraLearn combina autoria humana e assistência textual. O usuário continua sendo autor do projeto: define o recorte, decide o que entra, revisa o que foi produzido, corrige o que julga inadequado e determina quando uma etapa está pronta.

O serviço textual ajuda em dois pontos:

- sugerindo organização da trilha a partir do escopo;
- materializando cards dentro de uma microssequência aberta.

Essa escolha evita tratar a saída do modelo como material automaticamente confiável. O texto sugerido só entra no projeto depois de passar por contrato, validação e revisão.

## Material local e cursos embarcados

AraLearn foi desenhado com persistência local como referência primária do projeto. O material fica no dispositivo, pode ser exportado em JSON e continua disponível depois de salvo.

O app também pode incluir cursos embarcados já materializados. Eles funcionam como ponto de partida editável, não como conteúdo intocável. No estado atual, há quatro cursos oficiais:

- `Matemática para Informática`, com foco em `Teoria dos Grafos`;
- `Práticas e Ferramentas de Desenvolvimento de Software`, com foco na família Visual Basic;
- `Organização e Arquitetura de Computadores`, com os módulos `MobileRAG` e `Filosofia da Computação Quântica`;
- `Framework Corporativo de IA Generativa`, voltado a implantação, governança, dados, risco e operação de IA em contexto institucional.

Esses cursos ajudam a mostrar o que o produto faz sem exigir que todo usuário comece do zero.

## Onde o AraLearn se distingue

O produto não parte do card como unidade soberana, nem da conversa livre com IA, nem da nota solta, nem do curso fechado.

Ele parte de uma tese mais específica:

> informação só vira estudo sustentado quando ganha forma, progressão, prática, revisão e possibilidade de retomada.

Por isso, sua singularidade não está em “ter IA” ou “ter cards”, mas na maneira como estrutura, geração, validação e persistência local foram articuladas no mesmo documento de projeto.

## Limites

O AraLearn não substitui bibliografia, aula, orientação docente, pesquisa, discussão crítica ou revisão humana. Também não garante que o serviço textual sempre produza conteúdo correto.

O que o produto oferece é outra coisa: uma arquitetura de estudo que torna o material editável, versionável, exportável e auditável. O modelo sugere. O sistema delimita e valida. O usuário decide.

Para a fundamentação pedagógica, crítica e bibliográfica dessa proposta, leia [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md).
