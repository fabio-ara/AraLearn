# Privacidade e tratamento de dados

Este documento descreve os dados usados pelo AraLearn, sua finalidade e as
regras técnicas de acesso. Uma instituição que implante o sistema precisa
acrescentar base jurídica, prazos de retenção, responsáveis, condições dos
provedores e canais de atendimento aplicáveis ao seu contexto.

Ele não declara conformidade com a LGPD ou com o RGPD. A linha publicada 0.0.27
inclui os controles técnicos descritos neste documento no banco, nas funções e
nos clientes.

Privacidade depende de minimização, finalidade, isolamento no banco e
informação compreensível. Ocultar um campo na interface, sozinho, não protege o
dado ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## Natureza das regras

Quatro tipos de afirmação precisam permanecer distintos:

| Natureza | O que este documento pode afirmar |
| --- | --- |
| requisito jurídico condicionado | quando LGPD ou RGPD se aplicam, finalidade, necessidade/minimização, transparência, segurança e direitos do titular precisam ser atendidos; o código não escolhe sozinho o responsável nem a base jurídica |
| boa prática de engenharia | separar identidade, reduzir projeções, limitar acesso, sanear erros, definir retenção e testar negativas diminui riscos concretos, mas não produz um selo jurídico |
| decisão de produto | manter Pessoas somente na aplicação, fazer o nome opcional e distinguir saída de limpeza local são escolhas do AraLearn que podem ser revistas com evidência de uso |
| questão jurídica ou ética aberta | controlador, operadores, bases, transferências, protocolo de pesquisa, população, menores, retenções institucionais e pareceres dependem da implantação e de decisão humana competente |

Consentimento não é tratado como base universal. Conta necessária ao serviço,
assistência por provider, fatos operacionais e participação voluntária em
pesquisa são tratamentos diferentes.

## Conceitos essenciais

**Dado pessoal** é uma informação que identifica uma pessoa ou pode ser
relacionada a ela. No AraLearn, isso inclui e-mail da conta, identificador
interno, nome de apresentação e foto de perfil.

**Proprietário do Curso** é a pessoa autorizada a alterar o planejamento e o
conteúdo, consultar áreas autorais e conceder acesso a Estudo.

**Acesso ao Estudo** permite abrir e praticar um Curso compartilhado. A pessoa
que recebeu acesso continua fora da Autoria desse Curso e não pode alterar o
original. Desde a versão 0.0.26, uma mudança contextual confirmada pode criar
outro Curso privado, pertencente a essa pessoa.

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

### Registro técnico das classes

Este registro descreve o padrão técnico publicado. O prazo institucional final
continua aberto quando indicado.

| Classe | Exemplos e finalidade | Pessoal ou sensível? | Local e acesso | Retenção e gatilho | Exportação e pesquisa |
| --- | --- | --- | --- | --- | --- |
| conta e sessão | UUID, e-mail, credenciais e tokens para autenticar e recuperar a conta | pessoal; tokens são segredos | Supabase Auth e projeção mínima no dispositivo; somente a própria sessão e a operação administrativa necessária | vida da conta e da sessão; revogar sessões antes da exclusão | não integra exportação comum nem dataset de pesquisa |
| perfil | nome opcional e avatar para apresentação | pessoal; não é sensível por padrão | PostgreSQL e bucket privado; própria pessoa e relações autorizadas | até alteração ou exclusão; política de cópias de segurança ainda institucional | pode aparecer apenas em superfícies autorizadas, não no MCP público |
| Curso e autoria | conteúdo, plano, revisões, eventos e recibos para criar e investigar o artefato | pode conter dado pessoal em texto livre; UUIDs ligados à conta e horários correlacionáveis são dados pessoais e não se tornam pseudônimos apenas pelo formato | PostgreSQL; proprietário e projeções permitidas | artefato enquanto necessário; recibos de mudança expiram em 14 dias | exportações operacionais não são automaticamente anônimas nem autorizam pesquisa |
| acesso direto | Curso, ator, pessoa favorecida, concessão e revogação | pessoal/pseudonimizado | PostgreSQL; proprietário e favorecido conforme a relação | até revogação, exclusão ou política institucional; contadores de tentativa, 30 dias | e-mail não entra em recibo, evento, contador ou MCP |
| estado pessoal | posição, progresso e marcas **Rever** para continuar o Estudo | pessoal/pseudonimizado | PostgreSQL e IndexedDB segregado por conta; somente a pessoa | estado funcional até exclusão; recibos expiram em 7 dias | fora de exportações comuns e de pesquisa por padrão |
| Observações | texto, alvo, revisão, resposta, estado e horários para manifestação e triagem | pessoal/pseudonimizado; texto livre pode conter categorias sensíveis | PostgreSQL e IndexedDB; autor e proprietário nos limites do contrato | ativas não expiram só pela idade; retirada redige de imediato e linha/recibo são removíveis após 14 dias | exportação v2 é privada, pessoal ou pseudonimizada; uso em pesquisa exige protocolo |
| Analytics da Autoria | IDs, hashes, canal, origem, estado, contagens e horários para descrever o processo | pessoal/pseudonimizado enquanto houver correlação; não é anonimizado por retirar o nome | PostgreSQL; proprietário do Curso | prazo institucional ainda aberto | exportável com aviso; não mede aprendizagem nem constitui dataset anônimo |
| PDFs e avatares | documentos de Fonte e imagens de perfil | podem conter dados pessoais, confidenciais ou sensíveis | Storage privado e vínculos no PostgreSQL | vínculo ativo e política da classe; órfãos são inventariados, não apagados automaticamente | PDFs não entram nos exports correntes nem são enviados ao provider por padrão |
| assistência por provider | pedido, texto editável selecionado, título, papel, tópicos e até oito turnos para produzir uma sugestão focal | texto pode conter dado pessoal mesmo sem identificador dedicado | memória local e provider escolhido pela pessoa; não integra banco nem IndexedDB | memória até fechar/recarregar/sair; retenção externa depende do provider | não é dataset de pesquisa; envio exige aviso por chamada |
| pesquisa | protocolo, pseudônimo específico, medidas e eventual tabela de reidentificação | pessoal pseudonimizado enquanto reidentificável; pode tornar-se sensível conforme a pergunta | plano de dados segregado e acesso definido pelo protocolo, ainda não implantado como infraestrutura genérica | conforme protocolo, retirada e obrigação institucional | exportação somente nos termos do protocolo; resultados publicados exigem avaliação de reidentificação |
| registros e limpeza | contagens de tentativas, datas de expiração e contagens de remoção para segurança e ciclo de vida | ator é identificador pessoal da conta; horários e contagens permanecem correlacionáveis; nenhuma coluna de e-mail integra o contador de concessões | tabelas privadas e rotina administrativa | janela de concessão, 30 dias; demais prazos por classe | contagens operacionais não integram export comum nem autorizam pesquisa |

Nenhuma categoria sensível é coletada como requisito do produto. Se uma futura
pesquisa tratar saúde, religião, origem racial ou étnica, opinião política,
biometria ou outra categoria especialmente protegida, a implantação precisa
parar no gate jurídico e ético antes da coleta. O mesmo vale para pesquisa com
crianças e adolescentes.

## Conta, perfil e localização por e-mail

Uma conta recebe um perfil vazio ligado ao identificador de autenticação. O
sistema não deriva nome de apresentação do endereço de e-mail. A pessoa escolhe
se deseja informar nome e foto.

Para conceder acesso, o proprietário digita o e-mail exato de uma conta
existente. O serviço usa o valor somente para localizar essa identidade. Não há
busca parcial, diretório ou sugestão de contas. A relação gravada conserva
identificadores internos; o e-mail não entra nos eventos nem na resposta da
operação.

Desde a versão 0.0.27, a resposta de concessão é sempre a mesma para conta
existente, inexistente, própria, já favorecida ou tentativa limitada. Ela apenas
informa que a solicitação foi aceita; o recibo não contém o resultado nem a
relação criada. O proprietário autorizado ainda pode encontrar uma relação que
realmente exista numa leitura posterior; a medida reduz o oráculo
direto de enumeração, sem fingir sigilo absoluto da própria lista de acesso.

O banco admite dez tentativas por ator em cada janela de dez minutos. A
repetição idêntica recupera primeiro o recibo anterior. A tabela de limitação
guarda ator, começo e fim da janela e contadores agregados de tentativa,
concessão, ausência, inalteração e limitação. Não guarda e-mail nem resumo
criptográfico do e-mail e fica elegível à limpeza depois de 30 dias.

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
exclui orientações privadas e estado autoral. Na operação de cópia pessoal, essa
projeção permite enviar uma única Unidade editada ao servidor para criar um
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

Desde a versão 0.0.27, o preparo de envio cria uma intenção privada válida por
dez minutos para o ator, Curso, caminho, impressão digital, tamanho, tipo, Fonte e
revisões exatos. O navegador envia o PDF ao endpoint autenticado do Storage com
a sessão corrente; a política também exige que o `session_id` ainda exista e
não esteja vencido no Auth, confronta caminho, tamanho e tipo e participa do
mesmo bloqueio usado pela exclusão da conta. A inserção consome a intenção. Não
é emitida nova URL assinada de upload. Uma URL v1 emitida pela versão 0.0.26
antes do corte, porém, é uma credencial independente da sessão e pode continuar
aceita por até duas horas. A fronteira anterior só se encerra depois dessa
expiração, além da janela dos JWTs antigos.

O resumo criptográfico e o cabeçalho só podem ser confirmados depois que os
bytes chegam. Se um objeto de mesmo tamanho e tipo não corresponder ao PDF
preparado, a API recusa o vínculo. O objeto permanece sem uso e aparece no
inventário administrativo de órfãos; esse inventário não autoriza apagamento
automático.

O download continua usando uma URL assinada válida por 60 segundos. Uma URL já
emitida não pode ser revogada individualmente e pode continuar funcionando até
o fim dessa janela. Ela não deve ser persistida nem usada como identidade do
arquivo.

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
conteúdo não são copiados para a Anotação. A exportação v2 dessas Observações
conserva texto, alvo, versões, vínculos, identificadores operacionais e horários
necessários ao uso privado. Ela remove `contributor.ref`, o rótulo protegido da
pessoa, os caminhos observado e corrente, links profundos e capacidades da
interface. O próprio arquivo e a interface informam que o conteúdo continua
pessoal ou pseudonimizado e não é um conjunto anônimo de pesquisa.

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
em até 14 dias. A versão 0.0.27 mantém os lotes oportunistas e acrescenta uma
rotina privada diária, às 03:17, para que um Curso inativo não seja a única
causa de atraso físico. Cada execução processa até 512 linhas por classe e
devolve contagens separadas de Anotações retiradas, recibos de Anotação,
recibos de mudança de Curso, recibos de estado pessoal, intenções de PDF e
janelas de concessão. O limite pode ser ajustado entre 1 e 1.000 e a repetição
sem itens vencidos produz contagens zero.

Os prazos correntes são 14 dias para a linha redigida e para recibos de
Anotação e de mudança de Curso, sete dias para recibos de estado pessoal, dez
minutos para intenção de upload e 30 dias para a janela agregada de concessão.
Esses prazos técnicos não decidem a retenção institucional de logs, backups,
conteúdo, autoria ou pesquisa.

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

Retirar nome e e-mail não torna esses fatos anônimos. Identificadores de Curso,
objeto ou pedido, resumos criptográficos e horários podem permitir correlação
com a operação ou com outros conjuntos. Enquanto essa relação for razoavelmente
possível, Analytics e suas exportações devem ser tratados como dados pessoais
pseudonimizados. A área **Pesquisa** é uma projeção operacional do proprietário,
não um plano de dados de participantes autorizado por protocolo.

## Autoria conversacional

Um protocolo aberto conecta assistentes às ferramentas de Autoria: o **Model
Context Protocol (MCP)**. Essa integração recebe apenas Cursos próprios da
pessoa autenticada. Cursos
compartilhados para Estudo não aparecem nas listagens ou leituras autorais. As
mesmas regras de propriedade, revisão e confirmação usadas pela interface são
aplicadas pelo servidor.

Desde a versão 0.0.27, o catálogo MCP público possui cinco ferramentas. Perfil,
avatar, lista de Pessoas, concessão e revogação permanecem operações exclusivas
da aplicação autenticada; e-mail e referência protegida não integram ferramenta
ou erro público do MCP.

A mesma versão anuncia somente o escopo OAuth `offline_access`; código e
refresh token não produzem `id_token`. O access token do MCP usa aliases
pareados e distintos para pessoa e sessão, sem UUID da pessoa, e-mail ou perfil,
e não funciona como sessão do aplicativo. O JWT conserva
`aralearn_session_id`, o UUID real da sessão de origem necessário à RPC. Esse
identificador é correlacionável; a credencial inteira continua sendo pessoal ou
pseudonimizada e não é anônima. A Edge Function valida a assinatura
ES256 com chave EC P-256 pela JWKS do Auth. Em seguida, uma RPC exclusiva do papel
de serviço resolve a pessoa e confirma que sessão de origem, cliente e
consentimento ainda estão ativos. O bearer é recusado diretamente pelo GoTrue,
pela API de dados e pelo Storage.

No corte da 0.0.27, consentimentos e sessões OAuth anteriores foram revogados.
Isso impede renovação e exige novo consentimento, mas um ID token `openid` já
emitido continuou válido até `exp`. A fronteira anterior foi declarada fechada
somente depois do maior prazo entre a duração JWT configurada e as duas horas
das URLs v1 de upload já emitidas, contado a partir da promoção e acrescido de
margem operacional. Depois dessa janela, as negativas hospedadas e o inventário
de objetos sem vínculo foram repetidos.

A caixa de entrada e a leitura por alvo de Observações usam uma projeção
fechada com síntese, estado, origem, papel, versões e identificador operacional.
Ela omite texto integral, `contributor.ref`, rótulo protegido da pessoa,
caminhos, links, IDs internos do alvo, horários e texto da resposta autoral. O
detalhe e o contexto de auditoria com Observações selecionadas só incluem
`rawText` quando o cliente declara `includeObservationText: true`. A resposta
registra o destinatário e a finalidade desse envio; as demais omissões continuam
valendo.

Fontes também usam uma projeção própria no MCP. Ela preserva as referências de
domínio necessárias à autoria, mas omite UUID de ator, identidade de atribuição,
resumo interno do alvo, Curso de origem do objeto e caminho do Storage. Preparar
o envio de PDF exige a sessão da aplicação e não integra a ferramenta MCP. Para
abrir um anexo, o cliente precisa declarar
`includeAttachmentDownloadUrl: true`; somente então recebe a URL assinada, com
`dataDisclosure` que a identifica como credencial temporária de 60 segundos.
O mesmo disclosure enumera os campos livres potencialmente pessoais incluídos
na revisão autoral: título, autoria declarada, citação, endereço, identificador,
edição ou versão, trecho de verificação e, quando presentes, `exact`, `prefix`,
`suffix` ou `fragment` dos seletores de Âncora. O painel de Fontes do Estudo já
pode mostrar título, citação, edição ou versão, endereço e o recorte representado
pelo seletor. O detalhe solicitado pelo cliente MCP também pode receber os
demais campos autorais enumerados; o trecho de verificação não é exibido no
Estudo.

Na assistência complementar de produção, o pedido sai do dispositivo somente
para um relay em `127.0.0.1`, `localhost` ou `10.0.2.2`, na porta 4183. A chave
do provider fica nesse relay e não entra no AraLearn. O aviso anterior à chamada
enumera o conteúdo: pedido, valores textuais editáveis, título, papel, tópicos e
mensagens anteriores daquela conversa. PDFs, Fontes, outras Unidades,
`targetId`, `studyUnitId` e o restante do Curso não são enviados.

O envelope é montado por lista fechada, e campos extras presentes na Unidade
não são serializados. Erros públicos do provider preservam código e orientação
úteis, mas não refletem segredo, e-mail, cabeçalho de autorização ou corpo bruto.
As Edge Functions não registram corpo, cabeçalhos ou exceções brutas no console;
workflows também recusam rastreamento e impressão direta de credenciais. O texto
editável escolhido ainda pode conter dado pessoal por decisão da pessoa, razão
pela qual o aviso e a revisão por chamada continuam necessários.

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

Desde a versão 0.0.27, a sessão persiste somente `access_token`, `refresh_token`,
tipo, expiração e `user.id`. E-mail, nome, identidades externas e o restante do
objeto retornado pelo Auth não são duplicados nesse registro; uma sessão legada
é reduzida na primeira leitura. Tokens continuam sendo segredos e não deixam de
ser dados pessoais por essa minimização.

Durante a primeira gravação de uma cópia pessoal, o IndexedDB pode conservar o
Curso e a seleção de origem, as versões esperadas, a Unidade final, a origem da
edição e um identificador de pedido. Esse recorte existe para repetição
idempotente após falha ou reinício e é removido na confirmação ou no descarte.
Ele não inclui conversa, endpoint, modelo ou credencial do provider.

Rodadas, achados, correções, comparações e fatos de Pesquisa permanecem no
servidor. Limpar os dados do aplicativo pode apagar mudanças ainda não
sincronizadas. Sair encerra a sessão, mas não equivale a excluir todos os dados
do dispositivo ou do servidor.

O logout comum tenta sincronizar as filas e preserva, por decisão de produto,
Cursos offline, estado pessoal e rascunhos já gravados no IndexedDB daquela
conta. Uma alteração ainda aberta somente na memória do editor será perdida; a
interface informa isso e pede confirmação antes de sair. **Remover dados deste
dispositivo** apaga somente o namespace da conta ativa e mantém a sessão;
**Sair e remover dados deste dispositivo** encerra a sessão e apaga esse mesmo
namespace. As duas ações alertam sobre progresso, Observações e edições ainda
pendentes. Dados de outra conta no mesmo perfil do navegador não são removidos.

## Operações controladas pela pessoa

### Alterar nome ou foto

Em **Conta e aparência**, edite o nome ou escolha uma imagem JPEG, PNG ou WebP
de até 512 KiB. Somente a própria pessoa envia ou remove objetos de sua pasta.
Se o upload terminar e a atualização do perfil não devolver confirmação, o
aplicativo relê o perfil antes de qualquer rollback. Uma referência já
confirmada preserva a foto; uma ausência confirmada permite remover o objeto sem
vínculo. Se a releitura ou a limpeza falhar, a tela informa a ambiguidade,
conserva a chave do objeto durante a sessão e impede outro envio até confirmar o
vínculo ou removê-lo com segurança. O inventário administrativo continua
classificando o objeto; ele não autoriza um expurgo automático.

### Conceder acesso ao Estudo

Em um Curso próprio, abra **Pessoas**, informe o e-mail exato de uma conta,
confira o valor na confirmação e conclua. A resposta genérica não confirma se o
endereço possui conta nem se a relação mudou. Quando a conta existe e a
concessão é válida, o destinatário passa a ver o Curso em Estudo, e a
propriedade permanece inalterada. Depois de dez tentativas em dez minutos, novas
solicitações daquela conta aguardam a próxima janela, com a mesma resposta.

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
no momento da exclusão. Depois que a limpeza física começa, uma falha pode
conservar a conta embora alguns PDFs ou a foto já tenham sido removidos. A
interface distingue esse estado, informa a remoção possível e reconhece que a
conta pode já ter sido excluída ou ainda aguardar a etapa final. Repetir a
operação idempotente confirma ou conclui o resultado; a tela não apresenta o
estado ambíguo como uma tentativa sem efeito.

Essa primeira recusa também conserva a sessão necessária para a própria API
terminar a limpeza do Storage. Na chamada final da versão 0.0.27, a transação
remove todas as sessões da conta imediatamente antes de remover o usuário do
Auth. As políticas de novos avatares e novos PDFs exigem `session_id` ainda
presente e não vencido. Essas escritas usam o mesmo bloqueio transacional da
exclusão: um envio concluído primeiro volta a ser encontrado pela verificação
de objetos, enquanto uma exclusão concluída primeiro invalida a sessão antes
que o envio possa prosseguir. Assim, um token residual não reabre a janela de
escrita autenticada. A URL assinada de upload v1 já emitida antes do corte é a
exceção transitória: ela não depende da sessão e precisa expirar por até duas
horas antes de a fronteira antiga ser declarada fechada.

Depois, a conta de autenticação, o perfil, os Cursos próprios, suas composições,
acessos e estados dependentes são removidos. Contribuições em Cursos alheios são
retiradas e redigidas imediatamente e seguem a janela de limpeza lógica de 14
dias. Uma cópia pessoal é Curso próprio e segue essa mesma exclusão. A réplica
local é limpa depois da resposta de sucesso. Essa resposta remota é terminal:
se outra aba bloquear a exclusão do IndexedDB, a conta continua excluída e a
interface oferece somente repetir a limpeza local. Ela não repete a exclusão
remota nem descreve esse caso como conta preservada.

A operação não oferece restauração automática. Registros técnicos, cópias de
segurança e retenções do provedor podem seguir prazos próprios, que a instituição
responsável deve declarar.

O envio de PDF da versão 0.0.27 não usa URL assinada: exige sessão viva e
intenção de dez minutos consumida na inserção. O download já assinado pode continuar legível
por até 60 segundos porque o Supabase não revoga uma URL individual antes da
expiração. A rotina administrativa inventaria, sem apagar, `avatar_owner_missing`,
`avatar_profile_unlinked`, `pdf_course_missing`, `pdf_unlinked` e
`pdf_object_missing`. Uma remoção posterior exige conferir vínculos, backups,
retenções e a classe do objeto; inventariar não autoriza exclusão automática.

Na compatibilidade mantida pela 0.0.27, o contrato v1 é emitido e aceito somente
para o download legado do Android 0.0.26. O contrato v2 fica reservado a `prepare_upload`
autenticado; como o cliente antigo espera uma URL assinada v1, seu upload falha
fechado. Essa compatibilidade não usa `User-Agent` e só pode ser retirada por
uma decisão explícita de encerrar o suporte ao 0.0.26.

## Roadmap de proteção desde a concepção

A proteção de dados possui duas frentes. A versão 0.0.27 corrige riscos
concretos no produto atual, como exportação, limpeza local, retenção e
fronteiras do MCP. Somente depois da baseline 2.0, uma revisão própria fixará as
fronteiras do eventual artefato versionado antes do ensaio Git. Essas medidas são proteção
desde a concepção e não constituem declaração de conformidade com LGPD ou RGPD.

## Decisões abertas e gates

Antes de uma implantação, a instituição precisa definir controlador,
operadores, finalidades, bases jurídicas, região, transferências, fornecedores,
retenção de logs e backups, canal de direitos e resposta a incidentes. Os
avisos correntes do Auth sobre proteção contra senhas vazadas e opções de MFA
precisam ser avaliados contra população, risco e operação real; habilitar todo
recurso disponível mecanicamente não substitui essa análise.

Pesquisa com monitoramento sistemático, grande escala, cruzamento extensivo,
perfilamento, decisão automatizada relevante, menores ou dados sensíveis deve
parar antes da coleta e exigir avaliação jurídica e ética sobre RIPD/AIPD,
protocolo, Comissão de Ética e Encarregado de Proteção de Dados. A infraestrutura
de Analytics do produto não autoriza silenciosamente esse uso.

Uma futura tabela que relacione participante e identidade real deve ficar
segregada, com pseudônimo diferente por protocolo, acesso restrito, retenção
própria e exclusão de Git, exports comuns e providers de IA. Enquanto essa
relação existir, `participant_id` continua sendo dado pessoal pseudonimizado.

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

## Fontes oficiais

O desenho técnico foi confrontado com a [LGPD
compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm),
as orientações da ANPD sobre [direitos dos
titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
e [tratamento acadêmico e
pesquisa](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-tratamento-de-dados-pessoais-para-fins-academicos-e-para-a-realizacao-de-estudos-e-pesquisas),
o [RGPD no EUR-Lex](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32016R0679)
e as [orientações do EDPB sobre proteção desde a
concepção](https://www.edpb.europa.eu/documents/guideline/guidelines-42019-on-article-25-data-protection-design-and-by-default_en).

Para pesquisa no contexto da Universidade de Lisboa, permanecem como fontes a
[Comissão de Ética do IE](https://www.ie.ulisboa.pt/comissao-de-etica), suas
[boas práticas de investigação](https://www.ie.ulisboa.pt/sites/default/files/documents/document/default/boas-praticas-investigacao-etica-no-ieulisboa-junho-2022.pdf)
e o [Encarregado de Proteção de Dados da
ULisboa](https://www.ulisboa.pt/info/regulamento-geral-de-protecao-de-dados).
Para os controles sobre Storage e sessão, consulte a documentação oficial do
Supabase sobre [controle de acesso do
Storage](https://supabase.com/docs/guides/storage/security/access-control),
[URLs assinadas](https://supabase.com/docs/guides/storage/serving/downloads) e
[sessões](https://supabase.com/docs/guides/auth/sessions).
