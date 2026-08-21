# Privacidade e tratamento de dados

Este documento descreve os dados usados pelo AraLearn, sua finalidade e as
regras técnicas de acesso. Uma instituição que implante o sistema precisa
acrescentar base jurídica, prazos de retenção, responsáveis, condições dos
provedores e canais de atendimento aplicáveis ao seu contexto.

Privacidade depende de minimização, finalidade, isolamento no banco e
informação compreensível. Ocultar um campo na interface, sozinho, não protege o
dado ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## Conceitos essenciais

**Dado pessoal** é uma informação que identifica uma pessoa ou pode ser
relacionada a ela. No AraLearn, isso inclui e-mail da conta, identificador
interno, nome de apresentação e foto de perfil.

**Proprietário do Curso** é a pessoa autorizada a alterar o planejamento e o
conteúdo, consultar áreas autorais e conceder acesso a Estudo.

**Acesso ao Estudo** permite abrir e praticar um Curso compartilhado. A pessoa
que recebeu acesso continua fora da Autoria desse Curso e não pode alterar o
original. Na candidata 0.0.26, validada localmente e ainda não publicada, uma
mudança contextual confirmada pode criar outro Curso privado, pertencente a essa
pessoa.

**Cópia pessoal de Curso** é esse novo Curso, criado somente na primeira
gravação material. Ele recebe a composição didática necessária para continuar na
mesma Unidade, mas não recebe planejamento, Fontes, PDFs, acessos, progresso ou
Observações do original.

**Estado pessoal de Estudo** reúne posição de retomada, Unidades concluídas e
marcas **Rever**. Ele pertence à pessoa e ao Curso e fica separado do conteúdo.

**Anotação ancorada** registra uma Observação ligada a um alvo do Curso. Cada
estudante lê somente as próprias; o proprietário recebe a caixa de entrada
necessária à triagem.

**Réplica local** é a cópia mantida no dispositivo para abertura rápida e uso
sem conexão. Uma alteração ainda não sincronizada pode existir somente nessa
cópia, que não substitui uma cópia de segurança.

A cópia pessoal é uma autoridade persistida no servidor; a réplica local é
apenas estado do dispositivo. Os termos não são intercambiáveis.

## Dados e finalidades

| Finalidade | Dados | Armazenamento |
|---|---|---|
| autenticar a conta | e-mail, credencial e sessão | Supabase Auth e sessão no dispositivo |
| apresentar a pessoa | identificador, nome opcional e referência da foto | PostgreSQL |
| exibir a foto | JPEG, PNG ou WebP de até 512 KiB | área privada `person-avatars` |
| manter um Curso | proprietário, plano, orientações, composição e revisões | PostgreSQL |
| documentar proveniência | Fonte, metadados, endereço, Âncoras, trecho de verificação e atribuições | PostgreSQL privado |
| anexar documentos de Fonte | PDF, tamanho, resumo criptográfico e vínculo com a revisão | área privada `course-source-pdfs` e PostgreSQL |
| autorizar Estudo | Curso, conta com acesso, proprietário e data da concessão | PostgreSQL |
| retomar Estudo | posição, conclusões e marcas **Rever** | PostgreSQL e réplica local |
| registrar Observações | alvo, origem, texto, categoria, estado, resposta, Fontes consideradas, versões e instantes | PostgreSQL privado; cópia e fila no dispositivo |
| auditar e corrigir | critério, evidência, vínculos, versões e estados anterior e proposto da Unidade focal | PostgreSQL privado do proprietário |
| comparar Variantes | ponto comum, Cursos membros, diferenças declaradas e fatos observados | PostgreSQL privado do proprietário |
| consultar Pesquisa | fatos derivados da Autoria, dicionário, métricas descritivas e paginação | PostgreSQL; projeção restrita ao proprietário |
| repetir uma alteração com segurança | revisão esperada, identificador do pedido, evento e recibo temporário | PostgreSQL privado |

## Conta, perfil e localização por e-mail

Uma conta recebe um perfil vazio ligado ao identificador de autenticação. O
sistema não deriva nome de apresentação do endereço de e-mail. A pessoa escolhe
se deseja informar nome e foto.

Para conceder acesso, o proprietário digita o e-mail exato de uma conta
existente. O serviço usa o valor somente para localizar essa identidade. Não há
busca parcial, diretório ou sugestão de contas. A relação gravada conserva
identificadores internos; o e-mail não entra nos eventos nem na resposta da
operação.

Uma pessoa pode ver o próprio perfil. Numa relação de Curso compartilhado:

- o proprietário vê o perfil das pessoas às quais concedeu acesso;
- a pessoa com acesso vê o perfil do proprietário;
- pessoas com acesso não recebem perfis umas das outras.

O banco aplica regras de segurança por linha, chamadas **Row Level Security
(RLS)**. A área privada de fotos repete a mesma autorização. Cada envio usa uma
chave nova dentro da pasta da própria conta e não cria endereço público.

## Propriedade e acesso ao Curso

Todo Curso nasce privado. O proprietário pode abri-lo na Autoria, alterar plano
e composição, usar as ferramentas autorais, consultar Pesquisa e Variantes e
gerir acessos. Uma pessoa com acesso recebe somente a projeção de Estudo, que
exclui orientações privadas e estado autoral. Na operação candidata da #149,
essa projeção permite enviar uma única Unidade editada ao servidor para criar um
Curso pessoal privado; ela não concede escrita sobre o original.

A relação entre pessoa, origem e cópia pessoal permanece numa tabela privada do
PostgreSQL, sem acesso direto pelo cliente. Ela é dado operacional relacionado à
conta. A interface usa rótulos humanos e não mostra identificadores, revisões ou
detalhes da relação. A cópia não recebe a lista de pessoas favorecidas, o estado
pessoal, as Observações, as Fontes ou os PDFs da origem.

Conceder ou revogar acesso exige confirmação humana. A revogação encerra novas
leituras e alterações no servidor, mas preserva o estado pessoal remoto. Na
próxima validação conectada, o dispositivo dessa pessoa remove cabeçalho,
composição, listas, Fontes projetadas e Anotações locais daquele Curso. Se o
acesso for concedido novamente, o estado pessoal preservado pode voltar a ser
usado. Se uma cópia pessoal já foi confirmada, ela continua pertencendo à pessoa
que a criou e não é apagada pela revogação do acesso ao original.

Dados já entregues a um dispositivo podem permanecer fisicamente nele enquanto
estiver desconectado. A revogação técnica não recolhe retroativamente esses
bytes.

## Fontes, Âncoras e PDFs

Somente o proprietário acessa catálogo, histórico, Fontes ocultas, referências
pendentes de comprovação, trecho privado de verificação, PDFs e controles de
edição. Estudo solicita a proveniência de uma Unidade quando a pessoa abre
**Fontes** e recebe apenas a projeção autorizada:

- **Não mostrar no Estudo** omite a Fonte;
- **Mostrar citação** apresenta identificação e localização sem endereço;
- **Mostrar citação e link** também pode apresentar o endereço;
- histórico, trecho privado, identidade de quem alterou, canal, PDF e controles autorais permanecem
  ausentes.

Os PDFs usam caminhos formados pela identidade do Curso e pelo resumo
criptográfico do conteúdo. Arquivos idênticos dentro do mesmo Curso compartilham
os bytes, enquanto os vínculos preservam as revisões de Fonte corretas. Antes de
registrar o vínculo, a API lê o objeto privado com a credencial do servidor e
confere o tamanho, o cabeçalho `%PDF-` e o SHA-256 dos bytes recebidos. Arquivos
vinculados permanecem imutáveis. Cada arquivo aceita até 20 MiB, cada revisão
até oito anexos e o Curso até 64 MiB de conteúdo único.

Criar uma variante pode reutilizar a referência ao mesmo objeto privado em vez
de duplicar os bytes. A leitura continua condicionada à propriedade do Curso
que participa da comparação.

A exportação de proveniência contém o alvo, as relações, as revisões, as
Âncoras e metadados dos anexos. Ela omite identificadores pessoais de quem
realizou as operações. Depois de baixado, o arquivo passa a depender também dos
cuidados adotados fora do AraLearn.

Uma nota, contestação ou solicitação de reformulação pode apontar para a Fonte
ou para uma Âncora. Esses registros seguem o mesmo controle privado das demais
Anotações ancoradas. Quando a autoria responde com uma reformulação, a resposta
identifica somente as revisões de Fonte e de Âncora consideradas; o PDF e seu
conteúdo não são copiados para a Anotação. A exportação dessas Observações
contém os mesmos alvos, versões e vínculos que a interface apresenta.

## Estado pessoal sem telemetria comportamental

O estado pessoal responde a perguntas funcionais: onde continuar, quais
Unidades já foram avançadas e quais foram marcadas para rever. Ele não registra
automaticamente tempo de permanência, cada toque, cada envio ou respostas
anteriores.

A fila **Rever** é montada no servidor a partir das marcas da própria pessoa e
chega ao dispositivo em páginas. Atividade de outros estudantes não altera a
versão privada desse estado nem aparece como conflito entre abas.

Esses registros não equivalem a atenção, esforço, compreensão ou aprendizagem.
O [Estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) desenvolve os
limites de interpretação.

## Anotações ancoradas e identidade protegida

Cada estudante lê somente as próprias Anotações. O proprietário lê as
Anotações do Curso para triagem. A interface autoral identifica a contribuição
estudantil por um rótulo protegido, como “Estudante 7A3F”, sem apresentar o
identificador interno da conta ou o e-mail.

Enquanto uma Anotação está aberta, considerada ou resolvida, o servidor conserva
o texto corrente, a síntese e a resposta necessários à função. Eventos de
revisão guardam resumos criptográficos e metadados limitados, em vez de versões
anteriores do texto integral.

Retirar uma Anotação redige imediatamente texto, síntese e resposta e mantém um
registro de exclusão. Esse registro e o recibo de repetição expiram logicamente
em até 14 dias. A limpeza física ocorre de forma oportunista, em lotes, quando o
Curso volta a ser lido ou alterado. Como não há tarefa periódica dedicada, um
Curso inativo pode conservar a linha física por mais tempo, embora ela já não
seja legível, paginável nem contada nas cotas funcionais.

Anotações ativas ou resolvidas não expiram apenas pela idade. A instituição
responsável precisa definir a retenção operacional. O AraLearn não cria uma
cópia de pesquisa por padrão; qualquer reutilização exige finalidade,
minimização, governança e autorização adequadas.

## Auditoria, correções, Variantes e Pesquisa

Somente o proprietário consulta e altera rodadas, achados, correções e
comparações. Estudantes não recebem listas, contagens, evidências nem links
dessas áreas.

Um achado ligado a uma Observação guarda apenas identidade e versão da Anotação,
sem copiar texto, resposta, pseudônimo ou identidade pessoal. Quando a Anotação
é retirada, o vínculo deixa de ser navegável; depois da limpeza física, a
relação desaparece e preserva a rodada, o achado e a correção.

Uma correção guarda apenas os estados anterior e proposto da Unidade focal e de
suas atribuições de Fontes. Aplicar e reverter mudam o Curso e criam atividade;
registrar auditoria, decidir, propor ou verificar preserva a composição.

Pesquisa projeta fatos já registrados para o proprietário. Os conjuntos cobrem
atividade do Curso, produção por Partes, desenho, Fontes, Observações, auditorias
e Variantes. A exportação conserva códigos estáveis e limites de interpretação.
Ela não inclui o e-mail digitado para acesso nem transforma Anotações em uma
base de pesquisa identificada.

## Autoria conversacional

Um protocolo aberto conecta assistentes às ferramentas de Autoria: o **Model
Context Protocol (MCP)**. Essa integração recebe apenas Cursos próprios da
pessoa autenticada. Cursos
compartilhados para Estudo não aparecem nas listagens ou leituras autorais. As
mesmas regras de propriedade, revisão e confirmação usadas pela interface são
aplicadas pelo servidor.

Na assistência complementar de produção, o pedido sai do dispositivo somente
para um relay em `127.0.0.1`, `localhost` ou `10.0.2.2`, na porta 4183. A chave
do provider fica nesse relay e não entra no AraLearn. O aviso anterior à chamada
enumera o conteúdo: pedido, valores textuais editáveis, título, papel, tópicos e
mensagens anteriores daquela conversa. PDFs, Fontes, outras Unidades,
`targetId`, `studyUnitId` e o restante do Curso não são enviados.

O navegador classifica `127.0.0.1` e `localhost` como loopback e `10.0.2.2`
como rede local ao pedir acesso. Essa informação de transporte não amplia o
conteúdo enviado nem concede ao AraLearn acesso à credencial do relay.

O aviso também informa que esses valores permanecem apenas na memória efêmera do
AraLearn, mas podem ser encaminhados pelo relay e retidos pelo provider conforme
os termos do serviço escolhido. A autorização ocorre por chamada, depois de a
pessoa conferir o conteúdo enumerado.

Essa fronteira foi comprovada em HTTP local. Pages ainda precisa do ensaio de
acesso à rede local. O Android 0.0.24 retira a chamada HTTP do WebView por
uma ponte nativa fixa no relay local e mantém `MIXED_CONTENT_NEVER_ALLOW`; o APK
instalado ainda precisa comprovar esse percurso em dispositivo real. A limitação
de transporte não autoriza relaxar a política de conteúdo misto nem mover a
chave para o AraLearn.

Um runtime explicitamente marcado como desenvolvimento pode permitir chamadas
diretas a OpenAI, Gemini ou DeepSeek. Ele alerta que o navegador não protege
chaves duradouras, orienta usar somente credencial descartável de teste, fixa cada
provider à sua origem e envia a chave apenas no cabeçalho. A credencial direta
permanece em memória até sair, recarregar ou encerrar a sessão; não entra no
IndexedDB, no PostgreSQL, no Storage nem nos artefatos. Esse modo não é indicado
como configuração de produção ou percurso para pessoas leigas.

Ao sair da conta, o aplicativo destrói a superfície ativa e cancela a chamada ao
provider antes de apagar a sessão e fechar os armazenamentos locais. Uma resposta
tardia não pode executar callback, reabrir a sobreposição nem restaurar a
configuração ou a credencial em memória. O cenário integrado `SIGNED_OUT`
confirma aborto, ausência de callback tardio, remoção da sobreposição e da
credencial e nenhum erro de página.

Mesmo com esse recorte, o conteúdo enviado pelo relay ou pelo modo de
desenvolvimento fica sujeito às regras do serviço efetivo. A pessoa deve evitar
segredos e dados pessoais desnecessários, delimitar a finalidade e revisar a proposta antes de incorporá-la
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Dados no dispositivo

O navegador e o aplicativo Android mantêm sessão autenticada, listas resumidas,
composições já abertas, estado pessoal, alterações pendentes, Anotações e
arquivos estáticos da interface.

Durante a primeira gravação de uma cópia pessoal, o IndexedDB pode conservar o
Curso e a seleção de origem, as versões esperadas, a Unidade final, a origem da
edição e um identificador de pedido. Esse recorte existe para repetição
idempotente após falha ou reinício e é removido na confirmação ou no descarte.
Ele não inclui conversa, endpoint, modelo ou credencial do provider.

Rodadas, achados, correções, comparações e fatos de Pesquisa permanecem no
servidor. Limpar os dados do aplicativo pode apagar mudanças ainda não
sincronizadas. Sair encerra a sessão, mas não equivale a excluir todos os dados
do dispositivo ou do servidor.

## Operações controladas pela pessoa

### Alterar nome ou foto

Em **Conta e aparência**, edite o nome ou escolha uma imagem JPEG, PNG ou WebP
de até 512 KiB. Somente a própria pessoa envia ou remove objetos de sua pasta.

### Conceder acesso ao Estudo

Em um Curso próprio, abra **Pessoas**, informe o e-mail exato de uma conta,
confira o destinatário na confirmação e conclua. O destinatário passa a ver o
Curso em Estudo, e a propriedade permanece inalterada.

### Revogar acesso ao Estudo

Em **Pessoas**, escolha a conta e confirme a revogação. O servidor encerra a
autorização e preserva o estado pessoal para uma eventual nova concessão.

### Excluir a própria conta

A exclusão exige conexão, confirmação humana e a frase exata `EXCLUIR MINHA
CONTA`. Ela não é oferecida às ferramentas conversacionais.

O aplicativo envia uma única solicitação confirmada à API. A API autentica a
pessoa, deriva seus Cursos e caminhos privados, remove os avatares e PDFs
correspondentes e só então solicita a exclusão relacional com a mesma sessão. O
banco recusa a operação enquanto algum objeto permanecer e confirma a ausência
no momento da exclusão. Uma falha intermediária conserva a conta e permite
repetir a solicitação.

Depois, a conta de autenticação, o perfil, os Cursos próprios, suas composições,
acessos e estados dependentes são removidos. Contribuições em Cursos alheios são
retiradas e redigidas imediatamente e seguem a janela de limpeza lógica de 14
dias. Uma cópia pessoal é Curso próprio e segue essa mesma exclusão. A réplica
local é limpa depois da resposta de sucesso.

A operação não oferece restauração automática. Registros técnicos, cópias de
segurança e retenções do provedor podem seguir prazos próprios, que a instituição
responsável deve declarar.

Uma URL de envio de PDF emitida antes da exclusão pode permanecer válida por
até duas horas. Uma sessão emitida anteriormente também pode conservar validade
até expirar e enviar um novo avatar. Se esses meios forem usados depois que a
conta deixou de existir, não criam vínculo nem reabrem a conta, mas podem deixar
um objeto sem proprietário. A operação deve repetir o inventário de PDFs e
avatares depois das duas janelas e remover somente o caminho cuja ausência de
vínculo tenha sido comprovada.

## Roadmap de proteção desde a concepção

A proteção de dados no [roadmap corrente](https://github.com/fabio-ara/AraLearn/issues/147)
possui duas frentes. A issue [#150](https://github.com/fabio-ara/AraLearn/issues/150)
corrige riscos concretos no produto atual, como exportação, limpeza local,
retenção e fronteiras do MCP. Somente depois da baseline 2.0, a
[#156](https://github.com/fabio-ara/AraLearn/issues/156) fixa as fronteiras do
eventual artefato versionado antes do ensaio Git. Essas medidas são proteção
desde a concepção e não constituem declaração de conformidade com LGPD ou RGPD.

## Responsabilidades da instituição

As regras técnicas de acesso não determinam sozinhas se um tratamento é ética ou
juridicamente adequado. A instituição deve informar finalidade, base jurídica,
retenção, contato, resposta a incidentes e condições dos provedores externos.

Dados exportados ou copiados para fora do AraLearn deixam de estar protegidos
pelas políticas de linha do sistema. Permissão para consultar um dado também não
autoriza sua reutilização para outra finalidade.

## Comunicar um problema de privacidade

Ao relatar um problema, registre versão, dispositivo, operação e resultado.
Substitua nomes, e-mails, credenciais e conteúdo privado por exemplos fictícios.
Use o canal da instituição responsável pela instalação; para defeitos no código
público, use o rastreador do repositório.

Se uma credencial tiver sido exposta, revogue-a ou substitua-a. Editar uma
mensagem ou um arquivo não elimina necessariamente as cópias já produzidas.
