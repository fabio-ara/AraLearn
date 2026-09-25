# Ferramentas de cálculo e consulta

As ferramentas oferecem apoio pontual durante uma tarefa. Seus controles
mantêm a unidade aberta e permitem voltar ao mesmo ponto do estudo.

As ferramentas pertencem ao [catálogo de componentes didáticos](componentes-didaticos.md),
conjunto de formatos que o autor pode incluir numa unidade. A calculadora
opera no dispositivo. Fontes, documentos e referências são consultados pelo
mecanismo comum de fontes; não há packages separados de consulta neste
catálogo corrente.

O título e a orientação explicam por que usar a ferramenta naquela tarefa. A
abertura registra apenas a consulta; respostas e conclusões pertencem à
atividade que solicita que o estudante faça algo com o resultado. Por isso, um
exercício usa um componente de resposta próprio em vez de transformar
automaticamente o rótulo da ferramenta em lacuna.

## Calculadora

`aralearn.resource.calculator@1.0.0` faz cálculos numéricos aproximados no
dispositivo. É adequada quando verificar valores ajuda a testar uma previsão,
comparar casos ou acompanhar um raciocínio. A explicação do mecanismo continua
no percurso, e uma tarefa de cálculo mental pode deixar essa ferramenta de fora.

Na tela, a calculadora apresenta um título e informa se os ângulos estão em
radianos ou graus. Pode também trazer uma orientação e uma expressão inicial.
No contrato técnico, esses dados correspondem a `title`, `angleUnit`, `prompt`
e `initialExpression`. A unidade angular pode ser alterada durante o uso. A
expressão inicial orienta uma exploração sem antecipar a resposta solicitada.

O interpretador de expressões aceita os operadores `+`, `-`, `*`, `/` e `^`, parênteses, constantes
`pi`/`π` e `e`, e as funções unárias `abs`, `sqrt`, `ln`, `log`, `exp`, `sin`,
`cos` e `tan`. `ln` é o logaritmo natural e `log` tem base 10. Também aceita
`−`, `×` e `÷`. O ponto (`.`) e a vírgula (`,`) são aceitos como separadores decimais; não há separador de
milhar nem funções com múltiplos argumentos. Notação científica, como `2e3`,
é permitida.

Multiplicação precisa ser explícita: escreva `2*pi`, não `2pi`. Potências
associam à direita e antecedem o sinal unário: `2^3^2` resulta em 512,
`-2^2` em −4, `(-2)^2` em 4 e `2^-2` em 0,25. Não são aceitas variáveis,
atribuições, acesso a propriedades, código, vetores, cálculo simbólico, unidades
de medida ou números complexos. Nenhuma expressão passa por `eval` ou por um
construtor de funções.

A implementação usa números `Number` do JavaScript, definidos em formato
binário de dupla precisão pela
[especificação ECMAScript](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-number-type).
As funções transcendentes reutilizam as operações numéricas do ambiente,
cuja especificação prevê aproximações; não se promete aritmética decimal exata
nem identidade do último bit entre motores. A saída exibe até 12 algarismos
significativos e é identificada como aproximada. Consulte o
[contrato de `Math`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math-object).

Há até 256 caracteres, 128 elementos e 32 níveis de parênteses, sinais ou
potências. Divisão por zero, logaritmo não positivo, raiz quadrada negativa,
base negativa com expoente não inteiro e zero com expoente não positivo são
recusados. Também se recusam estouro numérico e resultados de multiplicação,
divisão, potência ou exponencial que perdem completamente seu valor por
arredondamento para zero. Ângulos têm módulo máximo de 10¹²; a tangente é
recusada quando o módulo do cosseno calculado é menor que 10⁻¹², inclusive
perto de seus polos. Esses limites delimitam uma calculadora numérica, distinta
de um sistema capaz de manipular expressões algébricas simbolicamente.

Expressão e unidade angular têm rótulos. Enter calcula, o resultado ou erro
é anunciado e o foco permanece na tarefa. Alterar expressão ou unidade angular
retira um resultado antigo; **Limpar** devolve o foco à expressão. Nenhum cálculo
envia texto a um serviço externo.

### Teclado da calculadora

O teclado visível é composto por botões acessíveis e insere somente tokens da
gramática permitida. Enter calcula pelo formulário; **Limpar** apaga a expressão
e devolve o foco ao campo; apagar remove o caractere ou a seleção atual. A
entrada por teclado físico e pelo teclado visível preserva o mesmo parser.

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

`calculator` usa `title`, `angleUnit`, `prompt` e `initialExpression`. O package
`audio` tem contrato próprio para faixas, idioma e alternativas textuais; veja
[Áudio](audio.md). Fontes e anexos seguem seus contratos de origem e acesso.

Um destino externo tem `{kind: "url", url}` com URL HTTP ou HTTPS completa,
sem credenciais embutidas. Um PDF guardado no curso tem
`{kind: "source_attachment", sourceId, sourceRevision, contentHash}`. Não se
persiste sua URL temporária de Storage. A abertura reutiliza
`host.openExternalUrl(url)` ou
`host.openSourceAttachment({sourceId, sourceRevision, contentHash})`; cabe ao
host obter a URL atual e verificar acesso segundo os controles de fontes.

Cada botão mostra abertura, sucesso ou falha em uma região anunciada. Durante
a tentativa, o mesmo botão fica ocupado; uma falha permite tentar novamente.
Mensagens internas, credenciais e URLs temporárias não são reproduzidas na
mensagem. Ao fechar a ferramenta, o aplicativo remove os vínculos de eventos e ignora
a conclusão de operações iniciadas naquela abertura.

As provas locais verificam a interpretação e a precedência dos cálculos, o
domínio real e os limites do contrato, além da normalização e apresentação
segura dos destinos de fontes. A prova isolada no navegador exercita teclado,
unidades angulares, foco, anúncio e o ciclo de abrir, falhar, tentar novamente
e fechar. A abertura hospedada de um PDF e o acesso a arquivos pertencem ao
teste do fluxo integrado.

<a id="composição-nos-canais-humanos"></a>
<a id="composição-nos-canais-de-autoria"></a>

## Composição nos canais de autoria

`consultar_componentes` descobre os pacotes pelo mesmo catálogo utilizado no
estudo. Uma consulta focal devolve o contrato de um pacote, seu exemplo e, quando
existe, `ferramenta: {label, icon}`. `materializar_parte` e `aplicar_correcoes`
recebem as instâncias no `content` comum; assim, cada canal reutiliza o contrato
de conteúdo e a mesma rotina de gravação. A consulta focal de uma fonte também
fornece `arquivosParaConteudo`, com referências verificadas aos PDFs que podem
ser escolhidos e um rótulo para localizar cada posição. A composição usa essas
referências lógicas em vez de criar outra
identidade para o arquivo ou guardar seu endereço temporário de Storage. O
vínculo como evidência continua sendo uma decisão separada.

`guardar_audio({curso, audio})` recebe um arquivo já existente. O retorno
`context.storedAudio` contém somente nome e referência lógica verificada
(`contentHash`, `byteSize`, `mediaType`), para compor uma faixa do pacote de
[áudio](audio.md). `consultar_audios({curso, pagina?})` recupera essa biblioteca
por páginas humanas de vinte arquivos, conservando a revisão do curso durante
a leitura. A gravação confere a versão corrente do curso e retorna um recibo; repetições internas conservam bytes e
identidade da tentativa. Uma confirmação divergente orienta consultar a
biblioteca antes de decidir por nova ingestão.

A forma de fornecer o arquivo depende do cliente conectado. Os guias de
[MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md) mantêm os campos,
os limites de transporte e as verificações de origem e formato. O capítulo de
[áudio](audio.md) distingue síntese de voz, arquivo existente e reprodução no
estudo. Um caminho local ou um identificador de arquivo, isoladamente, não dá
ao serviço acesso ao conteúdo.

A [prova dos canais de autoria](prova-local-canais-autoria.md) distingue testes
locais, dependências simuladas e verificação da conversa conectada. A aceitação
do contrato de uma ferramenta e o acesso efetivo ao material externo são
verificações diferentes.
