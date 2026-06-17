# Documentação do AraLearn

Esta pasta reúne a documentação pública do AraLearn. Os documentos foram separados por função para evitar repetição: o README do repositório apresenta o projeto; os arquivos abaixo aprofundam produto, modelo didático, uso, arquitetura, IA, contrato e fundamentos.

## Caminho recomendado

Para uma primeira aproximação:

1. [Visão do produto](visao-do-produto.md)
2. [Modelo didático](modelo-didatico.md)
3. [Uso do app](uso-do-app.md)

Para avaliação técnica:

1. [Arquitetura](arquitetura.md)
2. [Assistência por IA](assistencia-por-ia.md)
3. [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md)
4. [Contrato público](aralearn-contract.md)
5. [Recursos de card](recursos-de-card.md)

Para avaliação acadêmica e crítica:

1. [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
2. [Estado atual e próximos passos](estado-atual-e-roadmap.md)
3. [Visão do produto](visao-do-produto.md)
4. [Modelo didático](modelo-didatico.md)

## Função de cada documento

| Documento | Função |
|---|---|
| [README do repositório](../README.md) | Apresentar o AraLearn para quem chega ao projeto pela primeira vez. |
| [Visão do produto](visao-do-produto.md) | Explicar problema, proposta, público, posição no ecossistema e originalidade. |
| [Modelo didático](modelo-didatico.md) | Descrever a microssequência, os cards, a prática, o erro, a retomada e os fundamentos pedagógicos. |
| [Uso do app](uso-do-app.md) | Mostrar o fluxo de uso: escopo, top-down, microssequência, bottom-up, estudo, correção e versão. |
| [Arquitetura](arquitetura.md) | Explicar como o sistema separa projeto, geração, validação, renderização e persistência. |
| [Assistência por IA](assistencia-por-ia.md) | Detalhar como as LLMs por API participam hoje e quais limites governam essa participação. |
| [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md) | Descrever os contratos transitórios usados nos fluxos top-down e bottom-up. |
| [Contrato público](aralearn-contract.md) | Especificar o JSON persistido pelo app. |
| [Recursos de card](recursos-de-card.md) | Explicar os tipos de card aceitos e sua função didática. |
| [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md) | Situar o projeto em educação, tecnologia, IA, atenção, autonomia e crítica institucional. |
| [Estado atual e próximos passos](estado-atual-e-roadmap.md) | Separar o que já existe, o que é prática externa e o que pertence ao desenvolvimento futuro. |

## Princípio de organização

O AraLearn é apresentado em três planos complementares.

O primeiro é o produto: uma plataforma de estudo por microssequências, com cards e IA por API.

O segundo é a implementação: contrato JSON, validação, versionamento, recursos renderizáveis e fluxos de geração.

O terceiro é a pesquisa: uma hipótese sobre estudo autodidata em contexto de excesso informacional, trabalho, pouco tempo, cansaço, conexão instável e uso predominante do celular.
