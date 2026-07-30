# Uso do app

O uso cotidiano segue um caminho simples: entrar, escolher cursos, organizá-los em trilhas e estudar. A edição aparece quando a pessoa quer adaptar o conteúdo.

## Mapa mental em um minuto

Quatro ideias bastam para acompanhar o funcionamento cotidiano:

1. A conta guarda seleções, trilhas, progresso e comentários.
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

## Escolher cursos

Na aba **Coleções**, a busca percorre o catálogo oficial. As coleções são organizadas pelo AraLearn.

Ao adicionar um curso, a conta passa a tê-lo na biblioteca e o dispositivo baixa o material para estudo. Isso não altera o curso oficial nem cria outra cópia dele no banco.

Ao remover um curso, a conta deixa de selecioná-lo. A publicação oficial continua disponível no catálogo para outras pessoas.

## Organizar trilhas

Na aba **Trilhas**, é possível criar, renomear e ordenar trilhas, bem como mover cursos entre elas. Um curso pertence a uma trilha por vez. Os cursos ainda não organizados permanecem em **Sem trilha**.

Excluir uma trilha não exclui os cursos; eles voltam para **Sem trilha**. Progresso e comentários acompanham o curso quando ele muda de lugar.

## Estudar

A navegação segue a ordem:

```text
curso -> módulo -> lição -> microssequência -> card
```

Depois que o material é baixado, o estudo continua sem conexão. Progresso e comentários são gravados primeiro no dispositivo. A gravação normal é silenciosa; se demorar, aparece apenas um indicador discreto. Se falhar, um aviso compacto permite tentar novamente ou fechar a mensagem sem bloquear o estudo.

Os cards podem usar dezoito recursos: parágrafo, escolha, composição, código,
tabela, fluxo, árvore, grafo, mapa de relações, matriz, plano cartesiano,
fórmula, gráfico estatístico, sequência, texto anotado, exemplo linguístico,
mapa de sistema e reação química. Os cards de estudo não exibem controles de
movimentação. A segunda aba abre a área de autoria e a assistência de linguagem
para a microssequência que está sendo estudada.

Nos grafos, nomes curtos permanecem junto dos vértices e arestas. Nomes que não cabem no desenho recebem uma chave curta e aparecem por inteiro na legenda abaixo do grafo.

Ao editar um curso selecionado, o aplicativo cria uma área de trabalho local
associada à revisão baixada. Os botões de autoria permanecem disponíveis para
reordenar a estrutura, criar entidades e aplicar reparos atômicos com o serviço
de linguagem configurado. Na microssequência, a assistência pode reparar o
card inteiro ou somente os recursos selecionados e criar exatamente um card
por pedido. Essas alterações ficam neste dispositivo e não
modificam silenciosamente o artefato oficial.

Um curso oficial continua compartilhado como revisão imutável. O `localDraft`
não é publicado diretamente pelo aplicativo: para transformá-lo numa revisão
remota, a pessoa autora exporta o documento e o importa num workspace pelo
fluxo GPT com MCP. A publicação pode ser privada e parcial para teste; somente
um curso completo passa ao catálogo. Validação e comparação da revisão esperada
ocorrem antes de trocar o ponteiro remoto.

## Integrar uma ferramenta de autoria

Abra a biblioteca e toque em **Assistente**. O painel mostra duas etapas:
primeiro copia a URL para criar o plugin do AraLearn em **Plugins → Novo
plugin**, com **URL do servidor** e **OAuth**; depois baixa as instruções e os
dois conhecimentos para o GPT personalizado, no qual o plugin AraLearn também
precisa estar ativo. Não é preciso acessar o
repositório nem copiar uma chave estática.

Ao conectar o plugin no ChatGPT, o usuário entra na própria conta por OAuth e
aprova o consentimento.

Contas que já receberam permissão editorial também veem a área **Catálogo**.
A mesma conexão OAuth passa a expor as ferramentas de catálogo autorizadas
para aquela conta.

A integração pode criar, reorganizar e revisar um curso em workspace. Uma
revisão incompleta pode entrar na biblioteca como prévia privada `partial`
para teste; o catálogo continua aceitando somente revisões `complete`.

## Sincronização

O aplicativo tenta sincronizar ao abrir, ao recuperar conexão, ao voltar para a tela e depois de uma gravação local. Enquanto não houver rede, o estudo segue normalmente e as alterações aguardam no dispositivo.

O ícone de sincronização pede uma nova tentativa imediata. Ele não é necessário para salvar o trabalho.

Se a mesma conta fizer mudanças de progresso, comentários ou trilhas em dispositivos diferentes, passa a valer a última alteração válida recebida pelo servidor. O conteúdo da área de autoria local não entra nessa fila e permanece no dispositivo até seguir por um fluxo integral de autoria. O AraLearn não exige que o estudante compare versões do estado pessoal.

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
