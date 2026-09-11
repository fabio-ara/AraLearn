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
Formato textual para objetos, listas e valores escalares. Um JSON ainda precisa de
schema e regras de domínio para ser válido.

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

**Revisão do curso (`revision`).** Inteiro crescente usado para leitura coerente e
concorrência. Não cria uma versão paralela do curso.

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

**Parte de autoria.** Lote operacional para planejar e produzir uma ou mais
microssequências já existentes no mapa. Parte não pertence à hierarquia didática e
pode ser redimensionada sem mudar o currículo.

**Unidade de análise (`instructional_analysis_unit`).** Ideia, relação, condição,
procedimento ou operação que vale acompanhar no repertório do percurso. Pode ser
introduzida, usada depois de estabelecida ou retomada.

**Requisito de evidência.** Evidência de desempenho que o plano considera necessária.
Uma atividade de consolidação não cria um requisito apenas por existir.

**Materialização.** Gravação conjunta das unidades de uma parte aprovada, com as
decisões de desenho e os vínculos com as fontes. Pode reutilizar a explicação salva na
base preparada ou incluir uma base nova validada. Preparação e validação
intermediárias não se tornam um histórico de produto.

**Repertório semântico.** Conjunto acumulado de conhecimentos necessários ao percurso,
com introduções, usos e retomadas. Ao comparar tetos diferentes, o repertório
permanece equivalente e muda apenas a distribuição pelas unidades.

## Configuração autoral

**Parâmetro de autoria.** Decisão configurável que orienta explicações, prática,
leitura e estilo, conversa ou produção. O [catálogo de
parâmetros](parametros-de-autoria.md) separa conteúdo e prática de alvos editoriais e
cadência de trabalho. Teto de novidade, formas explicativas e oportunidades de prática
são condições de desenho, não medidas de aprendizagem.

**Alvo editorial quantitativo.** Intenção flexível de palavras por resposta de autoria
ou por unidade de estudo. Não é mínimo nem máximo, não mede qualidade e não autoriza
ocultar decisões, comprimir conteúdo ou atomizar unidades.

**Valor efetivo.** Valor selado na materialização de uma unidade. No estado `default`,
o assistente precisa calibrá-lo automaticamente pelo contexto da microssequência ou
unidade; definições deliberadas prevalecem. A leitura informa o valor, a origem e o
escopo.

**Herança.** Uso do valor do escopo mais amplo quando o escopo focal não possui uma
definição. Limpar uma definição restaura essa relação.

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

**Hidratação.** Ligação do comportamento ao DOM já renderizado. HTML visível sem uma
interação obrigatória indica falha de hidratação.

## Persistência local e navegação

**[IndexedDB](https://developer.mozilla.org/pt-BR/docs/Web/API/IndexedDB_API).** API
do navegador para armazenar e consultar dados estruturados em transações. No AraLearn,
guarda sessão, páginas, documentos compostos, estado pessoal e filas de observações.
Uma transação confirma todas as suas alterações juntas ou as desfaz em caso de falha.

**Cache.** Cópia regenerável usada para reduzir latência. Não constitui outra
autoridade sobre o curso.

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

**Comparação e troca (`compare-and-swap`, CAS).** Comparação atômica entre a revisão
esperada e a atual antes da gravação. A camada confiável executa essa operação sem
pedir números ao modelo.

**Idempotência.** Repetir a mesma intenção produz o mesmo efeito sem duplicação.

**Recibo temporário.** Registro de curta duração que permite recuperar o resultado de
uma escrita cuja resposta se perdeu. Não é histórico autoral.

**Bloqueio consultivo transacional (`advisory lock`).** Bloqueio PostgreSQL por chave
lógica durante uma transação, sem criar entidade de produto.

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

**[PostgreSQL](https://www.postgresql.org/docs/current/tutorial.html).** Sistema
gerenciador de banco de dados relacional. No AraLearn, é a autoridade remota para
curso, composição, plano, configuração, acesso, estado pessoal, observações, fontes e
dados de Analytics.

**PostgREST.** Camada que expõe funções PostgreSQL por HTTP conforme privilégios e
políticas.

**RPC (`Remote Procedure Call`).** Função de banco chamada pela rede para manter
transação, autorização e invariantes próximos dos dados.

**Edge Function.** Função HTTP executada no Supabase. API de curso, MCP e Actions
autenticam o transporte e delegam aos mesmos casos de uso.

**Roteador de curso.** Camada que transforma rotas HTTP em casos de uso sem duplicar
regras entre interface, MCP e Actions.

## MCP e Actions

**Model Context Protocol (MCP).** Protocolo pelo qual um cliente descobre e chama
ferramentas tipadas.

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

**PKCE.** Vínculo criptográfico entre pedido de autorização e troca do código. O MCP
usa o método S256.

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

**Analytics de Autoria.** Leitura quantitativa do desenho corrente e das intervenções
humanas explicitamente observáveis, agrupada em **Desenho** e **Autoria**.

**Escopo de Analytics.** Curso, parte, microssequência ou unidade escolhida para o
recorte. Dados que não podem ser atribuídos aparecem como ausentes, não como zero.

**Parâmetros definidos.** Quantidade de condições pedagógicas explicitamente fixadas
no estado corrente.

**Origem observável de uma unidade de estudo.** Classificação factual de criação e
última revisão como manual ou assistida quando o estado permite essa atribuição. Não é
percentual de autoria humana.

**Snapshot de Analytics.** JSON normalizado exportado pela interface com os mesmos
números exibidos no recorte. Não contém o curso completo.

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
