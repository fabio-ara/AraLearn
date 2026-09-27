# Produção inicial e revisão visual por MCP — MS8, 0.0.87

Etapa **67d2fd37-2b0d-8b78-8a33-4edbb1813eaa**, “Qual é o próximo passo?”, do curso **68d099a5-60d6-4a26-bd93-4a990a4789c3**. Antes do pedido: revisão 77, nenhuma unidade ou Explicação nessa etapa e nenhum pré-requisito curricular declarado. ChatGPT Chat normal/Média, plugin AraLearn selecionado. Conversa nova não comprova isolamento de memória; a ausência de painel Fontes na resposta final também não.

## Primeira produção preservada

Pedido enviado em **2026-09-27T10:09:07.318Z**, sem rascunhos corrigidos ou lista de erros anteriores:

> Quero desenvolver a etapa “Qual é o próximo passo?”, da parte “Do pedido à entrega”, no meu curso “Do sinal à decisão: como representamos situações para prever o que acontece depois”. Prepare uma experiência completa para uma pessoa iniciante aprender a distinguir uma sequência de passos de um caminho que muda conforme uma decisão. Use uma situação cotidiana que faça sentido, explique o raciocínio com exemplos e representações úteis e proponha atividades em que a pessoa precise decidir o caminho e reconstruir a ordem, com retornos que a ajudem a aprender. Siga o planejamento e as escolhas pedagógicas já registrados para essa etapa. Deixe o conteúdo salvo e pronto para estudar no AraLearn e me dê o link ao terminar. Trabalhe apenas nesta etapa; as demais ficam para depois.

Resposta capturada em 27/09/2026 às 10:21:33.254 UTC. O export anterior a qualquer feedback preserva a revisão **86**, oito unidades na etapa (duas de ensino, quatro escolhas únicas e duas ordenações), uma Explicação com três recursos. Curso total: 25 microssequências, oito Explicações, 21 unidades, 12/34 componentes. Só a MS8 mudou. Export privado: 36 páginas contíguas, 382.975 bytes, SHA-256 **fe335e737383faa18cfb5cd6816d8a69320376d3aa42a60e40611d4062c238e0**.

A primeira auditoria de agente considerou as sete dimensões de conteúdo consistentes. O parecer foi preservado, inclusive sua limitação: não identificou a ambiguidade de reconvergência encontrada na revisão posterior. A integridade mecânica apresentou zero ocorrências; não é prova de pedagogia nem de aprendizagem.

O [destino retornado](https://fabio-ara.github.io/AraLearn/#/authoring/courses/68d099a5-60d6-4a26-bd93-4a990a4789c3?section=content&authoringPartId=245a98d3-fa84-46bc-83db-a7ef26a670a8) abriu as oito unidades na autoria. A sessão de Estudo já aberta conservou indevidamente zero unidades mesmo após reentrada; [antes](estudo-087/ms8-study-087-cache-antes.png) e [após recarga](estudo-087/ms8-study-087-cache-apos-recarga.png). A recarga normal recuperou o conteúdo e preservou 4/21 de progresso. É um defeito de atualização do produto, não do GPT; a investigação gerou correção separada.

## Estudo e interação após a recarga

Explicação inspecionada em [320](estudo-087/ms8-study-087-explicacao-320.png), [390](estudo-087/ms8-study-087-explicacao-390.png), [430](estudo-087/ms8-study-087-explicacao-430.png) e [web](estudo-087/ms8-study-087-explicacao-1280.png). Na Unidade, o fluxograma em tela inteira permitiu pan até a direita (53 px, conteúdo 417 em viewport 364), redução e aumento de zoom. Na Explicação em 320, duas reduções deram visão global (SVG 274 em viewport 294). Fechar cada sobreposição devolveu o foco ao respectivo acionador.

A ordenação foi exercitada: Levar antes de Retirar → [erro](estudo-087/ms8-study-087-ordering-errada-320.png) → tentar de novo → reconstruir a ordem com [foco inteiro](estudo-087/ms8-study-087-ordering-foco-320.png) → [acerto e feedback específico](estudo-087/ms8-study-087-ordering-correta-390.png) → avanço para a prática seguinte. Home e nova recarga confirmaram **5/21**: uma unidade acrescentada às quatro previamente concluídas. Não se atribui conclusão às unidades apenas visitadas.

## Revisão posterior com imagens reais

Em **2026-09-27T10:36:59.646Z**, duas capturas foram realmente anexadas ao mesmo chat: [fluxograma com zoom reduzido](estudo-087/ms8-study-087-fluxograma-zoom-out-390.png) e [ordenação com feedback](estudo-087/ms8-study-087-ordering-correta-390.png).

> Estas são duas telas reais da etapa no telefone: a visão geral do fluxograma depois de diminuir o zoom e a atividade de ordenação com o retorno após o acerto. Releia o que ficou salvo como autor e educador: a explicação prepara uma pessoa iniciante para essas tarefas? As respostas realmente mostram se ela sabe escolher um caminho e reconstruir uma ordem? Quero sua avaliação crítica: diga o que manteria, o que ajustaria e por quê. Se identificar uma falha didática concreta, corrija apenas esta etapa pelas ferramentas e confira o resultado salvo. Pode discordar de uma impressão visual quando houver uma boa razão pedagógica. Esta inspeção é autônoma e não deve ser registrada como aprovação humana.

O GPT manteve as práticas de ordem e a progressão cotidiana e corrigiu a reconvergência do pagamento: aprovação termina com pedido em preparação; recusa termina aguardando nova tentativa. A comparação independente dos exports **86→89** confirmou alteração apenas da Explicação e das unidades 1, 2 e 4 da MS8, com texto, exemplo, alternativas e feedback coerentes. As outras 24 microssequências, parâmetros e declarações das 21 unidades permaneceram iguais. Export rev89: 383.705 bytes, SHA-256 **2095d95f1838ae98d0b786503b9e3d20fd71bbab0135fe20910442b26d2d01ef**.

A correção remove uma ambiguidade relevante; reconvergência por si só não significa aprovação automática. A alegação mais forte do GPT não foi aceita sem essa ressalva. A presença final das aplicações foi confirmada, sem atribuir prova a uma sequência intermediária de restauração não observada. Configuração aplicada não prova realização por si só. A primeira produção permanece distinta dessa recuperação.

A abertura do resultado confirmou os finais separados, mas revelou um [ponto órfão gerado pelo renderer](estudo-087/ms8-mcp-087-fluxograma-corrigido-web.png). A descoberta e a correção técnica são da engenharia; não foram creditadas ao GPT nem apresentadas aqui como já resolvidas.

Na primeira janela fechada, o diagnóstico contou 117 requisições ao endpoint MCP (78 HTTP 200, 39 HTTP 202), sem filtro por user-agent. Não equivale a 117 operações semânticas nem garante ausência de erros JSON-RPC. Pedido pelo plugin, materialização e releitura são as provas complementares do canal real. Exports da raiz e leitura de logs são diagnóstico, sem autoria HTTP.

Nenhum resultado desta intervenção constitui validação humana pós-correção. Todas as unidades e a Explicação continuaram em rascunho, sem revisão humana. Inspeção autônoma não comprova eficácia de aprendizagem ou causalidade geral para H010–H012.
