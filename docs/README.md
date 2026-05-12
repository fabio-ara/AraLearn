# Documentação

Este diretório reúne a documentação pública do AraLearn.

O `README.md` da raiz apresenta o produto para uso geral. Os documentos abaixo aprofundam arquitetura, modelo didático, assistência por IA generativa, publicação e pesquisa educacional.

Os textos deste diretório descrevem o estado atualmente implementado no repositório público. Quando houver diferença entre direção de produto e implementação corrente, a documentação pública deve registrar a implementação existente e explicitar a tensão como ponto em aberto, sem antecipar fluxos ainda não entregues.

## Produto e arquitetura

- `visao-do-produto.md`: problema, proposta, público, princípios e horizonte do AraLearn
- `arquitetura.md`: estrutura técnica do app, fluxo de dados, persistência, interface atual, distribuição, validação e tensões arquiteturais em aberto
- `modelo-didatico.md`: microssequências, cards, contêineres, lacunas, revisão e critérios de qualidade didática
- `rascunhos-e-microssequencias.md`: geração contextual de microssequências, estados `draft` e `ready`, painel da microssequência, iterações locais e estudo

## IA generativa e pesquisa

- `assistencia-por-ia.md`: engenharia da assistência por serviços de inteligência artificial generativa acessados por API
- `pesquisa-e-avaliacao.md`: perguntas de pesquisa, métricas, riscos e desenhos de estudo
- `planejamento-matematica-para-informatica.md`: exemplo público de planejamento didático aplicado

## JSON público

- `aralearn-contract.md`: contrato público atual do projeto
- `examples/`: exemplos JSON do contrato público atual

## Formatos JSON

- `aralearn.contract`: troca de projetos ou recortes estruturais entre projetos e autoria externa
- `aralearn.storage`: backup e restauração completa do estado local, incluindo progresso

Na UI principal, a ação `Importar` detecta automaticamente qual dos dois formatos foi enviado.
