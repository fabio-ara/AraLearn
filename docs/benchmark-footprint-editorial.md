# Benchmark de footprint editorial

Este benchmark compara sinais simples de extensão de uma Unidade de estudo com o espaço que ela ocupa no leitor móvel. Ele é um instrumento diagnóstico reproduzível. Não define qualidade pedagógica, nota, limite de autoria nem política executada pelo produto.

## Corpus e ambiente

O corpus fixo contém 13 Unidades válidas:

- texto curto, médio e um extremo deliberado;
- código curto e longo;
- tabela compacta e densa;
- gráfico estatístico e diagrama de grafo;
- múltipla escolha com duas e oito alternativas;
- parágrafo com escolha e tabela com prática de ordenação.

Os casos ficam em `tests/fixtures/editorial-footprint.v1.json`. O harness `tests/gallery/editorial-footprint.html` usa o mesmo renderer de packages e a geometria do card do Estudo. Depois da hidratação, ele é medido pelo Playwright em 390 × 844 e 430 × 932, nos temas claro e escuro. A matriz é finita: 13 casos × 2 viewports × 2 temas, totalizando 52 observações.

A medida real soma a altura usada pelo conteúdo renderizado e pelo dock de resposta, quando presente. A fração de viewport divide essa ocupação pelo espaço disponível dentro do card. Scroll horizontal local de uma representação larga é registrado separadamente; overflow do documento, erro de página ou caso inválido interrompe a execução.

## Medidas comparadas

O ensaio registra quatro perspectivas:

1. palavras e caracteres do texto acessível;
2. equivalente ponderado experimental, que acrescenta pesos por package e por itens estruturais, como linhas de código, células, pontos, vértices, arestas e alternativas;
3. footprint abstrato em linhas, combinando quebra de texto estimada e custo estrutural;
4. pixels e fração de viewport medidos no renderer após hidratação.

Os coeficientes experimentais estão versionados em `scripts/editorialFootprintMetrics.mjs` para tornar a comparação auditável. Eles não são exportados para o runtime, não são persistidos com o Curso e não representam um limiar recomendado.

Execute:

```sh
npm run audit:editorial-footprint
```

O relatório detalhado é gravado em `test-results/editorial-footprint/measurement.json`. A validade, a cobertura e o determinismo das métricas puras podem ser conferidos com:

```sh
node --test tests/runtime/editorial-footprint-benchmark.test.js
```

## Resultado do ensaio finito

Na execução de referência, a correlação de postos com os pixels realmente ocupados foi 0,654 para palavras, 0,719 para caracteres, 0,793 para o equivalente ponderado e 0,896 para o footprint abstrato. A geometria não variou entre os temas. O texto extremo ocupou em média 2,739 viewports internas; os demais casos ficaram abaixo de uma viewport, com os maiores entre eles sendo a escolha de oito alternativas, o código longo e a prática de ordenação.

O contraste responde à pergunta do ensaio: palavras ou caracteres isolados perdem diferenças importantes entre tipos. A estrutura melhora a ordenação, e a medição real continua sendo a evidência mais direta quando o renderer está disponível. O resultado não calibra uma fronteira científica entre Unidade adequada e inadequada, nem demonstra que os pesos se generalizam para Cursos não presentes no corpus.

## Critério de encerramento

O ensaio encerra quando todos os casos passam no catálogo, as 52 observações terminam sem erro material, cada família tem métricas lexicais, estruturais, estimadas e reais, e a ordenação permite distinguir o extremo conhecido dos casos pequenos e moderados. Satisfeitas essas condições, os pesos não são ajustados para maximizar a correlação no mesmo corpus.

## Decisão de contrato para uso futuro

Se uma necessidade real justificar uma `EditorialPolicy`, o primeiro contrato deve ser pequeno e _soft_: uma origem `automatic` usa o padrão corrente do produto; uma origem `explicit` fornece, no ponto de vinculação, `target`, `preferredRange` e `softMaximum` na mesma unidade de footprint. Não há escopos genéricos nem herança até existir um caso concreto que os exija.

Esses valores descrevem orientação, não validação. Uma Unidade dentro da faixa preferida não recebe aviso; uma ultrapassagem moderada continua permitida; somente uma ultrapassagem grande do máximo suave pode gerar alerta explicável e sugestão de decomposição. Salvar, publicar e estudar permanecem possíveis, e nenhum conteúdo é truncado.

O candidato mais útil para essa unidade é um equivalente de viewport móvel sensível à composição, derivado de texto e estrutura. A medição real permanece a referência de calibração. O corpus atual não é suficiente para promover os coeficientes experimentais nem escolher valores numéricos para o padrão do produto.

Esta é apenas uma decisão sobre a forma e a semântica de um possível contrato. O produto não implementa nem persiste `EditorialPolicy`, origem, faixa, máximo, alerta ou score. Uma etapa futura só deve fazê-lo quando houver consumidor e vínculo reais; o benchmark, por si só, não autoriza bloqueio, nota de qualidade ou limite rígido.
