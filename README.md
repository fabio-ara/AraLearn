# AraLearn

AraLearn é um app open source, local-first/offline-first, para transformar materiais, dúvidas e objetivos de estudo em cursos organizados por pequenas etapas didáticas.

Ele parte de uma constatação simples: estudantes e profissionais têm acesso a PDFs, slides, anotações, listas de exercícios, documentação técnica, respostas de IA e páginas da web, mas nem sempre conseguem transformar esse volume de informação em percurso de estudo. O AraLearn propõe uma estrutura externa para esse trabalho.

```text
curso -> módulo -> lição -> microssequência -> card
```

A microssequência é a unidade didática central do app. Ela reúne cards em torno de uma função precisa: introduzir um conceito, explicar um procedimento, demonstrar um caso, propor prática, revisar uma lacuna, corrigir erro comum ou preparar a etapa seguinte.

## Princípio didático atual

O AraLearn não foi desenhado como resumidor. O motor atual trata exaustividade como efeito de:

- decomposição progressiva;
- prática distribuída;
- retomada cumulativa;
- variação suficiente para prova;
- cards com carga didática controlada.

Isso importa porque o público focal do app inclui estudantes-trabalhadores que estudam em contexto de atenção fragmentada, mas precisam enfrentar avaliações exigentes. No AraLearn, "pequeno" não significa "raso": significa legível, praticável e encadeado.

## O que o AraLearn faz

O AraLearn ajuda o usuário a:

- organizar um tema em curso, módulos, lições e microssequências;
- delimitar o que entra e o que não entra em cada módulo;
- gerar uma trilha planejada antes de produzir cards;
- planejar a didática local antes de compilar o JSON final dos cards;
- materializar cards apenas na microssequência que será estudada;
- revisar, corrigir, ampliar ou complementar uma etapa sem perder versões preservadas;
- estudar com recursos renderizáveis, como texto explicativo, tabela, código, fluxograma, árvore, grafo e lacunas interativas.

A IA é usada como assistência situada. Ela não substitui a autoria do usuário nem transforma o app em chat genérico. O projeto permanece visível, editável, exportável e validado por contrato.

## Contexto

AraLearn dialoga com práticas e produtos como flashcards, repetição espaçada, aprendizagem por etapas, organização pessoal do conhecimento, hipertexto, versionamento e autoria local. Seu foco, porém, é próprio: transformar material disperso em percurso estruturado, praticável e auditável.

A documentação discute esse contexto em [Contexto de produto e referências](docs/contexto-produto-e-referencias.md), incluindo o lugar do app diante de produtos como Anki, Duolingo, Obsidian, Git, Wikipédia e plataformas de fluxo contínuo, além de questões filosóficas e éticas sobre organização do conhecimento, IA e autoria.

## Para quem o projeto foi pensado

AraLearn pode ser usado por:

- estudantes de disciplinas acadêmicas, especialmente em cursos de tecnologia;
- pessoas em preparação para provas, concursos ou avaliações específicas;
- leitores de artigos, capítulos, documentação técnica e materiais especializados;
- professores, monitores e estudantes que queiram montar trilhas de estudo revisáveis;
- interessados em ferramentas locais de organização do conhecimento.

## Fluxo de uso

1. O usuário informa o curso ou tema.
2. Define módulos e recortes por meio de expressões do que entra e do que fica fora.
3. O app gera uma estrutura navegável até microssequências planejadas.
4. O usuário abre uma microssequência.
5. A IA, quando configurada, primeiro planeja a didática local e depois compila os cards apenas para aquela etapa.
6. O usuário estuda, revisa e decide se a etapa está pronta para compor a trilha de execução.

Esse desenho evita a geração de um curso inteiro de uma só vez. A estrutura dá orientação; a materialização local preserva controle.

## Recursos de card

O contrato público aceita os seguintes recursos renderizáveis:

- `say`: explicação textual ou enunciado;
- `table`: tabelas, quadros comparativos e matrizes simples;
- `code`: blocos de código;
- `flow`: fluxogramas;
- `tree`: árvores de pastas, hierarquias e estruturas aninhadas;
- `graph`: grafos com vértices, arestas e pesos;
- `block_gap_fill`: parágrafos com lacunas e opções de resposta.

Esses recursos permitem que a trilha aproxime o estudo da forma como o estudante resolve exercícios no caderno, em prova ou em ambiente técnico.

## Assistência por IA

O app pode operar com diferentes providers:

- Gemini por API;
- providers compatíveis com OpenAI;
- Codex local via bridge HTTP;
- provider falso para testes e harnesses.

A geração é guiada por contratos pequenos e validada localmente. O motor separa planejamento top-down, draft didático bottom-up e compilação final. Respostas inválidas não substituem o projeto anterior.

## Estrutura técnica

Partes centrais do código:

- `src/domain/`: contratos de projeto, escopo, cards, versões e microssequências;
- `src/generation/topDown/`: geração estrutural a partir do contrato de escopo;
- `src/generation/bottomUp/`: geração e revisão de cards dentro de uma microssequência;
- `src/generation/runtime/`: aplicação das operações ao documento do projeto;
- `src/generation/providers/`: integração com providers de IA;
- `src/ui/`: interface de autoria, navegação, estudo e configuração;
- `docs/`: documentação técnica e conceitual.

## Executar localmente

```bash
npm install
npm run dev
```

Scripts úteis:

```bash
npm test
npm run validate:scope
npm run harness:scope
npm run harness:bottom-up
npm run smoke:provider
npm run codex:local
```

## Documentação

- [Índice da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Contexto de produto e referências](docs/contexto-produto-e-referencias.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Arquitetura](docs/arquitetura.md)
- [Arquitetura de geração por LLM e API](docs/nova-arquitetura-llm-api.md)
- [Assistência por IA](docs/assistencia-por-ia.md)
- [Contrato público](docs/aralearn-contract.md)
- [Uso do app](docs/uso-do-app.md)
- [Microssequências planejadas e versões](docs/rascunhos-e-microssequencias.md)
- [Perfis didáticos](docs/perfis-didaticos.md)
- [Pesquisa e avaliação](docs/pesquisa-e-avaliacao.md)
- [Codex CLI local](docs/codex-cli.md)
- [Compartilhamento no Android](docs/android-share-import.md)

## Versão publicada

<https://fabio-ara.github.io/AraLearn/>
