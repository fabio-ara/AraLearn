# Dependências de diagramação e visualização

`viz-global.js` é a distribuição para navegador do Viz.js 3.27.0, compilação
WebAssembly do Graphviz 14.1.5 publicada sob licença MIT. A distribuição inclui
Graphviz e Expat em código objeto e conserva os avisos dos respectivos projetos
em seu cabeçalho.

- Viz.js: https://github.com/mdaines/viz-js
- Graphviz: https://graphviz.org/
- Licença do Viz.js: https://github.com/mdaines/viz-js/blob/main/LICENSE

O arquivo é mantido localmente para que fluxogramas continuem disponíveis sem
conexão e para que site e APK usem exatamente o mesmo renderer.

`vega.min.js` e `vega-lite.min.js` são as distribuições para navegador de
Vega 6.3.1 e Vega-Lite 6.4.3. Elas compilam e materializam gráficos
estatísticos e planos cartesianos a partir dos contratos semânticos dos
packages. Os arquivos também permanecem locais e disponíveis offline; o
formato Vega-Lite não é exposto à autoria.

- Vega: https://github.com/vega/vega
- Vega-Lite: https://github.com/vega/vega-lite

`venn.esm.js` é a distribuição ESM de `@upsetjs/venn.js` 2.0.0, usada
somente para calcular contornos e regiões de diagramas de Venn e Euler. O
AraLearn renderiza sua própria camada semântica e mantém a biblioteca local
para preservar o funcionamento offline.

- venn.js: https://upset.js.org/venn.js/
- Licença: https://github.com/upsetjs/venn.js/blob/main/LICENSE
