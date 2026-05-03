# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [0.1.0] - 2026-05-02

### Added

- estrutura pública inicial do repositório
- README público inicial
- CHANGELOG inicial
- diretórios `docs/`, `src/` e `public/`
- `.gitignore` com regras para arquivos privados

## [0.2.0] - 2026-05-02

### Added

- documentação pública inicial do contrato `aralearn.intent.v1`
- exemplos JSON válido e inválido do contrato
- validador estrutural inicial do contrato
- interface de linha de comando para validar arquivo JSON
- testes automatizados do validador

## [0.3.0] - 2026-05-02

### Added

- pipeline mínima do motor para carregar, validar, normalizar e compilar `aralearn.intent.v1`
- modelo interno compilado inicial com ids internos determinísticos
- testes automatizados da compilação inicial

## [0.4.0] - 2026-05-02

### Added

- camada inicial de renderização HTML baseada no modelo compilado
- renderizadores isolados para `text`, `ask`, `complete`, `code`, `table`, `flow` e `image`
- exemplo renderizável do contrato com múltiplas intenções
- testes automatizados da renderização básica

## [0.5.0] - 2026-05-02

### Added

- camada de persistência local simples em `src/storage`
- separação explícita entre projeto e progresso
- exportação e importação JSON com validação antes da persistência
- testes automatizados da persistência local
