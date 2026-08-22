# Atlas guiado do AraLearn

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

O atlas agora é uma **visita guiada**, não um catálogo de telas. Escolha um percurso no topo e avance com **Anterior / Próxima**. A cada passo são mostrados:

1. uma única tela em formato aproximado de smartphone;
2. o que aquela tela é;
3. o que a pessoa faz nela;
4. o que acontece em seguida;
5. por que a organização foi proposta;
6. os arquivos do AraLearn usados como evidência.

O botão **Mapa** existe apenas para saltar diretamente para uma tela quando necessário. Ele não é o percurso principal.

A estética é deliberadamente simples. O objetivo é discutir estrutura, navegação, compreensão e ausência de atrito antes de qualquer refinamento visual.
