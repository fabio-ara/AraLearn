# Roteiro de aceitação humana da Autoria

Este roteiro avalia se uma pessoa que nunca usou o AraLearn descobre e conclui
as tarefas reais de autoria. A sessão não ensina a arquitetura da interface e
não pede que a participante memorize nomes de áreas. Resultados automatizados
complementam a observação humana, mas não a substituem.

O feedback que motivou esta revisão é evidência de regressão do produto. A
avaliação, portanto, mede a recuperação da identidade compacta de Estudo e da
baixa carga cognitiva, não preferência estética.

## Verificação antes da sessão

Antes de envolver uma participante, reprovar a revisão se qualquer uma destas
condições ocorrer:

- a superfície de Autoria ultrapassa 430 px em 360, 390, 430 ou 1280 px;
- o aplicativo usa canvas de 760 px, segunda coluna, dashboard expandido ou
  composição exclusiva para desktop;
- nove destinos ou rótulos de áreas ficam expostos simultaneamente;
- um botão somente por ícone não possui `aria-label` e `title` ou tooltip;
- a página cria rolagem horizontal global;
- Estudo perdeu navegação, renderer, prática, progresso, temas, estado offline,
  reconexão ou acessibilidade;
- uma ação já confirmada e concluída no ChatGPT exige outra confirmação no
  AraLearn.

Verificar a aplicação real em claro e escuro. Em telas largas, a mesma
superfície de até 430 px deve permanecer centralizada; desktop não recebe uma
arquitetura visual diferente.

## Preparação

- usar uma conta de teste sem conhecimento prévio dos termos internos;
- entregar celular em 360, 390 e 430 px e repetir o núcleo em computador de
  1280 px;
- preparar um Curso próprio com planejamento, Partes em estados diferentes e
  uma Unidade recém-materializada pelo ChatGPT;
- incluir parâmetros herdados e locais, Fontes com e sem link, uma Âncora, um
  PDF válido e mais resultados do que cabem na primeira página;
- preparar Observações abertas e resolvidas, uma auditoria com achado, uma
  correção pronta, uma nova verificação e um ponto de controle reversível;
- preparar Variantes, uma diferença não declarada, fatos para gráfico, tabela e
  exportação, além de outra conta com acesso somente a Estudo;
- disponibilizar o relay local de teste na porta 4183 para a assistência
  contextual, com toda credencial fora do AraLearn e dos registros da sessão;
- repetir a chamada a partir do Pages HTTPS e do APK de release; registrar a
  permissão de acesso à rede local no navegador, a passagem pela ponte nativa no
  Android, a manutenção do bloqueio de conteúdo misto no WebView e a mensagem de
  recuperação em vez de contornar silenciosamente a política do cliente;
- exercitar também conexão instável, retomada após reconexão e duas abas;
- não explicar MCP, Partes, nomes de áreas, esquema, revisão, CAS, UUID,
  relações internas ou localização dos controles;
- pedir que a pessoa fale em voz alta o que procura, o que acha que acontecerá
  e por que escolheu cada ação.

## Regra de condução

Apresente somente a intenção de cada tarefa. Não diga por qual tela, menu ou
área a pessoa deve passar. Se ela pedir ajuda, registre o ponto exato e ofereça
apenas a menor pista necessária para continuar. Uma tarefa concluída depois de
ensinar a taxonomia da interface não comprova descoberta.

Para cada tarefa, registre dispositivo, tema, condição de conexão, primeiro
caminho tentado, hesitação, retorno perdido, texto ou ícone interpretado de
forma incorreta, ajuda solicitada, resultado e comentário espontâneo.

## Tarefas de descoberta

| Intenção apresentada à participante | Resultado esperado sem ensinar a interface | Evidência principal |
| --- | --- | --- |
| “Entre no lugar em que você construiria um curso e abra o Curso pelo título.” | diferencia Estudo de Autoria, localiza o Curso e consegue voltar a ele | escolha inicial, passos e vocabulário usado |
| “Encontre o que o ChatGPT acabou de produzir e diga onde isso fica no Curso.” | chega à Parte e à Unidade recém-materializadas, entende o estado e não perde posição na hierarquia | caminho seguido, posição preservada e interpretação do progresso |
| “Percorra o conteúdo acima e abaixo desta Unidade e volte exatamente a ela.” | navega por Curso, módulo, lição, Microssequência e Unidade sem decorar subsistemas | retorno exato, contexto visível e número de desvios |
| “Corrija manualmente um trecho simples desta Unidade.” | encontra edição contextual, limita o escopo, usa prévia, aplica e consegue desfazer | alvo alterado, renderer validado e ausência de edição paralela |
| “Peça à assistência do aplicativo uma alteração focal e confira antes de aceitar.” | encontra o relay local por divulgação progressiva, distingue pedido de aplicação e mantém o Curso utilizável em falha ou cota | escopo mínimo sem identidades internas, prévia, descarte/aplicação e credencial ausente do AraLearn |
| “Tente pedir assistência neste terminal extenso e, se não puder, corrija-o de outra forma.” | entende o motivo acessível do bloqueio sem concluir que perdeu a autoria e encontra a edição manual | limite de 6.000/12.000, nome acessível do controle e conclusão manual |
| “Deixe uma observação exatamente sobre o ponto que merece revisão.” | registra Observação situada e entende que ela não altera automaticamente o conteúdo | alvo, texto, estado de sincronização e expectativa declarada |
| “Descubra qual configuração vale aqui, de onde ela veio e troque ou restaure a decisão.” | consulta valor efetivo, origem e herança sem identificador ou texto técnico | controle encontrado, receio de alterar e resultado após restauração |
| “Confira a origem deste conteúdo e abra a evidência no ponto indicado.” | encontra Fonte, revisão, Âncora e PDF corretos; distingue ausência de link de ausência de proveniência | revisão aberta, localização e interpretação dos limites da Fonte |
| “Acompanhe este problema desde o diagnóstico até a confirmação de que foi corrigido.” | distingue achado, proposta, comparação, aplicação, nova verificação e reversão | sequência escolhida, escopo focal e compreensão do histórico |
| “Compare estas duas formas do Curso e depois chegue aos dados que sustentam a comparação.” | encontra Variantes, diferença declarada, desvio, gráfico, tabela, definição, denominador e exportação | recorte igual nas representações e limites da conclusão |
| “Dê acesso de Estudo a outra pessoa e confira o que ela pode ver.” | administra acesso em contexto secundário e preserva privacidade, autoria e projeção de Estudo | concessão/revogação, dados ocultos e autoridade compreendida |
| “Continue depois de perder a conexão e de abrir o mesmo Curso em outra aba.” | preserva última revisão válida, rascunhos e posição; entende sincronização e retoma sem duplicar | estado offline, reconexão, conflito e resultado final |
| “Peça no ChatGPT uma alteração e acompanhe o resultado no AraLearn.” | chat e Autoria mostram o mesmo Curso, escopo e revisão; o resultado aparece sem segunda confirmação | recibo, endereço direto, atualização e ausência de mutação duplicada |

## Perguntas finais

Pergunte sem mostrar a navegação nem sugerir os termos esperados:

1. “Quando você usaria Estudo, Autoria, ChatGPT ou a assistência deste
   aplicativo?”
2. “Como você voltaria ao conteúdo que acabou de ser produzido?”
3. “O que você consegue mudar diretamente e o que prefere pedir à assistência?”
4. “Como você saberia qual configuração está valendo neste ponto?”
5. “Como verificaria a fonte e os limites de uma afirmação?”
6. “Qual é a diferença entre observar, diagnosticar, corrigir e verificar?”
7. “Como chegaria aos dados de uma comparação e o que eles não permitem
   concluir?”
8. “Que palavras, ícones ou passagens pareceram difíceis de descobrir?”

Não pergunte “para que serve cada área”. A interface é aprovada quando a pessoa
encontra e compreende tarefas, mesmo que nunca nomeie a organização interna.

## Critério de decisão

O fluxo falha se uma tarefa comum exigir explicação externa de arquitetura,
identificador, contrato ou banco; se a participante perder o contexto do Curso;
se aprender a contornar a interface substituir a descoberta; ou se texto e
navegação simultâneos aumentarem a carga até ela abandonar a intenção original.

Registre cada dificuldade como Observação datada e trate recorrência ou bloqueio
como defeito de produto. Corrija a interface antes de alegar simplicidade. Um
resultado humano positivo é necessário para os critérios de simplicidade das
issues [#114](https://github.com/fabio-ara/AraLearn/issues/114),
[#129](https://github.com/fabio-ara/AraLearn/issues/129) e
[#144](https://github.com/fabio-ara/AraLearn/issues/144).

Os achados também alimentam
[#120](https://github.com/fabio-ara/AraLearn/issues/120),
[#128](https://github.com/fabio-ara/AraLearn/issues/128) e
[#131](https://github.com/fabio-ara/AraLearn/issues/131), que permanecem abertas
enquanto seus critérios dependerem do ChatGPT conectado, de medidas reais do
modelo ou de avaliação humana. A
[#130](https://github.com/fabio-ara/AraLearn/issues/130) continua dependente do
cutover da #129, das medidas operacionais, da documentação final e da limpeza
física autorizada.

A sessão de pesquisa também exige revisão especializada sobre validade das
medidas e proteção das pessoas. Aprovação da interface não demonstra eficácia
educacional. Observação não é achado, resposta não é correção, comparação não é
experimento e progresso não é aprendizagem comprovada.
