# Modelo didático

O modelo didático do AraLearn parte de uma constatação prática: aprender exige mais do que receber explicações. É preciso situar o conteúdo, ver exemplos, praticar, errar, corrigir, revisar e seguir uma ordem que faça sentido. O estudante pode assistir a muitas aulas e ainda não conseguir resolver problemas; pode usar IA e receber respostas plausíveis, mas sem continuidade. O AraLearn tenta organizar esse intervalo entre exposição e apropriação.

## Microssequência

A microssequência é a unidade de progressão do AraLearn. Ela reúne objetivo, papel na trilha, dependências, conteúdos cobertos, critérios de verificação e cards ordenados.

Ela foi escolhida por uma razão de escala. O card isolado tende a ficar estreito demais para sustentar contexto. A lição inteira pode ser ampla demais para uma sessão de estudo no celular. A microssequência ocupa o meio: trabalha um ponto delimitado e preserva a ligação com o percurso.

Uma microssequência pode servir para:

- introduzir uma regra;
- apresentar um exemplo suficiente;
- pedir uma aplicação objetiva;
- corrigir um erro recorrente;
- revisar uma etapa anterior;
- preparar a próxima etapa.

## Carga cognitiva

Sweller (1988) mostrou que a aprendizagem é afetada pelas limitações da memória de trabalho. Sweller, Van Merriënboer e Paas (1998) aprofundaram a relação entre arquitetura cognitiva e desenho instrucional. No AraLearn, isso se traduz em decompor a trilha, explicitar dependências e evitar que o estudante tenha de reconstruir sozinho a ordem do conteúdo.

Essa escolha é especialmente importante em conteúdos técnicos. Em programação, matemática, lógica, arquitetura de computadores ou governança de IA, parte da dificuldade não está apenas no conceito, mas no excesso de operações periféricas: procurar material, decidir sequência, identificar pré-requisito, alternar fonte, traduzir explicação em exercício e retomar depois de dias.

## Exemplos resolvidos e retirada de apoio

Sweller e Cooper (1985) compararam o estudo de exemplos resolvidos com a resolução convencional de problemas na aprendizagem inicial de álgebra. Renkl, Atkinson e Große (2004) investigaram a passagem dos exemplos para a resolução independente por meio da retirada gradual de etapas.

No AraLearn, uma operação nova recebe a base conceitual necessária e, quando a natureza da tarefa exigir, um exemplo resolvido da mesma operação. A prática guiada vem antes da prática com menos apoio. Essa ordem não fixa uma quantidade universal de cards: a especificação considera a complexidade da operação, os erros previsíveis e a evidência necessária para o resultado de aprendizagem.

Retirar apoio não significa omitir dados do problema. Valores, trechos, coordenadas, casos e demais elementos particulares permanecem no próprio card. O que diminui é a ajuda para decidir, não a informação indispensável para compreender a tarefa.

## Recuperação ativa

Karpicke e Roediger (2008) demonstraram a importância da recuperação ativa para consolidar aprendizagem. Por isso, uma microssequência não deve ser apenas exposição. O padrão desejável é combinar explicação e prática: apresentar uma ideia, mostrar um caso, pedir uma decisão, variar o exemplo quando necessário e oferecer feedback.

Nem toda etapa precisa conter todos esses movimentos. O princípio, porém, é estável: entender uma explicação não equivale a conseguir usar o conceito.

## Retomada e alternância

Um conceito não deve desaparecer depois da primeira prática. Cepeda et al. (2008) mostraram que o intervalo mais favorável entre oportunidades de estudo depende do tempo pelo qual se pretende conservar a aprendizagem. Isso desaconselha uma regra única de espaçamento. No AraLearn, a autoria retoma um conceito depois de uma separação significativa na trilha e registra a dependência que torna essa retomada possível.

Alternar operações relacionadas pode ajudar o estudante a reconhecer qual procedimento se aplica a cada caso. Taylor e Rohrer (2010) observaram esse efeito em problemas de matemática mesmo quando controlaram o espaçamento entre as práticas. A alternância, portanto, não consiste em misturar assuntos ao acaso. Primeiro se estabelece a base de cada operação; depois, casos próximos podem aparecer intercalados para exigir discriminação.

O plano identifica conceitos, operações e relações causais. Um card de prática declara quais conceitos recupera, e a recuperação só é válida quando esses conceitos foram apresentados antes na mesma cadeia ou numa dependência aprovada. Assim, a continuidade não depende de coincidência de palavras nem da memória da conversa usada na autoria.

## Dificuldade útil

Bjork e Bjork (2011) discutem dificuldades desejáveis: obstáculos que podem melhorar a aprendizagem quando exigem recuperação, discriminação ou reorganização, sem criar atrito gratuito. O AraLearn adota esse cuidado ao evitar perguntas que entregam a resposta no próprio enunciado, exercícios sem variação e sequências longas de recepção passiva.

A dificuldade útil é aquela que obriga o estudante a decidir. A dificuldade inútil é aquela que consome energia sem ensinar.

## Representação adequada

Mayer (2009) argumenta que palavras e imagens podem favorecer a compreensão quando são combinadas de modo coerente. No AraLearn, essa ideia aparece nos recursos de card. Uma matriz deve preservar linhas e colunas. Um plano cartesiano deve mostrar posição e deslocamento. Um grafo deve preservar vértices e arestas. Um fluxograma deve explicitar sequência, decisão e repetição.

A forma não é decoração. Ela participa do conteúdo quando a relação espacial, tabular, hierárquica ou operacional é parte do que se aprende.

Cada operação registra quais recursos a representam melhor e quais outras formas permanecem adequadas. Uma prática deve usar uma dessas representações, sem reduzir código, tabela, árvore, grafo, matriz ou fórmula a uma pergunta textual apenas por facilidade de produção.

Quando o estudante completa uma estrutura, a lacuna fica no próprio lugar em que o raciocínio ocorre: uma célula, um trecho de código, um rótulo, um peso, uma coordenada ou um termo de fórmula. A autoria descreve isso por campos JSON conhecidos. O AraLearn valida e compila esses campos de modo determinístico; não tenta converter instruções em português em marcação visual.

## Autonomia com suporte

Zimmerman (2002) define aprendizagem autorregulada como processo em que o estudante planeja, monitora e ajusta suas estratégias. O AraLearn tenta apoiar essa autorregulação ao oferecer uma estrutura visível: o estudante organiza trilhas, escolhe a etapa, acompanha o progresso, registra comentários e continua.

Vygotsky (1978) ajuda a pensar a aprendizagem como processo mediado por instrumentos, linguagem e interação. Bruner (1978) contribui com a noção de apoio gradual. No AraLearn, a microssequência funciona como uma forma de apoio local: delimita o problema, oferece prática e permite retirada progressiva de suporte conforme a trilha avança.

Freire (1996) é relevante por outra razão. Autonomia não significa abandono do estudante, nem consumo passivo de material pronto. No AraLearn, a pessoa escolhe cursos, organiza o próprio percurso e pode revisar, editar ou gerar uma nova revisão. A publicação oficial permanece somente leitura até uma nova publicação validada. A autoria precisa preservar revisão humana; a IA não deve ser tratada como professora automática.

## Erro como objeto de estudo

O erro útil é aquele que revela uma distinção importante. Confundir valor e endereço em C, trocar linha por coluna em matriz, inverter origem e destino em uma aresta ou confundir condição de entrada e saída em um laço são erros que podem ensinar.

Por isso, o AraLearn admite papéis como correção de erro e campos como `errors` em tópicos. Distratores não devem ser absurdos; devem representar alternativas plausíveis que ajudem o estudante a discriminar o conceito.

## Cards dentro da microssequência

Os cards são peças de uma etapa. Podem cumprir funções como explicar, exemplificar, praticar, revisar, corrigir ou preparar continuidade. Essa organização evita dois extremos: teoria sem aplicação e exercício sem contexto.

A microssequência mantém teoria, prática e feedback no mesmo recorte didático.
Uma nova revisão pode preservar a identidade de um elemento quando o autor
declara que ele continua sendo o mesmo e a alteração respeita o contrato. O
sistema não infere equivalência semântica nem altera uma revisão já publicada.

## Estudante-trabalhador

O foco em estudantes-trabalhadores orienta escolhas didáticas. O projeto precisa funcionar para quem estuda no celular, em períodos fragmentados, com cansaço e, muitas vezes, sem conexão confiável. Essa condição favorece etapas delimitadas, prática objetiva, retomada e uma réplica local dos dados necessários.

O objetivo não é reduzir a aprendizagem a pequenas doses sem continuidade. É o oposto: usar unidades manejáveis para preservar uma trilha mais longa.

## Referências citadas

Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher et al. (Eds.), *Psychology and the real world*. Worth.

Bruner, J. S. (1978). The role of dialogue in language acquisition. In A. Sinclair, R. J. Jarvella, & W. J. M. Levelt (Eds.), *The child's conception of language*. Springer.

Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science*, 19(11), 1095-1102. <https://doi.org/10.1111/j.1467-9280.2008.02209.x>

Freire, P. (1996). *Pedagogia da autonomia: saberes necessários à prática educativa*. Paz e Terra.

Karpicke, J. D., & Roediger III, H. L. (2008). The critical importance of retrieval for learning. *Science*, 319(5865), 966-968. <https://doi.org/10.1126/science.1152408>

Mayer, R. E. (2009). *Multimedia learning* (2nd ed.). Cambridge University Press. <https://doi.org/10.1017/CBO9780511811678>

Renkl, A., Atkinson, R. K., & Große, C. S. (2004). How fading worked solution steps works: A cognitive load perspective. *Instructional Science*, 32, 59-82. <https://doi.org/10.1023/B:TRUC.0000021815.74806.f6>

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285. <https://doi.org/10.1207/s15516709cog1202_4>

Sweller, J., & Cooper, G. A. (1985). The use of worked examples as a substitute for problem solving in learning algebra. *Cognition and Instruction*, 2(1), 59-89. <https://doi.org/10.1207/s1532690xci0201_3>

Sweller, J., Van Merriënboer, J. J. G., & Paas, F. (1998). Cognitive architecture and instructional design. *Educational Psychology Review*, 10, 251-296. <https://doi.org/10.1023/A:1022193728205>

Taylor, K., & Rohrer, D. (2010). The effects of interleaved practice. *Applied Cognitive Psychology*, 24(6), 837-848. <https://doi.org/10.1002/acp.1598>

Vygotsky, L. S. (1978). *Mind in society: The development of higher psychological processes*. Harvard University Press.

Zimmerman, B. J. (2002). Becoming a self-regulated learner: An overview. *Theory Into Practice*, 41(2), 64-70. <https://doi.org/10.1207/s15430421tip4102_2>
