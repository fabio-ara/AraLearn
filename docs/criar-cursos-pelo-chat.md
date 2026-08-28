# Criar e desenvolver Cursos por conversa

Este guia apresenta a Autoria por um cliente conectado ao Model Context
Protocol (MCP). A conversa e a interface visual trabalham sobre o mesmo Curso.
O cliente traduz a intenção expressa em linguagem natural para leituras e
operações delimitadas, enquanto o AraLearn verifica propriedade, revisões,
contratos e relações antes de confirmar uma mudança.

Este percurso pressupõe que a organização já disponibilizou um cliente MCP
compatível. Ele não implica que um app do AraLearn esteja publicado ou
instalável no ChatGPT e não substitui um tutorial de instalação na interface
corrente desse produto.

## Antes de começar

1. Conecte o endereço MCP do ambiente do AraLearn.
2. Autorize sua conta individual por OAuth.
3. Confirme a descoberta das cinco ferramentas e do recurso
   `aralearn://authoring/invariants`.
4. Peça ao cliente que localize o Curso e leia a vista pertinente antes de
   propor alterações.

A conta conectada conserva as mesmas permissões do AraLearn. A Autoria por
conversa exige que a pessoa seja proprietária do Curso; uma pessoa com acesso
direto ao Estudo continua limitada ao estudo.

## Apresentar o problema educacional

Um bom primeiro pedido informa:

- quem deverá aprender;
- o que deverá compreender ou conseguir fazer;
- conhecimentos prévios relevantes;
- conteúdo e Fontes disponíveis;
- restrições de tempo, idioma, dispositivo ou acessibilidade;
- decisões que ainda precisam de julgamento humano.

Esses elementos dão base ao planejamento. Quando faltar informação, o cliente
deve explicitar a lacuna ou pedir esclarecimento, em vez de inventar Fonte,
resultado de aprendizagem, valor de parâmetro ou alegação de eficácia.

## Localizar ou criar o Curso

Peça ao cliente que procure pelo título com `listarCursos`. Diante de homônimos,
ele deve apresentar título, objetivo e revisão suficientes para uma escolha
segura.

Se o Curso ainda não existir, `criarCurso` cria uma raiz privada com título e
objetivo. A operação usa um `requestId`, que permite recuperar o mesmo resultado
quando uma resposta de rede se perde. O Curso criado possui uma única identidade
para Autoria, Pesquisa, Estudo, MCP e Actions.

## Planejar por Partes

Use `lerCurso` com `view: "instructional_plan"`. O plano reúne:

- público e escopo;
- resultados de aprendizagem pretendidos;
- unidades de análise instrucional;
- requisitos de evidência;
- Partes de autoria e seus vínculos com Microssequências;
- faixa preferencial de Partes e a origem dessa escolha.

Parte de autoria agrupa trabalho de produção. Ela não integra a hierarquia
didática, formada por Curso, Módulo, Lição, Microssequência didática e Unidade
de estudo. A faixa inicial de 7 a 12 Partes é uma orientação operacional
configurável, não uma prescrição pedagógica.

A pessoa pode pedir que o cliente reorganize, divida, una, amplie ou reduza
Partes. Essas mudanças preservam as Unidades já produzidas. Depois que as
Microssequências existem, atribua a cada uma as unidades de análise e os
requisitos de evidência que ela precisa desenvolver. Essa atribuição é
explícita e admite vários itens em vários alvos.

Na interface, Observações e mudanças de Parâmetros são salvas no próprio Curso e
permanecem visíveis na Autoria. No ChatGPT conectado por MCP ou Actions, peça
para ler esse estado, discuta a proposta e ajuste-a até que represente a intenção
autoral. O Curso só muda depois da aprovação explícita da operação no cliente
conectado. A interface normal não usa compositor nem transferência por cópia e
cola para iniciar esse trabalho.

## Configurar o desenho

Leia `course_design` no Curso, na Lição ou na Microssequência pertinente. A
vista apresenta quatro parâmetros pedagógicos:

- teto de novas unidades de análise por Unidade expositiva;
- formas de explicação exigidas quando aplicáveis;
- quantidade mínima de oportunidades distintas de prática por requisito de
  evidência;
- dimensões que precisam variar entre essas oportunidades.

O valor efetivo vem de uma decisão explícita da autoria ou da pesquisa, de uma
atribuição automática justificada, ou do valor-padrão do produto. A leitura
informa origem e escopo de proveniência. Limpar uma atribuição restaura o valor
herdado ou o valor-padrão calculado.

Orientações autorais permanecem no texto original e recebem revisões. Uma
interpretação estruturada pode registrar resumo, diretivas, divergências e
perguntas, sempre ligada à revisão exata e sem substituir o texto humano.

A política de componentes didáticos separa:

- catálogo disponível por inteiro ou limitado a uma lista;
- componentes bloqueados;
- componentes preferidos entre os permitidos.

Bloqueio prevalece sobre permissão. Preferência orienta a escolha entre
candidatos adequados, sem tornar o uso obrigatório.

No escopo de Microssequência, `targetPlanItems` mostra os itens do plano
atribuídos. `set_target_plan_items` substitui, na mesma operação, as listas de
unidades de análise e requisitos de evidência daquele alvo.

## Registrar Fontes e Âncoras

Use `course_sources` para percorrer o catálogo, abrir uma Fonte ou consultar o
histórico de um alvo. Registre somente metadados conhecidos. Se faltarem autoria,
data, edição, periódico ou outros dados necessários à referência, explicite a
lacuna e pergunte à pessoa; não complete por plausibilidade. `citationText`
identifica a Fonte para pessoas. Depois, crie uma Âncora que localize o trecho
relevante por páginas, intervalo de tempo, fragmento de endereço ou citação
textual. `humanLocator` pode nomear capítulo, seção, unidade, slide, figura ou
tabela somente quando o próprio material declara essa identificação.

Uma atribuição liga a revisão exata da Fonte e suas Âncoras a um item do plano
ou a uma Unidade. A relação pode indicar que a Fonte informou, sustentou,
inspirou, exemplificou, contrastou ou serviu de base para adaptação ou citação.
Também pode registrar que o caso ainda precisa de verificação.

`set_target_sources` substitui o conjunto completo e ordenado do alvo. Para
cada Unidade criada ou substituída numa operação de composição, o cliente envia
uma aplicação de Fontes correspondente, ainda que vazia. O conteúdo interno da
Unidade não recebe um campo paralelo `sources`.

Na área **Fontes**, a pessoa proprietária também pode:

- anexar PDFs privados à revisão ativa da Fonte;
- baixar um anexo por URL assinada de 60 segundos;
- acompanhar a cota de PDFs do Curso;
- exportar a proveniência de um alvo em JSON, preservando identidades,
  revisões, relações e Âncoras.

Cada PDF aceita até 20 MiB, cada revisão de Fonte aceita até oito anexos e o
Curso aceita até 64 MiB de conteúdo PDF único. Arquivos com os mesmos bytes são
reutilizados dentro do Curso quando impressão digital, tamanho, tipo e autorização
coincidem.

O envio de PDF é uma operação da aplicação autenticada, não do cliente
conversacional: o preparo cria uma intenção de dez minutos, o Storage exige uma
sessão ainda viva e a inserção consome essa intenção. O MCP pode consultar os
metadados autorizados, mas não recebe o arquivo nem uma credencial de upload.

## Descobrir componentes conforme a intenção

O cliente consulta o catálogo progressivamente:

1. explora famílias e facetas;
2. pesquisa pela intenção didática;
3. inspeciona até oito candidatos;
4. obtém o contrato exato de um componente por chamada;
5. valida a Unidade proposta;
6. prepara uma prévia quando a inspeção visual é necessária.

No texto para pessoas, prefira o nome **componente didático**. A identidade
técnica `package@version` deve aparecer apenas quando for necessária para
diagnóstico ou contrato. Quando o catálogo oferece apenas uma aproximação, o
cliente precisa informar a limitação antes de materializar.

## Produzir uma Parte com segurança

Ao iniciar a produção, o servidor deriva o contexto efetivo de cada
Microssequência: parâmetros, orientações, política de componentes, itens do
plano e Fontes aplicáveis. O cliente não fornece esse contexto como declaração
confiável.

Para cada etapa, o cliente:

1. lê a execução persistida e identifica a próxima etapa;
2. produz somente o recorte autorizado;
3. valida hierarquia, conteúdo e contratos dos componentes;
4. declara fatos delimitados sobre a aplicação do desenho;
5. aplica somente Fontes e Âncoras presentes no contexto;
6. envia o lote com as revisões e versões esperadas;
7. relê o resultado e informa apenas o que foi confirmado.

Uma etapa de Microssequência confirma entidades, vínculo com a Parte,
proveniência, progresso, evento e recibo na mesma transação. Se a validação
falhar, esse conjunto é revertido. Uma interrupção pode ser retomada pela etapa
pendente, e a repetição do mesmo pedido não duplica conteúdo.

As declarações sobre formas de explicação, oportunidades de prática e
dimensões de variação permanecem examináveis. A validação comprova sua
consistência com o contrato; a avaliação semântica e pedagógica continua sendo
uma responsabilidade humana apoiada por auditoria.

## Conferir na interface e no Estudo

Depois de produzir ou alterar conteúdo:

1. peça ou receba um foco coerente — normalmente uma Microssequência — e
   confira no chat as Unidades materiais, suas práticas resolvidas, feedbacks e
   parâmetros;
2. use as referências curtas das Unidades para comentar diretamente na
   conversa;
3. abra o endereço do foco em **Conteúdo** quando precisar comparar o conjunto,
   registrar Observações ou continuar por Unidades fora do filtro;
4. confira o plano, as Partes e o histórico de materializações em
   **Planejamento**, e confirme decisões e proveniência em **Parâmetros e
   componentes** e **Fontes**;
5. abra o mesmo Curso em **Estudo** para conferir apresentação, navegação e
   citações visíveis;
6. trate divergências em **Revisão**.

Conteúdo e o foco incorporado reproduzem o material real sem pedir que a pessoa
resolva a prática: lacunas, alternativas esperadas e feedback ficam expostos
para inspeção. A edição manual e a Assistência por IA ativam somente os textos
autorizados nesse mesmo renderer; não existe outra representação ou
persistência de Unidade.

## Registrar e tratar Observações

`lerCurso` com `view: "anchored_annotations"` consulta caixa de entrada, alvo
ou detalhe. `alterarCurso`, com `update_anchored_annotations`, cria, revisa,
retira, considera, responde, resolve, reabre ou corrige a classificação de uma
Observação.

Para criar uma Observação pela conversa, o cliente apresenta o alvo e uma
síntese breve e pede confirmação. O comando conserva o texto declarado, sem
copiar a conversa inteira. Responder ou resolver uma Observação registra
triagem; uma mudança de conteúdo pertence ao ciclo de auditoria e correção.

## Auditar, corrigir e verificar

Use `audit_cycle` no modo `context` para preparar uma Unidade focal. Os modos
`findings` e `runs` listam achados e rodadas, inclusive rodadas sem achados. O
modo `detail` abre um achado ou uma rodada exata.

Uma rodada registra critérios estruturais, pedagógicos, factuais e editoriais.
Resultado factual positivo exige Fonte e Âncora ativas. A relação
`supported_by` pode sustentar uma afirmação; `quoted_from` comprova apenas que o
trecho foi citado com fidelidade.

Quando um achado justificar mudança, proponha uma correção focal da Unidade. A
proposta pode substituir conteúdo e o conjunto de Fontes, preservando
identidade, pai e posição. A pessoa confirma a aplicação depois de compreender
o efeito. Em seguida, outra rodada verifica o critério: `resolved` exige
resultado aprovado; `still_open` mantém o achado aberto. A reversão também
exige confirmação e só se aplica enquanto o estado correspondente continuar
corrente.

## Criar variantes comparáveis

Use a área **Variantes** ou `update_course_variants` para criar de duas a oito
variantes a partir do planejamento atual. Uma variante serve de referência
inicial; ao menos outra declara uma diferença de parâmetro ou de política de
componentes. Cada resultado é um Curso independente.

A comparação informa o ponto comum de planejamento, as revisões, as diferenças
declaradas, os fatos materializados, os desvios e os dados ausentes. Alterar um
Curso não altera os demais. Desvincular uma variante remove somente a relação
comparativa e preserva o Curso.

## Examinar os fatos de Autoria

A vista `research` e a área **Pesquisa** consultam os mesmos sete conjuntos de
fatos: atividade, materializações, desenho, Fontes, Observações, auditorias e
variantes. O recorte pode usar canal, origem, estado e período. Cada gráfico
possui tabela equivalente, definição da métrica, denominador, dados ausentes e
limites de interpretação.

O cliente pode conduzir a pessoa ao Curso, Parte, Unidade, Fonte, Observação,
achado ou comparação que originou o fato. A interface exporta CSV e JSON sob a
mesma revisão. Contagens descrevem o processo de Autoria; não medem
aprendizagem, atenção, esforço ou eficácia.

## Retomar em outra conversa

Uma nova sessão deve reler:

1. o recurso de invariantes;
2. o Curso e sua revisão;
3. o plano e a Parte pertinente;
4. o desenho, os componentes e as Fontes do alvo;
5. a execução de materialização, se houver etapa pendente;
6. o achado, a rodada ou a comparação pertinente, quando aplicável.

O estado recuperável está no Curso e em seus registros associados. A conversa
anterior não se torna uma cópia oculta do planejamento.

## Resolver falhas comuns

| Situação | Como proceder |
| --- | --- |
| autorização expirou | refaça o OAuth com a mesma conta |
| Curso não foi encontrado | confira conta, identidade e propriedade |
| revisão mudou | releia a vista e reconcilie a proposta |
| pedido perdeu a resposta | repita o mesmo `requestId` apenas com o mesmo comando |
| componente foi bloqueado | releia a política efetiva e escolha entre os permitidos |
| Fonte ou Âncora foi recusada | releia a revisão ativa e envie o conjunto completo do alvo |
| evidência factual foi recusada | confira relação, Fonte, Âncora e revisão do critério |
| correção ficou desatualizada | releia a Unidade e prepare outra proposta sobre o estado corrente |
| resultado não apareceu | confirme ambiente, conta, Curso, revisão e destino da interface |

Os argumentos completos estão em [Autoria por MCP](autoria-mcp.md). Para os
fundamentos da assistência, consulte [Assistência por modelo de
linguagem](assistencia-por-ia.md).
