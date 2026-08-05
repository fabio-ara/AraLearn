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

O botão de nuvem abre as funções complementares sem repetir a tela de estudo:

- **Organizar** mostra um índice compacto dos grupos, planos e cursos de
  `Trilhas`;
- **Coleções** apresenta os cursos oficiais disponíveis;
- **Chatbot** contém a configuração do Chatbot personalizado e do Plugin.

A tela inicial continua sendo a única superfície para percorrer e iniciar os
cursos de `Trilhas`. Em **Organizar**, descrições, progresso e botões de estudo
não são repetidos: ações menos frequentes ficam recolhidas no menu do grupo,
curso ou parte correspondente. **Criar grupo** permanece como a única ação
direta da área; sair e excluir a conta ficam recolhidos no menu de conta do
rodapé. Isso não torna os grupos equivalentes no banco:

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
cópia paralela. O controle de novo grupo em **Organizar** administra a
organização pessoal; não cria cursos ou planos.

Os cards distinguem a origem sem depender dos botões: um ícone azul identifica
planejamento, uma chave vermelha identifica curso somente privado e a pasta
verde de `Coleções` identifica um curso público selecionado em `Trilhas`. Não
há rótulo textual concorrendo com o título. Donos e contas editoriais podem
usar **Organizar curso** para abrir a composição corrente ligada à mesma
publicação.

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

Em **Coleções**, a busca percorre o catálogo oficial. Use a ação explícita
**Adicionar a Trilhas** para selecionar um curso. O botão de abrir ou estudar
somente navega pelo conteúdo: ele nunca adiciona o curso, altera um grupo,
publica uma revisão nem cria uma cópia.

Ao adicionar um curso, a conta passa a tê-lo na biblioteca e o dispositivo baixa o material para estudo. Isso não altera o curso oficial nem cria outra cópia dele no banco.

Uma conta editorial encontra diretamente, nos alvos correspondentes, os menus
para criar, renomear, ordenar ou retirar coleções e para mover, ordenar ou
retirar cursos oficiais. Não existe um modo intermediário de organização.
Essas ações alteram o catálogo para todas as pessoas e, quando são destrutivas,
exigem confirmação. Elas são diferentes de adicionar ou retirar um curso da
biblioteca pessoal. **Outros cursos** é o destino estrutural do catálogo:
permanece no fim e recebe cursos que deixam uma coleção temática.

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

Na tela inicial, a pessoa acompanha o que planejou e o que já pode estudar. Em
**Organizar**, pode criar, renomear e reordenar grupos pessoais, além de mover
ou reordenar neles os cursos selecionados. Excluir um grupo deixa seus cursos
em **Outros**;
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
**Rever** e observações são gravados primeiro no dispositivo. **Rever** é um
marcador pessoal para voltar a um card: quando o curso selecionado possui cards
marcados, o ícone de marcador na tela inicial abre a lista curta e leva ao alvo
exato. Não é nota, erro registrado nem tarefa obrigatória. A gravação normal
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
movimentação. **Visualizar**, **Editar** e **IA** usam o próprio conteúdo. Um
contorno discreto identifica o alvo sem redimensionar o resource nem criar uma
segunda tela. Outro toque retira o alvo da seleção.

Na lição, o botão **Play** da microssequência abre sua lista compacta de cards.
Cada card mostra progresso binário, zerar progresso e **Play**; este último
entra no runtime. Em modo de autoria, editar ou excluir age no próprio card
estrutural e não dispara a navegação de estudo.

O progresso dentro da lição é sequencial. Por isso, zerar um card ou uma
microssequência também reabre os cards posteriores daquela lição: assim, a
retomada nunca afirma que uma etapa posterior continua concluída depois de uma
etapa anterior ser reiniciada.

Nos grafos, nomes curtos permanecem junto dos vértices e arestas. Nomes que não cabem no desenho recebem uma chave curta e aparecem por inteiro na legenda abaixo do grafo.

Quando a conta tem permissão de autoria, os botões de editar e excluir aparecem
junto do curso, módulo ou lição; sem permissão, permanecem desabilitados. No
card, a assistência repara os resources selecionados ou o card inteiro, mas não
cria conteúdo irmão. Na microssequência, selecionar todos os cards permite
criar cards dentro dela. Na lição, selecionar uma microssequência permite criar
cards nela; selecionar todas permite criar no máximo uma nova microssequência.
Não há assistência por API em módulo ou curso.

Uma edição manual curta altera título, texto, alternativas, resposta, células
ou lacunas no próprio resource. A assistência envia o pedido com o contexto
somente leitura, valida o retorno e mostra diretamente o resultado. A última
mudança pode ser desfeita. Uma falha não altera parte do conteúdo e mantém a
superfície utilizável. O envio por IA exige conexão; estudo e edição manual do
conteúdo baixado continuam disponíveis sem rede.

Um curso oficial continua compartilhado como uma publicação protegida. Uma
conta comum apenas o estuda; uma conta administrativa ou editorial pode
alterá-lo mantendo sua identidade oficial. O dono altera seu curso privado sem
criar outra cópia. Curso privado de outra pessoa permanece bloqueado.

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

Quando uma publicação oficial é atualizada, o dispositivo baixa e valida a
nova árvore antes de substituir a réplica anterior. Se o download falhar, o
material já disponível continua preservado. Uma escrita autorizada compara a
revisão lida com a corrente e é recusada se outra alteração tiver avançado;
nunca há combinação ou sobrescrita silenciosa.

Progresso e comentários continuam ligados às partes do curso que mantiverem a mesma identidade. Quando uma parte deixa de existir, os dados ligados a ela deixam de ser usados.

## Quando algo falha

- Sem rede, demora de resposta ou indisponibilidade temporária: a alteração permanece guardada e será enviada depois.
- Sessão expirada: o trabalho local permanece guardado; basta entrar novamente.
- Ação inválida ou sem permissão: a tela informa que a ação precisa ser refeita ou descartada.
- Falha ao gravar no dispositivo: um aviso curto oferece nova tentativa e pode ser fechado sem interromper a navegação.

## Sair e excluir a conta

Sair encerra a sessão e preserva os dados locais da conta.

Excluir a conta exige confirmação. A operação remove as seleções, trilhas, progresso, comentários e dados locais daquela conta. Cursos oficiais não são removidos.
