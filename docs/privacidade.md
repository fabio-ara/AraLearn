# Privacidade e tratamento de dados

O AraLearn usa dados de conta para autenticar a pessoa e controlar o acesso aos cursos.
Também mantém o material produzido, o estado necessário para retomar o estudo e as
observações enviadas. Proteger esses dados exige acompanhar três relações: qual é a
finalidade de cada informação, quem consegue recebê-la e quando ela deixa de ser
necessária.

A referência jurídica é a **Lei Geral de Proteção de Dados Pessoais (LGPD), no
Brasil**, e o **Regulamento Geral sobre a Proteção de Dados (RGPD), em Portugal**,
acompanhado da Lei portuguesa n.º 58/2019. O código fornece controles técnicos; a
conformidade jurídica depende também da implantação concreta, de quem decide as
finalidades e dos serviços efetivamente contratados.

Cada uso dos dados precisa de uma finalidade definida. Para retomar o estudo, por
exemplo, bastam a posição e as marcações da pessoa; registrar todos os seus toques
seria outra coleta, com finalidade e justificativa próprias. O princípio de
minimização orienta o uso apenas dos dados necessários. Controle de acesso e
informação compreensível sobre o tratamento completam essa relação
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## Conceitos essenciais

**Dado pessoal** é uma informação relacionada a uma pessoa identificada ou
identificável, conforme o art. 5º da LGPD e o art. 4º do RGPD. No AraLearn, isso inclui
e-mail da conta, identificador interno, identificador público escolhido e foto de
perfil.

**Pseudonimização** substitui a identificação direta, mas conserva a possibilidade
de associar os dados à pessoa. **Anonimização** exige que ela deixe de ser
identificável pelos meios considerados na legislação aplicável. Um comentário
assinado com um código pode continuar identificável pelo próprio texto.

**Proprietário do curso** é a pessoa autorizada a alterar o planejamento e o conteúdo,
consultar áreas autorais e conceder acesso a estudo.

**Acesso ao estudo** permite ler e praticar um curso público ou compartilhado. Somente
uma conta autenticada com acesso pode enviar observações. O estudante não edita conteúdo
e uma tentativa de edição não cria outro curso.

**Curso próprio** pertence a um único proprietário. Uma cópia autorizada cria outro
curso, com conteúdo independente e origem registrada. Alterar ou revogar o acesso ao
original não altera a propriedade da cópia. Cópias antigas cuja propriedade foi
comprovada também permanecem independentes, com dados privados de origem para
recuperação.

**Estado pessoal de estudo** reúne posição de retomada, unidades concluídas e marcas
**Rever**. Ele pertence à pessoa e ao curso e fica separado do conteúdo.

**Observação ancorada** é um comentário ligado a um ponto do curso, como uma unidade,
explicação ou fonte. Cada estudante lê somente as próprias; o proprietário recebe a
caixa de entrada necessária à triagem.

**Réplica local** é a cópia mantida no dispositivo para abertura rápida e uso sem
conexão. Uma alteração ainda não sincronizada pode existir somente nessa cópia, que não
substitui uma cópia de segurança.

A propriedade é conferida pelo servidor. Ter uma réplica no dispositivo não concede
permissão para editar o curso. A relação entre réplica, filas e servidor está descrita
em [persistência e sincronização](persistencia-relacional.md).

## Legislação e responsabilidades no Brasil e em Portugal

A [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
delimita seu alcance territorial no art. 3º. No uso acadêmico, o art. 4º, II, b, mantém
aplicáveis os arts. 7º e 11: apresentar o AraLearn como artefato de pesquisa não dispensa
a identificação de uma hipótese legal adequada, isto é, uma condição prevista na
lei que permita aquele tratamento. Dados especialmente protegidos, como informações
de saúde ou convicção religiosa, exigem avaliação específica.

O [RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pt) também define seu âmbito
territorial no art. 3º. Em Portugal, a [Lei n.º
58/2019](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982) assegura sua execução
na ordem jurídica nacional. A investigação está sujeita a salvaguardas, incluindo
minimização e, quando a finalidade permitir, anonimização ou pseudonimização (RGPD,
art. 89º; Lei n.º 58/2019, art. 31º). A finalidade científica não suspende por si só os
direitos das pessoas.

As duas leis atribuem responsabilidades conforme a atuação de cada parte, embora usem
nomes diferentes para funções próximas:

| Papel no tratamento | Brasil — LGPD, art. 5º | Portugal — RGPD, art. 4º |
| --- | --- | --- |
| decidir a finalidade e como tratar os dados | controlador | responsável pelo tratamento |
| tratar dados por conta de quem decide | operador | subcontratante |

Esses papéis dependem da atuação real de cada organização. Ser proprietário de um curso
na interface não torna automaticamente a pessoa responsável por todos os tratamentos da
implantação. A instituição, a equipe de pesquisa e os fornecedores precisam ter suas
responsabilidades identificadas. O encarregado de proteção de dados atua segundo o regime
aplicável; o aplicativo não designa uma pessoa para essa função.

A base jurídica precisa corresponder a cada finalidade. Manter uma conta, produzir
conteúdo com um serviço de IA e investigar a experiência de participantes são usos
distintos. Consentimento não é uma base universal, e a confirmação de uma operação na
tela não substitui as condições jurídicas para tratar os dados envolvidos.

## Dados e finalidades

Para reconhecer quem recebe cada dado, é preciso acompanhar seu percurso entre
dispositivo e servidor. O [Supabase](supabase.md) reúne o serviço de autenticação
(Auth), o banco relacional
PostgreSQL e o armazenamento de arquivos (Storage). O banco guarda registros e relações;
áreas de arquivos chamadas *buckets* guardam os bytes de PDFs, áudios e fotos. Os dados
necessários para estudar ficam também no IndexedDB, o armazenamento estruturado do
navegador.

Ao abrir um curso, o aplicativo confirma quem pode acessá-lo e recebe somente os
campos permitidos para aquela leitura. Essa seleção de campos é chamada de
projeção. Um visitante pode receber o texto de estudo e as citações visíveis, por
exemplo, enquanto notas privadas de verificação continuam restritas à autoria.

Quando a pessoa avança numa atividade, o aplicativo atualiza seu estado de estudo,
sem alterar o conteúdo do curso. Se ela registra uma observação, o comentário segue
outro percurso: fica ligado ao ponto observado e pode ser lido pelo proprietário
para revisão. Abrir um PDF ou áudio exige ainda verificar a permissão do arquivo,
mesmo que a pessoa já consiga ler o curso.

### Registro técnico das classes

O inventário distingue os acessos e os prazos de cada classe de dados. UUID é um
identificador interno; tokens são credenciais de acesso ou renovação da sessão. Ambos
podem continuar relacionados à pessoa mesmo sem seu nome. Texto livre também pode
conter informações pessoais ou sensíveis, qualquer que seja o nome da tabela onde
foi guardado.

Os prazos abaixo descrevem a limpeza executada pelo software. A instituição ainda
precisa definir a retenção de seus arquivos, registros de operação e cópias de
segurança.

| Classe | Exemplos e finalidade | Pessoal ou sensível? | Local e acesso | Retenção e gatilho | Exportação e pesquisa |
| --- | --- | --- | --- | --- | --- |
| conta e sessão | UUID, e-mail, credenciais e tokens para autenticar e recuperar a conta | pessoal; tokens são segredos | Supabase Auth e projeção mínima no dispositivo; somente a própria sessão e a operação administrativa necessária | vida da conta e da sessão; revogar sessões antes da exclusão | não integra exportação comum nem conjunto de dados de pesquisa |
| perfil | identificador público único e avatar opcional para apresentação | pessoal; não é sensível por padrão | PostgreSQL e bucket privado; própria pessoa e relações autorizadas | até alteração ou exclusão; política de cópias de segurança ainda institucional | identificadores aparecem nas tarefas autorizadas de acesso; avatar e edição de perfil permanecem na aplicação |
| curso e autoria | conteúdo, plano, configuração corrente e recibos temporários | pode conter dado pessoal em texto livre; UUIDs ligados à conta continuam pessoais ou pseudonimizados | PostgreSQL; proprietário e projeções permitidas | artefato enquanto necessário; recibos expiram pelo prazo técnico | exportações operacionais não são automaticamente anônimas nem autorizam pesquisa |
| acesso direto | curso, ator, pessoa favorecida, concessão e revogação | pessoal/pseudonimizado | PostgreSQL; proprietário e favorecido conforme a relação | até revogação, exclusão ou política institucional; contadores de tentativa, 30 dias | e-mail não entra em recibo, contador, MCP ou Actions |
| estado pessoal | posição, progresso e marcas **Rever** para continuar o estudo | pessoal/pseudonimizado | PostgreSQL e IndexedDB segregado por conta; somente a pessoa | estado funcional até exclusão; recibos expiram em 7 dias | fora de exportações comuns e de pesquisa por padrão |
| observações | texto, alvo, revisão, resposta, estado e horários para manifestação e triagem | pessoal/pseudonimizado; texto livre pode conter categorias sensíveis | PostgreSQL e IndexedDB; autor e proprietário nos limites do contrato | ativas não expiram só pela idade; retirada remove o texto de imediato e linha/recibo são removíveis após 14 dias | exportação v2 é privada, pessoal ou pseudonimizada; uso em pesquisa exige protocolo |
| análise de autoria | escopo, configuração aplicada e contagens de desenho e intervenção corrente | pode permanecer pessoal ou pseudonimizado por estar ligado a um curso próprio | derivado do PostgreSQL; proprietário do curso | acompanha o estado corrente; não cria retenção própria | retrato do estado salvo em JSON não mede aprendizagem nem constitui conjunto de dados anônimo |
| PDFs, áudios e avatares | documentos de fonte, gravações e imagens de perfil | podem conter dados pessoais, confidenciais ou sensíveis | Storage privado e vínculos no PostgreSQL | vínculo ativo e política da classe; órfãos são inventariados, não apagados automaticamente | exportações descrevem vínculos e metadados sem incluir os bytes; esses arquivos não são enviados ao provedor pela edição textual |
| assistência por provedor | pedido, alvo selecionado, contexto curricular, configuração aplicada e até oito mensagens anteriores para preparar uma proposta | texto pode conter dado pessoal mesmo sem identificador dedicado | memória local e provedor escolhido pela pessoa; não integra banco nem IndexedDB | memória até fechar/recarregar/sair; retenção externa depende do provedor | não é um conjunto de dados de pesquisa; cada envio parte da ação da pessoa |
| pesquisa | protocolo, pseudônimo específico, medidas e eventual tabela de reidentificação | pessoal pseudonimizado enquanto reidentificável; pode tornar-se sensível conforme a pergunta | plano de dados segregado e acesso definido pelo protocolo, ainda não implantado como infraestrutura genérica | conforme protocolo, retirada e obrigação institucional | exportação somente nos termos do protocolo; resultados publicados exigem avaliação de reidentificação |
| registros e limpeza | contagens de tentativas, datas de expiração e contagens de remoção para segurança e ciclo de vida | ator é identificador pessoal da conta; horários e contagens permanecem correlacionáveis; nenhuma coluna de e-mail integra o contador de concessões | tabelas privadas e rotina administrativa | janela de concessão, 30 dias; demais prazos por classe | contagens operacionais não integram exportação comum nem autorizam pesquisa |

O produto não exige categoria sensível para funcionar. Uma pesquisa que trate, por
exemplo, saúde, religião ou biometria precisa concluir a avaliação jurídica e ética
antes da coleta. A mesma avaliação específica se aplica a pesquisas com crianças e
adolescentes.

## Conta, perfil e localização por identificador

Uma conta conserva seu UUID, propriedade e acessos. Antes da experiência autenticada, a
pessoa escolhe um identificador público único; o sistema não o deriva do e-mail ou de
nomes anteriores. Usa de 3 a 30 caracteres ASCII em minúsculas, começa e termina com
letra ou número e admite ponto, traço e sublinhado no meio. Maiúsculas e um `@` inicial
são normalizados. Uma colisão solicita outra escolha sem perder a sessão. Alterar o
identificador preserva o UUID e suas relações. O avatar é opcional, sem segundo nome
obrigatório.

Nomes anteriores à adoção do identificador escolhido permanecem em registro privado de
migração, sem consulta pelo aplicativo nem uso como identidade pública. A cópia local do
perfil pertence à própria conta e permite leitura offline.

O proprietário pesquisa um prefixo de pelo menos dois caracteres dentro da área de
acesso de seu curso. A busca devolve no máximo dez identificadores e avatares
autorizados, sem e-mail. Selecionar uma pessoa e confirmar concede estudo, sem escrita
autoral. O servidor confere UUID e identificador juntos para recusar uma seleção que
mudou. Busca e concessão têm cotas separadas: sessenta buscas e dez concessões por ator
a cada dez minutos. Limitação produz aviso de espera, nunca confirmação falsa de acesso.
Repetir o mesmo pedido recupera seu recibo antes de executar de novo.

O perfil e a lista de concessões usam projeções autorizadas. Pessoas com acesso não
recebem os perfis de colegas. A busca concede somente a apresentação mínima necessária à
seleção. Fotos permanecem no bucket privado; nessa busca recebem URL assinada de
sessenta segundos. Uma URL já emitida pode funcionar até expirar. Não há tabela de
perfis ou diretório completo acessível ao visitante.

## Propriedade, acesso público e recuperação

Todo curso nasce privado. O proprietário controla conteúdo, parâmetros, fontes,
observações recebidas e áreas autorais. Torná-lo público exige confirmação e uma
política explícita para arquivos. Visitantes recebem somente estrutura e conteúdo de
estudo permitidos; não recebem plano privado, notas de verificação, observações,
identidades de edição ou metadados de recuperação.

Sem conta, progresso e Rever ficam num banco local separado. Entrar numa conta não
transfere esses dados silenciosamente e não concede propriedade. A pessoa pode examinar
e selecionar cursos em **Progresso sem conta**, identificando a conta destinatária antes
de confirmar. A incorporação acrescenta conclusões e Rever, mantém o estado anterior da
conta e conserva o banco de visitante. Um recibo local evita aplicar novamente a mesma
seleção; não é registro de percurso humano–IA. Uma conta com acesso pode registrar
observações; somente o proprietário edita. As mesmas fronteiras valem para chamadas
diretas, MCP e Actions.

Rascunhos locais de edições antigas podem permanecer no dispositivo até o descarte
explícito. A recuperação permite conferir se uma edição já foi salva e preserva o
rascunho quando o resultado não pode ser determinado. Seus limites estão em
[persistência e sincronização](persistencia-relacional.md).

A política de revisão escolhe entre disponibilizar o conteúdo salvo (`saved`) ou somente
o conteúdo revisado (`reviewed_only`). Essa escolha é independente da visibilidade do
curso e dos direitos de arquivo. A declaração de revisão registra a inspeção expressa da
pessoa autora de uma explicação ou unidade; correções e testes automáticos não a
substituem. O funcionamento está descrito em [Explicação e revisão
humana](explicacao-e-revisao-humana.md).

Conceder, revogar e mudar a visibilidade exigem confirmação. Retirar uma concessão
individual não impede leitura de um curso que continua público. Tornar privado bloqueia
novo acesso conectado de visitantes e contas não favorecidas, mantendo proprietário e
concessões individuais. A validação conectada remove a réplica de conteúdo cujo acesso
se perdeu; o estado pessoal remoto pode ser retomado se o acesso voltar. Cursos próprios
independentes permanecem com seus proprietários.

Conteúdo e arquivos já entregues podem permanecer no dispositivo desconectado. Revogação
e mudança de visibilidade não recolhem retroativamente esses bytes.

## Fontes, âncoras, PDFs e áudios

A [proveniência](fontes-e-citacoes.md) registra de onde vem o conteúdo e como ele se
relaciona a uma fonte. A âncora localiza o trecho ou ponto usado nessa relação. Somente
o proprietário acessa o catálogo autoral, fontes ocultas, referências pendentes de
comprovação, trecho privado de verificação e controles de edição. O estudo solicita a
proveniência de uma unidade quando a pessoa abre **Fontes** e recebe apenas a projeção
autorizada:

- **Não mostrar no Estudo** omite a fonte;
- **Mostrar citação** apresenta identificação e localização sem endereço;
- **Mostrar citação e link** também pode apresentar o endereço;
- trecho privado, identidade de quem alterou e controles autorais permanecem
  ausentes; anexos aparecem somente quando a política de acesso permite.

O servidor confere o formato, o tamanho e a integridade de cada PDF antes de vinculá-lo
à fonte. Arquivos vinculados não são sobrescritos; referências diferentes podem
compartilhar o mesmo arquivo. Cada arquivo aceita até 20 MiB, cada fonte até oito anexos
e o curso até 64 MiB de conteúdo único, somando PDFs e áudios. O endereço temporário
usado para receber o arquivo de uma integração não é persistido.

Um envio sem vínculo confirmado pode deixar um arquivo sem uso no armazenamento privado.
O inventário administrativo permite examinar esses casos antes de qualquer remoção. O
[guia de Supabase](supabase.md) descreve as verificações e a recuperação operacional.

A política efetiva de arquivos prioriza a exceção do PDF, depois a da fonte e por fim a
do curso. Fonte e arquivo podem herdar, restringir ou disponibilizar; o curso começa com
arquivos restritos. O bucket continua privado. Cada novo download confere a autorização
e o vínculo vigente antes de assinar, sem expor caminho do Storage na projeção de
estudo.

O download usa um endereço com autorização temporária, chamado URL assinada. Esse
endereço vale por 60 segundos. Uma URL já emitida não pode ser revogada individualmente
e pode continuar funcionando até o fim dessa janela. Ela não deve ser persistida nem
usada como identidade do arquivo.

A exportação de proveniência contém o alvo, as relações, as versões correntes, as
âncoras e metadados dos anexos. Ela omite identificadores pessoais de quem realizou as
operações. Depois de baixado, o arquivo passa a depender também dos cuidados adotados
fora do AraLearn.

Uma nota, contestação ou solicitação de reformulação pode apontar para a fonte ou para
uma âncora. Esses registros seguem o mesmo controle privado das demais anotações
ancoradas. Quando a autoria responde com uma reformulação, o PDF e seu conteúdo não são
copiados para a anotação. A exportação dessas observações conserva texto, alvo, versões,
vínculos, identificadores operacionais e horários necessários ao uso privado. Ela remove
`contributor.ref`, o rótulo protegido da pessoa, os caminhos observado e corrente, links
profundos e capacidades da interface. O próprio arquivo e a interface informam que o
conteúdo continua pessoal ou pseudonimizado e não é um conjunto anônimo de pesquisa.

### Áudio e envio de texto para síntese de voz

Áudios WAV PCM e MP3 ficam no bucket privado `course-media`, com até 20 MiB por arquivo
e dentro da cota conjunta de 64 MiB de PDFs e áudios por curso. O serviço confere o
formato e os bytes antes de registrar o vínculo. A abertura exige nova autorização;
metadados locais não tornam os bytes disponíveis sem conexão.

O painel **Áudio** também permite gerar voz pelo Gemini. A pessoa fornece o texto e a
chave da sessão e confirma o envio e o uso da cota ou cobrança. O resultado ainda
precisa ser guardado no curso. A voz do navegador segue outro percurso: vozes remotas
são uma escolha separada e podem enviar o texto ao serviço de voz do dispositivo. As
condições e os controles estão no [guia de autoria](guia-professor-autor.md).

## Estado pessoal e limites dos registros de uso

O estado pessoal responde a perguntas funcionais: onde continuar, quais unidades já
foram avançadas e quais foram marcadas para rever. Ele não registra automaticamente
tempo de permanência, cada toque, cada envio ou respostas anteriores.

A fila **Rever** é montada no servidor a partir das marcas da própria pessoa e chega ao
dispositivo em páginas. Atividade de outros estudantes não altera a versão privada desse
estado nem aparece como conflito entre abas.

Esses registros não equivalem a atenção, esforço, compreensão ou aprendizagem. O [Estado
de estudo não punitivo](estado-de-estudo-nao-punitivo.md) desenvolve os limites de
interpretação.

## Observações e identidade protegida

Cada estudante lê somente as próprias anotações. O proprietário lê as anotações do curso
para triagem. A interface autoral identifica a contribuição estudantil por um rótulo
protegido, como “Estudante 7A3F”, sem apresentar o identificador interno da conta ou o
e-mail.

Enquanto uma anotação está aberta, considerada ou resolvida, o servidor conserva o texto
corrente, a síntese e a resposta necessários à função. Eventos de revisão guardam
resumos criptográficos e metadados limitados, em vez de versões anteriores do texto
integral.

Retirar uma observação apaga imediatamente seu texto, síntese e resposta, mantendo um
registro de exclusão. Esse registro e o recibo que evita repetir a mesma operação
expiram logicamente em até 14 dias. A limpeza física ocorre em lotes, inclusive por uma
rotina diária, para alcançar registros de cursos que deixaram de ser usados. A operação
está descrita no [guia de Supabase](supabase.md).

Os prazos correntes são 14 dias para a linha com o texto removido e para recibos de
anotação e de mudança de curso, sete dias para recibos de estado pessoal, dez minutos
para intenção de upload e 30 dias para a janela agregada de concessão. Esses prazos
técnicos não decidem a retenção institucional de logs, backups, conteúdo, autoria ou
pesquisa.

Anotações ativas ou resolvidas não expiram apenas pela idade. A instituição responsável
precisa definir a retenção operacional. O AraLearn não cria uma cópia de pesquisa por
padrão; qualquer reutilização exige finalidade, minimização, governança e autorização
adequadas.

## Revisão e análise de autoria

Somente o proprietário consulta a caixa autoral e aplica correções ao curso. A
preparação da revisão lê observações abertas e o conteúdo corrente das explicações e
unidades de estudo afetadas. Não persiste cópia anterior e proposta apenas para formar
uma história de auditoria.

A [análise de autoria](analytics-instrucionais.md) deriva indicadores da configuração,
do desenho aplicado e das intervenções que o estado corrente permite atribuir. Em
**Dados de autoria**, a ação **Exportar curso e análise** reúne o conteúdo integral do
curso, o inventário de fontes e arquivos, os parâmetros, as declarações de revisão e as
contagens. Os bytes dos anexos, o estado pessoal de estudo e os textos de observações
ficam fora desse arquivo.

O conteúdo e os metadados escritos livremente podem conter dados pessoais, mesmo sem
e-mail ou nome em um campo de conta. Curso e combinação de valores também podem permitir
associação à pessoa autora. A exportação é um retrato autoral que precisa ser examinado
antes de compartilhamento; não é automaticamente anônima nem constitui autorização para
uso em pesquisa.

## Integrações conversacionais

O **Model Context Protocol (MCP)** conecta um cliente externo de assistência às
ferramentas de autoria. A pessoa escolhe e autoriza esse cliente. As leituras autorais
alcançam seus próprios cursos; uma consulta específica também pode localizar os
metadados de um curso que recebeu permissão explícita para copiar. A cópia resultante é
outro curso, e a autoria do original permanece com seu proprietário. O servidor aplica
as mesmas regras de propriedade, revisão e confirmação usadas pela interface.

O [catálogo MCP](autoria-mcp.md) define tarefas também oferecidas pela [integração
Actions/OpenAPI](autoria-actions.md). O proprietário pode consultar identificadores das
pessoas com acesso e conceder ou revogar acesso a um identificador exato, com
confirmação expressa. Ao conceder, escolhe também se a pessoa poderá copiar o curso.
E-mail, avatar e identificadores internos das contas não integram essa resposta. A
edição do perfil e a exclusão da conta permanecem na aplicação autenticada.

Um GPT personalizado pode chamar as mesmas tarefas por Actions e OpenAPI. Esse canal
recebe uma credencial de acesso opaca, que identifica a autorização sem expor seu
conteúdo ao cliente, e uma credencial de renovação rotativa. O servidor guarda somente
resumos criptográficos dessas credenciais e resolve a conta a cada chamada. Os nomes
técnicos dessas peças são *access token* e *refresh token*. O cliente confidencial
ligado ao GPT pede os escopos `openid email`. Credencial, cliente e consentimento de
Actions não funcionam no MCP, e a credencial do MCP não funciona em Actions.

OAuth autoriza o cliente a operar em nome da conta sem lhe entregar a senha. O MCP
possui seu próprio fluxo OAuth e anuncia somente o escopo `offline_access`. O código de
autorização e o *refresh token* não produzem `id_token`. Sua credencial de acesso é um
JWT, credencial assinada com campos verificáveis, que usa identificadores substitutos
pareados e distintos para pessoa e sessão, sem UUID da pessoa, e-mail ou perfil, e não
funciona como sessão do aplicativo. Ela conserva `aralearn_session_id`, o UUID real da
sessão de origem necessário à chamada interna ao banco. Esse identificador permite
correlação; por isso, a credencial inteira continua sendo pessoal ou pseudonimizada, não
anônima.

Antes de aceitar a chamada, o servidor valida a credencial e confirma que a sessão de
origem, o cliente e a autorização continuam ativos. A credencial da integração não
permite acesso direto ao banco ou aos arquivos. O [guia de Supabase](supabase.md)
detalha essa separação e as validações de identidade.

Consentimentos e sessões OAuth do MCP encerrados não renovam acesso. Um token já emitido
permanece criptograficamente válido somente até a data de expiração, registrada no campo
`exp`.

As tarefas de observações consultam apenas o escopo autorizado necessário à revisão.
Texto, alvo e contexto podem conter dados pessoais; o assistente deve receber somente o
recorte pedido e evitar repeti-lo quando não for necessário à tarefa.

Fontes preservam as referências necessárias à autoria, mas não expõem ator, caminho do
Storage ou credencial administrativa. A incorporação de PDF aceita o arquivo temporário
entregue pelo transporte, valida origem e bytes no servidor e grava o objeto em bucket
privado. Para abrir um anexo, o serviço autoriza o alvo e emite uma URL assinada de
curta duração. Campos livres da fonte, como título, autoria declarada e trecho de
verificação, também podem conter dados pessoais e exigem minimização. O painel de
fontes do estudo mostra somente os metadados e a
localização permitidos pela visibilidade escolhida. Em Actions, o destinatário é o GPT
conectado; no MCP, é o cliente MCP conectado.

Na [edição com IA](assistencia-por-ia.md), a pessoa escolhe OpenAI, Gemini ou DeepSeek.
Ao enviar uma mensagem, o dispositivo remete ao provedor a seleção editada, o restante
do alvo como contexto, a configuração aplicada, um resumo curricular e até oito
mensagens anteriores. Identificadores internos mantêm o recorte e a ordem dos objetos.
A interface inicia a chamada nessa própria ação de envio, sem apresentar outra tela
com a íntegra do pedido. A configuração associa cada provedor somente à sua origem
oficial.

O pedido é montado a partir do alvo e do contexto curricular selecionados. O acervo de
fontes, os anexos e o perfil da conta não são consultados para compô-lo. A chave do
provedor segue no cabeçalho da requisição e permanece somente na memória da sessão; não
entra no IndexedDB, no PostgreSQL, no Storage ou nos artefatos gerados. Sair, recarregar
ou encerrar a sessão descarta a chave e a conversa local.

Erros apresentados pelo AraLearn conservam o código e a orientação úteis sem repetir
segredo, e-mail, cabeçalho de autorização ou corpo bruto. As Edge Functions não
registram corpo, cabeçalhos ou exceções brutas no console; os fluxos de automação
recusam rastreamento e impressão direta de credenciais. Ainda assim, o texto selecionado
pode conter informações pessoais, e o provedor pode conservar o que já recebeu segundo
seus próprios termos. Ao sair da conta, o aplicativo também cancela a chamada em
curso. Esse cancelamento não recolhe uma solicitação que o provedor já tenha recebido.

Antes do envio, a pessoa precisa conferir o recorte, retirar segredos e dados pessoais
desnecessários e delimitar a finalidade. A proposta recebida também deve ser revisada
antes de entrar no curso ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Dados no dispositivo

O dispositivo conserva o necessário para manter a sessão e continuar o trabalho já
iniciado. Isso inclui a composição de cursos abertos, o estado pessoal e alterações
pendentes, além dos arquivos estáticos da interface.

A sessão persiste somente `access_token`, `refresh_token`, tipo, expiração e `user.id`.
E-mail, nome, identidades externas e o restante do objeto retornado pelo Auth não são
duplicados nesse registro; uma sessão legada é reduzida na primeira leitura. Tokens
continuam sendo segredos e não deixam de ser dados pessoais por essa minimização.

O IndexedDB pode conservar rascunhos de edições antigas, com conteúdo e referências
necessários à recuperação. Eles permanecem até o descarte explícito e não incluem a
conversa ou a credencial do provedor.

Conteúdo, fontes, observações e configuração do curso permanecem no servidor. Limpar os
dados do aplicativo pode apagar mudanças ainda não sincronizadas. Sair encerra a sessão,
mas não equivale a excluir todos os dados do dispositivo ou do servidor.

O logout comum respeita o modo de sincronização e preserva, por decisão de produto,
cursos offline, estado pessoal e rascunhos já gravados no IndexedDB daquela conta. Uma
alteração ainda aberta somente na memória do editor será perdida; a interface informa
isso e pede confirmação antes de sair. **Remover dados deste dispositivo** apaga somente
o conjunto de dados locais da conta ativa e mantém a sessão; **Sair e remover dados
deste dispositivo** encerra a sessão e apaga esse mesmo conjunto. As duas ações alertam
sobre progresso, observações e edições ainda pendentes. Dados de outra conta no mesmo
perfil do navegador não são removidos.

## Operações controladas pela pessoa

### Alterar identificador ou foto

Em **Configurações → Conta**, edite o identificador ou escolha uma imagem JPEG, PNG ou
WebP de até 512 KiB. Somente a própria pessoa envia ou remove objetos de sua pasta.
Ao substituir a foto, o aplicativo registra a nova referência antes de remover o
arquivo anterior. Uma falha nessa remoção é informada para recuperação. Se o
upload terminar e a atualização do perfil não devolver confirmação, o aplicativo relê o
perfil antes de tentar desfazer o envio. Uma referência já confirmada preserva a foto;
uma ausência confirmada permite remover o objeto sem vínculo. Se a releitura ou a
limpeza falhar, a tela informa a ambiguidade, conserva a chave do objeto durante a
sessão e impede outro envio até confirmar o vínculo ou removê-lo com segurança. O
inventário administrativo continua classificando o objeto; ele não autoriza um expurgo
automático.

### Conceder acesso ao estudo

Em um curso próprio, abra **Pessoas e acesso**, pesquise o `@identificador`, selecione a
pessoa e confirme. A concessão confirmada aparece na lista; uma limitação informa espera
sem afirmar que concedeu acesso. A pessoa passa a ver o curso em estudo e pode registrar
observações. Se a concessão incluir permissão de cópia, pode criar um curso próprio
independente; a propriedade do original permanece inalterada.

### Revogar acesso ao estudo

Em **Pessoas e acesso**, escolha a conta e confirme a revogação. O servidor encerra a
autorização e preserva o estado pessoal para uma eventual nova concessão.

### Excluir a própria conta

A exclusão exige conexão, confirmação humana e a frase exata `EXCLUIR MINHA CONTA`. Ela
não é oferecida às ferramentas conversacionais.

O aplicativo envia uma única solicitação confirmada à API. A API, interface pela qual o
aplicativo solicita operações ao servidor, autentica a pessoa, identifica seus cursos e
arquivos privados, remove os cursos próprios e seus PDFs e áudios, além dos avatares, e
conclui a exclusão da conta com a mesma sessão. O banco recusa a operação enquanto algum
objeto permanecer e confirma a ausência no momento da exclusão. Depois que a limpeza
física começa, uma falha pode conservar a conta embora alguns cursos, PDFs, áudios ou a
foto já tenham sido removidos. A interface distingue esse estado, informa a remoção
possível e reconhece que a conta pode já ter sido excluída ou ainda aguardar a etapa
final. Repetir a mesma operação confirma ou conclui o resultado; a tela não apresenta o
estado ambíguo como uma tentativa sem efeito.

Na etapa final, o servidor encerra as sessões antes de remover a conta e impede que uma
credencial remanescente volte a enviar arquivos. Endereços de download já autorizados
podem continuar funcionando até seu prazo de expiração.

Depois, a conta de autenticação, o perfil, os cursos próprios, suas composições, acessos
e estados dependentes são removidos. Contribuições em cursos alheios são retiradas, têm
seu texto removido imediatamente e seguem a janela de limpeza lógica de 14 dias. Um
curso independente que veio de uma cópia é próprio e segue essa mesma exclusão. A
réplica local é limpa depois da resposta de sucesso. Essa resposta remota é terminal: se
outra aba bloquear a exclusão do IndexedDB, a conta continua excluída e a interface
oferece somente repetir a limpeza local. Ela não repete a exclusão remota nem descreve
esse caso como conta preservada.

A operação não oferece restauração automática. Registros técnicos, cópias de segurança e
retenções do provedor podem seguir prazos próprios, que a instituição responsável deve
declarar.

Arquivos compartilhados com cópias independentes precisam continuar disponíveis aos
proprietários dessas cópias. O inventário administrativo permite conferir os vínculos e
examinar arquivos sem referência antes de uma remoção posterior.

## Decisões da implantação e da pesquisa

### Finalidade, dados necessários e retenção

A instituição que oferece o aplicativo precisa explicar o uso de cada classe de dados
e informar quem responde por ele. O inventário deste documento ajuda a distinguir conta,
autoria, estudo e observações; a implantação o complementa com os serviços contratados,
os prazos de conservação e o canal de atendimento.

Uma pesquisa define sua pergunta, população e conjunto de dados antes da coleta. Os
indicadores de autoria existentes podem ajudar a analisar o artefato, mas não fornecem
por si só um plano de investigação de participantes. No Brasil, a hipótese de estudos
por órgão de pesquisa depende também do enquadramento dessa entidade na LGPD; não se
estende automaticamente a qualquer pessoa que desenvolva um estudo.

Se o protocolo precisar relacionar registros à identidade de participantes, essa relação
deve ter acesso e retenção próprios, separados dos arquivos de análise. Substituir o
nome por um código não elimina a possibilidade de identificar a pessoa. A decisão de
reutilizar dados exportados considera também texto livre, metadados, cruzamentos e cópias
mantidas fora do AraLearn.

Os prazos técnicos de sete, 14 ou 30 dias descritos acima dizem respeito a classes
específicas de registros. Não são prazos gerais para cursos, participantes, arquivos ou
cópias de segurança. Para cada um desses conjuntos, a instituição precisa estabelecer
quando a finalidade termina, como ocorre a eliminação e quais retenções permanecem
justificadas.

### Direitos e atendimento

Os direitos e suas condições constam do art. 18 da LGPD e dos arts. 12º a 22º do RGPD.
A implantação precisa oferecer um canal para receber e responder a pedidos, como acesso,
correção ou eliminação, identificando a pessoa sem solicitar dados excessivos.

Os controles do aplicativo permitem corrigir o perfil, retirar observações, limpar o
dispositivo e excluir a conta. Eles não abrangem automaticamente todas as cópias de
segurança, arquivos já exportados ou dados recebidos por fornecedores. Uma resposta
institucional precisa considerar esses destinos e explicar eventuais condições ou
limites da medida solicitada. Exportar um curso também não equivale a reunir todos os
dados pessoais tratados sobre uma pessoa.

### Serviços externos e transferências internacionais

A hospedagem, o cliente conversacional e o provedor de IA podem receber dados em
percursos diferentes. A instituição precisa conhecer os destinatários, as localizações
de tratamento, a retenção e os termos aplicáveis a cada serviço. Guardar a chave de IA
somente na memória do dispositivo não determina o que o provedor faz com o conteúdo
recebido.

Quando aplicáveis, os requisitos para subcontratação e transferências internacionais
precisam ser considerados na contratação e na configuração: RGPD, arts. 28º e 44º e
seguintes; LGPD, art. 33 e seguintes. Escolher uma região de hospedagem não resolve
sozinho os demais envios. O papel de cada fornecedor depende de suas atividades e dos
compromissos assumidos, e não apenas de aparecer como opção no aplicativo.

### Segurança e avaliação da pesquisa

Controle de acesso, redução de dados nas respostas e limpeza de registros diminuem
riscos concretos. A operação precisa acompanhar incidentes, acessos administrativos e
cópias de segurança. Proteção contra senhas vazadas e autenticação por mais de um fator
dependem da configuração do projeto Supabase utilizado.

O protocolo de pesquisa precisa examinar os riscos da população, das categorias de dados
e das formas de análise, com atenção a menores, dados sensíveis e monitoramento. Essa
avaliação orienta a consulta às instâncias de ética e proteção de dados e a verificação
da necessidade de relatório de impacto à proteção de dados (RIPD, no Brasil) ou avaliação
de impacto sobre a proteção de dados (AIPD, em Portugal). Uma aprovação ética e os
controles do software não substituem as demais decisões jurídicas da implantação.

## Comunicar um problema de privacidade

Ao relatar um problema, registre versão, dispositivo, operação e resultado. Substitua
nomes, e-mails, credenciais e conteúdo privado por exemplos fictícios. Use o canal da
instituição responsável pela instalação; para defeitos no código público, use o
rastreador do repositório.

Se uma credencial tiver sido exposta, revogue-a ou substitua-a. Editar uma mensagem ou
um arquivo não elimina necessariamente as cópias já produzidas.

## Fontes oficiais

As referências legais são a [LGPD
compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm),
o [RGPD no EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pt) e a [Lei
portuguesa n.º 58/2019](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982).
Para aprofundar a aplicação a pesquisa e desenho do serviço, consulte
as orientações da ANPD sobre [direitos dos
titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
e [tratamento acadêmico e
pesquisa](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-tratamento-de-dados-pessoais-para-fins-academicos-e-para-a-realizacao-de-estudos-e-pesquisas),
e as [orientações do EDPB sobre proteção desde a
concepção](https://www.edpb.europa.eu/documents/guideline/guidelines-42019-on-article-25-data-protection-design-and-by-default_en).

Para pesquisa no contexto da Universidade de Lisboa, permanecem como fontes a [Comissão
de Ética do IE](https://www.ie.ulisboa.pt/comissao-de-etica), suas [boas práticas de
investigação](https://www.ie.ulisboa.pt/sites/default/files/documents/document/default/boas-praticas-investigacao-etica-no-ieulisboa-junho-2022.pdf)
e o [Encarregado de Proteção de Dados da
ULisboa](https://www.ulisboa.pt/info/regulamento-geral-de-protecao-de-dados). Para os
controles sobre Storage e sessão, consulte a documentação oficial do Supabase sobre
[controle de acesso do
Storage](https://supabase.com/docs/guides/storage/security/access-control), [URLs
assinadas](https://supabase.com/docs/guides/storage/serving/downloads) e
[sessões](https://supabase.com/docs/guides/auth/sessions).

<!-- referências locais: início -->

## Referências

- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
