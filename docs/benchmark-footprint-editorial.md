# Benchmark de extensão e ocupação visual

Uma tabela e um parágrafo podem conter a mesma quantidade de palavras e ocupar
espaços diferentes na tela. Este ensaio compara medidas de extensão do conteúdo
com o espaço efetivamente ocupado no leitor móvel. O termo *benchmark* designa
a comparação com um conjunto fixo de casos; *footprint* é a ocupação visual.
O problema investigado é quanto cada medida descreve essa ocupação, e não a
qualidade pedagógica da unidade.

## Corpus e ambiente

O corpus fixo contém 13 unidades válidas:

- texto curto, médio e um extremo deliberado;
- código curto e longo;
- tabela compacta e densa;
- gráfico estatístico e diagrama de grafo;
- múltipla escolha com duas e oito alternativas;
- parágrafo com escolha e tabela com prática de ordenação.

Os casos ficam em `tests/fixtures/editorial-footprint.v1.json`. A página de teste `tests/gallery/editorial-footprint.html` usa o mesmo mecanismo de apresentação dos componentes e as dimensões do cartão de estudo. Depois que os componentes terminam de carregar, o Playwright, ferramenta de automação do navegador, mede a página em 390 × 844 e 430 × 932, nos temas claro e escuro. A matriz é finita: 13 casos × 2 tamanhos de tela × 2 temas, totalizando 52 observações.

A medida real soma a altura usada pelo conteúdo apresentado e pela área de resposta, quando presente. A fração da área visível, ou *viewport*, divide essa ocupação pelo espaço disponível dentro do cartão. A rolagem horizontal local de uma representação larga é registrada separadamente; conteúdo que ultrapassa a largura da página, erro de execução ou caso inválido interrompe o ensaio.

## Medidas comparadas

O ensaio registra quatro perspectivas:

1. palavras e caracteres do texto acessível;
2. equivalente ponderado experimental, que acrescenta pesos por pacote de componente e por itens estruturais, como linhas de código, células, pontos, vértices, arestas e alternativas;
3. footprint abstrato em linhas, combinando quebra de texto estimada e custo estrutural;
4. pixels e fração de viewport medidos na apresentação real após o carregamento dos componentes.

Os coeficientes experimentais estão versionados em `scripts/editorialFootprintMetrics.mjs` para tornar a comparação auditável. Eles não são exportados para o aplicativo em execução, não são persistidos com o curso e não representam um limiar recomendado.

Execute:

```sh
npm run audit:editorial-footprint
```

O relatório detalhado é gravado em `test-results/editorial-footprint/measurement.json`. A validade, a cobertura e o determinismo das métricas puras podem ser conferidos com:

```sh
node --test tests/runtime/editorial-footprint-benchmark.test.js
```

## Resultado histórico do ensaio finito

O registro da execução de referência informa que a correlação de postos com os pixels realmente ocupados foi 0,654 para palavras, 0,719 para caracteres, 0,793 para o equivalente ponderado e 0,896 para a estimativa abstrata em linhas. A correlação de postos compara a ordenação dos casos por cada medida: valores mais próximos de 1 indicam maior correspondência entre as ordens. A geometria não variou entre os temas. O texto extremo ocupou em média 2,739 viewports internas; os demais casos ficaram abaixo de uma viewport, com os maiores entre eles sendo a escolha de oito alternativas, o código longo e a prática de ordenação.

Esses valores constituem o resultado histórico registrado no capítulo; o
relatório bruto daquela execução não está preservado no repositório. Para
usá-los numa análise reproduzível da versão atual, é necessário executar o
ensaio e conservar seu relatório junto da versão do código e do ambiente.

No conjunto descrito, considerar a estrutura aproximou melhor a ordenação dos
casos daquela obtida pela medição real. Essa comparação sugere uma possibilidade
de estimativa; não estabelece uma fronteira entre unidade adequada e inadequada
nem demonstra que os pesos se generalizam para outros cursos.

## Critério de encerramento

O ensaio encerra quando todos os casos passam no catálogo, as 52 observações terminam sem erro material, cada família tem métricas lexicais, estruturais, estimadas e reais, e a ordenação permite distinguir o extremo conhecido dos casos pequenos e moderados. Satisfeitas essas condições, os pesos não são ajustados para maximizar a correlação no mesmo corpus.

## Possível uso futuro da medida

Uma medida de ocupação poderia ajudar a pessoa autora a localizar unidades
muito extensas e examinar sua organização. Para ser útil, precisaria considerar
a composição: uma figura larga, uma lista de alternativas e uma explicação em
prosa ocupam a tela de maneiras diferentes. Uma estimativa equivalente a áreas
de leitura móveis é uma candidata a investigar, tendo a medição real como
referência de calibração.

Uma hipótese é oferecer uma faixa de extensão preferida e alertar sobre
ultrapassagens, mantendo a decisão com a autoria. O aviso poderia sugerir
examinar a distribuição do conteúdo; a unidade continuaria disponível para
salvar, publicar e estudar. A faixa não seria uma nota de qualidade nem uma
regra para truncar explicações.

A proposta técnica recebeu o nome `EditorialPolicy`. Nela, `target` seria o
alvo, `preferredRange` a faixa preferida e `softMaximum` um máximo orientador.
A origem `automatic` usaria um padrão do produto; `explicit` registraria a
escolha informada no ponto de aplicação. O alcance e a combinação entre níveis
do curso ainda dependeriam de uma necessidade definida.

Esse contrato é uma hipótese, separada dos
[parâmetros de autoria existentes](desenho-instrucional-parametrizado.md).
O produto não implementa sua faixa, alerta ou pontuação. O corpus atual também
não fundamenta os valores de um padrão: investigar a estimativa em outros
conteúdos e examinar a compreensão do aviso pela autoria precede uma decisão
de implementação.
