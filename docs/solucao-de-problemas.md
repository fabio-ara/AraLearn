# Solução de problemas

## Diagnosticar sem perder trabalho

Antes de limpar dados ou reinstalar:

1. anote a tela, o curso e a ação que falhou;
2. verifique se a conexão voltou;
3. observe mensagens de fila, revisão ou retomada;
4. tente novamente uma vez;
5. só use limpeza local depois de avaliar alterações pendentes feitas sem conexão.

Uma captura de tela ajuda a explicar o estado visual. Console e rede ajudam a
separar falha da interface, autorização, servidor e sincronização. Não inclua
tokens, senhas, e-mail completo ou conteúdo privado ao registrar um defeito.

## Não consigo entrar

Confirme e-mail, senha e eventual confirmação da conta. Se necessário, use
**Recuperar senha** e abra o link no contexto autorizado. Um link expirado ou
em fluxo inseguro deve ser substituído por um novo; não copie tokens para a
URL manualmente.

## O aplicativo não conclui a inicialização

A preparação mostra Dispositivo, Conta e cursos. Use **Tentar novamente**. Se
a falha local persistir, a interface pode oferecer limpar os dados do
dispositivo.

Essa limpeza remove a cópia local e operações ainda não sincronizadas. Não a confirme
se houver progresso, marcas ou observações feitas sem conexão que precisam ser
preservados.

Em **Conta e aparência**, o logout comum preserva cursos offline, estado pessoal
e filas ou rascunhos que já estejam gravados no dispositivo. A confirmação
avisa que uma alteração ainda aberta somente no editor será perdida. **Remover
dados deste dispositivo** mantém a sessão e apaga somente o namespace local da
conta ativa; **Sair e remover dados deste dispositivo** faz as duas operações.
Nenhuma delas apaga dados já enviados ao servidor, e dados locais de outra conta
no mesmo navegador permanecem.

## Um Curso não aparece

Em **Estudo**, aparecem cursos próprios, com acesso direto e públicos. Em
**Autoria**, aparecem somente cursos próprios.

1. confirme que está na conta e no modo corretos;
2. atualize a lista quando a conexão retornar;
3. para curso compartilhado, peça ao proprietário que confira **Pessoas**;
4. confirme que o proprietário selecionou o seu identificador atual e concedeu o acesso à sua conta.

Cursos tornados públicos pelo proprietário também aparecem em Estudo e podem
ser abertos por visitantes. Confira a busca e a disponibilidade pública do
curso; o catálogo não concede acesso aos cursos privados.

## Um Curso aparece, mas não abre

Na primeira abertura, a composição é baixada em páginas sob uma única revisão.
Se o curso mudar durante esse processo, o cliente descarta o conjunto parcial
e reinicia a leitura.

Tente novamente com conexão estável. Se continuar falhando, registre o curso,
a mensagem e se o erro ocorreu antes ou depois de aparecer conteúdo conhecido
da cópia local.

## O aplicativo mostra o último estado conhecido

Isso indica uso da réplica local. Ela permite retomar conteúdo já aberto, mas
não prova que a lista, o acesso ou a composição estão atualizados. Reconecte e
aguarde a atualização antes de tomar uma decisão de Autoria.

## Progresso ou marca aguardam envio

O estado pessoal entra numa fila por curso. Mantenha o aplicativo instalado e
os dados locais preservados até a conexão retornar. O repositório tenta
reconciliar mudanças de revisão de forma limitada.

Se a fila continuar pendente:

1. abra novamente o curso;
2. confirme que o acesso ainda existe;
3. tente sincronizar com conexão estável;
4. registre o tipo da operação e a mensagem, sem copiar o conteúdo privado.

## Uma observação aguarda envio

Anotações usam uma fila de envio própria, separada do estado pessoal. Reabra a
Unidade, confirme o indicador de sincronização e reconecte. Em duas abas, a atualização
leva apenas a versão privada daquela conta e IDs; cada aba relê o IndexedDB e
preserva um rascunho aberto. Atividade de outra pessoa não muda essa versão nem
deve aparecer como conflito. Se o item ficar **em conflito** ou **falhou**, não
crie uma cópia às cegas: releia o estado remoto e revise o comando. Perda de
acesso purga a cópia local e a fila porque o dispositivo não pode continuar
entregando dados sem autoridade.

## Uma observação foi salva, mas não houve correção

A observação do Estudo é uma Anotação ancorada própria e chega à caixa de
entrada do proprietário. Ali ela pode ser considerada, respondida ou resolvida.
Esses estados descrevem triagem: salvar, responder ou resolver não altera o
curso. Para corrigir por conversa, consulte as Observações abertas, prepare uma
revisão coerente e confirme a proposta antes de aplicá-la. Reabra depois as
StudyUnits afetadas para verificar o resultado.

## A revisão ou correção não funciona sem conexão

Preparar e aplicar uma revisão exige conexão porque o serviço precisa reler o
curso autorizado. Reconecte, consulte novamente as Observações e o contexto
afetado e só então execute a ação. Não trate a última tela renderizada como
estado corrente.

## A revisão considerou somente a Unit anotada

Interrompa antes de aplicar. Peça que o GPT releia progressão, pré-requisitos,
transições, exemplos e prática relacionados. A proposta deve distinguir as
Units que só fornecem contexto das que realmente precisam mudar.

## Não consigo aplicar uma correção

Se a StudyUnit, seu conteúdo ou suas fontes mudaram desde a leitura, o serviço
recusa a proposta desatualizada. Releia o conjunto e reconcilie a mesma intenção
com o estado corrente. Não repita a escrita às cegas.

## O apoio factual parece insuficiente

Reabra **Fontes** e confira referência, papel, Âncora e relação com a StudyUnit.
**Sustenta** é apropriado para uma afirmação; **Citado de** informa a origem de
uma citação e não prova sua verdade. Se a evidência não bastar, conteste ou
substitua a fonte e prepare novamente a revisão.

## Uma Observação retirada não aparece mais

Uma Observação retirada deixa de integrar a caixa corrente e não autoriza
mudança posterior. Se a questão ainda existir, registre uma nova Observação no
alvo atual em vez de tentar restaurar um estado interno antigo.

## Uma prática não permite avançar

Confira campos obrigatórios e mensagens próximas ao componente. Se a
interação parecer preenchida mas continuar bloqueada, registre o tipo de
componente e a Unidade. O avanço depende do contrato do componente, não de uma
pontuação global.

## Uma edição de Autoria entrou em conflito

Outro cliente alterou o curso depois da leitura. Reabra ou releia o curso,
compare a intenção com o estado novo e aplique apenas o que ainda faz sentido.
Não aumente a revisão à mão e não repita a escrita às cegas.

## Há um rascunho antigo de cópia guardado

O estudante não edita o curso compartilhado ou público, e o aplicativo não
cria cópias automaticamente. Cópias próprias já existentes continuam sendo
cursos independentes, editáveis por seu proprietário.

Uma intenção guardada pela versão anterior pode ter recebido confirmação no
servidor mesmo quando a resposta se perdeu. A recuperação consulta a prova
de origem do alvo ainda próprio e a edição inicial, sem reaplicar o texto nem
criar outro curso. Ela pode reconhecer esse alvo mesmo se a origem foi
removida. Uma revisão posterior no alvo não autoriza sobrescrevê-lo.

Se não houver prova suficiente, o rascunho permanece guardado. Confira o
conteúdo antes de descartá-lo explicitamente; repetir a consulta não recria
o comando retirado nem transforma o curso de outra pessoa em curso próprio.

## O formulário reapareceu depois de salvar

Se a mensagem disser que a resposta se perdeu e que a operação pode ter sido
confirmada, confira os valores preservados e tente novamente pelo mesmo botão,
sem reeditar o formulário. Parâmetros, fontes, Observações e Conteúdo podem
reutilizar a intenção pendente para recuperar a resposta sem duplicar o efeito.

Use **Cancelar** ou **Descartar** somente quando quiser abandonar essa intenção.
O rascunho é transitório da interface e não integra a fila do IndexedDB; evite
recarregar ou fechar a página antes de concluir a repetição ou o descarte.

Rascunhos antigos da criação automática de cópia podem permanecer no IndexedDB
para recuperação por consulta, como descrito acima. Esse caso não repete o
escritor retirado. Descartar a intenção remove seu envelope; conversa,
configuração e credencial do provedor não fazem parte dele.

## A Assistência por IA não responde

Confira o provider escolhido, o modelo, a conectividade e a validade ou cota da
chave efêmera. OpenAI, Gemini e DeepSeek usam origens oficiais fixas; a interface
normal não aceita endpoint alternativo. Recarregar ou sair apaga a chave e a
conversa, portanto abra uma nova sessão quando necessário. Não grave a chave no
curso, no navegador ou em logs para contornar uma falha.

Falha, cota, recusa ou resposta fora do formato não altera o curso. Feche a
sugestão e continue a edição manual, ou use um cliente MCP ou um GPT conectado
por Actions para uma tarefa mais ampla. Se **Aceitar e aplicar** já foi usado,
confira o conteúdo e ainda use **Salvar** para efetivar a mudança; aplicar a
candidata não grava por si só.

## Não consigo salvar uma atribuição de Fontes

Confira se cada fonte escolhida possui ao menos uma Âncora ativa no estado
corrente e se o conjunto exibido contém tudo o que deve permanecer no alvo. Salvar
substitui o conjunto completo; não há modo de acréscimo parcial. Se o curso ou
o alvo mudou, releia e reconcilie antes de tentar novamente.

Uma referência **Legado não resolvido** pode não ter metadados nem Âncora. Para
resolvê-la, revise a mesma identidade literal; não crie uma fonte parecida nem
remova espaços do identificador. Depois de falha de rede sem resposta, repita o
pedido pelo mesmo controle, sem editar a intenção. O cliente reaproveita
internamente o pedido pendente e recupera o recibo sem duplicar a alteração.

## Um PDF de Fonte não foi enviado ou não abre

O PDF precisa ser válido e ter no máximo 20 MiB. Envie-o na mesma mensagem em
que pedir `incorporar_pdf_como_fonte`. O servidor baixa a referência temporária,
valida os bytes e só então cria ou atualiza o vínculo com a fonte. Se a referência
expirar, anexe novamente o mesmo arquivo numa mensagem nova.

Para abrir um anexo, releia a fonte e solicite um novo endereço assinado. O
endereço expira em 60 segundos, não pode ser revogado individualmente durante
essa janela e não deve ser guardado como identidade do arquivo. Confira
também a cota conjunta de 64 MiB de PDFs e áudios por curso e o limite de oito anexos
por fonte.

Envio, remoção e reativação de bytes passam pelo serviço e pela API do Storage;
o navegador e o modelo não escolhem o caminho interno do objeto. Uma falha não
confirmada deve ser seguida por nova consulta da fonte antes de outra escrita.

## O Estudo não mostra uma Fonte ou um link

Abra **Fontes** na Unidade: a consulta é sob demanda e não ocorre junto com o
conteúdo. Fonte oculta ou legada não resolvida é omitida. A visibilidade
**Citação** mostra identificação e localização, mas não URL; somente **Citação
e link** pode mostrar o endereço. Se o acesso foi revogado ou o curso não
existe mais, o aplicativo limpa o estado local em vez de conservar o painel.

## MCP ou Actions não encontra ou não altera o Curso

1. confirme OAuth e conta;
2. confirme que o curso é próprio, pois a Autoria é exclusiva do proprietário;
3. confira se o catálogo oferece as dezessete tarefas humanas correntes;
4. use `retomar_curso` ou a leitura focal da tarefa antes de escrever;
5. diante de conflito ou referência ambígua, releia o recorte;
6. confira se conversa e interface apontam para o mesmo ambiente.

Uma concessão de acesso permite Estudo, não Autoria remota.

Conexões MCP sem consentimento corrente precisam autorizar o escopo
`offline_access`. O fluxo não emite `id_token`. Se
o bearer funcionar no MCP, mas for recusado diretamente no GoTrue, na API de
dados ou no Storage, essa recusa é o comportamento esperado: ele é uma
credencial exclusiva do recurso MCP, não uma sessão da aplicação.

No MCP, use **Refresh** no app e abra uma conversa nova depois de uma mudança no
catálogo; a conversa anterior pode conservar a lista antiga. Use **Reconnect**
se o problema for autorização ou conta, não apenas lista de tarefas. As leituras
vão de `retomar_curso` a `consultar_componentes`; as escritas vão de `criar_curso` a
`incorporar_pdf_como_fonte`. Se uma ferramenta pedir IDs, versões, caminhos ou
outros detalhes do banco, a conexão ainda não recebeu o catálogo corrente.

Se a tentativa mostrar `Sem resposta de ferramenta`, verifique se houve uma
invocação da função MCP. Ausência simultânea de invocação e de log estrutural
localiza o defeito na ponte ChatGPT → MCP, antes do backend; preserve o contrato
oficial. Se a invocação existir, classifique o erro no servidor e confirme que
nenhuma mudança parcial foi gravada. Registre somente status e categoria segura,
sem copiar credenciais ou conteúdo privado.

Em Actions, confira se o OpenAPI importado coincide com o documento corrente,
se `client_id` e `client_secret` pertencem ao cliente vinculado àquele GPT e se
as URLs de autorização e token usam a função `aralearn-authoring-action`. O
escopo é `openid email`, e o access token opaco não funciona no MCP, no GoTrue,
na API de dados ou no Storage. Se o segredo se perdeu antes do vínculo, prepare
outro cliente; se o GPT já estava vinculado e precisa substituir a credencial,
vincular um novo cliente ao mesmo identificador desativa o anterior e revoga
seus tokens. A execução corrente não possui uma ação separada para revogar uma
concessão já vinculada.

No corte que retirou a origem antiga do ChatGPT, os tokens Actions de clientes
já vinculados foram revogados uma vez. Reimporte o OpenAPI e conclua novamente
o OAuth numa conversa nova, mesmo que a conexão anterior ainda apareça no GPT.

Se a Action pedir outra coisa além de referências humanas do curso, reimporte o
OpenAPI, salve a configuração e abra uma conversa nova. Publicar o arquivo não
atualiza automaticamente uma Action já importada.

Para PDF, `incorporar_pdf_como_fonte` precisa receber exatamente um PDF ligado à
mensagem corrente. O transporte converte o anexo na referência temporária que o
servidor valida. Nome, caminho local ou URL digitada não substituem o arquivo.

O anexo pertence à mensagem em que foi enviado. Um retry ainda ligado à mesma
mensagem pode usar a referência corrente; uma tentativa iniciada em mensagem
posterior precisa receber novamente o mesmo PDF. Diagnostique a categoria antes
de pedir qualquer reenvio:

| Situação | Recuperação |
| --- | --- |
| nenhum arquivo chegou à chamada | repita com o PDF da mensagem corrente; em outra mensagem, anexe novamente o mesmo arquivo |
| a referência chegou malformada | reconstrua a chamada a partir do anexo, sem copiar ou fabricar nome, URL ou identidade |
| chegaram vários arquivos | selecione exatamente um PDF |
| o tipo não é PDF | use um único PDF válido |
| o acesso temporário expirou | anexe novamente o mesmo PDF e faça uma nova tentativa |
| download indisponível ou timeout | repita a mesma intenção; não peça reenvio sem sinal de expiração |
| a persistência não foi confirmada | consulte novamente a fonte antes de anunciar sucesso |

Se o transporte estiver correto e o download for recusado antes do Storage,
registre apenas a categoria segura do erro e o hostname sanitizado. Não copie a
referência temporária do arquivo nem amplie a política para HTTPS arbitrário.

## A alteração por MCP ou Actions não aparece na interface

MCP, Actions e a Autoria usam o mesmo curso, mas a interface pode conservar uma
projeção já carregada. Ao voltar à guia ou focalizar a janela do AraLearn,
aguarde a releitura da área visível. Se o navegador não sinalizar o retorno, use
a ação **Atualizar** no cabeçalho do curso e confira a nova revisão. Se a leitura
do servidor contiver a mudança e a tela não, registre console, rede, rota e
revisão exibida: o defeito está na projeção ou atualização da interface, não
numa etapa de publicação.

Quando houver uma confirmação ou um formulário em edição, o AraLearn adia a
atualização para conservar o rascunho. Conclua ou cancele essa edição e use
**Atualizar** novamente.

## Duas condições autorais não mostram a diferença esperada

Cada condição de pesquisa deve usar um curso privado independente. Confira se o
mesmo inventário semântico foi preservado e se os parâmetros realmente foram
fixados antes da produção. Direção editorial não pode eliminar novidade
necessária. Os alvos de palavras são flexíveis, não limites; uma condição mais
estreita pode produzir mais unidades de estudo.

## Um número de Analytics parece incorreto

Confirme o escopo selecionado e abra **Desenho** e **Autoria**. Dados que não
podem ser atribuídos ao recorte aparecem como indisponíveis, nunca como zero.
Use **Exportar Analytics** para comparar o mesmo snapshot JSON com os números
visíveis. Analytics descreve o estado corrente; não demonstra aprendizagem nem
percentual de autoria humana.

## Não consigo conceder acesso

Somente o proprietário pode gerir **Pessoas**. O destinatário precisa escolher
um identificador no perfil. Digite pelo menos dois caracteres e selecione a
pessoa entre os resultados, conferindo identificador e avatar. A busca retorna
até dez pessoas no contexto desse curso; não há diretório genérico.

A confirmação vincula a conta selecionada ao identificador conferido. Se ele
mudou ou foi reutilizado por outra conta, pesquise novamente antes de
confirmar. O acesso permite estudar e enviar observações próprias, sem editar
o curso. Depois de dez tentativas de concessão ou sessenta buscas em dez
minutos, aguarde a janela seguinte.

Se o identificador desejado estiver ocupado ao salvar o perfil, escolha outro.
O identificador aceita de 3 a 30 caracteres ASCII: letras minúsculas, números,
ponto, underscore e hífen, começando e terminando com letra ou número. O `@`
inicial é opcional na entrada e não faz parte do valor guardado.

## A foto de perfil não é aceita

Use JPEG, PNG ou WebP de até 512 KiB. O objeto fica no bucket privado de
avatares. Se a foto nova for registrada e a remoção da anterior falhar, a tela
deve informar a limpeza pendente; não envie repetidamente arquivos maiores.

## A conta não é excluída

A exclusão exige a frase exata `EXCLUIR MINHA CONTA`. O aplicativo envia uma
única solicitação confirmada à API, que remove os avatares e os PDFs dos cursos
próprios. O banco recusa a exclusão enquanto algum desses objetos permanecer.
Tente novamente com conexão estável. Não use exclusão como forma de sair: ela
remove cursos próprios e dados relacionados de modo irreversível.

O banco revoga todas as sessões antes de remover o
usuário do Auth. Um download de PDF já assinado ainda pode funcionar por até 60
segundos. O inventário posterior apenas classifica possíveis objetos órfãos; a
remoção exige outra decisão segura sobre vínculo, retenção e backup.

Se a interface informar que a conta foi excluída, mas a limpeza local ficou
bloqueada por outra aba, feche a outra instância e repita apenas a limpeza do
dispositivo. A exclusão remota já é terminal e não deve ser enviada novamente.

## O desenvolvimento local não inicia

1. confira versões de Node.js e dependências;
2. use os scripts existentes em `package.json`;
3. para os serviços, confirme Supabase CLI e contêineres locais;
4. verifique se variáveis privadas estão no ambiente local, não no repositório;
5. leia o primeiro erro real antes de executar uma suíte ampla.

Compare `supabase/runtime-manifest.json` com `supabase migration list --local`.
Uma diferença entre o ambiente local e o hospedado deve ser tratada como
diferença de versão, não como falha do contrato instalado localmente.

## Registrar um defeito útil e seguro

Inclua:

- ação realizada e resultado esperado;
- resultado observado;
- modo Estudo ou Autoria;
- celular ou computador e largura aproximada;
- com ou sem conexão;
- mensagem segura do console ou da rede;
- se o problema se repete após nova leitura.

Não inclua credenciais, tokens, URL assinada, e-mail integral, dados de outra
pessoa ou conteúdo de curso que não possa ser divulgado.

Consulte também [Uso do aplicativo](uso-do-app.md), [Persistência e
sincronização](persistencia-relacional.md) e [Autoria por MCP](autoria-mcp.md).
