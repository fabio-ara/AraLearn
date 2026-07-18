# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [0.1.0] - 2026-07-18

### Added

- schema relacional PostgreSQL/Supabase para a árvore didática, progresso, comentários, dispositivos, mutações idempotentes e feed incremental de alterações;
- autenticação por e-mail e senha com cadastro, confirmação, recuperação, sessão persistida, renovação e saída no runtime JavaScript compartilhado pela web e pelo APK;
- réplica relacional `aralearn-relational-v1` no IndexedDB, com outbox, cursor de sincronização, tombstones e preservação explícita de conflitos;
- conversores completos entre o contrato público v3 e linhas relacionais, com round-trip sem perda, validação e hash canônico;
- RPCs transacionais e autorizadas para catálogo, clonagem, atualização de cópia pessoal, sincronização e substituição de cards de uma microssequência;
- documentação de desenvolvimento local, implantação Supabase, segurança, sincronização e corte de legado.

### Changed

- PostgreSQL/Supabase passa a ser a fonte canônica compartilhada; o IndexedDB funciona como réplica offline e nunca como documento único do projeto;
- o catálogo passa a ser exclusivamente remoto e lista somente metadados de cursos oficiais publicados;
- cursos escolhidos são clonados no servidor com novos UUIDs e `source_entity_id`, sem montagem da cópia por requisições independentes do cliente;
- mudanças bottom-up, progresso e comentários passam a atualizar somente as linhas afetadas;
- a sincronização passa a separar falhas retentáveis, autenticação necessária, conflitos e rejeições definitivas, com bootstrap atômico por high-water, pull progressivo e proteção do trabalho local durante rebootstrap ou revogação;
- a réplica IndexedDB passa a ser isolada fisicamente por UUID de usuário, e toda gravação local expõe estado de durabilidade e pode ser aguardada por `flush()` no navegador e no Android;
- privilégios diretos das tabelas técnicas foram removidos, a retenção usa watermark de dispositivos ativos e a CSP limita conexões à origem Supabase configurada;
- o contrato JSON `aralearn.contract` versão 3 permanece como formato público de importação e exportação, contexto de geração, validação e visão de domínio em memória.

### Removed

- catálogo operacional embarcado nos artefatos web e Android;
- persistência documental de projeto, progresso e comentários;
- leitura automática e migração do banco IndexedDB legado;
- funcionamento anônimo e caminhos de compatibilidade com o catálogo local anterior;
- compilador e loaders do catálogo embarcado, incluindo `scripts/compileEmbeddedCourseFromParts.mjs`.

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
