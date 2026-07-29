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

Os cards podem combinar texto, escolhas, código, tabelas, matrizes, planos cartesianos, grafos, mapas de relações, árvores e fluxogramas. Os cards de estudo não exibem controles de movimentação. A segunda aba abre a área de autoria e a assistência de linguagem para a microssequência que está sendo estudada.

Nos grafos, nomes curtos permanecem junto dos vértices e arestas. Nomes que não cabem no desenho recebem uma chave curta e aparecem por inteiro na legenda abaixo do grafo.

Ao editar um curso selecionado, o aplicativo cria uma área de trabalho local
associada à revisão baixada. Os botões de autoria permanecem disponíveis para
reordenar a estrutura, criar partes e aplicar correções bottom-up com o serviço
de linguagem configurado. Essas alterações ficam neste dispositivo e não
modificam silenciosamente o artefato oficial.

Um curso oficial continua compartilhado como revisão imutável. Para transformar
o trabalho local numa nova publicação, o autor inicia uma execução baseada no
hash atual; só a validação integral pode trocar o ponteiro remoto.

## Integrar uma ferramenta de autoria

Abra a biblioteca e toque em **Assistente**. O painel reúne o pacote, as
instruções, o conhecimento e a configuração MCP preparada para o ChatGPT, sem
exigir acesso ao repositório.

No mesmo painel, uma integração pessoal permite criar, renovar e revogar uma chave para a ferramenta externa. A chave completa aparece uma única vez e só pode produzir cursos privados da própria conta. Ela não publica em coleções oficiais nem dá acesso direto ao banco.

Contas que já receberam permissão editorial também veem a área **Catálogo**.
Ela prepara a configuração MCP das coleções, mas não cria nem mostra uma chave
editorial: essa chave permanece separada e sob responsabilidade da conta
autorizada.

A integração pode criar, reorganizar e revisar um curso em workspace. Uma
revisão incompleta pode entrar na biblioteca como prévia privada `partial`
para teste; o catálogo continua aceitando somente revisões `complete`.

## Sincronização

O aplicativo tenta sincronizar ao abrir, ao recuperar conexão, ao voltar para a tela e depois de uma gravação local. Enquanto não houver rede, o estudo segue normalmente e as alterações aguardam no dispositivo.

O ícone de sincronização pede uma nova tentativa imediata. Ele não é necessário para salvar o trabalho.

Se a mesma conta fizer mudanças de progresso, comentários ou trilhas em dispositivos diferentes, passa a valer a última alteração válida recebida pelo servidor. O conteúdo da área de autoria local não entra nessa fila e permanece no dispositivo até seguir por um fluxo integral de autoria. O AraLearn não exige que o estudante compare versões do estado pessoal.

## Atualização de cursos

Quando uma publicação oficial é atualizada, o dispositivo baixa a nova árvore antes de substituir a anterior. Se o download falhar, o material já disponível continua preservado. Se houver uma área de autoria local alterada para o curso, a troca também é adiada para não apagar o trabalho em andamento.

Progresso e comentários continuam ligados às partes do curso que mantiverem a mesma identidade. Quando uma parte deixa de existir, os dados ligados a ela deixam de ser usados.

## Quando algo falha

- Sem rede, demora de resposta ou indisponibilidade temporária: a alteração permanece guardada e será enviada depois.
- Sessão expirada: o trabalho local permanece guardado; basta entrar novamente.
- Ação inválida ou sem permissão: a tela informa que a ação precisa ser refeita ou descartada.
- Falha ao gravar no dispositivo: um aviso curto oferece nova tentativa e pode ser fechado sem interromper a navegação.

## Sair e excluir a conta

Sair encerra a sessão e preserva os dados locais da conta.

Excluir a conta exige confirmação. A operação remove as seleções, trilhas, progresso, comentários e dados locais daquela conta. Cursos oficiais não são removidos.
