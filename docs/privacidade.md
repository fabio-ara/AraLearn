# Privacidade e tratamento de dados

Este documento descreve os dados usados pelo AraLearn, sua finalidade e as
regras técnicas de acesso. Uma instituição que implante o sistema precisa
acrescentar base jurídica, prazos de retenção, responsáveis, condições dos
provedores e canais de atendimento aplicáveis ao seu contexto.

Ele não declara conformidade com a LGPD ou com o RGPD. Os controles técnicos
descritos aqui integram o banco, as funções e os clientes correntes.

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
assistência por provedor, fatos operacionais e participação voluntária em
pesquisa são tratamentos diferentes.

## Conceitos essenciais

**Dado pessoal** é uma informação que identifica uma pessoa ou pode ser
relacionada a ela. No AraLearn, isso inclui e-mail da conta, identificador
interno, identificador público escolhido e foto de perfil.

**Proprietário do curso** é a pessoa autorizada a alterar o planejamento e o
conteúdo, consultar áreas autorais e conceder acesso a Estudo.

**Acesso ao Estudo** permite ler e praticar um curso público ou compartilhado.
Somente uma conta autenticada com acesso pode enviar observações. O estudante
não edita conteúdo e uma tentativa de edição não cria outro curso.

**Curso próprio** pertence a um único proprietário. Cópias existentes cuja
propriedade foi comprovada permanecem cursos independentes; sua origem útil é
preservada como metadado privado de recuperação.

**Estado pessoal de Estudo** reúne posição de retomada, Unidades concluídas e
marcas **Rever**. Ele pertence à pessoa e ao curso e fica separado do conteúdo.

**Anotação ancorada** registra uma Observação ligada a um alvo do curso. Cada
estudante lê somente as próprias; o proprietário recebe a caixa de entrada
necessária à triagem.

**Réplica local** é a cópia mantida no dispositivo para abertura rápida e uso
sem conexão. Uma alteração ainda não sincronizada pode existir somente nessa
cópia, que não substitui uma cópia de segurança.

O curso próprio é uma autoridade persistida no servidor; a réplica local é
apenas estado do dispositivo. Os termos não são intercambiáveis.

## Dados e finalidades

| Finalidade | Dados | Armazenamento |
|---|---|---|
| autenticar a conta | e-mail, credencial e sessão | Supabase Auth e sessão no dispositivo |
| apresentar a pessoa | identificador público escolhido e referência opcional da foto | PostgreSQL |
| exibir a foto | JPEG, PNG ou WebP de até 512 KiB | área privada `person-avatars` |
| manter um curso | proprietário, plano, configuração e composição corrente | PostgreSQL |
| documentar proveniência | Fonte, metadados, endereço, Âncoras, trecho de verificação e atribuições | PostgreSQL privado |
| anexar documentos de fonte | PDF, tamanho, resumo criptográfico e vínculo com a revisão | área privada `course-source-pdfs` e PostgreSQL |
| autorizar Estudo | Curso, conta com acesso, proprietário e data da concessão | PostgreSQL |
| retomar Estudo | posição, conclusões e marcas **Rever** | PostgreSQL e réplica local |
| registrar Observações | alvo, origem, texto, categoria, estado e resposta | PostgreSQL privado; cópia e fila no dispositivo |
| revisar e corrigir | Observações e conteúdo corrente das StudyUnits afetadas | PostgreSQL privado do proprietário |
| consultar Analytics | configuração, desenho aplicado e intervenções correntes agregadas | projeção PostgreSQL restrita ao proprietário |
| repetir uma alteração com segurança | revisão esperada, identificador do pedido e recibo temporário | PostgreSQL privado |

### Registro técnico das classes

Este registro descreve o padrão técnico publicado. O prazo institucional final
continua aberto quando indicado.

| Classe | Exemplos e finalidade | Pessoal ou sensível? | Local e acesso | Retenção e gatilho | Exportação e pesquisa |
| --- | --- | --- | --- | --- | --- |
| conta e sessão | UUID, e-mail, credenciais e tokens para autenticar e recuperar a conta | pessoal; tokens são segredos | Supabase Auth e projeção mínima no dispositivo; somente a própria sessão e a operação administrativa necessária | vida da conta e da sessão; revogar sessões antes da exclusão | não integra exportação comum nem dataset de pesquisa |
| perfil | identificador público único e avatar opcional para apresentação | pessoal; não é sensível por padrão | PostgreSQL e bucket privado; própria pessoa e relações autorizadas | até alteração ou exclusão; política de cópias de segurança ainda institucional | pode aparecer apenas em superfícies autorizadas, não em MCP nem Actions |
| Curso e autoria | conteúdo, plano, configuração corrente e recibos temporários | pode conter dado pessoal em texto livre; UUIDs ligados à conta continuam pessoais ou pseudonimizados | PostgreSQL; proprietário e projeções permitidas | artefato enquanto necessário; recibos expiram pelo prazo técnico | exportações operacionais não são automaticamente anônimas nem autorizam pesquisa |
| acesso direto | Curso, ator, pessoa favorecida, concessão e revogação | pessoal/pseudonimizado | PostgreSQL; proprietário e favorecido conforme a relação | até revogação, exclusão ou política institucional; contadores de tentativa, 30 dias | e-mail não entra em recibo, contador, MCP ou Actions |
| estado pessoal | posição, progresso e marcas **Rever** para continuar o Estudo | pessoal/pseudonimizado | PostgreSQL e IndexedDB segregado por conta; somente a pessoa | estado funcional até exclusão; recibos expiram em 7 dias | fora de exportações comuns e de pesquisa por padrão |
| Observações | texto, alvo, revisão, resposta, estado e horários para manifestação e triagem | pessoal/pseudonimizado; texto livre pode conter categorias sensíveis | PostgreSQL e IndexedDB; autor e proprietário nos limites do contrato | ativas não expiram só pela idade; retirada redige de imediato e linha/recibo são removíveis após 14 dias | exportação v2 é privada, pessoal ou pseudonimizada; uso em pesquisa exige protocolo |
| Analytics da Autoria | escopo, configuração aplicada e contagens de desenho e intervenção corrente | pode permanecer pessoal ou pseudonimizado por estar ligado a um curso próprio | derivado do PostgreSQL; proprietário do curso | acompanha o estado corrente; não cria retenção própria | snapshot JSON não mede aprendizagem nem constitui dataset anônimo |
| PDFs e avatares | documentos de fonte e imagens de perfil | podem conter dados pessoais, confidenciais ou sensíveis | Storage privado e vínculos no PostgreSQL | vínculo ativo e política da classe; órfãos são inventariados, não apagados automaticamente | PDFs não entram nas exportações correntes nem são enviados ao provedor por padrão |
| assistência por provedor | pedido, texto editável selecionado, título, papel, tópicos e até oito turnos para produzir uma sugestão focal | texto pode conter dado pessoal mesmo sem identificador dedicado | memória local e provedor escolhido pela pessoa; não integra banco nem IndexedDB | memória até fechar/recarregar/sair; retenção externa depende do provedor | não é dataset de pesquisa; envio exige aviso por chamada |
| pesquisa | protocolo, pseudônimo específico, medidas e eventual tabela de reidentificação | pessoal pseudonimizado enquanto reidentificável; pode tornar-se sensível conforme a pergunta | plano de dados segregado e acesso definido pelo protocolo, ainda não implantado como infraestrutura genérica | conforme protocolo, retirada e obrigação institucional | exportação somente nos termos do protocolo; resultados publicados exigem avaliação de reidentificação |
| registros e limpeza | contagens de tentativas, datas de expiração e contagens de remoção para segurança e ciclo de vida | ator é identificador pessoal da conta; horários e contagens permanecem correlacionáveis; nenhuma coluna de e-mail integra o contador de concessões | tabelas privadas e rotina administrativa | janela de concessão, 30 dias; demais prazos por classe | contagens operacionais não integram export comum nem autorizam pesquisa |

Nenhuma categoria sensível é coletada como requisito do produto. Se uma futura
pesquisa tratar saúde, religião, origem racial ou étnica, opinião política,
biometria ou outra categoria especialmente protegida, a implantação precisa
parar no gate jurídico e ético antes da coleta. O mesmo vale para pesquisa com
crianças e adolescentes.

## Conta, perfil e localização por identificador

Uma conta conserva seu UUID, propriedade e acessos. Antes da experiência
autenticada, a pessoa escolhe um identificador público único; o sistema não o
deriva do e-mail ou de nomes anteriores. Usa de 3 a 30 caracteres ASCII em
minúsculas, começa e termina com letra ou número e admite ponto, traço e
sublinhado no meio. Maiúsculas e um `@` inicial são normalizados. Uma colisão
solicita outra escolha sem perder a sessão. Alterar o identificador preserva o
UUID e suas relações. O avatar é opcional, sem segundo nome obrigatório.

Na migração, o identificador permanece vazio até essa escolha. Nomes anteriores
são preservados em registro privado de migração, sem consulta pelo aplicativo
nem uso como identidade pública. O cache do perfil escolhido pertence à própria
conta; só permite leitura offline e é invalidado diante de erro de acesso.

O proprietário pesquisa um prefixo de pelo menos dois caracteres dentro da
área de acesso de seu curso. A busca devolve no máximo dez identificadores e
avatares autorizados, sem e-mail. Selecionar uma pessoa e confirmar concede
estudo, sem escrita autoral. O servidor confere UUID e identificador juntos para
recusar uma seleção que mudou. Busca e concessão têm cotas separadas: sessenta
buscas e dez concessões por ator a cada dez minutos. Limitação produz aviso de
espera, nunca confirmação falsa de acesso. Repetir o mesmo pedido recupera seu
recibo antes de executar de novo.

O perfil e a lista de concessões usam projeções autorizadas. Pessoas com acesso
não recebem os perfis de colegas. A busca concede somente a apresentação mínima
necessária à seleção. Fotos permanecem no bucket privado; nessa busca recebem
URL assinada de sessenta segundos. Uma URL já emitida pode funcionar até expirar.
Não há tabela de perfis ou diretório completo acessível ao visitante.

## Propriedade, acesso público e recuperação

Todo curso nasce privado. O proprietário controla conteúdo, parâmetros, fontes,
observações recebidas e áreas autorais. Torná-lo público exige confirmação e uma
política explícita para arquivos. Visitantes recebem somente estrutura e conteúdo
de estudo permitidos; não recebem plano privado, notas de verificação,
observações, identidades de edição ou metadados de recuperação.

Sem conta, progresso e Rever ficam num banco local separado. Entrar numa conta
não transfere esses dados silenciosamente e não concede propriedade. Uma conta
com acesso pode observar; somente o proprietário edita. As mesmas fronteiras
valem para chamadas diretas, MCP e Actions.

O escritor de cópia automática foi retirado. A migração verifica a propriedade
antes de preservar a origem das cópias existentes; uma incompatibilidade impede
o corte. Rascunhos locais anteriores são preservados. A recuperação apenas lê
provas e recibos para identificar uma escrita já confirmada; nunca repete o
comando antigo. Sem prova suficiente, o rascunho permanece para inspeção e
somente um descarte explícito o remove.

Conceder, revogar e mudar a visibilidade exigem confirmação. Retirar uma concessão
individual não impede leitura de um curso que continua público. Tornar privado
bloqueia novo acesso conectado de visitantes e contas não favorecidas, mantendo
proprietário e concessões individuais. A validação conectada remove a réplica de
conteúdo cujo acesso se perdeu; o estado pessoal remoto pode ser retomado se o
acesso voltar. Cursos próprios independentes permanecem com seus proprietários.

Conteúdo e arquivos já entregues podem permanecer no dispositivo desconectado.
Revogação e mudança de visibilidade não recolhem retroativamente esses bytes.

## Fontes, Âncoras e PDFs

Somente o proprietário acessa catálogo, fontes ocultas, referências
pendentes de comprovação, trecho privado de verificação e controles de
edição. Estudo solicita a proveniência de uma Unidade quando a pessoa abre
**Fontes** e recebe apenas a projeção autorizada:

- **Não mostrar no Estudo** omite a fonte;
- **Mostrar citação** apresenta identificação e localização sem endereço;
- **Mostrar citação e link** também pode apresentar o endereço;
- trecho privado, identidade de quem alterou e controles autorais permanecem
  ausentes; anexos aparecem somente quando a política de acesso permite.

Os PDFs usam caminhos formados pela identidade do curso e pelo resumo
criptográfico do conteúdo. Arquivos idênticos dentro do mesmo curso compartilham
os bytes, enquanto os vínculos apontam à fonte corrente. Antes de
registrar o vínculo, a API lê o objeto privado com a credencial do servidor e
confere o tamanho, o cabeçalho `%PDF-` e o SHA-256 dos bytes recebidos. Arquivos
vinculados permanecem imutáveis. Cada arquivo aceita até 20 MiB, cada fonte
até oito anexos e o curso até 64 MiB de conteúdo único.

O preparo de envio cria uma intenção privada e curta para pessoa, curso,
caminho, tamanho, tipo e fonte exatos. A Edge Function envia os bytes pela
Storage API com credencial de servidor, relê o objeto e só então confirma o
vínculo. A URL transitória recebida do ChatGPT não é persistida. Uma URL de
download já emitida permanece independente da sessão somente até expirar.

O resumo criptográfico e o cabeçalho só podem ser confirmados depois que os
bytes chegam. Se um objeto de mesmo tamanho e tipo não corresponder ao PDF
preparado, a API recusa o vínculo. O objeto permanece sem uso e aparece no
inventário administrativo de órfãos; esse inventário não autoriza apagamento
automático.

A política efetiva de arquivos prioriza a exceção do PDF, depois a da fonte e
por fim a do curso. Fonte e arquivo podem herdar, restringir ou disponibilizar;
o curso começa com arquivos restritos. O bucket continua privado. Cada novo
download confere a autorização e o vínculo vigente antes de assinar, sem expor
caminho do Storage na projeção de estudo.

O download continua usando uma URL assinada válida por 60 segundos. Uma URL já
emitida não pode ser revogada individualmente e pode continuar funcionando até
o fim dessa janela. Ela não deve ser persistida nem usada como identidade do
arquivo.

A exportação de proveniência contém o alvo, as relações, as versões correntes, as
Âncoras e metadados dos anexos. Ela omite identificadores pessoais de quem
realizou as operações. Depois de baixado, o arquivo passa a depender também dos
cuidados adotados fora do AraLearn.

Uma nota, contestação ou solicitação de reformulação pode apontar para a fonte
ou para uma Âncora. Esses registros seguem o mesmo controle privado das demais
Anotações ancoradas. Quando a autoria responde com uma reformulação, o PDF e seu
conteúdo não são copiados para a Anotação. A exportação dessas Observações
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
Anotações do curso para triagem. A interface autoral identifica a contribuição
estudantil por um rótulo protegido, como “Estudante 7A3F”, sem apresentar o
identificador interno da conta ou o e-mail.

Enquanto uma Anotação está aberta, considerada ou resolvida, o servidor conserva
o texto corrente, a síntese e a resposta necessários à função. Eventos de
revisão guardam resumos criptográficos e metadados limitados, em vez de versões
anteriores do texto integral.

Retirar uma Anotação redige imediatamente texto, síntese e resposta e mantém um
registro de exclusão. Esse registro e o recibo de repetição expiram logicamente
em até 14 dias. Os lotes oportunistas são complementados por uma
rotina privada diária, às 03:17, para que um curso inativo não seja a única
causa de atraso físico. Cada execução processa até 512 linhas por classe e
devolve contagens separadas de Anotações retiradas, recibos de Anotação,
recibos de mudança de curso, recibos de estado pessoal, intenções de PDF e
janelas de concessão. O limite pode ser ajustado entre 1 e 1.000 e a repetição
sem itens vencidos produz contagens zero.

Os prazos correntes são 14 dias para a linha redigida e para recibos de
Anotação e de mudança de curso, sete dias para recibos de estado pessoal, dez
minutos para intenção de upload e 30 dias para a janela agregada de concessão.
Esses prazos técnicos não decidem a retenção institucional de logs, backups,
conteúdo, autoria ou pesquisa.

Anotações ativas ou resolvidas não expiram apenas pela idade. A instituição
responsável precisa definir a retenção operacional. O AraLearn não cria uma
cópia de pesquisa por padrão; qualquer reutilização exige finalidade,
minimização, governança e autorização adequadas.

## Revisão e Analytics

Somente o proprietário consulta a caixa autoral e aplica correções ao curso.
Uma revisão lê Observações abertas e o conteúdo corrente das StudyUnits
afetadas. Não persiste cópia anterior e proposta apenas para formar uma história
de auditoria.

Analytics deriva configuração, desenho aplicado e intervenções que o estado
corrente permite atribuir. O snapshot não contém texto de Observação, e-mail,
conversa, cliques ou tempo de permanência. Retirar nomes não torna o arquivo
automaticamente anônimo: curso, conteúdo e combinação de valores ainda podem
permitir associação à pessoa autora.

**Exportar Analytics** salva os mesmos números da tela. O arquivo não é plano de
dados de participantes nem autoriza uso em pesquisa. Essa finalidade exige
protocolo, minimização, acesso, retenção e avaliação de reidentificação próprios.

## Integrações conversacionais

Um protocolo aberto conecta assistentes às ferramentas de Autoria: o **Model
Context Protocol (MCP)**. Essa integração recebe apenas cursos próprios da
pessoa autenticada. Cursos
compartilhados para Estudo não aparecem nas listagens ou leituras autorais. As
mesmas regras de propriedade, revisão e confirmação usadas pela interface são
aplicadas pelo servidor.

O catálogo MCP público possui dezessete tarefas humanas, compartilhadas com
Actions.
Perfil,
avatar, lista de Pessoas, concessão e revogação permanecem operações exclusivas
da aplicação autenticada; e-mail e referência protegida não integram ferramenta
ou erro público do MCP.

Um GPT personalizado pode chamar as mesmas dezessete tarefas por Actions e
OpenAPI. Esse canal recebe uma credencial de acesso opaca, que identifica a
autorização sem expor seu conteúdo ao cliente, e uma credencial de renovação
rotativa. O servidor guarda somente resumos criptográficos dessas credenciais e
resolve a conta a cada chamada. Os nomes técnicos dessas peças são *access token*
e *refresh token*. O cliente confidencial ligado ao GPT pede os escopos
`openid email`. Credencial, cliente e consentimento de Actions não funcionam no
MCP, e a credencial do MCP não funciona em Actions.

O MCP possui seu próprio fluxo OAuth e anuncia somente o escopo
`offline_access`. O código de autorização e o *refresh token* não produzem
`id_token`. Sua credencial de acesso é um JWT que usa identificadores substitutos
pareados e distintos para pessoa e sessão, sem UUID da pessoa, e-mail ou perfil,
e não funciona como sessão do aplicativo. Ela conserva
`aralearn_session_id`, o UUID real da sessão de origem necessário à chamada
interna ao banco. Esse identificador permite correlação; por isso, a credencial
inteira continua sendo pessoal ou pseudonimizada, não anônima.

Antes de aceitar a chamada, a Edge Function obtém no serviço de autenticação o
conjunto público de chaves, chamado JWKS, e valida a assinatura ES256 produzida
com uma chave de curva elíptica P-256. Depois, uma função de banco exclusiva do
papel de serviço resolve a pessoa e confirma que sessão de origem, cliente e
consentimento continuam ativos. A mesma credencial é recusada quando alguém
tenta usá-la diretamente no serviço de autenticação (GoTrue), na API de dados
ou no Storage.

Consentimentos e sessões OAuth do MCP encerrados não renovam acesso. Um token
já emitido permanece criptograficamente válido somente até `exp`.

As tarefas de Observações consultam apenas o escopo autorizado necessário à
revisão. Texto, alvo e contexto podem conter dados pessoais; o GPT deve receber
somente o recorte pedido e não reproduzi-lo numa resposta de coordenação.

Fontes preservam as referências necessárias à autoria, mas não expõem ator,
caminho do Storage ou credencial administrativa. A incorporação de PDF aceita o
arquivo temporário entregue pelo transporte, valida origem e bytes no servidor e
grava o objeto em bucket privado. Para abrir um anexo, o serviço autoriza o alvo
e emite uma URL assinada de curta duração. Metadados livres da fonte, como título,
autoria declarada, citação, endereço, identificador, edição e trecho de
verificação, podem conter dados pessoais e exigem minimização. O painel de
fontes do Estudo mostra somente os metadados e a localização permitidos pela
visibilidade escolhida. Em Actions, o destinatário é o GPT conectado; no MCP, é
o cliente MCP conectado.

Na Assistência por IA, o pedido sai do dispositivo diretamente para OpenAI,
Gemini ou DeepSeek, conforme a escolha da pessoa. A chave efêmera segue somente
no cabeçalho da chamada e permanece em memória durante a sessão. O aviso
anterior à chamada enumera o conteúdo: pedido, conteúdo selecionado, restante
do objeto corrente como contexto, resumo curricular do curso e mensagens
anteriores daquela conversa. O envelope usa identificadores internos dos
objetos necessários para manter o recorte e a ordem. PDFs, fontes e dados da
conta não são enviados.

O envelope é montado por lista fechada, e campos extras presentes na Unidade
não são serializados. Erros públicos do provedor preservam código e orientação
úteis, mas não refletem segredo, e-mail, cabeçalho de autorização ou corpo bruto.
As Edge Functions não registram corpo, cabeçalhos ou exceções brutas no console;
workflows também recusam rastreamento e impressão direta de credenciais. O texto
editável escolhido ainda pode conter dado pessoal por decisão da pessoa, razão
pela qual o aviso e a revisão por chamada continuam necessários.

O aviso também informa que esses valores permanecem apenas na memória efêmera do
AraLearn, mas podem ser enviados e retidos pelo provider conforme
os termos do serviço escolhido. A autorização ocorre por chamada, depois de a
pessoa conferir o conteúdo enumerado.

O navegador não protege chaves duradouras. A interface orienta usar uma
credencial efêmera, fixa cada provider à sua origem oficial e envia a chave
apenas no cabeçalho. A credencial permanece em memória até sair, recarregar ou
encerrar a sessão; não entra no IndexedDB, no PostgreSQL, no Storage nem nos
artefatos. Esse percurso não oferece armazenamento de credencial duradoura.

Ao sair da conta, o aplicativo destrói a superfície ativa e cancela a chamada ao
provedor antes de apagar a sessão e fechar os armazenamentos locais. Uma resposta
tardia não pode executar callback, reabrir a sobreposição nem restaurar a
configuração ou a credencial em memória. O cenário integrado `SIGNED_OUT`
confirma aborto, ausência de callback tardio, remoção da sobreposição e da
credencial e nenhum erro de página.

Mesmo com esse recorte, o conteúdo enviado fica sujeito às regras do provider
efetivo. A pessoa deve evitar segredos e dados pessoais desnecessários,
delimitar a finalidade e revisar a proposta antes de incorporá-la
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Dados no dispositivo

O navegador e o aplicativo Android mantêm sessão autenticada, listas resumidas,
composições já abertas, estado pessoal, alterações pendentes, Anotações e
arquivos estáticos da interface.

A sessão persiste somente `access_token`, `refresh_token`,
tipo, expiração e `user.id`. E-mail, nome, identidades externas e o restante do
objeto retornado pelo Auth não são duplicados nesse registro; uma sessão legada
é reduzida na primeira leitura. Tokens continuam sendo segredos e não deixam de
ser dados pessoais por essa minimização.

O IndexedDB pode conter um rascunho de edição anterior ao corte da cópia
automática: curso e seleção de origem, versões esperadas, unidade final, origem
da edição e identidade do pedido. A recuperação apenas confronta esse recorte
com provas existentes; não repete o escritor retirado. O rascunho permanece até
o descarte explícito, inclusive quando há prova de resultado confirmado. Não
inclui conversa, endereço ou credencial do provedor.

Conteúdo, fontes, Observações e configuração do curso permanecem no servidor.
Limpar os dados do aplicativo pode apagar mudanças ainda não sincronizadas. Sair
encerra a sessão, mas não equivale a excluir todos os dados do dispositivo ou
do servidor.

O logout comum tenta sincronizar as filas e preserva, por decisão de produto,
cursos offline, estado pessoal e rascunhos já gravados no IndexedDB daquela
conta. Uma alteração ainda aberta somente na memória do editor será perdida; a
interface informa isso e pede confirmação antes de sair. **Remover dados deste
dispositivo** apaga somente o namespace da conta ativa e mantém a sessão;
**Sair e remover dados deste dispositivo** encerra a sessão e apaga esse mesmo
namespace. As duas ações alertam sobre progresso, Observações e edições ainda
pendentes. Dados de outra conta no mesmo perfil do navegador não são removidos.

## Operações controladas pela pessoa

### Alterar identificador ou foto

Em **Conta e aparência**, edite o identificador ou escolha uma imagem JPEG, PNG ou WebP
de até 512 KiB. Somente a própria pessoa envia ou remove objetos de sua pasta.
Se o upload terminar e a atualização do perfil não devolver confirmação, o
aplicativo relê o perfil antes de qualquer rollback. Uma referência já
confirmada preserva a foto; uma ausência confirmada permite remover o objeto sem
vínculo. Se a releitura ou a limpeza falhar, a tela informa a ambiguidade,
conserva a chave do objeto durante a sessão e impede outro envio até confirmar o
vínculo ou removê-lo com segurança. O inventário administrativo continua
classificando o objeto; ele não autoriza um expurgo automático.

### Conceder acesso ao Estudo

Em um curso próprio, abra **Pessoas e acesso**, pesquise o `@identificador`,
selecione a pessoa e confirme. A concessão confirmada aparece na lista; uma
limitação informa espera sem afirmar que concedeu acesso. A pessoa passa a ver
o curso em Estudo e pode observar; a propriedade permanece inalterada.

### Revogar acesso ao Estudo

Em **Pessoas**, escolha a conta e confirme a revogação. O servidor encerra a
autorização e preserva o estado pessoal para uma eventual nova concessão.

### Excluir a própria conta

A exclusão exige conexão, confirmação humana e a frase exata `EXCLUIR MINHA
CONTA`. Ela não é oferecida às ferramentas conversacionais.

O aplicativo envia uma única solicitação confirmada à API. A API autentica a
pessoa, deriva seus cursos e caminhos privados, remove os avatares e PDFs
correspondentes e só então solicita a exclusão relacional com a mesma sessão. O
banco recusa a operação enquanto algum objeto permanecer e confirma a ausência
no momento da exclusão. Depois que a limpeza física começa, uma falha pode
conservar a conta embora alguns PDFs ou a foto já tenham sido removidos. A
interface distingue esse estado, informa a remoção possível e reconhece que a
conta pode já ter sido excluída ou ainda aguardar a etapa final. Repetir a
operação idempotente confirma ou conclui o resultado; a tela não apresenta o
estado ambíguo como uma tentativa sem efeito.

Essa primeira recusa também conserva a sessão necessária para a própria API
terminar a limpeza do Storage. Na chamada final, a transação
remove todas as sessões da conta imediatamente antes de remover o usuário do
Auth. As políticas de novos avatares e novos PDFs exigem `session_id` ainda
presente e não vencido. Essas escritas usam o mesmo bloqueio transacional da
exclusão: um envio concluído primeiro volta a ser encontrado pela verificação
de objetos, enquanto uma exclusão concluída primeiro invalida a sessão antes
que o envio possa prosseguir. Assim, um token residual não reabre a janela de
escrita autenticada. Uma credencial temporária já emitida continua válida apenas
até seu prazo; o inventário permite confirmar a expiração.

Depois, a conta de autenticação, o perfil, os cursos próprios, suas composições,
acessos e estados dependentes são removidos. Contribuições em cursos alheios são
retiradas e redigidas imediatamente e seguem a janela de limpeza lógica de 14
dias. Um curso independente que veio de uma cópia é próprio e segue essa mesma exclusão. A réplica
local é limpa depois da resposta de sucesso. Essa resposta remota é terminal:
se outra aba bloquear a exclusão do IndexedDB, a conta continua excluída e a
interface oferece somente repetir a limpeza local. Ela não repete a exclusão
remota nem descreve esse caso como conta preservada.

A operação não oferece restauração automática. Registros técnicos, cópias de
segurança e retenções do provedor podem seguir prazos próprios, que a instituição
responsável deve declarar.

O envio de PDF é mediado pela Edge Function e usa uma intenção curta; o objeto
é escrito pela Storage API e conferido antes do vínculo. O download já assinado
pode continuar legível até expirar. A rotina administrativa inventaria, sem apagar, `avatar_owner_missing`,
`avatar_profile_unlinked`, `pdf_course_missing`, `pdf_unlinked` e
`pdf_object_missing`. Uma remoção posterior exige conferir vínculos, backups,
retenções e a classe do objeto; inventariar não autoriza exclusão automática.

## Proteção desde a concepção

Minimização, separação de finalidades, retenção limitada, limpeza local e
fronteiras de integração reduzem riscos concretos. Essas medidas não constituem
declaração de conformidade com LGPD ou RGPD.

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
própria e exclusão de Git, exportações comuns e provedores de IA. Enquanto essa
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

<!-- referências locais: início -->

## Referências

- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
