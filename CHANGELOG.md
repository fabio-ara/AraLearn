# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [Unreleased]

### Added

- plano de controle de autoria com artefatos JSON imutáveis no Supabase Storage,
  hashing canônico, referências pequenas, leases e feed de revisões;
- upload retomável TUS para artefatos maiores e verificação de hash, tamanho e
  UTF-8 em toda releitura;
- testes de concorrência que comprovam uma única gravação para três pedidos
  simultâneos com o mesmo `requestId`.

### Fixed

- materiais de Instruções e Conhecimento do Chatbot passam a abrir o seletor nativo de arquivo no APK Android;
- a API e o MCP de autoria aceitam a origem segura do WebView Android, permitindo listar e criar chaves pessoais no aplicativo.
- a Action de autoria repete gravações transitórias de forma idempotente, informa quando tentar novamente e preserva a retomada do registro de fontes;

### Changed

- planos, ledgers, especificações, submissões, auditorias e revisões completas
  deixam de ocupar JSONB no PostgreSQL;
- publicação privada e oficial passa a trocar um ponteiro de revisão imutável,
  sem reconstruir ou materializar cards no banco;
- o MCP aceita mensagens maiores sem herdar o orçamento reduzido das Actions;
- o limite artificial de 30 mil linhas relacionais é retirado da validação de
  cursos, pois o novo fluxo não converte revisões para linhas remotas;
- o planejamento de cursos passa a revisar automaticamente a cobertura da ementa, os pré-requisitos e a diversidade de prática antes de gravar o plano;
- os materiais de autoria incluem a revisão de cobertura e a retomada automática do registro de fontes para ChatGPT e demais assistentes compatíveis.

## [0.0.10] - 2026-07-24

### Added

- API de autoria do catálogo com planejamento, produção, auditoria, reparo, bloqueio por dúvida, validação e publicação retomável em partes;
- papéis editoriais por UUID, clientes com chave restrita, rotação, limite de requisições, auditoria e retenção do material transitório;
- importação iconográfica de curso privado na aba Trilhas e de curso público autorizado na aba Coleções;
- pacotes públicos de autoria para ChatGPT, Gemini, Microsoft 365, Claude e integrações genéricas, com esquemas, exemplos e OpenAPI;
- gateway MCP remoto de autoria, com transporte Streamable HTTP, ferramentas isoladas por escopo e o mesmo núcleo idempotente da API REST;
- comprovante assinado da releitura de cada entrega antes da auditoria, vinculado ao autor, ao cliente e ao hash persistido;
- autoria privada por integrações pessoais, com emissão, renovação e revogação de chaves restritas pela própria conta;
- oferta autorizada de um curso pessoal ao catálogo, sem permitir que a conta autora publique diretamente;
- intervenção assistida com seleção granular de cards e blocos, proteção do escopo escolhido e cópia pessoal antes da primeira alteração de um curso oficial;
- recurso declarativo para fórmulas matemáticas e químicas, prática digitada em lacunas, fluxogramas ramificados e acessibilidade dos recursos estruturados;
- conteúdo multilíngue com idioma BCP 47, direção de escrita e preservação relacional dos metadados;
- diagnóstico automatizado da implantação, verificação do site publicado e ensaios reais de confirmação e recuperação de conta no Supabase local.
- linguagem formal de autoria para lacunas, com marcadores `{gap:id}`, respostas por escolha ou digitação e compilação determinística para o contrato público;
- lacunas interativas em parágrafo, código, tabela, fluxograma, árvore, grafo, mapa de relações, matriz, plano, fórmula e composição de blocos;
- contrato consultável de recursos, com forma dos dados, usos pedagógicos, limitações, exemplos válidos e campos interativos de cada representação;
- mapa pedagógico de conceitos, operações e equívocos previsíveis, usado para continuidade entre partes e retomada do conhecimento anterior;
- ferramentas editoriais para consultar e organizar o catálogo, suas coleções e a árvore de cada curso sem acesso direto às tabelas;
- ferramentas pessoais para consultar cursos selecionados e organizar trilhas privadas com o mesmo isolamento aplicado no aplicativo;
- correção de conteúdo restrita a uma microssequência, com validação do curso remontado, gravação somente do recorte e cópia pessoal automática quando a edição parte de uma publicação oficial;
- coleção reservada `Outros`, que mantém todos os cursos oficiais classificados enquanto permite reorganizar e aposentar as demais coleções.

### Changed

- a biblioteca passa a reunir a configuração do chatbot do ChatGPT em um percurso curto de materiais, configuração e chave pessoal;
- Trilhas adota o mesmo padrão visual de Coleções e identifica a origem pelos cartões verdes de cursos oficiais e vermelhos de cursos pessoais, sem chips;
- cursos oferecidos e aceitos deixam a área privada e passam a ocupar a própria árvore oficial do catálogo, sem duplicação;
- a aba Trilhas identifica visualmente cursos do Catálogo e cursos Privados, inclusive cópias pessoais alteradas;
- o gateway MCP permite oferecer cursos próprios, acompanhar ofertas e executar a revisão editorial com permissões separadas;
- a publicação assistida usa as mesmas regras do contrato v3, da normalização relacional e do importador idempotente do catálogo;
- o papel de publicador permanece separado da administração de dados pessoais;
- quotas conservadoras e manutenção incremental limitam o espaço ocupado pelos rascunhos sem apagar publicações ou perder idempotência;
- o planejamento autoral passa a declarar pré-requisitos, idioma, escopo, resultados observáveis, operações e âncoras de contexto, com exemplo resolvido e prática suficiente antes da publicação;
- a implantação passa a distinguir os ambientes comprovados dos caminhos que ainda exigem adaptação, sem apresentar SharePoint, outro serviço de dados ou Supabase auto-hospedado como compatibilidade pronta;
- processos hospedados usam as chaves `sb_publishable_` e `sb_secret_` atuais do Supabase, enquanto as JWTs legadas ficam restritas ao stack local descartável;
- a primeira implantação da autoria gera dois segredos próprios e independentes para integrações pessoais e comprovantes de auditoria, sem gravá-los no computador.
- o agente de autoria passa a enviar somente campos formais; frases em linguagem natural orientam o conteúdo, mas não são convertidas em estrutura visual ou HTML;
- a seleção de recursos passa a considerar a operação de aprendizagem e a representação necessária, evitando usar parágrafo ou escolha quando tabela, código, hierarquia, fluxo, relação, espaço ou notação fazem parte do raciocínio;
- respostas digitadas admitem somente variantes literais declaradas e normalização objetiva, sem expressões regulares ou equivalência semântica inferida;
- a especificação de uma parte recebe o contorno imutável do plano já persistido e envia somente decisões autorais, reduzindo repetições e rejeições evitáveis;
- operações de consulta pelo MCP deixam de exigir identificadores de idempotência, mantidos apenas nas mutações;
- relações de pré-requisito passam a ser avaliadas de forma transitiva, com rejeição de ciclos e transporte apenas do recorte causal necessário à parte seguinte;
- cards retirados por uma correção conservam somente a identidade necessária para progresso e comentários; blocos e demais filhos continuam sendo removidos fisicamente.

### Fixed

- a exclusão de curso privado não deixa execuções publicadas em uma forma inválida;
- a retirada de cursos de Trilhas não falha ao atualizar o histórico de autoria;
- a especificação distribuída para Actions expõe todos os campos exigidos pela API e elimina parâmetros duplicados;
- falhas de implantação interrompem o processo na primeira etapa inválida e o site não é publicado contra uma revisão incompatível do banco;
- validações de continuidade preservam afirmações compartilhadas entre cards e rejeitam referências históricas divergentes;
- o smoke hospedado aceita a secret key moderna sem enviá-la como token Bearer.
- a validação editorial do catálogo passa a respeitar o modelo enxuto, sem consultar tombstones removidos das tabelas de conteúdo, e a contagem da árvore deixa de depender de SQL dinâmico ambíguo.
- a validação editorial passa a usar o hash canônico já persistido no curso, em vez de chamar o cálculo removido pelo corte enxuto.
- o roteiro de implantação aceita de forma segura as listas de origens copiadas do PowerShell, sem transformar a lista inteira em uma URL inválida.
- a fronteira MCP valida recursivamente os dados recebidos e informa o caminho e a causa de cada rejeição;
- a intenção de publicação, o registro de fontes e a auditoria das dez dimensões passam a ter formas completas e inequívocas no contrato exposto ao agente;
- respostas de autoria informam a próxima ação útil e conservam as etapas obrigatórias de releitura, auditoria, validação e confirmação de publicação;
- variantes de resposta em fluxogramas passam a aceitar apenas valores literais, sem o antigo campo de expressão regular no contrato, no runtime ou nas linhas relacionais.

## [0.0.9] - 2026-07-20

### Added

- schema relacional PostgreSQL/Supabase para a árvore didática, progresso, comentários, dispositivos, mutações idempotentes e feed incremental de alterações;
- autenticação por e-mail e senha com cadastro, confirmação, recuperação, sessão persistida, renovação e saída no runtime JavaScript compartilhado pela web e pelo APK;
- porta de autenticação compacta e iconográfica, saída sem tela transitória e exclusão autenticada da própria conta com limpeza dos dados pessoais remotos e da réplica local;
- réplica relacional `aralearn-relational-v2` no IndexedDB, com outbox, cursor de sincronização e tombstones;
- conversores completos entre o contrato público v3 e linhas relacionais, com round-trip sem perda, validação e hash canônico;
- RPCs transacionais e autorizadas para catálogo compartilhado, seleção, cópia sob demanda, sincronização e substituição de cards de uma microssequência;
- documentação de desenvolvimento local, implantação Supabase, segurança, sincronização e corte de legado;
- coleções oficiais pesquisáveis e trilhas pessoais muitos-para-muitos, com ordenação offline, RLS e sincronização incremental.

### Changed

- PostgreSQL/Supabase passa a ser a fonte canônica compartilhada; o IndexedDB funciona como réplica offline e nunca como documento único do projeto;
- o catálogo passa a ser exclusivamente remoto e lista somente metadados de cursos oficiais publicados;
- cada publicação oficial mantém uma única árvore compartilhada; adicionar um curso grava somente `user_course_selections` e baixa a réplica offline para o dispositivo;
- a primeira alteração autoral executa cópia sob demanda, com UUIDs novos, sem montar a árvore pessoal por requisições independentes do cliente;
- mudanças bottom-up, progresso e comentários passam a atualizar somente as linhas afetadas;
- a sincronização passa a separar falhas retentáveis, autenticação necessária e rejeições definitivas, com bootstrap atômico por high-water, pull progressivo e proteção do trabalho local durante rebootstrap ou revogação;
- a réplica IndexedDB passa a ser isolada fisicamente por UUID de usuário, e toda gravação local expõe estado de durabilidade e pode ser aguardada por `flush()` no navegador e no Android;
- privilégios diretos das tabelas técnicas foram removidos, a retenção usa watermark de dispositivos ativos e a CSP limita conexões à origem Supabase configurada;
- o contrato JSON `aralearn.contract` versão 3 permanece como formato público de importação e exportação, contexto de geração, validação e visão de domínio em memória.
- UUIDs de entidades oficiais passam a ser derivados de `identityKey`, preservando progresso e comentários em republicações editoriais;
- árvores baixadas passam por validação relacional e contratual antes da troca atômica do cache;
- arquivar uma publicação retira seleções e estado pessoal de modo transacional, emite tombstones e impede exclusão física acidental do catálogo canônico;
- a interface da biblioteca passa a organizar o catálogo por coleções e os cursos selecionados por trilhas pessoais, preservando o runtime de estudo, edição e assistência completo na web e no Android.

### Fixed

- erros transitórios de infraestrutura PostgreSQL durante o push agora revertem integralmente a operação e preservam a outbox para retry, em vez de registrar uma rejeição definitiva;
- fixtures SQL de cópia sob demanda passaram a verificar a árvore pessoal pelo escopo correto, sem ambiguidade com a publicação canônica.

### Removed

- catálogo operacional embarcado nos artefatos web e Android;
- persistência documental de projeto, progresso e comentários;
- leitura automática e migração do banco IndexedDB legado;
- funcionamento anônimo e caminhos de compatibilidade com o catálogo local anterior;
- compilador e loaders do catálogo embarcado, incluindo `scripts/compileEmbeddedCourseFromParts.mjs`.
- clonagem automática durante a seleção, refresh de cópia pessoal, `source_entity_id` por linha e caminhos de reconciliação da arquitetura anterior.

## [0.0.8] - 2026-07-18

### Changed

- persistência local consolidada no IndexedDB para cursos do usuário, progresso e comentários;
- catálogo oficial carregado de forma assíncrona a partir de um manifesto único, com três cursos embarcados;
- contrato JSON validado estritamente na importação, na persistência e no empacotamento;
- geração top-down e bottom-up unificada em uma configuração explícita de provider e perfil didático;
- runtime web e Android empacotado somente com módulos alcançáveis e cursos inscritos no manifesto;
- suíte ampliada com testes de progressão por toque, persistência real e artefatos publicados.

## [0.0.7] - 2026-07-10

### Added

- curso embarcado `Dataprev: Analista de Processamento`, com os módulos `Segurança da Informação`, `Gestão de Servidores` e `Redes de Computadores`;
- trilha Dataprev composta por `24` lições, `175` microssequências e `1.052` cards validados;
- cursos `Microsoft Azure AI Fundamentals (AI-900)` e `Fundamentos de IA e Análise de Dados` no mesmo catálogo oficial.

### Changed

- o curso embarcado passa a se chamar `Dataprev: Analista de Processamento` e tem objetivo alinhado à preparação completa para o cargo;
- o módulo inicial `Segurança da Informação` permanece estruturado nos dez tópicos do edital: políticas, procedimentos e gerenciamento, redes, vulnerabilidades e ataques, criptografia, softwares maliciosos, certificação digital, LGPD, IDS/IPS/SIEM e NIST Cybersecurity Framework 1.1;
- APK pública da versão `0.0.7` contém o catálogo oficial completo.

## [0.0.6] - 2026-07-08

### Changed

- expansão do curso embarcado `Microsoft Azure AI Fundamentals (AI-900)` das Partes 01 a 04 para as Partes 01 a 12, agora com `9` módulos, `12` lições, `72` microssequências e `858` cards ativos;
- integração das Partes 05 a 12 feita sobre o seed já saneado das Partes 01 a 04, evitando reintroduzir tabelas vazias e outros defeitos estruturais presentes nas entregas brutas iniciais;
- correção estrutural do runtime e do contrato para não aceitar mais `table` com linhas vazias ou desalinhadas e para renderizar `tree` como hierarquia real em vez de lista plana;
- suíte pública atualizada com regressões específicas para o AI-900 expandido e para os cenários de tabela inválida e árvore hierárquica;
- APK pública de release atualizada com a versão completa do curso AI-900 até a Parte 12.

## [0.0.5] - 2026-07-03

### Changed

- inclusão do curso embarcado `Microsoft Azure AI Fundamentals (AI-900)`, já compilado a partir das Partes 01 a 04, com `2` módulos, `4` lições, `24` microssequências e `269` cards ativos;
- auditoria e saneamento das entregas parciais do curso AI-900 antes da incorporação ao seed oficial, com normalização de `role`, conversão de `tree`, `relation_map` e `plane` para o contrato atual e limpeza de bastidor em textos e metadados;
- adição do compilador reutilizável `scripts/compileEmbeddedCourseFromParts.mjs` para recompilar cursos embarcados a partir de partes em `json` ou `zip` nas próximas rodadas;
- manifesto oficial dos cursos embarcados atualizado para carregar o novo curso AI-900 diretamente no app;
- correção do título visível do curso `Lógica de Programação 1` no seed oficial embarcado;
- APK pública de release atualizada com o curso AI-900 já embarcado, o catálogo reorganizado e o título corrigido de `Lógica de Programação 1`.

## [0.0.4] - 2026-07-02

### Changed

- migração coerente dos cursos embarcados oficiais para `JSON` em `src/data/embedded-courses`, sem wrappers `*SeedCourse.js`, sem lista hardcoded de factories em `src/ui` e com manifesto único em `embedded-seed-manifest.json`;
- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `8` módulos, `8` lições, `96` microssequências e `582` cards ativos, com as Aulas 5, 6, 7 e 8 integradas ao app;
- auditoria e saneamento das entregas brutas das Aulas 7 e 8 antes da incorporação ao seed oficial: remoção de campos extras de raiz, limpeza de bastidor e correção de `composite` de exercício para o shape compatível com o contrato atual;
- saneamento final da trilha de seed e adoção do manifesto como fonte única do catálogo oficial;
- carregamento Android alinhado ao mesmo manifesto usado na web;
- contrato ajustado para impedir `after` e `afterBlocks` com sintaxe de lacuna interativa;
- APK pública de release atualizada com o catálogo embarcado declarativo e a expansão de `Fundamentos` até a Aula 8.

## [0.0.3] - 2026-06-23

### Changed

- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `4` módulos, `4` lições, `43` microssequências e a nova Aula 4 sobre dados em planilhas Excel com Pandas;
- Aula 4 cobrindo estrutura tabular, leitura de Excel, inspeção de `shape`, `columns` e `dtypes`, conversão de datas, filtros, estatísticas, agrupamentos e checagens simples de qualidade;
- revisão editorial do seed de `Fundamentos` para remover bastidor e vocabulário artificial também na nova aula, além de corrigir a ponte entre leitura de CSV e leitura de Excel;
- APK pública de release atualizada com a quarta aula integrada ao curso.

## [0.0.2] - 2026-06-18

### Changed

- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `3` módulos, `3` lições, `32` microssequências e a nova Aula 3 sobre NumPy e Pandas;
- Aula 3 cobrindo leitura de CSV, métricas em colunas, filtros, classificação com `np.where()` e agrupamento por setor;
- revisão dos enunciados para manter a trilha focada no conteúdo, sem formulações editoriais de bastidor;
- cards da Aula 3 agora repetem no próprio card os quadros e resumos necessários aos exercícios;
- APK pública de release atualizada com a versão corrigida do curso.

## [0.0.1] - 2026-06-17

### Added

- aplicação web servida localmente, com projeto persistido no navegador;
- empacotamento Android por WebView, com build pública de depuração e release;
- contrato público `aralearn.contract`, versão `3`, para projeto, curso, módulo, lição, microssequência e card;
- edição de cursos, módulos, lições, microssequências e cards no app;
- importação e exportação em JSON;
- assistência top-down por API para transformar escopo em trilha;
- assistência bottom-up por API para gerar, corrigir, reforçar e continuar etapas locais;
- validações estruturais e didáticas antes de aceitar material gerado;
- renderização de cards como `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- cursos embarcados editáveis para estudo e revisão no próprio app;
- suíte automatizada com testes, validação de exemplo público, smoke tests, harnesses e benchmarks.
