# Modelo didático

O modelo didático do AraLearn parte de uma recusa: aprender não é apenas receber explicação. A aplicação foi construída sobre a hipótese de que, sobretudo em estudo autodirigido e sob condições de cansaço, interrupção e excesso de informação, a compreensão melhora quando o conteúdo é reorganizado como percurso praticável.

## A unidade central

A unidade didática central do AraLearn é a microssequência. Ela não é simplesmente uma coleção de itens. É uma unidade de progressão local. Sua função é conduzir o estudante de um ponto de entrada suficientemente delimitado até algum tipo de evidência de domínio.

Por isso, a microssequência precisa ser suficientemente pequena para caber na rotina e na atenção disponíveis, mas suficientemente concreta para ensinar algo real. O problema não está em ser breve; está em ser breve e vazia. O AraLearn rejeita resumo genérico não porque todo texto de síntese seja ilegítimo, mas porque o tipo de transformação que lhe interessa é outro: decomposição, mediação, prática e revisão.

## Meticulosidade

No AraLearn, meticulosidade não significa ampliação textual. Significa precisão na progressão. Em termos práticos, isso envolve:

- decompor o ponto didático em passos ensináveis;
- apresentar o mínimo de contexto necessário;
- preparar notação quando ela ainda não está estabilizada para o estudante;
- mostrar um caso ou uma leitura guiada antes de exigir salto grande;
- pedir prática em formato coerente com o que foi mostrado;
- variar a prática quando a repetição simples já não acrescenta aprendizado;
- verificar domínio sem reduzir o percurso a um teste cego.

Essa posição dialoga com literatura sobre recuperação ativa, worked examples, carga cognitiva e feedback formativo, mas também nasce da experiência concreta de autoria: muita explicação aparentemente “completa” falha exatamente porque tenta dizer tudo sem ensinar o passo certo.

## Cobertura e repetição

Uma das distinções mais importantes do modelo é a diferença entre cobertura e repetição. Cobertura pergunta quais capacidades precisam aparecer para que o estudante possa operar com o tema. Repetição pergunta quantas vezes e de quantas formas uma dessas capacidades precisa ser revisitadas para consolidar entendimento.

Sem essa distinção, o percurso cai em dois extremos ruins: ou vira resumo condensado, ou vira série de exercícios equivalentes. O AraLearn tenta escapar dos dois. Por isso, sua modelagem interna separa a capacidade a ser coberta da variação de prática usada para consolidá-la.

## Sequência preferida

O desenho preferido continua sendo:

1. contexto mínimo;
2. microteoria;
3. caso guiado ou leitura acompanhada;
4. prática autossuficiente;
5. consolidação.

Essa sequência não é dogma mecânico. Ela é um princípio de prudência didática. Nem toda microssequência precisa realizar todos os passos com a mesma extensão, mas a aplicação procura evitar a passagem brusca de teoria abstrata para cobrança sem mediação.

## Contexto local e carga cognitiva

Uma consequência importante desse modelo é a insistência em manter o contexto operacional junto da tarefa. Em linguagem de teoria da carga cognitiva, trata-se de reduzir carga extrínseca desnecessária e evitar o custo adicional de integrar mentalmente informações dispersas. Quando dados, operandos, notação, figura relevante e pedido de resposta ficam separados, a tarefa passa a exigir memória de trabalho adicional que nem sempre contribui para a aprendizagem. O AraLearn tenta, por desenho, diminuir esse atrito.

## Papel da LLM

A LLM não decide a didática do percurso. Ela participa de uma etapa delimitada de preenchimento. O app continua responsável por tipo, tamanho, sequência, formatos possíveis e regras de validação. Isso é especialmente importante porque o produto foi calibrado para operar bem também com modelos leves. Em vez de confiar em improvisação ampla, o AraLearn desloca parte da inteligência para a própria arquitetura.

## Formas de apresentação e prática

Os diferentes formatos disponíveis no produto não entram por ornamentação visual. Texto, escolha, lacuna, código, tabela, árvore, fluxograma, plano cartesiano e matriz servem a demandas didáticas distintas. Em alguns casos, a tarefa exige leitura comparativa; em outros, execução operacional; em outros, visualização espacial ou procedimental. O critério correto não é “variedade por variedade”, mas adequação entre forma de representação e o tipo de operação cognitiva que se quer favorecer.

## Checagens locais de qualidade didática

O modelo didático do AraLearn inclui uma camada de checagens locais. Essa camada não deve ser lida como professor artificial que interpreta qualquer texto com profundidade humana. Ela funciona como contenção técnica para defeitos detectáveis.

Parte dessas checagens é estrutural: ausência de contexto mínimo, resposta revelada, dependência de referência externa, quebra do plano. Parte é declarativa: prática ausente, variação insuficiente, repetição sem nova função. Parte é textual, mas com força limitada: sinais evidentes de genericidade, mediação fraca ou preparação ausente. O objetivo não é julgar semanticamente tudo; é impedir que a aplicação aceite sem resistência certos defeitos recorrentes.

## Rascunho, prontidão e estudo

O modelo também distingue claramente autoria em andamento e conteúdo executável. `draft` não é apenas um estado visual; é uma forma de separar o que ainda está em construção do que já pode entrar no estudo. O mesmo vale para `included: false`, que mantém uma microssequência fora do percurso executável sem apagá-la da árvore.

Essa decisão preserva algo importante: a possibilidade de estudar, revisar e reorganizar no mesmo ambiente sem confundir material de trabalho com material pronto.

## O que o modelo ainda precisa provar em pesquisa própria

Alguns pontos do modelo didático já encontram base teórica forte. Outros ainda precisam de avaliação situada no próprio AraLearn: tamanho ideal das microssequências por domínio, grau de variação necessário para consolidar uma capacidade, efeito dos presets de lição, momento certo de expandir uma sequência em vez de criar outra e impacto real das checagens locais sobre a qualidade percebida pelo estudante.

Isso não reduz a consistência do modelo. Apenas impede que o projeto transforme decisões promissoras em certeza prematura.
