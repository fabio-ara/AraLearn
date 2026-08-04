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
    ├── Trilhas: planos e cursos acessíveis
    ├── Coleções: cursos oficiais
    └── Chatbot: Chatbot personalizado e Plugin
```

`Trilhas` não é uma fila de estados. Plano é a composição que a pessoa ainda
está montando; curso é conteúdo que já pode abrir e estudar. O front-end não
expõe `planned`, `ready`, `partial`, hashes ou revisões. Esses detalhes podem
existir na persistência para validar concorrência e publicação, mas não criam
categorias de navegação.

## Ações contextuais

O topo da tela inicial e das hierarquias contém somente a entrada do painel.
No leitor, ficam somente **Editar card** e **Abrir painel**. Foram removidos os
atalhos redundantes para Chatbot, criação rápida e importação/exportação, além
dos menus de três pontos e do editor de fonte-guia já desativado.

Cada card HTML estrutural oferece diretamente:

- zerar o progresso daquela parte;
- editar título e descrição, quando permitido;
- excluir, quando permitido;
- abrir a próxima camada ou iniciar o estudo.

Controles de arrastar pertencem apenas à estrutura de curso, nunca aos cards de
estudo. Curso privado é editável pelo dono. Curso oficial é editável somente
por uma conta administrativa/editorial. Na ausência de uma capacidade
confirmada, o cliente falha fechado e desabilita edição e exclusão.

## Painel integrado

O painel lê primeiro a projeção paginada completa de `Trilhas`. `Coleções` é
carregada somente quando a aba é aberta. Um cache por conta substitui o estado
anterior somente ao terminar todas as páginas. No uso offline ele é somente
leitura e não concede permissões.

Ao abrir um plano, a árvore corrente permite renomear, descrever, reordenar,
excluir e observar cursos, módulos, lições e microssequências. Observações
guardam apenas alvo e texto corrente, sem copiar card, curso, prompt ou
conversa. Chatbot e Plugin podem ler essas observações pelo mesmo contrato MCP.

Falhas de escrita deixam o formulário utilizável e mostram uma mensagem curta.
Uma alteração local não é aplicada antes da confirmação remota quando a ação
depende do backend.

## Edição do card

O modo **Editar** mantém o card montado. A pessoa pode selecionar o card inteiro,
vários cards da microssequência ou resources específicos; escrever uma
instrução; revisar a prévia; aplicar ou descartar; e desfazer a última aplicação.
O pedido inclui o contexto adjacente somente para leitura.

A fila offline conserva no máximo instruções curtas e não grava resposta do
modelo, contexto montado nem cópia do curso. A edição manual continua disponível
sem provider.

## Sistema visual e validação

Componentes consomem tokens semânticos em temas claro e escuro. Ícones de
interface são SVG com `currentColor`; nomes desconhecidos falham explicitamente.
O auditor de resíduos exige zero cores literais no CSS de componentes, zero
seletores órfãos, zero ramos órfãos e zero glifos usados como ícones.

As jornadas automatizadas cobrem Android, teclado, toque, diferentes larguras,
abertura de plano e curso, carregamento tardio de Coleções, falha e repetição de
criação, permissões, Chatbot/Plugin, estudo, retorno e assistência contextual.
Nenhum teste preserva componentes removidos apenas por compatibilidade.
