# Sistema visual do AraLearn

O sistema visual organiza conteúdo, ações e estados para que a pessoa reconheça
onde está, o que pode fazer e o que mudou. O conteúdo didático ocupa o primeiro
plano. Cor, movimento e elementos decorativos entram apenas quando ajudam a
perceber estrutura, seleção, origem ou estado.

A mesma linguagem atende Estudo e Autoria. As duas superfícies preservam a
identidade do Curso, mas apresentam controles diferentes porque estudar,
planejar, inspecionar e corrigir são atividades distintas.

## Fundamentos

O AraLearn usa componentes próprios e uma fundação de variáveis semânticas de
estilo. Cada variável recebe o nome de sua função, como `action-primary`,
`text-secondary` ou `status-danger`. O componente pede a função visual de que
precisa, enquanto os modos claro e escuro fornecem o valor correspondente.

Essa organização evita que uma cor adequada a uma tela se torne ilegível em
outra. Também permite corrigir contraste e coerência numa única origem, sem
substituições espalhadas pelos componentes.

Os princípios vigentes são:

1. posição, espaço, tamanho e peso constroem a hierarquia antes da cor;
2. nenhuma informação depende apenas de cor, forma ou movimento;
3. ações frequentes têm nome compreensível e área de toque adequada;
4. detalhes aparecem no contexto em que podem ser usados;
5. o modo de cor não altera conteúdo, resposta ou estado do Curso;
6. a largura de leitura continua contida em telas grandes;
7. representações acadêmicas preservam suas convenções;
8. uma ação local responde sem aguardar a rede quando já possui os dados
   necessários.

Material Design, Fluent e Wikimedia Codex são referências para temas e
variáveis de estilo. O AraLearn não importa deles uma biblioteca visual ou um
modelo de navegação completo.

## Variáveis de estilo e modos de cor

As variáveis de `public/styles-tokens.css` se distribuem em três níveis:

- opções primitivas de cor, espaço, raio, tipografia e movimento;
- papéis semânticos de superfície, texto, borda, ação, estado, estudo e dados;
- ajustes de componentes derivados desses papéis.

Cores literais pertencem à fundação. Componentes, ícones, SVGs e mecanismos de
renderização usam variáveis semânticas. Cada combinação efetivamente exibida
ainda precisa de verificação de contraste, pois a presença de uma variável não
garante legibilidade por si só.

O seletor oferece **Sistema**, **Claro** e **Escuro**. A opção Sistema acompanha
`prefers-color-scheme`; uma escolha explícita prevalece e fica no dispositivo.
`data-theme-preference` conserva a preferência, e `data-color-mode` registra o
modo resolvido. A troca ocorre sem recarregar o Curso ou consultar a rede.

O modo escuro usa superfícies cinza-escuras e níveis de texto distintos. Preto
e branco absolutos são reservados às situações em que o contraste medido os
exige. A mesma relação semântica deve permanecer reconhecível nos dois modos.

## Estrutura do produto

A entrada de Autoria é **Meus cursos**. A lista mostra descritores suficientes
para reconhecer Cursos próprios e compartilhados sem baixar a composição
inteira. Um toque abre o Curso; a ação de voltar retorna à lista sem criar uma
identidade intermediária.

No Curso próprio, a navegação apresenta nove áreas reais:

- **Planejamento** reúne o plano vivo, as Partes e a atividade pertinente;
- **Parâmetros** mostra decisões de desenho, orientações e política de
  componentes;
- **Fontes** reúne metadados, Âncoras, vínculos de proveniência e PDFs;
- **Estrutura** apresenta a hierarquia curricular;
- **Inspeção** percorre Unidades de estudo na representação usada em Estudo;
- **Auditoria e correções** acompanha observações, achados, propostas,
  aplicação e verificação;
- **Variantes** cria e compara Cursos de origem comum;
- **Pesquisa** apresenta fatos de Autoria, gráficos, tabelas e exportação;
- **Pessoas** controla o acesso direto ao Estudo.

No celular, essas áreas formam uma faixa compacta e rolável. Apenas o destino
selecionado ocupa a área principal. No computador, a composição permanece
centrada e com largura de leitura contida; o espaço adicional não cria um
painel administrativo paralelo. Rótulos extensos quebram linha dentro do espaço
previsto, sem reduzir a área interativa ou deslocar controles vizinhos.

O Estudo conserva navegação própria, com foco na Unidade atual, na prática e na
retomada. Um Curso compartilhado concede Estudo, enquanto a Autoria permanece
reservada à pessoa proprietária. Semelhança visual entre cartões de navegação
não comunica permissão.

## Inspeção vertical

A Inspeção é uma sequência curricular finita, não uma rolagem infinita. Ela
reutiliza o mecanismo de renderização de Estudo com respostas inertes e mostra
posição, hierarquia e limites do recorte. O autor pode restringir a sequência
por Curso, Parte, Módulo, Lição ou Microssequência.

As páginas possuem doze Unidades, e a janela mantém no máximo trinta e seis no
documento. O carregamento acontece nas duas direções. Ao atualizar uma Unidade,
mudar de recorte, perder a conexão ou abrir o mesmo Curso em outra aba, a
interface preserva a identidade da Unidade e sua distância em relação ao topo
fixo. Um endereço direto inclui a Unidade inicial sem transformar o cursor de
paginação em posição curricular.

O seletor hierárquico fecha por clique externo e pela tecla Esc. O retorno
restaura o ponto exato conhecido. Estados vazio, parcial, carregando, sem
conexão e erro ocupam o espaço do conteúdo e oferecem uma ação compatível, sem
cobrir a navegação global.

## Auditoria, Fontes, Variantes e Pesquisa

Auditoria organiza informação em camadas. A lista apresenta alvo, critério,
estado e prioridade. O detalhe mostra evidência, Fonte, Âncora, proposta de
correção e comparação entre antes e depois. **Não verificado**, **incerto** e
**resolvido** mantêm rótulos próprios; gravidade não funciona como nota de
qualidade.

Uma correção exige confirmação antes de alterar a Unidade. A verificação
posterior informa critérios atendidos e incertezas restantes. Reverter também
exige confirmação e conserva a identidade do Curso.

Fontes apresentam primeiro os dados que ajudam a reconhecer o documento. O
detalhe revela revisão, disponibilidade, relações e Âncoras. O envio de PDF
mostra progresso, repetição segura por conteúdo, falha recuperável e uso da
cota do Curso. A opção de baixar só aparece quando o servidor confirma acesso à
revisão exata.

Variantes usam comparação lado a lado quando há largura suficiente. No celular,
a alternância conserva o mesmo aspecto das versões. Diferenças declaradas,
observadas, imprevistas e factuais recebem nomes distintos, assim como dados
ausentes e revisões que mudaram desde o ponto comum.

Pesquisa começa pela síntese do recorte consultado. O gráfico sempre possui
tabela com os mesmos valores, descrição textual, denominador, revisão e
indicação de ausência.
Filtros permanecem visíveis, e cada fato pode levar ao Curso, Parte, Unidade,
Fonte, Observação, auditoria ou comparação correspondente. A superfície não
resume o Curso numa nota.

## Tipografia, espaço e forma

A tipografia usa famílias do sistema para permanecer disponível sem conexão e
conservar métricas adequadas a cada plataforma. A prosa principal parte de
15,5 px e entrelinha de 1,5. Títulos distinguem somente os níveis necessários,
sem competir com o conteúdo. Texto corrido não usa alinhamento justificado.

Espaços derivam de uma escala previsível; cantos e sombras indicam agrupamento
ou sobreposição funcional. Metadados podem ser menores que a prosa, mas
continuam legíveis com ampliação de texto. Controles principais preservam área
interativa de pelo menos 44 por 44 px. Controles repetidos dentro de uma prática
podem usar 28 por 28 px quando a densidade do objeto exige. Esse tamanho supera
o mínimo de 24 por 24 px do nível AA da WCAG 2.2; teclado, foco e separação
continuam necessários.

Fórmulas, diagramas e notações podem exigir métricas próprias. O tamanho óptico
deve acompanhar o texto ao redor, e a ampliação precisa preservar em conjunto
o rótulo e a geometria calculada.

## Ícones, rótulos e foco

Ícones funcionais são SVG monocromáticos numa grade comum e usam
`currentColor`. Um ícone sem texto visível recebe nome acessível. O estado é
comunicado por rótulo, forma e cor; a troca de glifo isolada não basta.

Rótulos descrevem a tarefa. Termos como JSON, versão de estado, identificador de
pacote ou trava de concorrência aparecem apenas em diagnóstico técnico. A
interface comum fala em Curso, Parte, Unidade de estudo, componente didático,
Fonte, Observação, achado e correção.

Contorno, cursor, foco e aparência precisam corresponder à ação disponível. O
foco visível pertence ao controle ativo. Texto sem ação não recebe aparência de
botão, e um elemento editável não transfere essa aparência para toda a Unidade.

## Componentes didáticos e representações

Os pacotes de componentes usam as variáveis `resource-*` para superfície,
texto, borda, grade, eixo, estrutura, lacuna e retorno. Séries de dados usam
`data-series-*` com valores próprios nos modos claro e escuro.

SVGs usam classes, variáveis e `currentColor` quando isso preserva a semântica.
Séries se distinguem também por rótulo, forma, traço ou padrão. Eixos, unidades
e legendas permanecem explícitos. Código, lacunas, respostas e foco não
dependem apenas de matiz.

Vega, Graphviz e MathML calculam representações especializadas sob os mesmos
papéis visuais. Uma paleta acessível não corrige escala estatística inadequada,
e um diagrama sem sobreposição ainda precisa de pertinência didática.

Diagramas extensos conservam tamanho legível numa área própria. Toque e arrasto
dentro dela movem a representação; a pinça altera a ampliação; gestos fora dela
navegam na Unidade. Teclado alcança a área e seus controles. A tela cheia
mantém ações de reduzir, ampliar e retornar, sem criar outra superfície de
edição.

## Prática, retorno e movimento

Seleção, resposta correta, resposta incorreta, foco e indisponibilidade são
comunicados por texto, forma e cor. A resposta esperada só aparece depois de
uma ação
explícita. A pessoa pode tentar novamente sem transformar erros, ajuda ou tempo
em nota ou classificação.

O controle principal confirma a resposta e, no acionamento seguinte, avança. A
transição ocorre localmente; a persistência remota segue pela fila apropriada.
Mudança de tema, instabilidade de rede ou gravação remota não bloqueiam esse
controle.

Movimento preserva continuidade espacial ou explica mudança de estado. A
preferência `prefers-reduced-motion` reduz transições e elimina movimento
decorativo contínuo. Navegar, voltar, confirmar e cancelar não aguardam uma
animação.

## Área segura, sobreposições e mensagens

A interface respeita a área segura do dispositivo nas quatro bordas. Cabeçalhos
reservam altura estável, e ações globais mantêm o mesmo alinhamento entre telas.
Nenhum botão depende da presença ou ausência da barra de rolagem para ocupar sua
posição.

Menus, seletores e diálogos fecham por ação explícita, clique externo e Esc
quando a operação permite. Sobreposições mantêm foco contido e o devolvem ao
controle de origem. Mensagens transitórias não cobrem o controle de avanço nem
impedem a retomada do estudo.

## Acessibilidade e verificação

A referência técnica é a [WCAG 2.2](https://www.w3.org/TR/WCAG22/). A validação
abrange contraste textual e não textual, ampliação de 200%, reorganização do
conteúdo, teclado, toque, nome, papel e estado acessíveis, alternativa a gestos
e preferência de movimento reduzido.

As larguras de referência são 360, 390 e 430 px no celular e 1280 px no
computador. A verificação inclui os modos claro e escuro, textos extensos,
conteúdo denso, duas abas, perda e retorno de conexão, endereços diretos, área
segura, rolagem horizontal, clique externo e Esc. O teste ponta a ponta da
Autoria fica em `tests/e2e/course-authoring-cutover.spec.js`; os cenários de
auditoria usam `tests/e2e/course-audit-panel.spec.js`. A galeria dos componentes
é reconstruída por `npm run resources:gallery:visual`.

A captura móvel corrente de Estudo oferece uma referência visual do conteúdo e
dos controles:

![Unidade de estudo em tela móvel clara, com conteúdo central e controles
iconográficos.](screenshots/study/study-card-390-light.png)

A lista de Cursos registra a superfície mínima de Autoria na mesma largura:

![Lista de Cursos da Autoria em tela móvel clara, com busca, criação e três
Cursos.](screenshots/authoring/authoring-courses-390-light.png)

Uma captura comprova apenas o conjunto de dados, o modo e o tamanho usados. A
aprovação visual exige também interação real, console e rede sem erros, foco,
rolagem, textos extensos e estados intermediários.

## Critério de conclusão visual

Uma mudança visual está pronta quando usa as variáveis semânticas, preserva os
modos de cor, mantém o significado pedagógico, funciona nos quatro tamanhos de
referência, sustenta toque e teclado, evita recorte e rolagem horizontal
acidental e mantém uma única responsabilidade por componente.

## Referências técnicas

- [Material Design 3: temas acessíveis](https://developer.android.com/codelabs/m3-design-theming)
- [Fluent 2: variáveis de estilo](https://fluent2.microsoft.design/design-tokens)
- [Wikimedia Codex: estrutura de variáveis](https://doc.wikimedia.org/codex/latest/design-tokens/definition-and-structure.html)
- [Wikimedia Codex: modos alternativos](https://doc.wikimedia.org/codex/latest/using-codex/adrs/08-adr-color-modes.html)
- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
