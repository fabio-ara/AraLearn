# Corpus de recortes e contraexemplos

Este corpus acompanha o [protocolo de unidade de análise](desenho-instrucional-parametrizado.md#protocolo-de-unidade-de-análise), definição operacional 1.
Contém casos sintéticos de redes, matemática, organização do trabalho, leitura
literária e vocabulário, em português, inglês, espanhol, francês e chinês.
Os trechos foram construídos para comparar decisões de codificação. Não são
cursos completos, fontes disciplinares de referência ou dados de estudantes.

Cada caso explicita contexto, recorte adotado e alternativa concorrente. Ambas
as leituras são exemplos analíticos produzidos na mesma elaboração, não saídas
de codificadores independentes. “Adotado” significa consistente com o contexto
aqui fixado, não padrão-ouro validado. As traduções servem à inspeção do
protocolo; equivalência por especialistas e estabilidade entre execuções ainda
não foram medidas. Uma tradução não representa amostra independente de domínio.

As identidades abaixo são locais a cada caso. `I` significa introdução, `U` uso,
`R` retomada e `M` menção. `P` identifica pressuposto no repertório, não ocorrência
textual. Desenvolvimento é informado por trecho; não se deduz dessas letras.
Uma mesma identidade introduzida e aplicada na unidade conta uma introdução.

## 1. Redes: rótulo, objeto e relação

**Finalidade e repertório.** Reconhecer os elementos de um exemplo simplificado
de encaminhamento em rede local. O público conhece “interface de rede”,
“conexão”, “origem”, “destino” e “tabela”; quadro, switch e endereço MAC não foram
pressupostos. Não se pretende explicar aqui todo o funcionamento de Ethernet.

| Localizador | Trecho construído em português |
| --- | --- |
| N1.1 | Neste exemplo de rede local, um quadro é um bloco de dados enviado entre interfaces. |
| N1.2 | Um switch, também chamado comutador, conecta interfaces por suas portas. |
| N1.3 | O endereço MAC é o identificador de uma interface usado nesse encaminhamento. |
| N1.4 | Para um destino conhecido na sua tabela, o switch encaminha o quadro à porta associada ao endereço MAC de destino. |

| Identidade adotada | Ocorrência e tratamento | Recorte concorrente e decisão |
| --- | --- | --- |
| N-quadro | I em N1.1; U em N1.4; definição inicial | Contar “dados” e “bloco” separadamente sem necessidade da tarefa amplia o inventário sem mudar o desenho. Reabrir se o público não compreender esses termos. |
| N-switch | I em N1.2; U em N1.4; definição inicial e aplicação | Criar N-comutador como segundo conceito duplica o objeto. Neste objetivo, os dois rótulos apontam à mesma identidade. |
| N-mac | I em N1.3; U em N1.4; definição contextual inicial | Contar cada letra de MAC não representa o alvo. Aprender a expansão da sigla seria outra finalidade, ausente aqui. |
| N-encaminhamento | I em N1.4; relação condicional entre tabela, destino e porta | Usar apenas os três nomes acima omite o conhecimento relacional. Contar “porta” como novo recorte só é necessário se sua função não ficar compreensível no repertório e em N1.2. |

**Contagem adotada:** quatro introduções nessa unidade expositiva, com quatro
identidades mobilizadas, sem somar novamente os usos de N1.4. O trecho oferece
tratamento inicial, mas não comprova suficiência do desenvolvimento. Se o alvo
for diagnosticar decisões de encaminhamento, exemplos, casos desconhecidos e
limites exigirão desenvolvimento adicional; não se declara esse escopo coberto.

**Contraste de repertório N2.** Para público que já conhece N-quadro, N-switch e
N-mac, mas ainda não estudou N-encaminhamento, N1.4 isolado contém uma introdução
da relação e usos de três pressupostos. Para o público de N1, essa frase isolada
deixa as três bases sem desenvolvimento: não são três pressupostos implícitos.
Um inventário de “quatro palavras novas” também falha porque omite a relação e
confunde rótulos com conhecimento.

**Traduções de N1 para comparar o mesmo inventário:**

- N1-en: “In this local-network example, a frame is a block of data sent between
  interfaces. A switch connects interfaces through its ports. The MAC address
  identifies an interface for this forwarding operation. For a destination
  known in its table, the switch forwards the frame to the port associated
  with the destination MAC address.”
- N1-es: “En este ejemplo de red local, una trama es un bloque de datos enviado
  entre interfaces. Un switch, también llamado conmutador, conecta interfaces
  por sus puertos. La dirección MAC identifica una interfaz para este reenvío.
  Para un destino conocido en su tabla, el switch reenvía la trama al puerto
  asociado a la dirección MAC de destino.”

Com repertório e finalidade preservados, a leitura adotada conserva as quatro
identidades: quadro/frame/trama é um alinhamento contextual, não três recortes
novos. Se a tarefa for aprender terminologia entre idiomas, reabrir o inventário.

## 2. Matemática: regra, condição e notação

**Repertório A.** Aritmética, igualdade, significado de incógnita e impossibilidade
de divisão por zero são pressupostos. Finalidade: resolver equações da forma
`a × x = b` com `a ≠ 0`.

| Localizador | Trecho equivalente construído |
| --- | --- |
| A1-pt | Se a ≠ 0, divida os dois lados de a × x = b por a. Assim, x = b/a. |
| A1-fr | Si a ≠ 0, divisez les deux membres de a × x = b par a. Ainsi, x = b/a. |
| A1-zh | 若a≠0，将a×x=b的两边同时除以a，得到x=b/a。 |

**Recorte adotado:** A-regra, resolução por divisão dos dois membros pelo
coeficiente não nulo, I com explicação de procedimento; A-não-zero é P e U.
**Alternativa rejeitada:** uma unidade de análise para cada símbolo e outra para
cada palavra faz mudar a contagem entre idiomas sem mudança da tarefa. A regra
não justifica, por si, por que a transformação preserva a igualdade; se essa
justificação for alvo, o material precisa desenvolvê-la.

**Repertório B.** O estudante ainda precisa distinguir quando a divisão é
admissível, e o objetivo inclui comparar `0 × x = 0` e `0 × x = 5`. Agora separar
A-condição é pertinente: A1 apenas a enuncia, sem desenvolver os casos de
coeficiente zero. O plano tem uma lacuna a resolver; não se marca a condição
como dominada nem se apaga o recorte para conservar “uma novidade”.

As três expressões de A1 não justificam comparação por espaços ou tokens.
Uma contagem regex de grupos de letras/números no chinês é uma observação desse
algoritmo, não segmentação linguística validada nem medida de conhecimento.

## 3. Organização do trabalho: pré-requisito fora da ementa

**Situação fictícia.** Ensinar a regra local de distribuição de pedidos da equipe
Alfa. O curso inclui distribuição, mas seu planejamento inicial omitiu comparar
quantidades. Não se trata de norma jurídica ou procedimento de organização real.

| Localizador | Trecho |
| --- | --- |
| O1-pt | Na equipe Alfa, pedidos com até 3 itens seguem para a fila A; pedidos com mais de 3 itens seguem para a fila B. |
| O1-es | En el equipo Alfa, los pedidos con hasta 3 artículos van a la cola A; los pedidos con más de 3 artículos van a la cola B. |
| O2 | Um pedido tem exatamente 3 itens. Escolha a fila e explique qual parte da regra sustenta sua decisão. |

**Recorte adotado:** O-regra-distribuição, I em O1, R em O2; desenvolvimento inicial
por regra condicional. O-limiar-inclusivo é conhecimento necessário: se não for
pressuposto, precisa de recorte e desenvolvimento que distingam “até” de “menos
de”. O2 oferece uma oportunidade de aplicação com justificação, ainda sem
requisito formal de evidência.

**Alternativa rejeitada:** classificar “até 3” como acessório dispensável porque
a ementa só menciona distribuição altera a tarefa: confunde o caso exatamente
igual ao limite. A correspondência fila/cola não introduz novo conhecimento
se o público entende a língua. Já ensinar o contraste entre limites inclusivos
e exclusivos muda o inventário, mesmo quando os textos permanecem curtos.

## 4. Leitura literária: continuidade e referência ambígua

**Finalidade.** Examinar como a escolha de palavras sustenta uma interpretação
de um microconto. Vocabulário cotidiano é pressuposto; a análise da ambiguidade
é nova. Não inferir fatos biográficos ou psicológicos sobre pessoas reais.

| Localizador | Microconto e tarefa construídos |
| --- | --- |
| L1 | Lia entregou o mapa a Bia. Ela o dobrou e saiu. |
| L2 | Quem dobrou o mapa? Indique duas leituras compatíveis com o trecho e explique o que falta para escolher entre elas. |
| L3 | O pronome “ela” pode retomar Lia ou Bia nesse contexto. Nomear quem dobrou o mapa resolveria essa ambiguidade. |

**Recorte adotado:** L-referência-ambígua é alvo da prática em L2 e recebe
introdução/desenvolvimento explícito em L3. A atividade pode solicitar a
descoberta antes da explicação, desde que a demanda esteja planejada e seja
adequada ao repertório; essa ordem não comprova aprendizagem. A unidade completa
é mista, com oportunidade antes do desenvolvimento. Nomes próprios e mapa são
usados no contexto, não novos conceitos pedagógicos por serem substantivos.

**Alternativa rejeitada:** escolher Lia apenas pela proximidade ou presumir uma
única correferência transforma hipótese em fato. Exigir o nome técnico “anáfora”
quando o objetivo só pede reconhecer e discutir a ambiguidade acrescenta
vocabulário sem necessidade. Se o curso ensinar análise gramatical formal,
o inventário deverá ser revisto.

## 5. Vocabulário: mesma forma, sentidos diferentes

**Finalidade A.** Ler instruções simples de costura e culinária em português;
os dois sentidos de “manga” são pressupostos. **Finalidade B.** Aprender a
correspondência entre esses sentidos e o inglês.

| Localizador | Trecho |
| --- | --- |
| V1 | Costure a manga da camisa. |
| V2 | Corte a manga madura. |
| V3 | Neste par de exemplos, “manga” corresponde a “sleeve” na camisa e a “mango” na fruta. |

Na finalidade A, V1–V2 usam conhecimento pressuposto e não introduzem recorte
apenas porque uma palavra se repete. Na finalidade B, V3 introduz duas
correspondências lexicais distinguíveis, V-manga-roupa e V-manga-fruta, com
contraste contextual. **Alternativa rejeitada:** fundir ambas pela grafia produz
equivalência incorreta; contar cada ocorrência de “manga” como nova introdução
produz duplicação. O recorte depende da operação pretendida.

## 6. Mesmos alvos, distribuição e oportunidades diferentes

Este exemplo usa A-regra do caso 2, com o repertório A fixado. O alvo das
oportunidades é aplicar a regra e justificar a transformação. Os enunciados
esquemáticos abaixo descrevem a composição; não substituem as explicações
integrais de um material de estudo.

| Posição | Conteúdo e ordem interna | Classe e codificação |
| --- | --- | --- |
| D1 | Apresentação de A-regra, com condição e explicação pertinente. | Expositiva; I de A-regra. |
| D2 | Exemplo resolvido: `3x = 9`; resolução e justificação já visíveis. | Expositiva; U e desenvolvimento de A-regra; zero oportunidades. |
| D3 | Comparação comentada com o exemplo anterior; depois, solicitar resolver `4x = 20` e justificar antes de abrir a solução. | Mista; R e desenvolvimento; oportunidade O-a de consolidação. |
| D4 | Solicitar resolver `-2x = 8` e justificar; solução disponível após a tentativa. | Prática; R; O-b varia o sinal do coeficiente, aspecto relevante a revisar semanticamente. |
| D5 | Explicação de erro recorrente na divisão de ambos os membros, sem nova solicitação. | Expositiva; R e desenvolvimento; zero oportunidades. |

**Contagens declaradas:** cinco unidades classificadas, três expositivas, uma
mista e uma de prática; presença de prática em 2/5 unidades. Uma introdução de
A-regra no conjunto. Duas oportunidades distintas propostas para o alvo;
nenhuma resposta de estudante observada. Intervalos de unidades expositivas
completas sem oportunidade: duas antes de O-a, zero entre O-a e O-b, uma após
O-b. A exposição inicial de D3 continua registrada pela posição interna, embora
não componha as duas unidades completas do primeiro intervalo.

Mudar a ordem das alternativas de O-a ou permitir nova tentativa não cria O-c
distinta. Dois campos “resultado” e “justificação” são uma oportunidade de
operação composta. Se O-a também visasse reconhecer a condição não nula, teria
dois alvos; o total global continuaria uma solicitação. Uma exigência formal de
evidência precisaria especificar apoio, operação e condições antes de usar
essas oportunidades em sua contagem.

**Contraexemplo de extensão.** D3 com retorno fechado e D3 com retorno aberto
são estados diferentes. Não foram renderizados neste corpus: altura, viewport
útil e telas equivalentes permanecem não medidos. É incorreto atribuir-lhes
pixels ou tempo de estudo a partir do número de palavras, fórmulas ou campos.

## O que esta comparação permite concluir

As alternativas revelam critérios refutáveis: duplicar sinônimo, apagar relação,
presumir pré-requisito omitido, confundir palavra com sentido, contar exemplo
resolvido como solicitação e tratar várias tentativas como variação violam o
contexto declarado. Também mostram mudanças legítimas de recorte por público
e objetivo. Não estabelecem a frequência desses erros em modelos ou pessoas.

Uma aplicação posterior do protocolo deve relatar caso, contexto, inventário,
ocorrências, localizadores, divergências e sua decisão. Comparar apenas os
totais ocultaria uma troca de identidades. Para alegações de confiabilidade,
generalização entre idiomas ou efeito educacional, faltam avaliação humana
independente, amostragem e evidência de desempenho adequadas à pergunta.
