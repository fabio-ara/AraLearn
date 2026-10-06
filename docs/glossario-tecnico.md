# Glossário técnico

Os termos estão organizados pelas relações que ajudam a compreender no AraLearn.
Conceitos de pesquisa educacional estão no [glossário de construtos](glossario-construtos.md).
Decisões de nomenclatura e equivalentes internacionais ficam no [vocabulário
controlado](vocabulario-controlado.md).

## Camadas do sistema

**Execução corrente (`runtime`).** Código, banco e serviços usados por uma versão.
A história de mudanças permanece no repositório e permite recuperar versões
anteriores.

**Interface cliente (`frontend`).** Código executado no navegador ou no aplicativo
Android para apresentar Estudo e Autoria. Coordena os componentes didáticos com o
estado mantido no dispositivo. A [arquitetura](arquitetura.md) distingue suas
responsabilidades das operações realizadas no servidor.

**WebView.** Componente Android que abre e executa uma interface web dentro do
aplicativo instalado. O AraLearn empacota nele os mesmos arquivos usados pelo site;
consulte o [aplicativo Android](../android/README.md).

**Serviço remoto (`backend`).** Parte do sistema que recebe pedidos do cliente,
confere sua autorização e salva ou consulta os dados. Na instalação corrente, o
PostgreSQL conserva os dados e os serviços do Supabase cuidam da identificação das
contas, dos arquivos e das funções remotas. O [guia de Supabase](supabase.md)
descreve essas responsabilidades.

**Domínio.** Regras do produto independentes da aparência da tela. Elas organizam
as relações do curso e as decisões de autoria que interface e serviços precisam
interpretar da mesma forma.

**Contrato fechado.** Estrutura que recusa campos e valores não declarados. O
navegador, as funções remotas e o banco conferem os mesmos dados segundo essas
regras. O [contrato de conteúdo](aralearn-contract.md) apresenta os formatos aceitos.

**Manifesto da execução.** Contrato que identifica a revisão da estrutura do banco
e as capacidades exigidas pelo site e pelas funções publicadas. O cliente confere
esses valores antes de usar o serviço.

## Formatos e identidades

**[JSON](https://developer.mozilla.org/pt-BR/docs/Learn_web_development/Core/Scripting/JSON).**
Formato textual que organiza dados em campos, listas e valores, como textos e
números. Por exemplo, `{"title":"Redes"}` associa o campo `title` a um texto. O
formato organiza a escrita; o esquema e as regras do AraLearn determinam se os
campos e suas relações são aceitos.

**UUID.** Identificador de 128 bits. O servidor usa UUIDs para manter a identidade
sem depender do título ou da posição do objeto. O contrato de autoria por conversa
resolve essas identidades a partir de referências reconhecíveis pela pessoa, como
título e posição. Veja [Estrutura curricular por referência](estrutura-curricular-por-referencia.md).

**SHA-256.** Função que produz uma impressão digital dos dados binários, ou bytes.
No AraLearn, ajuda a conferir a integridade de documentos e gravações de áudio.
Essa impressão digital é chamada de **hash**.

**Esquema (`schema`).** Em contratos de dados, descrição dos campos, tipos e valores
aceitos. No PostgreSQL, também designa um espaço que agrupa tabelas e funções, como
`public` e `private`. A validade estrutural confirma o formato; a correção factual e a
qualidade pedagógica são examinadas no conteúdo.

**Fonte canônica.** Registro ou definição que os demais componentes consultam
como referência para interpretar um dado ou uma regra.

## Curso e composição

**Curso (`course`).** Objeto que reúne o conteúdo e as relações mantidas pela
interface e pelos canais de autoria conectados. Sua identidade e propriedade
delimitam o objeto; o plano organiza o percurso e a composição guarda o conteúdo.
Os demais registros relacionam esse conteúdo à configuração, às fontes e às
observações. O [modelo didático](modelo-didatico.md) explica essa organização.

**Revisão do curso (`revision`).** Número inteiro que aumenta quando o curso é
alterado. Ao comparar a revisão que leu com a atual, uma operação detecta mudanças
feitas nesse intervalo. É um controle técnico, distinto da declaração humana de
revisão do conteúdo.

**Composição didática.** Estrutura curricular corrente, organizada em níveis que vão
do curso à unidade de estudo. Um tópico pode classificar conteúdo dentro da lição,
mas não acrescenta um nível ao percurso principal.

**Microssequência didática.** Conjunto de unidades que desenvolvem um objetivo
delimitado e compartilham uma explicação. É uma convenção de organização do
AraLearn, desenvolvida no [modelo didático](modelo-didatico.md#estrutura-do-percurso).

**Unidade de estudo (`StudyUnit`, `study_unit`).** Etapa salva do percurso, com
posição e endereço próprios. Pode apresentar explicações, representações,
atividades e retorno à resposta. Consulte o [modelo didático](modelo-didatico.md).

**Explicação (`explanation`).** Base explicativa salva de uma microssequência. Pode
ser produzida e revisada antes das unidades e aberta durante o estudo. Unidades
registram a base efetivamente usada na produção; alterar a explicação conserva
as unidades existentes até que sejam editadas. Consulte [Explicação e revisão
humana](explicacao-e-revisao-humana.md).

**Documento `aralearn.course.v1`.** Forma hierárquica aceita para intercâmbio e
composição de um curso, descrita no [contrato de conteúdo](aralearn-contract.md).

**Achatamento (`flatten`).** Conversão do documento hierárquico em linhas.
**Composição (`compose`)** é o caminho inverso. A ida e volta só é válida quando
recompõe um documento aceito pelo contrato.

**Cópia independente de curso.** Novo curso privado criado por uma ação explícita de
quem possui a origem ou recebeu permissão de cópia. Preserva conteúdo, estrutura,
configurações e arquivos autorizados, mas recebe identidade e propriedade próprias.
Acessos, progresso e observações pessoais ficam na origem. A edição do original
permanece reservada ao seu proprietário. Consulte
[persistência](persistencia-relacional.md#cópia-independente).

## Planejamento e produção

**Plano instrucional vivo.** Planejamento revisável que reúne a finalidade e as
condições de entrada do curso, seu mapa curricular e os registros que orientam
análise, prática e produção. O mapa pode estar em rascunho ou aprovado; a
[autorização para produzir](planejamento-contextual.md) determina como o trabalho
prossegue em cada estado.

**Parte de autoria.** Conjunto de trabalho que reúne uma ou mais microssequências
já existentes no mapa para planejar e produzir seu conteúdo. Partes podem ser
reunidas em um lote de produção. Esses agrupamentos podem ser redimensionados sem
mudar a hierarquia do currículo. Veja [Autoria contextual](autoria-contextual.md).

**Produção autônoma.** Trabalho autorizado expressamente pela pessoa para produzir
conteúdo sem aguardar a aprovação do mapa. Exige um mapa existente e conserva seu
estado de rascunho. As decisões de revisão humana continuam associadas aos objetos
que a pessoa efetivamente inspecionou.

**Unidade de análise (`instructional_analysis_unit`).** Recorte de conhecimento ou de
ação acompanhado no repertório do percurso. Pode ser introduzido, usado depois
de estabelecido ou retomado. O [protocolo de análise](desenho-instrucional-parametrizado.md#protocolo-de-unidade-de-análise)
define como identificar e justificar esses recortes no AraLearn.

**Requisito de evidência.** Operação e condições que uma atividade solicita para
examinar um objetivo de aprendizagem. Se o objetivo é comparar duas soluções, por
exemplo, o requisito pode pedir que o estudante justifique a escolha usando os
critérios apresentados. O requisito planeja uma oportunidade de prática; o resultado
efetivamente observado depende da resposta do estudante. Uma atividade de
consolidação só participa dessa relação quando seu requisito foi registrado.

**Materialização.** Gravação conjunta das unidades de uma parte, com as
decisões de desenho e os vínculos com as fontes. Pode reutilizar a explicação salva na
base preparada ou incluir uma base nova validada. Os registros da preparação e da
validação intermediárias têm finalidade de execução; o estado do produto conserva
o conteúdo e as escolhas aplicadas. Veja [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md#produção-incremental-por-partes).

**Repertório semântico.** Conjunto acumulado de conhecimentos necessários ao percurso,
com introduções, usos e retomadas. Numa comparação entre tetos de novidade, conservar
o repertório permite examinar sua distribuição pelas unidades, em vez de mudar
simultaneamente o conteúdo previsto. Veja [Comparar condições de desenho](experimentos-instrucionais-parametrizados.md).

## Configuração autoral

**Parâmetro de autoria.** Decisão configurável que orienta explicações, prática,
o desenho do conteúdo ou a organização do trabalho de autoria. O [catálogo de
parâmetros](desenho-instrucional-parametrizado.md#catálogo-corrente) desenvolve essas
funções. Teto de novidade, formas explicativas e oportunidades de prática registram
condições de desenho; resultados de aprendizagem exigem medidas próprias.

**Escopo.** Trecho ao qual uma escolha ou consulta se aplica. Pode abranger, por
exemplo, o curso ou uma microssequência. Os escopos admitidos dependem da operação
e do parâmetro, conforme [Parâmetros de autoria](parametros-de-autoria.md).

**Alvo editorial quantitativo.** Intenção flexível de palavras por resposta de autoria
ou por unidade de estudo. Serve para planejar a extensão; a necessidade do conteúdo
determina o tamanho final. Sua aplicação preserva as decisões explícitas e a
unidade didática do conteúdo; a qualidade é examinada por outros critérios.

**Configuração efetiva.** Orientação que resulta da definição local e da herança de
um escopo mais amplo. Pode fixar um valor ou manter a escolha automática ainda sem
valor decidido. A leitura informa a origem da orientação e se ela foi herdada.

**Valor aplicado.** Valor escolhido para produzir uma unidade e guardado com a
justificativa no registro de desenho aplicado. Quando a configuração é automática,
essa escolha considera o conteúdo e o contexto da microssequência ou unidade.
Alterar a configuração depois da produção conserva o registro anterior até uma
operação própria sobre o conteúdo. Consulte [Parâmetros de autoria](parametros-de-autoria.md).

**Herança.** Uso de uma decisão de alcance mais amplo, conforme as regras de
prioridade dos parâmetros. Um valor fixado na lição, por exemplo, permanece
aplicável mesmo quando a unidade delega a escolha ao assistente. Retirar uma
definição local permite resolver a configuração pelas demais decisões do percurso.
Consulte a [origem e a prioridade das escolhas](autoria-contextual.md#parâmetros-origem-e-persistência).

**Direção editorial.** Orientação qualitativa de extensão, estilo, títulos ou
organização, separada dos parâmetros com valores definidos e dos alvos editoriais
quantitativos. Preserva a novidade necessária e pode levar à criação de mais
unidades de estudo.

**Política de componentes.** Disponibilidade, preferência ou restrição corrente de
pacotes didáticos. A política ordena preferências entre componentes permitidos;
permissões e variedade têm controles próprios. Veja a [política do catálogo](desenho-instrucional-parametrizado.md#política-de-componentes-didáticos).

## Componentes didáticos

**Componente didático.** Parte modular do aplicativo que apresenta uma representação,
coleta resposta ou oferece retorno dentro de uma unidade de estudo. O
[catálogo de componentes](componentes-didaticos.md) descreve seus contratos e usos.

**Pacote de componente (`component package`).** Módulo versionado cujo manifesto o
identifica. O esquema e a normalização conferem os dados; a renderização os apresenta,
acompanhada das capacidades e dos exemplos documentados.

**Biblioteca de componentes.** Índice gerado dos manifestos e consultado sob demanda
quando a função instrucional exige comparar representações possíveis.

**Forma de resposta.** Contrato de interação da prática, como escolha, preenchimento
ou ordenação. Distingue-se do componente que apresenta conteúdo.

**Adequação contextual (`canonical`, `versatile`, `substitute`).** Relação entre uma
necessidade e um candidato específico, geral ou aproximativo. Uma forma substituta
pode exigir adaptação mesmo quando seus dados são válidos. A [seleção do componente](fundamentacao-pedagogica-dos-resources.md#2-da-tarefa-à-escolha-do-componente)
considera a relação que ele precisa preservar.

**HTML e [DOM](https://developer.mozilla.org/pt-BR/docs/Web/API/Document_Object_Model).**
HTML descreve a estrutura de uma página. Ao lê-lo, o navegador cria uma
representação dos elementos em memória, chamada DOM (*Document Object Model*).
O código da interface usa essa representação para localizar textos, botões e campos
e modificar seu conteúdo ou comportamento.

**Renderização.** Transformação dos dados em uma apresentação visível, como texto,
tabela ou diagrama. Os componentes didáticos executam essa tarefa a partir do
conteúdo estruturado do curso.

**Hidratação.** No funcionamento dos componentes do AraLearn, ligação dos
comportamentos aos elementos já apresentados. Uma atividade pode mostrar
alternativas, mas ainda precisar dessa ligação para reagir à escolha e oferecer
retorno. Uma interação obrigatória que não responde pode indicar falha nessa etapa.
O [contrato dos componentes](componentes-didaticos.md) descreve essas operações.

## Persistência local e navegação

**[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API).**
Interface do navegador para armazenar e consultar dados estruturados em transações.
No AraLearn, guarda a sessão e as páginas de navegação, os documentos recompostos
dos cursos e o estado pessoal, incluindo as filas de observações. Uma transação
confirma todas as suas alterações juntas ou as desfaz em caso de falha. A
[persistência](persistencia-relacional.md) descreve a separação entre esses registros.

**Cache.** Cópia usada para evitar uma nova leitura ou cálculo e reduzir a espera.
Pode ser reconstruída a partir de sua origem. Rascunhos e alterações ainda não
enviadas exigem outro cuidado, pois podem existir somente no dispositivo.

**Réplica local.** Cópia suficiente para leitura sem conexão. Uma nova composição só
substitui a revisão local válida depois de ser recomposta e validada.

**Migração local.** Transformação dos dados salvos no dispositivo durante a abertura
de uma versão nova do banco IndexedDB. A transação confirma a transformação inteira
ou conserva o estado anterior. Pendências de formatos antigos podem ser preservadas
como rascunhos recuperáveis, conforme o [procedimento de
atualização](persistencia-relacional.md#atualização-dos-dados-no-dispositivo).

**Fila de saída.** Intenções ainda não confirmadas pelo servidor. Estado pessoal e
observações usam filas próprias; rascunhos de conteúdo possuem recuperação própria.

**Estado pessoal de curso.** Documento por pessoa e curso com progresso e marcas para
rever. Sua alteração conserva a revisão autoral do conteúdo. Veja [Estado de estudo](estado-de-estudo-nao-punitivo.md).

**Paginação por cursor.** Leitura cuja página seguinte começa após uma chave estável.
O cursor indica onde continuar a consulta daquele recorte, independentemente da
posição curricular dos objetos.

**Deep link.** Endereço que abre curso, área e objeto reconhecível. O endereço pode
conter identificadores técnicos, mas a interface apresenta o nome do objeto.

**Posição local de Conteúdo.** Registro por dispositivo usado para retomar a unidade,
o deslocamento na tela e a revisão que estavam abertos.

## Concorrência e repetição segura

**Concorrência otimista.** Controle que compara o estado lido com o atual antes de
confirmar uma escrita. Se outra sessão alterou os dados nesse intervalo, é preciso
tratar o conflito antes de gravar. Veja [Escritas concorrentes](persistencia-relacional.md#escritas-concorrentes).

**Comparação e troca (`compare-and-swap`, CAS).** Operação que verifica a revisão
esperada e grava a mudança como um passo indivisível: outra escrita não pode ocorrer
entre a comparação e a troca. Isso impede que uma decisão baseada em dados antigos
sobrescreva uma mudança concorrente.

**Idempotência.** Propriedade de uma operação que pode ser repetida com o mesmo
pedido sem duplicar seu efeito. No AraLearn, a recuperação conserva a identidade
da tentativa para reconhecer uma gravação cuja resposta se perdeu.

**Recibo temporário.** Registro com prazo de retenção que permite recuperar o resultado
de uma escrita cuja resposta se perdeu. Liga a identidade do pedido ao seu conteúdo e
ao resultado original.

**Bloqueio consultivo transacional (`advisory lock`).** Recurso do PostgreSQL usado
pela aplicação para coordenar operações que precisam aguardar umas às outras.
Operações com a mesma chave de bloqueio aguardam sua liberação; o bloqueio termina
com a transação.

## Autenticação, acesso e segurança

**Autenticação.** Verificação da identidade de uma conta.

**Autorização.** Decisão sobre a permissão de realizar uma operação num curso
específico. Uma conta autenticada ainda precisa ter o acesso exigido pela operação.

**Proprietário (`owner`).** Conta que possui o curso, pode editá-lo na interface
ou pelos canais MCP/Actions e consultar seus indicadores de autoria.

**Acesso direto.** Relação curso–pessoa que concede estudo. A edição do original
continua sendo atribuição do proprietário; copiar exige permissão própria.

**[Segurança em nível de linha (`Row Level Security`,
RLS)](https://supabase.com/docs/guides/database/postgres/row-level-security).**
Políticas do PostgreSQL que restringem os registros acessíveis a cada papel e contexto
de autorização. Os privilégios determinam se uma operação pode alcançar a tabela; a
política determina quais registros ela pode ler ou alterar.

**Menor privilégio.** Cada papel recebe somente as permissões necessárias às suas
operações. No banco, isso delimita o acesso a tabelas e funções.

**Papel de serviço (`service_role`).** Autoridade administrativa restrita às Edge
Functions e testes locais; nunca pertence ao navegador ou ao modelo.

**Bucket privado.** Área de armazenamento que exige autorização para abrir seus
arquivos. Documentos em formato PDF, áudios de curso e avatares usam buckets
separados. O banco mantém os vínculos que autorizam a leitura de cada objeto.

## API, banco e funções remotas

**[Interface de programação de aplicações (API)](https://developer.mozilla.org/pt-BR/docs/Glossary/API).**
Conjunto de operações que um programa oferece a outro. No AraLearn, a interface usa
a API do curso para pedir ao servidor leituras e alterações, conforme os argumentos
e as permissões aceitos.

**[HTTP](https://developer.mozilla.org/pt-BR/docs/Web/HTTP).** Protocolo de comunicação
usado na Web. Organiza um pedido ao servidor e sua resposta, com endereço,
cabeçalhos, conteúdo e um código que indica o resultado. As APIs remotas do AraLearn
usam HTTP sobre uma conexão protegida por criptografia, chamada HTTPS.

**SQL.** Linguagem usada para consultar e alterar dados num banco relacional. No
AraLearn, funções SQL mantêm próximas dos dados as regras de gravação e acesso.

**[PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html).** Sistema
gerenciador de banco de dados relacional. No AraLearn, é a autoridade remota para
o conteúdo compartilhado dos cursos, o acesso, o estado pessoal sincronizado e os
registros de autoria.

**PostgREST.** Camada que expõe funções PostgreSQL por HTTP conforme privilégios e
políticas. O [guia de Supabase](supabase.md) explica esse caminho de acesso ao banco.

**RPC (`Remote Procedure Call`).** Chamada de uma operação executada em outro
processo ou servidor. No acesso ao banco do AraLearn, chama uma função PostgreSQL
que confere autorização e confirma alterações relacionadas na mesma transação.

**Edge Function.** Função HTTP executada no Supabase. API de curso, MCP e Actions
autenticam o pedido recebido e delegam aos mesmos casos de uso.

**Roteador de curso.** Camada que associa cada pedido HTTP ao caso de uso que o
atende, sem duplicar regras entre interface, MCP e Actions.

## MCP e Actions

**Model Context Protocol (MCP).** Protocolo pelo qual um cliente de IA descobre as
ferramentas de um serviço e solicita sua execução. Cada ferramenta informa os
argumentos que aceita; o servidor valida o pedido antes de operar sobre o curso.
A [referência do MCP](autoria-mcp.md) descreve sua utilização no AraLearn.

**Tarefa humana.** Operação de autoria descrita por sua finalidade e por referências
reconhecíveis, como título e posição. O catálogo é compartilhado por MCP e Actions; a
[referência do MCP](autoria-mcp.md) informa as tarefas atuais e a [referência de
Actions](autoria-actions.md) mostra sua projeção HTTP.

**Ferramenta MCP.** Forma pela qual uma tarefa do catálogo é oferecida no MCP, com
o schema de seus argumentos e a indicação de leitura ou escrita.

**Action.** Operação HTTP descrita em OpenAPI que encaminha uma ou mais tarefas ao
catálogo comum. OpenAPI descreve os caminhos, argumentos e respostas de uma API para
que clientes possam utilizá-la. No envio de arquivos, o canal pode adaptar a
referência temporária a um documento sem mudar a operação de autoria correspondente.

**Recurso MCP.** No AraLearn, conhecimento estável carregado sob demanda. O estado
mutável do curso é lido por tarefas próprias, conservando o recurso como referência
para compreender o trabalho.

**OAuth.** Protocolo de autorização usado para conectar a conta individual ao
cliente sem lhe entregar a senha. MCP e Actions possuem concessões próprias e
usam credenciais, chamadas de tokens, que não são intercambiáveis. Veja as
[integrações e seus acessos](privacidade.md#integrações-conversacionais).

**PKCE (*Proof Key for Code Exchange*).** Proteção da troca do código de
autorização. O cliente guarda um valor ao iniciar o acesso e precisa apresentá-lo
na troca; obter apenas o código de retorno não basta. O MCP usa o método S256,
que anuncia uma impressão digital desse valor no pedido inicial.

**Resposta de coordenação.** Retorno de uma tarefa que informa o resultado, oferece
link direto e apresenta a próxima decisão quando ela for necessária. Dados
estruturados acompanham a resposta para permitir a continuação do trabalho.

## Observações e revisão

**Observação.** Apontamento ligado ao conteúdo do curso. Uma observação autoral pode
expressar a mesma intenção para vários alvos, com uma decisão própria para cada um.
Observações de estudantes permanecem individuais. Consulte
[Observações e revisão](arquitetura.md#observações-e-revisão).

**Base de comparação da observação.** Registro anterior do conteúdo, fontes e arquivos
conservado enquanto há alvos pendentes que precisam dele. Uma decisão libera o vínculo
daquele alvo; a limpeza remove a base quando ela deixa de ser usada e verifica se seus
arquivos ainda precisam ser conservados por outro vínculo.

**Caixa de observações.** Consulta filtrável das manifestações correntes. Estado
aberto ou resolvido descreve o tratamento de cada contribuição. Alterar o conteúdo
exige uma operação própria.

**Revisão contextual.** Releitura do alvo e de unidades relacionadas pelo percurso
curricular e por elementos didáticos afetados, como exemplos e práticas, antes de
propor mudanças.

**Achado de revisão.** Problema concreto identificado durante a análise, com evidência
e proposta de correção. Pode ser registrado em uma observação para orientar o
trabalho e acompanhar a decisão sobre os alvos pertinentes.

**Declaração de revisão (`contentReview`).** Manifestação expressa da pessoa autora
de que inspecionou a explicação ou unidade salva. A marca pode ser retirada e fica
desatualizada quando sua base muda. A política de acesso determina separadamente se
o estudo exige revisão atual. Consulte [Explicação e revisão humana](explicacao-e-revisao-humana.md).

**Inspeção pedagógica por IA (`ai_inspection`).** Parecer sobre uma explicação ou
unidade, confrontada com seu percurso, configuração e fontes. Registra seis critérios
com justificativa e evidências textuais: alinhamento, evidência, representação,
feedback, suficiência e realização da configuração. Sua atualidade depende da base
inspecionada; a [arquitetura](arquitetura.md#inspeção-pedagógica-por-ia) explica o alcance.

**Base de inspeção (`pedagogicalBasis`).** Conjunto de dados correntes que permite
examinar o alvo em contexto. Inclui a microssequência, suas unidades em ordem, o
planejamento pertinente, as dependências e as fontes. `basisHash` é a impressão
digital usada para detectar se esse conjunto mudou depois da leitura.

**Atualidade do parecer.** Correspondência entre a base examinada e a base corrente.
`current` indica correspondência; `pending` pede nova inspeção; `unregistered`
indica ausência de registro. O resultado do parecer é informado separadamente por
`outcome`, permitindo reconhecer um parecer atual que ainda aponta problemas.

**Correção autoral.** Conjunto autorizado de mudanças em uma ou mais unidades ou
explicações. Depois da gravação, a reinspeção verifica os efeitos e o atendimento das
observações que motivaram a correção.

<a id="fontes-âncoras-e-pdfs"></a>

## Fontes, âncoras e documentos

**Fonte.** Cadastro corrente de uma obra ou material utilizado no curso. Pode ser
contestado, revisado, removido e reativado. A referência bibliográfica identifica a
obra; seus vínculos registram o uso feito no curso. Veja [Fontes, citações e referências](fontes-e-citacoes.md).

**Âncora.** Localização verificável dentro de uma fonte, como página, seção ou trecho.

**Atribuição de fonte.** Relação corrente entre fonte, âncora e objeto do curso, com
papel como apoio, contexto, contraste ou exemplo.

**Documento anexado.** Arquivo em formato PDF associado a uma fonte. Seu descritor
relacional o liga a um objeto privado no Storage. O serviço calcula tamanho e
SHA-256 e determina o caminho de armazenamento.

**Tombstone de anexo.** Estado relacional que registra a remoção do vínculo para
impedir novas leituras e coordenar a limpeza física do arquivo.

**Intenção de envio ou exclusão.** Registro temporário aberto enquanto uma operação
com bytes precisa ser concluída ou recuperada. As intenções são removidas conforme
seus prazos de retenção e encerramento.

**URL assinada.** Endereço temporário de leitura emitido depois da autorização.
Serve para abrir o arquivo naquela ocasião; sua identidade permanece no descritor,
separada do endereço transitório.

**Objeto órfão.** Arquivo no Storage sem vínculo ativo nem reserva que justifique sua
conservação. O serviço confere referências de todos os cursos e remove o objeto
somente pela API do Storage. O nome da pasta, isoladamente, não permite classificá-lo.

## Analytics e pesquisa

**Análise de autoria (`analytics`).** Leitura quantitativa do desenho corrente e das
intervenções registradas. O painel **Dados de autoria** apresenta dimensões, como
novidade declarada e prática, dentro do recorte escolhido. Consulte
[Dados de autoria](analytics-instrucionais.md).

**Escopo de analytics.** Curso, parte, microssequência ou unidade escolhida para o
recorte. Dados que não podem ser atribuídos aparecem como ausentes, distintos de
uma contagem conhecida igual a zero.

**Parâmetros definidos.** Quantidade de condições pedagógicas explicitamente fixadas
no estado corrente.

**Origem observável de uma unidade de estudo.** Classificação factual da criação e
da última edição como manual ou assistida quando o estado permite essa atribuição.
A classificação identifica a origem registrada; proporção de texto ou esforço de
cada participante exigem medidas próprias.

**Snapshot de análise.** Registro estruturado dos dados e das contagens de um recorte
numa revisão do curso. A ação **Exportar curso e análise** inclui esse registro e
também o documento integral do curso, acompanhado dos vínculos com fontes e bases
explicativas, das escolhas aplicadas e da revisão humana. Os bytes dos anexos ficam
fora do arquivo.

**Condição de pesquisa.** Conjunto de escolhas fixadas para examinar uma diferença
numa comparação deliberada. Cursos privados independentes permitem conservar os
materiais de condições distintas. A atribuição de participantes, as medidas e as
inferências pertencem ao protocolo do estudo. Veja [Comparar condições de desenho](experimentos-instrucionais-parametrizados.md).

## Backup e restauração

**Backup lógico.** Arquivo de cópia do estado PostgreSQL, chamado de *dump*. Preserva
dados relacionais e metadados do Storage; os bytes dos arquivos exigem uma cópia
própria. Veja [Backup e restauração](persistencia-relacional.md#evolução-backup-e-restauração).

**Restauração de upgrade.** Ensaio que restaura um backup anterior num banco
descartável, aplica as transformações da estrutura e verifica o estado útil
corrente. Essas transformações são registradas como migrações.

**Fronteira de Storage.** Separação entre descritores no banco e bytes nos buckets.
O backup dos arquivos exige procedimento próprio, e as alterações em seus bytes
sempre passam pela API do Storage.
