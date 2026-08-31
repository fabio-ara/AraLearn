# Arquitetura do AraLearn

O AraLearn organiza estudo e autoria em torno de um único Curso vivo. A mesma
identidade aparece na interface de Estudo, na Autoria, na API de Cursos e nas
integrações por Model Context Protocol (MCP) e Actions. Esse desenho abrange
Fontes e PDFs, auditoria e correções, variantes e a projeção factual de Pesquisa.

Os clientes correntes exigem o manifesto `20260831005116`. O ambiente hospedado
precisa expor essa revisão antes de oferecer operações dependentes dela. A
topologia relacional inclui minimização de sessão e MCP, retenção periódica,
upload autenticado de PDFs, operações de ciclo de vida e Actions/OpenAPI.

## O Curso como raiz do domínio

`public.courses` guarda a raiz identificável do Curso. O conteúdo curricular
fica em entidades ordenadas sob esta hierarquia:

```text
Curso
└── Módulo
    └── Lição
        ├── Tópico
        └── Microssequência
            └── Unidade de estudo
```

Tópico e Microssequência são filhos de Lição. A Unidade de estudo pertence a
uma Microssequência. Essa estrutura é compartilhada pelo estudo, pela inspeção
autoral e pelas operações conversacionais. Não existe uma segunda árvore de
autoria que precise ser convertida antes da publicação.

O Curso também reúne plano instrucional, parâmetros de desenho, política de
componentes, fontes, ancoragens, auditorias, correções e relações de variante.
Cada família conserva sua própria revisão e suas regras, mas todas se referem à
mesma raiz.

## Superfícies do produto

A interface separa responsabilidades sem duplicar o domínio:

| Superfície | Responsabilidade |
|---|---|
| Home | selecionar um Curso acessível, apresentar uma prévia rica e entrar pela posição pertinente |
| Estudo | apresentar Unidades, progresso, revisão e Anotações |
| Autoria | planejar, estruturar, inspecionar, auditar e analisar o Curso |
| API de Cursos | executar operações autorais solicitadas pelo navegador |
| servidor MCP | oferecer as mesmas operações a clientes conversacionais autorizados |
| Actions | oferecer seis operações canônicas e três projeções HTTP dedicadas descritas por OpenAPI a um GPT personalizado conectado |

Na Autoria, a Visão geral apresenta estado e próxima ação. Planejamento,
Conteúdo, Parâmetros e componentes, Fontes, Revisão, Variantes e pesquisa e
Pessoas e acesso são tarefas projetadas dos contratos do Curso, não documentos
paralelos nem módulos internos expostos. Todas ficam alcançáveis em um único
nível de escolha, com a mesma composição no celular e no computador.

Na entrada de Estudo, descritores paginados alimentam um único combobox e uma
única prévia. A seleção não carrega a composição curricular. A ação **Abrir**
valida a composição e entra sempre no Curso pela lista de Módulos; o progresso
permanece visível e persistido, mas não vira um atalho implícito para uma Unidade.
**Rever** e endereços diretos continuam levando ao alvo explícito. A prévia
consulta o documento validado no IndexedDB para informar disponibilidade sem
conexão; revogação elimina a réplica local do Curso compartilhado e o ponto
local, sem apagar uma cópia pessoal já confirmada.

O MCP conserva seis ferramentas canônicas: `listarCursos`, `lerCurso`,
`criarCurso`, `alterarCurso`, `consultarComponentesDidaticos` e
`incorporarPdfComoFonte`. A descoberta acrescenta `add_part`, uma projeção
dedicada que retira do modelo a geração da identidade de uma Parte nova e evita
competição com `alterarCurso`. Fontes, auditoria, variantes e Pesquisa continuam
como visões ou operações das ferramentas canônicas. O contrato não cria uma
ferramenta nova para cada painel da interface. Perfil, avatar e acesso direto
pertencem à aplicação autenticada; o e-mail usado para conceder acesso não é
enviado ao cliente MCP nem ao GPT conectado por Actions.

## Protocolo público de Autoria

MCP e Actions projetam um protocolo público próprio, em vez de derivar sua
linguagem dos tipos internos do domínio. A autoridade corrente é
`aralearn.authoring-protocol.v1`, definida em `authoringProtocolV1.js`. Ela
reúne as seis operações canônicas, seus esquemas de entrada e saída, discriminadores,
condicionais e vocabulários. Uma mudança interna no domínio ou na persistência
não altera esse idioma por consequência.

A projeção OpenAPI acrescenta três caminhos dedicados para criar e atualizar
itens do plano e criar uma Parte. Eles especializam a operação canônica de
alteração para o importador de Actions; não criam uma segunda regra de domínio.
O MCP projeta somente a criação de Parte, justificada pela seleção observada no
cliente real; as demais variantes permanecem na operação canônica.

A projeção conversacional compartilhada possui identidade própria e cobre as
seis operações canônicas depois da especialização de PDF. O MCP identifica
separadamente seu catálogo completo de sete ferramentas por
`_meta.mcpCatalog` e `X-AraLearn-Authoring-Mcp-Catalog`; esse fingerprint inclui
`add_part` e a forma de `alterarCurso` sem a variante concorrente. Actions não
serve essa identidade MCP e continua identificada pelo contrato canônico, pela
projeção conversacional e pelo OpenAPI publicado.

`courseMcpTools.js` é o adaptador explícito entre o protocolo e o backend. Ele
confere os argumentos públicos, converte cada chamada para a rota ou comando
interno pertinente e mantém os validadores do domínio como última fronteira de
integridade. Esse corte permite evoluir a implementação sem publicar nomes
internos e impede que um alias inventado pelo cliente passe a ser aceito apenas
para ocultar uma projeção defasada.

Os transportes partem da mesma autoridade, mas não servem o mesmo documento:

- MCP e Actions compartilham uma projeção conversacional que separa criação
  bibliográfica e revisão completa na incorporação de PDF;
- o MCP acrescenta segurança OAuth e metadados próprios do transporte e do
  recurso visual, além da identidade de seu catálogo projetado completo;
- Actions compila uma projeção OpenAPI adequada ao importador do ChatGPT,
  associa cada ferramenta a um caminho HTTP e usa seu OAuth próprio. Como o
  importador achata unions de objetos, a intenção de PDF em Actions usa três
  propriedades alternativas e `minProperties/maxProperties = 1`, em vez de
  pedir que o modelo combine um discriminador com outro campo.

O executor conserva identidades, revisões, versões esperadas, chaves de
repetição e detalhes de diagnóstico no resultado estruturado. Uma projeção
conversacional separada apresenta o estado e os efeitos do Curso em linguagem
humana. A fronteira é explícita: **preservar internamente != mostrar ao
usuário**. Controles de concorrência continuam disponíveis ao cliente sem se
tornarem requisitos de retomada para a pessoa.

Antes do adaptador de domínio, o executor comum completa identidades ausentes
de entidades novas. A derivação combina Curso, `requestId`, operação e posição
estrutural, de modo que um retry reconstrói o mesmo UUID e conserva o mesmo
payload idempotente. IDs presentes continuam sendo preservados para clientes
anteriores e para referências lidas do Curso. Relações entre vários objetos
novos usam índices locais validados, resolvidos antes da escrita. Assim, o
modelo descreve Parte, resultado, unidade de análise, requisito de evidência,
Fonte, Âncora ou composição, mas não inventa sua identidade técnica.

Um arquivo transportado pela conversa só ganha vínculo persistente com uma
Fonte quando sua função no Curso é clara ou confirmada. Depois que a ingestão
canônica confirma esse vínculo, PDF, revisão e Âncoras pertencem ao Curso vivo e
podem ser recuperados por outra sessão; a memória da conversa não participa
dessa persistência.

A repetição consulta antes do download um recibo curto, owner-only e ligado à
identidade pública estável do arquivo, nunca à URL temporária. O recibo só é
aceito depois de revalidar propriedade e o objeto privado no Storage; outro PDF
sob o mesmo `requestId` é recusado. A escrita original e o recibo são atômicos,
e recibos expirados deixam de bloquear uma nova tentativa.

O sufixo v1 do identificador fixa o major público. `schemaVersion` distingue os
snapshots semânticos dessa linha e o fingerprint SHA-256 identifica exatamente
o catálogo, inclusive sua versão. Mudanças compatíveis podem acrescentar
vocabulário dentro do mesmo major; remover ferramenta ou discriminador,
estreitar enum ou limite, tornar campo obrigatório ou acrescentar proibição é
ruptura. Um snapshot aprovado não é sobrescrito. Uma evolução incompatível
exige novo major e não autoriza retirar a linha v1 enquanto houver consumidores
que ainda dependam dela.

## Shell web e inicialização

O shell web é a camada que consegue abrir antes de qualquer Curso. HTML fornece
a estrutura inicial, CSS define apresentação e responsividade, e módulos
JavaScript carregam autenticação, armazenamento e as superfícies de produto. A
inicialização abre primeiro o armazenamento da sessão, lê somente a URL e a
chave publicável do projeto Supabase e decide entre configuração ausente,
entrada, recuperação de conta, consentimento OAuth ou aplicação autenticada.
Somente depois de identificar a conta ela abre o banco local daquele usuário e
monta Estudo e Autoria. Encerramento remoto de sessão destrói essas superfícies,
cancela chamadas em andamento e fecha as conexões locais antes de voltar à
entrada.

No site de produção, um [service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
intercepta apenas requisições `GET` da mesma origem. Ele instala um conjunto
versionado de arquivos do shell, tenta a rede primeiro e usa a cópia anterior
quando a rede falha. Endereços com parâmetros de consulta não entram no cache,
para não conservar retornos do fluxo PKCE. Uma navegação sem resposta pode
receber o `index.html` já instalado. Caches de versões antigas são removidos na
ativação.

Esse cache torna a interface carregável; ele não contém Cursos nem substitui o
[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), que
guarda a réplica por conta e as filas explicitamente previstas. Em
desenvolvimento, o registro correspondente é removido para que o teste não seja
enganado por um shell antigo. No Android, o service worker não é registrado:
os arquivos já pertencem ao APK e são servidos pela origem interna da WebView.

## Fluxo entre navegador e serviços

Os caminhos principais são:

```text
aplicação web ou Android → IndexedDB da conta
aplicação web ou Android → aralearn-course-api ┐
cliente MCP              → aralearn-authoring-mcp ├→ executor comum → PostgreSQL e Storage
GPT conectado por Actions → aralearn-authoring-action ┘
```

O IndexedDB participa somente do caminho da aplicação. MCP e Actions chegam por
suas próprias Edge Functions e não atravessam a réplica local do navegador. O
sentido da seta indica passagem da solicitação, não uma fila universal. Cada
trecho tem uma função distinta:

1. o navegador mantém uma projeção mínima da sessão, navegação e estado
   transitório da interface;
2. o IndexedDB conserva a última composição íntegra, listas leves, posição de
   leitura, progresso, itens marcados para rever e filas próprias de Anotações;
3. a API de Cursos recebe alterações autorais do navegador com a sessão da
   pessoa;
4. o servidor MCP recebe chamadas de clientes conversacionais autenticados por
   OAuth 2.1 com PKCE;
5. a função de Actions recebe chamadas HTTP de um GPT conectado pelo OAuth
   próprio desse canal;
6. as três Edge Functions convergem no mesmo roteador e executor de operações,
   embora cada transporte autentique seu próprio principal;
7. o PostgreSQL aplica autorização, revisão esperada, idempotência e
   integridade relacional;
8. o Storage guarda avatares e PDFs privados, enquanto o banco guarda vínculo,
   autoria, hash e permissões.

Estudo usa ainda leituras autenticadas por PostgREST e funções SQL para Cursos
acessíveis, estado pessoal e Anotações. Autoria permanece on-line porque suas
mudanças dependem da revisão corrente e de verificações relacionais. A réplica
local não se torna autoridade autoral.

## Leitura paginada e réplica local

A Home recebe uma lista pequena de cabeçalhos. A composição completa só é
buscada quando a pessoa abre um Curso. Cabeçalho e páginas informam a mesma
revisão esperada; se o Curso mudar durante a leitura, a composição candidata é
descartada.

O `CourseLocalStore` usa o banco
`aralearn-course-v1-<identificador-da-conta>` e a store `course_cache`. Uma
revisão nova só substitui o ponteiro da composição válida depois que todas as
páginas foram reunidas e validadas. Se a candidata estiver incompleta ou
inválida, a revisão anterior continua disponível como leitura desatualizada e
somente leitura, inclusive depois de reiniciar o aplicativo.

O logout comum fecha as conexões, mas preserva esse banco por decisão de produto
para manter o estudo offline, as filas e os rascunhos que já estavam
persistidos. Uma alteração aberta somente no formulário não integra essa
garantia e exige confirmação de perda antes da saída. As ações explícitas de
limpeza removem somente `aralearn-course-v1-<identificador-da-conta>` da conta
ativa; a opção com saída também elimina a sessão. A sessão persiste somente
tokens, tipo, expiração e `user.id`, sem duplicar e-mail ou perfil.

Na exclusão de conta, a confirmação remota é o ponto terminal. Se outra aba
bloquear a remoção do IndexedDB depois desse sucesso, a conta já não existe e a
interface oferece somente repetir a limpeza local; ela não tenta excluir a
conta novamente nem apresenta o estado como falha remota.

A inspeção autoral também é paginada. O cliente conserva no máximo quatro
páginas ou 8 MiB por Curso e limita a quantidade renderizada. Esse recorte
estabelece tetos observáveis de rede, memória mantida pelo cache e quantidade de
Unidades no documento. Adequação a um dispositivo específico ainda precisa ser
verificada nesse aparelho.

A mesma página projeta, junto de cada Unidade, a quantidade de Observações
pendentes, sua materialização de origem e o desenho efetivo usado naquela
produção. A comparação com o desenho vigente é derivada no servidor em uma
única leitura paginada; a interface apresenta valores e origens legíveis, sem
expor hashes nem buscar Observações ou parâmetros Unidade por Unidade.

Um foco de inspeção persiste apenas Curso, revisão de origem, título e ordem de
até 64 identidades de Unidade. A leitura sempre projeta as versões correntes do
Curso e indica identidades que já não estão disponíveis. MCP Apps e o endereço
filtrado da Autoria consomem essa mesma projeção; não há cópia de conteúdo nem
segundo renderer.

Estado pessoal e Anotações possuem contratos independentes. Progresso e itens
para rever usam estado pessoal v2. Anotações guardam texto, classificação,
âncoras e citações em repositório próprio. As filas locais dessas duas famílias
não autorizam uma fila genérica para toda mutação do produto.

## Escritas concorrentes

Operações que alteram o Curso enviam a revisão esperada. O servidor só aceita a
mudança quando essa revisão ainda é corrente. Conflitos retornam a revisão
atual para que o cliente releia o estado antes de decidir uma nova alteração.

Cada pedido mutável também possui identificador idempotente. Repetir o mesmo
pedido dentro da janela de retenção devolve o resultado registrado, sem
duplicar o efeito. Uma operação sem mudança material conserva a revisão e não
cria evento artificial.

Esses dois mecanismos resolvem problemas diferentes. A comparação de revisão
impede sobrescrita concorrente; a idempotência torna segura a repetição causada
por rede instável.

## Edição contextual da Unidade

O proprietário pode editar uma Unidade em Conteúdo ou em Estudo sem criar uma
representação paralela. O renderer declara os caminhos textuais editáveis de
cada componente; o editor altera apenas esses caminhos, reconcilia respostas
associadas quando isso é inequívoco e valida novamente o envelope completo.

A gravação do proprietário envia uma única Unidade, sua Microssequência pai, as
revisões esperadas do Curso e da Unidade, a proveniência efetiva e uma origem
fechada: `manual` ou `provider_assistance`. A API autentica o proprietário e a
função SQL aceita a operação somente pelo papel de servidor. Conteúdo,
proveniência, revisão, evento e recibo confirmam ou revertem juntos. Ao receber
2xx, o cliente persiste primeiro o instantâneo focal confirmado e promove Unidade,
revisão e versão no documento `course.v1`; só depois invalida as projeções
anteriores. Estudo e Conteúdo podem reler a Unidade sem rede como confirmada,
com sincronização pendente. A escrita não é repetida. A releitura canônica da
mesma revisão substitui o instantâneo; uma revisão superior o elimina como
incorporado ou superado. Saída local ou remota, revogação, limpeza do Curso ou
perda de autoridade purgam a réplica. Uma atualização externa rebasa as versões
usadas pelo próximo CAS sem perder seleção, progresso ou Observações.

### Cópia pessoal em Estudo

Quando a pessoa possui acesso direto, mas não é proprietária, a
primeira gravação com mudança material materializa um Curso privado pertencente
a ela e aplica a Unidade editada nesse novo Curso. O original não recebe escrita.
O cliente muda de Curso preservando Microssequência, Unidade e posição visual.

A cópia conserva título, objetivo, identidades da composição, hierarquia e
posição necessários para continuar o estudo. Ela inicia planejamento próprio e
não copia Fontes, Âncoras, PDFs, acessos, estado pessoal ou Observações. Esses
dados permanecem ligados ao Curso em que foram produzidos. Abrir o editor, gerar
uma prévia, cancelar, falhar ou enviar conteúdo idêntico não cria outro Curso.

A aplicação usa uma operação estreita separada da composição autoral canônica.
Ela valida acesso ao original, revisão do Curso, versão e posição da Unidade,
serializa a criação por pessoa e Curso de origem e grava cópia, primeira edição,
eventos e recibo na mesma transação. O mesmo pedido pode ser repetido; outra
intenção concorrente recebe conflito e não cria uma segunda cópia. O MCP e a
operação do proprietário continuam com a autorização anterior.

Se a conexão falhar ou a resposta ficar ambígua, somente o envelope final dessa
primeira gravação fica no IndexedDB: origem, seleção, versões, Unidade editada e
identificador de pedido. Conversa, configuração e credencial do provedor não
integram esse estado. A reconexão repete a mesma intenção e a confirmação promove
o Curso pessoal. Essa capacidade usa o PostgreSQL, as Edge Functions e o
IndexedDB correntes; não introduz Git nem uma camada futura de versionamento.

Na primeira tentativa, o controlador fixa em memória a proveniência efetiva sob
o `requestId` e a assinatura da intenção. Uma repetição depois de resposta
perdida carrega exatamente esse instantâneo; reutilizar a identidade para outro
conteúdo é recusado. Esse dado transitório não amplia a réplica IndexedDB.

Uma edição apenas textual pode carregar o conjunto anterior de Fontes,
inclusive referências históricas, somente quando o JSONB coincide com a
proveniência efetiva anterior. Criar ou alterar um vínculo exige Fonte e Âncora
ativas nas revisões exatas. Essa exceção conserva dados migrados; ela não abre
uma nova via para gravar `legacy_reference`.

A Assistência por IA é uma sessão contextual sobre o mesmo Curso. O serviço
escolhido recebe a mensagem, o conteúdo selecionado, o restante do objeto atual
como contexto, um resumo do Curso, as mensagens recentes e a proposta corrente.
Cada turno devolve a melhor proposta concreta compatível com a conversa. PDFs,
Fontes e dados da conta não entram no envelope.

Somente o aceite explícito da proposta inicia a escrita tipada sobre Unidade,
Microssequência ou Lição. Ao usar componentes didáticos, consulta primeiro as
famílias pertinentes, obtém somente os contratos exatos, gera a candidata,
valida e admite reparos delimitados. O renderer canônico precisa aceitar a
composição antes da aplicação ao rascunho. JSON bem formado não é suficiente,
e uma candidata inválida ou não renderizável nunca substitui o conteúdo
corrente.

A conexão de produção é direta com OpenAI, Gemini ou DeepSeek, escolhidos pela
pessoa. Provider, modelo, chave, conversa e candidata permanecem apenas na
memória da sessão; a chave segue somente no cabeçalho da origem oficial do
provider e nunca entra no Curso, IndexedDB, Storage, logs ou artefatos. A
interface normal não oferece endpoint configurável nem descreve arquitetura de
transporte.

Cada adaptador permanece preso à origem oficial de seu provider, monta o
envelope compatível e normaliza a resposta para a mesma conversa contextual.
Testes usam stubs determinísticos dos três providers. Sair, recarregar ou
encerrar a superfície cancela a chamada e apaga a configuração efêmera.

Ao sair da conta ou encerrar a aplicação, a superfície de Estudo ou Autoria é
destruída e a chamada ao provedor é cancelada antes de apagar a sessão e fechar
os armazenamentos locais. Uma resposta tardia não pode executar callback, reabrir
a sobreposição nem restaurar configuração ou credencial em memória.

## Fontes, ancoragens e PDFs

Fontes são registros relacionais com autoria, data parcial de publicação,
identificador, idioma BCP 47, citação, endereço, edição, origem, disponibilidade,
verificação e visibilidade. Revisões de fonte são acrescentadas ao histórico em
vez de sobrescrever sua proveniência.

Ancoragens ligam trechos do Curso às fontes. Atribuições e Anotações podem
referir-se a essas âncoras sem incorporar uma cópia opaca do documento.

PDFs ficam no bucket privado `course-source-pdfs`. A interface entrega o arquivo
à API autenticada, sem calcular ou declarar sua identidade binária. O serviço de
ingestão lê no máximo 20 MiB, confere tipo, assinatura e estrutura mínima do PDF,
calcula tamanho e SHA-256 e só então reserva cota e escolhe o objeto privado. O
caminho físico segue `<curso-de-origem>/<sha256>.pdf`; acesso depende do vínculo
autorizado no banco, não do conhecimento desse caminho.

Quando a ingestão também cria ou revisa a Fonte, essa revisão bibliográfica e o
vínculo do PDF são confirmados na mesma transação depois que o objeto existe.
Repetições usam o recibo do pedido e voltam a verificar o objeto por conteúdo antes
de afirmar que ele está armazenado. Se uma etapa posterior falha, a API encerra a
autorização de envio e deixa o eventual objeto sem vínculo para o reconciliador já
existente; assim, não apaga um blob que outra ingestão possa vincular no intervalo.

Um upload cujo conteúdo não corresponde aos bytes recebidos não recebe vínculo.
Resíduos permanecem classificáveis pelo inventário administrativo e podem ser
reaproveitados por uma repetição válida ou removidos depois da idade de segurança.

`download` responde com o contrato temporário de leitura; `prepare_upload`
responde com o contrato autenticado e nunca devolve URL assinada de envio. A
distinção vem da operação, não de `User-Agent`.

Cada objeto aceita até 20 MiB. Um Curso pode vincular até 64 MiB de conteúdo
único e o detalhe de uma fonte retorna no máximo oito anexos. Conteúdo idêntico
é reaproveitado pelo hash dentro da mesma origem. Variantes podem compartilhar
o objeto imutável por vínculos próprios e autorizados.

## Auditoria, correções, variantes e Pesquisa

Auditoria registra ciclos, achados, decisões e vínculos com Anotações. Correções
continuam explícitas e sujeitas à revisão esperada do Curso. Esses dados ficam
no servidor e não possuem réplica autoral ou fila de saída no IndexedDB.
Quando a verificação de um achado confirma o reparo, a mesma transação atualiza
as Observações vinculadas; um resultado ainda aberto as reabre. Assim, a pessoa
não precisa executar uma segunda ação administrativa e o replay do comando
continua idempotente.

Uma comparação de variantes parte de um ponto de controle imutável do plano e
cria de dois a oito Cursos independentes. Ela copia desenho, fontes,
ancoragens e vínculos de PDF pertinentes, mas cada Curso materializa suas
Unidades de estudo separadamente. A comparação descreve parâmetros efetivos,
materialização, componentes, fontes e desvios observados. Ela não distribui
participantes nem sustenta inferência causal.

Pesquisa é uma projeção atual das autoridades do Curso, produzida pela função
`get_owned_course_authoring_analytics_for_actor_v1`. Ela não usa uma base
analítica paralela como fonte. A projeção, disponível apenas ao proprietário,
expõe atividade, materializações, desenho, fontes, Anotações, auditorias e
variantes, com filtros, cursor e até duzentas linhas por página. Os fatos excluem
identificadores pessoais, e-mail, texto bruto e instantâneos integrais.
Gráficos possuem tabela equivalente; exportação CSV ou JSON percorre todas as
páginas solicitadas.

IDs, hashes e horários ainda podem ser correlacionados com pessoas e operações.
Por isso a projeção é tratada como pessoal ou pseudonimizada enquanto houver
meio razoável de fazer essa relação, e não como conjunto anônimo.

## Componentes didáticos

O catálogo corrente contém 32 pacotes versionados: 29 de conteúdo e três de
resposta. Busca e consulta retornam no máximo oito resultados por chamada e
cada contrato seleciona exatamente um `package@version`. Navegador, MCP e
Actions usam o mesmo catálogo gerado, o que impede divergência entre criação,
validação e renderização.

Um pacote define contrato, dados de exemplo, limites e representação
acessível. A Unidade de estudo guarda a instância validada; o renderizador não
reinterpreta um formato autoral antigo.

## Segurança por fronteira

A sessão comum do Supabase identifica a pessoa no navegador. Tabelas expostas
pela API de dados exigem privilégios explícitos e políticas de segurança por
linha. Leituras de Estudo limitam-se a Cursos próprios ou compartilhados,
estado pessoal da própria conta e Anotações autorizadas.

A credencial administrativa existe somente nas Edge Functions. Antes de
qualquer operação privilegiada, a função valida o token recebido e repassa a
identidade ao contrato SQL exclusivo do proprietário. O navegador nunca recebe
essa credencial.

O servidor MCP aceita [OAuth 2.1](https://supabase.com/docs/guides/auth/oauth-server)
com [PKCE](https://www.rfc-editor.org/rfc/rfc7636) e anuncia
somente o escopo `offline_access`; a troca e a renovação não emitem `id_token`.
O access token usa aliases pareados distintos em `sub` e `session_id` e não é
uma sessão da aplicação. Ele conserva `aralearn_session_id`, o identificador
real e correlacionável da sessão de origem necessário à RPC, sem expor o UUID da
pessoa; por isso a credencial inteira não é anônima. A Edge Function valida
ES256 com chave EC P-256 pela
JWKS do emissor, além de emissor, destinatário, tempos, cliente e escopo. Uma
RPC exclusiva do papel de serviço resolve a pessoa e exige sessão de origem,
cliente e consentimento ainda vivos. O mesmo bearer é recusado diretamente no
GoTrue, na API de dados e no Storage.

Consentimentos inválidos e sessões OAuth encerradas não renovam acesso. Um token
já emitido permanece criptograficamente válido somente até `exp`. A API de
Cursos exige origem permitida e sessão Supabase comum. As
origens públicas são configuradas
de modo exato, sem curingas de produção.

Actions usa outra concessão: um cliente confidencial ligado ao GPT, código de
autorização, escopos `openid email`, access token opaco e refresh token rotativo.
O endpoint resolve esse token no banco antes de executar a operação. Ele não
aceita o bearer JWT do MCP, e o MCP não aceita o token opaco de Actions. O
documento [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) descreve caminhos,
corpos, respostas e OAuth para a importação da Action; ele descreve a API, mas
não substitui autorização nem validação no servidor.

Os buckets `person-avatars` e `course-source-pdfs` são privados. URLs assinadas
têm duração limitada; o download de PDF expira em 60 segundos e uma URL emitida
continua válida até esse prazo. O envio de avatar usa a pasta da própria conta e
valida JPEG, PNG ou WebP até 512 KiB. Avatar e PDF também exigem
uma sessão ainda presente no Auth; o PDF passa pelo fluxo autenticado em duas
etapas e pelas cotas do Curso.

## Mapa do código

| Área | Implementação principal |
|---|---|
| domínio e composição de Curso | módulos `course*.js` em `src/domain/` |
| réplica local | `src/persistence/CourseLocalStore.js` e repositórios de Curso |
| acesso remoto e coordenação | `src/supabase/CourseApiClient.js`, `src/supabase/CourseController.js` |
| Estudo e Autoria | `src/study/`, `src/ui/` |
| edição contextual | `src/ui/manualStudyUnitEdit.js`, `src/ui/manualInlineFields.js`, `src/domain/courseComposition.js` |
| assistência contextual | `src/assist/`, `src/generation/providers/`, `src/ui/CourseProviderAssistance.js` |
| catálogo e renderização | `src/resources/`, `src/render/` |
| cliente Supabase e sessão | `src/supabase/` |
| protocolo público de Autoria | `supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js` e snapshots em `tests/fixtures/authoring-protocol/` |
| adaptação do protocolo ao backend e MCP | `supabase/functions/_shared/aralearn-authoring/courseMcpTools.js` |
| identidades de criação conversacional | `supabase/functions/_shared/aralearn-authoring/trustedCreationIdentity.js` |
| criação e revisão conversacional de Fonte PDF | `supabase/functions/_shared/aralearn-authoring/conversationalPdfSourceProjection.js` |
| projeção para Actions | `scripts/projectChatGptActionSchemas.mjs` e `scripts/buildChatGptActionOpenApi.mjs` |
| funções remotas | `supabase/functions/aralearn-course-api/`, `supabase/functions/aralearn-authoring-mcp/`, `supabase/functions/aralearn-authoring-action/` |
| esquema e operações SQL | `supabase/migrations/` |
| implantação e verificação | `scripts/`, `.github/workflows/` |

## Contrato implantável

No repositório publicado, `supabase/runtime-manifest.json` declara a revisão de
esquema `20260831005116` e a versão de contrato. O
backend hospedado e os clientes precisam usar essa revisão. A
inicialização compara o contrato esperado com o ambiente remoto antes de
oferecer operações dependentes dele.

O protocolo público possui identidade implantável independente do manifesto do
banco. O fingerprint identifica o runtime canônico; projeções conversacionais
compatíveis podem mudar sua forma descoberta sem alterar o superset aceito. O
OpenAPI declara seu identificador, `schemaVersion` e fingerprint. O
MCP repete os mesmos valores em `initialize`, `tools/list` e no cabeçalho
`X-AraLearn-Authoring-Contract`; a Action envia esse cabeçalho em respostas e
preflights. Assim uma diferença de implantação ou cache pode ser diagnosticada
sem inferir a revisão pelo conteúdo de uma chamada.

A projeção compartilhada das seis operações canônicas tem ID, versão e hash
próprios, expostos no OpenAPI, em `_meta.conversationalProjection` e no
cabeçalho `X-AraLearn-Authoring-Projection`. O catálogo MCP completo de sete
ferramentas tem fingerprint independente em `_meta.mcpCatalog` e
`X-AraLearn-Authoring-Mcp-Catalog`. Esses snapshots impedem que uma mudança na
discovery conserve silenciosamente a identidade anterior.

A promoção exige migrações em paridade, análise do banco, testes de
concorrência, testes reais de funcionamento da API, do MCP e de Actions, validação de
autenticação, testes do navegador e artefatos web e Android. O smoke hospedado
compara o esquema completo servido por `tools/list` e a identidade do catálogo
MCP com a projeção local, ignorando apenas metadados de transporte na comparação
estrutural. O fluxo de implantação também recusa uma Action cujo preflight
anuncie outro fingerprint da projeção compartilhada; não exige nela a identidade
exclusiva do MCP.

Detalhes operacionais estão em [Persistência relacional e sincronização](persistencia-relacional.md),
[Supabase](supabase.md), [Implantação](implantacao.md) e
[Guia do desenvolvedor](guia-desenvolvedor.md).
