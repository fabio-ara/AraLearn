# Atlas visual do AraLearn

A versão corrente é a **v8**, em [`v8/`](./v8/).

Abra `index.html`: ele redireciona para `v8/index.html` preservando o estado indicado no hash.

A v8 torna o protótipo testável: todos os botões dos mocks são numerados e vinculados às mesmas transições do grafo; o mapa abre em vizinhança local e pode alternar para o grafo completo; os cenários de escala têm unidade explícita (`1 Curso`, `20 Cursos`, `200 Cursos`); Coleções de Estudo e de Autoria são independentes e funcionais no protótipo; e operações sobre Cursos distinguem capacidade atual de extensões ainda não suportadas pelo backend.

Consulte [`v8/README.md`](./v8/README.md) para detalhes e limites funcionais.
