# Sistema visual do AraLearn

O sistema visual organiza como conteúdo, ações e estados são percebidos. Sua função não é decorar o aplicativo: é reduzir ambiguidade, conservar continuidade entre telas e permitir que representações acadêmicas ocupem o primeiro plano.

A unidade básica dessa organização é o **token de design**, nome estável atribuído a uma decisão visual. Um componente pode pedir, por exemplo, a cor de uma ação primária sem conhecer o valor usado em cada tema.

A base é neutra, de baixa densidade decorativa e tipografia legível. Cor é reservada para ação, seleção, origem e estado. Modos claro, escuro e do sistema preservam a mesma semântica.

## 1. Problema de design

Uma interface construída com valores locais de cor, tamanho e espaçamento pode parecer correta numa tela e falhar em outra. Temas passam a exigir substituições manuais; um novo resource inventa uma paleta; estados como erro e seleção deixam de ser consistentes. A alternativa de copiar componentes completos de outro design system introduziria linguagem visual e pressupostos que não pertencem ao fluxo de estudo.

### Decisão

O AraLearn adota:

- tokens semânticos compartilhados;
- componentes próprios, pequenos e consistentes;
- tipografia e controles nativos quando suficientes;
- renderizadores especializados subordinados aos mesmos tokens;
- critérios verificáveis de contraste, toque, reflow e movimento.

Material Design, Fluent e Wikimedia Codex servem como referências de engenharia de temas e tokens, não como bibliotecas obrigatórias nem modelos de produto.

## 2. Princípios

1. o conteúdo didático ocupa o primeiro plano;
2. hierarquia é produzida primeiro por posição, espaço, tamanho e peso;
3. cor nunca é o único meio de comunicar estado ou relação;
4. ações frequentes são reconhecíveis e alcançáveis com uma mão;
5. ações avançadas aparecem no contexto em que são necessárias;
6. o tema não altera conteúdo, resposta ou contrato de package;
7. preferência visual é local ao dispositivo e não produz telemetria;
8. o aplicativo mantém largura de leitura móvel também no desktop;
9. diagramas preservam sua convenção acadêmica, ainda que precisem de frame rolável;
10. latência de rede não bloqueia uma transição que pode ser concluída localmente.

## 3. Tokens de design

Em vez de declarar `#1a73e8` num botão, o componente usa um token com papel como `action-primary`. O valor concreto pode mudar entre temas sem alterar o componente.

A arquitetura em `public/styles-tokens.css` possui três níveis:

1. **opções**: valores primitivos de cor, espaço, raio, tipografia e movimento;
2. **decisões**: papéis como `surface-canvas`, `text-secondary`, `border-default`, `action-primary`, `status-danger` e `origin-catalog`;
3. **componentes**: ajustes locais derivados das decisões semânticas.

Somente opções contêm cores literais. Componentes, SVGs e renderizadores usam decisões. Isso impede que um resource fique invisível no modo escuro porque escolheu uma cor adequada apenas ao modo claro.

### Famílias semânticas

| Família | Papéis representados |
|---|---|
| superfícies | página, base, elevada, rebaixada, sobreposição |
| texto | principal, secundário, discreto, desabilitado, invertido |
| bordas | discreta, padrão, forte, foco, desabilitada |
| ações | primária, secundária, silenciosa, destrutiva |
| estados | informação, sucesso, atenção, erro, seleção |
| estudo | progresso, resposta, lacuna, realce, explicação |
| dados | séries categóricas, sequenciais, divergentes |
| estrutura | nó, aresta, eixo, grade, dependência, agrupamento |

Tokens reduzem duplicação, mas não garantem contraste por si sós. Cada combinação efetivamente usada precisa ser medida.

## 4. Modos claro, escuro e sistema

O seletor oferece `Sistema`, `Claro` e `Escuro`. `Sistema` acompanha `prefers-color-scheme`; uma escolha explícita prevalece e fica apenas no dispositivo.

`data-theme-preference` registra a preferência e `data-color-mode` registra o modo resolvido. O documento define `color-scheme` antes do CSS principal, de modo que controles nativos, scrollbar e autofill acompanhem a primeira pintura. A troca de modo altera tokens; não recarrega curso, não consulta a rede e não perde card, resposta ou seleção.

O modo escuro usa superfícies cinza-escuras e níveis de texto distintos. Preto e branco absolutos não são aplicados indiscriminadamente. Não se presume que uma polaridade seja melhor para todas as pessoas e tarefas; a decisão é oferecer controle e validar contraste em ambas.

## 5. Organização e navegação

`Trilhas` é a superfície de organização e estudo. `Coleções` é a superfície de descoberta e, para contas autorizadas, de administração editorial. Semelhança entre cartões reduz reaprendizagem, mas nunca comunica permissão: capacidade é derivada do servidor e controles editoriais aparecem em modo explícito.

No leitor, **Visualizar**, **Editar** e **IA** são estados contextuais da mesma superfície. Seus controles ocupam o centro da barra superior; o título contextual aparece no início do conteúdo, sem consumir uma segunda faixa exclusiva. Em Visualizar, não permanecem controles de autoria. Em Editar, somente textos declarados pelos packages recebem affordance de edição. Em IA, a seleção delimita o escopo enviado à conversa.

Uma **affordance** é uma pista perceptível de como um elemento pode ser usado. Contorno de seleção, cursor, foco e rótulo precisam corresponder à operação disponível; aparência de botão não pode ser aplicada a texto sem ação.

## 6. Tipografia, espaço e forma

- família de sistema, sem download obrigatório, para conservar sobriedade,
  disponibilidade offline e métricas adequadas a cada plataforma;
- prosa principal em 15,5 px, com entrelinha de 1,5; alternativas repetidas de
  lacuna recuperam a escala compacta de 0,69 rem, cerca de 11 px no tamanho
  padrão, peso regular, padding reduzido e altura mínima de 28 px. A unidade
  relativa acompanha a ampliação de texto, enquanto os demais campos
  interativos, a matemática e o texto interno de diagramas conservam o piso
  necessário à leitura e à operação;
- corpo e rótulos textuais de resources seguem a escala básica do `paragraph`,
  salvo notação cuja geometria dependa de métricas próprias;
- largura de leitura confortável e alinhamento não justificado;
- hierarquia curta por tamanho e peso, sem títulos gigantes;
- espaços derivados de uma escala previsível;
- cantos discretos e consistentes;
- sombras apenas em sobreposição ou elevação funcional;
- metadados menores que o conteúdo, mas ainda legíveis;
- controles principais conservam alvo de 44 px; alternativas repetidas de
  lacuna equilibram leitura e área útil com alvo mínimo de 28 px, ainda acima
  do mínimo AA.

Em diagramas cujo motor calcula previamente as caixas, rótulos HTML e lacunas
internas permanecem em 16 px para não divergir da geometria medida. O zoom do
próprio frame amplia texto e desenho em conjunto; a escala tipográfica externa
não pode aumentar apenas o rótulo e recortá-lo dentro do nó.

Fórmulas e símbolos podem ter métricas próprias da notação matemática. Isso não autoriza ampliação arbitrária: o tamanho óptico deve permanecer coerente com o texto ao redor, e delimitadores devem acompanhar a altura real do conteúdo com traço fino.

## 7. Ícones e rótulos

Ícones da interface são SVG monocromáticos numa grade comum e usam `currentColor`. Emoji e caracteres tipográficos não são usados como substitutos intercambiáveis de ícones.

- controles principais têm área interativa de 44 px ou maior;
- ícone sem texto visível exige nome acessível;
- estado não depende apenas da troca de glifo;
- setas acompanham a direção do conteúdo;
- o símbolo de marca é um ativo separado do conjunto funcional.

Rótulos usam a linguagem da tarefa. Textos autorreferentes como “deslize para ver este resource” são evitados quando o gesto já é evidente pela própria superfície. Uma instrução de leitura só existe quando ensina uma convenção disciplinar necessária.

## 8. Resources e dados visuais

Todos os packages consomem tokens `resource-*` para superfície, texto, borda, grade, eixo, estrutura, lacuna e feedback. Séries de dados usam `data-series-*` com valores próprios em claro e escuro.

Regras:

- SVG usa classes, variáveis e `currentColor` quando apropriado;
- JavaScript não contém fallback cromático literal no renderer;
- séries se distinguem por rótulo, forma, traço ou padrão, além da cor;
- grade, eixo, seta e aresta preservam contraste não textual;
- sintaxe de código não depende só de matiz;
- lacuna, resposta, erro e foco mantêm semântica entre temas;
- conteúdo autoral não injeta cor arbitrária;
- legendas explicitam variável, unidade e categoria, sem abreviação obscura.

Vega/Vega-Lite, Graphviz/Viz.js e MathML calculam aspectos especializados, mas recebem tokens do AraLearn. Uma paleta acessível não corrige escala estatística inadequada; um layout sem sobreposição não prova que o diagrama é pedagogicamente pertinente.

## 9. Frames internos e gestos móveis

Diagramas extensos não são comprimidos até perder legibilidade. Eles ficam num
frame de altura estável, com zoom e movimentação nos dois eixos sem alterar o
tamanho do card.

### Contrato de interação

- toque ou arrasto dentro do frame navega no diagrama ampliado;
- pinça com dois dedos amplia ou reduz o desenho no celular;
- gesto fora do frame navega no card;
- o diagrama abre no início de sua leitura, não numa posição arbitrária;
- foco por teclado alcança o frame e seus controles por ícone;
- uma faixa superior reservada no frame mantém diminuir, aumentar e expandir no
  canto direito, sem se sobrepor ao desenho;
- o mesmo diagrama pode ocupar a tela cheia sem ganhar um painel paralelo;
- em tela cheia, a largura não supera a largura móvel do aplicativo; diminuir e
  aumentar ficam à esquerda, enquanto retornar ao card fica à direita;
- preenchimento de lacuna usa a reserva prevista pelo layout, sem redimensionar
  o frame ou o card;
- orientação vertical é preferida para progressões longas no celular; comparação lateral permanece horizontal quando sua semântica depende disso.

A rolagem interna adiciona um contexto de navegação e deve ser usada apenas quando preservar o tamanho natural é melhor que dividir a representação. O teste precisa incluir gesto dentro e fora do frame em WebView e navegador móvel.

## 10. Estado, feedback e Play

Seleção, resposta correta, resposta incorreta, foco e desabilitação combinam texto, forma e cor. A resposta correta não é revelada antes de o estudante pedir explicitamente “Ver resposta”. Ações de feedback usam os mesmos tokens de ação nos modos claro e escuro.

Play é o controle único de confirmação e avanço:

```text
responder localmente
→ tocar Play
→ avaliar e mostrar feedback
→ tocar Play novamente
→ avançar
```

Uma persistência remota é enfileirada depois da transição local. O botão não aguarda rede, troca de tema ou recarga de página. Controles redundantes de “Conferir” dentro de packages são rejeitados porque fragmentariam o fluxo.

## 11. Movimento e preferência reduzida

Movimento existe para preservar continuidade espacial ou explicar mudança de estado. Navegação, voltar e Play não aguardam animação. `prefers-reduced-motion` reduz transições e elimina movimento decorativo contínuo.

Uma animação aprovada demonstra a relação entre dois estados; não serve para mascarar espera de rede. Quando há processamento inevitável, a interface indica estado e permanece cancelável quando a operação permitir.

## 12. Acessibilidade

Os critérios adotam [WCAG 2.2](https://www.w3.org/TR/WCAG22/) como referência técnica:

- contraste textual nível AA;
- contraste não textual de controles e foco;
- reflow e zoom de 200% sem perda de operação;
- operação por teclado e toque;
- nome, papel e estado acessíveis;
- alternativa a gestos de arrastar quando exigida;
- respeito a preferência de movimento reduzido.

O alvo de 44 px permanece a decisão conservadora para controles principais.
Alternativas repetidas de lacuna podem usar 28 px para preservar a densidade do
card; esse tamanho continua superior ao mínimo AA de Target Size (Minimum).
Conformidade automatizada não demonstra usabilidade com tecnologia assistiva;
leitor de tela, WebView, teclado e aparelho real continuam necessários.

## 13. Evidência visual e automatizada

`npm run resources:gallery:visual` recompõe a galeria a partir do registry, abre Chromium em 360, 390, 412 e 1280 px, aplica claro e escuro, rejeita erro de browser e overflow horizontal do card e grava capturas em [`docs/screenshots/resources-packages`](screenshots/resources-packages/).

Outros testes exercitam:

- troca de tema sem recarga;
- foco e nomes acessíveis;
- Play sob CPU reduzida e sem rede;
- rolagem dentro e fora de frames;
- materialização de lacunas com texto real;
- geometrias de Graphviz, Vega e MathML;
- edição e seleção contextual.

Captura aprovada é evidência de um conjunto de dados e viewport, não prova universal. Por isso fixtures incluem textos longos, várias relações, múltiplas lacunas, escalas e exemplos disciplinares não triviais.

## 14. Critérios de aceite

Uma mudança visual está pronta quando:

1. usa tokens semânticos e não introduz cor literal fora da fundação;
2. preserva claro, escuro e Sistema;
3. não muda significado ou estrutura pedagógica;
4. funciona em 360, 390, 412 e 1280 px;
5. mantém toque, teclado, zoom e leitor de tela;
6. não cria scroll da página por overflow acidental;
7. não bloqueia interação local por rede;
8. atualiza testes e capturas pertinentes;
9. remove responsabilidade duplicada no componente substituído.

## Referências técnicas

- [Material Design 3: temas acessíveis](https://developer.android.com/codelabs/m3-design-theming)
- [Fluent 2: design tokens](https://fluent2.microsoft.design/design-tokens)
- [Wikimedia Codex: estrutura de tokens](https://doc.wikimedia.org/codex/latest/design-tokens/definition-and-structure.html)
- [Wikimedia Codex: modos alternativos](https://doc.wikimedia.org/codex/latest/using-codex/adrs/08-adr-color-modes.html)
- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
