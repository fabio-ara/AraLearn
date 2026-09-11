# Como preferências e decisões orientam a autoria

A pessoa autora pode escolher como conversar com o assistente, organizar a
produção e inspecionar o resultado. Essas preferências ajudam a iniciar um
trabalho, enquanto as decisões do curso orientam o conteúdo daquele curso. Ao
retomar uma produção, também importa saber o que havia sido combinado e quais
escolhas foram efetivamente aplicadas às unidades já salvas.

O aplicativo conserva esses registros separadamente:

| Registro | Pergunta que permite responder |
| --- | --- |
| Preferência pessoal | Como a pessoa prefere iniciar trabalhos de autoria? |
| Configuração corrente | Quais decisões se aplicam agora a este curso ou recorte? |
| Acordo de processo, chamado de mandato de processo | Como foi combinado conduzir este trabalho em andamento? |
| Configuração aplicada | Quais decisões orientaram a produção desta unidade? |
| Base explicativa aplicada | Qual versão da explicação e de suas fontes foi usada nessa produção? |
| Perfil salvo | Que conjunto de escolhas a pessoa guardou para aplicar expressamente em outro curso? |

O [capítulo de autoria contextual](autoria-contextual.md) relaciona esses
conceitos aos controles da interface e ao catálogo de parâmetros. Uma preferência pode orientar o início de um trabalho sem substituir as
decisões já tomadas para o conteúdo salvo.

## Dimensões independentes

Por exemplo, uma pessoa pode preferir conversar de forma breve e produzir
uma parte de cada vez. O curso, porém, pode exigir explicações extensas e
várias práticas. A concisão da conversa organiza a coordenação com o
assistente; a extensão das unidades depende do que o estudante precisa
compreender. A aplicação dessas escolhas é registrada separadamente.

As preferências ficam em **Configurações → Preferências de autoria**. Na
conversa conectada, as tarefas `consultar_preferencias_autoria` e
`salvar_preferencias_autoria` consultam e alteram as mesmas escolhas da conta,
pelos canais que ligam um assistente externo às tarefas do AraLearn:
[MCP](autoria-mcp.md), protocolo de acesso a ferramentas e contexto, ou
[Actions/OpenAPI](autoria-actions.md), chamadas a operações descritas para o cliente.

| Escolha | Significado |
| --- | --- |
| Foco | **Conteúdo** desenvolve bases explicativas e fontes. **Ciclo completo** inclui também desenho, unidades e revisão no recorte autorizado. |
| Cadência do trabalho | Organiza o trabalho por microssequência, parte ou lote. Tamanhos e frequência de pausa têm escolhas próprias. |
| Pontos de revisão | Indicam onde a pessoa pretende inspecionar: mapa curricular, explicação e unidade de estudo. Pode não haver pontos selecionados; a declaração de revisão permanece uma ação expressa. |
| Parâmetros de diálogo e produção | Definem extensão e forma da conversa, tamanho pretendido das partes e lotes e frequência de pausa. Cada um admite escolha automática ou valor fixo. |

Os cinco parâmetros pessoais são `alvo_palavras_conversa`,
`preferencia_da_conversa`, `alvo_microssequencias_por_parte`,
`alvo_partes_por_lote` e `frequencia_de_pausa`. Suas opções e limites pertencem
ao [mesmo catálogo usado nos cursos](autoria-contextual.md#parâmetros-origem-e-persistência).
Parâmetros sobre explicação, prática ou extensão das unidades ficam ligados ao
curso e aos seus objetos; não integram essa preferência pessoal de processo.

Por exemplo, organizar o trabalho por parte não determina quantas
microssequências ela reúne nem obriga a pausar a cada parte. Da mesma forma,
escolher uma conversa concisa não reduz a explicação necessária ao estudante.
Essas escolhas têm funções diferentes e podem ser combinadas conforme o
trabalho.

Antes da primeira gravação, o aplicativo oferece **Ciclo completo**, cadência
por parte, os três pontos de revisão e os cinco parâmetros em modo automático.
A interface identifica a origem como padrão inicial do aplicativo. Nos dados,
o modo `automatic` com valor `null` indica que a escolha contextual ainda está
em aberto; os números de referência do catálogo não são fixações implícitas.

## Persistência e fronteira de acesso

Salvar preferências confirma escolhas na conta, tornando-as disponíveis na
próxima consulta dos clientes conectados. Isso não reescreve cursos, bases,
unidades ou perfis salvos. Aparência e sincronização pertencem às
[configurações do dispositivo](configuracoes.md).

Cada gravação informa a revisão das preferências que a pessoa estava editando.
Essa revisão é um número de versão dos dados, distinto da revisão autoral de
conteúdo. Se outro acesso tiver salvo alterações, a interface preserva o
rascunho e permite compará-lo com as escolhas da conta antes de continuar.

Uma tentativa de gravação também recebe uma identidade, `requestId`. O
recibo associa essa identidade ao conteúdo enviado e à revisão esperada:
repetir o mesmo pedido recupera seu resultado; reutilizar a identidade com
outros dados é recusado. Salvar novamente uma preferência idêntica não aumenta
a revisão. A primeira gravação distingue uma escolha explicitamente salva do
padrão inicial, mesmo quando seus valores coincidem.

O armazenamento privado mantém um registro por conta, removido com sua
exclusão. O acesso passa pelo serviço, que obtém a identidade da sessão
autenticada e valida os dados. A tabela não admite consulta direta pelos
clientes. Para integrar ou manter esse caminho, a
[implementação das preferências](../supabase/migrations/20260909025429_contextual_authoring_process_preferences.sql)
reúne as funções de leitura e gravação e suas permissões; o capítulo
[Supabase](supabase.md) explica a relação entre autenticação, funções e acesso
aos dados.

Uma cópia local pode apoiar a consulta sem rede quando o cliente a identifica
como tal. A confirmação de uma gravação depende da resposta do serviço ou da
releitura dos dados salvos.

## Resolução com curso e mandato

**Resolver as preferências** significa determinar quais escolhas regem o
recorte atual. Primeiro, o servidor identifica as atribuições aplicáveis do
curso, considerando seu alcance e sua origem. Para os cinco parâmetros de
processo, uma atribuição efetiva do curso prevalece sobre a preferência
pessoal; onde não há atribuição, vale a preferência da conta.

A resolução conserva origem, motivo e alcance. Uma escolha automática já
realizada no curso permanece inspecionável nesse contexto, sem se transformar
em uma preferência pessoal fixa. As regras de prioridade entre decisões de
pesquisa, valores fixos e escolhas de cada nível estão no
[catálogo contextual](autoria-contextual.md#parâmetros-origem-e-persistência).

Um trabalho em andamento pode conservar uma cópia das escolhas combinadas,
chamada de **mandato de processo**. Ela identifica curso, revisão pessoal,
preferências e condições do curso naquele momento. Assim, uma alteração posterior do padrão
pessoal não troca silenciosamente o processo em andamento. O acordo pode
conter uma exceção expressa, como desenvolver somente as bases explicativas de
um recorte. Condições de pesquisa continuam obrigatórias.

Esse registro descreve como conduzir o trabalho. A autorização humana define o
que pode ser feito e a quais objetos ela se aplica. Por exemplo, conservar a
preferência por trabalhar em partes não autoriza produzir a próxima parte nem
declarar sua revisão: essas ações dependem do alcance do pedido da pessoa.

Na continuação, a resolução compara três informações: o acordo preservado, as
preferências que resultariam dos dados atuais e as condições do curso. Uma
mudança pessoal é informada para que possa ser incorporada expressamente.
Uma mudança nas condições do curso ou um conflito exige conciliação antes de
continuar; o acordo anterior permanece disponível para inspeção. Uma simples
edição de texto em outro campo do curso não equivale a mudar suas condições
de processo.

Nos canais conversacionais, `referenciaProcesso` permite retomar esse acordo
nas tarefas que aceitam o campo `processo`. É uma referência emitida pelo
serviço: o cliente a devolve integralmente, conforme o
[contrato dos canais](aralearn-contract.md). Ela identifica o processo
preservado; a autorização para produzir e a declaração de revisão humana
continuam sendo decisões com seus próprios alcances.

Para quem integra um cliente, o contrato
`aralearn.authoring-process-resolution.v1` apresenta `preferences` para o
acordo vigente, `currentPreferences` para a resolução atual e
`courseConditions` para as condições que o justificam. Os indicadores de
mudança e conflito permitem mostrar o que precisa ser conciliado.
[authoringProcessPreferences.js](../src/domain/authoringProcessPreferences.js)
valida esses registros e cria a cópia do acordo; o fluxo que a utiliza conserva
sua referência. Um [perfil salvo](configuracoes.md) é independente desse acordo:
sua aplicação copia escolhas para um curso.

## Calibração da configuração aplicada

A **calibração** explicita os valores escolhidos para parâmetros automáticos
e os motivos da escolha diante do conteúdo. Se uma unidade precisa desenvolver
uma relação nova, por exemplo, a autoria decide quais formas explicativas são
pertinentes e registra essa decisão. Valores fixados pela pessoa autora e
condições de pesquisa são preservados pelo servidor.

Mudar uma intenção instrucional orienta a próxima produção. Para relacioná-la
às unidades existentes, `aplicar_configuracao_instrucional` registra
expressamente a configuração aplicável ao recorte inspecionado. A operação
preserva o texto e a base explicativa aplicada; uma diferença material de
desenho pode deixar a declaração anterior de revisão desatualizada.

O alcance também importa: os três parâmetros de
cadência exclusivos do curso mantêm essa origem, enquanto escolhas
contextuais admitidas na unidade podem ter alcance local.

Valores, motivos e origens são validados em conjunto antes de salvar. Se uma
escolha for incompatível, a operação é desfeita integralmente, conservando o
estado anterior. As [tarefas de desenho](autoria-mcp.md#tarefas-disponíveis)
apresentam os comandos disponíveis; o
[teste transacional de desenho](../supabase/tests/030_contextual_design_test.sql)
permite verificar essas regras no ambiente local.

## Base explicativa aplicada às unidades

A explicação pode mudar depois da produção de uma unidade. Para distinguir a
base usada naquela produção da base disponível hoje, cada unidade pode guardar
um registro de **base explicativa aplicada**. Esse registro identifica a
microssequência, sua versão e uma impressão digital, ou *hash*, dos dados
relevantes: conteúdo, relações, dependências, fontes e arquivos.

O contrato `aralearn.applied-explanation-basis.v1` usa `microsequenceId` para
identificar a microssequência, `entityVersion` para sua versão e `basisHash`
para essa impressão digital. O hash permite reconhecer a base salva usada;
a inspeção de sua adequação intelectual e pedagógica depende da pessoa autora.
Quando o registro está ausente, o sistema conserva essa ausência em vez de
deduzir uma aplicação a partir da explicação atual.

A gravação das unidades captura a base após salvar a explicação e suas fontes,
na mesma transação: todas essas mudanças se confirmam ou são desfeitas juntas.
A base precisa estar completa e a unidade precisa pertencer à microssequência
indicada. Recuperar o recibo da tentativa conserva o resultado já salvo.

| Ação posterior | Efeito sobre a base aplicada |
| --- | --- |
| Editar manualmente a unidade | Conserva o registro da produção anterior. |
| Editar a explicação ou suas fontes | Conserva a base aplicada às unidades existentes, permitindo distinguir o estado anterior do atual. |
| Produzir expressamente as unidades de novo | Substitui o registro pela base salva que rege a nova produção. |
| Copiar o curso com autorização | Conserva a base aplicada e identifica o curso de origem. |
| Exportar a autoria | Transporta a proveniência separadamente do conteúdo importável. |

A base aplicada participa da identificação do conteúdo inspecionado na revisão
autoral. Reaplicar uma base diferente pode desatualizar essa revisão, mesmo
quando o texto da unidade permanece igual. A mudança desse registro é
contabilizada no curso sem incrementar, por si só, a versão textual da unidade.
A [revisão por objeto](explicacao-e-revisao-humana.md) relaciona essas mudanças à
nova inspeção humana.

Na cópia, `sourceCourseId` registra onde ocorreu a aplicação original; cópias
sucessivas conservam essa origem. A identificação não afirma que os dados do
destino são idênticos, pois seus identificadores ou arquivos disponíveis podem
diferir. Uma produção posterior no destino registra a nova base local.

Na exportação, `artifact.appliedExplanationBases` reúne pares de unidade e base
com a origem explícita. Esse campo vem dos registros confirmados pelo servidor,
fora do documento de conteúdo. A importação de texto não pode declarar que uma
base foi aplicada nem atribuir revisão humana. A
[definição do metadado](../src/domain/appliedExplanationBasis.js) especifica seu
formato; as [regras de persistência](../supabase/migrations/20260909030823_contextual_applied_explanation_basis.sql)
limitam sua gravação à produção e à cópia autorizada.

## Como verificar as preferências e a base aplicada

Os [testes de preferências](../tests/runtime/authoring-process-preferences.test.js)
verificam a independência das escolhas e a resolução entre conta, curso e
acordo preservado. Os [testes de persistência](../tests/runtime/authoring-process-preferences-pglite.test.js)
verificam o isolamento por conta, os conflitos de versão e a recuperação de
uma tentativa de gravação.

Para a base aplicada, os [testes do contrato](../tests/runtime/applied-explanation-basis.test.js)
verificam formato, ausência de registro e origem na exportação. Os
[testes de gravação](../tests/runtime/applied-explanation-basis-pglite.test.js)
exercitam captura, preservação em edições, reaplicação, cópias sucessivas e
reversão de operações inválidas. Esses testes usam dados controlados em um
banco local e algumas dependências substituídas para isolar as regras. A
[prova dos canais](prova-local-canais-autoria.md) examina separadamente os
clientes com o serviço local completo.
