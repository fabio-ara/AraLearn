# Fundamentação pedagógica dos resources

## Finalidade e limites

Este documento registra a base teórica usada no desenho do contrato v4 dos
cards. Ele serve à documentação do artefato técnico e à futura dissertação, mas
não transforma decisões de engenharia em evidência de eficácia educacional.
Resultados de aprendizagem do AraLearn ainda precisam ser investigados com
participantes, tarefas e medidas adequadas.

O argumento de design é: uma representação deve ser escolhida quando sua
estrutura ajuda a executar a operação cognitiva pretendida; a prática deve
exigir recuperação ou discriminação observável; e a interface deve evitar carga
extrínseca que não contribui para aprender.

## Matriz de evidências e decisões

| Base | Implicação didática | Decisão no AraLearn | Limite |
|---|---|---|---|
| Carga cognitiva e atenção dividida | Informação que precisa ser integrada deve permanecer próxima | feedback localizado, anotações adjacentes, fórmula com leitura acessível, nenhum layout descrito por prosa | proximidade visual não garante compreensão |
| Coerência, sinalização e contiguidade | Elementos relevantes devem ser destacados sem decoração concorrente | presets semânticos, highlights referenciados por ID, labels próximos, ausência de propriedades livres de estilo | sinalização excessiva também pode competir por atenção |
| Múltiplas representações | Representações cumprem funções distintas e precisam ser coordenadas | registro de finalidade, `preferredResources`, `composite` apenas para coordenação inseparável | mais representações não são automaticamente melhores |
| Exemplos resolvidos e fading | Novatos se beneficiam de exemplo antes de resolução com apoio progressivamente menor | `foundation` → `worked_example` → `guided_practice` → `independent_practice` | expertise e natureza da tarefa alteram o apoio necessário |
| Prática de recuperação | Recuperar favorece retenção posterior mais que apenas reler | microssequências combinam explicação, prática e retomada | reconhecimento simples pode ser insuficiente para alguns objetivos |
| Espaçamento e alternância | O intervalo e a discriminação entre operações importam | dependências explícitas, retomadas posteriores e variação de casos | não existe intervalo universal no produto |
| Feedback corretivo | Múltipla escolha expõe a distratores; feedback reduz efeitos negativos | confirmação antes da avaliação, feedback por opção e explicação em `after` | feedback genérico ou tardio pode não corrigir o equívoco |
| Distratores funcionais | Opções não funcionais consomem tempo sem melhorar o item | 2 a 7 opções; quantidade deriva de equívocos plausíveis | perfil de prova pode justificar cinco somente quando há competição real |
| Multiple-response | Mais de uma resposta pode exigir recuperação adicional | `selectionMode: multiple`, `answerIds` plural e exact-set scoring | marcação múltipla aumenta carga e deve corresponder ao objetivo |
| Acessibilidade móvel | reflow, foco não oculto e alvos acionáveis preservam operação em telas estreitas | coluna móvel, controles por toque/teclado, confirmação, sem drag-and-drop | testes automatizados não substituem avaliação com usuários |

## Carga cognitiva e integração

Sweller (1988) descreve como busca por solução pode consumir recursos que não
se convertem em aprendizagem. Chandler e Sweller (1992) observaram que separar
fontes que precisam ser mentalmente integradas impõe carga extrínseca; a
integração física de texto e diagrama pode reduzi-la. Isso sustenta:

- não remeter a pessoa a dados particulares de um card anterior;
- posicionar feedback no item ou trecho correspondente;
- manter label, unidade e relação perto do objeto visual;
- preferir uma estrutura compacta a uma legenda que exige alternância contínua;
- dividir um caso quando a tela exige várias decisões independentes.

O princípio não autoriza remover complexidade inerente ao conteúdo. Uma matriz
continua bidimensional e um grafo continua relacional. O objetivo é eliminar a
busca visual e editorial que não faz parte da tarefa.

Mayer e Fiorella organizam evidências sobre coerência, sinalização,
redundância e contiguidade espacial/temporal. No contrato, a LLM indica
entidades, relações e destaques sem escolher cor ou posição. Assim, a mesma
semântica pode receber apresentação consistente em celular, desktop e leitura
assistiva.

## Representações externas

O framework DeFT de Ainsworth (2006) propõe analisar Design, Functions e Tasks
das múltiplas representações. Elas podem complementar informação, restringir
interpretações ou apoiar compreensão mais profunda, mas sua coordenação também
pode exigir esforço.

No AraLearn:

- `table`, `matrix`, `chart` e `plane` não são estilos de parágrafo;
- `tree`, `graph`, `flow` e `sequence` distinguem hierarquia, rede, decisão e
  ordem;
- `annotated_text` liga evidência e comentário;
- `linguistic_example` alinha forma, som, glosa e tradução;
- `composite` é reservado à tarefa que realmente exige coordenação.

O plano declara a operação antes do recurso. A auditoria pergunta se a estrutura
preserva a evidência desejada, não se a sequência apresenta variedade visual.

## Exemplos resolvidos e retirada de apoio

Sweller e Cooper (1985) encontraram vantagem de exemplos resolvidos sobre
resolução convencional em aquisição inicial de álgebra. Renkl et al. (2002)
estudaram transições suaves do estudo de exemplos à resolução; Renkl, Atkinson
e Große (2004) analisaram fading de passos sob a perspectiva da carga
cognitiva.

Essas evidências sustentam uma progressão causal, não uma quantidade rígida de
cards:

1. introduzir a base e a notação;
2. mostrar um caso resolvido da mesma operação;
3. solicitar um passo com apoio;
4. solicitar a operação com menos apoio;
5. variar caso, estratégia ou erro provável;
6. retomar depois quando a retenção for relevante.

Retirar apoio não significa ocultar os dados necessários. A diferença é entre
mostrar como decidir e fornecer o caso que precisa ser decidido.

## Recuperação, espaçamento e feedback

Roediger e Karpicke (2006) mostraram que testes de recuperação podem melhorar
retenção posterior em comparação com estudo repetido. Cepeda et al. (2006)
sintetizaram uma ampla literatura sobre prática distribuída e mostraram que os
efeitos dependem dos intervalos. O AraLearn, portanto, registra pré-requisitos e
retomadas sem fixar uma distância universal.

Múltipla escolha exige cautela porque os distratores expõem a informação
incorreta. Butler, Karpicke e Roediger (2007) investigaram tipo e momento de
feedback; Butler e Roediger (2008) encontraram que feedback pode ampliar os
efeitos positivos e reduzir os negativos do teste de múltipla escolha. Daí:

- a seleção não é avaliada a cada toque;
- a pessoa confirma antes de receber o resultado;
- feedback de opção explica a distinção local;
- `after` consolida a regra e não apenas diz “correto”;
- “ver resposta” distingue itens que deveriam e não deveriam ser marcados.

## Quantidade de opções e respostas múltiplas

Rodriguez (2005), numa meta-análise de 80 anos de pesquisa, concluiu que itens
com três opções frequentemente preservam qualidade psicométrica e permitem
maior cobertura. Raymond, Stevens e Bucak (2019) reforçam a importância de
identificar distratores não funcionais em provas de alto impacto.

O contrato aceita 2 a 7 opções porque o produto atende tarefas e perfis
distintos, mas a regra editorial é conservadora: só se adiciona uma opção
quando ela representa erro, condição ou decisão plausível. Cinco alternativas
podem ser adequadas num perfil FGV; não são o padrão universal do item.

Bishara e Lanzo (2015) encontraram condições em que opções múltiplas corretas
podem intensificar o testing effect. Isso apoia `multiple`, mas não justifica
usá-lo indiscriminadamente. O modo é apropriado quando reconhecer o conjunto
completo faz parte do resultado. O AraLearn usa correção pelo conjunto exato,
sem crédito por ordem ou marcação parcial implícita.

## Interação móvel, acessibilidade e interrupção

WCAG 2.2 orienta reflow sem perda de informação, foco visível e não oculto,
alternativas a gestos de arrastar e tamanho mínimo de alvo. O AraLearn adota uma
meta interna de 44 × 44 CSS px para linhas de resposta, superior ao mínimo AA,
porque o cenário de uso inclui uma mão, movimento e atenção fragmentada.

Recursos bidimensionais podem ter viewport próprio quando a relação espacial é
essencial, mas o texto ao redor deve refluir. A pessoa precisa conseguir
interromper, fechar e retomar com card, tentativa e respostas preservados no
IndexedDB. Nenhum renderer depende de CDN ou cálculo remoto.

## Determinismo e autoridade da LLM

JSON Schema 2020-12 define a forma declarativa. Structured Outputs, quando
oferecido pelo provider, restringe a saída à forma do schema; JSON mode apenas
garante JSON válido e é anunciado separadamente. Em ambos os casos, o AraLearn
continua responsável por:

- validar referências, dimensões e invariantes;
- verificar interação, resposta e feedback;
- aplicar guarda de escopo e fingerprint;
- calcular layout e acessibilidade;
- falhar fechado diante de alteração lateral.

O modelo não produz HTML, CSS, SVG, coordenadas, caminhos, cores nem cadeia de
pensamento. Essa limitação reduz o espaço de erro e mantém o estudo reproduzível
offline.

## Consequências para avaliação do artefato

Uma avaliação futura pode separar pelo menos quatro dimensões:

1. validade de contrato: taxa de saídas aceitas sem reparo;
2. isolamento: proporção de correções atômicas sem alteração lateral;
3. usabilidade móvel: conclusão, erro de toque, reflow, retomada e tempo;
4. qualidade didática: cobertura, função do recurso, recuperação, feedback e
   desempenho posterior.

Comparações úteis incluem `choice` versus `gap` no lugar estrutural, exemplos
com apoio fixo versus fading e representação única versus `composite`
coordenado. A análise deve registrar conhecimentos prévios e evitar concluir
causalidade a partir de métricas de uso.

## Referências técnicas

- JSON Schema. *Draft 2020-12*. <https://json-schema.org/draft/2020-12>
- OpenAI. *Structured model outputs*.
  <https://developers.openai.com/api/docs/guides/structured-outputs>
- Eclipse Layout Kernel. *ELK Layered*. <https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html>
- W3C. *Web Content Accessibility Guidelines 2.2*. <https://www.w3.org/TR/WCAG22/>
- W3C WAI. *Understanding SC 1.4.10: Reflow*. <https://www.w3.org/WAI/WCAG22/Understanding/reflow>

## Referências acadêmicas

- Ainsworth, S. (2006). DeFT: A conceptual framework for considering learning
  with multiple representations. *Learning and Instruction, 16*(3), 183–198.
  <https://doi.org/10.1016/j.learninstruc.2006.03.001>
- Bishara, A. J., & Lanzo, L. A. (2015). All of the above: When multiple correct
  response options enhance the testing effect. *Memory, 23*(7), 1013–1028.
  <https://doi.org/10.1080/09658211.2014.946425>
- Butler, A. C., Karpicke, J. D., & Roediger, H. L. (2007). The effect of type
  and timing of feedback on learning from multiple-choice tests. *Journal of
  Experimental Psychology: Applied, 13*(4), 273–281.
  <https://doi.org/10.1037/1076-898X.13.4.273>
- Butler, A. C., & Roediger, H. L. (2008). Feedback enhances the positive
  effects and reduces the negative effects of multiple-choice testing.
  *Memory & Cognition, 36*(3), 604–616.
  <https://doi.org/10.3758/MC.36.3.604>
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006).
  Distributed practice in verbal recall tasks: A review and quantitative
  synthesis. *Psychological Bulletin, 132*(3), 354–380.
  <https://doi.org/10.1037/0033-2909.132.3.354>
- Chandler, P., & Sweller, J. (1992). The split-attention effect as a factor in
  the design of instruction. *British Journal of Educational Psychology, 62*,
  233–246. <https://doi.org/10.1111/j.2044-8279.1992.tb01017.x>
- Mayer, R. E., & Fiorella, L. (2014). Principles for reducing extraneous
  processing in multimedia learning. In R. E. Mayer (Ed.), *The Cambridge
  Handbook of Multimedia Learning* (2nd ed., pp. 279–315).
  <https://doi.org/10.1017/CBO9781139547369.015>
- Raymond, M. R., Stevens, C., & Bucak, S. D. (2019). The optimal number of
  options for multiple-choice questions on high-stakes tests. *Advances in
  Health Sciences Education, 24*, 141–150.
  <https://doi.org/10.1007/s10459-018-9855-9>
- Renkl, A., Atkinson, R. K., Maier, U. H., & Staley, R. (2002). From example
  study to problem solving: Smooth transitions help learning. *The Journal of
  Experimental Education, 70*(4), 293–315.
  <https://doi.org/10.1080/00220970209599510>
- Renkl, A., Atkinson, R. K., & Große, C. S. (2004). How fading worked solution
  steps works: A cognitive load perspective. *Instructional Science, 32*,
  59–82. <https://doi.org/10.1023/B:TRUC.0000021815.74806.f6>
- Rodriguez, M. C. (2005). Three options are optimal for multiple-choice items:
  A meta-analysis of 80 years of research. *Educational Measurement: Issues
  and Practice, 24*(2), 3–13.
  <https://doi.org/10.1111/j.1745-3992.2005.00006.x>
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking
  memory tests improves long-term retention. *Psychological Science, 17*(3),
  249–255. <https://doi.org/10.1111/j.1467-9280.2006.01693.x>
- Sweller, J. (1988). Cognitive load during problem solving: Effects on
  learning. *Cognitive Science, 12*(2), 257–285.
  <https://doi.org/10.1207/s15516709cog1202_4>
- Sweller, J., & Cooper, G. A. (1985). The use of worked examples as a
  substitute for problem solving in learning algebra. *Cognition and
  Instruction, 2*(1), 59–89.
  <https://doi.org/10.1207/s1532690xci0201_3>
