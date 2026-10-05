# Sistema visual do AraLearn

O sistema visual ajuda a pessoa a responder três perguntas durante o uso: onde
estou, o que posso fazer e o que acabou de mudar. O conteúdo didático ocupa o
primeiro plano; cor, movimento e elementos decorativos tornam perceptíveis a
estrutura, a seleção e o estado das ações.

A mesma linguagem visual atende **Estudo** e **Autoria**. Os dois espaços mantêm
a identidade do curso, mas oferecem controles diferentes porque estudar,
planejar, inspecionar e corrigir são atividades distintas. O
[roteiro de avaliação humana](roteiro-aceitacao-humana-autoria.md) organiza a
verificação desses percursos. A [matriz técnica](matriz-conformidade-tecnica.md)
relaciona cada capacidade à implementação e aos testes; a avaliação visual
examina as telas na versão e no ambiente em uso.

## Fundamentos

As regras de aparência ficam em folhas de estilo
[CSS](https://developer.mozilla.org/pt-BR/docs/Web/CSS), a linguagem que define a
apresentação dos elementos da página. Em vez de cada componente repetir cores e
espaços literais, o AraLearn usa variáveis nomeadas pela função que desempenham,
como `action-primary`, `text-secondary` e `status-danger`. O componente escolhe
a função visual; os modos claro e escuro fornecem o valor correspondente.

Essa organização permite ajustar contraste e coerência numa origem comum.
Uma mudança na cor do texto secundário, por exemplo, alcança os componentes que
usam esse papel, em vez de exigir substituições isoladas em cada tela.

Os princípios vigentes são:

1. posição, espaço, tamanho e peso constroem a hierarquia antes da cor;
2. nenhuma informação depende apenas de cor, forma ou movimento;
3. ações frequentes têm nome compreensível e área de toque adequada;
4. detalhes aparecem no contexto em que podem ser usados;
5. o modo de cor preserva conteúdo, resposta e estado do curso;
6. a largura de leitura continua contida em telas grandes;
7. representações acadêmicas preservam suas convenções;
8. uma ação local responde sem aguardar a rede quando já possui os dados
   necessários.

[Material Design](https://developer.android.com/codelabs/m3-design-theming),
[Fluent](https://fluent2.microsoft.design/design-tokens) e [Wikimedia
Codex](https://doc.wikimedia.org/codex/latest/design-tokens/definition-and-structure.html)
oferecem referências para a organização de temas e variáveis de estilo.
O AraLearn implementa sua própria composição de componentes e navegação.

## Variáveis de estilo e modos de cor

O tema centraliza os valores usados pelos componentes. As variáveis de
`public/styles-tokens.css` se distribuem em três níveis: valores básicos,
funções na interface e ajustes específicos dos componentes.

Os valores básicos definem cores, espaços, tipografia, raios de borda e
movimento. Os papéis semânticos associam esses valores a funções, como texto,
ação ou estado. Os ajustes dos componentes derivam desses papéis e conservam
sua relação com o tema.

Cores literais pertencem ao nível básico. Componentes e imagens vetoriais em
SVG usam as variáveis que descrevem a função da cor. A verificação de contraste
examina cada combinação efetivamente exibida, considerando o texto e a
superfície em que aparece.

O seletor oferece **Sistema**, **Claro** e **Escuro**. A opção **Sistema**
acompanha `prefers-color-scheme`, a preferência de cor informada pelo sistema
operacional. Uma escolha explícita prevalece e fica no dispositivo.
`data-theme-preference` conserva a preferência, e `data-color-mode` registra o
modo resultante. A troca ocorre sem recarregar o curso ou consultar a rede.

O modo escuro usa superfícies cinza-escuras e níveis de texto distintos. Preto e
branco absolutos são reservados às situações em que o contraste medido os exige.
A mesma relação semântica deve permanecer reconhecível nos dois modos.

A escolha do modo de cor depende da tarefa e das condições de uso. Numa tarefa
específica de revisão de texto, a polaridade positiva, com texto escuro sobre
fundo claro, apresentou desempenho melhor e pupilas menores
([Piepenbrock et al. (2014)](referencias.md#ref-piepenbrock2014polarity)). Em outro
experimento, realizado à noite com baixa iluminação da tela e do ambiente, o
modo escuro apresentou menores marcadores objetivos de fadiga, enquanto o claro
recebeu maior preferência subjetiva; contraste mais alto foi preferido nos dois
casos ([Xie et al. (2021)](referencias.md#ref-xie2021colormode)). Tarefa,
luminância, iluminação e medida mudam a interpretação. O produto oferece
escolha de tema, e a verificação examina contraste e legibilidade nos dois modos.

## Estrutura do produto

A entrada de **Autoria** é **Meus cursos**. A lista apresenta as informações
necessárias para reconhecer os cursos próprios e obtém o conteúdo completo
quando ele é aberto. Cursos compartilhados aparecem em **Estudo**. Ao voltar,
a pessoa retorna à lista e ao ponto de navegação anterior.

O curso organiza o conteúdo em níveis. Dentro de uma lição, uma
**microssequência didática** reúne unidades que desenvolvem um objetivo
específico. A autoria pode agrupar microssequências em **partes** para produzir
e inspecionar o material; esses conjuntos de trabalho preservam a hierarquia
curricular. O [modelo didático](modelo-didatico.md) explica essas relações.

### Autoria e edição

O curso próprio abre diretamente em **Conteúdo**. A barra mantém atalhos por
ícone para **Conteúdo** e **Planejamento**. **Parâmetros**, **Fontes**,
**Áudio**, **Revisão**, **Dados de autoria** e **Pessoas e acesso** ficam no menu
compacto. Esses nomes identificam as tarefas disponíveis no curso.

A barra superior reúne voltar, título do objeto, indicador de sincronização e
menu de tarefas. O indicador usa a mesma linguagem em **Estudo** e **Autoria**,
conserva sua geometria e comunica a mudança pelo ícone e pelo nome acessível.
Uma ação junto do conteúdo pode levar diretamente à tarefa e ao objeto
necessários, mantendo a navegação principal.

Celular e computador usam a mesma composição de até 430 px, centralizada em
telas maiores. A autoria possui uma área principal de rolagem vertical;
tabelas e comparações largas usam rolagem horizontal própria.

As ações das telas principais usam ícones com nome acessível, indicação de
estado e dica também alcançável por toque. Menus e ajustes revelados usam o
texto necessário à decisão. Edição, reordenação e exclusão aparecem ao abrir os
controles do objeto. **Planejamento** conserva o objetivo e a parte em trabalho
visíveis; detalhes de organização são abertos quando necessários, preservando
espaço para o mapa e o conteúdo.

Em **Conteúdo**, observações e mudanças de parâmetros permanecem ligadas ao
objeto inspecionado e aparecem como estado do curso. Uma aplicação de conversa
conectada por MCP ou Actions pode consultar esses registros e propor mudanças.
Esses canais permitem solicitar operações autorizadas ao AraLearn, conforme a
[documentação das integrações](assistencia-por-ia.md). A pessoa orienta a
produção, inspeciona o resultado e decide o que aplicar; a execução respeita o
alcance da autorização já dada. As alterações salvas pelo assistente podem ser
consultadas no próprio curso.

Na unidade, **Visualizar**, **Editar** e **Assistência por IA** usam o mesmo
mecanismo de apresentação e o mesmo conteúdo. A edição realça somente os textos
que o componente permite alterar. A assistência abre uma sobreposição de até
430 px e mantém a conversa em primeiro plano. A pessoa pode discutir o assunto
ou pedir **Preparar prévia** para examinar uma alteração. A configuração do
serviço e os detalhes aparecem progressivamente. **Aplicar ao rascunho** leva a
prévia à edição; **Salvar proposta** grava o resultado no curso.

A sobreposição permite escolher entre OpenAI, Gemini e DeepSeek e informar uma
chave mantida somente na memória da sessão. O capítulo de
[assistência por IA](assistencia-por-ia.md) descreve os serviços, o contexto
enviado e as condições de uso. A conversa pode continuar para reformular a
proposta antes de aceitá-la. A edição manual permanece disponível, inclusive
para código ou terminal extensos.

A edição pertence ao proprietário, inclusive em **Estudo**. Quem recebe acesso
pode estudar e registrar observações. Uma tentativa de edição por outra pessoa
informa a exigência de propriedade e mantém o curso original. Criar uma cópia é
uma tarefa explícita, sujeita a permissão própria: o resultado é outro curso,
independente, com seu novo proprietário e sem transportar concessões de acesso
ou estado pessoal.

### Atualização e preservação de rascunhos

No modo automático, o retorno de outra guia ou janela provoca a releitura dos
dados gerais do curso e da área visível. No modo manual, a sincronização do
conteúdo já aberto e do estado de estudo aguarda o acionamento da nuvem.
Verificações de acesso e gravações autorais explicitamente solicitadas continuam
ativas. O cabeçalho também oferece uma ação de atualização para quando o
navegador não comunicar a mudança de foco.

Durante a releitura, o conteúdo confirmado permanece apresentado e conserva sua
posição. O indicador comunica o andamento até a substituição dos dados
pertinentes. O painel ativo e o ponto de leitura são preservados.

Uma confirmação ou um formulário ativo adia essa releitura até que a pessoa
conclua ou cancele o rascunho. Os campos preenchidos permanecem disponíveis, e a
nuvem indica a atualização pendente. Um conflito material exige explicar a
diferença a resolver; o adiamento habitual é comunicado pelo indicador.

A mesma regra vale quando a interface precisa reconstruir uma área após
validação, atualização ou falha de rede. **Parâmetros**, **Fontes**,
**Observações**, **Conteúdo** e **Dados de autoria** conservam valores, detalhes
abertos e foco. Quando o resultado de um envio é incerto, uma nova tentativa
sem edição conserva o pedido original para conferir seu efeito. Cancelar ou
descartar encerra explicitamente esse estado transitório. A
[persistência e sincronização](persistencia-relacional.md) explica como a
recuperação distingue uma gravação confirmada de outra ainda incerta.

### Estudo e retomada

**Estudo** conserva navegação própria, com foco na unidade atual, na prática e
na retomada. **Voltar** restaura a origem real, a rolagem e o foco; **Home**
oferece a saída global. O acesso direto ao nível acima aparece como ação
contextual quando o percurso exige esse caminho.

Um curso compartilhado aparece em **Estudo**. Uma cópia independente,
explicitamente criada com a permissão correspondente, aparece em **Autoria**
para seu novo proprietário. A relação de acesso é comunicada pelo estado e
pelos controles disponíveis, mesmo quando os cartões têm aparência semelhante.

Na entrada, um seletor pesquisável, tecnicamente um *combobox*, escolhe o curso
mostrado na prévia detalhada. Objetivo e relação de acesso identificam o curso;
progresso e disponibilidade local informam as condições de retomada. **Abrir**
inicia a navegação pela lista de módulos. Uma posição salva aparece como
informação para continuar o percurso. Identificadores e versões técnicas ficam
no diagnóstico. A composição mantém uma coluna de até 430 px, inclusive numa
tela de 1280 px.

## Sequência curricular em Conteúdo

Em **Conteúdo**, a inspeção percorre uma sequência curricular com limites
explícitos. Ela reutiliza a apresentação de **Estudo**, com atividades inativas
para conferência das respostas, e mostra posição, hierarquia e limites do
recorte. A pessoa autora pode restringir a sequência por um trecho da
hierarquia, do curso à microssequência, ou por uma parte de autoria.

A [explicação](explicacao-e-revisao-humana.md), conteúdo que desenvolve o assunto
da microssequência, abre em uma sobreposição para consulta e inspeção junto de
suas fontes. Ela conserva sua própria declaração de revisão, separada das
unidades. Fechar a leitura devolve o foco à origem. A sobreposição reutiliza o
tratamento de texto, componentes e referências das unidades de estudo.

Em **Estudo**, **Fontes da unidade** abre as referências específicas do item
atual; **Explicação** apresenta o conteúdo explicativo e suas referências. Os
dois controles conservam o contexto da unidade.

A leitura abre uma unidade por vez. **Mostrar várias unidades** permite
compará-las numa sequência vertical; a seleção para observação em lote tem
controles próprios. Os dados chegam em páginas de doze unidades por padrão, e
a interface mantém no máximo trinta e seis no documento apresentado pelo
navegador. O carregamento acontece nas duas direções.

Ao atualizar uma unidade, mudar de recorte, perder a conexão ou abrir o mesmo
curso em outra aba, a interface preserva a identidade da unidade e sua distância
em relação ao topo fixo. Um endereço direto inclui a unidade inicial. O
marcador usado para buscar a página seguinte, chamado **cursor de paginação**,
organiza a consulta aos dados; a posição curricular continua sendo determinada
pela estrutura do curso.

O seletor hierárquico fecha por clique externo e pela tecla `Esc`. O retorno
restaura o ponto conhecido. Estados vazio, parcial, carregando, sem conexão e
erro ocupam o espaço do conteúdo e oferecem uma ação compatível, mantendo a
navegação global acessível.

## Revisão, Fontes e Dados de autoria

**Revisão** parte das observações abertas e da unidade em exame. Seleção em lote
aparece quando a ação exige vários alvos. Detalhes e decisões ficam próximos do
conteúdo. A pessoa inspeciona cada alvo e decide quais observações foram
atendidas, conforme o [processo de revisão](observacoes-pedagogicas.md).

**Fontes** apresenta primeiro os dados que ajudam a reconhecer o material. O
detalhe revela disponibilidade, papel e **âncoras**, localizações como páginas
ou seções da obra. O [registro de fontes](fontes-e-citacoes.md) relaciona essas
localizações às citações no curso. O envio de um documento em formato PDF
mostra progresso, recuperação de falhas e uso da cota. Ao repetir um envio, a
verificação do conteúdo permite reconhecer o arquivo já recebido. A opção de
baixar aparece quando o servidor confirma um vínculo ativo e o acesso da pessoa
ao curso.

**Dados de autoria** apresenta uma dimensão por vez, inicialmente **Novidade
declarada**. A pessoa escolhe a dimensão e o recorte, pode abrir os dados e suas
definições e chegar às unidades de uma distribuição. A comparação mantém os
dois cursos identificados. **Exportar curso e análise** abre uma confirmação do
conteúdo incluído no arquivo. A leitura conserva uma coluna principal e
identifica dados ausentes separadamente de quantidades conhecidas. A
[análise de autoria](analytics-instrucionais.md) desenvolve a interpretação
dessas informações.

## Tipografia, espaço e forma

A tipografia usa famílias do sistema para permanecer disponível sem conexão e
conservar métricas adequadas a cada plataforma. A unidade `rem` expressa um
tamanho em relação à fonte do elemento raiz da página. A prosa principal parte
de `--type-prose`, com 0,96875 rem: isso equivale a 15,5 px quando a raiz tem
16 px. A entrelinha é de 1,5.

Cartões e explicação usam o mesmo papel `--resource-text`: cinza `gray-700` no
claro e `gray-300` no escuro. O apoio usa `--resource-text-secondary`, distinto
do papel de indisponibilidade. Títulos distinguem os níveis necessários, e o
texto corrido usa alinhamento à esquerda.

A escala mantém 1 rem para alternativas e valores principais, 0,9375 rem para
código e tabelas, 0,875 rem para legendas e 0,8125 rem para metadados. Conteúdo
extenso usa o espaço de leitura e a rolagem disponíveis, conservando esses
tamanhos. Títulos de unidade preservam maiúsculas, minúsculas e símbolos do
autor, incluindo grafias como `TCP`, `pH` e `NaCl`.

Código, terminal e alternativas de código usam `--font-mono`, mantendo espaços,
linhas e literais. As notações especializadas conservam suas próprias
exigências: fontes matemáticas, transcrição pelo Alfabeto Fonético
Internacional (IPA), glosas que alinham formas e significados e anotações de
leitura *ruby*. O mesmo cuidado se aplica a caracteres chineses, japoneses e
coreanos (CJK) e à escrita da direita para a esquerda (RTL). O
[catálogo de componentes](componentes-didaticos.md) explica as representações
que usam essas convenções.

O [inventário tipográfico do
catálogo](componentes-didaticos.md#inventário-tipográfico-do-catálogo) relaciona
os 34 pacotes, os módulos que os apresentam na tela — seus *renderers* — e os
casos extremos pertinentes. Os [testes
 tipográficos](../tests/runtime/resource-typography.test.js) conferem as
variáveis de estilo, o contraste das combinações declaradas e a preservação
textual. A inspeção no navegador complementa esses testes com métricas das
fontes instaladas, reorganização do texto (*reflow*) e legibilidade na tela.
Ela inclui largura de 320 CSS px, ampliação de 200%, temas e interação.

Imagens SVG com geometria calculada mantêm a família e o tamanho usados no
cálculo. Aplicar outra métrica tipográfica depois desse cálculo pode desalinhá-las.
Fórmulas, diagramas e notações também podem exigir métricas próprias: o tamanho
óptico acompanha o texto ao redor, e a ampliação preserva em conjunto os rótulos
e a geometria.

A interface usa títulos de 16 px, com peso entre 550 e 600, controles textuais de
14 px e apoio de 13 px. Cinzas legíveis e pesos moderados organizam as tarefas;
negrito destaca rótulos que precisam de ênfase. A prosa, as fórmulas e os
elementos internos dos componentes conservam seus papéis tipográficos próprios.

### Dimensões e estabilidade

A largura e a altura dos quadros acompanham a janela e a disposição da tela.
Texto integral permanece disponível por rolagem local e teclado. A abertura de
detalhes conserva a posição dos cartões vizinhos. Nas listas de navegação, as
ações ocupam um rodapé interno estável, separado da descrição; parágrafos e
tabelas dentro do leitor recebem a altura necessária ao conteúdo.

Voltar, sincronização e menu mantêm suas posições em **Estudo** e **Autoria**,
inclusive com barras de rolagem de computador e durante a edição. Avisos novos
preservam esse alinhamento. Confirmações de sucesso são fecháveis e breves;
erros ou respostas incertas mantêm um sinal no menu. A explicação e a ação de
recuperação podem ser abertas a partir dele, conservando o rodapé acessível.

A edição aberta por **Conteúdo** mantém o cabeçalho e a navegação da autoria em
toda a hierarquia. O mecanismo de edição é compartilhado com **Estudo**, mas
essa entrada retorna à inspeção ao salvar ou cancelar, preservando posição e
foco. Voltar com um rascunho ou uma gravação incerta exige decidir se o estado
deve ser mantido ou descartado. Descartar a recuperação conserva eventuais
dados já salvos no servidor. Essa edição mantém separado o percurso pessoal de
estudo.

Nos níveis estruturais, **Cancelar** e **Salvar** ficam lado a lado no rodapé,
fora da área de rolagem, independentemente da quantidade de texto. **Meus
cursos** usa o mesmo alinhamento de voltar, nuvem e menu. Criar e atualizar ficam
no menu; falhas de leitura e criação permanecem acessíveis pelo indicador,
conservando busca e cartões em suas posições. A recuperação de uma criação
incerta mantém o pedido original até a confirmação ou o descarte explícito.

**Fontes** conserva o catálogo como área principal. A fonte selecionada abre um
painel sobreposto de altura estável, com título curto e dados completos em
detalhes revelados. Referência, arquivos, âncoras e observações mantêm seus dados
e ações; fechar retorna ao foco de origem. **Pessoas e acesso** revela as
permissões de leitura e cópia nos ajustes, mantendo ações individuais por ícone
e autorização explícita para a criação de cópias independentes.

Espaços derivam de uma escala previsível; cantos e sombras indicam agrupamento
ou sobreposição funcional. Metadados podem ser menores que a prosa, mas
continuam legíveis com ampliação de texto. Controles principais preservam área
interativa de pelo menos 44 por 44 px. Controles repetidos dentro de uma prática
podem usar 28 por 28 px quando a densidade do objeto exige.

O critério 2.5.8 das [diretrizes WCAG
2.2](https://www.w3.org/TR/WCAG22/#target-size-minimum), de nível AA, estabelece
alvos de pelo menos 24 por 24 CSS px, com exceções definidas na própria norma.
A avaliação considera também a separação entre alvos, o teclado e o foco.

## Ícones, rótulos e foco

Ícones funcionais são imagens vetoriais SVG monocromáticas numa grade comum.
O valor CSS `currentColor` faz com que herdem a cor do controle em que aparecem.
Um ícone sem texto visível recebe nome acessível. O estado combina rótulo, forma
e cor para permitir seu reconhecimento.

Nas telas principais, os controles usam ícones com nomes acessíveis. Menus e
ajustes revelados admitem rótulos. A propriedade do curso é comunicada por
iconografia e estado acessível, com cor como reforço; o título conserva o nome
do curso, sem acrescentar sufixos como `· Seu Curso`.

Rótulos descrevem a tarefa. Identificadores de pacote e versões técnicas
pertencem às consultas especializadas e ao diagnóstico. Um formato como JSON
aparece quando ajuda a reconhecer o arquivo exportado. A interface comum usa
palavras do trabalho, como curso, unidade de estudo e fonte. O
[vocabulário controlado](vocabulario-controlado.md) reúne os nomes canônicos.

Contorno, cursor, foco e aparência correspondem à ação disponível. O foco
visível identifica o controle ativo. A aparência de botão fica restrita aos
elementos acionáveis; a indicação de edição identifica os campos que podem ser
alterados, em vez de abranger indistintamente a unidade.

## Componentes didáticos e representações

Cada [pacote de componente](componentes-didaticos.md) implementa uma
representação ou forma de resposta e usa variáveis `resource-*` para seus
papéis visuais. Gráficos usam também `data-series-*` para distinguir séries de
dados nos modos claro e escuro.

SVGs usam classes, variáveis e `currentColor` quando isso preserva a semântica.
Séries se distinguem também por rótulo, forma, traço ou padrão. Eixos, unidades e
legendas permanecem explícitos. Código, lacunas, respostas e foco oferecem
indicações além da cor.

[Vega](https://vega.github.io/vega/) desenha gráficos a partir de dados;
[Graphviz](https://graphviz.org/documentation/) calcula posições e conexões de
diagramas; [MathML](https://developer.mozilla.org/pt-BR/docs/Web/MathML)
representa notação matemática no navegador. Esses recursos seguem os mesmos
papéis visuais quando suas convenções permitem. A avaliação confere tanto a
legibilidade quanto a pertinência didática, incluindo a escala de um gráfico e
as relações representadas num diagrama.

Diagramas extensos conservam tamanho legível numa área própria. Toque e arrasto
dentro dela movem a representação; a pinça altera a ampliação; gestos fora dela
navegam na unidade. O teclado alcança a área e seus controles. A tela cheia
mantém ações de reduzir, ampliar e retornar, preservando a função de consulta.

O grafo matemático compartilha os controles de enquadramento, ampliação e
retorno dos diagramas. Nos mapas de memória em telas estreitas, os endereços
inicial e final delimitam a descrição em linhas próprias, preservando a largura
de leitura e a ordem dos segmentos.

## Prática, retorno e movimento

Seleção, resposta correta, resposta incorreta, foco e indisponibilidade são
comunicados por texto, forma e cor. A resposta esperada aparece depois de uma
ação explícita. A pessoa pode tentar novamente e consultar o retorno para
compreender a solução. O estado pessoal registra o avanço e as marcas de
retomada.

O controle principal confere a tentativa. Se houver erro, **Tentar de novo** e
**Ver resposta** permitem continuar o trabalho. Depois do acerto ou da consulta
à resposta, **Continuar** apresenta o retorno adicional preparado pela autoria,
quando existente; o acionamento seguinte avança para a próxima unidade. O
[guia do estudante](guia-estudante.md#responder-a-uma-prática) acompanha esse ciclo.

O aplicativo guarda a conclusão no dispositivo antes de avançar. Se essa
gravação local falhar, informa o problema e permite tentar novamente. O envio
ao servidor segue pela fila de sincronização e pode acontecer depois, inclusive
após o retorno da conexão.

A unidade usa a altura útil disponível e mantém a rolagem vertical dentro do
cartão. Conteúdo curto e longo conservam a mesma moldura e a área inferior de
ações; o interior rola quando necessário. Numa lacuna preenchível, a orientação
de preenchimento pertence à lacuna ativa. Limpar uma resposta preserva os
valores das lacunas vizinhas.

O movimento conserva continuidade espacial ou explica uma mudança de estado.
A preferência `prefers-reduced-motion`, configurada no sistema para reduzir
animações, encurta transições e elimina movimento decorativo contínuo. Navegar,
voltar, confirmar e cancelar respondem independentemente da duração da animação.

## Área segura, sobreposições e mensagens

A **área segura** é o espaço que permite apresentar conteúdo e controles sem
sobreposição com recortes da tela ou elementos do sistema do dispositivo.
A interface a respeita nas quatro bordas. Cabeçalhos reservam altura estável,
e ações globais mantêm o mesmo alinhamento entre telas. O espaço da barra de
rolagem é reservado para conservar a posição dos controles.

Menus, seletores e diálogos fecham por ação explícita, clique externo e `Esc`
quando a operação permite. Sobreposições mantêm o foco em seu interior e o
devolvem ao controle de origem ao fechar. Mensagens transitórias conservam
acessíveis o controle de avanço e as ações de retomada.

Painéis sobrepostos e diálogos mantêm dimensões externas estáveis. Quando o
conteúdo varia ou cresce, ele rola internamente, preservando barra superior,
área inferior de ações e controle de origem. Mudanças de modo, seleção,
validação, edição e estado mantêm posição, dimensões, rolagem e foco dos
elementos cuja função permanece igual.

**Configurações** aplica essa regra às áreas de conta, aparência, sincronização
e preferências de autoria. Os detalhes conservam a altura do painel e a
rolagem interna; **Voltar** ocupa o espaço reservado, mantendo o alinhamento de
título e **Fechar**.

Confirmações de alterações sensíveis pertencem à interface do produto. O diálogo
informa a ação e seu alcance, oferece cancelar e confirmar com rótulos próprios
para a consequência e mantém o foco contido. Essa apresentação substitui a
janela nativa do navegador. Quando uma operação já foi autorizada e confirmada
na aplicação de conversa, a releitura no AraLearn apresenta seu resultado, sem
solicitar novamente a mesma decisão.

## Acessibilidade e verificação

As diretrizes de acessibilidade para conteúdo web,
[WCAG 2.2](https://www.w3.org/TR/WCAG22/), são a referência técnica. A
recomendação consultada para a implementação é a de 12 de dezembro de 2024;
a bibliografia também conserva a edição de 2023 originalmente citada. O
roteiro abrange contraste textual e não textual, ampliação de 200%,
reorganização do conteúdo, teclado e toque. Também confere nome, papel e estado
acessíveis, alternativas a gestos e preferência de movimento reduzido.

As larguras de referência são 360, 390 e 430 px no celular e 1280 px no
computador, nos modos claro e escuro. Em cada combinação, confira a coluna
centralizada de até 430 px e o acesso ao último conteúdo. Na autoria, a rolagem
vertical fica na área principal. No estudo, a leitura rola no interior da
unidade e mantém seus controles disponíveis. Tabelas e diagramas podem usar
rolagem ou enquadramento próprios.

A avaliação procura conteúdo recortado, controles inacessíveis e deslocamentos
inesperados, incluindo textos extensos e estados intermediários. Os percursos
cobrem duas abas, perda e retorno da conexão, endereços diretos, área segura,
clique externo, `Esc` e retorno do foco. **Rever** é aberto e fechado pelo
teclado, com mudança perceptível no indicador. Na cópia de curso, a autorização
continua explícita; tentar editar o original de outra pessoa mantém separado o
procedimento de criar uma cópia.

O teste que acompanha o percurso completo da autoria fica em
`tests/e2e/course-authoring-cutover.spec.js`. A galeria dos componentes é
reconstruída por `npm run resources:gallery:visual`. Resultados e casos
condicionados ficam nas verificações da revisão executada. A compreensão por
pessoas leigas é examinada em avaliação com participantes.

A verificação de autoria compara os estados anterior e posterior às alterações
no planejamento, nos parâmetros, nas fontes e nas declarações de revisão.
Seletores e ações conservam dimensões, posição e foco; a assistência tem nome
acessível contextual e dica de uso. Depois da publicação, uma rodada no Chrome
confere a versão efetivamente disponível.

As capturas versionadas abaixo documentam composições anteriores da entrada de
**Estudo**. Servem à comparação histórica; a verificação da versão corrente
produz novas evidências nas mesmas condições:

| Largura | Tema claro | Tema escuro |
|---:|---|---|
| 360 px | [captura](screenshots/study/study-home-360-light.png) | [captura](screenshots/study/study-home-360-dark.png) |
| 390 px | [captura](screenshots/study/study-home-390-light.png) | [captura](screenshots/study/study-home-390-dark.png) |
| 430 px | [captura](screenshots/study/study-home-430-light.png) | [captura](screenshots/study/study-home-430-dark.png) |
| 1280 px | [captura](screenshots/study/study-home-1280-light.png) | [captura](screenshots/study/study-home-1280-dark.png) |

A captura móvel anterior conserva a referência do conteúdo e dos controles
dentro de uma unidade:

![Unidade de estudo em tela móvel clara, com conteúdo central e controles
iconográficos.](screenshots/study/study-card-390-light.png)

A lista de cursos registra a composição de **Autoria** na mesma largura:

![Lista de cursos da Autoria em tela móvel clara, com busca, criação e três
cursos.](screenshots/authoring/authoring-courses-390-light.png)

Cada captura registra o conjunto de dados, o modo e o tamanho usados naquele
momento. A avaliação visual reúne essas imagens e a interação exercitada, com
atenção a foco, rolagem, textos extensos e estados intermediários. Os registros
técnicos de console e rede ajudam a investigar falhas. A decisão humana fica
associada à versão e ao alcance efetivamente examinados.

## Critério de conclusão visual

A conclusão exige verificar a mesma versão nos quatro tamanhos de referência,
com toque e teclado. Os componentes devem usar as variáveis semânticas e
preservar os modos de cor e o significado pedagógico. A leitura e os controles
precisam permanecer acessíveis, incluindo o conteúdo extenso, sem recorte ou
rolagem horizontal acidental. Cada componente conserva uma responsabilidade
própria na apresentação e na interação.

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
