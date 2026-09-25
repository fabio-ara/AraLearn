# Fluxos, instruções e contratos

Uma pessoa pode pedir ao assistente que examine uma explicação, proponha uma
mudança ou salve uma correção. Para transformar esse pedido em uma operação,
o assistente precisa reconhecer tanto o conteúdo envolvido quanto a decisão
autorizada. O servidor confere o alvo, o acesso e os dados enviados; a pessoa
confere se o resultado atende ao que pretendia.

Uma instrução em linguagem natural é também chamada de *prompt*. Ela expressa
uma intenção; o **contrato** define os campos aceitos e os efeitos de uma
operação, conforme a [referência dos contratos](aralearn-contract.md). Essa
passagem permite que uma conversa altere um curso de modo verificável.

## Fala humana e estado técnico

Considere o pedido “Este exemplo parece confuso; podemos usar outro?”. Ele abre
uma discussão. Depois de examinar o conteúdo salvo, o assistente pode apresentar
uma alternativa. Já “Substitua o exemplo por este caso e preserve a atividade”
autoriza uma alteração delimitada. A distinção entre discutir e aplicar depende
do pedido e das decisões anteriores da pessoa.

O assistente associa a intenção aos objetos do [modelo didático](modelo-didatico.md):
mapa curricular, explicação ou unidades de estudo. A explicação é o texto-base
da microssequência, com suas fontes; as unidades organizam a apresentação e a
prática. Corrigir a explicação pode exigir examinar também unidades que dependem
dela, mas essa análise não autoriza alterações fora do trabalho acordado.

A orientação de funcionamento fornecida ao cliente fica em
[courseKnowledge.js](../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js).
Ela ajuda o assistente a selecionar tarefas e contexto. O servidor aplica as
regras verificáveis de acesso, formato e gravação; avaliar a clareza, a
progressão e a sustentação pelas fontes continua exigindo julgamento pedagógico
e inspeção humana.

## Uma autoridade, três entradas

O curso salvo no servidor é compartilhado pelas três formas de acesso. A
interface oferece campos e controles. O [Model Context Protocol (MCP)](autoria-mcp.md)
permite a clientes de IA descobrir e chamar ferramentas. [Actions](autoria-actions.md)
é a forma de acesso do cliente externo atualmente usado para esses testes;
suas operações são descritas em OpenAPI, um formato de especificação de APIs.
Uma API é uma interface pela qual programas enviam pedidos a outros programas.

Cada entrada chega às mesmas regras de autoria. O canal muda a forma de enviar
o pedido, mas o curso, os direitos de acesso e o significado da alteração
permanecem. A configuração específica de cada cliente está nos respectivos
guias de canal.

## Tarefas conversacionais

Uma **tarefa** corresponde a um trabalho delimitado, como consultar fontes ou
salvar uma explicação. O [catálogo compartilhado](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js)
relaciona essas tarefas aos argumentos e resultados aceitos. Uma consulta reúne
informações; uma operação de escrita pode modificar o estado salvo.

| Trabalho | Leituras principais | Operações que alteram o curso |
| --- | --- | --- |
| planejar | `consultar_planejamento` | `salvar_mapa_curricular`, `salvar_ramo_curricular`, `aprovar_mapa_curricular` |
| desenvolver a explicação | `consultar_planejamento`, `preparar_revisao` | `salvar_explicacoes` |
| produzir unidades | `preparar_materializacao` (consulta antecipada opcional) | `salvar_parte`, `materializar_parte` |
| ajustar escolhas | `consultar_configuracao` | `ajustar_configuracao` |
| corrigir material | `consultar_observacoes`, `preparar_revisao` | `aplicar_correcoes`, `retomar_correcao` |
| conferir fontes | `consultar_fontes` | `manter_fonte`, `incorporar_pdf_como_fonte` |
| declarar revisão humana | `preparar_revisao` | `declarar_revisao` |

A [referência completa](autoria-mcp.md#tarefas-disponíveis) abrange as demais
etapas do ciclo autoral, dos perfis ao controle de acesso. Perfil público,
avatar e exclusão da conta permanecem na interface autenticada.

## Seleção progressiva de contexto

Para corrigir um exemplo, o assistente precisa ler seu texto, suas fontes e as
atividades que podem depender dele. Para aprovar um mapa, precisa recuperar o
mapa completo. O contexto é escolhido conforme a decisão: a quantidade de
conteúdo necessária varia com o trabalho.

| Leitura | Conteúdo necessário à decisão |
| --- | --- |
| planejamento | mapa completo por continuação; com parte ou microssequência indicada, somente o ramo e as dependências pertinentes |
| preparação de materialização | lote, explicações salvas, repertório, configuração e fontes pertinentes |
| configuração | escolhas aplicáveis, sua origem e registros da produção anterior |
| observações | entradas pendentes da explicação ou das unidades selecionadas |
| preparação de revisão | conteúdo e percurso que a correção pode afetar |
| fontes | página do catálogo, fonte selecionada ou vínculos de um conteúdo |
| componentes | candidatos adequados à função e contrato do componente escolhido |

`retomar_curso` também conserva o recorte de `parte` ou `microssequencia`, sem acrescentar o mapa inteiro à retomada focal. Para apenas conferir a situação do planejamento e recuperar sua referência vigente, `consultar_planejamento` aceita `resumo: true`. Essa leitura pequena não contém o mapa e não comprova sua inspeção.

Uma resposta pode conter apenas parte desses dados. A **continuação** é uma
referência devolvida pelo serviço para obter a parte seguinte do mesmo recorte.
O cliente a reutiliza sem interpretar nem editar seu valor. A leitura só está
completa quando todas as partes necessárias foram recuperadas. Se o curso mudar
entre páginas, o serviço exige reiniciar a leitura para preservar uma versão
coerente. A [reconstrução dos fragmentos](aralearn-contract.md#continuação-e-reconstrução-do-conteúdo)
explica os formatos e as posições usados nessa transferência.

Os dados podem permanecer estruturados para o assistente, enquanto a resposta
à pessoa apresenta o resultado e um link de inspeção. Quando a pessoa pede o
texto literal ou a configuração completa, o recorte precisa ser devolvido
fielmente; qualquer trecho indisponível permanece identificado. O tamanho da
resposta na conversa e a profundidade do material didático são escolhas distintas.

## Mapa curricular e bases explicativas

O mapa relaciona a finalidade e o público do curso ao que precisa ser ensinado,
aos conhecimentos de entrada e à ordem do percurso. Pode ser desenvolvido por
ramos e salvo como rascunho. A pessoa inspeciona a hierarquia completa, com suas
dependências e a cobertura dos conteúdos obrigatórios, e declara a aprovação da
versão que examinou.

Para construir um mapa extenso nos canais, `salvar_mapa_curricular` recebe primeiro público, pré-requisitos e todos os itens de escopo, com `modulos: []`. Esse início só é aceito enquanto o mapa não contém módulos. Em seguida, `salvar_ramo_curricular` acrescenta cada módulo, suas lições e suas microssequências, em ordem de dependência. Em Actions, essa tarefa está no grupo `estrutura_curricular`. Dependências, cobertura e fontes previstas usam as referências humanas do planejamento salvo.

Ao concluir `materializar_parte`, o link de resultado abre Conteúdo com o recorte
da parte produzida. A expressão “revisar a parte” na conversa conserva esse
destino. A seção de observações é usada para inspecionar apontamentos, enquanto
a declaração de revisão se refere a cada objeto salvo e à sua base pertinente.

Cada chamada conserva o conteúdo integral do objeto. Campos independentes podem ser acrescentados em chamadas posteriores, pois a edição de ramo preserva os campos omitidos. Dividir o trabalho dessa forma evita exigir a árvore inteira numa única chamada; não autoriza resumir objetivos, explicações ou relações para satisfazer o transporte. `salvar_mapa_curricular` com módulos preenchidos continua sendo uma substituição completa, não uma forma de acrescentar somente o próximo ramo. Ao terminar, o assistente consulta todas as páginas do planejamento completo e apresenta a versão salva para inspeção. Um rascunho ainda sem ramos ou com cobertura pendente não está pronto para aprovação.

A resposta de `salvar_mapa_curricular` confirma a persistência com `revisaoDoCurso`, `situacao` e `referenciaParaAprovar`, sem repetir a árvore do curso. Se essa resposta se perder, o assistente usa `consultar_planejamento` com `curso` e `resumo: true` para recuperar a situação e a referência vigentes antes de decidir se falta alguma escrita. A referência recuperada não substitui a inspeção do mapa nem autoriza aprová-lo sem a decisão explícita da pessoa. MCP e Actions usam o mesmo comportamento.

A explicação pode ser desenvolvida numa microssequência existente enquanto o
mapa ainda está em rascunho e antes de haver unidades. No foco **Conteúdo**, a
explicação e suas fontes podem constituir o resultado completo do trabalho. No
**Ciclo completo**, essa base sustenta também o desenho e a produção das
unidades. O [guia de autoria por conversa](criar-cursos-pelo-chat.md) apresenta
as decisões que a pessoa toma nesse percurso.

Depois de salvar explicações, o retorno identifica cada base em `context.explicacoes`, com seu título e link de inspeção. O `deepLink` principal abre a primeira microssequência afetada na seção Conteúdo, onde a explicação pode ser lida mesmo antes das unidades. O assistente usa os endereços retornados; a seção `review` reúne observações e não substitui a leitura das bases.

A aprovação do mapa, a autorização para produzir e a revisão do conteúdo têm
objetos diferentes. A primeira confirma a organização examinada; a segunda
delimita o trabalho a executar; a terceira registra a inspeção humana de uma
explicação ou unidade já salva. Aprovação e pedido de produção podem vir na
mesma mensagem. A revisão de conteúdo futuro depende de sua produção e
inspeção posteriores.

## Produção incremental por partes

Uma **parte** reúne microssequências existentes para organizar a produção de
unidades. É um agrupamento de trabalho, separado da hierarquia curricular. No
aplicativo, **Reorganizar lotes** oferece divisão, reunião e reordenação com uma
prévia. Nos canais, essa organização usa `salvar_parte`, com referências às
microssequências e a progressão pretendida.

O trabalho autorizado pela pessoa é chamado de **mandato**. Ele delimita o
escopo, os lotes e as restrições. O tamanho dos agrupamentos e a frequência de
pausas são escolhas independentes: é possível produzir vários lotes em
continuidade ou discutir cada um antes de prosseguir. Escolhas rotineiras já
abrangidas pelo pedido não criam uma nova aprovação; mudanças relevantes ainda
não decididas voltam à pessoa. Sem continuidade autorizada, a produção termina
ao entregar o primeiro lote. Confirmações de segurança próprias do cliente
continuam aplicáveis.

Antes da escrita, a Explicação salva é reconciliada por passagens com o repertório persistido. Cada ensinamento é identificado como introdução, conhecimento estabelecido, retomada, exemplo, apoio ou dependência adiada com destino. O inventário inclui as relações necessárias: seis ensinamentos sob teto dois precisam aparecer no percurso completo, sem desaparecer em um tópico agregado.

`preparar_materializacao` é uma consulta antecipada opcional. Recebe `plano`,
uma declaração compacta das unidades, e confere conjuntamente repertório,
vínculos, requisitos, formas, componentes, fontes, práticas e cobertura.
Sem `referenciaPreparo`, `materializar_parte` faz essa verificação internamente
com o conteúdo solicitado antes de gravar. Um resultado `blocked` agrega as
causas previsíveis para correção. Quando fornecida, a referência explícita de
preparo deve corresponder à base, configuração e intenção correntes.

O contrato de autoria corrente é o catálogo **8.0.0**. `materializar_parte`
recebe o foco de **uma microssequência** e somente unidades novas ou
explicitamente alteradas desse foco. A parte é resolvida pelo servidor; ela
continua sendo agrupamento operacional, não alvo pedagógico. IDs de instâncias,
versões correntes e posições finais podem ser omitidos e são derivados pelo
servidor. `unidade` identifica uma existente a substituir; sua ausência cria
uma nova. Unidades omitidas permanecem e podem ser deslocadas sem reenvio do
conteúdo. `concluir: false` conserva produção parcial; `concluir: true` verifica
a cobertura do acumulado salvo e solicitado. Explicações salvas são
reutilizadas; `explicacoes` contém somente bases criadas ou alteradas.

Prática nova tem resposta avaliável e feedback explicativo local, utilizáveis
offline. `gap.text` serve para respostas curtas e canônicas, com equivalentes
explícitos; comparação literal não substitui avaliação semântica de uma
redação.

### Conservar o acordo durante a retomada

Uma mudança nas preferências pessoais não deve alterar silenciosamente um
trabalho em andamento. `retomar_curso` e `preparar_materializacao` devolvem
`referenciaProcesso`, que conserva o acordo desse trabalho. O cliente envia o
mesmo valor no campo `processo` das próximas chamadas de retomada, preparação e
materialização. Essa referência preserva o acordo existente; a autorização
continua vindo da pessoa.

Os campos `preferenciasMudaram`, `conflitos` e `exigeConciliacao` distinguem uma
mudança nas preferências de uma incompatibilidade com as condições do recorte.
A produção que depende de uma escolha incompatível aguarda sua resolução. Os
[parâmetros de autoria](parametros-de-autoria.md) explicam foco, cadência,
pontos de revisão, diálogo e perfis reutilizáveis.

## Repertório acumulado

O repertório registra os conhecimentos e as operações que o percurso precisa
desenvolver. Uma **unidade de análise instrucional** é um desses recortes; ela
permite reconhecer, por exemplo, que a mesma distinção foi introduzida numa
unidade de estudo e utilizada em outra.
O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md)
explica como delimitar esses recortes.

A preparação distingue três situações: itens cadastrados no curso, itens
planejados para a microssequência e itens já desenvolvidos nas unidades
anteriores. O campo `repertorioDisponivelDoCurso` traz o inventário cadastrado.
Uma lista local vazia pode significar apenas ausência de vínculo naquele ponto.
Reutilizar o item existente conserva sua definição; uma definição incompatível
precisa ser conciliada antes da produção.

A aplicação registrada distingue introdução, uso e retomada de conhecimento.
Um **requisito de evidência** descreve a operação que uma atividade pretende
tornar observável. Uma prática formativa pode existir sem requisito formal;
quando um requisito é necessário, ele pertence ao inventário do curso. Esses
registros descrevem o desenho das oportunidades de aprendizagem.

## Plano, parâmetros e composição

O mapa indica o que ensinar e em que ordem. Os parâmetros orientam como explicar,
praticar e organizar a produção. A composição reúne o conteúdo que será
apresentado nas unidades. As três informações podem ser comparadas para
examinar como uma intenção se realizou no material.

Uma escolha **automática** delega ao assistente a decisão contextual. Antes da
produção, os valores pendentes são definidos conforme conteúdo, público e
função, acompanhados de justificativa. Valores fixados pela autoria e condições
de pesquisa prevalecem. O registro aplicado conserva as escolhas daquela
produção, mesmo se a intenção para trabalho futuro mudar. Os
[parâmetros](desenho-instrucional-parametrizado.md) e seus
[campos técnicos](aralearn-contract.md#campos-de-configuração-nos-canais)
permitem inspecionar essa relação.

O teto de novidades limita quantos recortes de conhecimento uma unidade
expositiva introduz pela primeira vez. Ele não determina um total de unidades:
uma pode precisar desenvolver uma única relação com um exemplo; outra pode
retomar conhecimentos já apresentados. Os alvos de palavras e produção ajudam
a organizar o trabalho, preservando a extensão necessária à explicação e à prática.

## Materialização suficiente

A releitura sequencial examina se cada passagem prepara a seguinte. Uma unidade
que introduz várias relações independentes pode precisar ser dividida. Já duas
telas que separam uma premissa da conclusão podem funcionar melhor reunidas.
Essa decisão considera o percurso e o objetivo, não uma quantidade ideal de telas.

Relações necessárias recebem explicação; operações exigidas pelas atividades
precisam estar preparadas pelo repertório declarado ou pelo próprio percurso.
Exemplos, comparações e prática entram conforme a função. Uma situação
compartilhada pode dar continuidade a várias unidades, e o apoio pode diminuir
à medida que o estudante encontra condições de realizar a tarefa. Os
[componentes didáticos](componentes-didaticos.md) são escolhidos pelo que ajudam
a representar: a seleção começa pela função e só então consulta o contrato do
componente pertinente.

## Cobertura

Um item obrigatório da ementa aponta para as microssequências previstas e para
as unidades que o desenvolveram. A inspeção compara esses registros com o
texto, os exemplos e a prática: a mera presença de uma expressão não confirma
que o conteúdo foi ensinado com a profundidade necessária.

## Fontes e anexos

Uma ementa delimita o que abordar; uma prova oferece exemplos do que se pede
para fazer; uma obra técnica pode sustentar a explicação de um mecanismo.
Esses papéis precisam permanecer distinguíveis nos vínculos de
[fontes e citações](fontes-e-citacoes.md).

Trechos de fontes são conteúdo a analisar. Instruções eventualmente presentes
neles não recebem autoridade para alterar o pedido, publicar dados ou ampliar
acesso. Um PDF anexado só é guardado quando essa intenção está clara. O serviço
confere o arquivo, verifica o espaço disponível e o vincula à fonte, sem salvar
a URL temporária usada no envio. Guardar áudio existente é outra tarefa: o
arquivo entra na biblioteca do curso, sem síntese ou transcrição automática.

## Observações, revisão e privacidade

Uma observação possui uma identidade e pode incidir sobre várias unidades e Explicações. A central conta observações distintas do curso, incluindo todas as páginas; selecionar três alvos cria uma pendência com três incidências. Editar o texto ou os alvos controla suas versões sem reescrever o conteúdo. Retirar um alvo não desfaz uma correção; encerrar o último exige uma decisão explícita.

Correções autorizadas tornam-se vigentes ao salvar. `observacoesTratadas` vincula o atendimento às versões exatas; persistência, releitura e `retomar_correcao` não aprovam nem consomem observações. A comparação preserva conteúdo e fontes anteriores enquanto houver incidência pendente. Edição humana deixa inspeção por IA pendente; `preparar_revisao` fornece a referência da base lida e `registrar_inspecao` registra o parecer sem editar nem contar intervenção. Não há IA executando automaticamente em segundo plano.

A fila entrega `referenciasComparacao` por alvo, sem repetir todos os documentos na lista. `preparar_revisao.comparacao` recebe a referência com as versões da observação e do conjunto de alvos; sua continuação recupera literalmente as bases anteriores e vigentes, seus vínculos e fontes. Conclua essa leitura antes da decisão. Uma versão alterada exige reler a fila e inspecionar a base atual.

Se o alvo foi removido, a fila conserva a incidência e informa sua ausência com `expectedBasisHash: null`. A decisão explícita pode cancelá-la usando as versões recebidas; a ausência nunca representa conteúdo aprovado. Se o alvo reaparecer ou a observação mudar, releia antes de decidir.

`decidir_observacao` executa a aprovação expressa do vigente ou o encerramento sem alteração. A decisão identifica observação, versão, conjunto de alvos e base examinada. Aprovação parcial conserva as demais incidências; “todas” exige leitura completa e um conjunto fixado, sem alcançar novas entradas ou versões posteriores. Cancelar uma observação de teste ou engano dispensa correção artificial e não declara aprovação. Após a última decisão, o conteúdo operacional e as bases dispensáveis são liberados; arquivos ainda usados pelo vigente ou por outra pendência permanecem. A [declaração humana de revisão](explicacao-e-revisao-humana.md) continua distinta dessas decisões.

### Auditoria pedagógica focal

`registrar_inspecao` recebe a referência da base focal lida, seu `basisHash` e
um relatório semântico. O parecer precisa examinar cinco dimensões, cada uma
com justificativa e *quotes* que existam na base salva: `alignment`,
`evidence`, `representation`, `feedback` e `sufficiency`. A implementação
confere identidade, versão, hash, correspondência dos trechos e a necessidade
de atualizar o parecer quando a base muda.

Essa verificação estrutural do relatório não é garantia de qualidade
pedagógica, suficiência ou aprendizagem. A auditoria é uma segunda leitura
semântica; contagem de componentes, schema válido, hash ou relatório
`consistent` não substituem julgamento. Os experimentos com prompts, contratos
e novas materializações continuam em revisão e não têm conclusão geral.

O curso conserva os dados necessários à autoria e ao estudo. Os dados de autoria
derivam desses registros salvos; a conversa permanece na sessão, e o painel não
se baseia em cliques ou tempo de tela. O capítulo de
[privacidade](privacidade.md) distingue as informações do aplicativo das
enviadas aos serviços externos de IA.

Quando a pessoa pede “crie um curso público”, o curso ainda nasce privado. O assistente
conclui o pedido com `definir_visibilidade` e confirma por `consultar_acesso` que o
estado persistido é público antes de anunciar sucesso. Publicar sem outra escolha
disponibiliza os arquivos por padrão; uma restrição explícita pode ser indicada no
curso, e as exceções de fonte e arquivo permanecem. Em Actions, essas tarefas usam
o grupo `acesso_do_curso`, cada uma com seus próprios argumentos.

Se o conteúdo novo ou alterado contém `audio`, a materialização, o
compartilhamento e a publicação exigem que cada faixa seja um arquivo ativo,
com tamanho, tipo e hash conferidos e acesso compatível. Voz nativa continua
um ensaio de reprodução do dispositivo e não satisfaz essa guarda. Consulte
[Áudio](audio.md) para o comportamento do player e dos arquivos.

## Confirmar o resultado e recuperar uma interrupção

Uma falha de resposta pode ocorrer depois de a gravação terminar. O serviço
associa a tentativa a um **recibo**, registro que permite recuperar seu resultado.
Antes de repetir a operação, o cliente relê o conteúdo e o recibo correspondente.
A recuperação conserva alvo, alteração e identidade originais; uma nova
identidade criaria outro pedido e poderia duplicar seus efeitos.

Se o cliente não conseguir formar o JSON da chamada, o serviço pode nem ter recebido o pedido. Esse erro, sozinho, não identifica sua causa nem estabelece um limite de tamanho. O assistente relê o planejamento: se já houver ramos salvos, preserva-os e continua apenas o que falta. Se houver uma referência de recuperação, usa a tentativa original. Para um mapa ainda sem módulos, pode iniciar contexto e escopo e continuar por ramos. Uma nova sessão precisa fazer essa mesma conciliação antes de gravar.

Para correções, `retomar_correcao` recebe o objeto `recovery` integral no campo
`recuperacao`, quando disponível, ou o curso e a tentativa original. Essa
operação confere conteúdo e fila sem reescrever a correção apenas para retirar
observações. Renomear o curso não muda o alvo da tentativa.

Conflito de versão exige examinar o estado atualizado e a pertinência da
alteração. Indisponibilidade temporária pode adiar a operação e seus dependentes;
uma recusa expressa de autorização exige respeitar a restrição. As respostas de
erro distinguem esses casos e conservam os dados necessários à recuperação,
sem expor credenciais, cabeçalhos ou endereços temporários na conversa.
