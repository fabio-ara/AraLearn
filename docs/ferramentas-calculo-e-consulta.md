# Ferramentas de cálculo e consulta

Calculadora, gramática, dicionário e leitura complementar são pacotes do mesmo
catálogo dos componentes didáticos. Ocupam `content`, declaram
`manifest.tool = {label, icon}` e oferecem interação pelo contrato comum
`toolInteraction.bind(root, data, host)`. Não há um segundo sistema de plugins.
Os controles compactos do estudo abrem a ferramenta sem substituir a unidade;
o fechamento e a retomada da leitura pertencem à superfície de estudo.

O título e a orientação devem explicar por que usar a ferramenta naquela
tarefa. Abrir uma calculadora ou um recurso externo não registra uma resposta
correta, uma conclusão nem uma verificação factual. As ferramentas não oferecem
alvos de lacuna automáticos: um rótulo de consulta não deve virar exercício
por acidente.

## Calculadora

`aralearn.resource.calculator@1.0.0` oferece cálculo numérico real aproximado.
É adequada quando verificar valores ajuda a testar uma previsão, comparar
casos ou acompanhar um raciocínio. Não substitui a explicação do mecanismo,
nem deve ser oferecida numa tarefa que exige cálculo mental sem apoio.

Os dados são `title`, `angleUnit` (`radians` ou `degrees`) e, opcionalmente,
`prompt` e `initialExpression`. O ângulo fica visível e pode ser alterado durante
o uso. A expressão inicial pode orientar uma exploração, mas não deve revelar
a resposta que o estudante precisa produzir.

O parser aceita os operadores `+`, `-`, `*`, `/` e `^`, parênteses, constantes
`pi`/`π` e `e`, e as funções unárias `abs`, `sqrt`, `ln`, `log`, `exp`, `sin`,
`cos` e `tan`. `ln` é o logaritmo natural e `log` tem base 10. Também aceita
`−`, `×` e `÷`. Ponto e vírgula são separadores decimais; não há separador de
milhar nem funções com múltiplos argumentos. Notação científica, como `2e3`,
é permitida.

Multiplicação precisa ser explícita: escreva `2*pi`, não `2pi`. Potências
associam à direita e antecedem o sinal unário: `2^3^2` resulta em 512,
`-2^2` em −4, `(-2)^2` em 4 e `2^-2` em 0,25. Não são aceitos variáveis,
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
perto de seus polos. Esses são limites operacionais explícitos, não um sistema
de álgebra computacional.

Expressão e unidade angular têm rótulos. Enter calcula, o resultado ou erro
é anunciado e o foco permanece na tarefa. Alterar expressão ou unidade angular
retira um resultado antigo; Limpar devolve o foco à expressão. Nenhum cálculo
envia texto a um serviço externo.

## Gramática

`aralearn.resource.grammar@1.0.0` abre explicações escolhidas sobre construções,
formas e usos. Serve para comparar uma regra com os exemplos estudados ou
retomar uma distinção necessária à análise. Cada item deve indicar o que
examinar e como voltar à tarefa. Não faz análise sintática, correção automática
nem tradução da produção do estudante.

Use vários itens quando uma comparação pedir explicações diferentes. Identifique
o idioma quando pertinente. Um artigo recomendado como leitura gramatical é
apoio instrucional; se também sustenta um enunciado, o vínculo de evidência é
registrado separadamente em fontes.

## Dicionário

`aralearn.resource.dictionary@1.0.0` abre as obras de consulta selecionadas pela
autoria. Um link pode levar a um verbete ou à página de consulta; múltiplos
dicionários ocupam itens distintos, com rótulos que deixem claro idioma e
finalidade. O pacote não depende de fornecedor, não escolhe o sentido correto
e não envia a frase da unidade automaticamente.

A orientação deve pedir interpretação contextual, quando necessária: localizar
uma palavra não basta para escolher sua acepção. Evite oferecer consulta quando
a recuperação sem apoio constitui a tarefa avaliada.

## Leitura complementar

`aralearn.resource.reading@1.0.0` oferece textos para ampliar, contrastar ou
aplicar o conteúdo. A descrição de cada item deve dizer o que procurar e qual
comparação ou decisão fazer ao retornar. O material essencial continua explicado
no percurso; um link sem orientação não substitui o conteúdo da unidade.

O pacote não resume nem verifica o texto externo. Leitura instrucional e
evidência são papéis distintos, ainda que compartilhem documento ou URL.

## Contrato dos recursos de consulta

Os três pacotes de consulta compartilham os mesmos dados: `title`, `items` e
`prompt` opcional. Há de um a 32 itens por instância; cada item tem `id`,
`label`, `target` e, opcionalmente, `description` e `languageTag`. Rótulos usam
direção automática, preservando escrita CJK, IPA e RTL; o idioma informado
acompanha o controle.

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
mensagem. O cleanup remove listeners e ignora a conclusão de operações de uma
superfície já fechada.

As provas locais exercitam parser, precedência, limites, domínio real,
normalização pelo registro, escaping e destinos. A prova isolada em navegador
exercita teclado, ângulos, pluralidade, falha/retry e cleanup, com abertura pelo
host simulado. Isso não equivale a uma abertura hospedada de PDF nem à
verificação de serviços externos; o fluxo integrado conserva essa distinção.

## Composição nos canais humanos

`consultar_componentes` descobre os pacotes pelo mesmo catálogo utilizado no
Estudo. Uma consulta focal devolve o contrato de um pacote, seu exemplo e, quando
existe, `ferramenta: {label, icon}`. `materializar_parte` e `aplicar_correcoes`
recebem as instâncias no `content` comum; não há enum de ferramentas em cada
canal nem escritor por pacote. A consulta focal de uma fonte também fornece
`arquivosParaConteudo`, com alvos lógicos de PDF e rótulos por posição. Esses
alvos permitem compor leituras auxiliares sem inventar identidades, transformar
o arquivo em evidência ou persistir URLs de Storage.

`guardar_audio({curso, audio})` recebe um arquivo já existente. O retorno
`context.storedAudio` contém somente nome e referência lógica verificada
(`contentHash`, `byteSize`, `mediaType`), para compor uma faixa do pacote de
[áudio](audio.md). `consultar_audios({curso, pagina?})` recupera essa biblioteca
por páginas humanas de vinte arquivos, conservando a revisão do curso durante
a leitura. A gravação usa CAS e recibo; repetições internas conservam bytes e
identidade da tentativa. Uma confirmação divergente orienta consultar a
biblioteca antes de decidir por nova ingestão.

As Actions usam `openaiFileIdRefs`: o schema publicado declara uma lista de
strings e o ChatGPT envia objetos com `id`, `name`, `mime_type` e
`download_link`. Esse comportamento e a validade temporária da URL estão na
[documentação oficial de arquivos nas Actions](https://developers.openai.com/api/docs/actions/sending-files).
Para MCP, `_meta["openai/fileParams"]` declara o campo `audio`; o cliente
compatível fornece `{download_url, file_id, mime_type?, file_name?}`. A
[referência oficial do descritor de arquivos](https://developers.openai.com/plugins/reference)
exige declarar as quatro propriedades e requer somente as duas primeiras.
Um caminho local, uma URI de artefato ou um identificador isolado não são
convertidos em acesso a um arquivo. A capacidade depende do cliente.

PDF e áudio compartilham somente o download limitado: HTTPS, origens de
arquivos OpenAI já autorizadas, sem redirecionamentos, credenciais do servidor
ou cookies, com prazo e limite de 20 MiB. Cada consumidor mantém seu próprio
MIME. Áudio exige WAV PCM inteiro ou quadros MP3 completos; declarar um tipo ou
renomear a extensão não basta. Não se sintetiza, transcreve nem interpreta o
arquivo nessa tarefa, e nenhuma credencial de provedor de voz é recebida.

Os testes de canais usam handlers HTTP reais com OAuth, transporte de arquivo
e persistência simulados. Exercitam descoberta, bytes sintéticos válidos,
falhas, CAS, repetição, paginação e projeção segura. Isso prova o contrato local;
a conversa conectada e a Action hospedada precisam de sua própria verificação.
