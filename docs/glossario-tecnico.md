# Glossário técnico

Este glossário define mecanismos da execução corrente do AraLearn. Conceitos de
pesquisa educacional estão no [glossário de construtos](glossario-construtos.md).
Decisões de nomenclatura e equivalentes internacionais ficam no [vocabulário
controlado](vocabulario-controlado.md).

## Camadas do sistema

**Execução corrente (`runtime`).** Código, banco e serviços usados por uma
versão. Arquivo histórico ou migração antiga não volta a integrar a execução
apenas por permanecer no Git.

**Interface cliente (`frontend`).** Código executado no navegador ou no WebView
Android. Inclui Estudo, Autoria, componentes didáticos e persistência local.

**Serviço remoto (`backend`).** Funções que autenticam, autorizam, validam e
persistem operações. O AraLearn usa PostgreSQL, Auth, Storage e Edge Functions
do Supabase.

**Domínio.** Regras do produto independentes da aparência da tela, como
composição, resolução de parâmetros, fontes, Observações e Analytics.

**Contrato fechado.** Estrutura que recusa campos e valores não declarados.
Evita interpretações diferentes entre navegador, Edge Function e banco.

**Manifesto da execução.** Contrato que informa a revisão mínima do esquema e as
capacidades exigidas pelo site e pelas funções publicadas.

## Formatos e identidades

**JSON.** Formato textual para objetos, listas e valores escalares. Um JSON ainda
precisa de schema e regras de domínio para ser válido.

**UUID.** Identificador de 128 bits. O servidor usa UUIDs para manter identidade
sem depender de título ou posição; o contrato conversacional resolve essas
identidades a partir de referências humanas.

**SHA-256.** Função que produz uma impressão digital dos bytes. No AraLearn ela
ajuda a conferir PDFs; não concede acesso e não é exposta como tarefa autoral.

**Schema.** Descrição da forma aceita por um contrato ou tabela. Validade
estrutural não demonstra correção factual ou qualidade pedagógica.

**Canonicidade.** Existência de uma representação normativa para o mesmo estado
ou contrato, sem aliases e caminhos concorrentes.

## Curso e composição

**Curso vivo (`course`).** Raiz mutável compartilhada por Estudo, Autoria, MCP e
Actions. Possui proprietário, título, objetivo, revisão e relações próprias para
plano, composição, configuração, fontes e Observações.

**Revisão do curso (`revision`).** Inteiro crescente usado para leitura coerente
e concorrência. Não cria uma versão paralela do curso.

**Composição didática.** Estrutura corrente de curso, módulo, lição,
microssequência didática e StudyUnit. Um Tópico pode classificar conteúdo dentro
da lição, mas não acrescenta um nível ao percurso principal.

**StudyUnit (`study_unit`).** Unidade persistida, ordenável, endereçável e
renderizável. Pode explicar, representar, pedir resposta e oferecer retorno.

**Documento `aralearn.course.v1`.** Forma hierárquica aceita para intercâmbio e
composição de um curso.

**Achatamento (`flatten`).** Conversão do documento hierárquico em linhas.
**Composição (`compose`)** é o caminho inverso. A ida e volta só é válida quando
recompõe um documento aceito pelo contrato.

**Cópia pessoal de curso.** Curso privado criado quando uma pessoa edita um curso
recebido somente para Estudo. Não transfere propriedade do original nem cria uma
réplica compartilhada.

## Planejamento e produção

**Plano instrucional vivo.** Planejamento revisável com público, pré-requisitos,
escopo, mapa curricular completo, repertório de unidades de análise, requisitos
de evidência e partes operacionais. O mapa pode ser rascunho ou aprovado sem
materializar conteúdo.

**Parte de autoria.** Lote operacional para planejar e produzir uma ou mais
microssequências já existentes no mapa. Parte não pertence à hierarquia didática
e pode ser redimensionada sem mudar o currículo.

**Unidade de análise (`instructional_analysis_unit`).** Ideia, relação,
condição, procedimento ou operação que vale acompanhar no repertório do
percurso. Pode ser introduzida, usada depois de estabelecida ou retomada.

**Requisito de evidência.** Evidência de desempenho que o plano considera
necessária. Uma atividade de consolidação não cria um requisito apenas por
existir.

**Materialização.** Gravação atômica das StudyUnits de uma parte aprovada, com
aplicação da configuração e da proveniência pertinente. Preparação e validação
intermediárias não se tornam um histórico de produto.

**Repertório semântico.** Conjunto acumulado de conhecimentos necessários ao
percurso, com introduções, usos e retomadas. Ao comparar tetos diferentes, o
repertório permanece equivalente e muda apenas a distribuição pelas unidades.

## Configuração autoral

**Parâmetro pedagógico.** Uma das quatro decisões configuráveis sobre teto de
novidade, formas de explicação, oportunidades mínimas de prática e dimensões de
variação. O catálogo também contém dois alvos editoriais quantitativos.

**Alvo editorial quantitativo.** Intenção flexível de palavras por resposta de
autoria ou por unidade de estudo. Não é mínimo nem máximo, não mede qualidade e
não autoriza ocultar decisões, comprimir conteúdo ou atomizar unidades.

**Valor efetivo.** Valor selado na materialização de uma unidade. No estado
`default`, o GPT precisa calibrá-lo automaticamente pelo contexto da
microssequência ou unidade; definições deliberadas prevalecem. A leitura informa
o valor, a origem e o escopo.

**Herança.** Uso do valor do escopo mais amplo quando o escopo focal não possui
uma definição. Limpar uma definição restaura essa relação.

**Direção editorial.** Orientação qualitativa de extensão, estilo, títulos ou
organização, separada dos quatro parâmetros pedagógicos e dos dois alvos
editoriais quantitativos. Nunca elimina novidade necessária; pode levar à
criação de mais unidades de estudo.

**Política de componentes.** Disponibilidade, preferência ou restrição corrente
de pacotes didáticos. Preferência não concede permissão e não cria quota de
variedade.

## Componentes didáticos

**Componente didático.** Capacidade modular que apresenta uma representação,
coleta resposta ou oferece retorno dentro de uma StudyUnit.

**Pacote de componente (`component package`).** Módulo versionado que reúne
manifesto, schema, normalização, renderização, capacidades e exemplos.

**Biblioteca de componentes.** Índice gerado dos manifestos e consultado sob
demanda quando a função instrucional não determina claramente a representação.

**Forma de resposta.** Contrato de interação da prática, como escolha,
preenchimento ou ordenação. Distingue-se do componente que apresenta conteúdo.

**Adequação contextual (`canonical`, `versatile`, `substitute`).** Relação entre
uma necessidade e um candidato específico, geral ou aproximativo. Uma forma
substituta pode exigir reparo mesmo quando seu schema é válido.

**Hidratação.** Ligação do comportamento ao DOM já renderizado. HTML visível sem
uma interação obrigatória indica falha de hidratação.

## Persistência local e navegação

**IndexedDB.** Banco transacional do navegador usado para sessão, páginas,
documentos compostos, estado pessoal e filas específicas de Observações.

**Cache.** Cópia regenerável usada para reduzir latência. Não constitui outra
autoridade sobre o curso.

**Réplica local.** Cópia suficiente para leitura sem conexão. Uma candidata só
substitui a revisão local válida depois de ser recomposta e validada.

**Fila de saída.** Intenções ainda não confirmadas pelo servidor. Estado pessoal
e Observações usam filas próprias; não existe fila universal de Autoria.

**Estado pessoal de curso.** Documento por pessoa e curso com progresso e marcas
para rever. Sua alteração não incrementa a revisão autoral.

**Paginação por cursor.** Leitura cuja página seguinte começa após uma chave
estável. O cursor pertence ao recorte e não representa posição curricular.

**Deep link.** Endereço que abre curso, área e objeto reconhecível. IDs técnicos
podem existir no URL, mas não são a linguagem pedida à pessoa ou ao modelo.

**Posição local de Conteúdo.** Registro por dispositivo usado para retomar Unit,
deslocamento e revisão. Não vira fato pedagógico compartilhado.

## Concorrência e repetição segura

**Concorrência otimista.** Uma escrita só confirma se a revisão lida continuar
corrente.

**Comparação e troca (`compare-and-swap`, CAS).** Comparação atômica entre a
revisão esperada e a atual antes da gravação. A camada confiável executa essa
operação sem pedir números ao modelo.

**Idempotência.** Repetir a mesma intenção produz o mesmo efeito sem duplicação.

**Recibo temporário.** Registro de curta duração que permite recuperar o
resultado de uma escrita cuja resposta se perdeu. Não é histórico autoral.

**Bloqueio consultivo transacional (`advisory lock`).** Bloqueio PostgreSQL por
chave lógica durante uma transação, sem criar entidade de produto.

## Autenticação, acesso e segurança

**Autenticação.** Verificação da identidade de uma conta.

**Autorização.** Decisão sobre uma operação e um curso específicos.

**Proprietário (`owner`).** Conta que possui o curso e pode usar sua Autoria,
MCP, Actions e Analytics.

**Acesso direto.** Relação curso–pessoa que concede Estudo. Não cria coautoria
nem permissão de edição.

**Segurança por linha (`Row Level Security`, RLS).** Políticas PostgreSQL que
filtram linhas segundo a sessão autenticada.

**Menor privilégio.** Cada papel recebe somente tabelas e funções necessárias.

**Papel de serviço (`service_role`).** Autoridade administrativa restrita às
Edge Functions e testes locais; nunca pertence ao navegador ou ao modelo.

**Bucket privado.** Conjunto de objetos que exige autorização antes de emitir um
endereço temporário. PDFs de fonte e avatares usam buckets separados.

## API, banco e funções remotas

**PostgreSQL.** Autoridade remota para curso, composição, plano, configuração,
acesso, estado pessoal, Observações, fontes e dados de Analytics.

**PostgREST.** Camada que expõe funções PostgreSQL por HTTP conforme privilégios
e políticas.

**RPC (`Remote Procedure Call`).** Função de banco chamada pela rede para manter
transação, autorização e invariantes próximos dos dados.

**Edge Function.** Função HTTP executada no Supabase. API de curso, MCP e
Actions autenticam o transporte e delegam aos mesmos casos de uso.

**Roteador de curso.** Camada que transforma rotas HTTP em casos de uso sem
duplicar regras entre interface, MCP e Actions.

## MCP e Actions

**Model Context Protocol (MCP).** Protocolo pelo qual um cliente descobre e chama
ferramentas tipadas.

**Tarefa humana.** Caso de uso público expresso em títulos, posições e outras
referências reconhecíveis. O catálogo corrente possui oito leituras e oito
escritas compartilhadas por MCP e Actions.

**Ferramenta MCP.** Projeção de uma tarefa humana com schema e indicação de
leitura ou escrita.

**Action.** Caminho HTTP descrito em OpenAPI para a mesma tarefa humana. O
transporte de arquivo pode adaptar a referência temporária de PDF sem mudar o
caso de uso.

**Recurso MCP.** Conhecimento estável carregado sob demanda. Estado mutável do
curso é lido por tarefas e não copiado para o recurso.

**OAuth.** Protocolo usado para conectar a conta individual ao cliente. MCP e
Actions possuem concessões próprias; os tokens não são intercambiáveis.

**PKCE.** Vínculo criptográfico entre pedido de autorização e troca do código.
O MCP usa o método S256.

**Resposta de coordenação.** Resultado curto, deep link e uma próxima decisão.
O contexto estruturado pode permanecer completo sem ser despejado na conversa.

## Observações e revisão

**Observação.** Apontamento ancorado num objeto do curso. Uma seleção de várias
StudyUnits cria registros separados, não um lote permanente.

**Caixa de Observações.** Consulta filtrável das manifestações correntes. Estado
aberto ou resolvido descreve triagem e não altera o conteúdo por implicação.

**Revisão contextual.** Releitura do alvo e de Units relacionadas por progressão,
pré-requisito, transição, exemplo ou prática antes de propor mudanças.

**Achado de revisão.** Problema concreto identificado na análise corrente, com
evidência e proposta. Não cria um ledger ou uma identidade histórica permanente.

**Correção autoral.** Conjunto aprovado de mudanças em uma ou mais StudyUnits.
Aplicação não prova resolução; o conjunto precisa ser reinspecionado.

## Fontes, Âncoras e PDFs

**Fonte.** Referência bibliográfica corrente pertencente ao curso. Pode ser
contestada, revisada, removida e reativada.

**Âncora.** Localização verificável dentro de uma fonte, como página, seção ou
trecho.

**Atribuição de fonte.** Relação corrente entre fonte, Âncora e objeto do curso,
com papel como apoio, contexto, contraste ou exemplo.

**Anexo de PDF.** Descritor relacional ligado a uma fonte e a um objeto privado.
O serviço calcula tamanho e SHA-256; cliente e modelo não escolhem o caminho do
Storage.

**Tombstone de anexo.** Estado relacional que conserva a remoção necessária para
impedir novas leituras e coordenar a limpeza física.

**Intenção de upload ou exclusão.** Registro temporário aberto enquanto uma
operação com bytes precisa ser concluída ou recuperada. Intenções encerradas ou
expiradas não formam histórico permanente.

**URL assinada.** Endereço temporário de leitura emitido depois da autorização.
Não é identidade do PDF e não deve ser persistido.

**Objeto órfão.** Byte presente no bucket sem vínculo relacional ativo. O serviço
inventaria, confirma ausência de autorização e remove o objeto somente pela API
do Storage.

## Analytics e pesquisa

**Analytics de Autoria.** Leitura quantitativa do desenho corrente e das
intervenções humanas explicitamente observáveis, agrupada em **Desenho** e
**Autoria**.

**Escopo de Analytics.** Curso, parte, microssequência ou StudyUnit escolhida
para o recorte. Dados que não podem ser atribuídos aparecem como ausentes, não
como zero.

**Parâmetros definidos.** Quantidade de condições pedagógicas explicitamente
fixadas no estado corrente.

**Origem observável de StudyUnit.** Classificação factual de criação e última
revisão como manual ou GPT quando o estado permite essa atribuição. Não é
percentual de autoria humana.

**Snapshot de Analytics.** JSON normalizado exportado pela interface com os
mesmos números exibidos no recorte. Não contém o curso completo.

**Condição de pesquisa.** Curso privado independente no qual a pessoa fixa uma
configuração para comparação deliberada. A comparação não exige entidade de
Variante nem autoriza inferência causal.

## Backup e restauração

**Backup lógico.** Dump do estado PostgreSQL. Preserva metadados relacionais de
Storage, mas não os bytes dos objetos.

**Restauração de upgrade.** Ensaio que restaura um backup anterior num banco
descartável, aplica migrações e verifica o estado útil corrente.

**Fronteira de Storage.** Separação entre descritores no banco e bytes nos
buckets. Backup dos objetos exige procedimento próprio e mutações sempre passam
pela API do Storage.
