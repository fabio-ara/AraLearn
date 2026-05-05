# Changelog

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [0.9.21] - 2026-05-04

### Changed

- o seed principal da UI deixa de carregar vários stubs e passa a manter um único curso de teste, com o primeiro card dedicado a uma tabela com lacunas por bloco/opção
- a distinção visual entre lacuna de digitação (`1ch`) e lacuna por bloco/opção (`3ch`) sai do caso especial do `editor` e passa a valer no motor textual comum, cobrindo `table`, `paragraph`, `complete`, `editor` e contêineres futuros que reutilizem esse renderer
- a lacuna vazia dentro do bloco `editor` passa a nascer com largura inicial aproximada de `3ch` tanto para digitação quanto para opção por clique, enquanto as lacunas gerais fora desse contêiner continuam em `1ch`
- clicar numa lacuna por opção já preenchida agora limpa o valor e reabre as opções no mesmo clique, tanto no motor textual comum quanto nas lacunas equivalentes do `flowchart`
- o seed principal da UI passa a expor explicitamente um card de parágrafo com lacunas e uma tabela com lacunas para inspeção manual do runtime

## [0.9.20] - 2026-05-04

### Changed

- o `Continuar` do leitor volta a abrir o popup final dockado do card quando o runtime traz `popupBlocks`, em vez de avançar direto para o próximo card
- o popup final passa a ser estritamente de feedback/leitura; `popupBlocks` não aceitam mais contêineres interativos e qualquer bloco de exercício é saneado para leitura simples ou descartado
- o corpo do card deixa de exibir o placeholder expandido do bloco `button` quando esse popup é consumido pelo rodapé do leitor
- o seed principal do app e o exemplo público de contrato passam a incluir fluxogramas com `while`, `do_while`, `for` e decisão aninhada, para facilitar teste visual e estrutural de laços compostos
- os exemplos navegáveis do seed passam a carregar popup final de feedback apenas com contêineres de leitura, como `paragraph`, `table`, `editor`, `image` e `flowchart` sem prática
- o validador/persistência do projeto passam a preservar o campo interno `runtime` dos cards, evitando que exemplos com popup final sejam salvos sem `popupBlocks`
- as lacunas de `flowchart` passam a compartilhar o mesmo molde visual tracejado com fundo, inclusive após preenchimento, para deixar sempre evidente onde havia exercício
- os popups internos de símbolo, texto por opção e rótulo deixam de exibir o botão inferior `x`, mantendo só o fechamento geral do card
- o popup final do `Continuar` volta a abrir sobreposto dentro da moldura do card, ancorado ao rodapé e sem empurrar a altura do card
- `paragraph`, `complete`, `editor` e `table` passam a compartilhar o mesmo motor de lacunas textuais com o mesmo ciclo de resposta do card
- lacunas textuais deixam de ser campos lineares rígidos e passam a aceitar quebra de linha dentro do próprio espaço da lacuna, preservando largura pequena e visual consistente
- `multiple_choice` passa a seguir o padrão visual e estrutural do `AraLearn_old`, com alternativas em botão, feedback inline e sem dock local de validação
- a seleção de `multiple_choice` volta a ser acumulativa mesmo em perguntas com uma única resposta correta, como no legado; a validação compara o conjunto marcado em vez de forçar comportamento de radio
- lacunas textuais deixam de ter largura fixa e passam a autoajustar pela quantidade digitada, começando visualmente em 1 caractere e preservando o fluxo inline com a pontuação adjacente
- lacunas textuais passam a ser renderizadas como `span` inline `contenteditable`, sem padding interno, alinhadas à baseline do texto e com word wrap dentro da própria lacuna (quebra junto com o texto corrido)
- lacunas textuais `contenteditable` deixam de manter sentinelas/pseudo-placeholder durante a edição; o placeholder visual de `1ch` só existe fora de foco, para evitar caret invertido ou deslocado ao iniciar a digitação
- contêineres textuais com lacunas (`paragraph`, `complete`, `editor` e `table`) deixam de renderizar botões locais de `Validar`, `Ver resposta` e `Tentar de novo`; a validação fica no `Continuar` do card e o feedback inline só aparece depois desse ciclo comum
- o seed principal do app deixa de usar as lições antigas de processo/fluxograma e passa a carregar lições stub novas, dedicadas a testar `text`, `complete`, `editor`, `table`, `image` e popup de feedback
- o runtime do popup final passa a ignorar botões vazios anteriores e o seed deixa de duplicar blocos `button`, evitando casos em que o card tinha `popupBlocks` válidos mas o `play` não abria o painel
- o `editor` passa a usar tipografia mono menor para caber mais conteúdo na viewport sem perder legibilidade
- lacunas textuais do motor comum passam a aceitar também variante por opção inline com sintaxe `[[resposta::opcao1|opcao2|...]]`, reaproveitando o mesmo ciclo de validação do card em `paragraph`, `complete`, `editor` e `table`
- `editor`, `table` e `complete` deixam de receber moldura externa de “mini-card” no runtime; o contêiner passa a renderizar diretamente seu conteúdo, mantendo apenas a apresentação própria do elemento interno
- o seed principal do app passa a expor no `editor` stub uma lacuna de digitação e uma lacuna por opção, para validar o comportamento misto no mesmo contêiner

### Tests

- cobertura automatizada para descoberta do popup final no runtime e para renderização do popup dockado com blocos e ações próprias
- cobertura automatizada para garantir que o seed principal e o exemplo público preservem os novos cenários de laço
- cobertura automatizada para garantir que a validação do projeto mantenha `runtime` opcional nos cards
- cobertura automatizada para o markup atualizado das lacunas e dos popups internos do fluxograma
- cobertura automatizada para garantir que o popup final seja renderizado dentro do `study-stage`, antes do footer externo
- cobertura automatizada para lacunas textuais inline em `paragraph`, `complete`, `editor` e `table`
- cobertura automatizada para a múltipla escolha no padrão visual/estrutural legado
- cobertura automatizada para garantir que lacunas textuais não reinstalem dock local de validação e só exponham ações inline após erro validado pelo card
- cobertura automatizada para garantir que `popupBlocks` não mantenham exercícios interativos no runtime ou no renderer
- cobertura automatizada para garantir que o seed principal novo só exponha os contêineres stub esperados, sem `choice` nem `flow`
- cobertura automatizada para garantir que a descoberta do popup final ignore `button` sem popup e use o botão válido seguinte
- cobertura automatizada para editor com lacuna por opção e prompt de tokens no dock do card
- cobertura automatizada para garantir que o seed principal exponha o novo editor stub com lacuna textual e lacuna por opção

## [0.9.19] - 2026-05-04

### Changed

- exercícios de `choice` e lacunas de prática do `flowchart` passam a embaralhar opções por carregamento de card, em vez de manter ordem fixa por build
- o estado de `choice` passa a usar identidade estável de opção, preservando seleção, validação e visualização de resposta mesmo quando a ordem renderizada muda
- lacunas digitáveis do `flowchart` deixam de abrir janela própria e passam a aceitar digitação direta no quadro; a checagem fica centralizada no botão `Continuar` do card

### Tests

- cobertura automatizada para seleção persistida de `choice` com IDs estáveis no runtime renderizado
- cobertura automatizada para lacunas digitáveis inline de `flowchart`

## [0.9.17] - 2026-05-04

### Changed

- cards `choice` deixam de ser somente leitura e passam a permitir seleção + validação local, com ações de tentar de novo e ver resposta
- cards `complete` passam a renderizar lacunas a partir de `[[...]]` com inputs, validação local, reset e visualização da resposta
- o viewport do `flowchart` passa a centralizar o quadro na primeira abertura para reduzir casos em que o conteúdo aparece recortado em telas menores

### Tests

- cobertura automatizada para renderização interativa de `choice` e `complete`

## [0.9.18] - 2026-05-04

### Changed

- o motor geométrico do `flowchart` (`layout` + roteamento + posicionamento de labels) foi substituído por um port literal do `AraLearn_old`, para recuperar as regras didáticas originais e evitar aproximações por heurística

## [0.9.16] - 2026-05-04

### Added

- exemplos públicos de `flowchart` no seed provisório do app, cobrindo leitura estrutural e prática interativa com preenchimento

### Changed

- o navegador agora versiona novamente o seed local para expor automaticamente os cards de teste de fluxograma após a atualização
- a política operacional do projeto passa a exigir exemplos navegáveis no seed sempre que um contêiner novo entrar no runtime, incluindo modo de exercício quando aplicável

### Tests

- cobertura automatizada para garantir que o seed principal mantenha cards de fluxograma próprios para checagem manual no app

## [0.9.15] - 2026-05-04

### Added

- primeira camada de prática interativa para cards de fluxograma no runtime, com lacunas de símbolo, texto e rótulo, validação local, reset e visualização da resposta

### Changed

- o quadro de fluxograma agora aceita zoom ancorado por `Ctrl`/trackpad no desktop e gesto de pinça no mobile
- a heurística de posicionamento de rótulos do fluxograma foi aproximada da versão legada para reduzir colisões e melhorar casos com retornos e saídas laterais
- a prática do fluxograma ganhou refinamentos de ergonomia, com foco automático em campos de resposta, confirmação por teclado e fechamento contextual do prompt

### Tests

- cobertura automatizada para estado de prática do fluxograma e renderização dos controles interativos no quadro SVG

## [0.9.14] - 2026-05-04

### Changed

- remoção da trilha ativa do editor low-code/manual de cards e contêineres da UI principal, concentrando a autoria estrutural desses contêineres na integração por API
- limpeza da navegação editorial para manter microssequência assistida, leitura, comentários, versões e ações estruturais sem expor o builder manual legado

## [0.9.12] - 2026-05-04

### Added

- início do editor estrutural de fluxograma dentro do editor de cards, com criação, edição, remoção e reordenação de nós e ramos compostos

### Changed

- o contrato público de `flow` passa a aceitar estruturas compostas compatíveis com `if`, `while`, `for`, `chain` e `switch`, em vez de limitar o card a etapas lineares rasas
- a camada interna de blocos do editor agora preserva `structure` de fluxograma para cards do tipo `flow`

### Tests

- cobertura automatizada para round-trip entre `flow` público e `structure` interna, validação de cards `flow` compostos e persistência editorial desses cards

## [0.9.13] - 2026-05-04

### Changed

- o quadro de leitura do fluxograma passa a usar geometria escalável, conectores mais fiéis às formas, reposicionamento de rótulos e viewport com zoom local

### Tests

- cobertura automatizada para autoexpansão da geometria do quadro e presença dos controles de viewport na renderização do runtime

## [0.9.11] - 2026-05-04

### Changed

- o quadro SVG do fluxograma agora abre faixas laterais adicionais a partir de `layoutMeta.slot`, evitando sobreposição de nós quando múltiplos casos compartilham a mesma linha estrutural

### Tests

- cobertura automatizada para garantir separação horizontal de casos paralelos no mesmo nível do layout interno

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
