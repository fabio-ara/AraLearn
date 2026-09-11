# Revisão e correções do curso

Revisar um curso significa inspecionar o conteúdo salvo, localizar uma questão
factual, pedagógica ou editorial e examinar o percurso necessário para corrigi-la.
O trabalho pode começar na explicação compartilhada de uma microssequência, em
uma unidade de estudo, numa fonte ou numa observação. O [modelo
didático](modelo-didatico.md) distingue a base explicativa da sequência de
atividades e explicações que a mobiliza durante o estudo.

A assistência de inteligência artificial (IA) pode comparar versões, analisar fontes e propor correções.
A pessoa autora orienta o trabalho, decide as mudanças substantivas e inspeciona
o resultado. Autorizar uma correção e declarar que o conteúdo foi revisado são
decisões distintas; a [declaração de revisão
humana](explicacao-e-revisao-humana.md) registra a segunda sobre o conteúdo salvo.

## O ciclo de revisão

1. Inspecione a explicação ou unidade e suas fontes.
2. Registre ou consulte as observações pertinentes.
3. Prepare a revisão, incluindo os pontos do percurso que podem ser afetados.
4. Examine a proposta e resolva as decisões ainda abertas.
5. Aplique as correções autorizadas e releia o resultado e a fila.
6. Declare a revisão quando tiver concluído sua inspeção.

Uma [observação](observacoes-pedagogicas.md) registra um apontamento sem alterar
o conteúdo. Cada explicação e unidade mantém uma fila com entradas identificadas
e com versões: editar o texto cria uma versão da mesma entrada, preservando
sua identidade e sua pendência. Selecionar várias unidades cria uma entrada
separada em cada alvo.

Antes de propor mudanças, o assistente usa `preparar_revisao` para reler o
conteúdo, as observações abertas e o contexto pedagógico pertinente. Quando a
resposta é paginada, precisa terminar as continuações necessárias à análise.
A proposta identifica o problema e o conjunto que precisa mudar. Correções já
incluídas no pedido podem prosseguir; uma decisão substantiva ainda não
autorizada volta à pessoa autora.

## Contexto pedagogicamente afetado

O alvo anotado não determina sozinho o alcance da análise. Uma mudança pode
exigir reler unidades anteriores e posteriores quando atingir conhecimentos
prévios, transições, exemplos ou práticas que dependem da explicação alterada.
Fontes e parâmetros do recorte também fazem parte dessa conferência.

O assistente deve propor o menor conjunto coerente de mudanças. Unidades lidas
como contexto podem permanecer intactas. Outras podem precisar de uma transição
melhor, de divisão ou de reunião quando a distribuição do conteúdo prejudicar
a compreensão. A ampliação da leitura não autoriza, por si só, ampliar a escrita.

## Julgamento e validação técnica

O servidor verifica estrutura, autorização, referências e versões. Essas
verificações conseguem recusar uma composição inválida ou uma escrita sobre
conteúdo que mudou, mas a adequação factual, pedagógica e editorial depende da
análise do material e de suas fontes.

Uma representação aceita pelo contrato ainda pode condensar uma relação que
precisa ser ensinada. Por exemplo, um cálculo de média pode mostrar a divisão
correta sem explicar por que o total é dividido pela quantidade de observações.
A revisão localiza essa relação implícita e examina onde desenvolvê-la, antes
da prática que depende dela. A escolha de
[componentes didáticos](componentes-didaticos.md) atende à função do conteúdo;
não há quantidade obrigatória de formatos diferentes.

## Fontes e contestação

A revisão apresenta a referência da fonte, seu papel e a localização do trecho
pertinente. Uma fonte pode sustentar uma afirmação, contextualizá-la, contrastar
uma posição ou fornecer um exemplo. O vínculo precisa expressar o uso feito
naquele conteúdo, conforme [Fontes, citações e referências](fontes-e-citacoes.md).

A pessoa pode corrigir os metadados, ajustar a localização, mudar o vínculo ou
retirar a fonte. Identificar a obra e localizar o trecho torna a atribuição
verificável; avaliar a qualidade da fonte e o apoio que oferece à afirmação é
outra parte da revisão. A conferência da fonte atribuída à pessoa autora exige
sua declaração expressa.

## Parâmetros e próxima revisão

A preparação consulta os parâmetros e as orientações efetivos do recorte.
Escolhas automáticas precisam de valores e motivos adequados ao conteúdo;
fixações da autoria e condições de pesquisa permanecem protegidas. A
[configuração corrente](desenho-instrucional-parametrizado.md) orienta o próximo
trabalho, enquanto a configuração aplicada registra as escolhas que produziram
o material existente.

Uma correção focal preserva o que o pedido não pretende alterar. Mudar uma
preferência não reescreve automaticamente unidades anteriores. Alvos de palavras
orientam a extensão, sem justificar a retirada de uma explicação, exemplo ou
prática necessários. Se a unidade estiver densa demais, reveja sua organização
e sua relação com o restante do percurso.

## Aplicação e reinspeção

`aplicar_correcoes` aceita unidades, explicações ou ambas num conjunto coerente.
`salvar_explicacoes` permite corrigir apenas as bases e suas fontes, preservando
as unidades existentes. O serviço identifica os alvos e verifica a
revisão corrente antes de gravar.

Quando uma correção atende a observações, `observacoesTratadas` identifica as
versões exatas que foram integralmente atendidas. A retirada dessas pendências
exige confirmar a gravação e reler o conteúdo e a fila. Entradas vagas,
conflitantes, parcialmente atendidas ou editadas durante o trabalho permanecem
pendentes. Ler uma entrada, responder no chat ou iniciar a tentativa não basta
para tratá-la.

Se a resposta se perder, `retomar_correcao` recupera a tentativa original e
reconcilia o recibo, o conteúdo e a fila. A operação confirma os efeitos já
persistidos, sem reaplicar a alteração para retirar uma pendência. Os detalhes
da referência de recuperação estão em [Autoria pelo
MCP](autoria-mcp.md#fontes-observações-e-revisão).

Depois, reinspecione o percurso corrigido. A confirmação técnica prova que a
alteração foi salva; a leitura permite avaliar se ela resolveu o problema.
Considerar uma observação tratada não declara revisão humana. A marca de revisão só é
registrada ou retirada por uma decisão expressa da pessoa sobre o conteúdo
inspecionado, e uma mudança material a desatualiza.

O AraLearn conserva o conteúdo, a configuração, as fontes e as observações
necessários ao trabalho corrente. Para preservar uma versão como artefato de
pesquisa ou recuperação, faça uma exportação explícita; a conversa não constitui
um arquivo permanente de todas as versões do curso.

## Na interface e na conversa

Na área **Conteúdo**, os controles da explicação e da unidade dão acesso às
observações e às fontes. A pessoa pode voltar a uma unidade anterior, selecionar
várias unidades e conferir o contexto. **Dados de autoria** apresenta medidas do desenho
e das intervenções registradas; seus [indicadores](analytics-instrucionais.md)
não substituem a inspeção.

Os canais [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md) ligam
um assistente externo às tarefas de autoria. Para revisão e correção, oferecem:

| Tarefa | Efeito |
| --- | --- |
| `consultar_observacoes` | lê a fila pertinente |
| `registrar_observacao` | acrescenta uma entrada à explicação ou às unidades escolhidas |
| `editar_observacao` | altera a versão inspecionada de uma entrada e mantém a pendência |
| `preparar_revisao` | reúne conteúdo literal, fontes e contexto sem alterar o curso |
| `salvar_explicacoes` | produz ou corrige bases e fontes, preservando as unidades |
| `aplicar_correcoes` | grava o conjunto de correções autorizado |
| `retomar_correcao` | reconcilia a tentativa original e as pendências atendidas |
| `declarar_revisao` | registra ou retira a declaração humana sobre o conteúdo inspecionado |

Na conversa, o resultado deve permitir localizar o conteúdo corrigido e saber
quais questões continuam abertas. A pessoa pode solicitar o texto integral
salvo para conferência, além de abri-lo no aplicativo. Uma síntese do trabalho
é útil para retomar a coordenação; a inspeção depende do próprio material.
