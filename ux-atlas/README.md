# Atlas visual do AraLearn

Artefato temporário para compreender e redesenhar a UX/UI do AraLearn. Não altera o frontend real.

## Âncora funcional

A edição atual é verificada contra `75e0a8e242cecc1a6bcac04d6edc99b0e03174cf` (`main`, 2026-08-21).

Capacidades de domínio só podem aparecer como existentes quando sustentadas pela revisão-âncora. O atlas distingue:

- **Capacidade existente**: comportamento já implementado no AraLearn;
- **Layout proposto**: nova organização ou apresentação da capacidade, sem pressupor mudança de domínio;
- **Exemplo sintético**: dados ou conteúdo fictícios usados apenas para explicar visualmente o comportamento.

Correções já confirmadas:

- Actions não fazem parte do produto corrente; a autoria conversacional é por MCP;
- a revisão-âncora expõe cinco ferramentas MCP autorais: `listarCursos`, `lerCurso`, `criarCurso`, `alterarCurso` e `consultarComponentesDidaticos`;
- a assistência textual aceita provider DeepSeek, mas o modelo é configurável; o AraLearn não fixa um “DeepSeek V4”;
- em produção, a assistência textual usa serviço local/relay, com credencial fora do AraLearn.

## Como usar

Abra `index.html` diretamente no navegador.

O modo principal é agora um **grafo de telas calculado pelo Graphviz**:

1. cada card do grafo representa uma tela ou estado explicativo do atlas;
2. as setas indicam qual ação leva a qual destino;
3. o número da seta reaparece circulado no controle correspondente do mock selecionado;
4. ao clicar num card, o mock e a explicação aparecem no painel da direita;
5. use a roda do mouse ou os botões `− / +` para zoom e arraste o fundo para mover o grafo;
6. `Entrada`, `Estudo`, `Autoria`, `ChatGPT / MCP` e `Conta` focam seus respectivos agrupamentos;
7. `Visão geral` mostra o produto inteiro; `Focar selecionado` aproxima o card atual.

Linhas contínuas representam navegação direta. Linhas tracejadas indicam condição, mudança de estado, detalhe ou passagem por contexto externo.

`graph.dot` é a fonte estrutural do grafo. O Graphviz calcula posições e curvas; o resultado compacto fica em `graph-layout.js` e `graph-ui.js` o renderiza como SVG interativo no navegador. Portanto **Graphviz não é necessário para abrir o atlas** — apenas para recalcular o layout depois de mudar nós ou arestas.

A estética continua deliberadamente simples. O objetivo é discutir estrutura, navegação, compreensão e ausência de atrito antes de refinamento visual.
