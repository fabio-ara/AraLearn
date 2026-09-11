# Glossário técnico

Este glossário define mecanismos da execução corrente do AraLearn. Conceitos de
pesquisa educacional estão no [glossário de construtos](glossario-construtos.md).
Decisões de nomenclatura e equivalentes internacionais ficam no [vocabulário
controlado](vocabulario-controlado.md).

## Camadas do sistema

**Execução corrente (`runtime`).** Código, banco e serviços usados por uma versão.
A história de mudanças permanece no repositório e permite recuperar versões
anteriores.

**Interface cliente (`frontend`).** Código executado no navegador ou no WebView
Android. Inclui Estudo, Autoria, componentes didáticos e persistência local.

**WebView.** Componente Android que abre e executa uma interface web dentro do
aplicativo instalado. O AraLearn empacota nele os mesmos arquivos usados pelo site;
consulte o [aplicativo Android](../android/README.md).

**Serviço remoto (`backend`).** Funções que autenticam, autorizam, validam e persistem
operações. O AraLearn usa PostgreSQL, Auth, Storage e Edge Functions do Supabase.

**Domínio.** Regras do produto independentes da aparência da tela, como composição,
resolução de parâmetros, fontes, observações e Analytics.

**Contrato fechado.** Estrutura que recusa campos e valores não declarados. Evita
interpretações diferentes entre navegador, Edge Function e banco.

**Manifesto da execução.** Contrato que informa a revisão mínima do esquema e as
capacidades exigidas pelo site e pelas funções publicadas.

## Formatos e identidades

**[JSON](https://developer.mozilla.org/pt-BR/docs/Learn_web_development/Core/Scripting/JSON).**
Formato textual que organiza dados em campos, listas e valores, como textos e
números. Por exemplo, `{"title":"Redes"}` associa o campo `title` a um texto. O
formato organiza a escrita; o esquema e as regras do AraLearn determinam se os
campos e suas relações são aceitos.

**UUID.** Identificador de 128 bits. O servidor usa UUIDs para manter identidade sem
depender de título ou posição; o contrato conversacional resolve essas identidades a
partir de referências humanas.

**SHA-256.** Função que produz uma impressão digital dos bytes. No AraLearn ela ajuda
a conferir a integridade de PDFs e áudios.

**Esquema (`schema`).** Em contratos de dados, descrição dos campos, tipos e valores
aceitos. No PostgreSQL, também designa um espaço que agrupa tabelas e funções, como
`public` e `private`. A validade estrutural do conteúdo não demonstra correção factual
ou qualidade pedagógica.

**Fonte canônica.** Registro ou definição que os demais componentes consultam
como referência para interpretar um dado ou uma regra.

## Curso e composição

**Curso (`course`).** Objeto que reúne o conteúdo e as relações mantidas pela
interface, pelo MCP e por Actions. Possui proprietário, título, objetivo, revisão e
relações próprias para plano, composição, configuração, fontes e observações.

**Revisão do curso (`revision`).** Número inteiro que aumenta quando o curso é
alterado. Ao comparar a revisão que leu com a atual, uma operação detecta mudanças
feitas nesse intervalo. É um controle técnico, distinto da declaração humana de
revisão do conteúdo.

**Composição didática.** Estrutura corrente de curso, módulo, lição, microssequência
didática e unidade de estudo. Um tópico pode classificar conteúdo dentro da lição, mas
não acrescenta um nível ao percurso principal.

**Unidade de estudo (`StudyUnit`, `study_unit`).** Etapa salva do percurso, com
posição e endereço próprios. Pode apresentar explicações, representações, atividades e
retorno à resposta. Consulte o [modelo didático](modelo-didatico.md).

**Explicação (`explanation`).** Base explicativa salva de uma microssequência. Pode
ser produzida e revisada antes das unidades e aberta durante o estudo. Unidades
registram a base efetivamente usada na produção; alterar a explicação não reescreve
automaticamente as unidades. Consulte [Explicação e revisão
humana](explicacao-e-revisao-humana.md).

**Documento `aralearn.course.v1`.** Forma hierárquica aceita para intercâmbio e
composição de um curso.

**Achatamento (`flatten`).** Conversão do documento hierárquico em linhas.
**Composição (`compose`)** é o caminho inverso. A ida e volta só é válida quando
recompõe um documento aceito pelo contrato.

**Cópia independente de curso.** Novo curso privado criado por uma ação explícita de
quem possui a origem ou recebeu permissão de cópia. Preserva conteúdo, estrutura,
configurações e arquivos autorizados, mas recebe identidade e propriedade próprias.
Acessos, progresso e observações pessoais ficam na origem. Editar um curso
compartilhado não cria cópia automaticamente. Consulte
[persistência](persistencia-relacional.md#cópia-independente).

## Planejamento e produção

**Plano instrucional vivo.** Planejamento revisável com público, pré-requisitos,
escopo, mapa curricular completo, repertório de unidades de análise, requisitos de
evidência e partes operacionais. O mapa pode ser rascunho ou aprovado sem materializar
conteúdo.

**Parte de autoria.** Conjunto de trabalho que reúne uma ou mais microssequências
já existentes no mapa para planejar e produzir seu conteúdo. Partes podem ser
reunidas em um lote de produção. Esses agrupamentos podem ser redimensionados sem
mudar a hierarquia do currículo.

**Unidade de análise (`instructional_analysis_unit`).** Ideia, relação, condição,
procedimento ou operação que vale acompanhar no repertório do percurso. Pode ser
introduzida, usada depois de estabelecida ou retomada.

**Requisito de evidência.** Operação e condições que uma atividade solicita para
examinar um objetivo de aprendizagem. Se o objetivo é comparar duas soluções, por
exemplo, o requisito pode pedir que o estudante justifique a escolha usando os
critérios apresentados. O requisito planeja uma oportunidade de prática; o resultado
efetivamente observado depende da resposta do estudante. Uma atividade de
consolidação não cria esse requisito apenas por existir.

**Materialização.** Gravação conjunta das unidades de uma parte, com as
decisões de desenho e os vínculos com as fontes. Pode reutilizar a explicação salva na
base preparada ou incluir uma base nova validada. Preparação e validação
intermediárias não se tornam um histórico de produto.

**Repertório semântico.** Conjunto acumulado de conhecimentos necessários ao percurso,
com introduções, usos e retomadas. Ao comparar tetos diferentes, o repertório
permanece equivalente e muda apenas a distribuição pelas unidades.

## Configuração autoral

**Parâmetro de autoria.** Decisão configurável que orienta explicações, prática,
leitura e estilo, conversa ou produção. O [catálogo de
parâmetros](desenho-instrucional-parametrizado.md#catálogo-corrente) separa conteúdo e prática de alvos editoriais e
cadência de trabalho. Teto de novidade, formas explicativas e oportunidades de prática
são condições de desenho, não medidas de aprendizagem.

**Alvo editorial quantitativo.** Intenção flexível de palavras por resposta de autoria
ou por unidade de estudo. Não é mínimo nem máximo, não mede qualidade e não autoriza
ocultar decisões, comprimir conteúdo ou atomizar unidades.

**Configuração efetiva.** Orientação que resulta da definição local e da herança de
um escopo mais amplo. Pode fixar um valor ou manter a escolha automática ainda sem
valor decidido. A leitura informa a origem da orientação e se ela foi herdada.

**Valor aplicado.** Valor escolhido para produzir uma unidade e guardado com a
justificativa no registro de desenho aplicado. Quando a configuração é automática,
essa escolha considera o conteúdo e o contexto da microssequência ou unidade.
Alterar a configuração depois da produção não reescreve esse registro. Consulte
[parâmetros de autoria](parametros-de-autoria.md).

**Herança.** Uso de uma decisão de alcance mais amplo, conforme as regras de
prioridade dos parâmetros. Um valor fixado na lição, por exemplo, permanece
aplicável mesmo quando a unidade delega a escolha ao assistente. Retirar uma
definição local permite resolver a configuração pelas demais decisões do percurso.
Consulte a [origem e a prioridade das escolhas](autoria-contextual.md#parâmetros-origem-e-persistência).

**Direção editorial.** Orientação qualitativa de extensão, estilo, títulos ou
organização, separada dos parâmetros tipados e dos alvos editoriais quantitativos.
Nunca elimina novidade necessária; pode levar à criação de mais unidades de estudo.

**Política de componentes.** Disponibilidade, preferência ou restrição corrente de
pacotes didáticos. Preferência não concede permissão e não cria quota de variedade.

## Componentes didáticos

**Componente didático.** Capacidade modular que apresenta uma representação, coleta
resposta ou oferece retorno dentro de uma unidade de estudo.

**Pacote de componente (`component package`).** Módulo versionado que reúne manifesto,
schema, normalização, renderização, capacidades e exemplos.

**Biblioteca de componentes.** Índice gerado dos manifestos e consultado sob demanda
quando a função instrucional não determina claramente a representação.

**Forma de resposta.** Contrato de interação da prática, como escolha, preenchimento
ou ordenação. Distingue-se do componente que apresenta conteúdo.

**Adequação contextual (`canonical`, `versatile`, `substitute`).** Relação entre uma
necessidade e um candidato específico, geral ou aproximativo. Uma forma substituta
pode exigir reparo mesmo quando seu schema é válido.

**HTML e [DOM](https://developer.mozilla.org/pt-BR/docs/Web/API/Document_Object_Model).** HTML descreve a estrutura de uma página. Ao lê-lo, o navegador cria
uma representação dos elementos em memória, chamada DOM (*Document Object Model*).
O código da interface usa essa representação para localizar textos, botões e campos
e modificar seu conteúdo ou comportamento.

**Renderização.** Transformação dos dados em uma apresentação visível, como texto,
tabela ou diagrama. Os componentes didáticos executam essa tarefa a partir do
conteúdo estruturado do curso.

**Hidratação.** Ligação dos comportamentos aos elementos já apresentados. Uma
atividade pode mostrar alternativas, mas ainda precisar dessa ligação para reagir
à escolha e oferecer retorno. Uma interação obrigatória que não responde pode
indicar falha nessa etapa.

## Persistência local e navegação

**[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API).** API
do navegador para armazenar e consultar dados estruturados em transações. No AraLearn,
guarda sessão, páginas, documentos compostos, estado pessoal e filas de observações.
Uma transação confirma todas as suas alterações juntas ou as desfaz em caso de falha.

**Cache.** Cópia usada para evitar uma nova leitura ou cálculo e reduzir a espera.
Pode ser reconstruída a partir de sua origem. Rascunhos e alterações ainda não
enviadas exigem outro cuidado, pois podem existir somente no dispositivo.

**Réplica local.** Cópia suficiente para leitura sem conexão. Uma candidata só
substitui a revisão local válida depois de ser recomposta e validada.

**Fila de saída.** Intenções ainda não confirmadas pelo servidor. Estado pessoal e
observações usam filas próprias; rascunhos de conteúdo possuem recuperação própria.

**Estado pessoal de curso.** Documento por pessoa e curso com progresso e marcas para
rever. Sua alteração não incrementa a revisão autoral.

**Paginação por cursor.** Leitura cuja página seguinte começa após uma chave estável.
O cursor pertence ao recorte e não representa posição curricular.

**Deep link.** Endereço que abre curso, área e objeto reconhecível. O endereço pode conter identificadores técnicos, mas a interface apresenta
o nome do objeto.

**Posição local de Conteúdo.** Registro por dispositivo usado para retomar unidade,
deslocamento e revisão. Não vira fato pedagógico compartilhado.

## Concorrência e repetição segura

**Concorrência otimista.** Uma escrita só confirma se a revisão lida continuar
corrente.

**Comparação e troca (`compare-and-swap`, CAS).** Operação que verifica a revisão
esperada e grava a mudança como um passo indivisível: outra escrita não pode ocorrer
entre a comparação e a troca. Isso impede que uma decisão baseada em dados antigos
sobrescreva uma mudança concorrente.

**Idempotência.** Repetir a mesma intenção produz o mesmo efeito sem duplicação.

**Recibo temporário.** Registro de curta duração que permite recuperar o resultado de
uma escrita cuja resposta se perdeu. Não é histórico autoral.

**Bloqueio consultivo transacional (`advisory lock`).** Recurso do PostgreSQL usado
pela aplicação para coordenar operações que precisam aguardar umas às outras.
Operações com a mesma chave de bloqueio aguardam sua liberação; o bloqueio termina
com a transação.

## Autenticação, acesso e segurança

**Autenticação.** Verificação da identidade de uma conta.

**Autorização.** Decisão sobre uma operação e um curso específicos.

**Proprietário (`owner`).** Conta que possui o curso, pode editá-lo na interface
ou pelos canais MCP/Actions e consultar seus indicadores de autoria.

**Acesso direto.** Relação curso–pessoa que concede Estudo. Não cria coautoria nem
permissão de edição.

**[Segurança em nível de linha (`Row Level Security`,
RLS)](https://supabase.com/docs/guides/database/postgres/row-level-security).**
Políticas do PostgreSQL que restringem os registros acessíveis a cada papel e contexto
de autorização. Os privilégios determinam se uma operação pode alcançar a tabela; a
política determina quais registros ela pode ler ou alterar.

**Menor privilégio.** Cada papel recebe somente tabelas e funções necessárias.

**Papel de serviço (`service_role`).** Autoridade administrativa restrita às Edge
Functions e testes locais; nunca pertence ao navegador ou ao modelo.

**Bucket privado.** Conjunto de objetos que exige autorização antes de emitir um
endereço temporário. PDFs de fonte e avatares usam buckets separados.

## API, banco e funções remotas

**[Interface de programação de aplicações (API)](https://developer.mozilla.org/pt-BR/docs/Glossary/API).** Conjunto de operações que um
programa oferece a outro. No AraLearn, a interface usa a API do curso para pedir ao
servidor leituras e alterações, conforme os argumentos e as permissões aceitos.

**[HTTP](https://developer.mozilla.org/pt-BR/docs/Web/HTTP).** Protocolo de comunicação usado na Web. Organiza um pedido ao servidor e
sua resposta, com endereço, cabeçalhos, conteúdo e um código que indica o resultado.
As APIs remotas do AraLearn usam HTTP sobre uma conexão protegida por criptografia,
chamada HTTPS.

**SQL.** Linguagem usada para consultar e alterar dados num banco relacional. No
AraLearn, funções SQL mantêm próximas dos dados as regras de gravação e acesso.

**[PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html).** Sistema
gerenciador de banco de dados relacional. No AraLearn, é a autoridade remota para
curso, composição, plano, configuração, acesso, estado pessoal, observações, fontes e
dados de Analytics.

**PostgREST.** Camada que expõe funções PostgreSQL por HTTP conforme privilégios e
políticas.

**RPC (`Remote Procedure Call`).** Chamada de uma operação executada em outro
processo ou servidor. No acesso ao banco do AraLearn, chama uma função PostgreSQL
que confere autorização e confirma alterações relacionadas na mesma transação.

**Edge Function.** Função HTTP executada no Supabase. API de curso, MCP e Actions
autenticam o transporte e delegam aos mesmos casos de uso.

**Roteador de curso.** Camada que transforma rotas HTTP em casos de uso sem duplicar
regras entre interface, MCP e Actions.

## MCP e Actions

**Model Context Protocol (MCP).** Protocolo pelo qual um cliente de IA descobre as
ferramentas de um serviço e solicita sua execução. Cada ferramenta informa os
argumentos que aceita; o servidor valida o pedido antes de operar sobre o curso.

**Tarefa humana.** Operação de autoria descrita por sua finalidade e por referências
reconhecíveis, como título e posição. O catálogo é compartilhado por MCP e Actions; a
[referência do MCP](autoria-mcp.md) informa as tarefas atuais e a [referência de
Actions](autoria-actions.md) mostra sua projeção HTTP.

**Ferramenta MCP.** Projeção de uma tarefa humana com schema e indicação de leitura ou
escrita.

**Action.** Operação HTTP descrita em OpenAPI que encaminha uma ou mais tarefas ao
catálogo comum. OpenAPI descreve os caminhos, argumentos e respostas de uma API para
que clientes possam utilizá-la. O transporte de arquivo pode adaptar a referência
temporária de PDF sem mudar o caso de uso.

**Recurso MCP.** Conhecimento estável carregado sob demanda. Estado mutável do curso é
lido por tarefas e não copiado para o recurso.

**OAuth.** Protocolo usado para conectar a conta individual ao cliente. MCP e Actions
possuem concessões próprias; os tokens não são intercambiáveis.

**PKCE (*Proof Key for Code Exchange*).** Proteção da troca do código de
autorização. O cliente guarda um valor ao iniciar o acesso e precisa apresentá-lo
na troca; obter apenas o código de retorno não basta. O MCP usa o método S256,
que anuncia uma impressão digital desse valor no pedido inicial.

**Resposta de coordenação.** Resultado curto, link direto e uma próxima decisão quando
necessária. O contexto estruturado pode permanecer completo sem ser despejado na
conversa.

## Observações e revisão

**Observação.** Apontamento ancorado num objeto do curso. Uma seleção de várias
unidades de estudo cria registros separados, não um lote permanente.

**Caixa de observações.** Consulta filtrável das manifestações correntes. Estado
aberto ou resolvido descreve triagem e não altera o conteúdo por implicação.

**Revisão contextual.** Releitura do alvo e de unidades relacionadas por progressão,
pré-requisito, transição, exemplo ou prática antes de propor mudanças.

**Achado de revisão.** Problema concreto identificado durante a análise, com evidência
e proposta de correção. Pode motivar uma observação; não constitui um registro
separado de histórico de execução.

**Declaração de revisão (`contentReview`).** Manifestação da pessoa autora de que
inspecionou a explicação ou unidade salva. A marca pode ser retirada e fica
desatualizada quando sua base muda. Correção, leitura e geração não a concedem por
implicação. A política de acesso determina separadamente se o estudo exige revisão
atual. Consulte [Explicação e revisão humana](explicacao-e-revisao-humana.md).

**Correção autoral.** Conjunto aprovado de mudanças em uma ou mais unidades ou
explicações. Aplicação não prova resolução; o conjunto precisa ser reinspecionado.

## Fontes, âncoras e PDFs

**Fonte.** Referência bibliográfica corrente pertencente ao curso. Pode ser
contestada, revisada, removida e reativada.

**Âncora.** Localização verificável dentro de uma fonte, como página, seção ou trecho.

**Atribuição de fonte.** Relação corrente entre fonte, âncora e objeto do curso, com
papel como apoio, contexto, contraste ou exemplo.

**Anexo de PDF.** Descritor relacional ligado a uma fonte e a um objeto privado. O
serviço calcula tamanho e SHA-256; cliente e modelo não escolhem o caminho do Storage.

**Tombstone de anexo.** Estado relacional que conserva a remoção necessária para
impedir novas leituras e coordenar a limpeza física.

**Intenção de upload ou exclusão.** Registro temporário aberto enquanto uma operação
com bytes precisa ser concluída ou recuperada. Intenções encerradas ou expiradas não
formam histórico permanente.

**URL assinada.** Endereço temporário de leitura emitido depois da autorização. Não é
identidade do PDF e não deve ser persistido.

**Objeto órfão.** Arquivo no Storage sem vínculo ativo nem reserva que justifique sua
conservação. O serviço confere referências de todos os cursos e remove o objeto
somente pela API do Storage; o nome da pasta não basta para classificá-lo.

## Analytics e pesquisa

**Análise de autoria (`analytics`).** Leitura quantitativa do desenho corrente e das
intervenções registradas. O painel **Dados de autoria** apresenta dimensões, como
novidade declarada e prática, dentro do recorte escolhido. Consulte
[análise de autoria](analytics-instrucionais.md).

**Escopo de Analytics.** Curso, parte, microssequência ou unidade escolhida para o
recorte. Dados que não podem ser atribuídos aparecem como ausentes, não como zero.

**Parâmetros definidos.** Quantidade de condições pedagógicas explicitamente fixadas
no estado corrente.

**Origem observável de uma unidade de estudo.** Classificação factual de criação e
última revisão como manual ou assistida quando o estado permite essa atribuição. Não é
percentual de autoria humana.

**Snapshot de análise.** Retrato estruturado dos dados e das contagens de um recorte
numa revisão do curso. A ação **Exportar curso e análise** inclui esse retrato e
também o documento integral do curso, fontes, bases explicativas, parâmetros e
declarações de revisão. Os bytes dos anexos ficam fora do arquivo.

**Condição de pesquisa.** Curso privado independente no qual a pessoa fixa uma
configuração para comparação deliberada. A comparação não exige entidade de variante
nem autoriza inferência causal.

## Backup e restauração

**Backup lógico.** Dump do estado PostgreSQL. Preserva metadados relacionais de
Storage, mas não os bytes dos objetos.

**Restauração de upgrade.** Ensaio que restaura um backup anterior num banco
descartável, aplica migrações e verifica o estado útil corrente.

**Fronteira de Storage.** Separação entre descritores no banco e bytes nos buckets.
Backup dos objetos exige procedimento próprio e mutações sempre passam pela API do
Storage.
