# AraLearn

O AraLearn é uma plataforma para estudo autodidata e criação de cursos com apoio de inteligência artificial generativa. A partir de um tema, de uma ementa ou de materiais já reunidos, é possível montar um curso e estudá-lo no próprio aplicativo. A inteligência artificial (IA) ajuda a planejar a sequência, redigir explicações, propor atividades e escolher formas adequadas de apresentar cada conteúdo.

O estudo é dividido em pequenas etapas, para que seja possível avançar mesmo quando há pouco tempo disponível e retomar o percurso depois de uma interrupção. O AraLearn funciona na web e no Android, e parte do conteúdo necessário ao estudo pode permanecer no dispositivo para continuar disponível quando a conexão não é estável.

A página [Origens do AraLearn](docs/origens-do-aralearn.md) apresenta o percurso que levou à criação do projeto.

## Como o conteúdo é organizado

O percurso de estudo segue uma hierarquia:

```text
curso → módulo → lição → microssequência didática → unidade de estudo
```

Uma **microssequência didática** organiza um avanço conceitual delimitado. Suas **unidades de estudo** desenvolvem etapas desse avanço por meio de explicações, exemplos, práticas e retorno. Conforme o conteúdo, uma unidade pode usar prosa, fórmulas, código ou outras representações.

Essa organização permite acrescentar as etapas necessárias para explicar um assunto sem depender de uma única exposição extensa ou de resumos excessivamente condensados. O [modelo didático](docs/modelo-didatico.md) apresenta os fundamentos e as decisões que orientam essa estrutura.

## Estudo e autoria

No estudo, é possível percorrer o curso, responder a práticas, receber retorno, marcar unidades para rever, registrar observações e retomar o ponto em que o estudo foi interrompido.

Na autoria, é possível planejar a estrutura do curso, produzir e revisar seu conteúdo e definir quem pode acessá-lo. Um curso pode continuar sendo planejado e corrigido enquanto o conteúdo já produzido permanece disponível para estudo.

O [guia do estudante](docs/guia-estudante.md) apresenta o percurso de estudo. O [guia do professor e autor](docs/guia-professor-autor.md) apresenta criação, planejamento, produção e revisão de cursos.

## Autoria com inteligência artificial

A assistência por IA dentro do aplicativo trabalha com o contexto do conteúdo que está sendo editado e permite discutir uma proposta antes de aplicá-la.

Também é possível usar conversas externas para trabalhar na autoria de um curso. Clientes compatíveis com o [Model Context Protocol (MCP)](docs/autoria-mcp.md) e um [GPT personalizado com Actions](docs/autoria-actions.md) podem acessar operações autorizadas do AraLearn para trabalhar com cursos. A [Assistência por modelo de linguagem](docs/assistencia-por-ia.md) explica o funcionamento da assistência integrada ao aplicativo.

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
