# Solução de problemas

## Diagnosticar sem perder trabalho

Antes de limpar dados ou reinstalar:

1. anote a tela, o Curso e a ação que falhou;
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

A preparação mostra Dispositivo, Conta e Cursos. Use **Tentar novamente**. Se
a falha local persistir, a interface pode oferecer limpar os dados do
dispositivo.

Essa limpeza remove a cópia local e operações ainda não sincronizadas. Não a confirme
se houver progresso, marcas ou observações feitas sem conexão que precisam ser
preservados.

## Um Curso não aparece

Em **Estudo**, devem aparecer Cursos próprios e com acesso direto. Em
**Autoria**, aparecem somente Cursos próprios.

1. confirme que está na conta e no modo corretos;
2. atualize a lista quando a conexão retornar;
3. para Curso compartilhado, peça ao proprietário que confira **Pessoas**;
4. confirme que o acesso foi concedido ao e-mail exato da conta.

Não existe entrada por Workspace, Trilha, Coleção ou catálogo público.

## Um Curso aparece, mas não abre

Na primeira abertura, a composição é baixada em páginas sob uma única revisão.
Se o Curso mudar durante esse processo, o cliente descarta o conjunto parcial
e reinicia a leitura.

Tente novamente com conexão estável. Se continuar falhando, registre o Curso,
a mensagem e se o erro ocorreu antes ou depois de aparecer conteúdo conhecido
da cópia local.

## O aplicativo mostra o último estado conhecido

Isso indica uso da réplica local. Ela permite retomar conteúdo já aberto, mas
não prova que a lista, o acesso ou a composição estão atualizados. Reconecte e
aguarde a atualização antes de tomar uma decisão de Autoria.

## Progresso ou marca aguardam envio

O estado pessoal entra numa fila por Curso. Mantenha o aplicativo instalado e
os dados locais preservados até a conexão retornar. O repositório tenta
reconciliar mudanças de revisão de forma limitada.

Se a fila continuar pendente:

1. abra novamente o Curso;
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
Curso. Para corrigir, o proprietário precisa abrir **Auditoria e correções**,
registrar ou decidir um achado, revisar a proposta focal e confirmar sua
aplicação. Outra rodada ainda precisa verificar o critério.

## Auditoria ou correção não funciona sem conexão

Esse comportamento é intencional. Rodadas, achados, correções, verificação e
reversão exigem conexão e não possuem cópia autoritativa nem fila no IndexedDB.
Reconecte, releia a Unidade ou o achado e só então execute a ação. Não
trate a última tela renderizada como estado corrente.

## Uma rodada limpa ou suas evidências não aparecem

Na aba **Achados**, consulte a lista de rodadas, não somente a lista de achados.
Rodadas sem achado continuam enumeráveis. Abra a rodada pelo link com
`auditRunId` para ver todas as verificações e evidências. Se usou filtro,
confira a Unidade focal e reinicie a paginação depois de mudança de versão.

## Não consigo aplicar ou reverter uma correção

Aplicação e reversão exigem confirmação explícita. Também são protegidas por
revisão, versões e ponto de controle: se a Unidade, seu conteúdo ou suas Fontes
mudaram desde a leitura, releia e reconcilie em vez de forçar o número. A
correção v1 não pode criar, excluir, mover, reposicionar ou trocar o pai de uma
entidade, e uma operação sem efeito é recusada.

## Uma verificação factual foi recusada

Conclusão factual positiva exige Fonte e Âncora ativas na revisão exata.
**Sustenta** é a relação apropriada para afirmações; **Citado de** só vale para
fidelidade de citação. Reabra Fontes, confira revisão, Âncora e relação e então
registre uma nova rodada.

## Uma Observação ligada ao achado ficou indisponível ou sumiu

Ao retirar a Anotação, o registro de retirada é mostrado como indisponível e sem link.
Depois da limpeza física, somente a junção e o ID deixam o achado; texto/pessoa
nunca foram copiados e rodada, achado e correção permanecem. Isso não é perda
do histórico de auditoria.

## Uma prática não permite avançar

Confira campos obrigatórios e mensagens próximas ao componente. Se a
interação parecer preenchida mas continuar bloqueada, registre o tipo de
componente e a Unidade. O avanço depende do contrato do componente, não de uma
pontuação global.

## Uma edição de Autoria entrou em conflito

Outro cliente alterou o Curso depois da leitura. Reabra ou releia o Curso,
compare a intenção com o estado novo e aplique apenas o que ainda faz sentido.
Não aumente a revisão à mão e não repita a escrita às cegas.

## Salvei um Curso compartilhado e a cópia não apareceu

Na candidata de clientes 0.0.26, ainda não publicada, uma cópia
pessoal só nasce quando **Salvar na minha cópia** confirma uma mudança material.
Abrir o editor, gerar
uma prévia, cancelar, receber uma falha ou salvar conteúdo idêntico deixa o
Curso compartilhado intacto e não cria outro Curso.

Se a conexão caiu ou a resposta ficou ambígua, não refaça o texto em outro
Curso. Reabra a mesma Unidade ou reconecte: o aplicativo conserva o envelope
delimitado e repete o mesmo pedido. Se outra aba já criou a cópia com uma
intenção diferente, a interface conserva o rascunho e informa o conflito. Ela
não deve mostrar o identificador interno do Curso de destino.

Depois da confirmação, a pessoa continua na mesma Unidade de **Sua cópia**. O
progresso e as Observações do original não são transportados. Fontes, PDFs,
acessos e planejamento também começam separados.

## O formulário reapareceu depois de salvar

Se a mensagem disser que a resposta se perdeu e que a operação pode ter sido
confirmada, confira os valores preservados e tente novamente pelo mesmo botão,
sem reeditar o formulário. Parâmetros, Fontes, Variantes, Observações, Inspeção
e Auditoria reutilizam o envelope pendente, inclusive o mesmo identificador de
pedido, para recuperar o recibo sem duplicar o efeito.

Use **Cancelar** ou **Descartar** somente quando quiser abandonar essa intenção.
O rascunho é transitório da interface e não integra a fila do IndexedDB; evite
recarregar ou fechar a página antes de concluir a repetição ou o descarte.

A primeira gravação de uma cópia pessoal é a exceção delimitada: seu envelope
fica no IndexedDB para sobreviver a reinício e reconexão. Descartar essa intenção
remove o envelope. Conversa, configuração e credencial do provider nunca fazem
parte dele.

## A assistência por API não responde

Confira se o relay local está ativo, se o modelo foi configurado nele e se o
endpoint usa `127.0.0.1`, `localhost` ou `10.0.2.2`, por HTTP na porta 4183. A
chave do provider pertence ao relay, fora do AraLearn. Se a tela mostrar
providers remotos e campo de chave, a aplicação está num runtime explícito de
desenvolvimento; use apenas credencial descartável de teste e nunca trate esse
modo como configuração de produção.

No navegador, `127.0.0.1` e `localhost` precisam ser tratados como loopback;
`10.0.2.2`, como rede local. Se o console indicar bloqueio de acesso à rede
privada, confira se a versão do AraLearn já envia essa classificação corrigida e
se a permissão do navegador foi concedida. Não troque a chave para o cliente para
contornar o bloqueio.

No Pages, confira também se o navegador autorizou acesso à rede local. O
Android 0.0.24 encaminha a requisição por uma ponte nativa fixa para não
depender de conteúdo misto no WebView. Até a instalação e o ensaio do APK em
dispositivo real, falha nesse percurso não deve ser contornada com tráfego aberto
nem com chave no aplicativo; use edição manual ou ChatGPT + MCP.

Falha, cota, recusa ou resposta fora do formato não altera o Curso. Feche a
sugestão e continue a edição manual, ou use ChatGPT + MCP para uma tarefa mais
ampla. Se **Aplicar ao rascunho** já foi usado, confira o conteúdo e ainda use
**Salvar** para efetivar a mudança; aplicar a candidata não grava por si só.

## Não consigo salvar uma atribuição de Fontes

Confira se cada Fonte escolhida possui ao menos uma Âncora ativa na revisão
exata e se o conjunto exibido contém tudo o que deve permanecer no alvo. Salvar
substitui o conjunto completo; não há modo de acréscimo parcial. Se o Curso ou
o alvo mudou, releia e reconcilie antes de tentar novamente.

Uma referência **Legado não resolvido** pode não ter metadados nem Âncora. Para
resolvê-la, revise a mesma identidade literal; não crie uma Fonte parecida nem
remova espaços do identificador. Depois de falha de rede sem resposta, repita o
mesmo pedido com o mesmo `requestId` e comando.

## Um PDF de Fonte não foi enviado ou não abre

O PDF precisa pertencer a uma revisão ativa da Fonte, ter cabeçalho válido e no
máximo 20 MiB. O envio só termina depois que o objeto no Storage privado é
confirmado pela API de Cursos. Se a rede falhar após o envio, use **Confirmar o
mesmo PDF** em vez de escolher outro arquivo.

Para abrir um anexo, releia a Fonte e solicite um novo endereço assinado. O
endereço expira e não deve ser guardado como identidade do arquivo. Confira
também a cota de 64 MiB de conteúdo único por Curso e o limite de oito anexos
por Fonte.

## O Estudo não mostra uma Fonte ou um link

Abra **Fontes** na Unidade: a consulta é sob demanda e não ocorre junto com o
conteúdo. Fonte oculta ou legada não resolvida é omitida. A visibilidade
**Citação** mostra identificação e localização, mas não URL; somente **Citação
e link** pode mostrar o endereço. Se o acesso foi revogado ou o Curso não
existe mais, o aplicativo limpa o estado local em vez de conservar o painel.

## O MCP não encontra ou não altera o Curso

1. confirme OAuth e conta;
2. confirme que o Curso é próprio, pois a Autoria é exclusiva do proprietário;
3. verifique a descoberta das seis ferramentas;
4. use `listarCursos` e `lerCurso` antes da mutação;
5. diante de conflito, releia a revisão;
6. confira se cliente e interface apontam para o mesmo ambiente.

Uma concessão de acesso permite Estudo, não Autoria remota.

## A alteração do MCP não aparece na interface

O MCP e a Autoria usam o mesmo Curso, mas a interface pode conservar uma
projeção já carregada. Ao voltar à guia ou focalizar a janela do AraLearn, aguarde
a releitura da área visível. Se o navegador não sinalizar o retorno, use a ação
**Atualizar** no cabeçalho do Curso e confira a nova revisão. Se a leitura do
servidor contiver a mudança e a tela não, registre console, rede, rota e revisão
exibida: o defeito está na projeção ou atualização da interface, não numa etapa
de publicação.

Quando houver um compositor, uma confirmação ou um formulário em edição, o
AraLearn adia a atualização para conservar o rascunho. Conclua ou cancele essa
edição e use **Atualizar** novamente.

## Uma Variante não mostra a diferença esperada

Cada variante é um Curso independente e pode mudar depois do ponto comum de
planejamento. Abra a comparação novamente e confira a revisão lida, as
diferenças declaradas, os desvios não declarados e os dados ausentes.
Desvincular remove somente a relação de comparação; não exclui o Curso.

## Um gráfico de Pesquisa parece contradizer a tabela

Confirme se gráfico e tabela usam os mesmos conjuntos, filtros e intervalo de
datas. Abra **Como esta métrica é definida** e verifique unidade, denominador e
regra de dados ausentes. Pesquisa apresenta fatos da Autoria; uma contagem ou
diferença entre Variantes não demonstra efeito de aprendizagem.

## Não consigo conceder acesso

Somente o proprietário pode gerir **Pessoas**. O destinatário precisa ter uma
conta localizada pelo e-mail exato, e a confirmação explícita é obrigatória.
O serviço não pesquisa diretório nem concede papel de edição.

## A foto de perfil não é aceita

Use JPEG, PNG ou WebP de até 512 KiB. O objeto fica no bucket privado de
avatares. Se a foto nova for registrada e a remoção da anterior falhar, a tela
deve informar a limpeza pendente; não envie repetidamente arquivos maiores.

## A conta não é excluída

A exclusão exige a frase exata `EXCLUIR MINHA CONTA`. O aplicativo envia uma
única solicitação confirmada à API, que remove os avatares e os PDFs dos Cursos
próprios. O banco recusa a exclusão enquanto algum desses objetos permanecer.
Tente novamente com conexão estável. Não use exclusão como forma de sair: ela
remove Cursos próprios e dados relacionados de modo irreversível.

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
pessoa ou conteúdo de Curso que não possa ser divulgado.

Consulte também [Uso do aplicativo](uso-do-app.md), [Persistência e
sincronização](persistencia-relacional.md) e [Autoria por MCP](autoria-mcp.md).
