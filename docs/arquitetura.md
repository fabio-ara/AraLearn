# Arquitetura do AraLearn

O AraLearn conserva um Curso vivo que pode ser estudado, desenvolvido e revisto
sob a mesma identidade. A arquitetura separa quatro responsabilidades:

- PostgreSQL guarda relações e estado corrente;
- Storage guarda arquivos privados;
- o navegador apresenta Estudo e Autoria e mantém a continuidade local;
- MCP e Actions permitem autoria ampla por conversa sobre os mesmos casos de
  uso.

Essa separação evita transformar o chat, a interface ou um histórico de
execução numa segunda autoridade do Curso.

## O Curso como raiz

Um Curso reúne:

- título, objetivo, propriedade e acesso direto;
- Módulos, Lições, Microssequências e StudyUnits;
- plano instrucional e Partes de autoria;
- AnalysisUnits e requisitos de evidência;
- parâmetros pedagógicos e direção editorial;
- Fontes, Âncoras, PDFs e atribuições;
- Observações e estado necessário à revisão;
- estado pessoal de Estudo por pessoa.

O Curso não possui estágio de publicação. Conteúdo válido fica disponível em
Estudo assim que existe. Revisar uma StudyUnit não cria outra identidade nem uma
árvore de versões.

## Superfícies do produto

**Estudo** apresenta os Cursos acessíveis, a hierarquia curricular, uma
StudyUnit por vez, prática, progresso pessoal, marcas para rever e Observações.
Um Curso compartilhado pode ser estudado sem conceder Autoria no original.

**Autoria** apresenta apenas Cursos próprios. O Curso abre diretamente em
Conteúdo; Conteúdo e Planejamento permanecem no cabeçalho, enquanto Parâmetros,
Fontes, Revisão, Analytics e Pessoas aparecem no menu compacto. A composição é
estreita, móvel primeiro e usa um único rolador vertical.

A autoria por conversa complementa essas superfícies. O GPT pode planejar,
produzir, consultar Fontes, tratar Observações e aplicar mudanças; a interface
permite localizar, ler e revisar o resultado no contexto.

## Um catálogo humano para MCP e Actions

MCP e Actions são transportes distintos sobre dezesseis tarefas humanas. O
catálogo `courseHumanTasks.js` define nome, descrição, schema, efeito e hints. O
MCP publica esse catálogo diretamente. O gerador OpenAPI o projeta para Actions
sem manter uma segunda definição.

As leituras são retomar Curso, consultar planejamento, preparar materialização,
consultar configuração, consultar Observações, preparar revisão, consultar
Fontes e consultar componentes. As escritas criam Curso, salvam Parte,
materializam Parte, ajustam configuração, registram Observação, aplicam
correções, mantêm Fonte e incorporam PDF.

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

MCP usa `aralearn-authoring-mcp` e OAuth 2.1. Actions usa
`aralearn-authoring-action` e um OAuth próprio para o GPT. Credenciais de um
canal são recusadas no outro.

## Estrutura e leitura paginada

A composição curricular usa linhas de entidade ligadas ao Curso. Leituras de
Estudo e Conteúdo são paginadas e validam que todas as páginas pertencem à mesma
revisão. Um deep link pode indicar StudyUnit inicial sem tornar o cursor parte
da URL.

Conteúdo mantém uma janela limitada de StudyUnits no DOM. Pesquisa e índice
permitem chegar rapidamente a qualquer Unidade, inclusive anterior. O renderer
é o mesmo usado por Estudo, com respostas inertes durante a inspeção autoral.

## Planejamento incremental

O plano conserva público, escopo, resultados pretendidos, AnalysisUnits,
requisitos de evidência e Partes. Cada Parte descreve um lote de autoria e as
Microssequências que deverá desenvolver; não é nível curricular.

O fluxo conversacional propõe uma Parte por vez. Salvar a Parte também salva a
estrutura humana necessária para que suas AnalysisUnits e requisitos tenham um
alvo pedagógico. Depois, a preparação reúne apenas o recorte da Parte e a
materialização grava suas StudyUnits.

Não existe quantidade-alvo de StudyUnits. O teto de novas AnalysisUnits muda a
distribuição da novidade, não seu inventário nem a profundidade necessária.

## Desenho aplicado à StudyUnit

Parâmetros e direção editorial possuem atribuição corrente por escopo. Limpar
uma definição restaura herança e remove a atribuição local; não cria uma linha
histórica de “limpeza”.

Quando uma StudyUnit é produzida ou revisada, ela guarda o recorte de desenho
efetivamente aplicado: AnalysisUnits e requisitos pertinentes, valores
pedagógicos, direção editorial, componentes e oportunidades de prática. Esse
registro focal permite inspeção e Analytics sem conservar contexto de execução
da Parte inteira.

## Concorrência e repetição segura

Cada Curso possui revisão crescente; objetos editáveis também possuem uma
versão corrente quando necessário. Uma escrita informa o estado que leu. Se o
objeto mudou, a camada confiável relê e reconstrói a mesma intenção ou devolve
uma decisão humana quando isso não for seguro.

Um recibo temporário por pedido permite recuperar resposta perdida sem duplicar
efeito. Recibos expirados são removidos pela retenção. Eles não formam um
histórico universal de mudanças.

## Fontes, Âncoras e PDFs

Fonte e Âncora são estado corrente. A versão serve à concorrência e aos deep
links; versões antigas não constituem uma biblioteca paralela. Uma atribuição
liga a Fonte e suas Âncoras a um item do plano ou StudyUnit corrente.

O bucket privado `course-source-pdfs` contém os bytes. O banco conserva o
descritor e o vínculo ativo ou removido. A ingestão calcula e verifica SHA-256,
usa uma intenção curta para cota e concorrência, envia pela Storage API, relê o
objeto e só então ativa o vínculo.

A remoção produz um tombstone e uma intenção curta. Depois da transação, o
adaptador reivindica a intenção, revalida que nenhum vínculo ativo usa o objeto,
remove-o pela Storage API e confirma a conclusão. Reanexar o mesmo conteúdo
reativa o vínculo após nova verificação.

## Observações e revisão

Uma Observação pertence a uma pessoa e a um alvo. Selecionar várias StudyUnits
cria registros separados; não existe entidade de lote. A caixa autoral pode
consultar as abertas por escopo.

Preparar revisão amplia o foco para StudyUnits afetadas por progressão,
pré-requisitos, transições, exemplos e prática. Aplicar correções grava o conjunto
aprovado e a inspeção seguinte permite conferir o resultado. Reversibilidade
cotidiana vem de poder reabrir qualquer ponto e revisá-lo outra vez.

## Analytics

Analytics deriva um snapshot quantitativo do estado corrente. **Desenho** conta
StudyUnits, AnalysisUnits, prática, Fontes, valores pedagógicos, formas e
componentes. **Autoria** conta Observações abertas, parâmetros definidos e a
origem observável da criação e da última revisão das StudyUnits.

O snapshot não usa telemetria de atenção, conversa ou rastreamento da execução.
O JSON baixado contém os mesmos números da tela e não representa uma cópia
completa do Curso.

## Réplica local e funcionamento sem rede

IndexedDB conserva composição validada, progresso, posição, marcas para rever,
Observações próprias e escritas delimitadas que ainda precisam de confirmação.
`BroadcastChannel` informa outras abas sobre mudanças; foco, visibilidade e
retorno da conexão provocam releitura.

O servidor continua sendo a autoridade de propriedade e acesso. Um Curso
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
descartável, aplica a migration seguinte e confere o estado útil. O smoke
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
