# AraLearn

O AraLearn é um aplicativo de pesquisa em design instrucional e tecnologia educacional, voltado à autoria de cursos e ao estudo autodidata no celular. Com assistência de inteligência artificial (IA) generativa e revisão humana, o usuário cria trilhas didáticas a partir de temas, ementas, slides e outros materiais de estudo.

As trilhas reúnem explicações, conteúdo vinculado às fontes, áudio, representações visuais e atividades interativas. Sua organização em etapas procura favorecer o estudo em períodos breves e em condições de atenção fragmentada, com retomada do ponto em que se parou. O aplicativo funciona no navegador e pode ser instalado no celular; o conteúdo já carregado pode ser estudado sem conexão.

[Abrir o AraLearn](https://fabio-ara.github.io/AraLearn/) · [Conhecer a origem do projeto](docs/origens-do-aralearn.md)

## Como o conteúdo é organizado

Um curso contém módulos, divididos em lições. Cada lição reúne microssequências didáticas, compostas por unidades de estudo.

Uma **microssequência didática** organiza um avanço conceitual delimitado. Suas **unidades de estudo** desenvolvem esse avanço por meio de explicações, exemplos e práticas com retorno. Uma tabela pode ajudar a comparar informações; um fluxograma, a acompanhar um processo. Atividades como preencher lacunas, selecionar alternativas ou calcular com apoio de uma calculadora permitem trabalhar sobre o conteúdo apresentado.

Durante a autoria, a **explicação** constitui o texto-base da microssequência: desenvolve pressupostos, conceitos, relações e exemplos, com fontes vinculadas ao conteúdo. Ela pode ser produzida e revisada antes das unidades e permanece acessível durante o estudo. As unidades conservam as escolhas feitas durante sua produção, como a forma de explicar um conceito e a prática proposta.

Essa organização permite acrescentar as etapas necessárias para explicar um assunto sem depender de uma única exposição extensa ou de resumos excessivamente condensados. O [modelo didático](docs/modelo-didatico.md) apresenta os fundamentos e as decisões que orientam essa estrutura.

## Estudo e autoria

No estudo, é possível percorrer o curso, responder a práticas, receber retorno, marcar unidades para rever, registrar observações e retomar o ponto em que o estudo foi interrompido.

Na autoria, a pessoa define o objetivo, o público e o alcance do curso, decide como desenvolver o assunto e inspeciona a estrutura, o conteúdo e as fontes. Pode pedir correções, editar o material e registrar sua revisão. A marca de revisão identifica uma decisão humana sobre o conteúdo salvo; sua relação com a disponibilização do curso está descrita em [Explicação e revisão humana](docs/explicacao-e-revisao-humana.md).

O [guia do estudante](docs/guia-estudante.md) apresenta o percurso de estudo. O [guia do professor e autor](docs/guia-professor-autor.md) apresenta criação, planejamento, produção e revisão de cursos.

## Autoria com inteligência artificial

O trabalho se desenvolve em um ciclo de proposta, inspeção e correção: a IA ajuda a planejar e produzir; a pessoa examina o resultado, confere as fontes e decide o que deve mudar. O curso permanece no aplicativo e pode ser retomado em outra conversa.

Um assistente externo pode consultar o curso e executar tarefas autorizadas por meio das interfaces de autoria do AraLearn. O [guia de autoria pelo chat](docs/criar-cursos-pelo-chat.md) apresenta esse percurso, e a [documentação das integrações](docs/assistencia-por-ia.md) explica os canais e suas condições de uso. A interface do aplicativo também oferece edição manual e assistência contextual por IA.

## Pesquisa em design instrucional

O AraLearn permite investigar como decisões de autoria se traduzem em material didático: que explicações são necessárias, como representar um conteúdo, quais atividades propor e como a pessoa supervisiona o trabalho da IA. É possível conferir como uma escolha foi aplicada ao conteúdo e comparar os materiais produzidos. A independência em relação a modelos e fornecedores orienta a evolução das integrações; a compatibilidade de cada aplicação externa é verificada separadamente.

A [visão do produto](docs/visao-do-produto.md) desenvolve essas relações. A [revisão de literatura](docs/revisao-de-literatura.md) fundamenta as escolhas e as hipóteses; o [guia de investigação](docs/guia-pesquisador.md) orienta sua avaliação. Os efeitos sobre aprendizagem e uso precisam ser examinados em estudos próprios.

## Documentação

Para começar:

- [Visão do produto](docs/visao-do-produto.md) — problema tratado, público e decisões centrais;
- [Guia do estudante](docs/guia-estudante.md) — estudo, retomada, revisão e observações;
- [Guia do professor e autor](docs/guia-professor-autor.md) — criação e autoria de cursos;
- [Capacidades e limites atuais](docs/estado-atual-e-roadmap.md) — funções disponíveis e condições de uso;
- [Arquitetura](docs/arquitetura.md) — organização técnica e responsabilidades do sistema;
- [Mapa da documentação](docs/README.md) — percursos completos de uso, educação, pesquisa e engenharia.

## Desenvolvimento local

O desenvolvimento requer [Node.js 22](https://nodejs.org/en/download). Depois de clonar o repositório:

```bash
npm ci
npm run dev
```

O aplicativo é servido em `http://127.0.0.1:4182`.

Configuração do Supabase, banco local, testes, estrutura do código e desenvolvimento para Android estão no [guia do desenvolvedor](docs/guia-desenvolvedor.md). Para contribuir com o projeto, consulte também o [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licença

O código-fonte é distribuído nos termos de [`LICENSE.md`](LICENSE.md).
Componentes de terceiros preservam suas próprias licenças; os
[avisos do motor bibliográfico e dos estilos](public/vendor/bibliography/NOTICE.txt)
identificam o código sob CPAL 1.0 e os estilos sob CC BY-SA 3.0.
