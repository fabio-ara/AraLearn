# Documentação

Este diretório reúne a documentação pública do AraLearn.

O `README.md` da raiz apresenta o produto para uso geral. Os documentos abaixo aprofundam arquitetura, modelo didático, assistência por IA generativa, publicação e pesquisa educacional.

## Produto e arquitetura

- `visao-do-produto.md`: problema, proposta, público, princípios e horizonte do AraLearn
- `arquitetura.md`: estrutura técnica do app, fluxo de dados, persistência, distribuição, UI, validação e pontos arquiteturais em aberto
- `modelo-didatico.md`: microssequências, cards, contêineres, lacunas, revisão e critérios de qualidade didática
- `rascunhos-e-microssequencias.md`: geração, rascunhos dentro da estrutura dos cursos, painel, status e execução

## IA generativa e pesquisa

- `assistencia-por-ia.md`: engenharia da assistência por serviços de inteligência artificial generativa acessados por API
- `pesquisa-e-avaliacao.md`: perguntas de pesquisa, métricas, riscos, desenhos de estudo e decisões dependentes de evidência
- `decisoes/`: registros de decisões arquiteturais e de produto

## JSON público

- `aralearn-contract.md`: contrato público atual do projeto
- `examples/`: exemplos JSON do contrato público atual

## Formatos JSON

- `aralearn.contract`: troca de projetos ou recortes estruturais entre projetos e autoria externa
- `aralearn.storage`: backup/restauração completa do estado local, incluindo progresso

Na UI principal, a ação `Importar` detecta automaticamente qual dos dois formatos foi enviado.
