# Arquitetura do AraLearn

Este capítulo descreve a implementação corrente. A
[matriz de conformidade técnica](matriz-conformidade-tecnica.md) distingue
implementação, conexão e verificação. A [história do schema](schema-change-log.md)
registra as migrações e os cuidados necessários à implantação.

O AraLearn conserva um curso vivo que pode ser estudado, desenvolvido e revisto
sob a mesma identidade. A arquitetura separa quatro responsabilidades:

- PostgreSQL guarda relações e estado corrente;
- Storage guarda arquivos privados;
- o navegador apresenta Estudo e Autoria e mantém a continuidade local;
- MCP e Actions permitem autoria ampla por conversa sobre os mesmos casos de
  uso.

Essa separação evita transformar o chat, a interface ou um histórico de
execução numa segunda autoridade do curso.

## O curso como raiz

Um curso reúne:

- título, objetivo, proprietário, visibilidade e acesso direto;
- módulos, lições, microssequências e unidades de estudo (`StudyUnit` no código);
- mapa curricular global e partes operacionais de autoria;
- repertório de unidades de análise (`AnalysisUnit` no código) e requisitos de evidência;
- parâmetros tipados de conteúdo, prática, conversa e cadência, com direção
  editorial separada;
- fontes, âncoras, PDFs, áudios e vínculos de proveniência;
- observações e estado necessário à revisão;
- estado pessoal de estudo por pessoa.

Conteúdo válido fica disponível ao proprietário e às pessoas autorizadas assim
que existe. Tornar o curso público é uma decisão explícita de acesso, com
política de arquivos, e mantém o mesmo curso mutável. Revisar uma unidade de
estudo não cria outra identidade nem uma árvore de versões.

## Superfícies do produto

**Estudo** apresenta os cursos acessíveis, a hierarquia curricular, uma unidade
de estudo por vez, prática, progresso pessoal, marcas para rever e observações.
Um curso compartilhado pode ser estudado sem conceder autoria no original.

Somente o proprietário edita, inclusive quando está em Estudo. Estudantes podem
enviar suas próprias observações; visitantes estudam cursos públicos e conservam
progresso e marcas no dispositivo. O catálogo compacto também inclui cursos
públicos, sem criar uma autoridade de conteúdo separada.

Uma ação explícita pode copiar um curso próprio ou um curso cujo proprietário
concedeu permissão de cópia. O resultado tem nova identidade e pertence à pessoa
solicitante; começa privado, com arquivos restritos. Estrutura, inventário,
conteúdo, configuração, fontes e arquivos são preservados, enquanto acessos e
estado pessoal permanecem na origem. Leitura pública não concede essa permissão.

Cópias próprias anteriores conservam identidade, conteúdo e propriedade. Sua
origem útil migra para metadados privados do curso-alvo. Um rascunho antigo só é
reconciliado com um alvo comprovado; a recuperação não reaplica a edição nem
cria curso. O comando de cópia automática foi retirado.

**Autoria** apresenta apenas cursos próprios. O curso abre diretamente em
Conteúdo; Conteúdo e Planejamento permanecem no cabeçalho, enquanto Parâmetros,
**Fontes**, Revisão, Analytics e Pessoas aparecem no menu compacto. A composição é
estreita, móvel primeiro e usa um único rolador vertical.

A autoria por conversa complementa essas superfícies. O GPT pode planejar,
produzir, consultar fontes, tratar observações e aplicar mudanças; a interface
permite localizar, ler e revisar o resultado no contexto.

## Um catálogo humano para MCP e Actions

MCP e Actions são transportes distintos sobre o mesmo catálogo de tarefas humanas. O
catálogo `courseHumanTasks.js` define nome, descrição, schema, efeito e hints. O
MCP publica esse catálogo diretamente. O gerador OpenAPI o projeta para Actions
sem manter uma segunda definição.

As leituras retomam curso, consultam planejamento, preparam materialização,
consultam configuração e observações, preparam revisão e consultam fontes e
componentes. As escritas criam curso, salvam o mapa curricular, definem e
materializam partes, ajustam configuração, registram observações, aplicam
correções, mantêm fontes e incorporam PDF e áudio. Perfis guardam preferências
reutilizáveis. Cópia, comparação e exportação usam os mesmos casos de uso da
aplicação, com autorização específica para cada operação.

Argumentos públicos usam título, posição e referência humana. A camada
confiável em `courseHumanTaskExecutor.js` resolve identidades e versões, produz
a identidade de repetição e relê o estado quando há concorrência. Ambiguidade
gera uma pergunta focal; ela não autoriza escolher um objeto por acaso.

Uma resposta comum contém resultado, deep link e uma próxima decisão, quando
necessária. Contexto estruturado pode acompanhar uma leitura sem ser repetido
como texto longo.

## Fluxo entre navegador e Supabase

`CourseController` coordena a interface e a réplica local.
`CourseApiClient` envia operações da aplicação para `aralearn-course-api`. O
servidor valida sessão e rota antes de chamar `courseRouter` e
`CourseSupabaseAdapter`.

O adaptador usa funções SQL estreitas com credencial de servidor. A função SQL
volta a verificar propriedade, versão e formato e executa a transação. Esse
desenho evita conceder acesso direto às tabelas privadas e mantém a decisão de
autorização junto do dado.

Visitantes alcançam somente RPCs de leitura com projeção explícita e guarda
própria. A guarda de escrita continua exigindo ator autorizado. O perfil usa um
identificador público escolhido pela pessoa e avatar opcional; busca e concessão
de acesso privado são delimitadas pelo curso do proprietário, sem diretório
geral de contas. O Storage permanece privado, inclusive para cursos públicos.

MCP usa `aralearn-authoring-mcp` e OAuth 2.1. Actions usa
`aralearn-authoring-action` e um OAuth próprio para o GPT. Credenciais de um
canal são recusadas no outro.

## Estrutura e leitura paginada

A composição curricular usa linhas de entidade ligadas ao curso. Leituras de
Estudo e Conteúdo são paginadas e validam que todas as páginas pertencem à mesma
revisão. Um deep link pode indicar a unidade de estudo inicial sem tornar o cursor parte
da URL.

Conteúdo mantém uma janela limitada de unidades de estudo no DOM. Pesquisa e índice
permitem chegar rapidamente a qualquer Unidade, inclusive anterior. O renderer
é o mesmo usado por Estudo, com respostas inertes durante a inspeção autoral.

## Mapa global e produção incremental

O plano conserva público, pré-requisitos declarados, itens de escopo, mapa
curricular, repertório acumulado, requisitos de evidência e partes. O mapa
organiza todo o curso em módulos, lições e microssequências antes de qualquer
materialização. Cada item obrigatório do escopo aponta para os lugares do mapa
em que será ensinado e, depois da produção, para as unidades que o desenvolveram.

O mesmo mapa pode existir como rascunho ou aprovado. A aprovação é uma
propriedade do artefato completo que estava inspecionável; ela não aprova
unidades futuras. Partes só podem agrupar microssequências já pertencentes ao
mapa aprovado. Elas descrevem lotes de planejamento focal, produção e revisão,
mas não acrescentam nível curricular.

Com mapa aprovado e percurso autorizado, a preparação reúne somente o lote, sua
configuração e o repertório necessário. O tamanho do lote não exige uma nova
confirmação por si só; uma decisão material ainda aberta continua exigindo
intervenção. A materialização grava as unidades de
estudo e atualiza, por derivação do estado corrente, onde cada ideia foi
introduzida, usada ou retomada.

Não existe quantidade-alvo de unidades. O teto de novas unidades de análise
muda a distribuição da novidade, não o inventário nem a profundidade necessária.

## Desenho aplicado à unidade de estudo

O catálogo único fornece tipos, unidades, escopos, grupos e rótulos para UI,
integrações e projeção SQL. Parâmetros e direção editorial possuem atribuição
corrente por escopo. Limpar uma definição restaura herança e remove a atribuição
local; não cria uma linha histórica de “limpeza”.

Quando uma unidade de estudo é materializada, ela guarda o recorte de desenho
efetivamente aplicado: ideias e requisitos pertinentes, valores pedagógicos,
alvos editoriais, direção editorial, componentes e oportunidades de prática.
Esse registro focal permite inspeção e Analytics sem conservar contexto de
execução da parte inteira. Uma edição focal conserva esse snapshot histórico
literal. A aplicação só continua corrente quando conteúdo e hierarquia que a
sustentavam permanecem iguais, descontada a mudança de título; uma mudança
substantiva retira essa alegação corrente sem fabricar uma nova data de análise.

Ideias introduzidas são persistidas separadamente das ideias estabelecidas que
a unidade apenas utiliza. Retomadas são derivadas das explicações de ideias já
estabelecidas. Identidade, nome, descrição curta e referências às unidades
permitem consultar o repertório sem criar ontologia, grafo ou ledger paralelo.

O modo automático delega ao GPT a escolha contextual, antes da produção, para a
microssequência ou unidade conforme conteúdo, função e repertório acumulado.
A intenção pode ter valor nulo; o snapshot aplicado exige valor e justificativa.
Ausência local significa herança. Fixações de autoria e pesquisa prevalecem
sobre calibração automática; exceções incompatíveis com pesquisa não podem
aplicar-se silenciosamente. Alvos de palavras não autorizam omissão ou compressão.

Perfis de autoria guardam somente preferências tipadas por conta. Aplicar copia
as preferências ao curso numa transação com comparação das revisões do perfil
e do curso; exceções são preservadas ou removidas por seleção explícita.
Condições de pesquisa ficam protegidas. Editar ou excluir um perfil não altera
as cópias, e a aplicação não reescreve conteúdo nem snapshots existentes.

Fluxo global antes dos lotes, aprovação apenas do artefato inspecionável e
fronteira pública em linguagem humana são invariantes. Distribuição editorial,
formas explicativas e prática são dimensões calibráveis no mecanismo existente.
Princípios pedagógicos orientam a produção e os testes de aceitação; não se
convertem automaticamente em tabelas, flags ou pipelines.

## Concorrência e repetição segura

Cada curso possui revisão crescente; objetos editáveis também possuem uma
versão corrente quando necessário. Uma escrita informa o estado que leu. Se o
objeto mudou, o consumidor trata o conflito sem promover silenciosamente a
revisão de um rascunho. Uma reconstrução automática só cabe quando conserva a
intenção verificável; caso contrário, a edição permanece disponível para revisão.

Um recibo temporário por pedido permite recuperar resposta perdida sem duplicar
efeito. Recibos expirados são removidos pela retenção. Eles não formam um
histórico universal de mudanças. A cópia independente também grava no alvo sua
origem e identidade de pedido. Essa prova permite recuperar a mesma cópia após
expirar o recibo ou perder acesso à origem. Sem prova e fora da janela admitida,
o pedido não cria outro curso; consulte [persistência](persistencia-relacional.md#cópia-independente).

## Fontes, âncoras e arquivos

Fonte e âncora são estado corrente. A versão serve à concorrência e aos deep
links; versões antigas não constituem uma biblioteca paralela. Uma atribuição
liga fontes e âncoras a um item do plano ou unidade de estudo corrente. Cada
vínculo possui identidade, papéis explícitos e ocorrências opcionais em folhas
textuais do catálogo. Trecho ambíguo conserva o vínculo e fica pendente de
revisão; o sistema não inventa outra posição. Citação manual preserva seu texto;
a citação gerada usa metadados estruturados e o estilo escolhido no curso.

O bucket privado `course-source-pdfs` contém os bytes. O banco conserva o
descritor e o vínculo ativo ou removido. A ingestão calcula e verifica SHA-256,
usa uma intenção curta para cota e concorrência, envia pela Storage API, relê o
objeto e só então ativa o vínculo.

A remoção produz um tombstone e uma intenção curta. Depois da transação, o
adaptador reivindica a intenção, revalida que nenhum vínculo ativo usa o objeto,
remove-o pela Storage API e confirma a conclusão. Reanexar o mesmo conteúdo
reativa o vínculo após nova verificação.

Áudio usa `course-media`, com WAV PCM ou MP3, descritor lógico e referência na
unidade. PDFs e áudios compartilham a cota do curso. A cópia independente pode
referenciar os mesmos bytes imutáveis: autorização depende do curso consultado,
não do prefixo físico do objeto. Exclusão de curso, conta e órfão confere todas
as referências e reservas antes de remover o arquivo. Detalhes ficam em
[Supabase](supabase.md#storage-bytes-privados-e-vínculo-relacional).

## Observações e revisão

Uma observação pertence a uma pessoa e a um alvo. Selecionar várias unidades de estudo
cria registros separados; não existe entidade de lote. A caixa autoral pode
consultar as abertas por escopo.

Preparar revisão amplia o foco para unidades afetadas por progressão,
pré-requisitos, transições, exemplos e prática. Aplicar correções grava o conjunto
aprovado e a inspeção seguinte permite conferir o resultado. Reversibilidade
cotidiana vem de poder reabrir qualquer ponto e revisá-lo outra vez.

## Analytics

Analytics deriva um snapshot quantitativo do estado corrente. **Desenho** conta
unidades de estudo, ideias do repertório, prática, fontes, valores pedagógicos,
alvos e extensão editorial observada, formas e componentes. **Autoria** conta
observações abertas, parâmetros definidos e a origem observável da criação e da
última revisão das unidades.

O snapshot não usa telemetria de atenção, conversa ou rastreamento da execução.
A exportação JSON combina a leitura autoral com o documento literal do curso.
Ela não inclui progresso, contas, credenciais ou bytes dos arquivos. A comparação
confronta inventários completos e recortes selecionados, conserva a distinção
entre parâmetros solicitados e aplicados e informa ausências. Igualdade de
contagens ou declarações não comprova equivalência pedagógica.

## Réplica local e funcionamento sem rede

IndexedDB conserva composição validada, progresso, posição, marcas para rever,
Observações próprias e escritas delimitadas que ainda precisam de confirmação.
`BroadcastChannel` informa outras abas sobre mudanças. No modo automático, foco,
visibilidade e retorno da conexão podem provocar releitura. O modo manual suspende
atualizações de fundo de conteúdo e filas pessoais; a nuvem executa a sincronização
solicitada. Escrita explícita e verificação de acesso continuam sujeitas à rede.
Rascunhos e conflitos não são descartados para aplicar uma atualização.

O servidor continua sendo a autoridade de propriedade e acesso. Um curso
revogado deixa de abrir depois da validação conectada, mesmo que uma cópia local
antiga ainda exista.

## Componentes didáticos

Packages versionados implementam representações e formatos de resposta. O
catálogo informa função e contrato; o autor escolhe pelo papel instrucional.
`paragraph` e `choice` são componentes válidos, não alternativas automáticas
quando tabela, sequência, classificação, código ou diagrama representam melhor
o conteúdo.

O build sincroniza o runtime necessário às Edge Functions e impede que versões
de navegador e servidor divirjam silenciosamente.

O registro delega validação das relações da unidade, preparação de conteúdo,
interação de resposta e reconciliação de edição aos contratos dos pacotes.
O editor trabalha com folhas textuais declaradas; não escolhe regras pelo nome
do pacote. Composição, posições, slots e capacidades do host continuam comuns.
Uma extensão compatível acrescenta registro e artefatos próprios; uma capacidade
nova do host exige contrato e consumidor explícitos, não código livre no curso.

## Segurança por fronteira

- `public` expõe apenas relações deliberadas e usa privilégios explícitos mais
  RLS;
- `private` fica fora da Data API e suas tabelas usam RLS como defesa adicional;
- funções `security definer` fixam `search_path`, validam identidade e revogam
  execução de papéis não autorizados;
- Storage usa buckets privados e políticas por vínculo;
- site e APK recebem apenas URL e chave publicável;
- segredos administrativos permanecem nas Edge Functions;
- exclusão de conta e remoção de órfão revalidam objetos antes de apagar bytes.

## Backup e evolução

Migrations em `supabase/migrations` reproduzem o schema. O manifesto de runtime
é atualizado somente depois que uma capacidade inteira está instalada. Não há
fallback para schema anterior no cliente candidato.

Dump do PostgreSQL preserva dados relacionais e metadados, mas não os bytes do
Storage. Recuperação completa exige também backup dos objetos. O ensaio
`test:backup-restore:local` restaura uma fixture integrada numa instância
descartável sem rede, confere o corte histórico e aplica a cadeia posterior
até o manifesto corrente, verificando estado útil e leitores atuais. O smoke
`test:storage:lifecycle:local` exerce os bytes pela Storage API.

## Mapa do código

| Responsabilidade | Fonte principal |
| --- | --- |
| domínio do navegador | `src/domain/` |
| controlador e cliente Supabase | `src/supabase/` |
| Estudo e réplica local | `src/study/` e `src/persistence/` |
| interface de Autoria | `src/ui/CourseAuthoringSurface.js` e painéis focais |
| catálogo MCP/Actions | `supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js` |
| resolução confiável | `courseHumanTaskExecutor.js` e casos de uso focais |
| bordas HTTP | `courseApiServer.js`, `mcpServer.js` e `courseActionServer.js` |
| persistência remota | `courseSupabaseAdapter.js` e migrations |
| contratos de componentes | `src/resources/` e mirror da Edge |

Consulte [Supabase no AraLearn](supabase.md) para operação local, Storage e
implantação; [Persistência relacional](persistencia-relacional.md) para a réplica
e as transações; e [Autoria pelo MCP](autoria-mcp.md) para o protocolo
conversacional.
