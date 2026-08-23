# Validação da especificação v12

Âncora funcional: `main` em `ebd3feed909df9c007d0c09140ba28d3afe2dc61`.

## Falha encontrada na v11 anterior

A mensagem `numeração inconsistente=true` foi reproduzida. Na tela de Inspeção, o protótipo registrava ações e números e depois substituía trechos do HTML já renderizado. Alguns botões desapareciam da tela, mas continuavam na lista interna de ações. O problema era arquitetural: ação, tela e grafo possuíam fontes de verdade separadas.

A v12 elimina essa arquitetura. O registro canônico de telas, capacidades e destinos gera a lista, a navegação e os grafos. Não existe numeração paralela de botões.

## Validação estrutural observada

- 101 telas/estados;
- 26 capacidades catalogadas;
- 25 capacidades atuais e 1 explicitamente futura;
- 193 destinos/arestas de navegação;
- nenhum identificador duplicado;
- nenhum destino inexistente;
- nenhuma capacidade atual sem superfície;
- os sete datasets de Pesquisa representados.

## Validação visual automatizada

As 101 telas foram renderizadas em `1440×960` e `390×844` (202 renderizações) antes da troca final do empacotamento: 0 overflow horizontal da superfície móvel principal, 0 controles habilitados abaixo do limite adotado, 0 erros de console. A inspeção amostral incluiu Estudo inicial, Inspeção, Fontes, Pesquisa/Analytics e comparação de Variantes.

A revisão final substituiu o carregador comprimido por JS/CSS estáticos e CSP. O Chromium deste ambiente passou a bloquear navegações locais/localhost por política administrativa; por isso não alegamos uma nova execução visual pós-CSP.

## Segurança do artefato

A validação estática final passou: 101 telas, 0 origens remotas, 0 APIs de rede ativas; sem `eval()`. Consulte `SECURITY-VALIDATION.md`.

Isso valida a **especificação navegável**, não a implementação de produção.