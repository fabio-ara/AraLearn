# Glossário técnico

Este glossário define os mecanismos usados pelo runtime canônico. Termos de
pesquisa educacional estão no [glossário de
construtos](glossario-construtos.md); decisões de nomenclatura e equivalentes em
inglês estão no [vocabulário controlado](vocabulario-controlado.md).

## Fundamentos de software e infraestrutura

**Runtime.** Código e serviços efetivamente carregados na execução. Arquivo
presente no repositório, migration histórica ou teste antigo não é, por si só,
parte do runtime.

**Frontend.** Camada executada no navegador ou no WebView Android. No AraLearn,
inclui Estudo, Autoria visual, renderização de componentes e persistência local.

**Backend.** Camadas remotas que validam, autorizam e persistem operações. O
backend corrente usa PostgreSQL, RPCs, Auth, Storage e Edge Functions do
Supabase.

**Domínio.** Regras que expressam o modelo do produto sem depender da aparência
da tela. Composição de Curso, validação de entidade e estado pessoal são regras
de domínio.

**Contrato fechado.** Estrutura que rejeita campos desconhecidos e valores fora
do conjunto permitido. Ele reduz interpretação divergente entre frontend,
Edge Function e banco.

**JSON.** Formato textual de objetos, arrays, textos, números, booleanos e
`null`. JSON não garante validade sem schema e invariantes adicionais.

**UUID.** Identificador de 128 bits representado em texto. Curso, conta e
pedidos pessoais usam UUIDs para evitar coordenação central de sequências.

**SHA-256.** Função de hash usada para comparar deterministicamente o conteúdo
de um pedido. Hash verifica igualdade de bytes; não cifra nem autoriza.

## Curso e conteúdo

**Curso vivo (`course`).** Raiz identificável e mutável usada por Estudo,
Autoria e MCP. Conserva proprietário, título, objetivo, revisão e datas; seu
plano instrucional e sua composição ficam em relações próprias.

**Revisão de Curso (`revision`).** Inteiro crescente que muda a cada alteração
autoral confirmada. É condição de concorrência, não identidade de outro Curso.

**Entidade de Curso (`course entity`).** Módulo, Lição, Tópico,
Microssequência didática ou Unidade de estudo persistida com tipo, identidade,
pai, posição e conteúdo.

**Normalização relacional.** Separação de fatos para evitar duplicação e
anomalias. O AraLearn normaliza raiz, entidades, acesso e estado pessoal, mas
mantém em JSON o conteúdo interno que precisa ser validado como contrato.

**Achatamento (`flatten`).** Transformação do documento hierárquico em linhas
de entidades. **Composição (`compose`)** é a operação inversa. O roundtrip é
válido somente quando recompõe um documento aceito pelo contrato.

**Documento `aralearn.course.v1`.** Contrato hierárquico corrente. O perfil de
intercâmbio usa `courses` para um ou mais Cursos ou recortes, e o kernel oferece o perfil
unitário `course`; ambos exigem que cada Microssequência exponha suas Unidades
em `studyUnits` e não criam outro nome de contrato.

**Unidade de estudo (`study_unit`).** Unidade persistida e renderizada no
percurso. `study_unit` é o discriminador relacional corrente, e `studyUnits` é
a coleção no documento. O conceito inclui mais do que prática de recuperação;
não existe alias semântico corrente para a entidade.

**Parte de autoria.** Agrupamento operacional configurável para planejar,
produzir e revisar várias Microssequências numa iteração. Não é um nível entre
Curso, Módulo, Lição, Microssequência e Unidade.

**Plano instrucional do Curso.** Planejamento vivo que reúne público, escopo,
resultados de aprendizagem pretendidos, unidades de análise instrucional,
requisitos de evidência e Partes. Título e objetivo são projetados nele para
leitura, mas pertencem somente à raiz `courses`.

**Parâmetro de desenho instrucional.** Definição fechada e versionada de uma
decisão pedagógica controlável, com schema, escopos, default como hipótese de
produto, limitações e referências. Não inclui limites técnicos ou métricas.

**Atribuição de parâmetro.** Fato append-only que define ou remove o valor de
um parâmetro num escopo e registra origem `automatic|author|research_condition`
e motivo. Herança e `system_default` são calculados, não atribuídos.

**Revisão de orientação de autoria.** Texto original imutável ligado a Curso,
escopo, ator, origem, canal e revisão do Curso. Orientações efetivas acumulam do
Curso ao alvo.

**Interpretação da orientação.** Registro separado que referencia uma revisão
exata e conserva resumo, diretivas, divergências e perguntas. Não substitui o
texto humano nem armazena raciocínio privado.

**Política de componentes.** Valor completo que fixa revisão do catálogo,
disponibilidade `all|allow_only`, referências permitidas, excluídas e
preferidas. A resolução prioriza `author|research_condition` mais próximo,
depois `automatic` mais próximo e, por fim, o default. Exclusão vence e
preferência não autoriza uso.

**Item do plano instrucional.** Enunciado ordenado e versionado de um resultado
de aprendizagem pretendido, uma unidade de análise instrucional ou um requisito
de evidência. A pessoa o edita em linguagem natural, não como JSON.

**Atribuição de item do plano a Microssequência.** Relação muitos-para-muitos
entre uma Microssequência e itens dos tipos unidade de análise instrucional ou
requisito de evidência. Ela define o subconjunto que a materialização daquele
alvo precisa declarar; não é inferida da Parte nem abrange resultados de
aprendizagem pretendidos.

**Faixa preferencial de Partes.** Mínimo e máximo operacionais associados à
origem `automatic`, `author` ou `research_condition`. O padrão 7–12 é
configurável e pesquisável; não é lei pedagógica nem evidência de eficácia.

**Vínculo de produção.** Relação exclusiva entre uma Parte e uma
Microssequência didática, com posição própria de produção. Não altera a posição
curricular da Microssequência e pode ser retirado sem excluir conteúdo.

**Materialização de Parte.** Tentativa persistida e retomável de produzir ou
atualizar conteúdo referente a uma Parte. Possui estado `running`, `completed`
ou `failed`, versão, contexto de desenho derivado pelo servidor e fatos do
resultado.

**Etapa de materialização.** Passo pequeno de carga de contexto, materialização
de uma Microssequência ou validação. Uma confirmação pode gravar fatos,
entidades, vínculo, revisão e atividade na mesma transação.

**Progresso derivado de Parte.** Projeção calculada de vínculos, Unidades,
tentativa mais recente e suas etapas. Não é campo que a pessoa ou o modelo marca
como concluído por declaração.

## Componentes didáticos

**Componente didático.** Unidade funcional que representa conteúdo ou coleta
uma resposta dentro de uma Unidade de estudo.

**Pacote de componente (`component package`).** Módulo versionado que conserva
manifesto, schema, validação, renderer, capacidades e exemplos de um componente.

**Núcleo de execução de componentes.** Código comum de composição, ciclo de
vida, acessibilidade e protocolos. O núcleo não deve conter enums paralelos que
precisem ser alterados para cada pacote novo.

**Biblioteca de componentes.** Índice gerado a partir dos manifests. Browser e
Edge consomem a mesma fonte para descoberta e validação.

**Forma de resposta.** Contrato da interação de prática, como escolha,
preenchimento ou ordenação. Ela é distinta do componente que apresenta a
explicação.

**Hidratação.** Etapa em que um componente já renderizado liga comportamento
interativo ao DOM. Falha de hidratação é falha de runtime mesmo quando o HTML
estático existe.

## Persistência e carregamento

**PostgreSQL.** Banco relacional que é autoridade remota para Curso,
propriedade, acesso, estado pessoal e perfil.

**IndexedDB.** Banco transacional local do navegador. Mantém sessão, páginas em
cache, documentos compostos e mutações pessoais pendentes.

**Storage de objetos.** Serviço que armazena bytes por chave. O runtime desta
revisão o usa somente para fotos privadas de perfil.

**Cache.** Cópia regenerável usada para reduzir latência e rede. Um cache não é
fonte independente de verdade.

**Réplica local.** Cache suficientemente completo para continuar uma tarefa
sem rede. A réplica de Curso permite leitura; a réplica de estado pessoal
também conserva intenção de escrita.

**Lista fina.** Página de descritores sem a composição integral. Contém somente
o necessário para localizar, ordenar e desenhar a Home.

**Paginação por cursor.** Leitura em que a próxima página começa depois da
última chave estável recebida. Curso usa data + UUID; entidade usa tipo +
identidade dentro de uma revisão fixada.

**Inspeção.** Superfície owner-only que percorre Unidades em uma sequência
vertical fiel ao renderer, com respostas inertes. Pode ser delimitada por
Curso, Parte, ausência de Parte, Módulo, Lição ou Microssequência.

**Âncora de Inspeção.** Identidade de Unidade que precisa estar incluída na
página inicial, usada na entrada por link profundo e na restauração. Não pode
ser enviada junto com cursor.

**Cursor de Inspeção.** Fronteira `{studyUnitId}` para buscar a página anterior
ou seguinte sem renumerar a sequência. O cursor não é a posição curricular da
Unidade.

**Posição local de Inspeção.** Registro por dispositivo com escopo, identidade
da Unidade, deslocamento em relação ao topo fixo e revisão do Curso. Serve para
retomada; não é estado compartilhado nem fato pedagógico.

**Janela virtualizada.** Trecho limitado da sequência mantido no DOM enquanto
itens distantes são representados por espaçadores. A Inspeção mantém no máximo
36 Unidades e carrega páginas nas duas direções.

**Carregamento sob demanda (`lazy loading`).** Busca da composição apenas
quando o Curso é aberto. Não significa que qualquer dado local seja descartado
depois do uso.

**Fila offline.** Operações pessoais ainda não confirmadas pelo servidor. A
fila é específica do estado pessoal; não existe uma fila universal de Autoria.

**Estado pessoal de Curso.** Documento por pessoa e Curso com progresso,
marcas para rever e observações. Sua alteração não incrementa a revisão
autoral.

## Concorrência e sincronização

**Concorrência otimista.** Estratégia em que a leitura não bloqueia o objeto; a
escrita só confirma se a versão observada ainda for corrente.

**Compare-and-swap (CAS).** Comparação atômica de `expectedRevision` e, quando
aplicável, da versão esperada do plano, Parte, tentativa ou etapa antes da troca
de estado.

**Idempotência.** Propriedade de repetir o mesmo pedido sem duplicar seu efeito.
Depende da mesma chave e do mesmo conteúdo.

**`requestId`.** Chave de repetição segura. Não é identidade de Curso nem
permissão. Reutilização com outro conteúdo é recusada.

**Recibo de idempotência.** Registro temporário com hash e resultado mínimo.
Ele não substitui evento, histórico ou estado corrente.

**Operação de estado pessoal.** Mutação `set` ou `delete` sobre uma coleção e
caminho validados. Operações podem ser compactadas enquanto aguardam envio.

**Rebase de estado pessoal.** Releitura do estado remoto seguida da reaplicação
das operações locais pendentes. O runtime limita tentativas consecutivas e
informa conflito persistente.

**Lock consultivo transacional (`advisory lock`).** Bloqueio PostgreSQL por uma
chave lógica durante a transação. Serializa pedidos concorrentes sem criar uma
tabela de locks de produto.

**Evento de Curso.** Registro append-only pequeno de uma mudança com consumidor
de auditoria ou pesquisa. Não replica o conteúdo e não registra e-mail.

**Atividade recente de autoria.** Projeção limitada de eventos persistidos de
plano e materialização. Informa espécie, revisão, canal, Parte/tentativa e
instante; copiar um pedido para o chat não cria atividade.

## Autenticação e autorização

**Autenticação.** Verificação da identidade da conta.

**Autorização.** Decisão de permitir uma operação específica sobre um Curso.

**Proprietário (`owner`).** Conta que possui o Curso. Nesta revisão, somente o
proprietário edita e usa a Autoria ou o MCP sobre ele.

**Acesso direto.** Relação Curso–pessoa que concede somente Estudo. Não cria
organização, hierarquia, grupo nem autoridade autoral.

**Perfil de pessoa.** Nome e chave opcional de avatar associados à conta. Não é
um papel de autorização.

**Row Level Security (RLS).** Políticas PostgreSQL que filtram linhas segundo a
sessão autenticada. RLS continua necessária mesmo quando uma RPC também valida
autoridade.

**Princípio do menor privilégio.** Cada papel recebe somente as funções e
tabelas exigidas. O runtime usa allowlist explícita de `EXECUTE`; criar função
nova não a torna automaticamente acessível.

**Service role.** Papel administrativo usado somente dentro das Edge Functions
para chamar funções de serviço. Não é entregue a navegador nem cliente MCP.

**Bucket privado.** Conjunto de objetos sem URL pública. A leitura do avatar
depende de política e relação direta de acesso.

## API, RPC e Edge Functions

**PostgREST.** Camada que expõe funções PostgreSQL por HTTP segundo os grants.

**Remote Procedure Call (RPC).** Função do banco chamada remotamente. O
AraLearn usa RPC para manter transação, autorização e invariantes próximas aos
dados.

**Edge Function.** Função HTTP executada na borda do Supabase. A API de Curso e
o servidor MCP autenticam transporte e delegam mutações às RPCs canônicas.

**Roteador de Curso.** Camada compartilhada que transforma rotas HTTP em
operações de serviço. Evita que interface e MCP implementem regras diferentes.

**Manifesto do runtime.** Resposta fechada com revisão de schema e capacidades
obrigatórias. Site e Edge recusam backend de outra revisão.

## MCP e assistência conversacional

**Model Context Protocol (MCP).** Protocolo pelo qual um cliente descobre
ferramentas e recursos e os chama com argumentos tipados.

**Ferramenta MCP.** Operação tipada, com schema e anotações de leitura ou
escrita. Ferramenta não equivale a acesso direto ao banco.

**Recurso MCP.** Conhecimento legível sob demanda. O recurso de invariantes
contém regras estáveis; dados mutáveis permanecem no Curso.

**OAuth.** Protocolo de autorização usado para conectar conta individual ao
cliente MCP.

**PKCE.** Vínculo entre a solicitação de autorização e a troca do código, usado
para reduzir interceptação. O runtime exige S256.

**Escopo OAuth.** Limite declarado no token. Escopo de escrita permite chamar
ferramenta de mutação, mas não substitui a verificação de propriedade.

**Prompt de sistema.** Instruções estáveis do cliente. Não deve conter cópia do
planejamento mutável do Curso.

**Pedido levado ao chat.** Texto que a interface copia para a área de
transferência para uso num cliente conectado. A cópia não inicia tentativa,
não materializa conteúdo e não autoriza mostrar progresso novo.

**Comando de plano.** Operação semântica fechada para atualizar campos, gerir e
reordenar itens, gerir/dividir/unir Partes ou atribuir, mover e retirar vínculos
de Microssequência. Interface e MCP aplicam o mesmo domínio.

**Comando de composição.** Operação separada que cria, altera ou remove
entidades didáticas. Separá-la do comando de plano impede que reorganizar uma
Parte substitua ou apague conteúdo implicitamente.

**Canal de autoria.** Origem persistida da mutação: `application` para a
interface ou `mcp` para cliente conversacional. Canal descreve transporte; não
muda autoridade, validação ou estado.

## Fontes e proveniência implementadas

**Fonte.** Objeto interno ou externo do qual uma afirmação ou representação é
derivada. No Curso, possui identidade estável e revisões append-only; não é
sinônimo de citação, Âncora ou arquivo armazenado.

**Âncora de fonte.** Seletor versionado que localiza página, intervalo de tempo,
fragmento URI ou trecho textual numa revisão exata da Fonte.

**Atribuição de Fonte.** Snapshot ordenado dos vínculos entre um item do plano
ou uma Unidade, revisões de Fontes, relações declaradas e Âncoras exatas.

**Proveniência.** Relação verificável entre Fonte, planejamento e Unidade. O
corte corrente prova identidade, revisão, relação, localização, ordem e
aplicação por alvo; não afirma uma cadeia W3C completa nem autoria científica.

**Legado não resolvido.** Referência anterior preservada na mesma identidade e
ordem, sem metadados ou Âncora inventados e oculta no Estudo até receber uma
revisão ativa in-place.

## Termos ainda não implementados de ponta a ponta

As definições abaixo delimitam a direção sem alegar capacidade corrente.

**Observação autoral.** Retorno situado que integra o fluxo compartilhado de
Autoria. É distinta da observação pessoal já persistida em Estudo.

**Auditoria instrucional.** Verificação explícita de regras e evidências sobre
uma revisão de Curso.

**Correção autoral.** Alteração que responde a uma decisão e pode ser
reauditada.

**Variante experimental.** Curso derivado de uma base comum sob condição
declarada. A arquitetura mínima ainda não está decidida.

**Dado bruto, medida, métrica, indicador e desfecho.** Níveis distintos do
processo de pesquisa; nenhum deve ser tratado como sinônimo de analytics.
