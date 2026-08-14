# Privacidade e tratamento de dados

## Por que este tema faz parte do funcionamento do AraLearn

Um ambiente de aprendizagem precisa conservar dados suficientes para retomar o estudo, sincronizar alterações e controlar o acesso a espaços compartilhados. A mesma infraestrutura pode, porém, produzir registros desnecessários sobre o comportamento do estudante. O AraLearn separa essas duas necessidades: mantém **estado funcional**, necessário para prestar o serviço, e não transforma cada interação de estudo em um indicador de desempenho.

Essa separação não torna qualquer sistema automaticamente seguro ou eticamente adequado. Ela reduz a coleta no desenho do produto e deixa explícitos finalidade, destinatário e risco de cada fluxo. A governança de dados educacionais exige também regras institucionais, controle de acesso, informação compreensível ao participante e avaliação contínua das consequências do tratamento ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

Este documento descreve o comportamento implementado no AraLearn. Uma instituição que instale o software em infraestrutura própria deve complementar esta descrição com sua política de privacidade, seus responsáveis, suas bases jurídicas, seus prazos de retenção e seus canais de atendimento.

## Conceitos necessários

**Dado pessoal** é uma informação que identifica uma pessoa ou que pode ser relacionada a ela, como endereço de e-mail, identificador de conta ou participação em um workspace.

**Estado funcional de estudo** é o conjunto mínimo de dados que permite retomar uma atividade. No AraLearn, ele inclui posição no curso, cards estruturalmente concluídos, marcações **Rever** e observações da própria pessoa.

**Réplica local** é a cópia mantida no dispositivo para que o aplicativo abra rapidamente e continue funcionando sem conexão. Ela não é uma cópia de segurança independente: dados ainda não sincronizados podem existir somente nesse dispositivo.

**Servidor remoto** é a infraestrutura compartilhada que autentica contas, distribui cursos e sincroniza dados autorizados. Na configuração documentada neste repositório, essa função é exercida pelo Supabase.

**Serviço externo** é um provedor que não faz parte do núcleo do AraLearn, como um modelo de linguagem escolhido para auxiliar a edição. Quando a pessoa aciona esse serviço, parte do contexto necessário à tarefa deixa o dispositivo e passa a ser tratada também segundo as regras do provedor escolhido.

## Mapa dos dados tratados

### Conta e autenticação

O serviço de autenticação trata o endereço de e-mail, a credencial de acesso e a sessão. O AraLearn recebe o identificador da conta e os dados de sessão necessários para autorizar operações; a senha não integra o conteúdo dos cursos nem o contexto enviado à assistência de autoria.

O endereço de e-mail também pode ser usado para localizar o destinatário de um convite. Nesse caso, o convite conserva o e-mail normalizado, o papel proposto, a data de expiração e um resumo criptográfico do código de aceite. O código completo é apresentado na criação do convite e não é armazenado como texto recuperável no registro do convite.

### Cursos, workspaces e autoria

O servidor pode conservar:

- cursos e revisões necessárias à distribuição do material;
- workspaces, seus participantes, papéis e permissões;
- alterações de autoria e os dados mínimos usados para ordenar ou deduplicar uma operação;
- observações pedagógicas vinculadas a um alvo do curso;
- artefatos imutáveis de uma revisão submetida a avaliação ou distribuição.

Esses dados existem para que uma alteração não seja aplicada duas vezes, para que duas pessoas não sobrescrevam silenciosamente a mesma revisão e para que somente participantes autorizados leiam ou modifiquem um workspace. A autorização é reavaliada no servidor; ocultar um botão no navegador não é usado como mecanismo de segurança.

O estado corrente de autoria não é um arquivo de conversa. A implementação conserva a estrutura atual necessária para continuar o trabalho e referências compactas de operações em curso. Mensagens completas de uma conversa externa, respostas brutas e cópias sucessivas do curso não são anexadas ao conteúdo como histórico textual.

### Estado pessoal de estudo

A réplica funcional associa à conta e ao curso:

- o card em que a pessoa parou;
- os identificadores dos cards concluídos na progressão estrutural;
- as marcações pessoais **Rever**;
- as observações pedagógicas da própria pessoa e seu alvo.

O estado funcional não registra abertura de cada card, tempo de permanência, quantidade de tentativas, sequência de acertos e erros nem a última alternativa escolhida. Portanto, a interface consegue retomar o estudo, mas esse estado não deve ser interpretado como medida de aprendizagem, domínio ou esforço. A distinção é explicada em [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md).

### Observações pedagógicas

Uma observação contém categoria, texto e referência ao objeto observado. Em um workspace, ela também pode conter papel contextual, estado da análise, resposta e referência compacta à alteração que incorporou a observação.

O estudante comum não recebe uma listagem das observações dos colegas. Participantes com função de revisão podem consultar observações vinculadas ao workspace quando essa capacidade faz parte de seu papel. A lista compartilhada não é mantida no cache persistente de Trilhas. Esses limites reduzem exposição indevida, mas não substituem regras institucionais sobre o que pode ser escrito em uma observação.

### Assistência por modelo de linguagem

Quando a pessoa solicita uma alteração assistida, o provedor configurado recebe o pedido e um contexto delimitado pela seleção: textos autorizados, posição do objeto, vizinhança necessária e informações estruturais de leitura. O aplicativo valida a resposta e só grava alterações nos campos permitidos.

A conversa de assistência do card é mantida durante a sessão de edição para permitir pedidos sucessivos, desfazer e restaurar versões recentes. Na implementação atual, esse diálogo fica em memória e não é persistido como histórico pessoal no IndexedDB nem anexado ao curso. As chaves e segredos digitados na configuração do provedor também permanecem no estado em memória da sessão; não são gravados pelo editor na réplica local.

Esse desenho diminui a quantidade de contexto transmitida, mas não elimina o risco de divulgação. Antes de enviar um pedido, a pessoa deve conferir a seleção e evitar inserir dados pessoais, segredos, avaliações individuais ou documentos que o provedor não esteja autorizado a receber. Sistemas de IA exigem supervisão humana, delimitação de finalidade e comunicação de suas limitações ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai); [UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai)).

### Registros técnicos

O servidor conserva os registros necessários para autenticar operações, aplicar limites, deduplicar tentativas e investigar falhas. Recibos e resumos técnicos não equivalem a uma cópia integral do workspace e não devem ser tratados como mecanismo de restauração de conteúdo.

Os prazos e mecanismos implementados no banco estão descritos em [Supabase: desenvolvimento e implantação](supabase.md). Logs do provedor de hospedagem ou de um serviço externo podem seguir regras próprias; por isso, o responsável por cada implantação precisa documentar também essas camadas.

## O que permanece no dispositivo

O navegador ou o aplicativo Android usa três formas principais de armazenamento:

- **IndexedDB:** réplica relacional, estado de estudo e alterações que aguardam sincronização;
- **armazenamento de preferências:** escolhas locais de interface, como tema;
- **cache do aplicativo:** arquivos necessários para abrir a interface e executar recursos offline.

O IndexedDB é apropriado para dados estruturados maiores e para transações locais. Diferentemente de uma variável em memória, ele sobrevive ao fechamento da página; diferentemente de um arquivo único, permite atualizar conjuntos relacionados sem regravar toda a base. Essa escolha sustenta a continuidade offline, mas cria uma responsabilidade: limpar os dados do navegador pode apagar a única cópia de uma alteração que ainda não chegou ao servidor.

Sair da conta encerra a sessão e fecha as conexões locais, mas não deve ser confundido com apagar a réplica do dispositivo. Excluir a conta, quando confirmado e concluído pelo servidor, limpa também o estado local dessa conta no aplicativo. Uma limpeza local oferecida durante a recuperação de inicialização elimina a réplica e as alterações ainda não enviadas; deve ser usada somente depois das tentativas de recuperação descritas em [Solução de problemas](solucao-de-problemas.md).

## Operações que a pessoa pode realizar

### Encerrar a sessão sem excluir a conta

**Pré-condição.** Estar autenticado e, de preferência, sem alterações pendentes.

**Passos.**

1. Abra o painel pelo ícone de nuvem.
2. Verifique o indicador de sincronização.
3. Escolha **Sair**.
4. Se houver aviso de alterações pendentes, cancele, restabeleça a conexão e sincronize antes de tentar novamente.

**Resultado esperado.** A sessão é encerrada e a tela de acesso volta a ser exibida. A conta e os dados já sincronizados permanecem no servidor.

**Sem conexão.** O aplicativo pode identificar trabalho pendente e pedir confirmação. Sair não envia o que ainda está somente no dispositivo.

**Recuperação.** Se a saída for interrompida porque a gravação local não terminou, use **Tentar gravar novamente**. Não feche nem limpe o aplicativo enquanto esse aviso estiver ativo.

### Apagar somente a réplica deste dispositivo

**Pré-condição.** Confirmar que não há alterações necessárias aguardando envio. Esta ação aparece como recuperação quando a base local impede a inicialização normal.

**Passos.**

1. Tente primeiro recarregar o aplicativo e restabelecer a conexão.
2. Se a tela de recuperação continuar presente, leia o aviso sobre perda de dados locais.
3. Use a opção de limpar os dados deste dispositivo somente se aceitar a perda do que não foi sincronizado.

**Resultado esperado.** A réplica local é removida. Depois de autenticar e sincronizar, o dispositivo volta a receber o estado disponível no servidor.

**Sem conexão.** Não será possível reconstruir a réplica até que o servidor esteja acessível.

**Recuperação.** Dados que já estavam no servidor reaparecem na sincronização. Alterações existentes apenas na réplica apagada não podem ser recuperadas pelo AraLearn.

### Excluir a conta

**Pré-condição.** Estar autenticado, ter conexão e ter exportado ou transferido qualquer conteúdo que precise ser preservado. O proprietário de um workspace deve resolver previamente a continuidade desse espaço quando aplicável.

**Passos.**

1. Abra o painel pelo ícone de nuvem.
2. Escolha **Excluir conta**.
3. Leia a confirmação e prossiga somente se a exclusão for intencional.

**Resultado esperado.** O servidor exclui a conta e os dados pessoais ligados a ela conforme as relações definidas no banco; em seguida, o aplicativo remove a réplica local e volta à tela de acesso.

**Sem conexão.** A exclusão não pode ser concluída, porque precisa ser autorizada e executada no servidor.

**Recuperação.** Se o pedido falhar antes da confirmação do servidor, a conta permanece ativa e a interface apresenta o erro. Depois de concluída, a operação não oferece restauração automática.

### Usar assistência externa com exposição mínima

**Pré-condição.** Ter um provedor configurado, conexão quando o provedor for remoto e autorização para enviar o conteúdo selecionado.

**Passos.**

1. Selecione somente o card ou os rótulos necessários.
2. Revise o texto selecionado e retire dados pessoais ou sigilosos.
3. Faça um pedido específico.
4. Examine a proposta antes de continuar a edição.
5. Use desfazer ou peça uma nova alteração se o resultado não corresponder à intenção.

**Resultado esperado.** O provedor recebe um recorte da tarefa; somente uma mudança validada nos campos autorizados é incorporada.

**Sem conexão.** Um provedor remoto não responde. Um serviço local pode funcionar, desde que esteja instalado e acessível no próprio dispositivo ou na rede configurada.

**Recuperação.** Uma falha ou resposta inválida não deve produzir alteração parcial. Refaça o pedido com escopo menor; se uma mudança já foi aplicada, use o histórico recente da sessão para desfazer ou restaurar.

## Responsabilidades em workspaces educacionais

Permissão técnica não significa autorização pedagógica ou jurídica para qualquer uso. Quem administra um workspace deve:

- convidar somente pessoas que precisam participar;
- atribuir o papel menos abrangente compatível com a tarefa;
- revisar periodicamente participantes e convites;
- informar a finalidade das observações e da assistência externa;
- evitar que dados de avaliação individual sejam inseridos em campos destinados a conteúdo didático;
- definir procedimentos institucionais para exportação, retenção e encerramento do workspace.

As capacidades de cada papel estão documentadas em [Administração de workspaces](guia-administracao-workspace.md).

## Instâncias mantidas por terceiros

O código do AraLearn pode ser implantado em outra infraestrutura. O mantenedor dessa instância escolhe provedores, configura retenção, administra contas e pode modificar o software. Portanto, a política e o contato da instância usada pela pessoa são a fonte aplicável para compromissos jurídicos e operacionais. Este documento descreve o código deste repositório e não promete práticas de uma implantação que ele não controla.

## Como comunicar um problema de privacidade

**Pré-condição.** Reunir apenas informações técnicas necessárias, sem reproduzir o dado sigiloso.

**Passos.**

1. Anote a versão do aplicativo, o dispositivo, a operação realizada e o resultado observado.
2. Substitua e-mails, nomes, códigos de convite, chaves e conteúdo privado por exemplos fictícios.
3. Use o canal definido pela instituição que mantém a instância.
4. Para um defeito no código público, registre-o no [repositório do projeto](https://github.com/fabio-ara/AraLearn/issues).

**Resultado esperado.** O responsável recebe informação suficiente para reproduzir o problema sem nova exposição de dados.

**Sem conexão.** Guarde a descrição localmente e envie quando houver conexão segura.

**Recuperação.** Se um segredo foi publicado acidentalmente, remova-o do canal quando possível e revogue ou substitua a credencial; apenas editar a mensagem pode não eliminar cópias já registradas.
