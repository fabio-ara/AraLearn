# Solução de problemas

## Diagnosticar sem perder trabalho

Antes de limpar dados ou reinstalar:

1. anote a tela, o Curso e a ação que falhou;
2. verifique se a conexão voltou;
3. observe mensagens de fila, revisão ou retomada;
4. tente novamente uma vez;
5. só use limpeza local depois de avaliar alterações offline pendentes.

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

Essa limpeza remove cache e operações ainda não sincronizadas. Não a confirme
se houver progresso, marcas ou observações offline que precisam ser
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
do cache.

## O aplicativo mostra o último estado conhecido

Isso indica uso da réplica local. Ela permite retomar conteúdo já aberto, mas
não prova que a lista, o acesso ou a composição estão atualizados. Reconecte e
aguarde a atualização antes de tomar uma decisão de Autoria.

## Progresso, marca ou observação aguardam envio

O estado pessoal entra numa fila por Curso. Mantenha o aplicativo instalado e
os dados locais preservados até a conexão retornar. O repositório tenta
reconciliar mudanças de revisão de forma limitada.

Se a fila continuar pendente:

1. abra novamente o Curso;
2. confirme que o acesso ainda existe;
3. tente sincronizar com conexão estável;
4. registre o tipo da operação e a mensagem, sem copiar o conteúdo privado.

## Uma observação foi salva, mas não houve correção

Na revisão corrente, a observação do Estudo é pessoal e ancorada à Unidade. A
fila autoral de triagem, auditoria, reparo e nova verificação ainda não está
implementada. Salvar uma observação não significa que ela já chegou a um fluxo
de correção.

## Uma prática não permite avançar

Confira campos obrigatórios e mensagens próximas ao componente. Se a
interação parecer preenchida mas continuar bloqueada, registre o tipo de
componente e a Unidade. O avanço depende do contrato do componente, não de uma
pontuação global.

## Uma edição de Autoria entrou em conflito

Outro cliente alterou o Curso depois da leitura. Reabra ou releia o Curso,
compare a intenção com o estado novo e aplique apenas o que ainda faz sentido.
Não aumente a revisão à mão e não repita a escrita às cegas.

## Não consigo salvar uma atribuição de Fontes

Confira se cada Fonte escolhida possui ao menos uma Âncora ativa na revisão
exata e se o conjunto exibido contém tudo o que deve permanecer no alvo. Salvar
substitui o conjunto completo; não há modo de acréscimo parcial. Se o Curso ou
o alvo mudou, releia e reconcilie antes de tentar novamente.

Uma referência **Legado não resolvido** pode não ter metadados nem Âncora. Para
resolvê-la, revise a mesma identidade literal; não crie uma Fonte parecida nem
remova espaços do identificador. Depois de falha de rede sem resposta, repita o
mesmo pedido com o mesmo `requestId` e comando.

## O Estudo não mostra uma Fonte ou um link

Abra **Fontes** na Unidade: a consulta é sob demanda e não ocorre junto com o
conteúdo. Fonte oculta ou legada não resolvida é omitida. A visibilidade
**Citação** mostra identificação e localização, mas não URL; somente **Citação
e link** pode mostrar o endereço. Se o acesso foi revogado ou o Curso não
existe mais, o aplicativo limpa o estado local em vez de conservar o painel.

## O MCP não encontra ou não altera o Curso

1. confirme OAuth e conta;
2. confirme que o Curso é próprio, pois Autoria é owner-only;
3. verifique a descoberta das seis ferramentas;
4. use `listarCursos` e `lerCurso` antes da mutação;
5. diante de conflito, releia a revisão;
6. confira se cliente e interface apontam para o mesmo ambiente.

Uma concessão de acesso permite Estudo, não Autoria remota.

## A alteração do MCP não aparece na interface

O MCP e a Autoria usam o mesmo Curso, mas a interface pode conservar uma
projeção já carregada. Atualize o Curso e confira a nova revisão. Se a leitura
do servidor contiver a mudança e a tela não, registre console, rede, rota e
revisão exibida: o defeito está na projeção ou atualização da interface, não
numa etapa de publicação.

## Não consigo conceder acesso

Somente o proprietário pode gerir **Pessoas**. O destinatário precisa ter uma
conta localizada pelo e-mail exato, e a confirmação explícita é obrigatória.
O serviço não pesquisa diretório nem concede papel de edição.

## A foto de perfil não é aceita

Use JPEG, PNG ou WebP de até 512 KiB. O objeto fica no bucket privado de
avatares. Se a foto nova for registrada e a remoção da anterior falhar, a tela
deve informar a limpeza pendente; não envie repetidamente arquivos maiores.

## A conta não é excluída

A exclusão exige a frase exata `EXCLUIR MINHA CONTA`. O aplicativo tenta apagar
os avatares antes da conta, e o banco recusa a exclusão enquanto ainda houver
objeto de avatar. Tente novamente com conexão estável. Não use exclusão como
forma de sair: ela remove Cursos próprios e dados relacionados de modo
irreversível.

## O desenvolvimento local não inicia

1. confira versões de Node.js e dependências;
2. use os scripts existentes em `package.json`;
3. para backend, confirme Supabase CLI e containers locais;
4. verifique se variáveis privadas estão no ambiente local, não no repositório;
5. leia o primeiro erro real antes de executar uma suíte ampla.

A migração hospedada do novo modelo de Curso continua bloqueada pelos gates de
importação, reset e verificação. Um ambiente remoto na versão anterior não é
evidência de que o runtime canônico local falhou.

## Registrar um defeito útil e seguro

Inclua:

- ação realizada e resultado esperado;
- resultado observado;
- modo Estudo ou Autoria;
- smartphone ou desktop e largura aproximada;
- online ou offline;
- mensagem segura do console ou da rede;
- se o problema se repete após nova leitura.

Não inclua credenciais, tokens, URL assinada, e-mail integral, dados de outra
pessoa ou conteúdo de Curso que não possa ser divulgado.

Consulte também [Uso do aplicativo](uso-do-app.md), [Persistência e
sincronização](persistencia-relacional.md) e [Autoria por MCP](autoria-mcp.md).
