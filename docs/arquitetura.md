# Arquitetura do AraLearn

O AraLearn organiza estudo e autoria em torno de um único Curso vivo. A mesma
identidade aparece na interface de Estudo, na Autoria, na API de Cursos e nas
ferramentas do Model Context Protocol (MCP). Esse desenho abrange Fontes e PDFs,
auditoria e correções, variantes e a projeção factual de Pesquisa.

A linha corrente é a 0.0.25. Ela reutiliza o ambiente hospedado na revisão
`20260820224424`, com a API de Cursos na revisão 5 e o MCP na revisão 120; não
há migração ou implantação de função associada a essa atualização de clientes.

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

Na Autoria, Planejamento, Parâmetros, Fontes, Estrutura, Inspeção, Discussões e
correções, Variantes, Pesquisa e Pessoas são capacidades projetadas dos
contratos do Curso, não documentos paralelos nem nove destinos permanentes. A
superfície de até 430 px usa quatro destinos conceituais: Curso, Revisar,
Pesquisa e Pessoas. Cada um revela as capacidades pelo objeto e pela tarefa
correntes, com a mesma composição no celular e no computador.

Na entrada de Estudo, descritores paginados alimentam um único combobox e uma
única prévia. A seleção não carrega a composição curricular. A ação
**Começar**, **Continuar** ou **Retomar** resolve a posição pertinente, valida a
composição e só então entra no Curso. A prévia consulta o documento validado no
IndexedDB para informar disponibilidade sem conexão; revogação elimina a cópia
e o ponto local. Esse contrato integra a versão 0.0.25.

O MCP conserva seis ferramentas estáveis: `listarCursos`, `lerCurso`,
`criarCurso`, `alterarCurso`, `gerirPessoas` e
`consultarComponentesDidaticos`. Fontes, auditoria, variantes e Pesquisa são
visões ou operações dessas ferramentas. O contrato não cria uma ferramenta
nova para cada painel da interface.

## Fluxo entre navegador e serviços

O caminho principal é:

```text
navegador → IndexedDB → Edge Function ou MCP → PostgreSQL e Storage
```

O sentido da seta indica a passagem da solicitação, não uma fila universal.
Cada trecho tem uma função distinta:

1. o navegador mantém sessão, navegação e estado transitório da interface;
2. o IndexedDB conserva a última composição íntegra, listas leves, posição de
   leitura, progresso, itens marcados para rever e filas próprias de Anotações;
3. a API de Cursos recebe alterações autorais do navegador com a sessão da
   pessoa;
4. o servidor MCP recebe chamadas de clientes conversacionais autenticados por
   OAuth 2.1 com PKCE;
5. as duas Edge Functions convergem no mesmo roteador e executor de operações;
6. o PostgreSQL aplica autorização, revisão esperada, idempotência e
   integridade relacional;
7. o Storage guarda avatares e PDFs privados, enquanto o banco guarda vínculo,
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

A inspeção autoral também é paginada. O cliente conserva no máximo quatro
páginas ou 8 MiB por Curso e limita a quantidade renderizada. Esse recorte
mantém rede, memória e documento visual previsíveis em dispositivos modestos.

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

O proprietário pode editar uma Unidade na Inspeção ou em Estudo sem criar uma
representação paralela. O renderer declara os caminhos textuais editáveis de
cada componente; o editor altera apenas esses caminhos, reconcilia respostas
associadas quando isso é inequívoco e valida novamente o envelope completo.

A gravação envia uma única Unidade, sua Microssequência pai, as revisões
esperadas do Curso e da Unidade, a proveniência efetiva e uma origem fechada:
`manual` ou `provider_assistance`. A API autentica o proprietário e a função SQL
aceita a operação somente pelo papel de servidor. Conteúdo, proveniência, revisão,
evento e recibo confirmam ou revertem juntos. Ao receber 2xx, o cliente persiste
primeiro o snapshot focal confirmado e promove Unidade, revisão e versão no
documento `course.v1`; só depois invalida as projeções anteriores. Estudo e
Inspeção podem reler a Unidade sem rede como confirmada, com sincronização
pendente. A escrita não é repetida. A releitura canônica da mesma revisão
substitui o snapshot; uma revisão superior o elimina como incorporado ou
superado. Saída local ou remota, revogação, limpeza do Curso ou perda de
autoridade purgam a cópia. Uma atualização externa rebasa as versões usadas pelo próximo CAS sem
perder seleção, progresso ou Observações.

Na primeira tentativa, o controlador fixa em memória a proveniência efetiva sob
o `requestId` e a assinatura da intenção. Uma repetição depois de resposta
perdida carrega exatamente esse instantâneo; reutilizar a identidade para outro
conteúdo é recusado. Esse dado transitório não amplia a réplica IndexedDB.

Uma edição apenas textual pode carregar o conjunto anterior de Fontes,
inclusive referências históricas, somente quando o JSONB coincide com a
proveniência efetiva anterior. Criar ou alterar um vínculo exige Fonte e Âncora
ativas nas revisões exatas. Essa exceção conserva dados migrados; ela não abre
uma nova via para gravar `legacy_reference`.

A assistência por API é uma entrada complementar desse mesmo editor. O
navegador envia pedido, valores textuais editáveis, título, papel, tópicos e as
mensagens anteriores da conversa contextual. O envelope não contém
`targetId`, `studyUnitId`, PDFs, Fontes ou outras Unidades. A resposta
estruturada usa `changes`, pode alterar no máximo um caminho permitido por
pedido e precisa formar uma Unidade válida antes de aparecer como rascunho. O
transporte admite até 8.000 tokens de saída. Cada valor editável fica limitado
a 6.000 caracteres e o contexto gravável completo, a 12.000; fora desse limite,
o controle da assistência fica indisponível com o motivo acessível, enquanto a
edição manual continua ativa.

Em produção, a única conexão disponível é um relay em `127.0.0.1`, `localhost`
ou `10.0.2.2`, na porta 4183. A credencial do provider permanece nesse serviço,
fora do AraLearn. A interface mostra **Serviço local** como valor fixo, pede
somente modelo e pedido e recolhe o endpoint em **Conexão**. Configuração e
conversa não entram no Curso nem no IndexedDB. A montagem de produção ignora
origens adicionais configuradas pelo ambiente e falha se o artefato contiver
runtime de desenvolvimento, origem extra ou credencial.

No navegador, o adaptador declara `targetAddressSpace` conforme o destino:
`loopback` para `127.0.0.1` e `localhost`, `local` apenas para `10.0.2.2`. Essa
distinção evita que um endereço de loopback seja apresentado incorretamente como
rede local às proteções do navegador.

No Android, uma ponte nativa aceita mensagens apenas do quadro principal na
origem `https://appassets.androidplatform.net` e chama exclusivamente
`http://127.0.0.1:4183/v1/chat/completions`. Ela aceita POST JSON sem credencial
do navegador, limita pedido e resposta a 128 KiB, aplica 45 segundos de espera e
propaga cancelamento. A chave continua no relay. A ponte não integra o artefato
do Pages.

Um runtime explicitamente identificado como desenvolvimento pode liberar
OpenAI, Gemini e DeepSeek diretos e o campo de chave, sempre com alerta de que o
navegador não protege credenciais duradouras. Nesse modo, cada provider continua
preso à sua própria origem exata, e a chave segue somente no cabeçalho.

Ao sair da conta ou encerrar a aplicação, a superfície de Estudo ou Autoria é
destruída e a chamada ao provider é cancelada antes de apagar a sessão e fechar
os armazenamentos locais. Uma resposta tardia não pode executar callback, reabrir
a sobreposição nem restaurar configuração ou credencial em memória.

## Fontes, ancoragens e PDFs

Fontes são registros relacionais com autoria, data parcial de publicação,
identificador, idioma BCP 47, citação, endereço, edição, origem, disponibilidade,
verificação e visibilidade. Revisões de fonte são acrescentadas ao histórico em
vez de sobrescrever sua proveniência.

Ancoragens ligam trechos do Curso às fontes. Atribuições e Anotações podem
referir-se a essas âncoras sem incorporar uma cópia opaca do documento.

PDFs ficam no bucket privado `course-source-pdfs`. O navegador faz a verificação
inicial do cabeçalho, calcula SHA-256 e solicita à API uma URL assinada de
envio. Antes de confirmar o vínculo relacional, a API lê o objeto com a
credencial do servidor e confere os bytes reais: limite, tamanho declarado,
cabeçalho `%PDF-` e SHA-256. O caminho físico segue
`<curso-de-origem>/<sha256>.pdf`; acesso depende do vínculo autorizado no
banco, não do conhecimento desse caminho.

Cada objeto aceita até 20 MiB. Um Curso pode vincular até 64 MiB de conteúdo
único e o detalhe de uma fonte retorna no máximo oito anexos. Conteúdo idêntico
é reaproveitado pelo hash dentro da mesma origem. Variantes podem compartilhar
o objeto imutável por vínculos próprios e autorizados.

## Auditoria, correções, variantes e Pesquisa

Auditoria registra ciclos, achados, decisões e vínculos com Anotações. Correções
continuam explícitas e sujeitas à revisão esperada do Curso. Esses dados ficam
no servidor e não possuem réplica autoral ou fila de saída no IndexedDB.

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

## Componentes didáticos

O catálogo corrente contém 32 pacotes versionados: 29 de conteúdo e três de
resposta. Busca e consulta retornam no máximo oito resultados por chamada e
cada contrato seleciona exatamente um `package@version`. O navegador e o MCP
usam o mesmo catálogo gerado, o que impede divergência entre criação,
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

O servidor MCP aceita OAuth 2.1 com PKCE e valida emissor, destinatário,
recurso, cliente, sujeito e validade temporal do token. O cliente confere o
estado da autorização antes de trocar o código. A API de Cursos exige origem
permitida e sessão Supabase. As origens públicas são configuradas de modo
exato, sem curingas de produção.

Os buckets `person-avatars` e `course-source-pdfs` são privados. URLs assinadas
têm duração limitada. O envio de avatar usa a pasta da própria conta e valida
JPEG, PNG ou WebP até 512 KiB. O envio de PDF passa pelo fluxo em duas etapas e
pelas cotas do Curso.

## Mapa do código

| Área | Implementação principal |
|---|---|
| domínio e composição de Curso | módulos `course*.js` em `src/domain/` |
| réplica local | `src/persistence/CourseLocalStore.js` e repositórios de Curso |
| acesso remoto e coordenação | `src/supabase/CourseApiClient.js`, `src/supabase/CourseController.js` |
| Estudo e Autoria | `src/study/`, `src/ui/` |
| edição contextual | `src/ui/manualStudyUnitEdit.js`, `src/ui/manualInlineFields.js`, `src/domain/courseComposition.js` |
| assistência complementar | `src/assist/`, `src/generation/providers/`, `src/ui/StudyUnitProviderAssistance.js` |
| catálogo e renderização | `src/resources/`, `src/render/` |
| cliente Supabase e sessão | `src/supabase/` |
| funções remotas | `supabase/functions/aralearn-course-api/`, `supabase/functions/aralearn-authoring-mcp/` |
| esquema e operações SQL | `supabase/migrations/` |
| implantação e verificação | `scripts/`, `.github/workflows/` |
| retirada controlada de estruturas substituídas | `scripts/courseCutover/` |

## Contrato implantável

Na linha publicada, `supabase/runtime-manifest.json` declara a revisão de esquema
`20260820224424`, a versão de contrato e todas as capacidades obrigatórias. O
site publica uma cópia desse manifesto. A inicialização compara o contrato
esperado com o ambiente remoto antes de oferecer operações dependentes dele.

A promoção exige migrações em paridade, análise do banco, testes de
concorrência, testes reais de funcionamento da API e do MCP, validação de
autenticação, testes do navegador e artefatos web e Android. A remoção física
de estruturas substituídas segue um plano separado, com inventário exato,
cópia verificada e ensaio de restauração. Ela não faz parte de uma atualização
rotineira de esquema.

Detalhes operacionais estão em [Persistência relacional e sincronização](persistencia-relacional.md),
[Supabase](supabase.md), [Implantação](implantacao.md) e
[Guia do desenvolvedor](guia-desenvolvedor.md).
