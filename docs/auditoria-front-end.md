# Auditoria do front-end

Esta auditoria registra a consolidação do front-end claro/escuro, do leitor e
do painel integrado. O critério principal é a finalidade do produto: localizar,
estudar e administrar conteúdo sem exigir que a pessoa aprenda o modelo interno
do backend.

## Navegação corrente

```text
Início
├── curso
│   └── módulo
│       └── lição
│           └── microssequência
│               └── card
└── painel
    ├── Organizar: índice e ações contextuais de Trilhas
    ├── Coleções: grupos e cursos oficiais
    └── Chatbot: Chatbot personalizado e Plugin
```

`Trilhas` não é uma fila de estados. Plano é a composição que a pessoa ainda
está montando; curso é conteúdo que já pode abrir e estudar. O front-end não
expõe `planned`, `ready`, `partial`, hashes ou revisões. Esses detalhes podem
existir na persistência para validar concorrência e publicação, mas não criam
categorias de navegação.

A tela inicial é a superfície canônica de leitura de `Trilhas`. O painel não
repete descrições, progresso, play nem cards de estudo: **Organizar** reduz a
biblioteca pessoal a um índice estrutural. Em `Trilhas`, o grupo é pessoal e
administrável pela própria conta; em `Coleções`, o grupo é editorial e somente
uma capacidade autenticada permite alterá-lo. A linguagem de grupo permanece
previsível sem duplicar a tela inicial, compartilhar propriedade ou ampliar
permissões.

## Ações contextuais

O topo da tela inicial e das hierarquias contém somente a entrada do painel.
No leitor, ficam somente **Editar card** e **Abrir painel**. Foram removidos os
atalhos redundantes para Chatbot, criação rápida e importação/exportação, além
do menu genérico sem alvo, do editor de fonte-guia já desativado e da criação
manual de um plano vazio. Planos criados pelo Chatbot ou Plugin continuam
visíveis e administráveis em `Trilhas`. Em **Organizar**, o ícone de mais abre
somente as ações contextuais do item correspondente.

Cada card HTML estrutural de navegação oferece diretamente somente as ações de
uso frequente:

- zerar o progresso daquela parte;
- editar título e descrição, quando permitido;
- excluir, quando permitido;
- abrir a próxima camada ou iniciar o estudo.

Controles de arrastar pertencem apenas à estrutura de curso, nunca aos cards de
estudo. Curso privado é editável pelo dono. Curso oficial é editável somente
por uma conta administrativa/editorial. Na ausência de uma capacidade
confirmada, o cliente falha fechado e desabilita edição e exclusão.

## Painel integrado

O painel lê primeiro a projeção paginada completa de `Trilhas` para montar o
índice **Organizar**. `Coleções` é carregada somente quando a aba é aberta. Um
cache por conta substitui o estado anterior somente ao terminar todas as
páginas. No uso offline ele é somente leitura e não concede permissões.

Menus contextuais recolhem renomear, mover, ordenar e excluir no item a que se
referem. Formulários aparecem no próprio grupo, curso ou parte e devolvem o foco
ao acionador. A criação de grupo pessoal é a única ação direta do cabeçalho e
as operações raras da conta ficam em um único menu no rodapé. Em `Coleções`,
ações editoriais permanecem invisíveis até uma
conta autorizada ativar **Organizar Coleções**; consultar, buscar, adicionar e
abrir continuam sendo o estado padrão.

Selecionar um curso oficial usa uma ação dedicada que cria apenas o vínculo
pessoal. Abrir ou iniciar um curso é leitura e navegação: não seleciona, move,
copia nem publica. Em `Coleções`, contas editoriais também administram grupos e
cursos oficiais pelo aplicativo; em `Trilhas`, cada pessoa administra seus
grupos e a posição de suas seleções.

Ao abrir um plano, a árvore corrente permite renomear, descrever, reordenar,
excluir e observar cursos, módulos, lições e microssequências. Observações
guardam apenas alvo e texto corrente, sem copiar card, curso, prompt ou
conversa. Chatbot e Plugin podem ler essas observações pelo mesmo contrato MCP.

Falhas de escrita deixam o formulário utilizável e mostram uma mensagem curta.
Uma alteração local não é aplicada antes da confirmação remota quando a ação
depende do backend.

## Edição do card

O modo **Editar** permanece dentro do card montado e oferece duas formas
exclusivas: **Manual** e **IA**. A seleção de resource acontece no próprio
conteúdo; o card inteiro e a faixa numérica da microssequência cobrem os demais
escopos. A criação de card é uma ação secundária do mesmo modo. A prévia não
gera uma segunda cópia abaixo do leitor: substitui temporariamente o conteúdo e
permite alternar entre **Atual** e **Proposta**, aplicar ou descartar. O pedido
inclui o contexto adjacente somente para leitura.

A fila offline conserva no máximo instruções curtas e não grava resposta do
modelo, contexto montado nem cópia do curso. A edição manual continua disponível
sem provider.

## Sistema visual e validação

Componentes consomem tokens semânticos em temas claro e escuro. Ícones de
interface são SVG com `currentColor`; nomes desconhecidos falham explicitamente.
O auditor de resíduos exige zero cores literais no CSS de componentes, zero
seletores órfãos, zero ramos órfãos e zero glifos usados como ícones.

As jornadas automatizadas cobrem Android, teclado, toque, diferentes larguras,
abertura de plano e curso, carregamento tardio de Coleções, administração de
grupos, seleção explícita, permissões, Chatbot/Plugin, estudo, retorno e
assistência contextual. Também verificam que `play` não produz mutação.
Nenhum teste preserva componentes removidos apenas por compatibilidade.
