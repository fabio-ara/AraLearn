# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [Unreleased]

### Changed

- integração da Aula 7 ao curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `7` módulos, `7` lições, `81` microssequências e `493` cards ativos;
- auditoria e saneamento da entrega bruta da Aula 7 antes da incorporação ao seed oficial: remoção de metadados de bastidor na raiz e correção do `composite` de exercício para o shape compatível com o contrato atual.

## [0.0.4] - 2026-07-02

### Changed

- migração coerente dos cursos embarcados oficiais para `JSON` em `src/data/embedded-courses`, sem wrappers `*SeedCourse.js`, sem lista hardcoded de factories em `src/ui` e com manifesto único em `embedded-seed-manifest.json`;
- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, mantendo `6` módulos, `6` lições, `68` microssequências e `415` cards ativos, com as Aulas 5 e 6 já integradas ao app;
- saneamento final da trilha de seed: remoção do hardcoded residual, do placeholder legado de OACO e da reconciliação automática que sobrescrevia projeto persistido com seed oficial;
- correção do runtime para impedir `after` e `afterBlocks` com sintaxe de lacuna interativa, além de saneamento automático de projetos persistidos com esse defeito antes da validação;
- APK pública de release atualizada com o seed embarcado reorganizado de forma declarativa e com `versionCode` maior para permitir atualização sobre a instalação anterior.

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
