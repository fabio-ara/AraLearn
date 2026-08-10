# Uso do app

O uso cotidiano segue um caminho simples: entrar, escolher cursos, organizá-los em trilhas e estudar. A edição aparece quando a pessoa quer adaptar o conteúdo.

## Mapa mental em um minuto

Quatro ideias bastam para acompanhar o funcionamento cotidiano:

1. A conta guarda grupos de Trilhas, seleções, estado funcional de retomada e observações.
2. O catálogo guarda uma única publicação oficial de cada curso.
3. O dispositivo mantém cursos oficiais selecionados e a composição corrente
   dos itens de workspace já abertos para uso sem conexão.
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

O botão de nuvem abre as funções complementares à tela inicial:

- **Coleções** apresenta os cursos oficiais disponíveis;
- **Chatbot** contém a configuração do Chatbot personalizado e do Plugin.

A tela inicial é a superfície única para percorrer, iniciar e organizar os
cursos de `Trilhas`. O seletor mostra planos e cursos da mesma projeção; ações
menos frequentes ficam nos controles contextuais do grupo, curso ou parte
correspondente. Sair e excluir a conta ficam recolhidos no menu de conta. Isso
não torna os grupos equivalentes no banco:

- em `Trilhas`, cada grupo é pessoal e pode ser criado, renomeado ou excluído
  pela própria pessoa;
- em `Coleções`, cada grupo pertence ao catálogo oficial. A pessoa comum o
  consulta; uma conta editorial pode criá-lo, renomeá-lo ou retirá-lo, com
  alcance global.

Grupos e cursos são apresentados automaticamente em ordem alfabética de
português, com números em ordem natural. Não há botões de subir ou descer nem
uma ordem pessoal paralela para manter.

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
cópia paralela. O controle de novo grupo na tela inicial administra a
organização pessoal; não cria cursos ou planos.

Os cards distinguem a origem sem depender dos botões: um ícone azul identifica
planejamento, uma chave vermelha identifica curso somente privado e a pasta
verde de `Coleções` identifica um curso público selecionado em `Trilhas`. Não
há rótulo textual concorrendo com o título. Donos e contas editoriais podem
alternar para a edição na própria hierarquia, sem abrir uma árvore paralela.

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
para criar, renomear ou retirar coleções e para mover um curso entre coleções
ou retirá-lo do catálogo. Não existe um modo intermediário de organização.
Essas ações alteram o catálogo para todas as pessoas e, quando são destrutivas,
exigem confirmação. Elas são diferentes de adicionar ou retirar um curso da
biblioteca pessoal. **Outros cursos** é o destino estrutural do catálogo e
recebe cursos que deixam uma coleção temática. A lista continua alfabética.

**Retirar de Trilhas** remove somente uma seleção daquela conta. A publicação
oficial continua disponível em `Coleções` para outras pessoas. A ação editorial
distinta **Retirar de Coleções** permanece no alvo correspondente da aba
`Coleções`; depois da confirmação, ela retira a publicação do catálogo e de
todas as contas que a selecionaram. Um curso proveniente de workspace usa a
ação **Excluir curso privado**, baseada na composição corrente e não numa
seleção.

A retirada identifica a seleção exata, e não o título. Por isso duas tentativas
independentes com o mesmo nome continuam sendo cursos diferentes. Arquivar um
artefato privado não apaga uma composição de workspace ativa; para retirá-la de
Trilhas, a pessoa exclui explicitamente a raiz ou o workspace correspondente.

Antes de excluir uma publicação, o aplicativo termina as gravações locais e
consulta o estado remoto corrente. Depois da confirmação do servidor, atualiza
a réplica e a lista. Se o servidor tiver concluído a exclusão, mas o dispositivo
não conseguir atualizar a tela, a mensagem informa que a retirada já ocorreu e
pede apenas uma sincronização; não se deve repetir o comando.

## Curadoria de Trilhas na tela inicial

Na tela inicial, a pessoa acompanha o que planejou e o que já pode estudar. Ali
seleciona primeiro o grupo e depois o curso, sem abrir uma tela administrativa
paralela. O menu do grupo permite criar, renomear ou excluir; o menu do curso
reúne somente as operações aplicáveis àquele item. Ao abri-lo, as ações aparecem
com ícone e texto; **Mover para outro grupo** abre o seletor de destino no próprio
card, inclusive para **Outros**. Escolher o grupo corrente apenas fecha o seletor,
sem repetir uma gravação remota. Título e descrição tornam-se editáveis no
próprio card selecionado, sem navegar para outra tela. Grupos e cursos permanecem
em ordem alfabética depois de cada alteração. Excluir um grupo deixa seus itens
em **Outros**;
**Retirar de Trilhas** é a ação separada que remove uma seleção oficial, e
**Excluir** remove a composição privada escolhida.

Títulos, mensagens de erro, seletores e menus permanecem contidos na largura da
home e quebram texto longo, inclusive com zoom ou em telas estreitas; nenhum
controle deve ser empurrado para fora do card.

Essa ordenação alfabética vale para a biblioteca, não para a árvore pedagógica.
Mover uma parte do curso muda sua posição na composição corrente; copiar uma
parte para outro curso cria uma cópia independente. Excluir uma parte retira também seus
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
As etiquetas permanecem no nível da microssequência. Dentro dela, o
preenchimento de cada card comunica sua conclusão sem repetir `0/1` ou `1/1`;
zerar progresso e **Play** continuam disponíveis, e este último entra no
runtime. Em modo de autoria, editar ou excluir age no próprio card estrutural e
não dispara a navegação de estudo.

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

Uma edição manual curta altera somente texto com origem inequívoca: títulos,
parágrafos, rótulos, células, texto e código de alternativas, feedback de cada
alternativa, explicação posterior e texto ao redor de uma lacuna. A resposta
correta, os tokens e respostas aceitas da lacuna, identidades, tipos, relações,
quantidade e ordem permanecem protegidos. O campo acompanha a largura do
resource e texto longo quebra ou rola dentro da própria caixa, inclusive no
teclado do smartphone, sem distorcer o runtime.

A assistência envia o pedido com o contexto somente leitura, valida o retorno
e mostra diretamente o resultado. A última mudança pode ser desfeita. Uma
falha não altera parte do conteúdo e mantém a superfície utilizável. Alterar
semanticamente um exercício também limpa seu resultado e progresso anteriores,
para que uma resposta antiga não continue marcada como correta.

Providers remotos de IA exigem conexão. Estudo e edição manual do conteúdo já
baixado continuam disponíveis sem rede; o bridge local também pode prestar
assistência textual se estiver acessível no próprio dispositivo. O app grava um
rascunho durável, mantém a identidade da tentativa e sincroniza ao reconectar.
Mudanças em folhas distintas são combinadas; se o mesmo texto tiver sido
alterado remotamente, o rascunho é preservado e o conflito é informado, sem
sobrescrita silenciosa. A autorização armazenada serve apenas para texto no
conteúdo já baixado. Mover, excluir, comentar, publicar e usar providers remotos
continuam exigindo conexão e autorização atual do servidor.

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
