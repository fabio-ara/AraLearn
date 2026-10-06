# Ferramentas de cálculo e consulta

As ferramentas oferecem apoio pontual durante uma tarefa. Seus controles
mantêm a unidade aberta e permitem voltar ao mesmo ponto do estudo.

As ferramentas pertencem ao [catálogo de componentes didáticos](componentes-didaticos.md),
conjunto de formatos que o autor pode incluir numa unidade. A calculadora
opera no dispositivo. Obras e documentos são consultados pelo mecanismo comum
de [fontes e citações](fontes-e-citacoes.md), que relaciona cada uso ao material
original.

O título e a orientação explicam por que usar a ferramenta naquela tarefa. A
abertura dá acesso ao apoio; a atividade solicita o trabalho sobre o resultado.
Um exercício pode, por exemplo, pedir que o estudante calcule uma razão e
escolha a interpretação correspondente num componente de resposta.

## Calculadora

A calculadora faz cálculos numéricos aproximados no dispositivo. É adequada
quando verificar valores ajuda a testar uma previsão, comparar casos ou
acompanhar um raciocínio. A explicação do mecanismo continua no percurso, e uma
tarefa de cálculo mental pode dispensar essa ferramenta. No catálogo, ela é
identificada por `aralearn.resource.calculator@1.0.0`.

Na tela, a calculadora apresenta um título e informa se os ângulos estão em
radianos ou graus. Pode também trazer uma orientação e uma expressão inicial.
No contrato técnico, esses dados correspondem a `title`, `angleUnit`, `prompt`
e `initialExpression`. A unidade angular pode ser alterada durante o uso. A
expressão inicial orienta uma exploração sem antecipar a resposta solicitada.

O interpretador de expressões aceita os operadores `+`, `-`, `*`, `/` e `^`, parênteses,
constantes `pi`/`π` e `e`, e as funções de um argumento `abs`, `sqrt`, `ln`,
`log`, `exp`, `sin`, `cos` e `tan`. `ln` é o logaritmo natural e `log` tem base 10.
Também aceita `−`, `×` e `÷`. O ponto (`.`) e a vírgula (`,`) são aceitos como
separadores decimais; não há separador de milhar nem funções com múltiplos
argumentos. Notação científica, como `2e3`, é permitida.

Multiplicação precisa ser explícita: escreva `2*pi`, não `2pi`. Potências
associam à direita e antecedem o sinal unário: `2^3^2` resulta em 512,
`-2^2` em −4, `(-2)^2` em 4 e `2^-2` em 0,25. Não são aceitas variáveis,
atribuições, acesso a propriedades, código, vetores, cálculo simbólico, unidades
de medida ou números complexos. As expressões são interpretadas segundo essas
regras, sem uso de `eval` ou de um construtor de funções para executar código.

A implementação usa números `Number` do JavaScript, definidos em formato
binário de dupla precisão pela
[especificação ECMAScript](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-number-type).
Esse formato representa valores numéricos com precisão finita e pode
arredondar valores decimais. Funções como logaritmos e funções trigonométricas
reutilizam as operações do ambiente, cuja especificação admite aproximações.
O último bit do resultado pode, portanto, variar entre motores de execução.
A saída exibe até 12 algarismos significativos e é identificada como aproximada.
Consulte o [contrato de `Math`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math-object).

O contrato admite até 256 caracteres, 128 elementos e 32 níveis de parênteses,
sinais ou potências. Divisão por zero, logaritmo não positivo, raiz quadrada negativa,
base negativa com expoente não inteiro e zero com expoente não positivo são
recusados. Também se recusam estouro numérico e resultados de multiplicação,
divisão, potência ou exponencial que perdem completamente seu valor por
arredondamento para zero. Ângulos têm módulo máximo de 10¹²; a tangente é
recusada quando o módulo do cosseno calculado é menor que 10⁻¹², inclusive
perto de seus polos. Esses limites delimitam uma calculadora numérica, distinta
de um sistema capaz de manipular expressões algébricas simbolicamente.

Expressão e unidade angular têm rótulos. Enter calcula, o resultado ou erro
é anunciado e o foco permanece na tarefa. Alterar expressão ou unidade angular
retira um resultado antigo; **Limpar** devolve o foco à expressão. Os cálculos
são realizados no dispositivo, preservando o texto fora dos serviços externos.

### Teclado da calculadora

O teclado visível reúne botões com nomes acessíveis e insere números,
operadores ou funções aceitos pelo interpretador. Enter calcula pelo formulário;
**Limpar** apaga a expressão e devolve o foco ao campo; apagar remove o caractere
ou a seleção atual. A entrada por teclado físico e pelos botões usa o mesmo
interpretador de expressões.

<a id="contrato-dos-recursos-de-consulta"></a>

## Contrato das ferramentas

Uma ferramenta precisa abrir e fechar sem perder o estado da unidade. Para que
o aplicativo faça isso do mesmo modo com todos os pacotes, cada ocorrência é
tratada como uma **instância** de componente no espaço de conteúdo, `content`.
Ela informa rótulo e ícone em `manifest.tool`, a descrição de seus controles.
A função `toolInteraction.bind(root, data, host)` ativa a interação e devolve o
procedimento que desfaz esses vínculos ao fechar. `host` representa os serviços
oferecidos pelo aplicativo ao componente, como abrir um arquivo autorizado. O
[contrato comum dos pacotes](componentes-didaticos.md) explica essa separação.

`calculator` usa `title`, `angleUnit`, `prompt` e `initialExpression`. O pacote
`audio` tem contrato próprio para faixas, idioma e alternativas textuais; veja
[Áudio](audio.md). Fontes e anexos seguem seus contratos de origem e acesso.

Um destino externo tem `{kind: "url", url}` com URL HTTP ou HTTPS completa,
sem credenciais embutidas. Um documento guardado no curso tem
`{kind: "source_attachment", sourceId, sourceRevision, contentHash}`. Essa
referência identifica o arquivo; seu endereço temporário no Storage é obtido
no momento da abertura. O aplicativo reutiliza `host.openExternalUrl(url)` ou
`host.openSourceAttachment({sourceId, sourceRevision, contentHash})`. Cabe ao
host obter a URL atual e verificar o acesso segundo os controles de fontes.
Os anexos aceitos utilizam o formato PDF, conforme [Fontes, citações e referências](fontes-e-citacoes.md#anexar-e-consultar-documentos).

Cada botão mostra abertura, sucesso ou falha em uma região anunciada. Durante
a tentativa, o mesmo botão fica ocupado; uma falha permite tentar novamente.
A mensagem apresenta o resultado necessário ao uso e mantém reservados os
detalhes internos, as credenciais e os endereços temporários. Ao fechar a
ferramenta, o aplicativo remove os vínculos de eventos e ignora a conclusão de
operações iniciadas naquela abertura.

Os testes locais verificam a interpretação e a precedência dos cálculos, as
operações admitidas nos números reais e os limites do contrato. Também
conferem a normalização e a apresentação segura dos destinos de fontes.
O teste isolado no navegador exercita teclado, unidades angulares, foco e
anúncios, incluindo a recuperação de falhas e o fechamento da ferramenta.
A abertura de um documento hospedado e o acesso a arquivos são examinados pelo
teste do fluxo integrado.

<a id="composição-nos-canais-humanos"></a>
<a id="composição-nos-canais-de-autoria"></a>

## Composição nos canais de autoria

`consultar_componentes` descobre os pacotes pelo mesmo catálogo utilizado no
estudo. Uma consulta focal devolve o contrato de um pacote, seu exemplo e, quando
existe, `ferramenta: {label, icon}`. `materializar_parte` e `aplicar_correcoes`
recebem as instâncias no `content` comum; assim, cada canal reutiliza o contrato
de conteúdo e a mesma rotina de gravação.

A consulta focal de uma fonte também fornece `arquivosParaConteudo`, com
referências verificadas aos documentos que podem ser escolhidos e um rótulo
para localizar cada posição. A composição usa essas referências lógicas para
identificar o arquivo existente. O vínculo bibliográfico registra outra relação:
qual passagem da obra sustenta o conteúdo ou participa da tarefa.

`guardar_audio({curso, audio})` recebe um arquivo já existente. O retorno
`context.storedAudio` contém somente nome e referência lógica verificada
(`contentHash`, `byteSize`, `mediaType`), para compor uma faixa do pacote de
[áudio](audio.md). `consultar_audios({curso, pagina?})` recupera essa biblioteca
em páginas numeradas de vinte arquivos, conservando a revisão do curso durante
a leitura. A gravação confere a versão corrente do curso e retorna um recibo;
repetições internas conservam os bytes e a identidade da tentativa. Uma
confirmação divergente orienta consultar a biblioteca antes de decidir por um
novo envio.

A forma de fornecer o arquivo depende do cliente conectado. Os guias de
[MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md) mantêm os campos,
os limites de transporte e as verificações de origem e formato. O capítulo de
[áudio](audio.md) distingue síntese de voz, arquivo existente e reprodução no
estudo. O serviço precisa receber os dados do arquivo por um desses caminhos;
um nome de arquivo ou caminho local só identifica o material no ambiente de origem.

A [prova dos canais de autoria](prova-local-canais-autoria.md) distingue testes
locais, dependências simuladas e verificação da conversa conectada. A aceitação
do contrato de uma ferramenta e o acesso efetivo ao material externo são
verificações diferentes.
