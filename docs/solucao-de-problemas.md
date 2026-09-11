# Solução de problemas

## Diagnosticar sem perder trabalho

Quando uma ação falhar, preserve primeiro o que ainda está no dispositivo. Antes de limpar dados ou reinstalar, confira a mensagem, a conexão e o estado indicado pela nuvem. Use **Tentar novamente** ou solicite outra leitura quando a interface oferecer essa recuperação.

Anote em que tela estava, o curso e a ação realizada. Uma captura ajuda a mostrar o problema. Para registrar um defeito, bastam inicialmente o resultado esperado, o observado e a mensagem apresentada; os [registros técnicos](#registrar-um-defeito-útil-e-seguro) podem ser examinados depois, quando necessários.

## Conta e abertura de cursos

### Não consigo entrar

Confira e-mail, senha e eventual confirmação da conta. Use **Recuperar senha** se necessário. Se o link recebido não for aceito, solicite outro pelo aplicativo, que emitirá um endereço atualizado para a recuperação.

### O aplicativo não conclui a inicialização

A preparação indica as etapas de dispositivo, conta e cursos. Use **Tentar novamente**. Se a falha local persistir, a interface pode oferecer limpar os dados do dispositivo. Essa limpeza pode apagar progresso, marcas e observações ainda não enviados; confira as pendências antes de confirmar.

**Sair**, **Remover dados deste dispositivo** e **Sair e remover dados deste dispositivo** têm efeitos diferentes. A primeira encerra a sessão e pode manter dados já guardados; a segunda apaga os dados locais da conta ativa; a terceira faz as duas coisas. Uma edição que ainda existe apenas no formulário aberto pode ser perdida. Veja [Uso do aplicativo](uso-do-app.md#sair).

### Um curso não aparece

Em **Estudo**, aparecem cursos próprios, compartilhados e públicos. Em **Autoria**, aparecem somente os próprios. Confira a conta e o espaço selecionado e atualize a lista com conexão.

Se o curso foi compartilhado, peça ao proprietário que confira **Pessoas e acesso** e seu `@identificador` atual. Um curso público pode ser aberto por visitantes; um privado depende de acesso concedido à conta correta.

### Um curso aparece, mas não abre

Ter o título na lista não significa que o conteúdo já foi guardado. A primeira abertura precisa de conexão. Sem rede, a prévia distingue **Disponível offline** de **Conecte-se para abrir este curso**.

Tente abrir com conexão estável e aguarde a conclusão. Se continuar falhando, anote a mensagem e se algum conteúdo chegou a aparecer. O aplicativo precisa carregar uma versão completa do curso, sem misturar dados de momentos diferentes; a [persistência](persistencia-relacional.md) explica o que acontece quando o curso muda durante essa leitura.

### O aplicativo mostra o último estado conhecido

O aplicativo está usando a cópia que conseguiu guardar anteriormente. Use a nuvem para consultar atualizações. No modo manual, essa ação não ativa o modo automático. Preserve rascunhos enquanto confere o resultado.

O serviço pode estar indisponível mesmo quando outros sites abrem. Durante **Lendo conteúdo**, aguarde antes de concluir que o curso está vazio. Se houver falha, solicite outra leitura sem apagar os dados locais.

## Sincronização, conteúdo e arquivos

### A atualização foi adiada por uma edição

Abra o rascunho indicado no aviso e salve ou descarte a alteração antes de atualizar. Se uma observação foi enviada apenas para alguns alvos, retome a mesma operação para conferir os restantes.

Se o bloqueio surgiu depois de apenas consultar um painel, registre a tela e a mensagem. Preserve os dados do dispositivo, pois eles podem conter o rascunho necessário para entender o problema.

### Progresso ou marca aguardam envio

Confira a conexão e o modo de sincronização. No manual, use a nuvem para enviar o que ficou guardado. Se continuar pendente, reabra o curso, confirme que ainda tem acesso e tente sincronizar. Registre a mensagem se a falha persistir.

Progresso e marcas ficam numa lista de alterações a enviar, chamada fila. Preserve os dados do aplicativo até a confirmação. O [guia do estudante](guia-estudante.md#escolher-quando-sincronizar) explica essa continuidade.

### Uma observação aguarda envio

Reabra a unidade e confira o indicador da observação. Ela tem uma fila própria, separada do progresso. Reconecte e use a recuperação indicada. Se o estado for **em conflito** ou **falhou**, confira o texto guardado e a versão apresentada antes de criar outra entrada, para evitar duplicar a contribuição.

Duas abas da mesma conta podem acompanhar o envio sem substituir um rascunho em edição. Se o acesso ao curso foi retirado, o aplicativo informa a mudança e remove a cópia e a fila correspondentes quando confirma essa perda pela rede.

### Uma observação foi salva, mas não houve correção

A observação chega à caixa de entrada do proprietário e pode ser considerada, respondida ou resolvida. Esses estados descrevem seu tratamento. Uma dúvida pode ser respondida sem mudar o curso; uma correção exige uma alteração específica no conteúdo.

Para corrigir, o autor examina a questão, decide a mudança e confere o resultado salvo. O [fluxo de observações](observacoes-pedagogicas.md#da-observação-à-revisão) distingue esse trabalho da declaração de revisão humana.

### A revisão ou correção não funciona sem conexão

A autoria precisa consultar o estado atual e a autorização do curso antes de alterar ou marcar revisão. Reconecte, abra novamente o alvo e confira o conteúdo e as observações antes de continuar. A cópia anterior é útil para leitura, mas pode não conter as mudanças mais recentes.

### A revisão considerou somente a unidade anotada

Antes de aplicar, examine se o problema também afeta o que vem antes ou depois. Peça ao assistente que leia esses pontos e diferencie o que serve de contexto do que precisa ser alterado. Uma correção de pré-requisito ou de transição pode exigir mais de uma unidade.

### Não consigo aplicar uma correção

Se o conteúdo ou as fontes mudaram desde a preparação, a proposta pode estar desatualizada. Releia o alvo e compare a mudança pretendida com o estado atual. Se o envio ficou sem resposta, verifique primeiro se o servidor já gravou aquela tentativa; só então decida se precisa aplicá-la novamente. [Autoria por MCP](autoria-mcp.md) e [Actions](autoria-actions.md) explicam a recuperação nos respectivos canais.

### O apoio factual parece insuficiente

Abra **Explicação** e siga a referência da afirmação. Na Autoria, use os controles de fontes para examinar a obra e o trecho indicado. A localização na fonte é chamada âncora; o [guia de fontes](fontes-e-citacoes.md) explica como conferi-la.

Verifique se o material realmente sustenta a afirmação. **Sustenta** indica esse uso; **Citado de** identifica a origem das palavras, sem certificar que a afirmação citada seja verdadeira. Se o apoio for insuficiente, registre o problema e reveja a fonte, a interpretação ou o vínculo antes da nova revisão.

### Uma observação retirada não aparece mais

Retirar uma observação remove-a da consulta corrente. Se a questão continuar relevante, registre-a sobre o conteúdo atual. O [capítulo de observações](observacoes-pedagogicas.md) explica seus estados e a relação com a retenção.

### Uma prática não permite avançar

Confira os campos obrigatórios e as mensagens próximas à atividade. Nas lacunas, verifique cada preenchimento. Se tudo parecer completo e o bloqueio continuar, registre a unidade, a atividade e a mensagem.

Cada atividade tem seus próprios controles e decide o avanço segundo seus critérios de preenchimento. Nas respostas abertas, o texto fica disponível para interpretação humana. O [guia do estudante](guia-estudante.md#responder-a-uma-prática) explica o fluxo geral da resposta e do retorno; a [documentação dos componentes](componentes-didaticos.md) apresenta as formas disponíveis e seus contratos.

### Uma edição de autoria entrou em conflito

Outra aba, outro aparelho ou uma conversa conectada pode ter alterado o curso depois de você abrir a edição. Compare seu rascunho com o conteúdo atual e preserve somente as mudanças que ainda fazem sentido. Resolva a diferença apresentada antes de salvar. O [guia de assistência](assistencia-por-ia.md#aplicação-ao-rascunho-e-concorrência) explica a preservação de propostas.

### Há um rascunho antigo de cópia guardado

Esse rascunho indica que a confirmação de uma cópia se perdeu numa versão anterior. Use a recuperação oferecida: ela procura primeiro a cópia que já possa ter sido criada. Se o resultado continuar incerto, o rascunho permanece disponível para conferência antes do descarte. Hoje, estudar ou comentar atua no curso compartilhado; uma cópia própria surge somente pela ação explícita de copiar. O [contrato de conteúdo](aralearn-contract.md) conserva os detalhes técnicos dessa recuperação.

### O formulário reapareceu depois de salvar

Leia a mensagem: a resposta pode ter se perdido depois de o servidor guardar a alteração. Confira os valores preservados e use a recuperação no mesmo controle. Ela verifica o envio anterior antes de gravar qualquer outra mudança.

Se escolher **Cancelar** ou **Descartar**, você abandona o rascunho local; isso não desfaz uma gravação que já possa ter ocorrido. Evite fechar ou recarregar enquanto houver trabalho apenas no formulário. Quando a recuperação concluir, confira o resultado antes de iniciar outra alteração.

### A assistência por IA não responde

Confira primeiro o provedor e o modelo de IA escolhidos, além do estado da conexão. A chave de acesso autoriza o uso desse serviço externo; verifique se ela continua válida e se há cota disponível. A chave e a conversa duram somente durante a sessão, por isso preserve qualquer proposta que já tenha sido aplicada ao rascunho antes de recarregar ou fechar.

Enquanto a prévia não for aplicada e salva, o curso conserva o conteúdo anterior. Você pode continuar a edição manual ou usar uma conversa externa conectada para uma tarefa mais ampla. O [guia de assistência](assistencia-por-ia.md) distingue esses percursos e os dados enviados.

Se já usou **Aplicar ao rascunho**, confira esse rascunho e use **Salvar** quando estiver adequado. Aplicar a prévia e gravar no curso são decisões separadas.

### Não consigo salvar uma atribuição de fontes

Uma atribuição liga um trecho do curso às fontes que o sustentam. Antes de salvar, confira se a tela mostra todos os vínculos que devem permanecer naquele trecho e se cada localização na obra ainda está ativa. Se o curso mudou, releia a versão atual antes de preparar outra atribuição.

**Legado não resolvido** identifica uma referência antiga que ainda precisa ser conferida. Complete o cadastro correspondente em vez de criar outra fonte parecida. Se o resultado de um envio estiver incerto, use o controle de recuperação para verificar a gravação anterior. [Fontes, citações e referências](fontes-e-citacoes.md#localizar-o-uso-no-curso-e-na-fonte) explica a edição dos vínculos.

### Um PDF de fonte não foi enviado ou não abre

Confira se o arquivo é um PDF válido de até 20 MiB, aproximadamente 21 megabytes. A cota conjunta de PDFs e áudios é de 64 MiB por curso, e uma fonte aceita até oito anexos. Em conversa, envie um único PDF na mensagem em que pede sua incorporação como fonte.

Se o acesso temporário ao anexo expirou, anexe novamente o mesmo arquivo. Se a gravação ficou sem confirmação, consulte a fonte antes de repetir o envio: o PDF pode já estar guardado. O nome do arquivo ou um caminho digitado não substitui o anexo recebido pela aplicação de conversa.

Para abrir um PDF já guardado, volte à referência e solicite a abertura outra vez. O endereço de download dura 60 segundos; reabrir permite obter uma autorização atual. Os detalhes do transporte estão nos guias de [MCP](autoria-mcp.md) e [Actions](autoria-actions.md).

### O estudo não mostra uma fonte ou um link

Abra **Explicação** na unidade ou siga a citação sobrescrita. As referências da unidade e da base ficam no fim da leitura. **Mostrar citação** exibe a identificação e a localização; **Mostrar citação e link** também permite apresentar o endereço externo.

A autoria pode manter uma fonte oculta no estudo. O link de um arquivo também depende de sua autorização. Sem rede, uma referência ainda não consultada pode não estar guardada, mesmo que exista no curso. [Fontes](fontes-e-citacoes.md#referências-no-estudo) distingue essas situações.

## Conversas conectadas e dados de autoria

### MCP ou Actions não encontra ou não altera o curso

Confira se a conexão está autorizada na conta correta e se o curso pertence a você. A autoria remota usa a permissão do proprietário; uma concessão de estudo oferece outro tipo de acesso. Peça ao assistente que localize o curso e leia o conteúdo salvo antes de alterar.

O catálogo é a lista de tarefas do AraLearn que a aplicação de conversa consegue usar. Se ela ainda mostrar uma versão antiga, atualize essa lista. Na aplicação ChatGPT, **Refresh** consulta novamente as ferramentas e **Reconnect** refaz a conexão autorizada; uma conversa nova pode ser necessária para receber o catálogo atual.

Em Actions, o documento OpenAPI descreve as operações oferecidas. Quando ele muda, importe a versão atual e salve novamente a configuração da aplicação. Para renovar uma autorização ou trocar de conta, refaça a conexão.

A configuração técnica, a renovação de acesso e o tratamento de anexos estão nos guias de [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md).

Se aparecer **Sem resposta de ferramenta**, releia o curso para verificar se o servidor chegou a gravar a mudança. Os registros daquele envio ajudam a localizar se a interrupção ocorreu na aplicação de conversa, no transporte ou no servidor. Ao compartilhá-los para diagnóstico, proteja as credenciais e o conteúdo privado.

### A alteração por MCP ou Actions não aparece na interface

Volte ao AraLearn e aguarde a atualização. Se necessário, use **Atualizar** no cabeçalho do curso. A conversa e o aplicativo trabalham sobre o mesmo curso; uma tela anterior pode ainda não ter recebido a mudança.

Se houver um formulário em edição, conclua ou descarte o rascunho indicado e atualize novamente. Quando a leitura do servidor confirma a alteração, mas a tela continua mostrando outra versão, registre a tela e a mensagem para investigar a atualização da interface. Confirme a versão salva antes de decidir por outra produção.

### Duas condições autorais não mostram a diferença esperada

Confira se os cursos comparados cobrem os mesmos conceitos e objetivos e se os parâmetros que deveriam distingui-los foram fixados antes da produção. Examine a **configuração aplicada**, que registra as escolhas usadas no conteúdo; a preferência atual orienta os trabalhos seguintes.

Uma meta de extensão é flexível: o texto pode precisar de outra distribuição para preservar uma relação. O [modelo didático](modelo-didatico.md) explica como extensão, novidade e prática cumprem funções diferentes; o [guia de pesquisa](guia-pesquisador.md) trata das condições de comparação.

### Um número da análise de autoria parece incorreto

Em **Dados de autoria**, confira a dimensão e o escopo selecionados e use **Abrir dados e definições**. Uma informação que não pode ser atribuída ao recorte aparece como indisponível, não como zero.

Use **Exportar curso e análise** para comparar os registros do estado salvo com os números apresentados. Esses indicadores descrevem o processo de autoria; aprendizagem e um percentual geral de autoria humana exigem definições e instrumentos próprios. A [análise de autoria](analytics-instrucionais.md) explica de onde vem cada campo e que pergunta ele pode responder.

## Acesso e conta

### Não consigo conceder acesso

Somente o proprietário pode gerir **Pessoas e acesso**. A pessoa destinatária precisa ter escolhido seu identificador no perfil. Digite ao menos dois caracteres, selecione o resultado e confira o identificador e a foto antes de confirmar.

Se o identificador mudou durante a escolha, pesquise novamente. Há limites de buscas e concessões; aguarde quando a interface indicar isso. O acesso concedido permite estudar e observar, enquanto edição e cópia têm regras próprias. [Uso do aplicativo](uso-do-app.md#conceder-e-revogar-acesso) desenvolve essas diferenças.

### A foto de perfil não é aceita

Use JPEG, PNG ou WebP de até 512 KiB, aproximadamente meio megabyte. Se a gravação ficou sem confirmação ou a remoção da foto anterior falhou, siga a recuperação no mesmo painel antes de escolher outro arquivo.

A foto fica em armazenamento privado. A [política de privacidade](privacidade.md) explica sua conservação e remoção.

### A conta não é excluída

A operação exige conexão e a frase exata `EXCLUIR MINHA CONTA`. Ela remove irreversivelmente a conta, os cursos próprios e os arquivos associados. Uma interrupção pode ocorrer depois de alguns arquivos terem sido removidos. Siga a recuperação apresentada para confirmar ou concluir a mesma operação.

Se a interface já confirmou a exclusão da conta, mas outra aba impediu a limpeza dos dados locais, feche essa aba e execute somente a limpeza do dispositivo. A exclusão remota já foi concluída. [Privacidade](privacidade.md) documenta as etapas, a retenção e seus limites.

## Para quem desenvolve o AraLearn

### O desenvolvimento local não inicia

Para quem executa o projeto no computador, comece pelo primeiro erro apresentado e confira as versões e os comandos do [guia de desenvolvimento](guia-desenvolvedor.md). Além do código, o ambiente local precisa dos serviços e das configurações usados pelo projeto. A [operação do Supabase](supabase.md) explica como preparar a parte que mantém contas, dados e arquivos.

### Registrar um defeito útil e seguro

Um relato inicial precisa permitir que outra pessoa refaça a situação:

- indique onde estava e qual ação realizou;
- compare o resultado esperado com o observado e copie a mensagem apresentada;
- informe o tipo de dispositivo, a condição da conexão e o que ocorreu depois de tentar outra leitura.

Quando necessário, uma pessoa desenvolvedora pode examinar o **console**, que reúne mensagens de execução do navegador, e a área de **rede**, que mostra pedidos e respostas aos serviços. Esses registros podem conter dados sensíveis. Antes de compartilhá-los, retire credenciais, como senhas, chaves e tokens; endereços temporários de arquivos; e informações pessoais ou conteúdo privado dos cursos.

O [guia de desenvolvimento](guia-desenvolvedor.md) e os guias de [MCP](autoria-mcp.md) e [Actions](autoria-actions.md) orientam a investigação técnica conforme o local da falha.
