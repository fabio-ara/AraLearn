# Privacidade e tratamento de dados

O AraLearn usa dados de conta para autenticar a pessoa e controlar o acesso aos cursos.
Também mantém o material produzido, o estado necessário para retomar o estudo e as
observações enviadas. Proteger esses dados exige acompanhar três relações: qual é a
finalidade de cada informação, quem consegue recebê-la e quando ela deixa de ser
necessária.

As referências jurídicas são a [Lei Geral de Proteção de Dados Pessoais (LGPD)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm),
no Brasil, e o [Regulamento Geral sobre a Proteção de Dados (RGPD)](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pt),
em Portugal, acompanhado da [Lei portuguesa n.º 58/2019](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982).
O código fornece controles técnicos. A conformidade jurídica depende também da
implantação concreta, de quem decide as finalidades e dos serviços contratados.

Cada uso dos dados precisa de uma finalidade definida. Para retomar o estudo, por
exemplo, bastam a posição e as marcações da pessoa; registrar todos os seus toques
seria outra coleta, com finalidade e justificativa próprias. A **minimização**
orienta o uso apenas dos dados necessários. Controle de acesso e informação
compreensível sobre o tratamento completam essa relação. Essas preocupações
participam também da discussão sobre dados educacionais
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## Conceitos essenciais

**Dado pessoal** é uma informação relacionada a uma pessoa identificada ou
identificável, conforme o art. 5º da LGPD e o art. 4º do RGPD. No AraLearn, isso inclui
e-mail da conta, identificador interno, identificador público escolhido e foto de
perfil.

**Pseudonimização** substitui a identificação direta, mas conserva a possibilidade
de associar os dados à pessoa mediante informações adicionais. **Anonimização**
exige que ela deixe de ser identificável pelos meios considerados na legislação
aplicável. Um comentário assinado com um código pode continuar identificável pelo
próprio texto.

**Proprietário do curso** é a pessoa autorizada a alterar o planejamento e o conteúdo,
consultar áreas autorais e conceder acesso a estudo.

**Acesso ao estudo** permite ler e praticar um curso público ou compartilhado. Somente
uma conta autenticada com acesso pode enviar observações. A edição do original é
reservada ao proprietário; uma tentativa de edição por um estudante não cria outro curso.

**Curso próprio** pertence a um único proprietário. Uma cópia autorizada cria outro
curso, com conteúdo independente e origem registrada. Alterar ou revogar o acesso ao
original preserva a propriedade da cópia. Cópias antigas cuja propriedade foi
comprovada também permanecem independentes, com dados privados de origem para
recuperação.

**Estado pessoal de estudo** reúne posição de retomada, unidades concluídas e marcas
**Rever**. Ele pertence à pessoa e ao curso e fica separado do conteúdo.

**Observação ancorada** é um comentário ligado a um ponto do curso, como uma unidade,
explicação ou fonte. Cada estudante lê somente as próprias observações; o proprietário
recebe a caixa de entrada necessária à triagem. O [capítulo de observações](observacoes-pedagogicas.md)
explica os alvos e o tratamento de cada contribuição.

**Réplica local** é a cópia mantida no dispositivo para abertura rápida e uso sem
conexão. Uma alteração ainda não sincronizada pode existir somente nessa cópia, que
está sujeita à limpeza dos dados do navegador. Uma cópia de segurança tem outra função:
conservar dados para recuperação depois de uma perda.

O servidor confere a propriedade antes de autorizar uma edição. A réplica no
dispositivo permite ler o conteúdo já obtido, dentro das condições de uso local.
A relação entre réplica, filas de envio e servidor está descrita em
[persistência e sincronização](persistencia-relacional.md).

## Legislação e responsabilidades no Brasil e em Portugal

A [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
delimita seu alcance territorial no art. 3º. Para o tratamento com fins exclusivamente
acadêmicos, o art. 4º, II, b, mantém aplicáveis os arts. 7º e 11. É preciso, portanto,
identificar uma hipótese legal adequada, isto é, uma condição prevista na lei que
permita aquele tratamento. Dados especialmente protegidos, como informações de saúde
ou convicção religiosa, exigem avaliação específica.

O [RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pt) também define seu
âmbito territorial no art. 3º. Em Portugal, a [Lei n.º
58/2019](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982) assegura sua
execução na ordem jurídica nacional. A investigação está sujeita a salvaguardas,
incluindo minimização e, quando a finalidade permitir, anonimização ou pseudonimização
(RGPD, art. 89º; Lei n.º 58/2019, art. 31º). O protocolo precisa considerar os direitos
aplicáveis e as condições legais de eventuais limitações.

As duas leis atribuem responsabilidades conforme a atuação de cada parte, embora usem
nomes diferentes para funções próximas:

| Papel no tratamento | Brasil — LGPD, art. 5º | Portugal — RGPD, art. 4º |
| --- | --- | --- |
| decidir a finalidade e como tratar os dados | controlador | responsável pelo tratamento |
| tratar dados por conta de quem decide | operador | subcontratante |

Esses papéis dependem da atuação real de cada organização. A propriedade de um curso
delimita permissões dentro do AraLearn; as responsabilidades pelo tratamento de dados
abrangem também a instituição, a equipe de pesquisa e os fornecedores. A implantação
precisa identificar essas responsabilidades e, conforme o regime aplicável, designar
um encarregado de proteção de dados.

A base jurídica precisa corresponder a cada finalidade. Manter uma conta, produzir
conteúdo com um serviço de IA e investigar a experiência de participantes são usos
distintos. A instituição identifica a hipótese aplicável a cada um e, quando adota
consentimento, verifica suas condições legais. A confirmação na interface registra
a autorização da operação solicitada.

## Dados e finalidades

Para reconhecer quem recebe cada dado, é preciso acompanhar seu percurso entre
dispositivo e servidor. O [Supabase](supabase.md) reúne o serviço de autenticação
(Auth), o banco relacional PostgreSQL e o armazenamento de arquivos (Storage).
O banco guarda registros e relações; áreas de arquivos chamadas *buckets* guardam
os dados binários, ou bytes, de documentos, áudios e fotos. O
[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API), recurso
do navegador para armazenar dados estruturados, conserva a cópia necessária ao estudo.

Ao abrir um curso, o aplicativo confirma quem pode acessá-lo e recebe somente os
campos permitidos para aquela leitura. Essa seleção de campos é chamada de
**projeção**. Um visitante pode receber o texto de estudo e as citações visíveis,
por exemplo, enquanto notas privadas de verificação continuam restritas à autoria.

Quando a pessoa avança numa atividade, o aplicativo atualiza seu estado de estudo,
sem alterar o conteúdo do curso. Se ela registra uma observação, o comentário segue
outro percurso: fica ligado ao ponto observado e pode ser lido pelo proprietário
para revisão. Abrir um documento anexado ou um áudio exige ainda verificar a
permissão do arquivo, mesmo que a pessoa já consiga ler o curso.

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
| perfil | identificador público único e avatar opcional para apresentação | pessoal; a imagem escolhida pode exigir avaliação específica | PostgreSQL e bucket privado; própria pessoa e relações autorizadas | até alteração ou exclusão; política de cópias de segurança ainda institucional | identificadores aparecem nas tarefas autorizadas de acesso; avatar e edição de perfil permanecem na aplicação |
| curso e autoria | conteúdo, plano, configuração corrente e recibos temporários | pode conter dado pessoal em texto livre; UUIDs ligados à conta continuam pessoais ou pseudonimizados | PostgreSQL; proprietário e projeções permitidas | artefato enquanto necessário; recibos expiram pelo prazo técnico | exportações exigem avaliação dos dados pessoais e das condições de pesquisa |
| acesso direto | curso, ator, pessoa favorecida, concessão e revogação | pessoal/pseudonimizado | PostgreSQL; proprietário e favorecido conforme a relação | até revogação, exclusão ou política institucional; contadores de tentativa, 30 dias | e-mail não entra em recibo, contador, MCP ou Actions |
| estado pessoal | posição, progresso e marcas **Rever** para continuar o estudo | pessoal/pseudonimizado | PostgreSQL e IndexedDB segregado por conta; somente a pessoa | estado funcional até exclusão; recibos expiram em 7 dias | fora de exportações comuns e de pesquisa por padrão |
| observações | texto, alvos, respostas, decisões e bases de comparação para manifestação e triagem | pessoal/pseudonimizado; texto livre e bases podem conter categorias sensíveis | PostgreSQL e IndexedDB; autor e proprietário nos limites do contrato | retirada remove o texto de imediato; encerramento de todos os alvos autorais também limpa o texto e inicia a janela de 14 dias; bases duram enquanto tiverem alvos vinculados | exportação v2 é privada, pessoal ou pseudonimizada; uso em pesquisa exige protocolo |
| análise de autoria | escopo, configuração aplicada e contagens de desenho e intervenção corrente | pode permanecer pessoal ou pseudonimizado por estar ligado a um curso próprio | derivado do PostgreSQL; proprietário do curso | acompanha o estado corrente; não cria retenção própria | o arquivo JSON descreve o estado salvo; dados de aprendizagem e anonimização exigem procedimentos próprios |
| documentos, áudios e avatares | documentos de fonte, gravações e imagens de perfil | podem conter dados pessoais, confidenciais ou sensíveis | Storage privado e vínculos no PostgreSQL | vínculo ativo ou retenção por base de comparação; arquivos sem referência seguem remoção autorizada e inventário administrativo | exportações descrevem vínculos e metadados sem incluir os bytes; a edição textual envia o recorte descrito na seção de integrações |
| assistência por provedor | pedido, alvo selecionado, contexto curricular, configuração aplicada e até oito mensagens anteriores para preparar uma proposta | texto pode conter dado pessoal mesmo sem identificador dedicado | memória local e provedor escolhido pela pessoa; não integra banco nem IndexedDB | memória até fechar/recarregar/sair; retenção externa depende do provedor | cada envio parte da ação da pessoa; reutilização em pesquisa exige protocolo |
| pesquisa | protocolo, pseudônimo específico, medidas e eventual tabela de reidentificação | pessoal pseudonimizado enquanto reidentificável; pode tornar-se sensível conforme a pergunta | plano de dados segregado e acesso definido pelo protocolo, ainda não implantado como infraestrutura genérica | conforme protocolo, retirada e obrigação institucional | exportação somente nos termos do protocolo; resultados publicados exigem avaliação de reidentificação |
| registros e limpeza | contagens de tentativas, datas de expiração e contagens de remoção para segurança e ciclo de vida | ator é identificador pessoal da conta; horários e contagens permanecem correlacionáveis; nenhuma coluna de e-mail integra o contador de concessões | tabelas privadas e rotina administrativa | janela de concessão, 30 dias; demais prazos por classe | contagens operacionais não integram exportação comum nem autorizam pesquisa |

Conta e estudo usam dados funcionais de identificação e continuidade. Uma pesquisa que trate,
por exemplo, saúde, religião ou biometria precisa concluir a avaliação jurídica e ética
antes da coleta. A mesma avaliação específica se aplica a pesquisas com crianças e
adolescentes.

## Conta, perfil e localização por identificador

Uma conta conserva seu UUID, propriedade e acessos. Antes da experiência autenticada,
a pessoa escolhe um identificador público único. O sistema mantém essa escolha
separada do e-mail e dos nomes anteriores. O identificador usa de 3 a 30 caracteres
ASCII em minúsculas: letras sem acento, números e os sinais admitidos. Começa e
termina com letra ou número e admite ponto, traço e sublinhado no meio. Maiúsculas e
um `@` inicial são normalizados. Se o identificador já estiver ocupado, o aplicativo
solicita outra escolha e mantém a sessão. Alterá-lo preserva o UUID e suas relações.
A foto de perfil, chamada de **avatar**, é opcional, sem segundo nome obrigatório.

Nomes anteriores à adoção do identificador escolhido permanecem em registro privado de
migração, sem consulta pelo aplicativo nem uso como identidade pública. A cópia local
do perfil pertence à própria conta e permite leitura sem conexão.

O proprietário pesquisa um prefixo de pelo menos dois caracteres dentro da área de
acesso de seu curso. A busca devolve no máximo dez identificadores e avatares
autorizados, sem e-mail. Selecionar uma pessoa e confirmar concede estudo, sem escrita
autoral. O servidor confere UUID e identificador juntos para recusar uma seleção que
mudou. Busca e concessão têm cotas separadas: sessenta buscas e dez concessões por ator
a cada dez minutos. Ao atingir uma cota, a interface informa a espera necessária.
Repetir o mesmo pedido recupera seu recibo antes de executar de novo.

O perfil e a lista de concessões usam projeções autorizadas. Pessoas com acesso não
recebem os perfis de colegas. A busca fornece somente a apresentação mínima necessária
à seleção. Fotos permanecem no bucket privado; nessa busca recebem um endereço
com autorização temporária, chamado **URL assinada**, válido por sessenta segundos.
Uma URL já emitida pode funcionar até expirar. A tabela de perfis e o diretório
completo permanecem inacessíveis ao visitante.

## Propriedade, acesso público e recuperação

Todo curso nasce privado. O proprietário controla conteúdo, parâmetros, fontes,
observações recebidas e áreas autorais. Torná-lo público exige confirmação e
disponibiliza seus arquivos por padrão, preservando restrições explícitas por curso,
fonte ou arquivo. Visitantes recebem somente estrutura e conteúdo de estudo permitidos.
Plano privado, notas de verificação, observações, identidades de edição e metadados
de recuperação permanecem fora dessa leitura.

Sem conta, progresso e marcas **Rever** ficam num banco local separado. Para
acrescentá-los a uma conta, a pessoa examina e seleciona os cursos em **Progresso sem
conta**, identifica a conta destinatária e confirma a incorporação. A operação
acrescenta conclusões e marcas **Rever**, mantém o estado anterior da conta e conserva
o banco de visitante. Um recibo local evita aplicar novamente a mesma seleção.
Uma conta com acesso pode registrar observações; somente o proprietário edita.
As mesmas fronteiras valem para chamadas diretas, MCP e Actions, os
[canais que conectam assistentes às operações do AraLearn](#integrações-conversacionais).

Rascunhos locais de edições antigas podem permanecer no dispositivo até o descarte
explícito. A recuperação permite conferir se uma edição já foi salva e preserva o
rascunho quando o resultado não pode ser determinado. Seus limites estão em
[persistência e sincronização](persistencia-relacional.md).

A política de revisão escolhe entre disponibilizar o conteúdo salvo (`saved`) ou
somente o conteúdo revisado (`reviewed_only`). Essa escolha é independente da
visibilidade do curso e dos direitos de arquivo. A declaração de revisão registra
a inspeção expressa da pessoa autora de uma explicação ou unidade. Correções alteram
o material, e testes automáticos verificam suas propriedades técnicas. O
funcionamento desses registros está descrito em [Explicação e revisão
humana](explicacao-e-revisao-humana.md).

Conceder, revogar e mudar a visibilidade exigem confirmação. Retirar uma concessão
individual conserva a leitura de um curso que continua público. Tornar privado bloqueia
novo acesso conectado de visitantes e contas não favorecidas, mantendo proprietário e
concessões individuais. A validação conectada remove a réplica de conteúdo cujo acesso
se perdeu; o estado pessoal remoto pode ser retomado se o acesso voltar. Cursos próprios
independentes permanecem com seus proprietários.

Conteúdo e arquivos já entregues podem permanecer no dispositivo desconectado.
Revogação e mudança de visibilidade controlam os próximos acessos pelo serviço;
os bytes já recebidos permanecem nas cópias de quem os obteve.

<a id="fontes-âncoras-pdfs-e-áudios"></a>

## Fontes, âncoras e arquivos

A [proveniência](fontes-e-citacoes.md) registra de onde vem o conteúdo e como ele se
relaciona a uma fonte. A âncora localiza o trecho ou ponto usado nessa relação. Somente
o proprietário acessa o catálogo autoral, fontes ocultas, referências pendentes de
comprovação, trecho privado de verificação e controles de edição. O estudo consulta
as referências próprias de uma unidade pelo controle **Fontes da unidade**; as
referências do conteúdo explicativo ficam em **Explicação**. Cada consulta recebe
a seleção autorizada de dados:

- **Não mostrar no Estudo** omite a fonte;
- **Mostrar citação** apresenta identificação e localização sem endereço;
- **Mostrar citação e link** também pode apresentar o endereço.

Trecho privado, identidade de quem alterou e controles autorais permanecem fora dessa
leitura. Anexos aparecem somente quando a política de acesso permite.

Documentos anexados utilizam o formato PDF. O servidor confere formato, tamanho e
integridade antes de vincular cada arquivo à fonte. Arquivos vinculados permanecem
imutáveis; referências diferentes podem compartilhar o mesmo arquivo. Cada arquivo
aceita até 20 MiB, cada fonte até oito anexos e o curso até 64 MiB de conteúdo único,
somando documentos e áudios. Um MiB equivale a 1.048.576 bytes. O endereço temporário
usado para receber o arquivo de uma integração é descartado depois do uso.

Um envio sem vínculo confirmado pode deixar um arquivo sem uso no armazenamento privado.
O inventário administrativo permite examinar esses casos antes de qualquer remoção. O
[guia de Supabase](supabase.md) descreve as verificações e a recuperação operacional.

A política efetiva de arquivos prioriza a exceção do documento, depois a da fonte
e por fim a do curso. Fonte e arquivo podem herdar, restringir ou disponibilizar.
O curso nasce privado e com arquivos restritos; ao publicar, a opção padrão passa
a ser disponíveis. A pessoa pode escolher restrito expressamente, preservando as
exceções de fonte e arquivo. O bucket continua privado. Cada novo download confere
a autorização e o vínculo vigente antes de emitir a URL assinada. A projeção de
estudo conserva o caminho interno do Storage fora dos dados recebidos.

A URL assinada de download vale por 60 segundos. Uma URL já emitida não pode ser
revogada individualmente e pode continuar funcionando até o fim dessa janela. Ela
serve à abertura autorizada naquele momento; a identidade do arquivo permanece no
seu registro lógico, separado desse endereço transitório.

A exportação de proveniência contém o alvo, as relações, as versões correntes, as
âncoras e os metadados dos anexos. Ela omite identificadores pessoais de quem realizou
as operações. Depois de baixado, o arquivo passa a depender também dos cuidados adotados
fora do AraLearn.

Uma nota, contestação ou solicitação de reformulação pode apontar para a fonte ou para
uma âncora. Esses registros seguem o mesmo controle privado das demais anotações
ancoradas. Quando a autoria responde com uma reformulação, o documento e seu conteúdo
permanecem na fonte, em vez de serem copiados para a anotação. A exportação dessas
observações conserva texto, alvo, versões, vínculos, identificadores operacionais e
horários necessários ao uso privado. Ela remove `contributor.ref`, o rótulo protegido
da pessoa, os caminhos observado e corrente, os links diretos e as capacidades da
interface. O arquivo e a interface identificam o conteúdo como pessoal ou
pseudonimizado, orientando sua avaliação antes de qualquer uso em pesquisa.

### Áudio e envio de texto para síntese de voz

Áudios WAV PCM e MP3 ficam no bucket privado `course-media`, com até 20 MiB por arquivo
e dentro da cota conjunta de 64 MiB de documentos e áudios por curso. O serviço confere
o formato e os bytes antes de registrar o vínculo. A abertura exige nova autorização;
a reprodução depende também de obter os bytes da gravação.

O painel **Áudio** também permite gerar voz pelo Gemini. A pessoa fornece o texto e a
chave da sessão e confirma o envio e o uso da cota ou cobrança. O resultado ainda
precisa ser guardado no curso. A voz do navegador segue outro percurso: vozes remotas
são uma escolha separada e podem enviar o texto ao serviço de voz do dispositivo.
O [capítulo de áudio](audio.md) distingue o ensaio de fala durante a autoria, os
arquivos exigidos para entrega e os controles de autorização.

## Estado pessoal e limites dos registros de uso

O estado pessoal responde a perguntas funcionais: onde continuar, quais unidades já
foram avançadas e quais foram marcadas para rever. Ele não registra automaticamente
tempo de permanência, cada toque, cada envio ou respostas anteriores.

A fila **Rever** é montada no servidor a partir das marcas da própria pessoa e chega ao
dispositivo em páginas. Atividade de outros estudantes preserva a versão privada desse
estado e permanece fora dos conflitos entre as abas da pessoa.

Esses registros descrevem a continuidade do percurso. Investigar atenção ou
aprendizagem exige medidas e critérios próprios. O [Estado de estudo não
punitivo](estado-de-estudo-nao-punitivo.md) desenvolve essa distinção.

## Observações e identidade protegida

Cada estudante lê somente as próprias anotações. O proprietário lê as anotações do curso
para triagem. A interface autoral identifica a contribuição estudantil por um rótulo
protegido, como “Estudante 7A3F”, mantendo reservados o identificador interno da conta
e o e-mail.

O servidor conserva o texto corrente, a síntese e a resposta necessários ao
tratamento da observação. Nas contribuições de estudantes, uma resposta ou resolução
pode permanecer disponível para acompanhamento. Os eventos de alteração conservam
resumos criptográficos, chamados de **hashes**, e metadados que permitem reconhecer
os estados correspondentes sem duplicar seu texto completo.

Uma observação autoral sobre explicações ou unidades pode reunir vários alvos. Para
comparar o pedido com a correção, o servidor guarda uma base com o conteúdo e as
fontes de cada alvo na abertura da observação. Alvos na mesma versão compartilham
essa base. Ela conserva também referências aos arquivos existentes e os mantém
protegidos de remoção enquanto forem necessários à comparação.

Ao aprovar uma correção ou encerrar um alvo sem alteração, a decisão libera seu
vínculo com a base. A base é removida quando deixa de ter alvos vinculados; os
arquivos liberados seguem a remoção apropriada se nenhuma outra referência os
utilizar. Quando todos os alvos autorais são decididos, o texto, a síntese e a
resposta da observação são apagados, e o registro residual entra na janela de
limpeza de 14 dias.

Retirar uma observação apaga imediatamente seu texto, síntese e resposta, mantendo um
registro de exclusão. Esse registro e o recibo que evita repetir a mesma operação
expiram logicamente em até 14 dias. A limpeza física ocorre em lotes, inclusive por uma
rotina diária, para alcançar registros de cursos que deixaram de ser usados. A operação
está descrita no [guia de Supabase](supabase.md).

Os prazos correntes são 14 dias para a linha com o texto removido e para recibos de
anotação e de mudança de curso, sete dias para recibos de estado pessoal, dez minutos
para intenção de envio de arquivo e 30 dias para a janela agregada de concessão.
A retenção institucional de conteúdo, registros de operação e cópias de segurança
tem critérios próprios, assim como os dados reunidos numa pesquisa.

Observações abertas e contribuições de estudantes resolvidas com texto conservado
permanecem disponíveis até sua retirada ou outra operação prevista. A instituição
responsável define a retenção operacional desses registros. Sua reutilização em
pesquisa exige finalidade e regras próprias de acesso, conservação e autorização.

## Revisão e análise de autoria

Somente o proprietário consulta a caixa autoral e aplica correções ao curso. A
preparação da revisão lê observações abertas e o conteúdo corrente das explicações e
unidades afetadas. Para observações autorais, a base conservada permite comparar o
conteúdo observado com o resultado salvo. A retenção acompanha os alvos ainda
pendentes, conforme a seção anterior.

A inspeção por IA guarda um parecer sobre a base examinada: resultado, síntese,
pendências e evidências textuais. Essas evidências podem repetir trechos do conteúdo
e conter dados pessoais presentes nele. O parecer acompanha a autoria e tem um
registro separado da declaração de revisão humana.

A [análise de autoria](analytics-instrucionais.md) deriva indicadores da configuração,
do desenho aplicado e das intervenções que o estado corrente permite atribuir. Em
**Dados de autoria**, a ação **Exportar curso e análise** reúne o conteúdo integral do
curso, o inventário de fontes e arquivos, os parâmetros, as declarações de revisão e as
contagens. Os bytes dos anexos, o estado pessoal de estudo e os textos de observações
ficam fora desse arquivo.

O conteúdo e os metadados escritos livremente podem conter dados pessoais, mesmo sem
e-mail ou nome em um campo de conta. Curso e combinação de valores também podem permitir
associação à pessoa autora. A exportação descreve um estado de autoria que precisa ser
examinado antes do compartilhamento. O uso em pesquisa depende da avaliação desses
riscos e das condições definidas no protocolo.

## Integrações conversacionais

O **Model Context Protocol (MCP)** conecta um cliente externo de assistência às
ferramentas de autoria. A pessoa escolhe e autoriza esse cliente. As leituras autorais
alcançam seus próprios cursos; uma consulta específica também pode localizar os
metadados de um curso que recebeu permissão explícita para copiar. A cópia resultante é
outro curso, e a autoria do original permanece com seu proprietário. O servidor aplica
as mesmas regras de propriedade, revisão e confirmação usadas pela interface.

O [catálogo MCP](autoria-mcp.md) define tarefas também oferecidas pela [integração
Actions/OpenAPI](autoria-actions.md). OpenAPI descreve as operações da interface de
programação; Actions é o recurso de um GPT personalizado que as chama. O proprietário
pode consultar identificadores das pessoas com acesso e conceder ou revogar acesso a
um identificador exato, com confirmação expressa. Ao conceder, escolhe também se a
pessoa poderá copiar o curso. E-mail, avatar e identificadores internos das contas
ficam fora dessa resposta. A edição do perfil e a exclusão da conta permanecem na
aplicação autenticada.

Para chamar essas operações, o GPT recebe uma credencial de acesso opaca: o cliente
a utiliza sem interpretar seu conteúdo, e o servidor reconhece a autorização
correspondente. Recebe também uma credencial de renovação rotativa, substituída
quando usada para renovar o acesso. Os nomes técnicos são *access token* e
*refresh token*. O servidor guarda somente hashes dessas credenciais e resolve
a conta a cada chamada. O cliente confidencial ligado ao GPT pede os escopos
`openid email`, que delimitam a autorização solicitada. Credencial, cliente e
consentimento de Actions não funcionam no MCP, e a credencial do MCP não funciona
em Actions.

**OAuth** permite autorizar o cliente a operar em nome da conta sem lhe entregar a
senha. O MCP possui seu próprio fluxo OAuth e anuncia somente o escopo
`offline_access`. O código de autorização e o *refresh token* não produzem
`id_token`. Sua credencial de acesso é um **JWT**, credencial assinada com campos
verificáveis. Ela usa identificadores substitutos pareados e distintos para pessoa
e sessão, sem UUID da pessoa, e-mail ou perfil, e não funciona como sessão do
aplicativo. Conserva `aralearn_session_id`, o UUID real da sessão de origem
necessário à chamada interna ao banco. Esse identificador permite correlação;
por isso, a credencial inteira continua sendo pessoal ou pseudonimizada.

Antes de aceitar a chamada, o servidor valida a credencial e confirma que a sessão de
origem, o cliente e a autorização continuam ativos. A credencial da integração não
permite acesso direto ao banco ou aos arquivos. O [guia de Supabase](supabase.md)
detalha essa separação e as validações de identidade.

Consentimentos e sessões OAuth do MCP encerrados não renovam acesso. Um token já
emitido permanece criptograficamente válido somente até a data de expiração,
registrada no campo `exp`. Sua assinatura e seu prazo são conferidos junto das
condições de autorização em cada chamada.

As tarefas de observações consultam apenas o escopo autorizado necessário à revisão.
Texto, alvo e contexto podem conter dados pessoais; o assistente deve receber somente o
recorte pedido e evitar repeti-lo quando não for necessário à tarefa.

Fontes preservam as referências necessárias à autoria e mantêm reservados o ator,
o caminho do Storage e a credencial administrativa. A incorporação de um documento
em formato PDF aceita o arquivo temporário entregue pelo transporte, valida origem
e bytes no servidor e grava o objeto em bucket privado. Para abrir um anexo, o
serviço autoriza o alvo e emite uma URL assinada de curta duração. Campos livres da
fonte, como título, autoria declarada e trecho de verificação, também podem conter
dados pessoais e exigem minimização. O painel de fontes do estudo mostra somente os
metadados e a localização permitidos pela visibilidade escolhida. Em Actions, o
destinatário é o GPT conectado; no MCP, é o cliente MCP conectado.

Na [edição com IA](assistencia-por-ia.md), a pessoa escolhe OpenAI, Gemini ou DeepSeek.
Ao enviar uma mensagem, o dispositivo remete ao provedor a seleção editada, o restante
do alvo como contexto, a configuração aplicada, um resumo curricular e até oito
mensagens anteriores. Identificadores internos mantêm o recorte e a ordem dos objetos.
A interface inicia a chamada nessa própria ação de envio, sem apresentar outra tela
com a íntegra do pedido. A configuração associa cada provedor somente à sua origem
oficial.

O pedido é montado a partir do alvo e do contexto curricular selecionados. O acervo de
fontes, os anexos e o perfil da conta não são consultados para compô-lo. A chave do
provedor segue no cabeçalho da requisição e permanece somente na memória da sessão;
fica fora do IndexedDB, do PostgreSQL, do Storage e dos artefatos gerados. Sair,
recarregar ou encerrar a sessão descarta a chave e a conversa local.

Erros apresentados pelo AraLearn conservam o código e a orientação úteis sem repetir
segredo, e-mail, cabeçalho de autorização ou corpo bruto. As **Edge Functions**, funções
executadas no servidor do Supabase, mantêm corpo, cabeçalhos e exceções brutas fora do
console. Os fluxos de automação recusam rastreamento e impressão direta de credenciais.
O texto selecionado, entretanto, pode conter informações pessoais, e o provedor pode
conservar o que já recebeu segundo seus próprios termos. Ao sair da conta, o aplicativo
também cancela a chamada em curso. O cancelamento interrompe seu acompanhamento local;
a solicitação pode já ter chegado ao provedor.

Antes do envio, a pessoa precisa conferir o recorte, retirar segredos e dados pessoais
desnecessários e delimitar a finalidade. A proposta recebida também deve ser revisada
antes de entrar no curso ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Dados no dispositivo

O dispositivo conserva o necessário para manter a sessão e continuar o trabalho já
iniciado. Isso inclui a composição de cursos abertos, o estado pessoal e alterações
pendentes, além dos arquivos estáticos da interface.

A sessão persiste somente `access_token`, `refresh_token`, tipo, expiração e `user.id`.
E-mail, nome, identidades externas e o restante do objeto retornado pelo Auth ficam
fora desse registro; uma sessão legada é reduzida na primeira leitura. Os tokens
continuam sendo segredos e dados pessoais após essa minimização.

O IndexedDB pode conservar rascunhos de edições antigas, com conteúdo e referências
necessários à recuperação. Eles permanecem até o descarte explícito e não incluem a
conversa ou a credencial do provedor.

Conteúdo, fontes, observações e configuração do curso permanecem no servidor.
Limpar os dados do aplicativo pode apagar mudanças ainda não sincronizadas. A saída
encerra a sessão; a limpeza do dispositivo e a exclusão da conta têm controles próprios.

**Sair** respeita o modo de sincronização e preserva, por decisão de produto,
cursos disponíveis sem conexão, estado pessoal e rascunhos já gravados no IndexedDB
daquela conta. Uma alteração ainda aberta somente na memória do editor será perdida;
a interface informa isso e pede confirmação antes de sair. **Remover dados deste
dispositivo** apaga somente o conjunto de dados locais da conta ativa e mantém a
sessão; **Sair e remover dados deste dispositivo** encerra a sessão e apaga esse
mesmo conjunto. As duas ações alertam sobre progresso, observações e edições ainda
pendentes. Dados de outra conta no mesmo perfil do navegador são preservados.

## Operações controladas pela pessoa

### Alterar identificador ou foto

Em **Configurações → Conta**, edite o identificador ou escolha uma imagem JPEG, PNG ou
WebP de até 512 KiB. Somente a própria pessoa envia ou remove objetos de sua pasta.
Ao substituir a foto, o aplicativo registra a nova referência antes de remover o
arquivo anterior. Uma falha nessa remoção é informada para recuperação.

Se o envio terminar e a atualização do perfil ficar sem confirmação, o aplicativo
relê o perfil antes de tentar desfazer o envio. Uma referência já confirmada preserva
a foto; uma ausência confirmada permite remover o objeto sem vínculo. Se a releitura
ou a limpeza falhar, a tela informa a incerteza e conserva a chave do objeto durante
a sessão. Outro envio aguarda a confirmação do vínculo ou sua remoção segura.
O inventário administrativo continua classificando o objeto; a remoção depende
de uma autorização própria.

### Conceder acesso ao estudo

Em um curso próprio, abra **Pessoas e acesso**, pesquise o `@identificador`, selecione a
pessoa e confirme. A concessão confirmada aparece na lista; uma limitação informa a
espera necessária. A pessoa passa a ver o curso em Estudo e pode registrar observações.
Se a concessão incluir permissão de cópia, pode criar um curso próprio independente;
a propriedade do original permanece inalterada.

### Revogar acesso ao estudo

Em **Pessoas e acesso**, escolha a conta e confirme a revogação. O servidor encerra a
autorização e preserva o estado pessoal para uma eventual nova concessão.

### Excluir a própria conta

A exclusão fica disponível no aplicativo autenticado e exige conexão, confirmação
humana e a frase exata `EXCLUIR MINHA CONTA`.

O aplicativo envia uma única solicitação confirmada à API, a interface de programação
pela qual solicita operações ao servidor. A API autentica a pessoa, identifica seus
cursos e arquivos privados, remove os cursos próprios e seus documentos e áudios,
além dos avatares, e conclui a exclusão da conta com a mesma sessão. O banco recusa
a operação enquanto algum objeto permanecer e confirma a ausência no momento da exclusão.

Depois que a limpeza física começa, uma falha pode conservar a conta embora alguns
cursos, documentos, áudios ou a foto já tenham sido removidos. A interface informa
esse estado e a remoção possível: a conta pode já ter sido excluída ou ainda aguardar
a etapa final. Repetir a mesma operação confirma ou conclui o resultado. Essa
recuperação considera os efeitos que a tentativa anterior já possa ter produzido.

Na etapa final, o servidor encerra as sessões antes de remover a conta e impede que uma
credencial remanescente volte a enviar arquivos. Endereços de download já autorizados
podem continuar funcionando até seu prazo de expiração.

Depois, a conta de autenticação, o perfil, os cursos próprios, suas composições, acessos
e estados dependentes são removidos. Contribuições em cursos alheios são retiradas, têm
seu texto removido imediatamente e seguem a janela de limpeza lógica de 14 dias. Um
curso independente que veio de uma cópia é próprio e segue essa mesma exclusão.

A réplica local é limpa depois da resposta de sucesso. Essa resposta remota confirma
a exclusão: se outra aba bloquear a limpeza do IndexedDB, a conta continua excluída,
e a interface oferece somente repetir a limpeza local. A exclusão remota já foi
concluída e permanece separada dessa recuperação do dispositivo.

A operação não oferece restauração automática. Registros técnicos, cópias de segurança
e retenções do provedor podem seguir prazos próprios, que a instituição responsável
deve declarar.

Arquivos compartilhados com cópias independentes precisam continuar disponíveis aos
proprietários dessas cópias. O inventário administrativo permite conferir os vínculos e
examinar arquivos sem referência antes de uma remoção posterior.

## Decisões da implantação e da pesquisa

### Finalidade, dados necessários e retenção

A instituição que oferece o aplicativo precisa explicar o uso de cada classe de dados
e informar quem responde por ele. O inventário deste documento ajuda a distinguir conta,
autoria, estudo e observações; a implantação o complementa com os serviços contratados,
os prazos de conservação e o canal de atendimento.

Uma pesquisa define sua pergunta, população e conjunto de dados antes da coleta.
Os indicadores de autoria ajudam a analisar o artefato; investigar participantes
exige medidas e procedimentos adequados à pergunta. No Brasil, o uso da hipótese
legal de estudos por órgão de pesquisa exige também que a entidade atenda à
definição prevista na LGPD.

Se o protocolo precisar relacionar registros à identidade de participantes, essa
relação deve ter acesso e retenção próprios, separados dos arquivos de análise.
Mesmo com nomes substituídos por códigos, o texto livre, os metadados e o cruzamento
com outras fontes podem permitir reidentificação. A decisão de reutilizar dados
exportados considera também as cópias mantidas fora do AraLearn.

Os prazos técnicos de sete, 14 ou 30 dias descritos acima têm o alcance indicado no
inventário. Para os demais conjuntos de dados, a instituição estabelece quando a
finalidade termina, como ocorre a eliminação e quais retenções permanecem justificadas.

### Direitos e atendimento

Os direitos e suas condições constam do art. 18 da LGPD e dos arts. 12º a 22º do RGPD.
A implantação precisa oferecer um canal para receber e responder a pedidos, como acesso,
correção ou eliminação, identificando a pessoa sem solicitar dados excessivos.

Os controles do aplicativo permitem corrigir o perfil, retirar observações, limpar o
dispositivo e excluir a conta. A resposta institucional a um pedido considera também
as cópias de segurança, os arquivos exportados e os dados recebidos por fornecedores,
explicando as condições da medida em cada destino. A exportação de curso tem alcance
autoral; um pedido de acesso aos dados pessoais deve abranger as demais classes
pertinentes à pessoa.

### Serviços externos e transferências internacionais

A hospedagem, o cliente conversacional e o provedor de IA podem receber dados em
percursos diferentes. A instituição precisa conhecer os destinatários, as localizações
de tratamento, a retenção e os termos aplicáveis a cada serviço. A chave de IA fica
somente na memória do dispositivo; o conteúdo enviado ao provedor segue também as
condições de tratamento desse destinatário.

Quando aplicáveis, os requisitos para subcontratação e transferências internacionais
precisam ser considerados na contratação e na configuração: RGPD, arts. 28º e 44º e
seguintes; LGPD, art. 33 e seguintes. A análise acompanha tanto a região de
hospedagem quanto os demais destinos dos dados. O papel de cada fornecedor depende
de suas atividades e dos compromissos assumidos.

### Segurança e avaliação da pesquisa

Controle de acesso, redução de dados nas respostas e limpeza de registros diminuem
riscos concretos. A operação precisa acompanhar incidentes, acessos administrativos e
cópias de segurança. Proteção contra senhas vazadas e autenticação por mais de um fator
dependem da configuração do projeto Supabase utilizado.

O protocolo de pesquisa precisa examinar os riscos da população, das categorias de dados
e das formas de análise, com atenção a menores, dados sensíveis e monitoramento. Essa
avaliação orienta a consulta às instâncias de ética e proteção de dados e a verificação
da necessidade de relatório de impacto à proteção de dados (RIPD, no Brasil) ou avaliação
de impacto sobre a proteção de dados (AIPD, em Portugal). A implantação reúne essa
apreciação ética, os controles do software e as decisões jurídicas aplicáveis.

## Comunicar um problema de privacidade

Ao relatar um problema, registre versão, dispositivo, operação e resultado. Substitua
nomes, e-mails, credenciais e conteúdo privado por exemplos fictícios. Use o canal da
instituição responsável pela instalação; para defeitos no código público, use o
rastreador do repositório.

Se uma credencial tiver sido exposta, revogue-a ou substitua-a. Considere também as
cópias da mensagem ou do arquivo que já possam ter sido produzidas.

## Fontes oficiais

As referências legais são a [LGPD
compilada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm),
o [RGPD no EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=pt) e a [Lei
portuguesa n.º 58/2019](https://diariodarepublica.pt/dr/detalhe/lei/58-2019-123815982).
Para aprofundar a aplicação a pesquisa e desenho do serviço, consulte as orientações da
ANPD sobre [direitos dos
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
