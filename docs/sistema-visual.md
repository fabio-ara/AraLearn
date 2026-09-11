# Sistema visual do AraLearn

O sistema visual organiza conteúdo, ações e estados para que a pessoa reconheça onde
está, o que pode fazer e o que mudou. O conteúdo didático ocupa o primeiro plano. Cor,
movimento e elementos decorativos entram apenas quando ajudam a perceber estrutura,
seleção, origem ou estado.

A mesma linguagem atende Estudo e Autoria. As duas superfícies preservam a identidade
do curso, mas apresentam controles diferentes porque estudar, planejar, inspecionar e
corrigir são atividades distintas.

O [roteiro de jornadas](roteiro-aceitacao-humana-autoria.md) organiza a verificação da
experiência. A [matriz técnica](matriz-conformidade-tecnica.md) relaciona cada
capacidade à implementação e aos testes; resultados visuais pertencem à versão e ao
ambiente em que foram observados.

## Fundamentos

As regras de aparência ficam em folhas de estilo
[CSS](https://developer.mozilla.org/pt-BR/docs/Web/CSS): elas definem, por exemplo,
cor, espaço e tamanho dos elementos da página. O AraLearn usa componentes próprios e
variáveis de estilo nomeadas por função, também chamadas variáveis semânticas.
Cada variável recebe o nome de sua função, como `action-primary`, `text-secondary` ou
`status-danger`. O componente pede a função visual de que precisa, enquanto os modos
claro e escuro fornecem o valor correspondente.

Essa organização evita que uma cor adequada a uma tela se torne ilegível em outra.
Também permite corrigir contraste e coerência numa única origem, sem substituições
espalhadas pelos componentes.

Os princípios vigentes são:

1. posição, espaço, tamanho e peso constroem a hierarquia antes da cor;
2. nenhuma informação depende apenas de cor, forma ou movimento;
3. ações frequentes têm nome compreensível e área de toque adequada;
4. detalhes aparecem no contexto em que podem ser usados;
5. o modo de cor não altera conteúdo, resposta ou estado do curso;
6. a largura de leitura continua contida em telas grandes;
7. representações acadêmicas preservam suas convenções;
8. uma ação local responde sem aguardar a rede quando já possui os dados
   necessários.

[Material Design](https://developer.android.com/codelabs/m3-design-theming),
[Fluent](https://fluent2.microsoft.design/design-tokens) e [Wikimedia
Codex](https://doc.wikimedia.org/codex/latest/design-tokens/definition-and-structure.html)
são referências para temas e variáveis de estilo. O AraLearn não importa deles uma
biblioteca visual ou um modelo de navegação completo.

## Variáveis de estilo e modos de cor

As variáveis de `public/styles-tokens.css` se distribuem em três níveis:

- opções primitivas de cor, espaço, raio, tipografia e movimento;
- papéis semânticos de superfície, texto, borda, ação, estado, estudo e dados;
- ajustes de componentes derivados desses papéis.

Cores literais pertencem à fundação. Componentes, ícones, imagens vetoriais em SVG
e mecanismos de
renderização usam variáveis semânticas. Cada combinação efetivamente exibida ainda
precisa de verificação de contraste, pois a presença de uma variável não garante
legibilidade por si só.

O seletor oferece **Sistema**, **Claro** e **Escuro**. A opção Sistema acompanha
`prefers-color-scheme`; uma escolha explícita prevalece e fica no dispositivo.
`data-theme-preference` conserva a preferência, e `data-color-mode` registra o modo
resolvido. A troca ocorre sem recarregar o curso ou consultar a rede.

O modo escuro usa superfícies cinza-escuras e níveis de texto distintos. Preto e
branco absolutos são reservados às situações em que o contraste medido os exige. A
mesma relação semântica deve permanecer reconhecível nos dois modos.

Nenhuma polaridade é tratada como superior em todas as situações. Numa tarefa
específica de revisão de texto, a polaridade positiva, com texto escuro sobre fundo
claro, apresentou desempenho melhor e pupilas menores ([Piepenbrock et al. (2014)](referencias.md#ref-piepenbrock2014polarity)). Em outro experimento, realizado
à noite com baixa iluminação da tela e do ambiente, o modo escuro apresentou menores
marcadores objetivos de fadiga, enquanto o claro recebeu maior preferência subjetiva;
contraste mais alto foi preferido nos dois casos ([Xie et al. (2021)](referencias.md#ref-xie2021colormode)). Tarefa, luminância, iluminação e medida
mudam a interpretação. Por isso, o produto oferece escolha, preserva contraste e
verifica ambos os modos, sem converter preferência ou um resultado situado em regra
universal.

## Estrutura do produto

A entrada de Autoria é **Meus cursos**. A lista mostra descritores suficientes para
reconhecer os cursos próprios sem baixar a composição inteira. Cursos compartilhados
aparecem somente em Estudo. Um toque abre o curso; a ação de voltar retorna à lista
e ao ponto de navegação anterior.

O curso próprio abre diretamente em **Conteúdo**. A barra mantém atalhos por ícone
para Conteúdo e Planejamento. **Parâmetros**, **Fontes**, **Áudio**, **Revisão**,
**Dados de autoria** e **Pessoas e acesso** ficam no menu compacto. Esses nomes expressam tarefas humanas e
não expõem módulos internos.

A barra superior permanece compacta, com voltar, título do objeto, indicador de
sincronização e menu de tarefas. O indicador compartilha a linguagem de Estudo,
conserva sua geometria em todos os estados e comunica a mudança pelo ícone e pelo nome
acessível. Uma ação situada pode levar diretamente à tarefa e ao objeto necessários
sem criar uma segunda navegação ou uma barra lateral.

Celular e computador usam a mesma composição de até 430 px, centralizada em telas
maiores. A largura extra não acrescenta uma segunda coluna principal nem uma barra
lateral de navegação. A Autoria possui uma única área principal de rolagem vertical; tabelas e
comparações largas usam rolagem horizontal local.

As ações das superfícies principais usam somente ícones, com nome acessível, estado e
dica também alcançável por toque. Menus e ajustes revelados usam texto necessário à
decisão. Edição, reordenação e exclusão aparecem ao abrir os controles do objeto.
Planejamento conserva objetivo e parte focal visíveis; suas ações ficam junto do
objeto a que se referem. Detalhes de organização são abertos quando necessários,
preservando espaço para o mapa e o conteúdo.

Em **Conteúdo**, observações e mudanças de parâmetros permanecem ligadas ao alvo
inspecionado e aparecem como estado do próprio curso. A pessoa pode percorrer os
cards, registrar decisões e verificar resultados sem abrir uma superfície paralela. Um
assistente conectado por MCP ou Actions lê esse mesmo estado e apresenta propostas
para discussão. A pessoa orienta a produção, inspeciona o resultado e decide o que
aplicar; a execução respeita o alcance da autorização já dada. As alterações salvas
pelo assistente são consultadas no próprio curso.

Na unidade, **Visualizar**, **Editar** e **Assistência por IA** usam o mesmo mecanismo
de apresentação e o mesmo alvo. A edição realça apenas os textos que o componente
autoriza. A assistência abre uma sobreposição de até 430 px, mantém a conversa em
primeiro plano e associa uma proposta concreta a cada resposta. Configuração do
serviço e detalhes aparecem progressivamente. Aceitar gera, valida e aplica somente ao
rascunho; salvar continua sendo uma decisão separada da pessoa.

Somente o proprietário edita, inclusive em Estudo. O estudante com acesso pode estudar
e observar; uma tentativa de edição informa a necessidade de propriedade sem criar
curso. Copiar é uma tarefa explícita do autor e produz outro curso independente, sem
transportar acesso de terceiros nem estado pessoal.

A sobreposição permite escolher OpenAI, Gemini ou DeepSeek e informar uma chave
mantida somente na memória da sessão. A pessoa pode continuar a conversa para
reformular a proposta, examinar o resultado e então aceitá-lo no rascunho. A edição manual continua
disponível, inclusive para código ou terminal extensos.

No modo automático, o retorno de outra guia ou janela provoca a releitura do cabeçalho
canônico e da área visível. No modo manual, conteúdo já aberto e estado de estudo só
são sincronizados pelo acionamento da nuvem. Verificações de acesso e gravações
autorais explicitamente solicitadas continuam ativas. Uma ação de atualização
permanece disponível no cabeçalho para o caso em que o navegador não comunique a
mudança de foco. Durante a releitura, o conteúdo confirmado permanece montado e não
muda de posição; o indicador de sincronização informa o andamento até a substituição
pontual dos dados. Esse fluxo conserva o painel ativo e a posição útil, em vez de
exigir que a pessoa reencontre o alvo.

Uma confirmação ou um formulário ativo bloqueia essa releitura até que a pessoa
conclua ou cancele o rascunho. Os campos preenchidos permanecem no documento, e a
nuvem indica a atualização pendente. Somente conflito material exige explicação focal;
adiamento normal não cria mensagem persistente. Preservar o trabalho em curso tem
precedência sobre substituir a área por uma revisão recém-lida.

Recomposições internas seguem a mesma regra. Parâmetros, **Fontes**, observações,
Conteúdo e Analytics conservam valores, detalhes progressivos e foco após validação
local, atualização assíncrona ou falha de rede ambígua. Uma nova tentativa sem edição
parte do formulário novamente apresentado e conserva o mesmo pedido, para evitar
duplicação do efeito;
cancelar ou descartar limpa esse estado transitório de maneira explícita.

O Estudo conserva navegação própria, com foco na unidade atual, na prática e na
retomada. A barra cotidiana usa **Voltar + Home**: Voltar restaura a origem real,
rolagem e foco; Home oferece saída global previsível. Acesso direto ao pai só aparece
como ação contextual quando uma jornada concreta o justificar. Um curso compartilhado
concede Estudo e não entra na Autoria da pessoa favorecida. Uma cópia explicitamente
criada pelo proprietário aparece na sua Autoria como curso independente. Semelhança
visual entre cartões de navegação não comunica permissão.

Sua entrada usa um único seletor pesquisável de curso (combobox) e uma única prévia
detalhada do curso selecionado. A prévia reúne objetivo, relação de acesso, progresso,
disponibilidade local e a ação estável **Abrir**, que leva à lista de módulos. Ela não
se multiplica numa grade de cartões, não pula a hierarquia por causa de uma posição
salva e não mostra UUID, hash ou revisão técnica. A composição permanece centralizada
e limitada a 430 px também em 1280 px.

## Sequência curricular em Conteúdo

Em Conteúdo, a inspeção percorre uma sequência curricular com limites explícitos. Ela
reutiliza o mecanismo de renderização de Estudo com respostas inertes e mostra
posição, hierarquia e limites do recorte. O autor pode restringir a sequência por
curso, parte, módulo, lição ou microssequência.

A [explicação](explicacao-e-revisao-humana.md), texto-base da microssequência, abre
em uma sobreposição para consulta e inspeção junto às fontes. Ela conserva sua
própria declaração de revisão, separada das unidades. Fechar a leitura devolve o
foco ao ponto de origem. A sobreposição reutiliza o tratamento de texto, componentes
e referências presente nas unidades de estudo.

As páginas usam doze unidades por padrão, e a janela mantém no máximo trinta e seis no
documento. O carregamento acontece nas duas direções. Ao atualizar uma unidade, mudar
de recorte, perder a conexão ou abrir o mesmo curso em outra aba, a interface preserva
a identidade da unidade e sua distância em relação ao topo fixo. Um endereço direto
inclui a unidade inicial sem transformar o cursor de paginação em posição curricular.

O seletor hierárquico fecha por clique externo e pela tecla Esc. O retorno restaura o
ponto exato conhecido. Estados vazio, parcial, carregando, sem conexão e erro ocupam o
espaço do conteúdo e oferecem uma ação compatível, sem cobrir a navegação global.

## Revisão, Fontes e Dados de autoria

Revisão parte das observações abertas e da unidade de estudo focal. Seleção em lote
aparece somente quando a ação exige vários alvos. Detalhes e decisões ficam próximos
do conteúdo; não existe uma tela de execuções ou console de auditoria.

Fontes apresentam primeiro os dados que ajudam a reconhecer o documento. O detalhe
revela disponibilidade, papel e âncoras. O envio de PDF mostra progresso, repetição
segura por conteúdo, falha recuperável e uso da cota. A opção de baixar só aparece
quando o servidor confirma um vínculo ativo e o acesso da pessoa ao curso.

**Dados de autoria** apresenta uma dimensão por vez, inicialmente **Novidade
declarada**. A pessoa escolhe a dimensão e o recorte do curso, pode abrir os dados e
suas definições e chegar às unidades de uma distribuição. A comparação mantém os
dois cursos identificados. **Exportar curso e análise** abre uma confirmação do
conteúdo incluído no arquivo. A leitura conserva uma coluna principal; dados ausentes
recebem indicação própria, sem serem convertidos em zero ou numa nota do curso.

## Tipografia, espaço e forma

A tipografia usa famílias do sistema para permanecer disponível sem conexão e
conservar métricas adequadas a cada plataforma. A prosa principal parte de
`--type-prose` (0,96875 rem, equivalente a 15,5 px com raiz de 16 px) e entrelinha de
1,5. Cartões e explicação usam o mesmo papel `--resource-text`: cinza `gray-700` no
claro e `gray-300` no escuro. O apoio usa `--resource-text-secondary`, distinto de
indisponibilidade. Títulos distinguem somente os níveis necessários, sem competir com
o conteúdo. Texto corrido não usa alinhamento justificado.

A escala existente preserva 1 rem para alternativas e valores principais, 0,9375 rem
para código e tabelas, 0,875 rem para legendas e 0,8125 rem para metadados. Reduzir o
corpo não é um mecanismo de ajuste automático de conteúdo. Títulos de unidade
conservam maiúsculas, minúsculas e símbolos do autor; nenhuma transformação visual
converte `TCP`, `pH` ou `NaCl` em outras grafias. Código, terminal e alternativas de
código usam a variável `--font-mono`, mantendo espaços, linhas e literais. A
família de interface não substitui fontes matemáticas nem altera a notação
especializada: glosas e transcrição fonética (IPA), anotações de leitura ruby,
caracteres chineses, japoneses e coreanos (CJK) e escrita da direita para a
esquerda (RTL).

O [inventário de papéis do
catálogo](componentes-didaticos.md#inventário-tipográfico-do-catálogo) relaciona os 38
pacotes, seus renderers e extremos pertinentes. Os testes
[tipográficos](../tests/runtime/resource-typography.test.js) conferem tokens,
contraste das combinações declaradas e preservação textual. Eles não medem métricas de
fontes instaladas, reflow ou legibilidade dos pixels: 320 CSS px, ampliação de 200%,
larguras móveis, temas e interação exigem a inspeção real coordenada no Chrome. SVGs
com geometria calculada mantêm a família e o tamanho usados pelo motor; CSS não troca
sua métrica depois do cálculo.

A interface usa títulos de 16 px, com peso entre 550 e 600, controles textuais de 14
px e apoio de 13 px. Cinzas legíveis e pesos moderados organizam as tarefas; negrito
não é o padrão de todo rótulo. Esses valores não uniformizam a prosa, as fórmulas ou
os elementos internos dos componentes didáticos.

A largura e a altura do quadro de cada papel são determinadas pela janela e pelo
layout, não pelo comprimento do título ou da descrição. Texto integral permanece
disponível por rolagem local e teclado. Abrir detalhes não desloca o card vizinho. Nas
listas de navegação, as ações ocupam um rodapé interno estável, separado da descrição;
parágrafos e tabelas dentro do leitor continuam com a altura necessária ao conteúdo.

Voltar, sincronização e menu conservam as mesmas âncoras em Estudo e Autoria,
inclusive com barras de rolagem de desktop e no modo de edição. Avisos novos não
deslocam esses controles. Confirmações de sucesso são fecháveis e breves; erros ou
respostas incertas mantêm um sinal no menu, onde a explicação e a ação de recuperação
podem ser abertas sem encobrir permanentemente o rodapé.

A edição aberta pelo Conteúdo conserva o cabeçalho e a rota da Autoria nos níveis
curso, módulo, lição, microssequência e unidade. O motor de edição é compartilhado com
o Estudo, mas essa entrada retorna à inspeção ao salvar ou cancelar, preservando a
posição e o foco de origem. Voltar com um rascunho ou uma gravação incerta exige
decidir se ele deve ser mantido ou descartado; descartar a recuperação não desfaz
dados já salvos. Essa edição não altera o percurso de Estudo.

Nos níveis estruturais, Cancelar e Salvar ficam lado a lado no rodapé da tela, fora da
área de rolagem; pouco texto não os deixa junto aos primeiros cards. A lista Meus
cursos usa o mesmo alinhamento de Voltar, nuvem e menu. Criar e atualizar ficam no
menu; falhas de leitura e criação permanecem acessíveis pelo indicador, sem deslocar a
busca ou encobrir os cards. A recuperação de uma criação incerta conserva o pedido
original até sua confirmação ou descarte explícito.

Fontes mantém o catálogo como área principal. A fonte selecionada abre uma folha de
altura estável, com título curto e dados completos em detalhes revelados. Referência,
arquivos, âncoras e observações conservam seus dados e ações; fechar retorna ao foco
de origem. Pessoas revela acesso e cópia em ajustes, mantendo ações individuais por
ícone e o consentimento explícito para permissões que geram cópias independentes.

Espaços derivam de uma escala previsível; cantos e sombras indicam agrupamento ou
sobreposição funcional. Metadados podem ser menores que a prosa, mas continuam
legíveis com ampliação de texto. Controles principais preservam área interativa de
pelo menos 44 por 44 px. Controles repetidos dentro de uma prática podem usar 28 por
28 px quando a densidade do objeto exige. Esse tamanho supera o mínimo de 24 por 24 px
do nível AA das [diretrizes WCAG 2.2](https://www.w3.org/TR/WCAG22/#target-size-minimum); teclado, foco e separação continuam necessários.

Fórmulas, diagramas e notações podem exigir métricas próprias. O tamanho óptico deve
acompanhar o texto ao redor, e a ampliação precisa preservar em conjunto o rótulo e a
geometria calculada.

## Ícones, rótulos e foco

Ícones funcionais são SVG monocromáticos numa grade comum e usam `currentColor`. Um
ícone sem texto visível recebe nome acessível. O estado é comunicado por rótulo, forma
e cor; a troca de glifo isolada não basta.

Nas superfícies principais, os controles usam ícones com nomes acessíveis. Menus e
ajustes revelados admitem rótulos. Títulos não recebem sufixos como `· Seu Curso` para
expressar propriedade; iconografia e estado acessível fazem essa distinção, com cor
apenas como reforço.

Rótulos descrevem a tarefa. Termos como JSON, versão de estado, identificador de
pacote ou trava de concorrência aparecem apenas em diagnóstico técnico. A interface
comum fala em curso, parte, unidade de estudo, componente didático, fonte, observação,
achado e correção.

Contorno, cursor, foco e aparência precisam corresponder à ação disponível. O foco
visível pertence ao controle ativo. Texto sem ação não recebe aparência de botão, e um
elemento editável não transfere essa aparência para toda a unidade.

## Componentes didáticos e representações

Os pacotes de componentes usam as variáveis `resource-*` para superfície, texto,
borda, grade, eixo, estrutura, lacuna e retorno. Séries de dados usam `data-series-*`
com valores próprios nos modos claro e escuro.

SVGs usam classes, variáveis e `currentColor` quando isso preserva a semântica. Séries
se distinguem também por rótulo, forma, traço ou padrão. Eixos, unidades e legendas
permanecem explícitos. Código, lacunas, respostas e foco não dependem apenas de matiz.

[Vega](https://vega.github.io/vega/) desenha gráficos a partir de dados;
[Graphviz](https://graphviz.org/documentation/) calcula posições e conexões de
diagramas; [MathML](https://developer.mozilla.org/pt-BR/docs/Web/MathML) representa
notação matemática no navegador. Esses recursos seguem os mesmos papéis visuais quando
suas convenções permitem. Uma paleta acessível não corrige escala estatística
inadequada, e um diagrama sem sobreposição ainda precisa de pertinência didática.

Diagramas extensos conservam tamanho legível numa área própria. Toque e arrasto dentro
dela movem a representação; a pinça altera a ampliação; gestos fora dela navegam na
unidade. Teclado alcança a área e seus controles. A tela cheia mantém ações de
reduzir, ampliar e retornar, sem criar outra superfície de edição.

O grafo matemático compartilha os controles de enquadramento, ampliação e retorno dos
diagramas. Nos mapas de memória em telas estreitas, o endereço inicial e o final
delimitam a descrição em linhas próprias, preservando a largura de leitura e a ordem
dos segmentos.

## Prática, retorno e movimento

Seleção, resposta correta, resposta incorreta, foco e indisponibilidade são
comunicados por texto, forma e cor. A resposta esperada só aparece depois de uma ação
explícita. A pessoa pode tentar novamente sem transformar erros, ajuda ou tempo em
nota ou classificação.

O controle principal confirma a resposta e, no acionamento seguinte, avança. A
transição ocorre localmente; a persistência remota segue pela fila apropriada. Mudança
de tema, instabilidade de rede ou gravação remota não bloqueiam esse controle.

A unidade usa a altura útil disponível sem criar rolagem vertical no documento.
Conteúdo curto e longo conservam a mesma moldura e a mesma área inferior de ações;
somente o interior do cartão rola quando necessário. Numa lacuna preenchível, o prompt
pertence à lacuna ativa, e limpar uma resposta não altera as lacunas vizinhas.

Movimento preserva continuidade espacial ou explica mudança de estado. A preferência
`prefers-reduced-motion` reduz transições e elimina movimento decorativo contínuo.
Navegar, voltar, confirmar e cancelar não aguardam uma animação.

## Área segura, sobreposições e mensagens

A interface respeita a área segura do dispositivo nas quatro bordas. Cabeçalhos
reservam altura estável, e ações globais mantêm o mesmo alinhamento entre telas.
Nenhum botão depende da presença ou ausência da barra de rolagem para ocupar sua
posição.

Menus, seletores e diálogos fecham por ação explícita, clique externo e Esc quando a
operação permite. Sobreposições mantêm foco contido e o devolvem ao controle de
origem. Mensagens transitórias não cobrem o controle de avanço nem impedem a retomada
do estudo.

Folhas sobrepostas e diálogos conservam dimensões externas estáveis. Quando o conteúdo
varia ou cresce, ele rola internamente sem deslocar a barra superior, a área inferior
de ações ou o controle de origem. Mudanças de modo, seleção, validação, edição e
status curto preservam posição, dimensões, rolagem e foco dos elementos cuja função
não mudou.

**Configurações** aplica esse contrato às áreas de conta, aparência, sincronização e
preferências de autoria. Os detalhes mantêm a altura da folha e a rolagem interna;
**Voltar** ocupa o espaço reservado sem deslocar o título ou **Fechar**.

Confirmações de alterações sensíveis pertencem à superfície do produto. O diálogo
informa a ação e seu alcance, oferece cancelar e confirmar com rótulos específicos
para a consequência, mantém o foco contido e não usa a janela nativa do navegador. Uma
operação já autorizada e confirmada no cliente conversacional não abre confirmação
duplicada quando o AraLearn relê o estado remoto.

## Acessibilidade e verificação

As diretrizes de acessibilidade para conteúdo web, [WCAG 2.2](https://www.w3.org/TR/WCAG22/), são a referência técnica. A validação
abrange contraste textual e não textual, ampliação de 200%, reorganização do conteúdo,
teclado, toque, nome, papel e estado acessíveis, alternativa a gestos e preferência de
movimento reduzido.

As larguras de referência são 360, 390 e 430 px no celular e 1280 px no computador,
nos modos claro e escuro. Em cada combinação, a interface mantém a coluna
centralizada de até 430 px, uma área principal de rolagem vertical e nenhum
transbordamento horizontal da página. A verificação alcança o último conteúdo,
nomes acessíveis e áreas de toque, incluindo textos extensos e estados intermediários.

As jornadas cobrem também duas abas, perda e retorno da conexão, endereços diretos,
área segura, clique externo, Esc e retorno do foco. **Rever** é aberto e fechado
pelo teclado, com mudança perceptível no indicador. Na cópia de curso, a autorização
continua explícita e a tentativa de editar uma origem alheia não cria outro curso.

O teste ponta a ponta da Autoria fica em `tests/e2e/course-authoring-cutover.spec.js`.
A galeria dos componentes é reconstruída por `npm run resources:gallery:visual`.
Resultados e casos condicionados ficam nos checks da revisão executada. A compreensão
por pessoas leigas depende de avaliação com participantes.

A verificação de Autoria compara o estado anterior e o posterior às alterações no
planejamento, nos parâmetros, nas fontes e nas declarações de revisão. Seletores e ações conservam dimensões,
posição e foco; a assistência tem nome acessível contextual e dica de uso. Depois
da publicação, uma rodada no Chrome confere a versão efetivamente disponível.

A entrada de Estudo possui a seguinte série persistente:

| Largura | Tema claro | Tema escuro |
|---:|---|---|
| 360 px | [captura](screenshots/study/study-home-360-light.png) | [captura](screenshots/study/study-home-360-dark.png) |
| 390 px | [captura](screenshots/study/study-home-390-light.png) | [captura](screenshots/study/study-home-390-dark.png) |
| 430 px | [captura](screenshots/study/study-home-430-light.png) | [captura](screenshots/study/study-home-430-dark.png) |
| 1280 px | [captura](screenshots/study/study-home-1280-light.png) | [captura](screenshots/study/study-home-1280-dark.png) |

A captura móvel anterior continua como referência do conteúdo e dos controles dentro
de uma unidade:

![Unidade de estudo em tela móvel clara, com conteúdo central e controles
iconográficos.](screenshots/study/study-card-390-light.png)

A lista de cursos registra a superfície mínima de Autoria na mesma largura:

![Lista de cursos da Autoria em tela móvel clara, com busca, criação e três
cursos.](screenshots/authoring/authoring-courses-390-light.png)

Uma captura comprova apenas o conjunto de dados, o modo e o tamanho usados. A
aprovação visual exige também interação real, console e rede sem erros, foco, rolagem,
textos extensos e estados intermediários.

## Critério de conclusão visual

Uma mudança visual está pronta quando usa as variáveis semânticas, preserva os modos
de cor, mantém o significado pedagógico, funciona nos quatro tamanhos de referência,
sustenta toque e teclado, evita recorte e rolagem horizontal acidental e mantém uma
única responsabilidade por componente.

## Referências técnicas

- [Material Design 3: temas acessíveis](https://developer.android.com/codelabs/m3-design-theming)
- [Fluent 2: variáveis de estilo](https://fluent2.microsoft.design/design-tokens)
- [Wikimedia Codex: estrutura de variáveis](https://doc.wikimedia.org/codex/latest/design-tokens/definition-and-structure.html)
- [Wikimedia Codex: modos alternativos](https://doc.wikimedia.org/codex/latest/using-codex/adrs/08-adr-color-modes.html)
- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)

<!-- referências locais: início -->

## Referências

- [Piepenbrock et al. (2014)](referencias.md#ref-piepenbrock2014polarity): Cosima Piepenbrock; Susanne Mayr; Axel Buchner (2014). **Smaller Pupil Size and Better Proofreading Performance with Positive than with Negative Polarity Displays.** *Ergonomics*, 57(11), p. 1670–1677.
- [Xie et al. (2021)](referencias.md#ref-xie2021colormode): Xiaojiao Xie; Fanghao Song; Yan Liu; Shurui Wang; Dong Yu (2021). **Study on the Effects of Display Color Mode and Luminance Contrast on Visual Fatigue.** *IEEE Access*, 9, p. 35915–35923.

<!-- referências locais: fim -->
