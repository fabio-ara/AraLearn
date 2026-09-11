# Observações e anotações ancoradas

Uma dúvida ou sugestão precisa conservar o ponto do curso que a motivou. No
AraLearn, cada observação fica ligada a um objeto identificável — por exemplo,
uma explicação, unidade ou fonte. Por essa ligação, o registro é chamado de
**anotação ancorada** no modelo de dados. A interface reúne esses registros em
**Observações**.

O texto permite que o proprietário examine a questão, responda e, quando
necessário, proponha uma correção. Registrar uma observação mantém o conteúdo
do curso como estava; a alteração depende do
[ciclo de revisão e correção](auditoria-de-conformidade-instrucional.md).

## O que o registro contém

Cada observação conserva o texto, a categoria, o alvo e seu caminho curricular.
Também guarda a origem da contribuição, a versão do registro, seu estado e as
informações de autoria e data necessárias à conversa e à privacidade. Uma
resposta do proprietário permanece associada à mesma observação.

O modelo admite curso, módulo, lição, tópico, microssequência, explicação,
unidade de estudo, fonte e âncora de fonte, conforme a operação e a interface.
A âncora de fonte localiza um trecho do material consultado; esse conceito é
desenvolvido em [Fontes, citações e referências](fontes-e-citacoes.md).
Editar o registro conserva sua identidade e cria uma nova versão.

## Categorias

As categorias ajudam a organizar a triagem. **Dúvida**, **Possível erro**,
**Trecho confuso**, **Sugestão** e **Pedido de reformulação** descrevem o tipo de
apontamento; **Sem categoria** permite registrar o texto sem classificá-lo.
A categoria pode ser corrigida depois sem apagar o texto ou trocar seu alvo.

Uma categoria expressa a interpretação de quem registrou a observação.
**Possível erro** exige conferência do conteúdo e das fontes. A ausência de
observações tampouco demonstra compreensão.

## Registrar durante o Estudo

Entre numa conta com acesso ao curso. Na unidade, abra **Observações**, escreva
o apontamento e use **Enviar observação**. Podem existir várias entradas suas
no mesmo alvo. O campo aceita até 2.000 caracteres Unicode e verifica também o
limite de 16 KiB do texto transmitido.

O rascunho permanece no dispositivo até a confirmação. Se a conexão cair, a
fila própria de observações conserva o envio, separadamente do progresso.
O [guia do estudante](guia-estudante.md#escolher-quando-sincronizar) explica a
sincronização automática e manual.

Cada estudante vê somente seus registros. O proprietário recebe a caixa de
entrada do curso para fazer a triagem; outros estudantes não recebem o texto.
Visitantes podem estudar cursos públicos, mas precisam entrar numa conta para
enviar observações.

Retirar uma observação remove-a da consulta corrente, conforme as regras de
[retenção e privacidade](privacidade.md). Se a questão continuar relevante
depois de uma mudança no alvo, registre-a sobre o conteúdo atual.

## Registrar durante a Autoria

Em **Conteúdo**, a pessoa autora pode registrar uma observação na unidade focal
ou selecionar várias unidades quando o mesmo apontamento se aplica a todas.
A seleção cria uma entrada independente por alvo. Cada uma pode receber
resposta, ser resolvida ou retirada separadamente; a seleção não cria um novo
lote de produção.

A explicação compartilhada também tem sua própria fila. Um apontamento sobre
a base inteira pertence a ela; um problema restrito ao enunciado ou ao retorno
de uma prática pertence à unidade. Essa escolha conserva o objeto que precisará
ser relido antes de uma correção.

## Caixa de Observações

A caixa autoral permite filtrar e abrir o detalhe dos registros. As ações de
responder, considerar, resolver, reabrir, editar ou retirar dependem da permissão
e do estado. O link do objeto retorna ao alvo enquanto ele estiver acessível.

| Estado | Significado |
| --- | --- |
| Aberta | O apontamento permanece pendente de consideração. |
| Considerada | O proprietário registrou que considerou a contribuição. |
| Resolvida | A triagem foi encerrada. |
| Retirada | A contribuição saiu da consulta corrente. |

Encerrar a triagem pode significar responder uma dúvida ou concluir que nenhuma
alteração é necessária. O estado, sozinho, não comprova correção do conteúdo.

## Da observação à revisão

O assistente conectado relê as observações pertinentes, o alvo e seu contexto
antes de propor mudanças. Unidades anteriores ou posteriores podem ser
necessárias para examinar progressão, pré-requisitos, exemplos, práticas e
fontes. A proposta distingue os objetos usados para compreender o problema
daqueles que serão alterados.

Depois da decisão humana, a correção é aplicada e o resultado salvo é relido.
Na fila autoral de explicações e unidades, somente as versões expressamente
vinculadas à correção confirmada são tratadas. Ler, responder ou iniciar uma
tentativa não consome a pendência. Versões editadas depois da preparação,
conflitos e partes não atendidas continuam na fila.

Nos canais [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md),
`preparar_revisao` obtém o contexto, `aplicar_correcoes` grava a alteração
aprovada e `retomar_correcao` reconcilia uma tentativa cujo resultado ficou
incerto. A retomada confere o conteúdo e a fila sem reaplicar a correção.
Editar o texto de uma entrada, por `editar_observacao`, conserva a pendência.

Tratar uma observação não declara que a pessoa revisou todo o objeto. A
[revisão autoral](explicacao-e-revisao-humana.md#revisão-independente-por-objeto)
é uma declaração humana separada sobre a explicação ou unidade salva.

## Relação com fontes

Uma observação pode contestar uma obra ou uma localização específica. A revisão
precisa consultar a referência, o papel atribuído e o trecho pertinente. Conforme
o problema, pode ser necessário corrigir metadados, ajustar a localização ou
alterar o vínculo com o conteúdo.

O apontamento motiva a conferência; ele próprio não se torna evidência
bibliográfica. A sustentação factual continua dependendo do material
consultado e da relação efetiva com a afirmação didática.

## Privacidade e minimização

Registre somente o necessário para compreender o problema. Evite dados pessoais
de terceiros e trechos de obras maiores que a finalidade e os direitos de uso
permitem. O acesso e a retenção seguem a [política de privacidade](privacidade.md).

A observação não armazena a conversa inteira do assistente. Na revisão
conversacional, o conector fornece o recorte autorizado necessário ao trabalho.
O resumo devolvido pode encaminhar ao conteúdo salvo sem reproduzi-lo no chat.

## Analytics e pesquisa

A área **Dados de autoria** apresenta contagens de observações criadas, abertas e resolvidas no escopo quando
esses estados são atribuíveis. Essas contagens descrevem contribuições e
triagem; não medem qualidade, engajamento ou aprendizagem.

Uma investigação pode analisar observações com protocolo, consentimento,
minimização e regras de interpretação próprios. Uma frequência maior pode
refletir mais problemas, maior disposição para contribuir ou uma tarefa
diferente. A contagem isolada não distingue essas explicações. Consulte
[Analytics da Autoria](analytics-instrucionais.md) e o
[guia de investigação](guia-pesquisador.md).
