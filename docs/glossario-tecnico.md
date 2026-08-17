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
Autoria e MCP. Conserva proprietário, metadados, revisão e estado autoral; sua
composição fica em entidades relacionadas.

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

**Envelope `aralearn.library.v1`.** Documento operacional que contém a lista de
Cursos usada pelo renderer. No corte canônico, cada documento de composição
contém exatamente um Curso.

**Unidade de estudo.** Unidade persistida e renderizada no percurso. O conceito
inclui mais do que prática de recuperação.

**Parte de autoria.** Agrupamento operacional configurável para planejar,
produzir e revisar várias Microssequências numa iteração. Não é um nível entre
Curso, Módulo, Lição, Microssequência e Unidade.

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

**Compare-and-swap (CAS).** Comparação atômica de `expectedRevision` com a
revisão corrente antes da troca de estado.

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

**Estado de autoria do Curso.** Estado persistido compartilhado por interface e
MCP. A versão corrente contém Partes, decisões e mandato; parâmetros, fontes e
dados de pesquisa só integrarão o contrato quando suas fatias forem
implementadas.

## Termos ainda não implementados de ponta a ponta

As definições abaixo delimitam a direção sem alegar capacidade corrente.

**Fonte.** Objeto interno ou externo do qual uma afirmação ou representação é
derivada.

**Âncora de fonte.** Seletor que localiza o trecho pertinente dentro da fonte.

**Proveniência.** Relação verificável entre fonte, planejamento, Unidade,
alteração e agente responsável.

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
