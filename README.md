# AraLearn

O AraLearn é uma plataforma para estudo autodidata e criação de cursos com apoio de inteligência artificial (IA) generativa. A partir de um tema, de uma ementa ou de materiais já reunidos, uma pessoa pode montar um curso e estudá-lo no próprio aplicativo. A IA ajuda a planejar o percurso, redigir o conteúdo e propor atividades; a pessoa autora inspeciona o resultado e orienta as mudanças.

O conteúdo é desenvolvido em etapas relacionadas, com explicações, fontes e práticas. Essa organização permite estudar em períodos breves, retomar o ponto em que se parou e continuar pelo celular. O aplicativo funciona no navegador e pode ser instalado. O conteúdo já carregado permite continuar o estudo sem conexão; os documentos usados como fontes, os áudios e as consultas externas têm condições próprias de acesso.

[Abrir o AraLearn](https://fabio-ara.github.io/AraLearn/) · [Conhecer a origem do projeto](docs/origens-do-aralearn.md)

Para começar a criar por conversa, veja [como conectar seu assistente](docs/conectar-assistente.md). No aplicativo, abra **Configurações → Conectar assistente**.

## Como o conteúdo é organizado

O conteúdo é dividido em vários níveis, do curso completo às unidades de estudo que aparecem na tela. Entre esses extremos, cada **microssequência didática** organiza um avanço conceitual delimitado. Suas unidades desenvolvem esse avanço por meio de explicações, exemplos e atividades com retorno explicativo sobre as respostas.

Cada forma de apresentação tem uma função. Uma explicação escrita pode se relacionar a uma representação visual ou a um áudio, enquanto uma atividade permite trabalhar sobre o conteúdo apresentado. Uma tabela ajuda a comparar informações; um fluxograma, a acompanhar um processo. A pessoa autora escolhe a combinação que torna a relação estudada compreensível.

Durante a autoria, a **explicação** desenvolve o assunto da microssequência e o liga às fontes. Ela pode combinar texto, representações visuais e áudio, sendo preparada antes ou depois da produção das unidades. A explicação permanece acessível durante o estudo, enquanto cada unidade conserva as escolhas feitas para apresentar o conteúdo e propor a prática.

O [modelo didático](docs/modelo-didatico.md) apresenta os fundamentos e as decisões que orientam essa estrutura.

## Estudo e autoria

No estudo, a pessoa percorre o curso, responde às práticas e recebe retorno. Também pode marcar uma unidade para rever, registrar uma observação e retomar o ponto em que interrompeu a leitura.

Na autoria, a pessoa define para quem é o curso e o que ele deverá ensinar. Em seguida, decide como desenvolver o assunto e inspeciona o material produzido junto de suas fontes. Pode pedir correções, editar o conteúdo e registrar sua revisão. A marca de revisão identifica uma decisão humana sobre o conteúdo salvo. A inspeção por IA mantém um parecer próprio, com evidências e pendências, que ajuda a examinar a coerência do material. [Explicação e revisão humana](docs/explicacao-e-revisao-humana.md) explica esses registros e sua relação com a disponibilização do curso.

O [guia do estudante](docs/guia-estudante.md) apresenta o percurso de estudo. O [guia do professor e autor](docs/guia-professor-autor.md) acompanha a criação e a revisão do curso.

## Autoria com inteligência artificial

O trabalho se desenvolve em um ciclo de proposta, inspeção e correção: a IA ajuda a planejar e produzir; a pessoa examina o resultado e decide o que deve mudar.

Uma aplicação de conversa conectada pode consultar o curso e executar as alterações que a pessoa autorizar. Essas tarefas pertencem ao AraLearn e permanecem separadas de um modelo ou fornecedor específico. O curso e suas fontes continuam salvos no aplicativo, disponíveis para retomada em outra conversa compatível. A compatibilidade de cada canal e aplicação externa é verificada separadamente. O [guia de autoria pelo chat](docs/criar-cursos-pelo-chat.md) apresenta esse percurso, e a [documentação das integrações](docs/assistencia-por-ia.md) explica os canais e suas condições de uso. Dentro do próprio aplicativo, a pessoa também pode editar o texto ou discutir uma prévia com IA antes de salvá-la.

Para usar o ChatGPT, siga o [manual ilustrado de conexão](docs/chatgpt.md). Ele apresenta o Model Context Protocol (MCP), pelo qual o assistente consulta e utiliza ferramentas, e Actions, cujas operações são descritas em OpenAPI, um formato padronizado de descrição de serviços. O manual acompanha a autorização da conta e uma consulta de teste. Outras aplicações compatíveis podem usar esses canais, conforme as condições dos respectivos guias.

## Pesquisa em design instrucional

O AraLearn também é um artefato de pesquisa em design instrucional e tecnologia educacional. Nele, é possível investigar como uma decisão de autoria se traduz no material: que explicação oferecer, como representar uma relação e que prática propor. As escolhas aplicadas ficam ligadas ao conteúdo, o que permite inspecionar e comparar os materiais produzidos.

A [visão do produto](docs/visao-do-produto.md) desenvolve essas relações. A [revisão de literatura](docs/revisao-de-literatura.md) fundamenta as escolhas e as hipóteses; o [guia de investigação](docs/guia-pesquisador.md) orienta sua avaliação. Estudos com pessoas examinam os efeitos sobre aprendizagem e uso.

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

A configuração do ambiente e dos serviços, as verificações locais e o desenvolvimento para Android estão no [guia do desenvolvedor](docs/guia-desenvolvedor.md). Para contribuir com o projeto, consulte também o [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licença

O código-fonte é distribuído nos termos de [`LICENSE.md`](LICENSE.md).
Componentes de terceiros preservam suas próprias licenças; os
[avisos do motor bibliográfico e dos estilos](public/vendor/bibliography/NOTICE.txt)
identificam o código sob CPAL 1.0 e os estilos sob CC BY-SA 3.0.
