# Documentação do AraLearn

Esta pasta reúne a documentação de produto, arquitetura, modelo didático, contrato público, assistência por IA e operação técnica do AraLearn.

A documentação deve ser lida com uma ideia central em mente: o AraLearn não é uma plataforma de conteúdo pronto. Ele é um motor local-first de autoria e estudo. O usuário cria, revisa, aceita, persiste e estuda o próprio material; a IA é uma ferramenta de assistência.

## Para entender o produto

- [Visão do produto](visao-do-produto.md): explica o problema, a proposta, o público inicial, o papel do usuário como autor e os limites do AraLearn.
- [Contexto de produto e referências](contexto-produto-e-referencias.md): situa o app diante de Anki, Duolingo, chats com LLM, educação a distância, smartphone, IA e questões políticas da tecnologia educacional.
- [Ética, poder e governança](etica-poder-e-governanca.md): discute riscos de performatividade, vigilância, normalização, behaviorismo e delegação da produção do saber à IA.
- [Modelo didático](modelo-didatico.md): descreve a microssequência, a relação entre teoria e prática, os recursos de card e os critérios de suficiência didática.
- [Perfis didáticos](perfis-didaticos.md): mostra como adaptar o app a disciplinas, provas, artigos, documentação técnica e outros contextos.

## Para entender a arquitetura

- [Arquitetura](arquitetura.md): descreve as camadas de código, contratos, persistência, importação, exportação, validação e recursos renderizáveis.
- [Arquitetura de geração por LLM e API](nova-arquitetura-llm-api.md): explica a separação entre planejamento da trilha e materialização local de cards por microssequência.
- [Contrato público](aralearn-contract.md): documenta o formato `aralearn.contract` v1, os recursos aceitos e o contrato de escopo `aralearn.scope.v1`.
- [Microssequências planejadas e versões](rascunhos-e-microssequencias.md): descreve estados, versões, complementos e preservação de histórico.

## Para operar e testar

- [Uso do app](uso-do-app.md): guia o fluxo de criação de escopo, geração de trilha, estudo, revisão, importação e exportação.
- [Assistência por IA](assistencia-por-ia.md): explica providers, modos de operação, DeepSeek, Gemini, Codex CLI, validação local e controle do usuário.
- [Codex CLI local](codex-cli.md): descreve o bridge HTTP local para usar Codex CLI como provider.
- [Compartilhamento no Android](android-share-import.md): explica a recepção de JSON enviado por outros apps.

## Pesquisa e exemplos

- [Pesquisa e avaliação](pesquisa-e-avaliacao.md): registra hipóteses de design, perguntas de pesquisa e critérios de honestidade acadêmica.
- [Planejamento de Matemática para Informática](planejamento-matematica-para-informatica.md): exemplo de planejamento didático para uma disciplina concreta.
- [Exemplos JSON](examples/): contratos e projetos usados para validação e demonstração.

## Diretriz editorial

A documentação deve evitar jargão quando o leitor for usuário final. Termos como `top-down`, `bottom-up`, provider, contrato e schema podem aparecer, mas precisam ser explicados em linguagem comum quando forem apresentados.

A redação também deve preservar o ponto político e autoral do projeto: tecnologia educacional é ferramenta. Ela pode ampliar autonomia, mas também pode reforçar controle, vigilância, performatividade e dependência. O AraLearn deve ser descrito como uma ferramenta voltada à autoria, revisão e apropriação do próprio estudo pelo usuário.
