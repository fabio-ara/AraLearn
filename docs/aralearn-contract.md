# Contratos do AraLearn

A interface, o servidor e os clientes externos precisam atribuir o mesmo significado
aos dados que trocam. Um campo omitido, uma versão antiga ou uma resposta incompleta
pode mudar o efeito de uma operação. Os **contratos** evitam essa ambiguidade ao
definir a forma dos dados, as condições de uso e o resultado de cada pedido.

No servidor, funções executadas na infraestrutura hospedada — as
[Edge Functions](supabase.md) — validam cada pedido antes de consultar ou alterar o
banco.

A interface, o [MCP](autoria-mcp.md), protocolo de comunicação com clientes de IA,
e [Actions](autoria-actions.md), acesso descrito em OpenAPI para o cliente usado
nos testes, chegam a essas mesmas regras de autorização e controle de versões.

Os identificadores abaixo servem para implementação e diagnóstico. Na conversa
de autoria, a pessoa trabalha com títulos, conteúdo e decisões; o serviço resolve
as identidades internas.

## Um pedido e seu resultado

Ao corrigir uma unidade, o cliente informa qual conteúdo leu e o que pretende
alterar. O servidor confere acesso, identidade e versão antes de gravar. Se
outra edição tiver modificado o alvo, a nova leitura permite examinar o conflito
antes de substituir conteúdo.

O resultado de uma alteração fica associado a um recibo. Se a resposta se
perder depois da gravação, esse registro permite recuperar o resultado sem
criar outra alteração. Os recibos de alterações do curso têm prazo técnico de
14 dias e são removidos pela rotina de limpeza após a expiração. A recuperação
depende da disponibilidade do recibo; esses registros não constituem um arquivo
permanente de versões do curso. A mesma proteção atende à interface e aos
clientes externos. Já a adequação pedagógica da correção depende da inspeção
do material: a validação do formato e do acesso resolve outra parte do problema.

## Curso e estrutura

O cliente precisa receber uma composição completa o suficiente para estudar e salvar
uma cópia local, mas uma tarefa de autoria pode trabalhar sobre um recorte. O contrato
`aralearn.course.v1` representa a composição curricular validada usada em
estudo e nas cópias locais. As leituras de autoria retornam apenas os dados
necessários ao trabalho: resumo do curso, páginas de seus itens ou inspeção de
uma unidade. Essas seleções de campos são chamadas de projeções.

O plano corrente usa `aralearn.course-instructional-plan.v3`. Ele contém título,
objetivo, público, pré-requisitos declarados, escopo, mapa curricular completo,
repertório acumulado, requisitos de evidência e partes operacionais. O repertório
identifica os conhecimentos acompanhados no percurso; os requisitos descrevem
o que uma atividade pede para tornar observável sua aplicação, conforme o
[desenho instrucional](desenho-instrucional-parametrizado.md). O mapa pode
estar ausente, em rascunho ou aprovado. Uma parte contém posição, título,
intenção, progressão local e vínculos com microssequências já existentes.

A [hierarquia didática](modelo-didatico.md) vai do curso às unidades de estudo. Uma
parte é apenas o lote usado na autoria e não aparece como pai curricular. Salvar ou
redimensionar uma parte não cria nem reorganiza o currículo.

A microssequência conserva separadamente o plano da explicação e o texto já
desenvolvido. `explanationPlan: {purpose, prerequisites, relations, sourceIds}` registra
o que a explicação precisa realizar; `explanation: {title, content}` guarda o título e
o conteúdo. Os componentes vêm do catálogo comum. Como a explicação serve de base às
unidades, ela não possui resposta nem progresso próprios.

Esses campos podem estar ausentes no acervo anterior. A materialização corrente exige
uma proposta no mapa e uma explicação para cada microssequência da parte. Uma base já
salva pode ser reutilizada; o pedido envia somente as que serão criadas ou alteradas.
A tarefa `salvar_explicacoes` permite desenvolver o texto-base e suas fontes antes das
unidades, inclusive enquanto o mapa ainda é rascunho.

A leitura de revisão `contentReview` é metadado protegido, separado do conteúdo
editável. Ela informa revisão não registrada, rascunho, revisão atual ou
desatualizada. O comando autenticado compara a referência do conteúdo que o proprietário
declara ter inspecionado com o estado salvo atual. A decisão humana expressa pode ser
registrada na interface ou por
`declarar_revisao`, com a referência fornecida na preparação. Importar, produzir
ou corrigir conteúdo não declara essa revisão. Fontes e arquivos usados entram
na base da conferência.
O [contrato de revisão humana](explicacao-e-revisao-humana.md) detalha inspeção,
distribuição, concorrência e limites da preservação local.

O acesso ao conteúdo segue a política expressa do curso: conteúdo completo salvo
ou somente revisado. Na leitura restrita do estudo,
`pendingReviewMicrosequenceIds` identifica as
bases ocultas na mesma revisão das páginas de conteúdo. Essas microssequências
conservam identidade, posição e o título de estado "Aguardando revisão da
autoria", sem objetivo, papel pedagógico ou conteúdo da base. Cada unidade
acessível é validada integralmente e conserva sua elegibilidade independente da
base. O montador reconhece esse marcador apenas no recorte explícito de leitura,
inclusive no armazenamento local de consulta; importação e autoria exigem a composição
curricular completa.

A composição estrutural aceita `courseMetadata: {title, objective}` opcional,
inclusive sem alterações de entidades. Metadados, entidades e atribuições são
validados na mesma transação, isto é, gravados juntos ou recusados como conjunto.
A revisão esperada protege contra mudanças simultâneas e o recibo permite
reconhecer uma repetição do mesmo pedido.
As contagens da resposta continuam representando entidades. Esse campo não
pertence à edição focal de uma unidade de estudo.

A cobertura associa cada item obrigatório às microssequências previstas e às
unidades materializadas que o desenvolveram. O estado aprovado só é aceito para
um mapa completo quanto ao escopo declarado; nenhuma unidade de estudo é criada
como efeito dessa aprovação. A leitura completa do mapa salvo fornece
`referenciaParaAprovar`; `aprovar_mapa_curricular` recebe esse valor, sem
reenviar uma árvore reconstruída. Uma mudança posterior exige nova inspeção
da versão que se pretende aprovar.

## Revisão do conteúdo

A pessoa pode declarar que inspecionou uma explicação ou uma unidade salva.
O sistema precisa relacionar essa decisão ao conteúdo que estava disponível
naquele momento. Para isso, calcula uma impressão digital dos dados, ou
**hash**, e a compara com o estado atual. A [revisão humana](explicacao-e-revisao-humana.md)
apresenta o significado da declaração; os formatos abaixo permitem registrá-la
e detectar mudanças posteriores.

A explicação pertence à microssequência e é consultada pelas suas unidades,
sem uma cópia do texto em cada unidade. Seus componentes mantêm identidades
estáveis. Os vínculos de fontes usam os alvos `microsequence_explanation` ou
`study_unit`, conservando o conteúdo que cada fonte sustenta.

A coluna protegida `content_review` conserva a impressão do conteúdo,
sua versão salva, a pessoa revisora e o instante da declaração. Esses dados
ficam separados do conteúdo editável: importar, copiar ou produzir uma unidade
não permite atribuir-lhe uma declaração de inspeção humana.

| Estado | Significado |
| --- | --- |
| `unregistered` | Acervo anterior sem registro de revisão. |
| `draft` | Objeto sem declaração individual corrente. |
| `current` | A declaração corresponde à base material atual. |
| `stale` | A declaração corresponde a uma base material que mudou. |

A explicação pode ser revisada antes de existir unidade. Revisá-la não revisa
automaticamente as unidades; uma unidade também pode ter revisão atual enquanto
a explicação aguarda inspeção. A marca pessoal **Rever**, usada pelo estudante,
permanece independente desses estados.

### Ler e registrar uma declaração

As operações exigem propriedade do curso. As entradas de serviço recebem a
identidade autenticada da pessoa; as entradas diretas da aplicação usam sua
sessão. Ambas compartilham as regras de comparação e gravação.

| Operação | Entradas relevantes | Resultado |
| --- | --- | --- |
| `get_course_content_review_for_actor_v1` | pessoa, curso, tipo e identidade do alvo | `aralearn.course-content-review.v1`: revisão do curso, versão da entidade, `basisHash`, estado e política |
| `set_course_content_review_for_actor_v1` | os mesmos alvos, `expectedBasisHash`, `reviewed` booleano e `requestId` | `aralearn.course-content-review-change.v1`: leitura correspondente à decisão, `changed` e `idempotent` |
| `set_course_content_review_policy_for_actor_v1` | pessoa, curso, revisão esperada, política e `requestId` | `aralearn.course-content-review-policy.v1`: política aplicada, revisão resultante e estado do recibo |

As funções SQL usam argumentos `p_*` em snake_case, convenção que separa palavras
por sublinhado. A tabela descreve os campos do contrato de domínio. Variantes
sem `for_actor` usam a sessão e omitem a identidade da pessoa nos argumentos.
Na leitura do estudo, o resultado público mostra estado e `reviewedAt` quando
pertinente; a identidade da pessoa revisora permanece no metadado protegido.

Uma declaração exige conteúdo completo salvo. Unidades expositivas precisam
de conteúdo; práticas podem usar uma resposta do catálogo sem bloco expositivo
adicional, conforme o validador. Retirar uma marca também compara a impressão
inspecionada, para que a decisão não atue sobre outro estado do objeto.

O cliente da aplicação utiliza `getContentReview(courseId, targetKind, targetId)`,
`setContentReview({courseId, targetKind, targetId, expectedBasisHash, reviewed,
requestId})` e `setContentReviewPolicy({courseId, expectedRevision, policy,
requestId})`. `changed` indica se houve mudança e `idempotent` identifica a
recuperação do mesmo pedido sem repetir seus efeitos.

Depois de uma resposta incerta, a identidade e os argumentos originais são
conservados. A decisão pendente fica no armazenamento da conta, separada por
curso, tipo e objeto. Reutilizar a identidade com outro alvo, impressão ou
decisão é recusado. Recuperar o recibo informa a decisão original; uma releitura
informa a situação atual, que pode já ter mudado. Pedidos locais antigos de
aprovação de um conjunto não são convertidos em revisão individual.

### Quais mudanças afetam a revisão

A impressão reúne o conteúdo do alvo, o objetivo e a explicação da
microssequência, as bases das dependências declaradas, a configuração aplicada
da unidade, os requisitos vinculados e a proveniência material das fontes,
âncoras, arquivos e mídias utilizados.

Uma fonte alterada afeta apenas os alvos que dependem dela. Alterar uma unidade
não desatualiza por si a revisão de uma unidade irmã ou da explicação. Alterar
a explicação alcança suas unidades e as dependências registradas. Relações
relevantes ainda não registradas precisam ser identificadas pela pessoa ao
examinar o alcance da correção.

Preferências pessoais, planejamento de produção futura, tema visual, posição
de leitura e progresso não alteram o conteúdo aplicado. Uma gravação
materialmente idêntica conserva a impressão. Se o texto mudar e depois voltar
à mesma base material, volta a corresponder à impressão. Enquanto disponíveis,
os recibos pertinentes permitem recuperar o resultado das operações a que se
referem, dentro do prazo descrito em [Um pedido e seu resultado](#um-pedido-e-seu-resultado).

Com edições concorrentes, o servidor usa os bloqueios do curso e compara a
impressão antes de gravar. Uma mudança sem relação com o alvo pode avançar a
revisão geral do curso sem alterar sua impressão. A declaração permanece
vinculada ao objeto, sem ser reinterpretada como inspeção de conteúdo novo.

### Política de acesso, acervo anterior e cópia

A política `saved`, usada por padrão, disponibiliza o conteúdo completo salvo
a quem possui acesso, inclusive visitantes de um curso explicitamente público.
A política opcional `reviewed_only` exige revisão atual do objeto. Nesse caso,
retirar uma marca pode afetar o que o estudante consegue abrir. O proprietário
conserva acesso de autoria para resolver pendências. Visibilidade, concessões,
permissão de cópia e direitos dos arquivos permanecem verificações próprias.

O acervo sem explicação ou revisão conserva sua estrutura e suas unidades.
Declarações antigas sobre o conjunto da microssequência ficam em
`legacyMicrosequenceReview`, no metadado protegido, com seu alcance original.
Elas não se tornam novas declarações por explicação ou unidade. Os antigos
pontos de escrita de aprovação do conjunto foram retirados; a leitura agregada
informa pendências sem registrar revisão.

Uma cópia independente conserva conteúdo, fontes e configuração e recebe
registros de revisão vazios. Os recibos da origem permanecem na origem. Exportar
um estado de revisão permite examiná-lo, mas não autoriza reaplicá-lo numa
importação como declaração da pessoa que recebe a cópia.

A transformação de metadados de cópias locais preserva os dados úteis anteriores.
A data de uma aprovação antiga do conjunto mantém esse significado, sem ser
renomeada como revisão individual. A cópia local identifica a revisão do curso
e é atualizada por recortes coerentes. O modo manual de sincronização permanece
manual; sem conexão, não é possível confirmar revisão ou autorização remotas
atuais nem ampliar os direitos sobre arquivos.

## Pessoas e acesso

Uma concessão precisa continuar ligada à mesma pessoa mesmo que ela altere o nome pelo
qual é encontrada. Por isso, o perfil separa a identidade estável do identificador
público escolhido. `aralearn.person-profile.v2` contém UUID, identificador, avatar
opcional e data de atualização. Nesse contrato, `handle` é o identificador público
escolhido. O perfil não expõe e-mail nem segundo nome de exibição.
Identificadores usam de 3 a 30 letras latinas minúsculas sem acento, algarismos
e os sinais ponto, sublinhado ou hífen, começando e terminando com letra ou algarismo;
o `@` inicial é aceito na entrada. UUID é a identidade estável usada internamente;
o identificador público é o nome pelo qual a pessoa pode ser encontrada. Perfis ainda
sem identificador exigem escolha.

`aralearn.course-list.v2` distingue `owned`, `shared` e `public`, com permissões
explícitas de editar, copiar e observar. Esses valores distinguem cursos próprios,
compartilhados e públicos. O menu da Home oferece copiar quando
o resumo de acesso autoriza `canCopy`, a pessoa está autenticada e há conexão.
Essa permissão permanece separada do documento de conteúdo, inclusive após
abrir o curso e retornar à Home; propriedade ou visibilidade não a substituem.
Busca de pessoas exige curso próprio, prefixo
de ao menos dois caracteres e no máximo dez resultados; a concessão confirma a identidade estável
e o identificador selecionados. Troca ou reutilização do identificador não
redireciona permissões já concedidas.
Cada pessoa autora dispõe de até 60 buscas e 10 tentativas de concessão por
janela de dez minutos. Ao vencer a janela, a próxima operação inicia uma nova
contagem, preservando as concessões existentes.

Cursos começam privados. Tornar público exige confirmação e disponibiliza os arquivos
por padrão (`publicFileAccess=available`). Uma escolha explícita pode restringi-los
no curso; exceções de fonte e arquivo são preservadas e a mais específica prevalece.
Tornar privado bloqueia visitantes independentemente da política latente de arquivos.
Visitantes recebem somente projeções de estudo e não podem editar
nem registrar observações. Pessoas autenticadas com acesso podem enviar suas observações;
somente o proprietário altera o curso.

## Desenho

Os [parâmetros instrucionais](desenho-instrucional-parametrizado.md) podem ser
definidos no curso ou em um recorte. Sem uma escolha local, vale a definição do
nível superior: essa relação é chamada de herança.

`aralearn.course-design.v3` consulta configuração corrente por escopo.
`aralearn.course-design-change.v3` confirma uma definição ou restauração de
herança.

O [catálogo de parâmetros](../src/domain/courseDesignParameters.js), na versão
1.2.1, define identidades, tipos, valores permitidos, unidades, grupos,
escopos e rótulos usados pela interface, pelas integrações e pelo banco. Reúne
conteúdo, prática, conversa e cadência. Direção editorial e política de componentes
permanecem campos distintos. Alvos de palavras são flexíveis e não autorizam
compressão. Partes, lotes e pausas não são acoplados entre si.

Uma atribuição com `mode: automatic` pode ter `value: null`: trata-se de intenção
local de delegar a escolha, distinta da ausência de atribuição, que restaura
herança. Uma escolha automática aplicada exige valor do tipo previsto no
catálogo e um motivo; fixações
de autoria e pesquisa não são substituídas pela calibração automática.
Conflitos com condições de pesquisa definidas em níveis superiores bloqueiam a escrita
incompatível e a produção até serem resolvidos.

Perfis de autoria pertencem à conta. Criar, consultar, editar ou excluir um
perfil usa a revisão corrente; mudanças recebem um recibo para
repetição do mesmo pedido. A prévia e a aplicação verificam as revisões do curso
e do perfil. Aplicar copia preferências de catálogo, conserva exceções por
padrão e remove somente exceções selecionadas que não sejam de pesquisa.
Reaplicar valores equivalentes não aumenta a revisão; conteúdo e registros de desenho aplicado
existentes ficam preservados. A cópia não mantém referência viva ao perfil.

Uma unidade de estudo produzida guarda dois registros. O primeiro é uma
cópia do desenho aplicado naquele momento, ou *snapshot*; o segundo descreve
como ele se realizou no conteúdo:

- `aralearn.study-unit-design-snapshot.v2`, com o recorte aplicado de plano e
  configuração;
- `aralearn.study-unit-design-application.v1`, com ideias introduzidas, ideias
  estabelecidas utilizadas, formas, componentes e prática observada.

Esses objetos são focais. Não reproduzem o curso nem a execução que os criou.
Retomadas são identificadas quando a explicação mobiliza novamente uma ideia
estabelecida sem apresentá-la como nova. O plano deriva do estado corrente onde
cada ideia foi introduzida, usada ou retomada, sem um registro paralelo de eventos.

Uma escolha delegada em modo `automatic` exige resolução contextual pelo assistente
no escopo da microssequência ou unidade antes da produção. Uma definição
explícita do pesquisador prevalece sobre essa calibração.

O contrato fixa a ordem de decisões, os limites de aprovação e a fronteira
pública. Ele não transforma continuidade narrativa, redução de apoio ou outra
heurística pedagógica em estado obrigatório. Essas dimensões são realizadas
pela composição e pelos parâmetros existentes quando pertinentes.

### Campos de configuração nos canais

A interface usa rótulos legíveis; os clientes enviam os campos abaixo. São as
mesmas decisões do [catálogo de parâmetros](desenho-instrucional-parametrizado.md#catálogo-corrente),
com nomes de entrada em português. Os valores de referência são exemplos de
produto sujeitos à avaliação no contexto; não são escolhas automáticas
aplicadas a todo curso.

| Campo do catálogo | Decisão representada | Escopos | Valores admitidos e referência |
| --- | --- | --- | --- |
| `maximo_ideias_novas_por_unidade` | Máximo de unidades de análise instrucional introduzidas numa unidade expositiva ou mista; a contagem não mede dificuldade. | Curso, lição, microssequência, unidade | Inteiro 1–64; referência 2. |
| `formas_de_explicacao` | Formas usadas para explicar cada unidade de análise introduzida, com motivo quando uma forma não se aplica. | Curso, lição, microssequência, unidade | Conjunto de definição, exemplo concreto, mecanismo, contraste, condição de aplicação, limite/exceção, exemplo resolvido e relação entre representações. Referência: primeiras quatro. |
| `oportunidades_distintas_por_requisito` | Quantas oportunidades diferentes de prática devem atender a cada requisito de evidência de aprendizagem. | Curso, lição, microssequência, unidade | Inteiro 1–64; referência 2. |
| `dimensoes_de_variacao_da_pratica` | Variação de caso/dados, contexto, tarefa, representação ou apoio, preservando a operação pertinente. | Curso, lição, microssequência, unidade | Conjunto não vazio dessas cinco dimensões; referência caso/dados. |
| `alvo_palavras_conversa` | Extensão flexível das respostas na conversa autoral. | Curso, lição, microssequência, unidade | Inteiro 20–500; referência 120. |
| `alvo_palavras_unidade` | Extensão editorial flexível da unidade, depois de satisfeita sua função. | Curso, lição, microssequência, unidade | Inteiro 40–1.000; referência 180. |
| `distribuicao_da_pratica` | Organização de práticas intercaladas ou agrupadas. | Curso, lição, microssequência, unidade | `interleaved`, `clustered`; referência `interleaved`. |
| `posicao_da_pratica` | Prática antes, depois ou antes e depois da explicação pertinente. | Curso, lição, microssequência, unidade | `before_explanation`, `after_explanation`, `before_and_after`; referência `after_explanation`. |
| `alvo_microssequencias_por_parte` | Quantas microssequências existentes uma parte pretende reunir. | Curso | Inteiro 1–64; referência 1. |
| `alvo_partes_por_lote` | Quantas partes preparar no lote autorizado. | Curso | Inteiro 1–64; referência 1. |
| `frequencia_de_pausa` | Pausa por microssequência, parte, lote ou solicitação. | Curso | `each_microsequence`, `each_part`, `each_batch`, `on_request`; referência `each_part`. |
| `preferencia_da_conversa` | Forma de discutir a decisão corrente. | Curso, lição, microssequência, unidade | `concise`, `debate`, `explanation`; referência `concise`. |

Quando não há escolha atribuída, o servidor devolve `mode: automatic`,
`value: null` e `origin: system_default`. O valor continua pendente de resolução
contextual. `ajustar_configuracao` distingue fixações em `parametros`, delegação
sem valor em `automaticos` e valor nulo para restaurar a herança.

Na materialização, cada unidade recebe os valores pendentes em
`configuracao.parametros` e o motivo em `configuracao.motivo`. O papel declarado
do conteúdo determina se a aplicação é expositiva, prática ou mista. A tarefa
`aplicar_configuracao_instrucional` pode aplicar a intenção corrente a unidades
existentes inspecionadas, preservando texto, explicação, fixações e condições de
pesquisa. Se falta a declaração de aplicação, ela precisa ser fornecida
expressamente; calibrar parâmetros não fabrica uma descrição do conteúdo.
A operação conserva a separação entre aplicação instrucional e revisão humana.

`ajustar_orientacao` e `ajustar_componentes` alteram orientações para trabalho
futuro. Nos perfis, a prévia e a aplicação verificam as versões do curso e do
perfil; condições de pesquisa não podem ser removidas por essa aplicação.

## Fontes e PDFs

O cadastro identifica a fonte; a âncora localiza um trecho; a atribuição registra
o uso feito no conteúdo. [Fontes, citações e referências](fontes-e-citacoes.md)
explica essas relações e sua inspeção.

`aralearn.course-sources.v3` pagina o catálogo corrente e devolve, de forma
singular, a fonte focal ou a atribuição corrente de um alvo.
Fonte e âncora têm uma versão corrente usada para concorrência. Uma atribuição
relaciona o alvo atual a fontes, papéis e âncoras.

`aralearn.course-source-change.v1` confirma alterações bibliográficas,
ancoragem, proveniência e remoção de PDF.

A incorporação do PDF é feita pelo servidor e usa:

- `aralearn.course-source-pdf-ingestion-preparation.v1` para o preparo curto;
- `aralearn.course-source-pdf-ingestion.v1` depois que bytes e vínculo foram
  confirmados;
- `aralearn.course-source-pdf-download.v1` para autorizar o serviço a emitir
  uma URL assinada de leitura, endereço temporário que incorpora a autorização
  para obter o arquivo.

O aplicativo recebe `aralearn.course-source-pdf-download.v2`, com referência
lógica do arquivo e URL temporária, sem o caminho interno do serviço de arquivos
[Storage](supabase.md). A política
efetiva respeita a exceção do arquivo, depois a da fonte e depois a do curso;
essa autorização não torna público o compartimento de armazenamento, chamado bucket.

O caminho de armazenamento e o resumo SHA-256, que identifica os bytes do
arquivo, são derivados pelo serviço e não são argumentos de uma tarefa humana. Criar
ou revisar a fonte e vincular o PDF ocorre numa única
transação e avança a revisão do curso uma vez.

`aralearn.course-study-citations.v2` entrega ao Estudo citação, endereço
permitido, seletor e localização legível necessários à unidade ou à explicação
compartilhada da microssequência, além de referências lógicas dos anexos
disponíveis. A unidade usa `studyUnitId`; a explicação usa
`targetKind: "microsequence_explanation"` e `targetId` da microssequência, sem
identidade de unidade. A leitura respeita a revisão esperada, a elegibilidade
do conteúdo e os direitos de acesso. O proprietário pode inspecionar rascunhos;
isso não os torna disponíveis ao estudante. Trechos privados de verificação e
caminhos de Storage ficam fora dessa projeção. O download de PDF conserva a
identidade da fonte, sua revisão e o hash do arquivo; não cria uma cópia por
unidade ou um segundo serviço de arquivos para a explicação.

### Atualizar vínculos sem perder suas ocorrências

Ao corrigir conteúdo com fontes explícitas, o sistema relê as atribuições na
mesma revisão do alvo. Um vínculo com a mesma fonte, relação e âncoras conserva
sua identidade. Uma ocorrência — o ponto em que a fonte é usada no conteúdo —
também conserva a identidade quando recurso, seletor e trecho coincidem.
Alterações de papéis ou trechos aplicam os novos valores sem duplicar o vínculo.

Omitir ocorrências conserva as existentes; enviar uma lista explicitamente
vazia as retira. Vínculos omitidos continuam protegidos pela composição. Se
mais de um vínculo corresponder à referência, a operação pede inspeção antes
de escolher o alvo. Alterações de relação ou âncoras que substituam um vínculo
usam sua posição em `manter_fonte`. O capítulo de
[fontes e citações](fontes-e-citacoes.md) explica as relações intelectuais que
esses registros representam.

## Áudio e ferramentas de estudo

As [ferramentas de estudo](ferramentas-calculo-e-consulta.md) oferecem ações como
ouvir uma faixa ou fazer um cálculo. Cada ferramenta é uma instância de pacote — o
conjunto de código, dados e regras de um componente — no conteúdo em `content[]`. O
campo `manifest.tool` identifica a ferramenta, e `toolInteraction.bind` liga a
interação ao conteúdo. O núcleo cuida da abertura, do foco, do fechamento e dos
serviços comuns; o pacote implementa a atividade específica. Essas ferramentas passam pelos mesmos
contratos de descoberta, normalização, materialização e edição dos demais pacotes. Uma
consulta instrucional só recebe atribuição de fonte quando esse vínculo é registrado.

`aralearn.course-media.v1` oferece configuração de áudio na revisão solicitada
ou catálogo paginado exclusivo do proprietário. A configuração contém idioma,
velocidade, preferência de voz nativa, permissão para voz remota e serviço
opcional; não contém credenciais. Faixas nativas guardam texto, enquanto faixas
de arquivo guardam somente SHA-256, tamanho e tipo validados pelo serviço.

`aralearn.course-media-ingestion.v1` confirma o envio de WAV PCM, áudio não
comprimido, ou MP3.
`aralearn.course-media-change.v1` confirma configuração e remoção. As mutações
usam revisão esperada, identidade da solicitação e recibo que permite repetir
o mesmo pedido sem duplicar efeitos; o limite
conjunto de PDFs e áudios é verificado com reservas sob concorrência. Remoção e
exclusão de conta conservam intenção de limpeza recuperável no Storage privado.

`aralearn.course-media-download.v1` liga o endereço temporário ao curso, à
revisão, ao alvo e ao hash, tamanho e tipo do arquivo. O alvo é a unidade por
`studyUnitId`, ou a explicação por `targetKind: "microsequence_explanation"`
e `targetId` da microssequência. A mesma rota de download aceita esses dois
formatos mutuamente exclusivos e recusa alvos incompletos ou desconhecidos.
Estudantes só acessam arquivos referenciados no conteúdo elegível do alvo;
visitantes também dependem da política pública de arquivos do curso. O serviço
confere autorização, revisão e identidade antes de assinar o endereço; o
cliente confere tamanho, formato e hash antes de criar um Blob, objeto que mantém os bytes em memória e é
descartado ao fechar a ferramenta.

O conteúdo não guarda a URL de Storage, e os bytes não são copiados para o
IndexedDB, a base de dados local do navegador descrita em
[persistência relacional](persistencia-relacional.md).
O texto de uma explicação disponível na cópia local não torna seus arquivos
externos disponíveis offline: PDF e áudio de arquivo dependem de acesso à
rede, sem novo cache binário. A configuração nativa pode ser reutilizada
offline somente na mesma revisão do curso e é purgada quando o acesso é
retirado.

## Observações e revisão

`aralearn.course-anchored-annotation.v1` representa uma observação com alvo,
categoria, estado, origem e versão. As projeções de página e mudança usam
`aralearn.course-anchored-annotation-page.v1` e
`aralearn.course-anchored-annotation-change.v1`.

Cada entrada tem identidade e versão próprias. Selecionar várias unidades de
estudo cria observações independentes. Editar uma entrada preserva a identidade
e mantém a pendência. Corrigir conteúdo pode atender a várias entradas, mas
somente suas versões integralmente atendidas são confirmadas após gravação e
releitura. `retomar_correcao` reconcilia a tentativa original, sem reescrever o
conteúdo. O [ciclo de revisão](auditoria-de-conformidade-instrucional.md) distingue
essa confirmação da declaração humana de revisão.

## Dados de autoria

[A análise dos dados de autoria](analytics-instrucionais.md) descreve quantitativamente o conteúdo e
o desenho registrados. A consulta produz um retrato do estado corrente para
inspeção ou exportação.

`aralearn.course-authoring-analytics.v4` contém:

- curso e escopo selecionado;
- desenho quantitativo;
- inventário do conteúdo observado (`basis`) e suas distribuições (`dimensions`);
- autoria quantitativa corrente;
- dados ausentes;
- link opcional para abrir o recorte correspondente.

**Exportar curso e análise** baixa um arquivo JSON no formato
`aralearn.course-authoring-export.v2`. Ele reúne `course`, `scope`, `analytics`
e `artifact`: a análise mantém o escopo selecionado, enquanto
`artifact.document` contém o curso integral, inclusive as explicações salvas.
Outros campos de `artifact` preservam os vínculos das fontes das explicações,
as bases explicativas aplicadas às unidades e as declarações de revisão.
O [dicionário de dados](dicionario-metricas-datasets.md#comparação-e-exportação)
descreve esses campos, os limites e as condições de leitura da exportação.

## Recuperação de cópias próprias e estado de Estudo

Uma cópia recebe novas identidades internas para poder evoluir sem alterar a origem.
Durante essa tradução, os vínculos do planejamento também precisam continuar apontando
para os itens correspondentes. Cópias independentes mantêm o conteúdo e remapeiam as
identidades dos itens de
planejamento tanto nas associações curriculares quanto em `scopeItemIds` das
microssequências. A cobertura representa um conjunto; a cópia nova conserva a
ordem declarada ao traduzir os IDs. Cópias anteriores com referências órfãs são
reparadas pelas associações canônicas do próprio plano, em ordem de posição e
ID, somente quando a quantidade de itens, a ausência de duplicatas e as referências
locais existentes são compatíveis. Associação ausente ou ambígua interrompe o reparo. Ele preserva
identidade, conteúdo restante, fontes, arquivos, observações e declarações de
revisão; incrementa as versões afetadas e devolve o mapa a rascunho para nova
aprovação. A recuperação não depende do estado atual do curso de origem.

O comando de criação automática de cópia por estudante foi retirado.
`aralearn.owned-course-copy-recovery.v1` consulta a prova migrada de uma intenção
anterior e retorna `confirmed`, `unchanged` ou `unresolved`. A confirmação exige
origem e edição compatíveis e propriedade atual do alvo; distingue versões
iniciais das atuais, sem reaplicar conteúdo. Cópias existentes continuam próprias
e rascunhos sem prova permanecem disponíveis para decisão explícita.

Progresso, posição e marcas para rever usam contratos pessoais e versões
separadas do curso. Observações próprias têm sincronização distinta porque seu
texto, autorização e conflitos são diferentes.
Visitantes reutilizam o armazenamento local em compartimento separado das
contas, sem enviar estado pessoal à nuvem nem registrar observações.

## Catálogo humano de Autoria

MCP e Actions compartilham o catálogo `aralearn.human-authoring-tasks`, definido
em [courseHumanTasks.js](../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js).
A fonte canônica identifica a versão corrente e classifica cada tarefa como
leitura ou escrita.

Cada definição contém:

- nome e título;
- descrição com “quando usar” e “quando não usar”;
- schema de entrada, que define os campos e valores aceitos;
- schema de resultado;
- indicações para o cliente sobre leitura, consequência e acesso externo.

O resultado comum possui `result`, com o que ocorreu, `deepLink`, com o destino
pertinente, e `nextDecision`, com a decisão seguinte quando necessária. Um campo de
contexto pode acompanhar a continuação das chamadas sem virar texto do chat.

## Projeção MCP

[MCP](autoria-mcp.md) permite descobrir e chamar as tarefas de autoria.
`tools/list` publica o catálogo permitido pelo escopo OAuth, isto é, pelas
operações autorizadas para o cliente.
`tools/call` valida o argumento antes do caso de uso e devolve texto breve mais
`structuredContent`, com o resultado estruturado. Recursos visuais são ligados somente
às tarefas que têm um
consumidor atual.

O servidor identifica o catálogo por versão e hash. Depois de uma mudança, o app
usado no cliente externo [ChatGPT](https://chatgpt.com) precisa de **Refresh**, e a
conversa deve ser nova. Renovar o login OAuth é
necessário somente se a autorização ou a conta também mudar. Não há aliases de
ferramentas antigas.

## Projeção Actions

O gerador `buildChatGptActionOpenApi.mjs` projeta as 54 tarefas do catálogo em
30 operações HTTP, ou formas de pedido ao serviço: seis grupos com argumentos
validados e 24 operações diretas. O mapeamento
`courseActionBindings.js` vincula `tarefa` e `argumentos` nos grupos e conserva
os argumentos na raiz das operações diretas. A validação e os casos de uso
continuam compartilhados com o MCP; o OpenAPI preserva a autorização OAuth, as
indicações ao cliente e os schemas
específicos de cada tarefa. Os grupos estão descritos em
[Autoria por Actions](autoria-actions.md#operações).

`incorporar_pdf_como_fonte` adapta `openaiFileIdRefs` fornecido pelo ChatGPT. A
URL temporária do transporte é aceita apenas de origem autorizada e não entra no
schema que o modelo precisa preencher. A tarefa recebe exatamente um destino:
`fonte` anexa ou reanexa o PDF a uma fonte existente; `titulo` cria uma nova.

## Erros

Erros públicos distinguem:

- entrada inválida;
- autenticação ou autorização ausente;
- referência ambígua;
- objeto inexistente;
- conflito de estado;
- limite excedido;
- indisponibilidade transitória.

Uma resposta de erro informa se a operação pode ser retomada e qual decisão
humana falta. O serviço transforma erros internos do banco e do armazenamento
em mensagens adequadas à tarefa, sem expor credenciais ou caminhos internos.

## Continuação e reconstrução do conteúdo

Uma leitura pode ser maior que a resposta admitida pelo canal. Nesse caso, o
serviço devolve uma parte do conteúdo e uma referência para obter a seguinte.
`temMais: true` e `continuacao` não nula indicam que a leitura está incompleta.
O cliente reutiliza o valor recebido no mesmo recorte, sem editá-lo. Se a versão
mudar entre páginas, a leitura reinicia para evitar combinar estados diferentes.

Consultas extensas, como listas de cursos, fontes ou materiais de revisão, utilizam
continuação. No preparo de uma parte, as páginas carregam a proposta, a explicação
literal, as fontes e a revisão das microssequências; o repertório do curso avança com a
mesma continuação. A paginação limita o volume transferido em cada resposta; a decisão
pedagógica continua determinando quanto material precisa ser lido.

Resultados extensos podem usar fragmentos de JSON, formato que organiza dados
em campos. Esses fragmentos são trechos literais de um documento: precisam ser
concatenados na ordem antes de sua interpretação. As posições são contíguas em
UTF-16, a representação de texto usada pelo JavaScript. Uma página isolada não
constitui necessariamente um documento JSON válido.

`exportar_autoria` utiliza fragmentos mesmo quando basta uma resposta;
`comparar_cursos` os utiliza quando o resultado é extenso. Na exportação, o
hífen inseparável U+2011 aparece como o escape JSON `\u2011`. A concatenação e
`JSON.parse` reconstituem o conteúdo original. Posições UTF-16 e hash da
continuação correspondem ao JSON com esse escape. Essa distinção importa para
conferir a integridade sem modificar o texto exportado.

A exportação conserva o artefato literal e sua leitura autoral. A comparação
confronta dois recortes próprios e também seu inventário, sem inferir equivalência
pedagógica. Ambas exigem acesso de autoria aos cursos selecionados.

## Limites de tamanho

Cada camada limita corpo, resposta, listas e texto antes de alocar trabalho
desnecessário. PDFs aceitam até 20 MiB e são lidos como fluxo limitado. Páginas
de composição, fontes e observações possuem limites próprios.

Quando uma leitura excede o limite, a paginação recupera o conteúdo integral em
várias respostas. Uma escrita grande exige rever o recorte aceito pela operação;
isso não justifica truncar a explicação ou dividir unidades apenas para caber no
transporte. A organização didática e o tamanho de uma chamada são decisões
distintas.

## Verificação

```powershell
npm run test:authoring:contract
npm run test:authoring:mcp
npm run test:authoring:actions
npm run validate:course-runtime
```

Os testes conferem catálogo, schemas, autorização, erros retomáveis, paridade de
transportes e integração com os casos de uso. O cliente real é validado em uma
conexão e conversa novas depois da publicação.
