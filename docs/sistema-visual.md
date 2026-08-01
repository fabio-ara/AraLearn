# Sistema visual do AraLearn

O novo sistema visual adota uma base clara, neutra e predominantemente branca,
com densidade baixa, tipografia legível e cor reservada para ação, seleção e
estado. Google Material, Microsoft Fluent e Wikimedia Codex são referências de
engenharia de temas e consistência, não modelos para copiar componentes ou
transformar o AraLearn em outro produto.

## Princípios

- conteúdo didático ocupa o primeiro plano;
- uma superfície clara é o modo visual de referência;
- claro, escuro e preferência do sistema compartilham a mesma semântica;
- cor nunca é o único meio de comunicar seleção, erro, sucesso ou relação;
- poucos níveis de superfície substituem gradientes decorativos e sombras
  extensas;
- controles frequentes permanecem reconhecíveis e alcançáveis com uma mão;
- ações avançadas aparecem progressivamente;
- o tema não altera o significado pedagógico nem o contrato dos `resources`;
- preferência visual é local ao dispositivo e não produz telemetria.

## Ruptura com a apresentação anterior

A migração não mantém tema, aliases de tokens, glifos, componentes duplicados,
folhas de compatibilidade ou fallback para a apresentação anterior. Cada
superfície substituída perde o código antigo no mesmo recorte. A estrutura em
cards de curso, módulo, lição e microssequência é preservada como decisão de
interação, não como obrigação de conservar posição, decoração ou CSS legado.

No leitor, `Ler` e `Editar` são estados contextuais do mesmo card, não duas
abas equivalentes e permanentes. O conteúdo continua ocupando a superfície
principal; seleção de resources, prompt e ações aparecem somente quando a
edição é ativada e desaparecem integralmente ao retornar à leitura.

## Arquitetura de tokens

O código usará três níveis, inspirados na separação adotada pelo Codex:

1. **opções**: valores primitivos de cor, espaço, raio, tipografia e movimento;
2. **decisões**: papéis semânticos como `surface-canvas`, `text-secondary`,
   `border-default`, `action-primary` e `status-danger`;
3. **componentes**: exceções realmente locais, derivadas dos papéis semânticos.

Somente o primeiro nível contém cores literais. Componentes e renderizadores
não escolhem hexadecimal, `rgb()` ou opacidade de marca diretamente.

A implementação vigente está em `public/styles-tokens.css`. Atributos
`data-theme-preference` e `data-color-mode` distinguem a escolha do usuário do
modo efetivamente resolvido, evitando que componentes conheçam `matchMedia` ou
o armazenamento local.

### Famílias semânticas mínimas

- superfícies: página, base, elevada, rebaixada e sobreposição;
- texto: principal, secundário, discreto, desabilitado e invertido;
- borda: discreta, padrão, forte, foco e desabilitada;
- ação: primária, secundária, silenciosa e destrutiva;
- estado: informação, sucesso, atenção, erro e seleção;
- estudo: progresso, resposta, lacuna, realce e explicação;
- dados: séries categóricas, sequenciais e divergentes;
- estrutura: nó, aresta, eixo, grade, dependência e agrupamento.

## Modos de cor

O seletor oferece `Sistema`, `Claro` e `Escuro`. O modo claro é a referência de
design; `Sistema` respeita `prefers-color-scheme`. A escolha explícita vence a
preferência do sistema e é armazenada apenas no dispositivo.

O documento declara o `color-scheme` efetivamente resolvido antes de carregar o
CSS, para que controles nativos, scrollbars e autofill acompanhem o modo desde
a primeira pintura. O tema escuro usa superfícies cinza
escuras, não preto absoluto, e texto claro sem branco máximo em todos os níveis.

Não se afirma que um modo seja universalmente melhor. Estudos de polaridade
encontram vantagens de desempenho para texto escuro sobre fundo claro em certas
tarefas, enquanto experimentos noturnos encontram redução de fadiga em modo
escuro com contraste adequado. Por isso, a decisão é oferecer controle, manter
alto contraste e avaliar ambos em contextos reais.

## Resources

Os dezoito `resources` integram o sistema de temas. A migração precisa cobrir:

- texto, anotação, código e fórmula;
- escolha, composição e feedback;
- tabela, matriz, sequência e plano cartesiano;
- fluxo, árvore, grafo, relações e mapa de sistema;
- gráfico estatístico e reação química;
- lacunas, respostas reveladas, seleção e estados de prática.

Regras obrigatórias:

- SVG usa classes ou variáveis semânticas e `currentColor` quando apropriado;
- paletas de séries possuem versões clara e escura verificadas separadamente;
- séries também se distinguem por rótulo, forma, traço ou padrão quando houver
  risco de ambiguidade;
- grade, eixo e aresta preservam contraste não textual mínimo;
- sintaxe de código não depende somente de matiz;
- lacuna, resposta e erro mantêm o mesmo significado nos dois modos;
- conteúdo autoral não pode injetar cores que tornem o card ilegível;
- capturas de todos os resources são comparadas em larguras de 360, 390, 412 e
  1280 pixels, nos modos claro e escuro.

## Ícones

O sistema deixa de misturar emoji, entidades tipográficas e SVG. Ícones de
interface serão SVG simples, monocromáticos, desenhados em uma grade comum e
coloridos por `currentColor`.

- tamanho visual consistente em controles de 44 px ou maiores;
- `aria-label` obrigatório quando não houver rótulo visível;
- estados não dependem apenas da troca de ícone;
- setas respeitam direção do conteúdo quando necessário;
- o símbolo de marca permanece um ativo independente e pode ser substituído
  sem alterar o sistema de ícones da interface.

## Tipografia, espaço e forma

- família de sistema, sem download obrigatório de fonte;
- largura confortável para blocos extensos e alinhamento não justificado;
- hierarquia por tamanho, peso e espaço antes de cor;
- escala curta de espaçamento baseada em múltiplos previsíveis;
- cantos discretos e consistentes;
- sombras reservadas a sobreposição e elevação funcional;
- nenhuma redução do alvo de toque para produzir aparência mais compacta.

## Movimento

Transições existem apenas para preservar continuidade espacial ou explicar
mudança de estado. Navegação, voltar e play não aguardam animação. O sistema
respeita `prefers-reduced-motion` e não usa movimento decorativo contínuo.

## Critérios de aceite

- contraste textual WCAG 2.2 AA nos dois modos;
- contraste não textual e foco perceptível em controles e recursos;
- alvo mínimo e alternativa a arrastar conforme WCAG 2.2;
- zoom de 200% e reflow sem perda de operação;
- teclado, toque, leitor de tela e Android WebView;
- nenhuma cor literal fora da fundação ou de fixtures explicitamente testadas;
- nenhum resource depende de uma paleta exclusiva do modo claro;
- troca de modo não recarrega curso nem perde card, resposta, seleção ou prompt;
- primeira pintura não exibe o modo incorreto de forma perceptível;
- funcionamento offline depois que o aplicativo estiver instalado.

## Referências iniciais

- [Material Design 3: temas acessíveis](https://developer.android.com/codelabs/m3-design-theming)
- [Fluent 2: design tokens](https://fluent2.microsoft.design/design-tokens)
- [Wikimedia Codex: estrutura de tokens](https://doc.wikimedia.org/codex/latest/design-tokens/definition-and-structure.html)
- [Wikimedia Codex: modos alternativos](https://doc.wikimedia.org/codex/latest/using-codex/adrs/08-adr-color-modes.html)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
