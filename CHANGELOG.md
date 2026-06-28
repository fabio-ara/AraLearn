# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [Unreleased]

### Changed

- correção do runtime para impedir `after` e `afterBlocks` com sintaxe de lacuna interativa, evitando travas de progressão no popup de continuação;
- saneamento automático de projetos persistidos com esse defeito legado, convertendo o feedback em texto estático antes da validação;
- APK da release `0.0.4` republicada com `versionCode` maior para permitir atualização sobre a instalação anterior.

## [0.0.4] - 2026-06-26

### Changed

- migração dos cursos embarcados oficiais para arquivos JSON separados em `src/data/embedded-courses`, com loaders JS mínimos e acesso direto no repositório;
- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `6` módulos, `6` lições, `68` microssequências e `415` cards ativos;
- substituição das Aulas 3 e 4 pelos pacotes corrigidos mais recentes e inclusão das novas Aulas 5 e 6 sobre tratamento de dados com Pandas/PySpark e visualização com Matplotlib/Seaborn;
- saneamento contratual das novas aulas: papéis legados de microssequência mapeados para o contrato atual, `composite` de exercício com bloco `choice` interno, `afterBlocks` normalizados, `prompt` garantido em blocos `code` e remoção de texto de bastidor;
- reforço de regressões automatizadas para validar a presença dos JSONs embarcados, os novos totais do curso de Fundamentos e a ausência de bastidor nos textos e metadados internos;
- APK pública de release atualizada com o seed embarcado reorganizado em JSON e com as aulas 5 e 6 disponíveis no app.

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
