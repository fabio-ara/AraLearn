# Guia de administração de workspace

Um curso construído por várias pessoas exige respostas claras para três
perguntas: quem pode consultar o projeto, quem pode modificá-lo e quem responde
pelas decisões de acesso. O AraLearn reúne essas respostas em um
**workspace**, isto é, um espaço delimitado de autoria e colaboração. Cada
workspace possui participantes, papéis e cursos próprios; uma permissão
concedida nele não se estende a outros espaços nem ao catálogo público.

Este guia ensina as tarefas administrativas. A fundamentação e o modelo
completo estão em [Workspaces educacionais](workspaces-educacionais.md).

## Antes de administrar

Convém distinguir três elementos que aparecem próximos na interface:

- **workspace**: delimita pessoas, permissões e um projeto de autoria;
- **Trilhas**: reúne os cursos e planejamentos aos quais a conta tem acesso;
- **grupo de Trilhas**: pasta pessoal usada apenas para organizar itens na
  tela inicial.

Excluir ou renomear um grupo não altera o workspace. Retirar uma pessoa do
workspace, por sua vez, pode retirar o acesso que dependia daquela
participação. Essa separação reduz o risco de uma ação de organização pessoal
produzir uma mudança coletiva.

As tarefas de participantes e convites são realizadas por uma assistência de
autoria conectada e autorizada. A tela do workspace no aplicativo concentra a
composição do curso e as observações pedagógicas; ela não apresenta um
formulário completo de gestão de pessoas. Todas as mudanças compartilhadas
exigem conexão, porque o servidor precisa confirmar a identidade e o papel de
quem solicita a ação.

## Escolher o menor papel necessário

Um papel reúne permissões relacionadas. O princípio orientador é conceder
somente as permissões necessárias para a responsabilidade assumida.

| Papel | Consulta | Autoria | Revisão e comentários | Publicação pelo workspace | Gestão de pessoas | Transferência da propriedade |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Proprietário | sim | sim | sim | sim | sim | sim |
| Administrador | sim | sim | sim | sim | sim | não |
| Professor/Autor | sim | sim | sim | sim | não | não |
| Revisor | sim | não | sim | não | não | não |
| Estudante | sim | não | comentários próprios | não | não | não |
| Leitor | sim | não | não | não | não | não |

“Publicação pelo workspace” não significa poder editorial global. Distribuir
um curso em **Coleções** também exige que a conta possua a autorização
editorial correspondente. Assim, ser proprietário de um workspace não torna a
pessoa administradora do catálogo.

Administradores podem convidar e organizar participantes, mas não podem criar
outro administrador, alterar outro administrador nem retirar o proprietário
principal. Essas restrições evitam que a delegação administrativa se transforme
em transferência implícita de responsabilidade.

## Criar um workspace

**Pré-condição:** estar autenticado, conectado à internet e ter uma assistência
de autoria autorizada para a conta.

**Passos:**

1. Informe à assistência que deseja criar um workspace.
2. Dê um título que identifique o projeto e descreva sua finalidade.
3. Indique se o espaço é pessoal, de turma ou de equipe.
4. Peça a criação da primeira estrutura do curso. Não é necessário criar um
   contêiner vazio antes do planejamento.
5. Sincronize **Trilhas** no aplicativo.

**Resultado esperado:** o projeto aparece em **Trilhas**. A pessoa que o criou
é o proprietário principal e pode abrir a composição corrente. Assim que cards
forem materializados, eles podem ser estudados no mesmo item; não é preciso
marcar o curso como “publicado” para testá-lo.

**Sem conexão:** a criação não é concluída, porque identidade, unicidade e
permissões precisam ser verificadas no servidor.

**Recuperação:** se a assistência confirmar a criação, mas o item não aparecer,
use a sincronização de **Trilhas**. Antes de repetir o pedido, peça à assistência
que consulte os workspaces acessíveis; isso evita criar dois projetos com a
mesma finalidade.

## Convidar uma pessoa

**Pré-condição:** ser proprietário ou administrador, conhecer o e-mail da conta
convidada e estar conectado.

**Passos:**

1. Escolha o workspace e o papel necessário.
2. Peça à assistência para criar o convite para o e-mail informado.
3. Copie o código devolvido. Ele é mostrado no momento da criação e não fica
   disponível para consulta posterior.
4. Envie o código por um canal apropriado à pessoa convidada.
5. Oriente-a a entrar no AraLearn com o mesmo e-mail e aceitar o convite.

**Resultado esperado:** o convite permanece válido por até sete dias. Após a
aceitação, a pessoa aparece como participante e o workspace entra em suas
**Trilhas**.

**Sem conexão:** não é possível criar nem aceitar convites.

**Recuperação:** se o código for perdido ou expirar, cancele o convite pendente
ou gere outro para o mesmo e-mail. Um novo convite substitui o anterior. Se a
aceitação indicar outra conta, confirme se o e-mail autenticado corresponde
exatamente ao endereço convidado.

O banco armazena uma impressão criptográfica do código, e não o código legível.
Por isso, nem a assistência nem a administração conseguem “reexibir” o mesmo
código depois.

## Cancelar um convite

**Pré-condição:** ser proprietário ou administrador, ter um convite pendente e
estar conectado.

**Passos:** peça à assistência para listar os convites do workspace, identifique
o endereço correto e solicite o cancelamento.

**Resultado esperado:** o código deixa de conceder participação.

**Sem conexão:** a lista compartilhada e o cancelamento não ficam disponíveis.

**Recuperação:** sincronize ou consulte novamente antes de repetir a ação. Um
convite que já foi aceito não é cancelado; nesse caso, use a remoção de membro.

## Alterar o papel de um participante

**Pré-condição:** ser proprietário ou administrador e estar conectado. Um
administrador não pode promover alguém a administrador nem alterar outro
administrador.

**Passos:**

1. Consulte os participantes e confirme a identidade da pessoa.
2. Compare a responsabilidade real com a tabela de papéis deste guia.
3. Solicite a alteração para o menor papel suficiente.
4. Consulte novamente o workspace para confirmar o resultado.

**Resultado esperado:** as permissões futuras passam a refletir o novo papel.
Toda leitura ou escrita remota volta a conferir a autorização; a interface não
é a fonte final de permissão.

**Sem conexão:** o último papel conhecido pode continuar visível, mas não pode
ser alterado nem usado para autorizar novas operações compartilhadas.

**Recuperação:** se a mudança for recusada, verifique seu próprio papel, o papel
do alvo e se a pessoa é o proprietário principal. Para mudar o proprietário,
use a tarefa específica de transferência.

## Remover um participante

**Pré-condição:** ser proprietário ou administrador, estar conectado e não ter
como alvo o proprietário principal. Um administrador também não pode retirar
outro administrador.

**Passos:** consulte os participantes, confirme a conta e peça a remoção.

**Resultado esperado:** o acesso concedido exclusivamente pelo workspace é
revogado. Cursos próprios da pessoa e acessos obtidos por outra origem não são
apagados.

**Sem conexão:** a remoção não é executada.

**Recuperação:** se o item ainda aparecer no dispositivo removido, ele pode ser
uma réplica anterior. A próxima sincronização deve atualizar **Trilhas**; uma
operação remota não será autorizada com o vínculo revogado.

## Transferir a propriedade principal

**Pré-condição:** ser o proprietário principal, escolher um participante já
existente e estar conectado.

**Passos:**

1. Confirme que a pessoa aceita responder pela administração do espaço.
2. Peça a transferência para a conta correta.
3. Consulte novamente os detalhes e os papéis.
4. Ajuste o papel do antigo proprietário, se necessário.

**Resultado esperado:** a outra pessoa se torna proprietária principal e passa
a ser a única capaz de transferir novamente essa responsabilidade.

**Sem conexão:** a propriedade não muda.

**Recuperação:** se a pessoa ainda não participa, convide-a primeiro. Não tente
contornar a transferência atribuindo apenas o rótulo de proprietário; a
responsabilidade principal é registrada separadamente.

## Sair de um workspace

**Pré-condição:** participar do workspace sem ser seu proprietário principal e
estar conectado.

**Passos:** peça à assistência para retirar sua própria participação e confirme
a intenção.

**Resultado esperado:** o item deixa de ser acessível quando não houver outra
origem de acesso.

**Sem conexão:** a saída não pode ser confirmada pelo servidor.

**Recuperação:** o proprietário principal precisa transferir a propriedade
antes de sair. Se o item permanecer visível após uma saída concluída,
sincronize o dispositivo.

## Acompanhar conteúdo e observações

**Pré-condição:** ter acesso de leitura ao workspace.

**Passos:** abra **Trilhas**, use a ação contextual do item e examine a
composição. Papéis com revisão podem consultar as observações ligadas ao
workspace, responder, ajustar seu estado e, quando houver uma correção real,
vincular o reparo concluído.

**Resultado esperado:** o detalhe apresenta o estado corrente do projeto. Uma
resposta a uma observação não altera o curso; edição e vínculo de correção são
ações distintas.

**Sem conexão:** a composição previamente carregada pode permanecer disponível,
e edições textuais autorizadas podem entrar na fila local. Convites, papéis,
publicação e triagem compartilhada exigem rede.

**Recuperação:** quando uma edição textual entrar em conflito com uma mudança
remota no mesmo campo, escolha conscientemente entre manter a redação local ou
descartá-la. Não limpe os dados do aplicativo antes de resolver ou enviar a
fila, pois isso pode remover a única cópia local da edição.

## Princípios de administração

- revise periodicamente papéis que já não correspondem às responsabilidades;
- não use observações, tempo de acesso ou conclusão estrutural para ranquear
  estudantes;
- confirme identidade e alvo antes de uma mudança irreversível de acesso;
- prefira transferir responsabilidade explicitamente a compartilhar uma conta;
- trate a colaboração como possibilidade educacional a ser avaliada, não como
  prova automática de aprendizagem ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)).

Consulte também [Observações pedagógicas nos cards](observacoes-pedagogicas.md)
e [Privacidade no AraLearn](privacidade.md).
