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

## [0.6.0] - 2026-05-03

### Added

- camada inicial de edição manual em `src/editor`
- operações para criar e editar microssequências
- operações para criar, editar e mover cards dentro da microssequência
- sessão de edição integrada à camada de storage
- testes automatizados do editor manual básico

## [0.7.0] - 2026-05-03

### Added

- casca navegável provisória do AraLearn em `public/`, com entrada local por `index.html`
- navegação completa da hierarquia `curso -> módulo -> lição -> microssequência -> cards`
- tela de leitura de cards integrada à nova camada de edição local
- painel provisório da microssequência para interação com LLM por API
- UI provisória de editor de cards separada da leitura
- componentes públicos de UI para home, lição, microssequência, leitura e overlays

### Notes

- esta versão entrega casca e fluxo validável, mas ainda não representa a semântica final do projeto
- detalhes de contrato e runtime ainda serão refinados nas próximas etapas do projeto

## [0.8.0] - 2026-05-03

### Added

- ações explícitas no editor de cards para criar novo card logo após o card atual
- ação explícita no editor de cards para remover o card atual sem invalidar a microssequência

### Changed

- seleção de card da casca local consolidada em uma rotina única para reduzir duplicação entre leitura, painel da microssequência e editor

### Tests

- cobertura automatizada para remoção de card com preservação de card inicial quando a microssequência ficaria vazia

## [0.9.0] - 2026-05-03

### Changed

- reorganização estrutural do contrato `aralearn.intent.v1` para suportar múltiplos cursos reais em `courses[]`
- refatoração da compilação, renderização e persistência para operar sobre a nova raiz multi-curso
- refatoração da seleção e da home da casca local para abrir cursos reais do projeto, sem prévias artificiais
- refatoração das operações editoriais para localizar e alterar módulos, lições, microssequências e cards dentro do curso correto
- alinhamento da modelagem publicada ao domínio multi-curso adotado pela interface e pelo motor

### Tests

- suíte automatizada atualizada para validar contrato, compilação, renderização, storage, paths e editor sob a nova raiz multi-curso
