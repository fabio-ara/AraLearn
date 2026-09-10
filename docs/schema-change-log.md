# Alterações do schema

## 20260910054749 — aplicações existentes e prática planejada

O registro de aplicações e a aplicação expressa de configuração em unidades
existentes conservam requisitos de prática ainda não realizados ou parcialmente
realizados. Um núcleo privado compartilhado valida a integridade das declarações;
o caminho de materialização completa também exige cobertura, quantidade mínima
de oportunidades e dimensões de variação. O modo é escolhido pelo escritor,
sem acrescentar campo aos canais de autoria.

A migration preserva os vínculos e dados do curso, snapshots, fontes e revisão.
Referências, oportunidades duplicadas, operação invariável, componentes, acesso,
calibração e versões continuam protegidos. Testes PGlite com escritores e
validadores SQL reais cobrem registro fiel, aplicação parcial, preservação,
recibos e recusas atômicas; não substituem integração autenticada ou prova
hospedada. O manifesto avança para exigir esta revisão no corte.

## 20260908105357 — leitura de origens autorizadas para cópia

A preparação de cópia usa uma leitura de serviço específica para cursos próprios ou com permissão explícita de cópia. As chamadas anteriores alcançavam wrappers de leitura cujo acesso já havia sido revogado. A migração acrescenta `list_copyable_courses_for_actor_v1`, sem reativar esses wrappers nem conceder edição da origem compartilhada.

O leitor reutiliza a política e a projeção atuais, valida o perfil do ator e filtra a autorização antes do limite e do cursor. A consulta por UUID devolve o mesmo envelope de lista; curso ausente ou sem permissão produz lista vazia, sem metadados privados. Ser público ou estar disponível apenas para estudo não concede cópia. Testes transacionais cobrem esses casos, a paginação, as concessões exclusivas ao serviço e a preservação dos registros. Não há transformação de cursos, arquivos, fontes ou decisões de revisão.

## 20260908023156 — impressão regenerada do catálogo de pacotes

O gate de autoíndice identificou o fingerprint gerado desatualizado. Reexecutar o gerador manteve imports e ordem dos pacotes e atualizou somente `RESOURCE_PACKAGE_CONTRACT_FINGERPRINT`. A projeção SQL passa a anunciar essa impressão, consumida pela descoberta do contrato, mantendo a versão `1-70b27609`, as referências e as opções do catálogo.

O bloco SQL foi produzido por `renderResourcePackageCatalogSql()`. A migração exige revisão e fingerprint anteriores exatos, compara versão/opções e metadados da função após a substituição e não regrava políticas, conteúdo, snapshots ou decisões de revisão. O manifesto avança para distinguir o backend com a projeção sincronizada. Testes focais exercitam preservação e rollback quando a origem diverge ou as opções sofreriam alteração incidental. A igualdade dessa impressão é um contrato de sincronização; não constitui evidência de eficácia pedagógica.


## 20260908020737 — conflito de revisão na leitura das citações

A leitura das citações da Explicação passa a devolver `PT409` quando a revisão solicitada ficou antiga, conforme o contrato de conflitos HTTP 409. A mensagem, a assinatura e as guardas de acesso e revisão humana permanecem. Não há alteração de dados, concessões ou aprovações.

A falha foi reproduzida pelo gate SQL de conflitos: a nova leitura ainda levantava `40001`, reservado à serialização nativa. O teste focal agora exerce esse CAS diretamente, além do inventário de guardas e da preservação dos envelopes nativos. Fixtures de acesso público, citações e áudio aprovam seu conjunto exclusivamente sintético pelo RPC de sessão do proprietário; política de arquivo e presença de vínculo não substituem revisão. Chamadas SQL posicionais de metadados tipam o argumento JSON para distinguir os overloads; clientes continuam usando argumentos nomeados.


## 20260908003749 — ausência de atribuição em Fontes

A leitura de um alvo existente sem atribuição bibliográfica retorna `items: []`.
A função escalar que resolve a atribuição produzia uma linha composta nula no
`FROM`; a agregação transformava essa ausência em item com identidade e versão
nulas, recusado corretamente pelo cliente. O filtro por identidade da atribuição
corrige a leitura para item do plano, unidade e Explicação, sem inventar versão,
apagar vínculos existentes ou confundir alvo inexistente com alvo sem fontes.

A mesma migração corrige a codificação das mensagens de erro do ramo manual da
Explicação. As funções preservam assinaturas, autorização e permissões. Não há
transformação dos dados armazenados. Testes sintéticos locais distinguem os três
alvos sem atribuição, atribuição existente, alvo inexistente e mensagem UTF-8.

Salvar conteúdo idêntico com a primeira atribuição vazia pode avançar a revisão
do curso pela proveniência, conservando conteúdo e versão da microssequência.
O recibo informa a versão real; o avanço do curso não significa que a entidade
foi reescrita. Essa distinção é coberta na prova local, sem afirmar revisão humana
de conteúdo real ou aplicação hospedada.

## 20260908002120 — edição manual da Explicação

A composição existente recebe um ramo focal para a pessoa proprietária editar
somente a Explicação da microssequência inspecionada. O serviço exige versão da
microssequência e revisão do curso, conserva pai, posição, demais campos e vínculos
bibliográficos atuais, e confirma conteúdo e proveniência na mesma transação.
Não aceita esse ato como MCP ou assistência por provedor, nem como edição de
metadados do curso. As assinaturas das operações de unidade e composição seguem
com seus usos existentes; o novo argumento obrigatório distingue o ramo manual
de apoio, sem resolução ambígua por parâmetros opcionais.

O recibo confirma identidade, versão e origem humana **do ato manual**, além de
preservar a resposta original para a mesma identidade de solicitação. Isso não
atribui autoria humana à microssequência inteira nem constitui aprovação. A
coluna protegida de revisão conserva a decisão anterior; o hash material torna
a aprovação não atual. A leitura corrente não fornece um novo histórico durável
de autoria do apoio: a interface só afirma edição manual confirmada após receber
o recibo correspondente.

A migração não transforma dados existentes. Provas sintéticas locais cobrem
CAS, replay, recusa de mudança de escopo/fontes, preservação de unidades e revisão,
e permissões do serviço; clientes e publicação hospedados permanecem no gate final.

## 20260907222912 — Explicação compartilhada e revisão humana

A microssequência corrente conserva `explanationPlan` e uma `explanation` com
título e recursos do catálogo comum. Materializar uma parte exige um apoio por
microssequência produzida; unidades, aplicações e vínculos são confirmados na
mesma transação e no recibo existente. Uma falha do apoio desfaz o lote. Salvar
o mapa preserva a Explicação existente e altera somente sua proposta.

`content_review` é metadado protegido, separado do conteúdo importável. O corte
mantém o acervo anterior sem revisão registrada; novas microssequências e cópias
começam como rascunho. A aprovação exige a sessão atual do aplicativo da pessoa
proprietária, unidades e apoio produzidos e a impressão do conjunto inspecionado.
OAuth, Actions/MCP, importação e correção não concedem aprovação. Replay recupera
a decisão original; divergência da base retorna HTTP 409, sem rebase automático.

A base inclui conteúdo ordenado, aplicações, dependências existentes, fontes e
âncoras usadas e arquivos efetivamente vinculados. Alteração material torna a
aprovação não atual; uma alteração independente não invalida outro recorte.
Leituras de estudantes, citações, arquivos e cópias compartilhadas respeitam a
elegibilidade no servidor. A pessoa proprietária continua inspecionando o rascunho.
O marcador de revisão pendente permite ao cliente conservar a cópia local anterior.
Não há snapshot aprovado paralelo no servidor nem decisão humana retroativa.

A base literal de Analytics/exportação conserva metadados de fontes e âncoras
retiradas quando uma atribuição corrente ainda as referencia. Isso evita uma
referência pendente por omissão do inventário sem apagar o vínculo ou reativar a
fonte. Retiradas sem uso ficam ausentes. Esse DTO de comparação não carrega status:
a leitura de fontes continua sendo a superfície que informa retirada/conferência;
a presença na base não certifica disponibilidade nem verificação.

O alvo de proveniência `microsequence_explanation` reutiliza fontes, ocorrências,
bibliografia e acesso a PDF/áudio. A projeção de revisão não expõe identificadores
privados da pessoa revisora. O manifesto declara 50 capacidades em ordem canônica.
Provas transacionais locais cobrem upgrade, autoridade, replay, conflito focal,
atomicidade, leitura elegível e cópia; publicação hospedada e clientes reais
continuam sujeitos aos gates da candidata integrada. Essas provas não demonstram
aprendizagem nem substituem a inspeção humana do conteúdo.

## 20260907031059 — declaração do contrato de conflitos HTTP 409

O manifesto passa a anunciar `course-business-conflicts-http-409-v1`, com 48
capacidades em ordem canônica e `contractVersion: 1`. A declaração exige o
manifesto 20260905163000 e a migration de conflitos 20260907013604 aplicada,
incluindo o código PT409 no leitor corrente de fontes. Somente o corpo do
manifesto muda; identidade, proprietário, permissões e demais metadados da
função são conferidos dentro da transação. Dados e escritores permanecem.

A comparação hospedada e o ensaio de restauração exigem a revisão e as
capacidades exatas; a cadeia pendente termina nesta declaração. A migration
não reaplica a transformação dos conflitos nem substitui a prova de restauração.

## 20260905163000 — ordem canônica das capacidades

O manifesto conserva suas 47 capacidades e as ordena com collation `C`, sem
depender da configuração linguística do banco restaurado. O complemento não
altera conteúdo, permissões ou arquivos. A verificação das fronteiras passa a
exigir o leitor de analytics v4, que substituiu v3 na etapa de comparação.

## 20260905162000 — grupos de ajustes e catálogo 1.2.1

A apresentação separa explicações, prática, leitura e estilo, conversa e
produção. A migração verifica as doze definições anteriores e altera somente
rótulos e grupos. Identidades, tipos, valores, escopos, padrões e definições
operacionais permanecem iguais. A restrição do catálogo é atualizada e a
imutabilidade volta a valer dentro da mesma transação.

O leitor publica 1.2.1. O escritor reconhece também snapshots 1.2.0 com a mesma
semântica, conservando sua versão literal; registros já aplicados não são
reescritos. O manifesto exige 47 capacidades na revisão 20260905162000.

## 20260905154944 — base de autoria, comparação e exportação

Analytics v4 inclui a base curricular do curso, os inventários declarados e as
escolhas solicitadas e aplicadas. A projeção distingue ausência de declaração,
não aplicabilidade e valor zero. Leituras e exportações vinculam identidade,
escopo e revisão; uma revisão concorrente interrompe o resultado.

Comparações entre cursos próprios apresentam diferenças factuais e seus
alvos. Igualdade de inventário não certifica equivalência semântica ou eficácia
pedagógica. A exportação preserva o documento didático literal e a base de
autoria, sem anexar observações pessoais, identificadores de ator ou URLs
assinadas de arquivos.

## 20260905145236 — cópias independentes e referências de arquivos

O proprietário pode copiar seu curso. Outra pessoa precisa de permissão de
cópia explícita, separada da leitura; concessões anteriores começam com essa
permissão desabilitada. A cópia cria um curso independente com conteúdo,
planejamento, parâmetros, fontes e referências úteis, sem copiar progresso,
observações pessoais ou concessões de acesso da origem.

A confirmação usa revisão e identidade do pedido para evitar uma segunda
cópia após resposta perdida. PDFs e áudios mantêm referências físicas com
controle de acesso lógico por curso. A remoção de um curso preserva arquivos
ainda referenciados por outra cópia; a última referência participa da limpeza
retomável. Não há exclusão geral por prefixo desses arquivos.

O conjunto das três migrações foi ensaiado sobre backup restaurado e aplicado
localmente, conservando os digests das 25 tabelas de dados úteis anteriores.
As provas focais não representam implantação hospedada ou aceite da release.

## 20260905125617 — reorganização de partes e entrada contextual da inspeção

A reorganização reutiliza o escritor de partes existente para dividir, reunir
e reordenar agrupamentos de microssequências. O ajuste torna a ordem determinística
e preserva IDs, hierarquia, conteúdo, fontes, decisões aplicadas e snapshots
históricos das unidades. Revisão concorrente é recusada; recibos recuperam o
resultado original sem repetir a mudança.

O leitor de inspeção v2 recebe a opção `latest_updated`. Ela escolhe, dentro do
escopo autorizado e da revisão solicitada, a unidade com atualização mais recente;
empates seguem a ordem curricular. A página e seus cursores continuam usando essa
ordem. A opção não se combina com âncora ou cursor explícitos e exige direção
forward. Chamadas anteriores conservam os defaults. As três assinaturas antigas
foram substituídas, sem overload paralelo nem tabela ou lista temporal nova.

A migração altera funções e conserva 599 objetos classificados no inventário e
44 capacidades no manifesto. O upgrade foi ensaiado sobre backup local restaurado,
e a prova SQL focal passou 46 verificações de reorganização, preservação histórica,
paginação, concorrência e permissões. A revisão foi aplicada localmente; isso não
certifica implantação hospedada ou jornada conversacional em cliente externo.

## 20260905114027 — áudio e ferramentas do catálogo

O curso passa a guardar a configuração explícita de voz e uma biblioteca privada
de áudio. As faixas usam hash, tamanho e tipo do arquivo; o catálogo também
preserva seu nome legível. WAV PCM e MP3 têm limite de 20 MiB por arquivo e
compartilham a cota de 64 MiB do curso com os PDFs.

A ingestão prepara uma reserva, confere os bytes armazenados e confirma a
identidade sob a revisão e o recibo do pedido. Retentativas conservam a mesma
intenção; envios expirados e remoções mantêm a identidade necessária à limpeza.
Uma exclusão de curso não admite que um upload tardio recrie objetos. A remoção
do arquivo conserva as referências das faixas, que passam a indicar indisponibilidade.

O proprietário pode consultar a biblioteca. Outros leitores recebem somente a
configuração de reprodução e os áudios vinculados à unidade autorizada. O acesso
público exige também a escolha explícita de arquivos disponíveis no curso.
URLs assinadas duram 60 segundos; revogação impede novas autorizações, sem
prometer retirar bytes já recebidos ou invalidar retroativamente uma URL emitida.

O catálogo gerado acrescenta áudio e quatro ferramentas compatíveis, totalizando
38 pacotes. A migração atualiza a versão das políticas correntes e conserva
literalmente as decisões históricas, referências, conteúdo, rascunhos e recibos.
Não acrescenta um segundo escritor de composição nem credenciais ao curso.

O upgrade foi ensaiado sobre backup local restaurado em contêiner sem rede.
Testes de banco verificam permissões, cotas, concorrência e recuperação; testes
de transporte distinguem prova simulada de leitura e reprodução reais. A revisão
`20260905114027` aplicada localmente não certifica implantação hospedada. A cópia
independente completa de cursos e arquivos será integrada à sua operação própria.

## 20260905101903 — referências e vínculos contextuais

O curso passa a definir o estilo das referências geradas. A fonte mantém sua
identidade e conserva o texto manual separadamente dos metadados bibliográficos.
Os nomes anteriormente informados em um campo único são preservados como nomes
literais, sem deduzir sobrenomes, instituições ou autoria adicional.

Os papéis efetivos pertencem a cada vínculo; o cadastro guarda somente sugestões
para novos usos. A migração transporta os papéis conhecidos para os vínculos
existentes e atribui identidades estáveis a esses usos. Uma obra pode aparecer
mais de uma vez no mesmo item, com relações, localizadores e trechos diferentes.
As âncoras podem identificar o arquivo lógico, independentemente da URL assinada.

Edição e reorganização mantêm a atribuição; ocorrências textuais conservam a
citação literal e seu contexto. A leitura resolve o trecho no catálogo de
componentes e sinaliza ambiguidade. Retirar um arquivo conserva sua referência
lógica; aposentar uma fonte mantém as citações já vinculadas. A exclusão de um
alvo com referências exige resolução explícita desses vínculos.

As leituras de fontes usam `aralearn.course-sources.v3`; as citações de Estudo
usam `aralearn.course-study-citations.v2`. O escritor corrente, suas permissões,
controle de revisão e recibos continuam sendo a única via de alteração. As
colunas substituídas são removidas após a conversão dos dados úteis.

Antes de aplicar, restaure um backup em ambiente isolado e ensaie a atualização
com dados existentes. Os testes de upgrade e SQL verificam conservação,
retentativa, conflitos, referências incompletas e permissões. O manifesto desta
etapa é `20260905101903`; a aplicação local não certifica a migração hospedada.

## 20260905094108–20260905095110 — decisão histórica e aplicação corrente

A preparação `20260905094108_normalize_applied_design_discriminator.sql`
identifica a forma produzida pelo escritor anterior e acrescenta o discriminador
que uma expressão SQL omitia. Nenhum valor, identidade ou horário é reinterpretado.
Formas desconhecidas interrompem o corte para reconciliação. A ordem dessa
preparação antes de `20260905094109_preserve_applied_design_on_focal_edits.sql`
é obrigatória no upgrade.

A decisão pedagógica histórica passa a ser preservada literalmente nas edições.
O core da composição conserva a aplicação semântica corrente somente quando
conteúdo, exceto o título, e posição na estrutura continuam idênticos. Mudanças
substantivas invalidam essa aplicação, sem apagar a decisão histórica. O wrapper
deixa de reescrever a data e de supor validade pelos componentes usados. Analytics
consome a aplicação corrente mantida pelo escritor. Aplicações que já estavam
fora da análise corrente permanecem excluídas após a mudança de critério.

A correção `20260905095110_correct_applied_design_discriminator.sql` agrupa
explicitamente o acesso ao objeto nas duas expressões de materialização e
comparação. Novas aplicações persistem o discriminador obrigatório, e o
constraint rejeita estados inválidos em vez de aceitar resultado SQL desconhecido.
Não há novo histórico universal, coluna de conteúdo ou caminho alternativo.

Antes do corte, mantenha backup privado com restauração ensaiada, confira a lista
completa e a ordem das migrations e valide o manifesto dessa etapa `20260905095110`.
Não remova a preparação nem marque uma migration como aplicada sem executá-la.

No banco local, os testes focais de materialização e edição passaram 46
verificações, e o manifesto passou 25. Incluem discriminação válida, título sem
alterar a decisão, prosa alterada com snapshot preservado e aplicação invalidada,
Analytics, repetição do recibo e conflito de revisão. As fixtures são revertidas
ao terminar. Essas provas não certificam a aplicação hospedada.

## 20260905091101 e 20260905092640 — catálogo único de componentes

O catálogo de componentes do banco passa a ser gerado pelo mesmo registro usado
pelo domínio e pelos clientes. Opções, versão e fingerprint dos esquemas são
projetados juntos; uma leitura corrente sem o fingerprint esperado ou com valor
divergente é rejeitada. As identidades e versões dos 33 pacotes permanecem
compatíveis. O parágrafo aceita a forma textual existente e a nova forma rica,
sem converter nem resumir o texto armazenado.

A migration `20260905091101_generated_resource_package_catalog.sql` atualiza
somente a versão do catálogo nas preferências correntes. Conserva valores,
origens, justificativas, horários, conteúdo e snapshots históricos. O preflight
rejeita referências removidas ou uma revisão de runtime inesperada, em vez de
descartar uma escolha existente. O catálogo gerado é conferido por
`scripts/syncResourcePackageCatalog.mjs` e pelo validador do runtime.

A correção incremental `20260905092640_deduplicate_rich_paragraph_catalog.sql`
deduplica a definição matemática no esquema rico, usando referências internas.
Atualiza o fingerprint e o manifesto sem alterar tabelas de conteúdo ou decisões.
A primeira migration, já aplicada localmente, permanece intacta.

O ensaio de upgrade PGlite passou três verificações: migração compatível,
preservação literal dos dados úteis e recusa dos estados incompatíveis. O
inventário real do banco local conservou os mesmos 552 objetos classificados.
Essa prova local não substitui backup, restauração ensaiada e conferência das
migrations pendentes antes da aplicação hospedada.

## 20260905083846 — escolha automática na aplicação contextual

A migration `20260905083846_contextual_automatic_design_application.sql` permite
que a materialização existente selecione valores automáticos no contexto da
unidade, registrando valor, origem e motivo no snapshot v2. Parte, lote e pausa
mantêm escopo de curso e valores independentes, sem exigir gravação prévia da
intenção delegada. Somente parâmetros cujo catálogo admite unidade podem gerar
atribuição local. Uma condição fixa conserva valor, origem, motivo e escopo;
conflitos de pesquisa precisam ser resolvidos antes de aplicar.

Conteúdo, escolhas e recibo permanecem na mesma transação e revisão. A repetição
de uma requisição confirmada retorna o recibo; uma nova requisição com revisão
antiga falha. A correção não altera dados existentes. Antes de aplicar, mantenha
backup com restauração ensaiada e confira que somente as migrations esperadas
estão pendentes; o manifesto final deste recorte é `20260905083846`.

O ensaio transacional passou 16 verificações. Após a aplicação local,
`009_runtime_manifest_test.sql` e
`015_contextual_automatic_design_application_test.sql` passaram 41 verificações,
incluindo aplicação pelo writer público, rejeição sem conteúdo parcial, fixação
preservada e resposta perdida. Fixtures sintéticas são revertidas ao terminar;
essa evidência não declara implantação hospedada.

## 20260905080544 — parâmetros por escopo e perfis de autoria

A migration `20260905080544_scoped_authoring_preferences_and_profiles.sql` projeta
o catálogo único 1.2.0, distingue intenção automática de valor fixo e substitui
os leitores e escritores de desenho e Analytics por contratos v3. Atribuições
existentes conservam valor e justificativa; o modo é derivado da origem anterior.
Condições de pesquisa incompatíveis são expostas e bloqueiam aplicação silenciosa.

Snapshots existentes passam ao contrato v2 mantendo somente o que foi registrado:
catálogo 1.0.0 para quatro parâmetros ou 1.1.0 para seis, com motivo nulo quando
ausente. Não se acrescentam escolhas retroativas, nem se alteram conteúdo,
versões ou aplicações. Recibos de desenho são migrados para permitir reconciliar
uma resposta perdida mesmo após a substituição das RPCs.

Perfis pertencem à conta, com até 32 nomes distintos e preferências tipadas.
CRUD usa revisão corrente e recibos existentes de 14 dias. A aplicação compara
as revisões do curso e do perfil, copia preferências e conserva exceções, salvo
remoção explicitamente selecionada. Pesquisa fica protegida. Reaplicação
equivalente é inócua; excluir ou editar o perfil não altera as cópias.

Antes do corte, confira as migrations pendentes e mantenha backup com restauração
ensaiada. Formatos históricos desconhecidos bloqueiam a migração para investigação.
O ensaio transacional de upgrade passou sete verificações; o banco local aplicado
passou 77 verificações focais em `009_runtime_manifest_test.sql` e
`014_authoring_preferences_and_profiles_test.sql`. Essas provas locais não
certificam implantação hospedada.

## 20260905062817 — identidade e acesso público

A migration `20260905062817_public_course_access_and_identity.sql` introduz identificadores escolhidos pelas pessoas e leitura pública de cursos. Perfis conservam UUID e avatar; o identificador inicial fica vazio até a escolha. Os nomes anteriores são preservados em `private.person_profile_identity_migration_backup`, sem permissão para clientes nem leitor de runtime. Cursos existentes e novos permanecem privados por padrão.

A publicação exige confirmação do proprietário e política explícita de arquivos. O bucket continua privado. Exceções de arquivo prevalecem sobre as da fonte; estas prevalecem sobre a política do curso. As RPCs públicas projetam somente dados de estudo. Visitantes não precisam de conta; pessoas autenticadas podem enviar suas próprias observações, sem editar o curso.

O vínculo das cópias próprias existentes migra para `courses.copy_origin`, antes da remoção da tabela de vínculos e do comando que criava cópias automaticamente. A projeção pública exclui essa origem. A recuperação é somente leitura: confirma o alvo ainda próprio por origem e hash da edição inicial, informa as revisões atuais e não reaplica o rascunho. Falta de prova produz `unresolved`, preservando a pendência local.

### Preflight e recuperação operacional

Antes de aplicar, é obrigatório manter backup verificado do banco e dos objetos necessários, com restauração ensaiada em ambiente descartável. Confira a lista de migrations pendentes e a revisão do manifesto. A aplicação é transacional e rejeita vínculos cujo proprietário diverge do ator ou cuja origem é o próprio alvo; esses casos exigem reconciliação comprovada antes do corte. Não deduza uma pessoa pelo nome ou e-mail e não descarte mappings incompatíveis para fazer a migration passar.

Não execute reset em um ambiente com dados a preservar. Uma reversão que restaure o escritor anterior depende do backup ensaiado e de uma janela de manutenção; trocar apenas o código não recompõe o schema retirado. O arquivo privado de nomes e `copy_origin` preservam dados úteis à migração, sem manter um caminho alternativo de runtime.

### Verificação focal

- `supabase test db supabase/tests/009_runtime_manifest_test.sql` verifica o manifesto e as fronteiras correntes.
- `supabase test db supabase/tests/011_public_course_access_test.sql` verifica identificadores, grants, publicação, negações, observações e acesso aos PDFs com fixtures sintéticas em transação.
- O ensaio de upgrade usa os arquivos `tests/fixtures/sql/011_public_access_upgrade_seed.sql`, `011_public_access_upgrade_preflight.sql`, `011_public_access_upgrade_assert.sql` e `011_public_access_upgrade_cleanup.sql`, nessa ordem relativa à aplicação da migration: seed e preflight antes; assert e cleanup depois. Eles usam uma lista literal de UUIDs reservados e ficam fora da descoberta normal dos testes do banco.

No ensaio local, passaram 63 verificações do estado final, 17 de upgrade e 2 de falha fechada. A recuperação foi comprovada também sem recibo temporário, após retirada da unidade e após remoção da origem, conservando o alvo próprio. Essa prova local não substitui a conferência do manifesto e dos clientes no ambiente de implantação.

## 20260905070040 — guarda de upload de avatar

A migration `20260905070040_fix_person_avatar_storage_profile_guard.sql` retira da policy de inserção do Storage a consulta direta a `person_profiles`, cuja leitura ampla foi revogada. Reutiliza a guarda protegida existente, que valida sessão, perfil e exclusão de conta sob lock. As condições de proprietário, caminho e bucket permanecem. Nenhum diretório de perfis é aberto.

O teste `supabase/tests/012_person_avatar_storage_policy_test.sql` passou 16 verificações locais: upload e leitura próprios, busca no contexto do curso, relação de compartilhamento, negações para outra pessoa e visitante, sessão expirada e bucket privado. Ele exercita policies com identidades sintéticas em transação; a transferência de bytes depende da jornada real de Storage.

## 20260905070507 — metadados atômicos e projeção de citações

A migration `20260905070507_atomic_course_metadata_and_public_citations.sql` estende o comando existente de composição com `courseMetadata: {title, objective}` opcional. Título, objetivo, entidades e atribuições usam a mesma transação, revisão esperada e recibo. A edição focal de unidade rejeita metadados do curso. A ausência do argumento conserva as chamadas existentes e seus hashes; as assinaturas substituídas são retiradas.

A projeção de citações deixa de expor `verificationExcerpt`, preservando o valor útil na tabela privada. O preflight confere as definições que serão transformadas e falha se os pontos esperados não existirem; não aplica uma reescrita parcial silenciosa.

## 20260905071622 — política pública de PDF independente da apresentação da referência

A migration `20260905071622_separate_public_file_policy_from_citation_display.sql` corrige a autorização de um PDF explicitamente liberado quando a fonte apresenta somente a citação. Para cursos públicos, a autorização segue a política de arquivo, fonte e curso, nessa precedência. A visibilidade editorial continua controlando a citação e sua URL; o acesso privado compartilhado conserva sua regra de link. O bucket continua privado e a assinatura exige autorização no servidor.

O teste focal `supabase/tests/013_atomic_course_metadata_test.sql` passou 28 verificações locais sobre as duas últimas correções: gravação somente de metadados, combinação com entidades e atribuições, idempotência, conflito de revisão, propriedade, rollback integral, chamadas sem o novo argumento, projeção anônima sem trecho privado e PDF autorizado por exceção do arquivo. Todos os dados sintéticos são revertidos pela transação de teste.

Estas correções são incrementais. Antes de aplicá-las, mantenha o backup e o ensaio de restauração exigidos acima, confira a lista exata de migrations pendentes e valide o manifesto final `20260905071622`. Não execute reset nem seed de upgrade sobre um ambiente que já recebeu estas migrations. As provas SQL locais e as jornadas com clientes reais complementam-se; nenhuma delas declara a implantação hospedada concluída.

## 20260907013604 — conflitos de aplicação com resposta finita

A migration `20260907013604_business_conflicts_use_http_409.sql` muda os conflitos deliberados de revisão e estado para `PT409`. A resposta HTTP 409 permite que o cliente releia o estado; usar `40001` nesses pontos podia manter a mesma consulta em repetição no transporte. As guardas de revisão, locks, permissões e recibos permanecem.

A transformação transacional se limita a 43 assinaturas correntes, com contagens prévias verificadas: 69 pontos de conflito e sete capturas ampliadas. Ela preserva os metadados das funções e os oito códigos JSON dos envelopes `PGRST`, incluindo o tratamento de serialização nativa. Nenhuma tabela de dados é modificada. A API reconhece o novo SQLSTATE como `stale_course_state`; banco e Edge devem ser promovidos de forma coordenada.

O teste `supabase/tests/024_business_conflicts_test.sql` verifica leitura com revisão divergente e atual, autorização, ausência de escrita nas leituras, os dois caminhos de captura, rollback e idempotência. Os testes dos comandos afetados conservam os casos de conflito. Essas provas locais não substituem backup/restauração e a validação HTTP no corte hospedado.
