# Solução de problemas

## Como diagnosticar sem perder trabalho

O AraLearn combina uma réplica no dispositivo com dados sincronizados no servidor. Essa arquitetura permite estudar e fazer parte das edições sem conexão, mas também significa que um sintoma pode ter três origens diferentes:

1. a interface não conseguiu ler ou atualizar a réplica local;
2. a réplica está íntegra, porém há alterações aguardando rede;
3. o servidor rejeitou a operação por autenticação, permissão, conflito ou conteúdo inválido.

Antes de apagar dados, descubra em qual camada está o problema. **Recarregar, autenticar novamente e sincronizar são ações recuperáveis; limpar o armazenamento local não é.** Uma réplica apagada pode conter a única cópia de uma edição ainda não enviada.

Use esta ordem geral:

1. anote a tela, a mensagem e a ação que produziu o problema;
2. confira se o dispositivo está conectado;
3. abra o painel pelo ícone de nuvem e verifique sessão e sincronização;
4. tente novamente sem limpar dados;
5. use uma ação destrutiva somente quando a seção correspondente explicar sua consequência.

## Não consigo entrar na conta

**Pré-condição.** Ter acesso ao endereço de e-mail cadastrado e, para autenticação remota, conexão com a internet.

**Passos.**

1. Confira se o e-mail foi digitado por inteiro e sem espaços.
2. Verifique se a senha tem ao menos oito caracteres.
3. Se a conta já existe e a senha foi esquecida, escolha a recuperação de senha na tela de acesso.
4. Abra o link recebido no mesmo navegador ou dispositivo em que concluirá a redefinição.
5. Defina a nova senha e tente entrar novamente.

**Resultado esperado.** A sessão é criada e a réplica da conta é aberta ou reconstruída.

**Sem conexão.** Uma nova autenticação e a recuperação de senha não funcionam sem acesso ao servidor. Se a sessão existente ainda for válida e a réplica estiver disponível, não saia da conta apenas para testar a senha.

**Recuperação.** Se o e-mail não chegar, verifique spam, endereço informado e configuração de mensagens da instância. Repetir o cadastro com outro e-mail cria outra identidade e não recupera automaticamente os dados da primeira.

## O aplicativo não conclui a inicialização

**Pré-condição.** Manter a tela de recuperação aberta e saber se existem edições recentes ainda não sincronizadas.

**Passos.**

1. Recarregue a página uma vez.
2. Feche outras abas do AraLearn e abra novamente, pois outra aba pode estar concluindo uma atualização da base local.
3. Restabeleça a conexão e tente iniciar de novo.
4. Se a tela informar que a gravação local foi interrompida, use **Tentar gravar novamente**.
5. Use **Limpar dados deste dispositivo** somente como último recurso e somente se aceitar perder alterações ainda não enviadas.

**Resultado esperado.** O aplicativo abre a réplica existente ou, depois da limpeza autorizada, baixa uma nova réplica do servidor.

**Sem conexão.** Não limpe a réplica esperando que ela seja reconstruída imediatamente: sem servidor, o aplicativo não consegue baixá-la novamente.

**Recuperação.** Dados já sincronizados reaparecem após autenticação e sincronização. Dados que existiam somente na réplica apagada não podem ser restaurados pelo servidor.

## Um curso não aparece em Trilhas

**Pré-condição.** Estar autenticado e saber se o curso é pessoal, pertence a um workspace ou está disponível em Coleções.

**Passos.**

1. Abra o painel pelo ícone de nuvem.
2. Entre em **Coleções** e localize o curso.
3. Use a ação explícita **Adicionar a Trilhas** no card do curso.
4. Volte a **Trilhas** e, se estiver conectado, sincronize.
5. Se o curso vinha de um workspace, confirme se sua participação e permissão de leitura continuam ativas.

**Resultado esperado.** O curso passa a integrar a seleção pessoal exibida em Trilhas. Apenas abrir um curso ou usar o botão Play não altera essa seleção.

**Sem conexão.** Só é possível adicionar um curso que já esteja conhecido pela réplica local. Um curso nunca baixado exige conexão inicial.

**Recuperação.** Se uma permissão de workspace foi revogada, o curso concedido exclusivamente por aquele espaço deixa de estar disponível. Cursos próprios não são apagados por essa revogação.

## Um curso aparece, mas não abre

**Pré-condição.** Manter os demais cursos e a réplica local intactos.

**Passos.**

1. Teste outro curso para saber se a falha é geral ou restrita a um item.
2. Com conexão, abra o painel e sincronize.
3. Se apenas um curso distribuído continuar falhando, retire-o de Trilhas, adicione-o novamente por Coleções e sincronize.
4. Registre a mensagem exibida se a nova cópia também não abrir.

**Resultado esperado.** Uma publicação válida volta a abrir sem interferir nos demais cursos.

**Sem conexão.** Um curso precisa ter sido materializado ao menos uma vez no dispositivo para abrir offline. A remoção e a adição de uma publicação exigem conexão se os dados não estiverem na réplica.

**Recuperação.** Uma publicação inválida é isolada. Não limpe toda a base por causa de um único curso; comunique o identificador e a mensagem ao responsável pelo catálogo.

## O aplicativo mostra o último estado conhecido

**Pré-condição.** Distinguir “estado desatualizado” de “estado perdido”: verifique se o conteúdo ainda está visível e se o painel indica falta de conexão ou sincronização pendente.

**Passos.**

1. Continue o estudo se o curso e os cards necessários estiverem disponíveis.
2. Faça marcações **Rever** e observações normalmente.
3. Quando houver rede, abra o painel e sincronize.
4. Confira se o indicador de pendência desaparece.

**Resultado esperado.** O trabalho local permanece utilizável e, depois da conexão, é reconciliado com o servidor.

**Sem conexão.** Convites, mudanças de papel, publicação, catálogo ainda não baixado e provedores remotos de assistência não podem ser atualizados. O estudo já materializado continua local.

**Recuperação.** Se o servidor rejeitar uma alteração porque o alvo foi removido ou a permissão mudou, o aplicativo conserva o aviso em vez de substituir silenciosamente o estado corrente.

## Uma alteração pessoal continua aguardando envio

**Pré-condição.** Não limpar os dados do dispositivo e manter a sessão da mesma conta.

**Passos.**

1. Confirme a conexão.
2. Abra o painel e acione a sincronização.
3. Aguarde a conclusão antes de sair da conta.
4. Se a pendência permanecer, anote o curso e a operação: progresso, **Rever** ou observação.

**Resultado esperado.** A alteração deixa a fila local e passa a integrar o estado remoto da conta.

**Sem conexão.** A pendência é esperada; ela já está gravada localmente e não precisa ser repetida.

**Recuperação.** Se o alvo deixou de existir, a operação não pode ser aplicada como se ainda fosse válida. Preserve o aviso e comunique o caso; repetir toques ou recriar a observação sem entender a rejeição pode gerar duplicidade sem resolver a referência.

## Uma edição de autoria está pendente ou entrou em conflito

**Pré-condição.** Ter papel que permita autoria no workspace e identificar se a mudança é apenas textual ou altera a estrutura do curso.

**Passos.**

1. Não feche a conta nem limpe a réplica.
2. Restabeleça a conexão e sincronize.
3. Se o aplicativo informar conflito, compare a revisão local com a revisão corrente do servidor.
4. Escolha conscientemente entre preservar a edição local para reaplicação ou descartar a versão local em favor da remota.
5. Sincronize novamente antes de mover ou excluir objetos relacionados.

**Resultado esperado.** A edição textual é aceita sobre a revisão esperada ou permanece explicitamente pendente para decisão humana. O aplicativo não deve misturar duas revisões silenciosamente.

**Sem conexão.** Edições textuais autorizadas podem entrar na fila local. Operações estruturais, mudanças de permissão e publicação dependem do servidor.

**Recuperação.** Copie para um local seguro qualquer texto que precise ser preservado antes de escolher “descartar local”. Se a permissão foi revogada, peça ao administrador que esclareça o destino do trabalho; recuperar a permissão não é uma operação que o dispositivo possa executar sozinho.

## O botão Play ou a troca de tema demora quando falta conexão

**Pré-condição.** O aplicativo já ter sido carregado e o curso estar disponível na réplica.

**Passos.**

1. Toque uma vez e observe se a interface apresenta feedback imediato.
2. Verifique se outra caixa de diálogo, prática incompleta ou renderização do card está bloqueando o avanço.
3. Recarregue a página sem limpar dados.
4. Quando houver conexão, permita que o aplicativo atualize seus arquivos em cache e teste novamente offline.

**Resultado esperado.** Tema, revelação do feedback e avanço entre cards materializados respondem localmente; a sincronização ocorre separadamente e não deve bloquear o toque.

**Sem conexão.** A ausência de rede, por si só, não deve aumentar a latência dessas ações. Se isso ocorrer de forma reproduzível, trata-se de defeito a ser relatado.

**Recuperação.** Informe dispositivo, navegador, curso, card e duração aproximada, além de dizer se a rede estava ausente ou apenas instável. Não repita o toque rapidamente, pois duas ações de navegação podem tornar o diagnóstico ambíguo.

## Uma prática não permite avançar

**Pré-condição.** Identificar o tipo de resposta: escolha, lacuna com alternativas, digitação ou ordenação.

**Passos.**

1. Complete todos os alvos visíveis do próprio recurso.
2. Em uma lacuna com alternativas, toque na lacuna e escolha uma opção específica dela.
3. Para retirar uma resposta, toque novamente na lacuna preenchida.
4. Em digitação, confira espaços significativos, símbolos, acentos e formato solicitado.
5. Use o botão Play para validar; não procure outro botão de conferência.

**Resultado esperado.** O aplicativo informa o resultado sem revelar antecipadamente a resposta. Um novo toque no Play avança quando o estado do card permite.

**Sem conexão.** A validação dos cards já materializados ocorre localmente.

**Recuperação.** Se preencher uma lacuna também preencher as demais, se o alvo aparecer fora do recurso ou se a resposta correta já vier revelada, registre o curso, o card e uma captura: isso indica defeito no contrato ou na materialização, não erro do estudante.

## Uma observação não sincroniza ou não abre o alvo

**Pré-condição.** A observação ainda estar visível no dispositivo e pertencer à mesma conta.

**Passos.**

1. Abra a observação e confira o curso e o tipo registrado.
2. Restabeleça a conexão e sincronize.
3. Tente abrir o alvo novamente.
4. Se o alvo foi removido em uma revisão posterior, preserve o texto e informe a referência ao autor ou revisor.

**Resultado esperado.** Uma observação válida é enviada e volta a abrir o objeto situado.

**Sem conexão.** A criação fica local; a consulta compartilhada e a resposta de revisores dependem do servidor.

**Recuperação.** A exclusão do alvo não autoriza o aplicativo a anexar automaticamente a observação a outro card. Esse vínculo exige decisão humana para não mudar o sentido do comentário.

## Não consigo entrar ou administrar um workspace

**Pré-condição.** Ter conexão, sessão ativa e o convite ou papel correspondente.

**Passos.**

1. Confirme que o convite foi enviado ao mesmo e-mail da conta autenticada.
2. Verifique se o convite ainda está dentro do prazo de sete dias e não foi revogado.
3. Aceite o convite com o código completo recebido.
4. Se já for participante, consulte o papel exibido no workspace.
5. Para uma ação administrativa, compare esse papel com a tabela de capacidades em [Administração de workspaces](guia-administracao-workspace.md).

**Resultado esperado.** A pessoa entra com o papel concedido e vê somente as ações autorizadas.

**Sem conexão.** Convites, alterações de papel, remoção de participantes e transferência de propriedade não funcionam offline.

**Recuperação.** Um administrador pode emitir novo convite se o anterior expirou. O proprietário não pode simplesmente abandonar um workspace sem antes transferir a propriedade ou encerrar o espaço conforme a política institucional.

## A assistência por modelo de linguagem não altera o card

**Pré-condição.** Estar em modo de edição, selecionar o card inteiro ou rótulos autorizados e configurar um provedor acessível.

**Passos.**

1. Abra o chat de assistência do card.
2. Confirme visualmente quais recursos ou textos estão selecionados.
3. Verifique modelo, endereço do serviço e credencial exigida.
4. Faça um pedido pequeno, observável e compatível com o alvo selecionado.
5. Leia a resposta: o assistente pode explicar que não houve mudança quando o pedido não autoriza uma alteração válida.
6. Se a mudança for aplicada, continue a conversa para refiná-la ou use desfazer/restaurar.

**Resultado esperado.** A resposta é validada e modifica somente os campos textuais autorizados; estrutura e campos fora da seleção permanecem inalterados.

**Sem conexão.** Provedores remotos não respondem. Um provedor local exige que o serviço esteja em execução no endereço configurado.

**Recuperação.** Uma resposta tardia, malformada ou fora do contrato não deve alterar parcialmente o conteúdo. Reduza o escopo, reformule o pedido e tente de novo. Nunca cole uma chave de API em observação, card ou relatório público. Consulte [Assistência por modelo de linguagem](assistencia-por-ia.md).

## A integração externa de autoria não acessa a conta

**Pré-condição.** Usar uma integração compatível, conexão com o servidor e permissão de autoria no workspace ou curso.

**Passos.**

1. Abra a configuração de integrações no AraLearn.
2. Use o endereço de serviço indicado pela própria instância.
3. Inicie a autorização e entre na conta que possui a permissão necessária.
4. Leia o escopo solicitado antes de consentir.
5. Volte ao cliente externo e tente uma leitura simples antes de iniciar alterações.

**Resultado esperado.** A integração recebe uma autorização vinculada à conta e o servidor aplica as mesmas permissões do workspace.

**Sem conexão.** A autorização e as operações remotas não funcionam offline.

**Recuperação.** Se a conta errada foi autorizada, encerre o fluxo e refaça-o com a identidade correta. Não substitua o processo de autorização por uma chave pessoal estática. Veja [Autoria externa](autoria-mcp.md).

## A conta não é excluída

**Pré-condição.** Estar autenticado e conectado, além de compreender que a exclusão concluída não oferece restauração automática.

**Passos.**

1. Sincronize ou exporte o que precisar preservar.
2. Resolva a propriedade de workspaces que não possam ficar sem responsável.
3. Escolha **Excluir conta** e confirme.
4. Se a interface apresentar erro, anote a mensagem e não presuma que a conta foi removida.

**Resultado esperado.** Quando o servidor confirma a exclusão, o aplicativo limpa a réplica local e volta à tela de acesso.

**Sem conexão.** A operação não pode ser concluída.

**Recuperação.** Se houve erro, tente novamente com conexão estável ou procure o responsável pela instância. Se a tela de acesso apareceu sem confirmação clara, tente entrar antes de repetir o pedido: isso distingue falha de sessão de exclusão efetiva.

## O desenvolvimento local não inicia

**Pré-condição.** Ter instalado o ambiente descrito na documentação de desenvolvimento e trabalhar em uma cópia do repositório, não na instância usada para estudar.

**Passos.**

1. Confira as versões de Node.js e das dependências indicadas pelo projeto.
2. Verifique as variáveis públicas de conexão e a porta escolhida.
3. Confirme se a porta não está ocupada por outro processo.
4. Para testes automatizados, use a variável `ARALEARN_E2E_PORT` e uma porta isolada.
5. Execute primeiro a validação focada no componente alterado e depois a suíte indicada no [Guia do desenvolvedor](guia-desenvolvedor.md).

**Resultado esperado.** O servidor local inicia sem encerrar processos alheios e os testes usam uma instância isolada.

**Sem conexão.** Dependências já instaladas e testes puramente locais podem funcionar; autenticação, sincronização e serviços remotos precisam de substitutos de teste ou rede.

**Recuperação.** Não finalize um processo desconhecido apenas para liberar a porta. Escolha outra porta ou identifique primeiro o proprietário do processo.

## Como registrar um defeito útil e seguro

**Pré-condição.** Reproduzir o problema ao menos uma vez sem expor conteúdo privado.

**Passos.**

1. Informe versão do AraLearn, navegador ou APK, sistema operacional e largura aproximada da tela.
2. Descreva pré-condição, passos, resultado observado e resultado esperado.
3. Diga se o dispositivo estava online, offline ou com conexão instável.
4. Identifique curso, módulo e card por nomes não sigilosos ou por identificadores técnicos quando puderem ser publicados.
5. Anexe uma captura recortada, ocultando e-mails, convites, chaves e conteúdo privado.
6. Registre o defeito no [repositório do projeto](https://github.com/fabio-ara/AraLearn/issues) ou no canal da instituição responsável pela instância.

**Resultado esperado.** Outra pessoa consegue reproduzir o problema e avaliar o risco sem solicitar dados pessoais adicionais.

**Sem conexão.** Guarde a descrição e as capturas no dispositivo; envie quando estiver em uma conexão adequada.

**Recuperação.** Se um segredo foi incluído por engano, revogue-o imediatamente. Remover uma captura ou editar a mensagem não garante que cópias anteriores tenham desaparecido.
