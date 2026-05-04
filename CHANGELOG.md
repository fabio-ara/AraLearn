# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [0.9.5] - 2026-05-04

### Changed

- remoção do campo `objective` do fluxo ativo do contrato `aralearn.intent.v1`, alinhando editor, modelo compilado, renderização HTML e integração assistida ao shape atual da microssequência
- simplificação do placeholder de geração por API para identificação estável via `key`, evitando tratar uma microssequência real como item vazio
- limpeza do dataset local de exemplo e da descrição automática de lições para não depender mais de metadados antigos da microssequência
- documentação pública atualizada para refletir a simplificação do contrato então vigente

### Tests

- atualização da suíte para garantir que compilação e renderização não reintroduzam `objective` no runtime `v1`

## [0.9.6] - 2026-05-04

### Added

- nova pipeline pública de contrato com validação, compilação e renderização próprias
- utilitário de linha de comando para validar o exemplo público do contrato
- exemplo público renderizável do contrato

### Tests

- cobertura automatizada para validação, compilação e renderização da nova pipeline do contrato

## [0.9.7] - 2026-05-04

### Added

- modelagem explícita de cards por tipo
- camada própria de persistência com envelope de projeto
- núcleo editorial para microssequências e cards sem `intent + data`
- integração por API para geração e revisão assistidas com saída em tipos explícitos

### Tests

- cobertura automatizada para editor, persistência e normalização da integração por API

## [0.9.8] - 2026-05-04

### Changed

- `public/main.js` passa a subir a aplicação principal sobre a nova base de contrato, persistência, editor e integração por API
- a casca principal do navegador passa a usar o contrato público atual como entrada local
- o seed público do navegador passa a nascer no contrato principal do aplicativo

### Tests

- validação automatizada do seed usado pela UI principal

## [0.9.9] - 2026-05-04

### Changed

- remoção do runtime, editor, storage, testes e documentação operacionais do antigo `aralearn.intent.v1`
- `projectNavigation` e o storage auxiliar de configuração substituem helpers ainda nomeados pela trilha legada
- `validate:example` passa a validar diretamente o exemplo do contrato público atual

### Tests

- suíte reduzida ao que ainda está vivo no contrato principal

## [0.9.10] - 2026-05-04

### Changed

- remoção de nomes transitórios do caminho ativo do produto
- contrato público consolidado como `aralearn.contract`
- módulos, seed, storage, CLI e documentação pública renomeados para formas canônicas

### Tests

- suíte e exemplo público atualizados para os nomes definitivos do produto

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

## [0.9.1] - 2026-05-04

### Changed

- consolidação do painel da microssequência em um fluxo mais enxuto, com ações assistidas padronizadas e menos texto estrutural
- desacoplamento do histórico local do card em relação à tela principal
- redução do peso visual do campo `Objetivo`, tratado como metadado leve da microssequência

### Tests

- atualização da suíte e remoção do armazenamento assistido obsoleto na camada auxiliar de storage

## [0.9.2] - 2026-05-04

### Added

- configuração local da integração por API para LLM no navegador, com persistência da chave e do modelo selecionado
- camada inicial de integração real com API para LLM por `fetch`, usando saída estruturada em JSON
- operação editorial para substituir todos os cards de uma microssequência a partir de resultado estruturado da API

### Changed

- reorganização do painel da microssequência para um fluxo assistido focado em geração e revisão de cards
- materialização direta do retorno da API no projeto local, sem depender de resposta simulada

### Tests

- cobertura automatizada para persistência da configuração da API e para substituição completa dos cards de uma microssequência

## [0.9.3] - 2026-05-04

### Added

- curso especial destacado na home para concentrar rascunhos de microssequências geradas por API
- tela dedicada de geração de microssequência com pedido amplo, tags explícitas e seletor de modelo
- garantia estrutural no núcleo editorial para manter sempre o curso especial de rascunhos disponível

### Changed

- separação do fluxo em duas etapas: geração no curso especial e revisão no painel da microssequência
- especialização da tela do curso de rascunhos como fila de microssequências geradas

### Tests

- cobertura automatizada para garantir a criação do curso especial de rascunhos no documento editorial

## [0.9.4] - 2026-05-04

### Added

- rascunhos de microssequência, com cards de exemplo, para avaliação visual da fila de rascunhos

### Changed

- consolidação do layout compartilhado entre geração e revisão, com prévia superior, faixa de tags consistente e rolagem compatível com WebView
- a garantia do curso especial de rascunhos agora semeia exemplos quando a fila ainda está vazia ou só contém item inicial vazio

### Tests

- ajuste da suíte editorial para verificar a presença dos rascunhos de exemplo no curso especial

### Fixed

- correções de responsividade, seleção inicial e abertura da fila de rascunhos no curso especial
- estabilização visual das telas assistidas, com contenção de overflow horizontal e harmonização da faixa de tags
