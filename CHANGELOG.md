# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [Unreleased]

### Changed

- sem mudanças registradas

## [0.0.2] - 2026-06-18

### Changed

- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `3` módulos, `3` lições, `32` microssequências e a nova Aula 3 sobre NumPy e Pandas;
- saneamento do seed de Fundamentos para o contrato atual do app, com normalização de `role`, `composite`, `afterBlocks` e alternativas incompatíveis de `code choice`;
- auditoria corretiva do seed de Fundamentos para remover texto de bastidor, bloquear vocabulário editorial proibido e tornar autocontidos os cards da Aula 3 que dependem de resultados globais da base;
- geração da nova APK pública de release com o curso atualizado no seed oficial.

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
