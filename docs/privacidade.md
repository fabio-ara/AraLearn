# Privacidade e tratamento de dados

## Para que este documento serve

O AraLearn conserva apenas os dados necessários para identificar uma pessoa,
autorizar o acesso a um Curso, retomar o Estudo e continuar a Autoria. Esta
descrição se refere ao comportamento implementado no código. Uma instituição
que implante o sistema precisa acrescentar sua base jurídica, seus prazos de
retenção, seus responsáveis e seus canais de atendimento.

Privacidade não é apenas esconder campos na interface. Ela depende de
minimização de dados, finalidade explícita, isolamento no banco e informação
compreensível para quem participa de uma atividade educacional
([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical);
[Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

## Conceitos essenciais

**Dado pessoal** é uma informação que identifica uma pessoa ou pode ser
relacionada a ela. No AraLearn, exemplos são o endereço de e-mail da conta, o
identificador interno, o nome de apresentação e a imagem de perfil.

**Proprietário do Curso** é a única pessoa autorizada a alterar o planejamento
e o conteúdo desse Curso. A propriedade também permite conceder a outras
pessoas acesso direto ao Estudo.

**Acesso ao Estudo** permite abrir e praticar um Curso compartilhado. Não
transforma a pessoa em coautora e não permite que ela abra o Curso na Autoria.

**Estado pessoal de Estudo** é o conjunto de informações da própria pessoa
necessário para continuar sua atividade: ponto de retomada, unidades
concluídas e marcações **Rever**. O documento v2 não contém observações, não é o
conteúdo do Curso e não é compartilhado entre estudantes.

**Anotação ancorada** é o registro protegido de uma Observação ligada a um alvo
do Curso. Ela usa persistência própria porque precisa chegar à caixa de entrada
do proprietário sem revelar a estudantes os registros de colegas.

**Auditoria e correção** formam um ciclo privado do proprietário sobre uma
Unidade focal. Rodadas, achados, vínculos com Observações e correções possuem
autoridades separadas e nunca são projetados para estudantes.

**Réplica local** é a cópia mantida no dispositivo para abertura rápida e uso
sem conexão. Ela não substitui uma cópia de segurança: uma alteração ainda não
sincronizada pode existir somente naquele dispositivo.

## Quais dados são tratados

| Finalidade | Dados | Onde ficam |
|---|---|---|
| autenticar a conta | e-mail, credencial e sessão | Supabase Auth e armazenamento seguro da sessão no dispositivo |
| apresentar a pessoa | identificador, nome de apresentação opcional e referência do avatar | PostgreSQL |
| exibir o avatar | arquivo JPEG, PNG ou WebP de até 512 KiB | bucket privado `person-avatars` |
| identificar o Curso | proprietário, título, objetivo, orientações e composição didática | PostgreSQL |
| documentar Fontes e proveniência | revisões de Fonte, metadados, URL, Âncoras, trecho privado de verificação e atribuições por alvo | PostgreSQL privado; arquivos externos não são copiados para o Storage |
| autorizar o Estudo | Curso, pessoa favorecida, concedente e momento da concessão | PostgreSQL |
| retomar o Estudo | posição, conclusões e marcações **Rever** | PostgreSQL e réplica local |
| registrar e triar Observações | alvo, origem/canal, texto corrente, categoria, estado, classificação, resposta, versões e metadados mínimos | PostgreSQL privado; cache e outbox próprios no dispositivo |
| auditar e corrigir uma Unidade | critério, resultado, evidência, IDs/versões de Observações selecionadas, versões de achado e correção e checkpoint focal | PostgreSQL privado e owner-only; nenhum cache ou outbox no dispositivo |
| aplicar alterações com segurança | revisão esperada, identificador do pedido, evento e recibo técnico temporário | PostgreSQL privado |

### Identidade humana mínima

Uma conta recebe automaticamente um perfil vazio vinculado ao identificador do
Auth. O sistema não inventa um nome a partir do endereço de e-mail. A própria
pessoa pode depois informar um nome de apresentação e escolher um avatar.

O endereço de e-mail continua no serviço de autenticação. Ele não é copiado
para o perfil público do produto.

### Localização por e-mail para conceder acesso

O proprietário digita o endereço exato da pessoa a quem quer conceder acesso.
O banco usa esse valor apenas para localizar uma conta já existente. Não há
pesquisa parcial, lista de diretório nem sugestão de contas.

Depois da operação, a relação de acesso conserva identificadores internos, e
não o e-mail. Eventos e recibos técnicos de concessão ou revogação também não
armazenam nem devolvem o endereço digitado. A interface passa a mostrar o nome
de apresentação e o avatar permitidos pela relação direta entre as pessoas.

### Quem pode ver perfil e avatar

Uma pessoa pode ver o próprio perfil. Em relação a um Curso compartilhado:

- o proprietário pode ver o perfil das pessoas às quais concedeu acesso;
- cada pessoa favorecida pode ver o perfil do proprietário;
- uma pessoa favorecida não pode ver as demais pessoas favorecidas.

Essa regra é aplicada no banco por **Row Level Security** (RLS), e não apenas
pela ausência de um botão. O bucket de avatar é privado e repete a mesma regra.

O caminho de um avatar tem a forma `<identificador-da-pessoa>/<uuid>.<extensão>`.
Cada envio cria uma chave nova e não sobrescreve silenciosamente um arquivo
existente. O upload é autenticado e vai diretamente ao Storage; não existe URL
pública nem função intermediária apenas para transportar os bytes.

### Propriedade e compartilhamento do Curso

Todo Curso nasce privado. A pessoa proprietária é a única que pode:

- vê-lo na Autoria;
- alterar planejamento ou composição;
- usar as ferramentas autorais do MCP sobre ele;
- listar, conceder ou revogar acessos ao Estudo.

Uma pessoa favorecida pode listar e abrir o Curso apenas no Estudo. A resposta
de Estudo não contém orientações privadas de Autoria nem estado autoral.

### Fontes na Autoria e no Estudo

Somente a pessoa proprietária acessa catálogo, histórico, Fonte oculta, legado
não resolvido, trecho de verificação, ator e controles de edição. O Estudo não
recebe esse conjunto ao abrir o Curso. Quando a pessoa abre **Fontes** numa
Unidade, uma RPC revalida o acesso e entrega apenas a projeção autorizada:

- Fonte `hidden` ou `unresolved_legacy` é omitida;
- `citation` apresenta citação e localização, mas URL nula;
- `citation_and_link` pode apresentar também a URL;
- histórico, trecho privado, ator, canal e edição permanecem ausentes.

A projeção vale para a Unidade e revisão correntes. Revogação, 404 ou outra
perda de autoridade aciona a mesma purga local do Curso. O AraLearn conserva
metadados e links, não uma cópia dos bytes apontados pela Fonte; o site externo
possui tratamento de dados próprio quando o link é aberto.

Conceder ou revogar exige confirmação humana explícita. Revogar remove o acesso
ao conteúdo, mas preserva no servidor o estado pessoal daquela pessoa. Na
próxima validação com conexão, uma resposta de acesso negado elimina do
dispositivo o cabeçalho, as entidades, as listas, o cache e a outbox de
anotações daquele Curso. Isso
impede que uma cópia antiga continue aparecendo como autorizada. Se o acesso
for concedido novamente, o estado pessoal remoto pode voltar a ser usado.

### Estado pessoal e fila Rever

O estado pessoal pertence ao par pessoa–Curso. Ele contém dados funcionais de
continuidade, e não uma telemetria completa de comportamento. A implementação
canônica não registra automaticamente tempo de permanência, cada toque, cada
tentativa ou uma inferência de atenção.

A fila **Rever** é montada no servidor a partir das marcações da própria pessoa
e chega ao cliente em páginas pequenas. O aplicativo não precisa baixar todos
os Cursos para descobrir quais unidades foram marcadas.

### Anotações ancoradas e identidade protegida

Cada estudante lê somente as próprias anotações. O proprietário lê todas as
anotações do Curso para triagem; coestudantes nunca leem registros uns dos
outros. No DTO owner-only, a identidade protegida é
`contributor={kind:'protected_person',role,ref,label}`. `ref` é o pseudônimo
aleatório persistido `person-` seguido de 16 dígitos hexadecimais; não é
derivado de Curso/UUID, não é UUID ou e-mail e não é reversível pelo contrato.
Conhecer o UUID do roster não permite correlacioná-lo. A interface mostra
somente o `label` pseudônimo protegido, por exemplo “Estudante 7A3F”; não mostra
`ref`, UUID ou e-mail.

O contador global do conjunto é entregue somente ao proprietário. Estudo usa
um contador monotônico privado por pessoa e Curso, junto do `protected_ref`
aleatório persistido: atividade de terceiros não o altera nem pode ser inferida pela
paginação, pelo cache ou pela coordenação entre abas. Essa relação possui RLS
forçada e nenhum grant direto; ela coordena a projeção self-only, não guarda
texto e não cria outra autoridade de domínio. Para preservar monotonicidade do
cache, a linha fica até a exclusão da pessoa ou do Curso e não participa do TTL
de conteúdo, tombstone ou recibo.

Enquanto o estado é aberto, considerado ou resolvido e o Curso existe, o
servidor conserva texto corrente, síntese e resposta necessários à função.
Eventos de revisão guardam hashes e metadados limitados, não versões anteriores
do texto bruto. Retirar redige imediatamente texto, síntese e resposta e cria
um tombstone. Tombstone e recibo expiram logicamente em até 14 dias: deixam de
ser legíveis, pagináveis, contar quota ou admitir replay. A limpeza física da
linha e dos eventos é oportunista quando o Curso é lido ou alterado e processa
por toque um lote de até 128 tombstones e 256 recibos expirados. Um Curso
inativo pode conservar lixo físico porque não existe cron nem promessa de hard
delete em até 14 dias.

Excluir a conta retira e redige imediatamente suas contribuições, que seguem a
mesma janela de limpeza. Excluir o Curso remove suas anotações por cascade.
Registros ativos ou resolvidos não expiram automaticamente por idade: a
instituição precisa declarar sua política de retenção operacional.

O AraLearn não cria cópia de pesquisa por padrão. Qualquer reutilização exige
protocolo explícito, minimização, governança e nova autorização aplicável.
Quantidade, ausência, categoria, estado, resposta, resolução e timestamps não
medem aprendizagem, dificuldade, atenção, qualidade ou eficácia pedagógica; o
instante capturado é uma pista de contexto, não duração de sessão.

### Privacidade de auditoria, achados e correções

Somente o proprietário do Curso lê ou altera o ciclo. As relações privadas de
rodadas, versões de achado, junção achado–Anotação e versões de correção usam
RLS forçada e não possuem grants diretos. Estudantes não recebem contador,
lista, deep link, evidência ou estado desse ciclo.

A junção guarda apenas a identidade e a versão da Anotação selecionada. Não
copia texto, síntese, resposta, pseudônimo, papel ou identidade pessoal. Se a
Anotação for retirada, enquanto o tombstone ainda existir a projeção do achado
indica `available: false` e `deepLink: null`. Quando a limpeza física apagar a
Anotação, `ON DELETE CASCADE` remove somente a junção: o vínculo e o ID deixam
as projeções futuras, mas rodada, achado e correção continuam preservados.

Uma sugestão de resolver ou reabrir a Anotação não produz mudança implícita.
Ela exige outra ação humana ou comando de Anotações com a versão corrente. Isso
preserva a autoridade e a retenção próprias da Observação.

Evidência factual positiva referencia somente Fonte e Âncora ativas na revisão
exata. O ciclo não copia o arquivo da Fonte nem transforma `quoted_from` em
prova geral: essa relação só verifica fidelidade de citação; afirmações exigem
`supported_by`.

Correções guardam snapshots focais `before|after` do conteúdo e das atribuições
de Fontes da Unidade, não uma cópia integral do Curso ou da conversa. Somente
aplicação e rollback criam evento de Curso e reutilizam o recibo técnico já
existente. Registrar auditoria, decidir, propor, rejeitar ou verificar não cria
atividade de conteúdo.

Auditoria e correções são online-only. O IndexedDB não contém store, cache
autoritativo, réplica ou outbox delas. As rotas profundas continuam sujeitas à
sessão e à propriedade; possuir um `findingId`, `auditRunId` ou `correctionId`
não concede acesso.

### Autoria, eventos e recibos

Uma alteração de Curso informa a revisão que foi lida. O servidor só grava a
mudança se essa revisão ainda for a corrente. Esse controle, chamado
**compare-and-swap** (CAS), evita que uma escrita apague silenciosamente outra
mais recente.

Um identificador de pedido permite repetir com segurança uma solicitação após
falha de rede. O recibo técnico tem prazo de validade e registra somente o
necessário para reconhecer a repetição. Os eventos canônicos registram a
operação e um resumo limitado; não são uma cópia de conversa, não formam um
segundo Curso e não devem conter e-mail.

### Assistência por MCP

O MCP de Autoria recebe apenas Cursos pertencentes à pessoa autenticada. Um
Curso compartilhado para Estudo não aparece em listagens, links profundos ou
leituras autorais. As mesmas regras de alteração e de acesso usadas pela
interface são aplicadas no servidor.

Quando um provedor externo de modelo de linguagem participa do processo, o
conteúdo enviado também fica sujeito às regras desse provedor. A pessoa deve
evitar inserir segredos ou dados pessoais desnecessários e revisar a proposta
antes de incorporá-la. Sistemas assistidos exigem finalidade delimitada,
supervisão humana e comunicação de limitações
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## O que permanece no dispositivo

O navegador e o aplicativo Android mantêm:

- sessão autenticada;
- cache de listas, cabeçalhos e páginas de composição de Cursos;
- estado pessoal e alterações que aguardam sincronização;
- cache, outbox e handoff transitório de Anotações ancoradas;
- arquivos estáticos necessários ao funcionamento da interface.

Rodadas, achados, correções, checkpoints e seus vínculos não entram nessa lista.

O IndexedDB permite transações e sobrevive ao fechamento da página. Limpar os
dados do aplicativo pode apagar uma alteração que ainda não chegou ao servidor.
Sair da conta encerra a sessão, mas não significa, por si só, que todo dado do
dispositivo ou do servidor foi excluído.

## Operações controladas pela pessoa

### Alterar nome ou avatar

1. Abra a área de conta.
2. Edite o nome de apresentação ou escolha uma imagem JPEG, PNG ou WebP de até
   512 KiB.
3. Salve a alteração.

O novo avatar recebe uma chave própria. Somente a própria pessoa pode enviar ou
remover objetos em sua pasta.

### Conceder acesso ao Estudo

1. Abra um Curso próprio na Autoria e escolha **Pessoas**.
2. Informe o e-mail exato de uma conta existente.
3. Confira o Curso e o destinatário apresentados na confirmação.
4. Confirme a concessão.

O destinatário passa a ver o Curso no Estudo, mas não na Autoria.

### Revogar acesso ao Estudo

1. Na área **Pessoas** do Curso, escolha a pessoa.
2. Leia o aviso de que o estado pessoal será preservado.
3. Confirme a revogação.

A autorização termina imediatamente no servidor. Um dispositivo offline ainda
pode conter uma réplica antiga, que é purgada quando a autorização for validada
novamente com conexão.

### Excluir a própria conta

A exclusão é uma ação humana destrutiva e não é exposta ao MCP.

1. Abra a área de conta.
2. Escolha **Excluir conta**.
3. Digite exatamente `EXCLUIR MINHA CONTA`.
4. Confirme somente se a exclusão for intencional.

O cliente remove primeiro os objetos privados de avatar. O banco recusa apagar
a conta enquanto ainda houver um desses objetos. Depois, a conta do Auth é
excluída e as relações dependentes seguem as regras de integridade do banco:
perfil, Cursos próprios, composição, acessos e estados vinculados a Cursos
removidos deixam de existir. Contribuições em Cursos alheios são retiradas e
redigidas imediatamente e expiram logicamente na janela de 14 dias; a limpeza
física é oportunista. A réplica local é limpa somente depois da resposta de
sucesso do servidor.

A operação exige conexão e não oferece restauração automática. Logs técnicos,
backups e retenções do provedor de infraestrutura podem seguir prazos próprios;
por isso uma implantação não deve prometer eliminação instantânea dessas
camadas sem verificar sua política operacional.

## Limites e responsabilidades institucionais

O código controla acesso técnico, mas não decide sozinho se determinado uso de
dados educacionais é ética ou juridicamente adequado. A instituição responsável
deve informar finalidade, base jurídica, retenção, contato, procedimento de
incidente e condições de uso de provedores externos.

Dados exportados ou copiados para fora do AraLearn deixam de ser protegidos
pelas políticas RLS deste sistema. Uma autorização técnica para consultar um
dado também não autoriza reutilizá-lo para outra finalidade.

## Como comunicar um problema de privacidade

1. Registre versão, dispositivo, operação e resultado observado.
2. Substitua nomes, e-mails, tokens e conteúdo privado por exemplos fictícios.
3. Use o canal da instituição responsável pela instalação.
4. Para um defeito no código público, use o rastreador de issues do repositório.

Se uma credencial tiver sido exposta, revogue-a ou substitua-a. Apenas editar
uma mensagem ou um arquivo não garante que cópias anteriores tenham sido
eliminadas.
