# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [Unreleased]

### Changed

- atualização corretiva da APK `0.0.7`, com `versionCode` maior para atualizar instalações existentes;
- persistência local migrada para IndexedDB, preservando cursos do usuário, progresso e comentários sem tentar gravar o catálogo embarcado em `localStorage`;
- remoção do fluxo de versionamento local da interface e do contrato de cursos; o controle visual reservado para sincronização futura permanece inativo;
- catálogo embarcado reunido na inicialização sem duplicar o curso inteiro no armazenamento do navegador;
- correção da progressão após o feedback de prática e atualização das regressões do editor, do contrato e da persistência.

## [0.0.7] - 2026-07-10

### Added

- curso embarcado `Concurso Dataprev`, com o módulo inicial `Segurança da Informação`, composto por `8` lições, `71` microssequências e `423` cards validados;
- módulo `Gestão de Servidores` no curso `Dataprev: Analista de Processamento`, com `8` lições, `64` microssequências e `322` cards sobre sistemas operacionais, Linux, Windows Server, diretórios, automação, contêineres, Docker, Kubernetes e Rancher;
- APK pública atualizada com o novo curso e `versionCode` maior para permitir atualização sobre a versão `0.0.6`.

### Changed

- o seed persistido passa a conter `Microsoft Azure AI Fundamentals (AI-900)` e `Dataprev: Analista de Processamento`; `Lógica de Programação 1` e `Fundamentos de IA e Análise de Dados` ficam disponíveis no catálogo não persistido;
- o curso embarcado passa a se chamar `Dataprev: Analista de Processamento` e tem objetivo alinhado à preparação completa para o cargo;
- o módulo inicial `Segurança da Informação` permanece estruturado nos dez tópicos do edital: políticas, procedimentos e gerenciamento, redes, vulnerabilidades e ataques, criptografia, softwares maliciosos, certificação digital, LGPD, IDS/IPS/SIEM e NIST Cybersecurity Framework 1.1;
- APK pública da versão `0.0.7` atualizada com `versionCode` maior para permitir atualização sobre a primeira publicação da mesma versão.

## [0.0.6] - 2026-07-08

### Changed

- expansão do curso embarcado `Microsoft Azure AI Fundamentals (AI-900)` das Partes 01 a 04 para as Partes 01 a 12, agora com `9` módulos, `12` lições, `72` microssequências e `858` cards ativos;
- integração das Partes 05 a 12 feita sobre o seed já saneado das Partes 01 a 04, evitando reintroduzir tabelas vazias e outros defeitos estruturais presentes nas entregas brutas iniciais;
- correção estrutural do runtime e do contrato para não aceitar mais `table` com linhas vazias ou desalinhadas e para renderizar `tree` como hierarquia real em vez de lista plana;
- suíte pública atualizada com regressões específicas para o AI-900 expandido e para os cenários de tabela inválida e árvore hierárquica;
- APK pública de release atualizada com a versão completa do curso AI-900 até a Parte 12 e `versionCode` maior para permitir atualização sobre a linha `0.0.5`.

## [0.0.5] - 2026-07-03

### Changed

- inclusão do curso embarcado `Microsoft Azure AI Fundamentals (AI-900)`, já compilado a partir das Partes 01 a 04, com `2` módulos, `4` lições, `24` microssequências e `269` cards ativos;
- auditoria e saneamento das entregas parciais do curso AI-900 antes da incorporação ao seed oficial, com normalização de `role`, conversão de `tree`, `relation_map` e `plane` para o contrato atual e limpeza de bastidor em textos e metadados;
- adição do compilador reutilizável `scripts/compileEmbeddedCourseFromParts.mjs` para recompilar cursos embarcados a partir de partes em `json` ou `zip` nas próximas rodadas;
- manifesto oficial dos cursos embarcados atualizado para carregar o novo curso AI-900 diretamente no app;
- os cursos `Matemática para Informática`, `Práticas e Ferramentas de Desenvolvimento de Software`, `Organização e Arquitetura de Computadores` e `Framework Corporativo de IA Generativa` saem temporariamente do seed persistido e passam a morar em `src/data/non-persisted-courses`, com limpeza automática desses cursos no bootstrap quando ainda vierem salvos de versões anteriores;
- o seed persistido do app passa a embarcar apenas `Lógica de Programação 1`, `Fundamentos de IA e Análise de Dados` e `Microsoft Azure AI Fundamentals (AI-900)`, reduzindo o volume gravado no `localStorage` sem fallback em memória;
- correção do título visível do curso `Lógica de Programação 1` no seed oficial embarcado;
- APK pública de release atualizada com o curso AI-900 já embarcado, o seed persistido reduzido, o título corrigido de `Lógica de Programação 1` e `versionCode` maior para permitir atualização sobre a APK anterior da mesma linha `0.0.5`.

## [0.0.4] - 2026-07-02

### Changed

- migração coerente dos cursos embarcados oficiais para `JSON` em `src/data/embedded-courses`, sem wrappers `*SeedCourse.js`, sem lista hardcoded de factories em `src/ui` e com manifesto único em `embedded-seed-manifest.json`;
- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `8` módulos, `8` lições, `96` microssequências e `582` cards ativos, com as Aulas 5, 6, 7 e 8 integradas ao app;
- auditoria e saneamento das entregas brutas das Aulas 7 e 8 antes da incorporação ao seed oficial: remoção de campos extras de raiz, limpeza de bastidor e correção de `composite` de exercício para o shape compatível com o contrato atual;
- saneamento final da trilha de seed: remoção do hardcoded residual, do placeholder legado de OACO e da reconciliação automática que sobrescrevia projeto persistido com seed oficial;
- correção do carregamento no app Android para sincronizar os cursos embarcados oficiais com o manifesto atual durante upgrades de APK, mesmo quando o `WebView` preserva o projeto salvo da instalação anterior;
- correção do runtime para impedir `after` e `afterBlocks` com sintaxe de lacuna interativa, além de saneamento automático de projetos persistidos com esse defeito antes da validação;
- APK pública de release atualizada com o seed embarcado reorganizado de forma declarativa, sincronização automática do seed oficial no upgrade, `versionCode` maior para permitir atualização sobre a instalação anterior e a expansão de `Fundamentos` até a Aula 8.

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
- contrato público `aralearn.contract`, versão `3`, para projeto, curso, módulo, lição, microssequência, versão e card;
- edição de cursos, módulos, lições, microssequências e cards no app;
- importação e exportação em JSON;
- versionamento local por microssequência;
- assistência top-down por API para transformar escopo em trilha;
- assistência bottom-up por API para gerar, corrigir, reforçar e continuar etapas locais;
- validações estruturais e didáticas antes de aceitar material gerado;
- renderização de cards como `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- cursos embarcados editáveis para estudo e revisão no próprio app;
- suíte automatizada com testes, validação de exemplo público, smoke tests, harnesses e benchmarks.
