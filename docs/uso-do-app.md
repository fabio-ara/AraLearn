# Uso do app

O uso cotidiano segue um caminho simples: entrar, escolher cursos, organizá-los em trilhas e estudar. A edição aparece quando a pessoa quer adaptar o conteúdo.

## Mapa mental em um minuto

Quatro ideias bastam para acompanhar o funcionamento cotidiano:

1. A conta guarda seleções, trilhas, estado funcional de retomada e observações.
2. O catálogo guarda uma única publicação oficial de cada curso.
3. O dispositivo baixa os cursos selecionados e mantém uma réplica para uso sem conexão.
4. Ao estudar, o AraLearn grava primeiro no dispositivo e sincroniza depois.

```text
catálogo + dados da conta
          ⇅
 réplica deste dispositivo
          ↓
       estudo
```

É possível estudar durante uma falha de rede porque o leitor depende primeiro da réplica local. A sincronização aproxima essa réplica dos dados da conta quando há conexão.

## Entrar

Sem uma sessão, o AraLearn mostra a tela de acesso. É possível criar conta, confirmar o e-mail, entrar, recuperar a senha e sair.

Cada conta possui seus próprios dados neste dispositivo. Sair encerra a sessão, mas não apaga o que já foi baixado nem alterações que ainda aguardam envio.

Depois da entrada, três etapas indicam a preparação do dispositivo, da conta e dos cursos. Essa tela e as telas de acesso e criação de conta usam toda a área disponível.

## Encontrar e organizar conteúdo

O botão de nuvem abre o painel integrado. Ele tem três destinos:

- **Trilhas** reúne planos e cursos da pessoa;
- **Coleções** apresenta os cursos oficiais disponíveis;
- **Chatbot** contém a configuração do Chatbot personalizado e do Plugin.

`Trilhas` e `Coleções` apresentam grupos com a mesma estrutura visual para que a
navegação seja previsível. Isso não torna os grupos equivalentes no banco:

- em `Trilhas`, cada grupo é pessoal e pode ser criado, renomeado, reordenado ou
  excluído pela própria pessoa;
- em `Coleções`, cada grupo pertence ao catálogo oficial. A pessoa comum o
  consulta; uma conta editorial pode criá-lo, renomeá-lo, reordená-lo ou
  retirá-lo, com alcance global.

Excluir um grupo pessoal não retira os cursos escolhidos nem apaga o estado de
estudo. Eles continuam em `Trilhas`, no grupo **Outros**, até serem movidos
ou retirados explicitamente.

Um plano é a estrutura que ainda está sendo montada; um curso já possui
conteúdo estudável. Ambos aparecem em `Trilhas`, sem categorias intermediárias
como “parcial”, “pronto” ou “em avaliação”. Ao abrir um plano, a pessoa vê a
árvore corrente de cursos, módulos, lições e microssequências. Se tiver
permissão, pode renomear, descrever, mover, excluir e registrar observações na
parte exata. O aplicativo não mostra IDs, hashes, revisões nem estados internos.

O aplicativo não cria um plano vazio por um formulário próprio. O Chatbot ou o
Plugin cria o workspace e registra a estrutura planejada; assim que o servidor
confirma esse trabalho, o plano aparece em `Trilhas`. Conforme os cards são
materializados, o mesmo item passa a oferecer conteúdo estudável, sem criar uma
cópia paralela. O controle **Criar grupo** de `Trilhas` administra a organização
pessoal; não cria cursos ou planos.

Os cards distinguem a origem sem depender dos botões: azul identifica plano,
vermelho identifica curso somente privado e verde identifica a cópia em
`Trilhas` de um curso público de `Coleções`. Cada cor vem acompanhada de um
rótulo textual. Donos e contas editoriais podem usar **Organizar curso** para
abrir a composição corrente em um workspace ligado à mesma publicação.

`Coleções` é consultada somente quando a aba é aberta. `Trilhas` carrega todas
as páginas antes de substituir a lista anterior e só então conserva essa
projeção completa para uma abertura sem rede. A cópia local é apenas para
consulta: não concede permissão e mantém desabilitados editar, organizar,
retirar e excluir. Com rede, esses controles refletem novamente as capacidades
devolvidas pela sessão autenticada.

A marca do AraLearn acompanha o tema claro ou escuro na web. No Android, o
ícone padrão usa o kanji escuro sobre fundo claro; launchers compatíveis podem
aplicar a paleta do sistema à camada de ícone temático.

## Escolher cursos

Na aba **Coleções**, a busca percorre o catálogo oficial. Use a ação explícita
**Adicionar a Trilhas** para selecionar um curso. O botão de abrir ou estudar
somente navega pelo conteúdo: ele nunca adiciona o curso, altera um grupo,
publica uma revisão nem cria uma cópia.

Ao adicionar um curso, a conta passa a tê-lo na biblioteca e o dispositivo baixa o material para estudo. Isso não altera o curso oficial nem cria outra cópia dele no banco.

Uma conta editorial encontra, na mesma aba, ações administrativas para criar,
renomear, ordenar ou retirar coleções e para mover, ordenar ou retirar cursos
oficiais. Essas ações alteram o catálogo para todas as pessoas e, quando são
destrutivas, exigem confirmação. Elas são diferentes de adicionar ou retirar um
curso da biblioteca pessoal. **Outros cursos** é o destino estrutural do
catálogo: permanece no fim e recebe cursos que deixam uma coleção temática.

**Retirar de Trilhas** remove somente a seleção daquela conta. A publicação
oficial continua disponível em `Coleções` para outras pessoas. Para uma conta
editorial, o mesmo card mostra também **Retirar de Coleções**, uma ação
administrativa distinta que, depois da confirmação, retira a publicação de
`Coleções` e de todas as contas que a selecionaram. Em publicação privada
própria, o rótulo é **Excluir curso privado**.

A retirada identifica a seleção exata, e não o título. Por isso duas tentativas
independentes com o mesmo nome continuam sendo cursos diferentes. Quando a
pessoa retira uma publicação privada própria, o AraLearn encerra também a
composição ligada a essa publicação; ela não reaparece como plano residual.

Antes de excluir uma publicação, o aplicativo termina as gravações locais e
consulta o estado remoto corrente. Depois da confirmação do servidor, atualiza
a réplica e a lista. Se o servidor tiver concluído a exclusão, mas o dispositivo
não conseguir atualizar a tela, a mensagem informa que a retirada já ocorreu e
pede apenas uma sincronização; não se deve repetir o comando.

## Organizar Trilhas

Em **Trilhas**, a pessoa acompanha o que planejou e o que já pode estudar.
Pode criar, renomear e reordenar grupos pessoais, além de mover ou reordenar
neles os cursos selecionados. Excluir um grupo deixa seus cursos em **Outros**;
**Retirar de Trilhas** é a ação separada que remove uma seleção.
Mover uma parte muda sua posição na composição corrente; copiar uma parte para
outro curso cria uma cópia independente. Excluir uma parte retira também seus
descendentes, após confirmação. O progresso do estudo continua separado do
conteúdo. Um curso distribuído tem uma só composição ativa vinculada; voltar a
organizá-lo abre essa composição, em vez de criar outra. Planos realmente
independentes podem ter o mesmo título e permanecem separados.

Durante uma gravação remota, os controles ficam indisponíveis apenas pelo tempo
necessário para impedir comandos repetidos. Operações encadeadas e falhas sempre
liberam novamente as abas e a navegação.

## Estudar

A navegação segue a ordem:

```text
curso -> módulo -> lição -> microssequência -> card
```

Depois que o material é baixado, o estudo continua sem conexão. Retomada,
**Rever** e observações são gravados primeiro no dispositivo. A gravação normal
é silenciosa; se demorar, aparece apenas um indicador discreto. Se falhar, um
aviso compacto permite tentar novamente ou fechar a mensagem sem bloquear o
estudo. O AraLearn não grava abertura, tempo, tentativas ou resultado; veja
[Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md).

O ícone de observação no leitor permite registrar **Dúvida**, **Possível erro**,
**Confuso**, **Sugestão** ou **Observação**, com até 1.000 caracteres. Existe
somente uma observação corrente da pessoa por card: salvar novamente a
substitui e retirar a apaga. O contador `1` informa apenas a presença desse
registro; não é pontuação nem atividade obrigatória. Quando o curso integra um
workspace, uma resposta da equipe e o estado corrente aparecem na mesma folha.
Responsáveis consultam as observações no plano correspondente em **Trilhas** e
podem abrir o card exato dali no modo de edição. Se o caminho
tiver sido substituído, o app não abre outro card por aproximação. O
funcionamento e os limites de interpretação estão em
[Observações pedagógicas](observacoes-pedagogicas.md).

Os cards podem usar dezoito recursos: parágrafo, escolha, composição, código,
tabela, fluxo, árvore, grafo, mapa de relações, matriz, plano cartesiano,
fórmula, gráfico estatístico, sequência, texto anotado, exemplo linguístico,
mapa de sistema e reação química. Os cards de estudo não exibem controles de
movimentação. O botão de edição no painel superior ativa a autoria no próprio
card; não há uma segunda aba. Ao voltar à leitura, seleção, formulário e caixa
de pedido desaparecem sem mudar o card estudado.

Nos grafos, nomes curtos permanecem junto dos vértices e arestas. Nomes que não cabem no desenho recebem uma chave curta e aparecem por inteiro na legenda abaixo do grafo.

Quando a conta tem permissão de autoria, os botões de editar e excluir aparecem
junto do curso, módulo ou lição; sem permissão, permanecem desabilitados. Na
microssequência, a assistência pode reparar o card inteiro, um conjunto de
cards ou os recursos escolhidos diretamente no card, e pode criar exatamente
um card por pedido. Uma edição manual curta
altera título, texto, alternativas, resposta, células ou lacunas. Toda mudança
possui prévia quando vem do serviço e a última aplicação pode ser desfeita.
Uma alteração remota só substitui o conteúdo corrente depois de confirmada pelo
backend; uma falha mantém o formulário editável e mostra uma mensagem curta.

Sem conexão, um pedido sem anexos pode ficar na fila local. O AraLearn guarda
no máximo oito instruções curtas, sem cópia do curso e sem resposta do serviço;
ao reconectar, transforma o pedido mais antigo em prévia. Anexos exigem conexão
e nunca entram nessa fila.

Um curso oficial continua compartilhado como uma publicação protegida. Somente
uma conta editorial pode alterá-lo. Cursos privados são alterados pelo dono e
a atualização passa a ser a cópia corrente exibida em `Trilhas`.

## Integrar uma ferramenta de autoria

Abra o painel e toque em **Chatbot**. A área separa:

- **Chatbot**: instruções, dois conhecimentos, schema da Action e credenciais
  OAuth; depois de salvar o GPT, o ID `g-...` é vinculado no painel;
- **Plugin**: nome, descrição, endpoint MCP e autenticação a copiar em
  **Plugins → Novo plugin**.

O Chatbot reúne orientação persistente, conhecimento anexado e acesso à conta.
O Plugin pode ser chamado em qualquer conversa: recebe instruções na
inicialização e recupera, sob demanda, somente o conhecimento autoral
pertinente ao pedido. Os dois usam as mesmas ferramentas e o mesmo motor de
workspace. Não é preciso copiar uma chave estática.

Ao conectar o plugin no ChatGPT, o usuário entra na própria conta por OAuth e
aprova o consentimento.

Contas que já receberam permissão editorial também veem a área **Catálogo**.
A mesma conexão OAuth passa a expor as ferramentas de catálogo autorizadas
para aquela conta.

A integração pode criar, reorganizar e revisar planos e cursos. A pedido, o
conteúdo já materializado aparece em `Trilhas` para teste. A entrada em
`Coleções` continua dependendo da permissão e da revisão editorial.

Para começar sem lidar com JSON ou nomes de operações, siga [Criar cursos pelo
chat](criar-cursos-pelo-chat.md). O mesmo assistente continua a conversa; a
conta conectada determina se ele também pode enviar, revisar ou publicar no
catálogo.

## Sincronização

O aplicativo tenta sincronizar ao abrir, ao recuperar conexão, ao voltar para a tela e depois de uma gravação local. Enquanto não houver rede, o estudo segue normalmente e as alterações aguardam no dispositivo.

O ícone de sincronização pede uma nova tentativa imediata. Ele não é necessário para salvar o trabalho.

Se a mesma conta fizer mudanças de progresso, observações ou trilhas em dispositivos diferentes, passa a valer a última alteração válida recebida pelo servidor. O conteúdo da área de autoria local não entra nessa fila e permanece no dispositivo até seguir por um fluxo integral de autoria. O AraLearn não exige que o estudante compare versões do estado pessoal.

## Atualização de cursos

Quando uma publicação oficial é atualizada, o dispositivo baixa a nova árvore antes de substituir a anterior. Se o download falhar, o material já disponível continua preservado. Se houver uma área de autoria local alterada para o curso, a troca também é adiada para não apagar o trabalho em andamento.

Em **Trilhas**, cada curso do catálogo ou privado com trabalho local recebe a
indicação **Alterações locais**. Quando a revisão oficial mudou desde o início
do trabalho, a indicação passa a informar também **revisão oficial nova**. O
AraLearn nunca escolhe uma das versões automaticamente.

O controle de descarte ao lado do curso restaura a revisão oficial atual. A
confirmação identifica o curso, informa quando será usada uma revisão nova e
avisa que o descarte do trabalho local é irreversível. Cancelar, permanecer
offline, falhar no download, encontrar uma alteração pendente ou detectar
edição concorrente em outra aba conserva integralmente o trabalho local. Só
depois da confirmação e da troca atômica bem-sucedida a projeção do curso é
recarregada.

Progresso e comentários continuam ligados às partes do curso que mantiverem a mesma identidade. Quando uma parte deixa de existir, os dados ligados a ela deixam de ser usados.

## Quando algo falha

- Sem rede, demora de resposta ou indisponibilidade temporária: a alteração permanece guardada e será enviada depois.
- Sessão expirada: o trabalho local permanece guardado; basta entrar novamente.
- Ação inválida ou sem permissão: a tela informa que a ação precisa ser refeita ou descartada.
- Falha ao gravar no dispositivo: um aviso curto oferece nova tentativa e pode ser fechado sem interromper a navegação.

## Sair e excluir a conta

Sair encerra a sessão e preserva os dados locais da conta.

Excluir a conta exige confirmação. A operação remove as seleções, trilhas, progresso, comentários e dados locais daquela conta. Cursos oficiais não são removidos.
