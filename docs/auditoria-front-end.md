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
├── organização contextual de grupos e cursos de Trilhas
└── painel
    ├── Coleções: grupos e cursos oficiais
    └── Chatbot: Chatbot personalizado e Plugin
```

`Trilhas` não é uma fila de estados. Plano é a composição que a pessoa ainda
está montando; curso é conteúdo que já pode abrir e estudar. O front-end não
expõe `planned`, `ready`, `partial`, hashes ou revisões. Esses detalhes podem
existir na persistência para validar concorrência e publicação, mas não criam
categorias de navegação.

A tela inicial é a superfície canônica de leitura e organização de `Trilhas`.
Não há um índice paralelo repetindo os mesmos cursos. Em `Trilhas`, o grupo é pessoal e
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
visíveis e administráveis em `Trilhas`. O ícone de mais abre somente as ações
contextuais do item correspondente.

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

## Projeção integrada

A tela inicial lê a projeção paginada completa de `Trilhas`; `Coleções` é
carregada somente quando a aba é aberta. Um
cache por conta substitui o estado anterior somente ao terminar todas as
páginas. No uso offline ele é somente leitura e não concede permissões.

Na tela inicial, seletores compactos escolhem o grupo e o curso. Seus menus
contextuais recolhem criar, renomear, mover entre grupos e excluir no alvo a que
se referem; título e descrição do curso tornam-se editáveis no próprio card.
Formulários aparecem no mesmo lugar do rótulo e devolvem o foco ao acionador.
Grupos e cursos usam ordem alfabética automática em português, sem setas ou modo
de organização. As operações raras da conta ficam em um único menu no rodapé. Em `Coleções`,
ações editoriais aparecem diretamente no alvo somente para uma conta
autorizada; consultar, buscar, adicionar e abrir continuam sendo o estado
padrão para as demais pessoas. Não existe modo intermediário de organização.

Selecionar um curso oficial usa uma ação dedicada que cria apenas o vínculo
pessoal. Abrir ou iniciar um curso é leitura e navegação: não seleciona, move,
copia nem publica. Em `Coleções`, contas editoriais também administram grupos e
cursos oficiais pelo aplicativo; em `Trilhas`, cada pessoa administra seus
grupos e a classificação de planos, composições em materialização e seleções.
Em ambos os casos, a ordem visual é alfabética; a posição pedagógica dentro do
curso continua explícita e editável.

Ao abrir um plano, a árvore corrente permite renomear, descrever, reordenar,
excluir e observar cursos, módulos, lições e microssequências. Observações
guardam apenas alvo e texto corrente, sem copiar card, curso, prompt ou
conversa. Chatbot e Plugin podem ler essas observações pelo mesmo contrato MCP.

Falhas de escrita deixam o formulário utilizável e mostram uma mensagem curta.
Ações estruturais só são aplicadas após confirmação remota. Edição textual pode
ser confirmada primeiro no rascunho durável do dispositivo e fica identificada
como pendente até a sincronização CAS; conflito no mesmo alvo conserva o texto
local em vez de sobrescrever o remoto.

## Edição situada

**Visualizar**, **Editar** e **IA** permanecem na própria superfície montada.
Um contorno discreto indica a seleção sem redimensionar o resource nem copiar o
conteúdo para outro painel. No card, a assistência apenas repara os resources
selecionados ou o card inteiro.

Microssequência e lição oferecem seus próprios escopos. Selecionar todos os
cards autoriza criar cards naquela microssequência; selecionar todas as
microssequências autoriza criar no máximo uma nova microssequência. O contexto
adjacente e o índice compacto da lição entram somente para leitura. O pedido
fica junto ao conteúdo e o resultado validado aparece diretamente. Um único
botão **Desfazer** conserva a reversão mais recente. Providers remotos de IA
exigem rede; a edição manual e o bridge local continuam disponíveis para
conteúdo já baixado e anteriormente autorizado. Respostas, gaps, identidades,
ordem e topologia não se tornam editáveis nesse modo.

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
