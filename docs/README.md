# Documentação do AraLearn

Esta pasta reúne a documentação pública do AraLearn. Os documentos foram separados por função para evitar repetição: o README do repositório apresenta o projeto; os arquivos abaixo aprofundam produto, modelo didático, uso, arquitetura, IA, contrato e fundamentos.

## Caminho recomendado

Para uma primeira aproximação:

1. [Visão do produto](visao-do-produto.md)
2. [Modelo didático](modelo-didatico.md)
3. [Uso do app](uso-do-app.md)

Para avaliação técnica:

1. [Arquitetura](arquitetura.md)
2. [Persistência relacional e sincronização](persistencia-relacional.md)
3. [Supabase: desenvolvimento e implantação](supabase.md)
4. [Assistência por IA](assistencia-por-ia.md)
5. [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md)
6. [Contrato público](aralearn-contract.md)
7. [Recursos de card](recursos-de-card.md)

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
| [Uso do app](uso-do-app.md) | Mostrar o fluxo atual: autenticação, seleção de cursos, trilhas, estudo offline e sincronização. |
| [Arquitetura](arquitetura.md) | Explicar catálogo compartilhado, estado pessoal, réplica offline, segurança e publicação administrativa. |
| [Persistência relacional e sincronização](persistencia-relacional.md) | Descrever o mapeamento PostgreSQL/IndexedDB, as mutações granulares e o protocolo offline. |
| [Supabase: desenvolvimento e implantação](supabase.md) | Documentar configuração, migrations, variáveis públicas, testes e implantação do backend. |
| [Assistência por IA](assistencia-por-ia.md) | Explicar a autoria pessoal assistida e separá-la da futura autoria administrativa por GPT. |
| [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md) | Registrar os contratos top-down e bottom-up usados pela interface e pelos harnesses. |
| [Contrato público](aralearn-contract.md) | Especificar o JSON v3 usado no intercâmbio, na validação e na visão de domínio em memória. |
| [Recursos de card](recursos-de-card.md) | Explicar os tipos de card aceitos e sua função didática. |
| [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md) | Situar o projeto em educação, tecnologia, IA, atenção, autonomia e crítica institucional. |
| [Estado atual e próximos passos](estado-atual-e-roadmap.md) | Separar o que já existe, o que é prática externa e o que pertence ao desenvolvimento futuro. |

## Princípio de organização

O AraLearn é apresentado em três planos complementares.

O primeiro é o produto: uma plataforma de estudo e autoria pessoal por microssequências, com catálogo compartilhado, cópia sob demanda, trilhas pessoais e uso offline.

O segundo é a implementação: contrato JSON, validação, PostgreSQL/Supabase canônico, réplica relacional em IndexedDB, recursos renderizáveis e geração pessoal validada. Os harnesses reutilizam esses contratos para pesquisa sem alterar o estado operacional.

O terceiro é a pesquisa: uma hipótese sobre estudo autodidata em contexto de excesso informacional, trabalho, pouco tempo, cansaço, conexão instável e uso predominante do celular.
