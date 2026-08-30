# Registro de mudanças

Todas as mudanças relevantes deste projeto serão registradas aqui.

## [Não publicado]

## [0.0.46] - 2026-08-30

### Corrigido

- o MCP passa a oferecer `add_part` como projeção dedicada e sem campo de
  identidade; o servidor converte a chamada para a alteração canônica, gera a
  identidade e preserva CAS e idempotência;
- `alterarCurso` deixa de anunciar a variante concorrente de criação de Parte,
  mas continua aceitando o formato canônico anterior para compatibilidade;
- `tools/list`, `resources/list` e `resources/read` aceitam `_meta` no formato
  previsto pelo protocolo MCP, sem deixar de rejeitar campos desconhecidos ou
  metadados malformados;
- Actions usa um envelope com exatamente um de `existingSource`, `newSource`
  ou `revisedSource`, e o MCP usa três variantes fechadas; em ambos, a criação
  bibliográfica mínima não oferece identidade, revisão nem estados operacionais
  para o modelo preencher;
- o AraLearn gera a identidade e aplica defaults seguros de tipo, origem,
  disponibilidade, verificação e visibilidade, enquanto o runtime preserva a
  forma 1.x anterior para retries e clientes em cache;
- a projeção conversacional passa a ter versão, fingerprint, snapshot e
  cabeçalho próprios, permitindo distinguir cache de discovery do contrato
  canônico aceito pelo runtime.

## [0.0.45] - 2026-08-29

### Corrigido

- a projeção OpenAPI de Actions permanece completa quando o editor do GPT
  expande o documento importado, preservando as nove operações até `add_part`;
- a validação de release passa a rejeitar o OpenAPI antes que sua representação
  formatada alcance o limite do editor.

## [0.0.44] - 2026-08-29

### Alterado

- a camada confiável comum a MCP e Actions passa a gerar identidades estáveis
  para entidades novas, sem pedir UUID à pessoa ou depender de identificador
  inventado pelo modelo;
- Actions publica uma projeção dedicada para criar Parte e mantém IDs técnicos
  fora das projeções de criação de Parte e item formal do plano;
- a descoberta de Actions oferece `incorporarPdfComoFonte` com o binding oficial
  de arquivo e deixa de anunciar o comando legado que pressupõe metadados do
  Storage.

### Corrigido

- a ingestão de PDF pela superfície conversacional percorre o binding público,
  autorização, validação, RLS, PostgreSQL e Storage antes de confirmar a Fonte;
- retries de criação preservam o mesmo payload, CAS e idempotência, inclusive
  para Partes, itens do plano, Fontes, Âncoras e demais entidades autorais;
- retries de ingestão já confirmada deixam de depender da URL temporária,
  revalidam propriedade e Storage e recusam outro arquivo sob o mesmo pedido;
- relações entre Microssequências novas do mesmo lote usam índices locais sem
  exigir que o modelo invente identidades técnicas;
- a regressão de retomada abre outro cliente, localiza o Curso apenas pelo
  título e recupera Parte, Fonte, PDF e Âncora persistidos.

## [0.0.43] - 2026-08-29

### Adicionado

- PDFs recebidos por MCP ou Actions podem ser incorporados com segurança como
  Fontes persistentes do Curso quando a intenção é inequívoca;
- a retomada em outra sessão recupera Fontes, revisões, Âncoras e o PDF exato
  sem exigir novo envio do arquivo.

### Alterado

- a conversa autoral retoma o Curso pelo título e apresenta estado, pendências
  e próxima decisão em linguagem humana, mantendo revisões, CAS, identificadores
  e hashes somente no estado estruturado necessário;
- anexos ambíguos ou declarados temporários não são persistidos sem confirmação.

### Corrigido

- erros de upload, limite, acesso e concorrência deixam de produzir confirmação
  indevida de escrita;
- MCP, Actions, aplicação web e Android passam a compartilhar o contrato de
  ingestão e retomada de Fontes da revisão hospedada `20260829205000`.

## [0.0.38] - 2026-08-27

### Corrigido

- `add_plan_item` e `update_plan_item` passam a ser publicados como projeções
  dedicadas de Actions, com os campos obrigatórios preservados diretamente no
  objeto importado pelo ChatGPT;
- a verificação do site publicado passa a conferir também essas projeções de
  transporte, sem alterar o protocolo público v1 nem o MCP.

## [0.0.37] - 2026-08-27

### Corrigido

- `add_plan_item` preserva no OpenAPI final os campos obrigatórios da variante,
  inclusive `sourceLinks`, e grava os três tipos de item do plano pela Action;
- payload inválido de item do plano retorna o erro público correspondente, sem
  ser mascarado como `internal_error` antes do acesso ao banco.

## [0.0.36] - 2026-08-27

### Alterado

- a projeção de Actions apresenta raízes e comandos na forma efetivamente
  preservada pelo importador do ChatGPT, sem alterar o protocolo público v1;
- posições de Partes documentam o índice zero-based no contrato público.

### Corrigido

- o GPT volta a receber os campos de revisão e os comandos completos de
  planejamento em `lerCurso` e `alterarCurso`;
- uma posição impossível no plano retorna o erro canônico de entrada, sem ser
  mascarada como falha interna transitória.

## [0.0.35] - 2026-08-27

### Alterado

- MCP e Actions passam a derivar de um protocolo público de Autoria estável,
  versionado e identificável no ambiente publicado;
- o contrato de Actions explicita as variantes de planejamento, desenho,
  Fontes, Observações, auditoria, variantes e materialização;
- a Autoria preserva o Curso visível enquanto sincroniza e apresenta o estado
  da nuvem pela mesma gramática compacta de Estudo.

### Corrigido

- a atualização do plano instrucional e a criação de Partes voltam a funcionar
  pelo ChatGPT com revisão otimista e idempotência;
- a sincronização ao recuperar foco deixa de desmontar ou piscar a tela de
  Planejamento;
- a publicação bloqueia contratos MCP, Actions ou OpenAPI defasados.

## [0.0.34] - 2026-08-27

### Alterado

- Autoria mantém uma faixa curricular compacta e fixa enquanto a sequência de
  Unidades rola, com localização por Curso, Módulo, Lição, Microssequência,
  título, conteúdo ou número;
- Observações e decisões de desenho aparecem no próprio card e permanecem
  disponíveis a MCP e Actions para auditoria, discussão e reparo aprovado;
- Visão geral, Parâmetros, Fontes, Revisão, Variantes e Pesquisa adotam a mesma
  densidade, geometria e divulgação progressiva de Estudo.

### Corrigido

- Cursos extensos abrem qualquer Unidade com sua vizinhança curricular sem
  manter mais de 36 cards no documento;
- o localizador numérico preserva a ordem canônica do Curso mesmo quando os
  níveis estruturais não expõem posição no Course Document;
- retorno, foco, rolagem e marcadores são atualizados após edição, Observação,
  MCP ou Actions sem recompor a tela nem deslocar controles estáveis;
- foi removido o compositor paralelo de pedidos para o ChatGPT: a colaboração
  agora usa os registros persistidos e os contratos reais de MCP ou Actions.

## [0.0.33] - 2026-08-26

### Alterado

- Estudo e Autoria compartilham uma gramática visual icon-first, com títulos
  centralizados, ações quadradas e folhas de geometria estável e rolagem
  interna;
- a Autoria apresenta o conteúdo real das Unidades em sequência curricular e
  mantém edição, Observações, Fontes, auditoria e ChatGPT no contexto do alvo;
- a Assistência por IA sustenta conversa multiturmo e só gera e aplica uma
  proposta ao rascunho depois de **Aceitar e aplicar**.

### Corrigido

- a entrada única do Curso passa pelos Módulos, o avanço do Runtime responde
  imediatamente e o estado de sincronização se atualiza sem deslocar o card;
- Observações, Fontes, Conta e Assistência por IA removem texto de bastidor,
  preservam foco e mantêm seus controles dentro da mesma geometria;
- menus e ações da Autoria permanecem operáveis sobre Cursos extensos, com
  retorno ao card e foco exatos mesmo depois de abrir uma folha contextual;
- a cache de Observações compara consultas canonizadas e preserva a fila local
  ao reconstruir dados incompatíveis.

### Desempenho

- o salto para uma Unidade distante resolve o alvo uma vez e faz uma única
  leitura ancorada, sem percorrer dezenas de páginas intermediárias.

## [0.0.32] - 2026-08-26

### Corrigido

- Autoria abre diretamente a inspeção contínua das Unidades de estudo, mostra
  seu conteúdo completo e oferece ações nomeadas para editar, observar,
  auditar e acompanhar a materialização no contexto certo;
- a entrada única **Abrir** passa sempre pelos Módulos, e o avanço entre
  Unidades confirma primeiro a gravação local sem ficar bloqueado pelo envio
  remoto;
- a Assistência por IA usa uma folha estável e rolável, preserva a mensagem ao
  pedir configuração e apresenta somente contexto útil à pessoa;
- o OpenAPI de Actions acompanha o site publicado e é verificado com sua
  versão, endpoint e cinco operações canônicas.

### Desempenho

- a persistência pessoal separa avanço local e sincronização remota sem perder
  mutações concorrentes ou restaurar cache revogado;
- as políticas de acesso aos Cursos calculam a identidade uma vez por consulta,
  e as provas de concorrência aceitam somente a stack Supabase local.

## [0.0.31] - 2026-08-26

### Adicionado

- a Autoria permite inspecionar imediatamente o conteúdo produzido, registrar
  Observações no próprio contexto e acompanhar desenho, Fontes, parâmetros,
  achados, correções e verificações sem expor contratos internos;
- MCP e Actions operam o mesmo Curso vivo, incluindo Observações, produção,
  auditoria, reparo aprovado e rastreabilidade das decisões de desenho;
- a Assistência por IA em Estudo oferece conversa contextual com OpenAI,
  Gemini ou DeepSeek, usando uma chave efêmera mantida somente na sessão.

### Alterado

- Estudo usa **Voltar** e **Home** como navegação cotidiana e preserva origem,
  rolagem e foco ao alternar modos ou retornar à leitura;
- Autoria organiza tarefas e detalhes por divulgação progressiva, mantém um
  único fluxo de rolagem e carrega inspeções extensas sob demanda;
- parâmetros pedagógicos distinguem herança, decisão automática justificada e
  decisão explícita, além de separar o desenho vigente daquele aplicado à
  versão materializada.

### Corrigido

- folhas, diálogos, retornos contextuais e ações móveis preservam foco, toque,
  estabilidade geométrica e legibilidade entre 360 px e desktop;
- verificação de reparos coordena Observações relacionadas somente depois de
  conferir o conteúdo resultante e mantém proveniência e intenção didática.

## [0.0.30] - 2026-08-24

### Alterado

- Estudo recupera a navegação compacta entre Curso, Módulo, Lição,
  Microssequência e Unidade, com voltar, subir e retomar preservando contexto;
- a edição autorizada fica disponível nos níveis do Curso correspondentes, e
  Visualizar, Editar e Assistência por IA compartilham o mesmo alvo quando
  aplicável;
- Autoria passa a começar por uma Visão geral organizada pelas tarefas de quem
  cria: Planejamento, Conteúdo, Parâmetros e componentes, Fontes, Revisão,
  Variantes e pesquisa e Pessoas e acesso;
- Partes mostram o histórico completo das materializações realizadas pelo
  Aplicativo, MCP ou Actions, incluindo etapas, resultados e retorno aos objetos
  produzidos;
- README e guias passam a ensinar as jornadas correntes sem perder o
  aprofundamento técnico e acadêmico.

### Corrigido

- barras superiores, textos extensos, foco, alvos de toque e reflow permanecem
  utilizáveis em telas móveis e desktop;
- os rótulos visíveis e acessíveis usam **Assistência por IA**, e a área
  **Conteúdo** deixa de expor nomes da antiga divisão interna da Autoria.

## [0.0.29] - 2026-08-24

### Alterado

- instalações novas e atualizações passam a conservar somente o modelo
  corrente de Curso, sem estruturas anteriores concorrendo com Estudo,
  Autoria, Pesquisa ou integrações.

### Corrigido

- Actions/OpenAPI resolve a identidade pelo contrato próprio e não depende do
  resolvedor OAuth do MCP.

## [0.0.28] - 2026-08-24

### Adicionado

- Estudo apresenta o percurso completo de Curso, Módulo, Lição,
  Microssequência e Unidade, com retorno previsível, progresso, Observações e
  continuidade entre dispositivo e servidor;
- a Unidade oferece Visualizar, Editar e Assistência por API como modos irmãos
  sobre o mesmo alvo, inclusive com criação segura de cópia pessoal;
- a Assistência por API funciona como sessão contextual: conversa sobre o
  plano, pede confirmação, descobre contratos didáticos exatos e só aplica uma
  proposta depois de validá-la no renderer real;
- Autoria reúne planejamento, materialização, parâmetros, Fontes e PDFs,
  inspeção, auditoria e correção, variantes, pesquisa e gestão de pessoas;
- GPTs personalizados podem usar as cinco operações autorais por Actions e
  OpenAPI, como integração distinta do MCP;
- identidades administrativas autorizadas dispõem de inventário e manutenção
  operacional pela interface.

### Alterado

- a Home distingue Estudo de Autoria, expõe as ações de ciclo de vida de cada
  Curso e preserva dados locais como uma operação separada;
- a documentação pública passa a ensinar o produto corrente por jornadas,
  fundamentos, integrações, implantação e referências verificáveis.

### Corrigido

- propostas inválidas ou não renderizáveis da assistência deixam de poder
  substituir o conteúdo corrente;
- navegação, foco, área segura, textos extensos e menus mantêm o percurso de
  Estudo utilizável em telas móveis e desktop.

## [0.0.27] - 2026-08-21

### Alterado

- **Conta e aparência** separa o logout comum, a remoção dos dados locais da
  conta ativa, o logout com remoção local e a exclusão irreversível da conta;
- o catálogo público do MCP passa a cinco ferramentas autorais, enquanto
  Perfil e gestão de Pessoas permanecem exclusivos da aplicação autenticada;
- a autorização MCP usa somente `offline_access`, não emite `id_token` e
  apresenta aliases pareados ao recurso; a função de borda valida assinatura,
  sessão, cliente e consentimento vivos antes de executar uma ferramenta;
- o envio de PDF usa intenção privada de dez minutos e requisição autenticada,
  com limite de 20 MiB por arquivo, oito anexos por revisão de Fonte e 64 MiB
  de conteúdo único por Curso; o contrato v1 permanece apenas no download
  legado do Android 0.0.26;
- a limpeza diária passa a tratar, em lotes limitados, registros retirados,
  recibos, intenções de PDF e janelas de concessão, além de inventariar órfãos
  sem removê-los automaticamente.

### Corrigido

- projeções MCP, exportações de Observações, cargas enviadas ao provider, erros
  e registros operacionais deixam de expor campos que não pertencem ao caso de
  uso autorizado;
- a resposta imediata de concessão de acesso deixa de revelar se o e-mail
  possui conta ou se a relação mudou e passa a admitir dez tentativas por conta
  a cada dez minutos;
- logout e limpeza local distinguem dados já persistidos de alterações abertas
  somente no formulário; depois da confirmação remota, a exclusão da conta
  permanece terminal mesmo se outra aba bloquear a limpeza do dispositivo;
- o orçamento de PDFs considera conteúdo já vinculado, objetos físicos e
  intenções ainda válidas, sem cobrar duas vezes os mesmos bytes dentro do
  Curso.

## [0.0.26] - 2026-08-21

### Alterado

- o proprietário continua editando o Curso corrente; quem recebeu acesso direto
  pode editar uma Unidade no próprio Estudo, manualmente ou com a assistência
  complementar por API, e a primeira gravação com mudança material cria um
  Curso pessoal privado e mantém a pessoa na mesma Unidade;
- a cópia pessoal recebe a composição didática necessária, mas começa com
  planejamento, Fontes, PDFs, acessos, progresso e Observações próprios; o
  Curso compartilhado e os registros ligados a ele permanecem inalterados;
- a Home distingue **Compartilhado com você** de **Sua cópia**, sem mostrar
  identificadores, revisões ou detalhes de persistência.

### Corrigido

- abrir o editor, pedir uma prévia à assistência, cancelar, receber falha ou
  salvar conteúdo sem mudança não cria uma cópia pessoal;
- a primeira gravação conserva no IndexedDB um envelope delimitado e
  idempotente quando a conexão falha ou a resposta é ambígua; a reconexão
  repete o mesmo pedido, enquanto duas intenções concorrentes não criam duas
  cópias, e a confirmação continua reconciliável se o acesso à origem for
  revogado;
- a operação destinada à cópia pessoal permanece exclusiva da aplicação e não
  amplia as ferramentas autorais do MCP nem a autorização para alterar o Curso
  original;
- uma versão salva exibida enquanto os dados são atualizados deixa de ser
  anunciada como falta de conexão; **Sem conexão** fica reservado ao estado
  realmente offline.

## [0.0.25] - 2026-08-21

### Alterado

- a entrada de Estudo volta a apresentar um combobox de Curso e uma única
  prévia rica, com título, objetivo, relação de acesso, progresso, estrutura e
  disponibilidade neste dispositivo;
- **Começar**, **Continuar** e **Retomar** levam diretamente à primeira Unidade
  pendente ou à última posição válida, sem baixar a composição dos demais
  Cursos;
- a fila **Rever** fica recolhida depois da prévia e possui indicação visual,
  foco por teclado e itens limitados ao Curso selecionado.

### Corrigido

- a seleção e a posição de estudo sobrevivem a retorno, recarga e uso offline,
  sem deslocar a aba ativa quando outra aba muda de Curso;
- mudança de revisão, reconexão e revogação revalidam a cópia local, eliminam
  conteúdo inacessível e escolhem um Curso autorizado sem apagar a lista válida
  dos demais;
- troca de Curso limpa Fontes, observações e estado editorial contextuais, e o
  histórico manual permanece isolado mesmo quando dois Cursos reutilizam o
  identificador de uma Unidade;
- falhas ao entrar, abrir um item para rever ou zerar progresso aparecem na Home
  e devolvem o foco a um controle utilizável;
- a Home deixa de misturar o cartão de navegação com a antiga subseção de
  prévia; a composição final preserva uma coluna de até 430 px em 360, 390, 430
  e 1280 px, nos temas claro e escuro.

## [0.0.24] - 2026-08-20

### Alterado

- a versão 0.0.24 limita toda a Autoria a 430 px, inclusive em telas de
  1280 px, e distribui suas capacidades por quatro grupos progressivos em
  ícones: Curso, Revisar, Pesquisa e Pessoas;
- formulários preservam rascunho, seleção e foco ao atualizar dados, trocar de
  área ou reencontrar a aplicação, sem retirar o acesso aos controles
  avançados;
- a edição manual contextual volta a atuar nas folhas textuais que cada
  componente declara editáveis, tanto na Inspeção quanto em Estudo, usando a
  Unidade de estudo, o renderer, a validação e a autorização correntes;
- a assistência complementar por API usa, em produção, um relay local na porta
  4183, com a credencial fora do AraLearn; chamadas diretas a providers e entrada
  de chave aparecem somente no runtime explícito de desenvolvimento, com alerta;
- o pedido dessa assistência omite identidades internas, PDFs, Fontes e outras
  Unidades, leva apenas pedido, valores textuais editáveis, título, papel, tópicos
  e mensagens anteriores e mostra a sugestão no renderer antes de salvar;
- a resposta assistida usa `changes` esparso, com no máximo um caminho por
  pedido e até 8.000 tokens de saída; trechos acima de 6.000 caracteres por
  caminho ou 12.000 no contexto desabilitam a assistência com motivo acessível,
  sem retirar a edição manual;
- a interface reconcilia revisões recebidas depois de uma resposta ambígua e
  repete comandos de escrita com a mesma identidade, evitando duplicação de
  Cursos, Partes, Fontes, Âncoras, observações, variantes e rodadas de
  auditoria;
- o manifesto hospedado avança para `20260820224424`; a nova operação
  contextual registra origem manual ou por assistência, preserva a proveniência
  histórica somente quando o conjunto anterior é carregado sem alteração e
  exige promover banco e funções antes dos clientes.

### Corrigido

- confirmações da auditoria distinguem aplicação, reversão e descarte e
  permanecem acessíveis por teclado, toque, clique externo e tecla Esc;
- textos extensos, menus, barras de rolagem e áreas de toque permanecem
  utilizáveis entre 360 e 430 px e em telas de computador;
- um recibo 2xx de edição contextual promove imediatamente no IndexedDB o
  snapshot confirmado e o documento `course.v1` antes de invalidar as projeções,
  sem repetir a escrita e preservando progresso, Observações e posição; Estudo e
  Inspeção o leem sem rede, enquanto releitura igual o normaliza, revisão
  superior o substitui e logout, limpeza ou revogação purgam a cópia;
- a réplica IndexedDB acompanha também revisões observadas depois de alterações
  pelo MCP e rebasa as versões esperadas antes de outra edição contextual, sem
  perder seleção, progresso ou Observações;
- sair ou encerrar destrói a superfície ativa e cancela chamadas ao provider
  antes de apagar a sessão e fechar os armazenamentos; uma resposta tardia não
  restaura sobreposição, callback, configuração ou credencial.
- o relay do navegador classifica `127.0.0.1` e `localhost` como loopback e
  `10.0.2.2` como rede local; a classificação anterior bloqueava a chamada real
  ao endereço de loopback.

### Limites atuais

- o relay da assistência foi comprovado no ambiente HTTP local. O aplicativo
  Android usa uma ponte nativa fixa para não depender de uma chamada HTTPS para
  HTTP no WebView, sem relaxar `MIXED_CONTENT_NEVER_ALLOW`; Pages ainda precisa
  do ensaio real de acesso à rede local; o APK de release foi compilado e
  publicado, mas a paridade depende de sua instalação e do ensaio em dispositivo
  real.

## [0.0.23] - 2026-08-20

### Adicionado

- Autoria integrada ao próprio Curso, com planejamento instrucional, Partes
  retomáveis, parâmetros de desenho, inspeção paginada, auditoria e correções;
- Fontes versionadas, Âncoras exatas, relações de proveniência e PDFs privados
  com limites, deduplicação, exportação e acesso autorizado;
- Variantes comparáveis com diferenças declaradas e factuais, sem misturar a
  comparação técnica com inferência causal;
- área Pesquisa com sete conjuntos de fatos, filtros, paginação, métricas e
  exportações que preservam revisão, denominador e dados ausentes;
- perfil humano mínimo, avatar privado e acesso direto de outra pessoa ao
  Estudo, com as mesmas regras na interface e no MCP;
- recurso visual do MCP para inspecionar o Curso e seus componentes no cliente
  compatível.

### Alterado

- Estudo, Autoria, API e MCP passam a usar a mesma identidade e a mesma revisão
  de Curso, sem recipiente autoral intermediário;
- o catálogo de componentes didáticos mantém 32 contratos versionados, busca
  limitada e classificação explícita dos usos que exigem restrição;
- o corte hospedado valida a topologia real dos oito Cursos, aplica as
  migrações funcionais em uma transação e conserva cópia verificável antes da
  retirada física das estruturas substituídas;
- instalações Android 0.0.22 precisam ser atualizadas porque o contrato remoto
  substituído não permanece como camada de compatibilidade;
- a documentação pública foi reescrita como descrição corrente do produto, de
  seus fundamentos e de seus limites observáveis.

### Corrigido

- uma revisão remota inválida deixa a última cópia estudável disponível, mesmo
  depois de reiniciar o aplicativo;
- paginação, retorno de escopo, reconexão, foco, menus e mensagens da Autoria
  permanecem utilizáveis entre 360 e 430 px e em telas de computador;
- exclusão de conta remove avatares e PDFs dos Cursos próprios antes de apagar
  os vínculos relacionais e recusa a operação quando algum objeto permanece;
- URLs assinadas de PDFs usam a origem pública correta fora da rede interna do
  Supabase.

### Removido

- Workspaces, Actions, sincronização relacional e assistência por Card que não
  possuíam consumidor no produto corrente;
- adaptações silenciosas para contratos de autoria e estado pessoal que nunca
  foram publicados.

## [0.0.22] - 2026-08-18

### Corrigido

- o curso **Dataprev: Analista de Processamento** voltou a ser materializado a
  partir de uma nova revisão publicada no contrato canônico atual, sem alterar
  os identificadores usados pelo progresso dos estudantes;
- o curso **Microsoft Azure AI Fundamentals (AI-900)** também recebeu a revisão
  canônica que atualiza seus `relation_map` e `plane`, preservando integralmente
  suas identidades;
- a publicação do GitHub Pages tolera falhas transitórias de propagação sem
  esconder erros permanentes de conteúdo, MIME ou disponibilidade;
- a release Android reconhece a saída real do `apksigner`, deriva a identidade
  esperada do projeto e, no fluxo automático, só é publicada depois da
  validação bem-sucedida da revisão ainda corrente na `main`;
- o job do Supabase local limpa resíduos do runner e repete apenas a
  inicialização que pode sofrer colisão transitória de porta;
- os workflows usam as gerações correntes de checkout, Node e Java compatíveis
  com o runtime Node 24 dos runners do GitHub.

### Removido

- a adaptação em runtime de revisões publicadas antigas; os cursos ativos devem
  obedecer ao mesmo contrato canônico validado na autoria e na publicação.

## [0.0.21] - 2026-08-18

### Corrigido

- a release intermediária passou a reconhecer o certificado V2 emitido pelo
  `apksigner`, repetir o smoke do Pages durante a propagação e conservar a
  última réplica oficial válida quando uma revisão remota fosse incompatível.

## [0.0.20] - 2026-08-16

### Adicionado

- ciclo técnico de Autoria promovido: planejamento instrucional versionado,
  auditoria de conformidade, variantes experimentais, atribuição controlada e
  base de analytics preparada para coleta posterior;
- publicação coordenada de migrations e funções remotas da Autoria antes do
  lançamento do cliente correspondente.

### Corrigido

- validações, proveniência, currentness, paginação e isolamento de variantes
  foram reforçados no fluxo de Autoria e nos artefatos móveis.

### Adicionado

- shell responsivo com entrada explícita **Estudo/Autoria** na mesma aplicação
  web e APK, landing de Workspaces/Coleções e destinos registrados Mapa,
  Desenho, Conteúdo e Auditoria, preparado para Resultados contextual;
- projeção canônica revisionada de estado dos workspaces e microssequências,
  distinguindo planejamento, análise, materialização, finding e pronto sem usar
  contagem de cards como meta nem depender de cache visitado;
- editor progressivo de Resources com escolha explícita entre conjuntos,
  famílias/facetas, paginação e aplicação a curso, lição, microssequência ou
  grupo de microssequências, preservando membros fora da página;
- cliente de Autoria vinculado à réplica da conta para lista, Mapa, Desenho,
  findings paginados, conteúdo transitório e sincronização limitada das filas;
- ferramenta agrupada `gerirDesenhoInstrucional` no MCP e na Action para ler o
  slice JIT de uma microssequência, consultar um contrato promovido por vez e
  persistir análise, assignments, `ResourceSet`, snapshot, blueprint e
  manifesto pelas mesmas operações versionadas do backend;
- oito chunks recuperáveis de knowledge para análise instrucional,
  granularidade, elaboração, evidência e prática, tarefas profissionais,
  resolução, descoberta sob `ResourceSet` e conformidade, com seleção
  determinística por intenção e contexto;
- regressão de engenharia versionada para os cenários multidisciplinares A–H
  da #104, incluindo variação Auto local, preservação de override manual e
  bloqueio por `research_lock`, sem alegação de validação educacional;
- persistência relacional normalizada, imutável e versionada para análise
  instrucional, definições e atribuições de parâmetros, snapshots efetivos,
  `ResourceSet`, blueprints pedagógicos v2 e manifestos de materialização, com
  CAS, idempotência, proveniência e referências exatas entre os artefatos;
- resolvedor determinístico de parâmetros por
  `workspace → course → module → lesson → microsequence`, com prioridade
  `research_lock` → override manual → Auto → default, substituição integral pelo
  ancestral aplicável mais próximo dentro do modo, conflito explícito para
  duplicidade do mesmo modo no mesmo escopo e lock como barreira separada;
- binding versionado entre análise, snapshot efetivo e blueprint pedagógico v2,
  acompanhado de diff factual entre plano e materialização, sem transformar a
  comparação determinística em parecer pedagógico;
- réplica fracionada do estado de desenho em `syncState` e fila não canônica
  somente para override manual ou restauração de Auto, sempre sujeitas a nova
  validação remota de revisão, capacidade e locks;
- evidência pública reproduzível do orçamento serializado de análise, snapshot
  e manifesto em um cenário de 500 microssequências;
- capítulo de desenho instrucional parametrizado distingue construtos
  científicos, operacionalizações do AraLearn, propriedades técnicas e
  hipóteses empíricas, preservando conjuntos, vetores e relações quando um
  score apagaria informação;
- o diagnóstico pedagógico contextual passa a integrar a autoria estrutural:
  condições de aprendizagem, exigências do conteúdo,
  dificuldades previstas e respostas de desenho ficam vinculadas por
  microssequência e são apresentadas para decisão humana antes dos cards;
- o package `aralearn.resource.terminal_session` representa sessões textuais
  observáveis e ordenadas sem executar comandos, com streams separados,
  acessibilidade, rolagem local e prática determinística somente sobre entradas;
- um corpus versionado de cinco cenários contrasta lacuna material, contexto já
  suficiente, área não técnica, pedido completo e risco de densidade, sem alegar
  eficácia pedagógica.

### Alterado

- Coleções passa a integrar Autoria; Estudo permanece centrado em Trilhas e no
  leitor, sem chat ou controles administrativos instrucionais;
- parâmetros aplicáveis são apresentados por valor efetivo, origem, Auto,
  controle estruturado e lock não editável, sem formulário extenso, IDs ou JSON;
- o leitor corrente abre alvos de Mapa/Auditoria e restaura o contexto de
  Autoria ou a seleção anterior de Estudo, inclusive para workspace
  compartilhado que não foi adicionado a Trilhas;
- os system prompts distribuídos passam a conter somente protocolo e
  invariantes estáveis; teoria, exemplos e o catálogo de parâmetros ficam no
  knowledge JIT, enquanto o workspace persistido continua sendo a fonte
  canônica entre sessões;
- a materialização remota passa a seguir análise → bootstrap versionado de
  `ResourceSet` quando necessário → assignments → snapshot → descoberta
  restrita → blueprint → cards em memória → validação → persistência →
  releitura → manifesto, sempre uma microssequência por vez;
- `contracts` da biblioteca de resources entrega exatamente uma versão por
  chamada; política e `ResourceSet` podem bloquear aproximações, que nunca são
  tratadas como equivalência silenciosa;
- o planejamento separa fontes e objetivo, análise instrucional,
  parâmetros, disponibilidade e seleção de resources, blueprint contextual e
  materialização; cards, palavras, caracteres e quantidade de resources passam
  a ser descritos apenas como métricas derivadas;
- `ResourceSet` separa o conjunto exato de `package@version` disponível da
  seleção local e das instâncias realmente materializadas, sem tratar
  `canonical`, `versatile` e `substitute` como equivalência; cada seleção aponta
  para o mesmo conjunto versionado que autoriza package, ajuste e papel;
- workspaces anteriores à análise parametrizada permanecem explicitamente
  `unresolved`; conteúdo já materializado é projetado como
  `legacy_unrestricted`, sem inventar valores retroativos nem converter o
  catálogo histórico em um `ResourceSet` fictício;
- a autoria passa a consultar primeiro o contexto disponível, perguntar somente
  quando a informação ausente muda materialmente o desenho e persistir apenas
  contexto e decisões aprovadas, sem persistir conversa ou raciocínio privado;
- auditorias passam a confrontar diagnóstico, plano e cards, incluindo resposta
  prometida ausente, prática sem base, representação inadequada, perda de
  cobertura e dependência de meio externo indisponível;
- documentação pública reorganizada como material de aprendizagem, com
  apresentação do produto, percursos por finalidade, explicações progressivas
  dos conceitos técnicos e pedagógicos, justificativas das decisões e
  referências bibliográficas legíveis;
- guias de uso, autoria, administração, desenvolvimento e implantação passam a
  declarar pré-condições, procedimentos, resultados esperados, comportamento
  sem conexão e formas seguras de recuperação;
- materiais humanos e instruções executáveis de autoria passam a ter funções
  editoriais explícitas, evitando que a concisão necessária aos modelos de
  linguagem determine a profundidade da documentação destinada às pessoas;
- diagramas sistêmicos preservam a organização vertical e usam uma única
  superfície praticável, com zoom e pan no card, pinça no celular e exploração
  em tela cheia por controles compactos em ícones, sem sobrepor o desenho;
- os comandos de diminuir e aumentar ficam disponíveis no próprio quadro; a
  exploração conserva a largura móvel, deixa o retorno separado e recupera o
  enquadramento global ao atingir o menor zoom;
- os modos contextuais passam à barra superior, liberando altura para o card; no
  leitor, o nome do curso deixa de ocupar uma linha visual, o painel recebe um
  ícone de áreas e a geometria móvel fica simétrica mesmo quando há scrollbar;
- a prosa principal passa a 15,5 px, com entrelinha e espaçamentos proporcionais,
  sem reduzir alvos de toque nem controles e textos interativos;
- a ordenação passa a permutar pelo menos dois trechos nos próprios campos de
  `paragraph` e `table`, inclusive entre instâncias ou células diferentes, com
  setas por ícone para a esquerda e a direita;
- o dimensionamento da autoria estrutural volta a decorrer do escopo, das
  dependências, das dificuldades e da progressão, sem cotas pedagógicas de
  cards, microssequências, Partes ou alternativas.

### Corrigido

- caches de Autoria passam a avançar monotonicamente por revisão e a falhar de
  forma best-effort; fila de Desenho é encontrada na inicialização, reconexão e
  saída, sem exigir reabrir a microssequência;
- conflito de parâmetro prevalece visualmente sobre pendência, e escolher Auto
  coalesce override local ainda não enviado em vez de aplicá-lo depois;
- paginação, pesquisa e filtros de Resources conservam desmarcações e membros
  invisíveis; aplicação parcial mantém resultado por alvo e caminho explícito
  de recuperação;
- a extensão SQL da continuidade preserva as operações já vigentes e passa a
  validar `representationSelection` e `pedagogicalDiagnosis` sem substituir o
  validador anterior nem converter o novo desenho em `authoring_state`
  monolítico;
- lacunas em destinos distintos da tabela de transição mantêm valor e opções
  próprios, mesmo quando as respostas estruturais coincidem;
- diagramas complexos deixam de depender de barras aninhadas no Android; o
  quadro mantém sua geometria enquanto o próprio desenho recebe zoom e pan;
- a edição manual volta a atuar diretamente nos rótulos textuais visíveis, com
  caret e contorno no próprio resource, sem formulário auxiliar, texto técnico
  ou alteração da geometria do card;
- o embaralhamento de alternativas volta a admitir qualquer permutação,
  inclusive a ordem autoral original, sem viés de rotação.

### Removido

- a entrada visual de Chatbot/assistência autoral interna e a duplicação de
  Coleções em Estudo; linguagem natural de planejamento permanece no GPT
  externo conectado ao workspace;
- a calibração pedagógica global, seu perfil local, a terceira superfície do
  painel e as exportações de instruções calibradas deixam de integrar o produto;
  as decisões pedagógicas passam a ser locais e justificadas por
  microssequência;
- o encaixe de correspondências deixa de existir como resposta autônoma;
  correspondências simples passam a usar lacunas independentes nos campos
  textuais em que cada relação é lida.

## [0.0.19] - 2026-08-13

### Adicionado

- corpus documental técnico-científico reconciliado com a implementação,
  incluindo glossário técnico, matriz de conformidade entre documentação e
  código, percurso de leitura para pesquisa e bibliografia acadêmica ampliada;
- fundamentação explícita das decisões pedagógicas, arquiteturais e de
  avaliação do artefato, distinguindo evidência, hipótese de projeto, decisão
  vigente e limitação ainda aberta.

### Alterado

- documentação pública, material autoral e pacotes derivados passam a usar
  terminologia precisa de computação e educação, conforme a revisão
  técnico-documental do estado implementado;
- diagramas relacionais compatíveis com leitura vertical passam a priorizar o
  eixo superior-inferior em telas móveis, preservando as convenções cuja
  orientação horizontal é semanticamente relevante.

### Corrigido

- `chart` e `plane` voltam a materializar gráficos sob a política de segurança
  de conteúdo do app, por meio do interpretador de expressões do Vega
  distribuído para operação local e offline;
- lacunas repetidas em tabelas de transição e outros packages passam a manter
  estado e opções independentes, sem preencher controles distintos em bloco;
- enquadramento e orientação de diagramas densos reduzem rolagem lateral
  desnecessária no celular sem comprimir a representação acadêmica.

> As entradas de versões anteriores preservam os nomes e as interfaces usados
> em seu contexto histórico. A terminologia vigente está definida em
> `docs/glossario-tecnico.md`.

## [0.0.18] - 2026-08-13

### Adicionado

- biblioteca progressiva de `resources`, organizada por vocabulários e perfis
  acadêmicos, com descoberta, busca, inspeção, contratos seletivos, validação e
  auditoria por uma única ferramenta MCP;
- curso oficial `AraLearn: Catálogo de recursos`, com 32 microssequências e 64
  cards para exercitar os packages de conteúdo e resposta no fluxo real;
- conversa iterativa na assistência de cards, com recomposição estrutural,
  versões limitadas, ramificação, desfazer, refazer e restauração determinística.

### Alterado

- o kernel deixa de conhecer a lista concreta de packages; o índice é gerado a
  partir das pastas instaladas e compartilhado entre navegador e Edge Runtime;
- o GPT escolhe representações por intenção e facetas antes de receber somente
  os contratos necessários, podendo combinar múltiplos conteúdos compatíveis;
- módulos de uma única lição abrem diretamente no ponto de estudo pertinente,
  sem alterar a hierarquia ou a navegação de Autoria;
- decisões representacionais substitutivas preservam intenção, limitações e
  proveniência sem bloquear a produção do curso.

### Corrigido

- assistência por API distingue edição textual de troca de representação e
  conserva explicações sem alteração dentro da conversa;
- auditoria recusa cards estruturalmente inválidos e não classifica como
  canônica uma modalidade prática ausente;
- navegação do histórico reconhece pedidos naturais em português sem confundir
  menções explicativas, negações, títulos ou rótulos com operações estruturais.

### Removido

- rota produtiva `/teste-recursos`, substituída pelo curso oficial no catálogo;
- ferramenta intermediária de consulta de packages, endpoints REST paralelos e
  contrato conversacional anterior da assistência.

## [0.0.17] - 2026-08-12

### Alterado

- modo Estudo, edição, assistência, autoria MCP e Edge Runtime passam pelo
  mesmo kernel e pelo registro versionado de packages, sem projeção para um
  contrato anterior;
- `graph` apresenta relações fora do desenho e `relation_map` materializa
  correspondências em linhas DOM responsivas, inclusive no card completo;
- os contratos de `choice`, `gap`, `ordering`, `flow` e `table` são
  materializados exclusivamente por seus packages;
- o backend publica um manifesto corrente achatado, sem cadeia de wrappers,
  e reutiliza uma única raiz autoral oficial por curso do catálogo.

### Corrigido

- enunciados de `choice` deixam de ser duplicados em `paragraph`;
- rótulos de `graph` e `relation_map` deixam de se sobrepor a arestas,
  conectores e outros elementos em larguras móveis;
- a montagem de tabelas preserva multilinhas, contém a rolagem horizontal e
  ocupa a largura disponível quando o conteúdo é curto.

### Removido

- renderer e normalizador monolíticos, contratos globais de resource,
  projeções intermediárias e módulos auxiliares exclusivos do formato
  abolido;
- alvos antigos de observação e qualquer aceitação de cards fora do envelope
  fechado `aralearn.library.v1`;
- funções intermediárias do manifesto remoto e o recurso transitório de
  reatribuição de raiz do catálogo.

## [0.0.16] - 2026-08-12

### Adicionado

- kernel de cards independente dos packages de conteúdo, resposta e feedback,
  com catálogo compacto e contrato versionado consultado somente após a escolha
  pedagógica do resource;
- calibração autoral mínima em quatro blocos declarativos, com preset seguro,
  edição offline e precedência explícita sem tornar o núcleo do motor editável;
- avaliador de blueprint pedagógico para impedir teoria condensada, siglas sem
  referente, prática sem preparação e quantidade de cards definida por custo;
- galeria visual package-native e cobertura mobile dos 19 packages instalados.

### Alterado

- biblioteca, cursos oficiais, autoria incremental, Action e MCP passam a usar
  exclusivamente `aralearn.library.v1` e instâncias `id/package/version/data`;
- `graph` e `relation_map` foram reconstruídos com layout determinístico,
  alternativa textual integral e rótulos contidos em telas estreitas;
- assistência e edição manual de cards operam diretamente nas folhas textuais
  dos packages, preservando identidade, versão, estrutura e respostas formais;
- materiais do Chatbot orientam progressão do zero, explicação em camadas,
  escolha cognitiva de resources e prática abundante conforme a microssequência.

### Corrigido

- tema, retomada, feedback e avanço respondem localmente mesmo quando uma
  requisição remota fica pendurada;
- retomada deixa de exigir alternância de processo para reabilitar o card;
- expressões técnicas seguidas de sigla, como `Transmission Control Protocol
  (TCP)`, deixam de receber destaque parcial ambíguo;
- edição offline de feedback sobrevive à recarga e sincroniza sem converter o
  card para a representação anterior.

### Removido

- contrato monolítico v4, estados burocráticos de publicação na
  microssequência, rotas globais de resource e fallback de assistência para
  cards antigos;
- harness antigo de assistência e galeria visual dependente do documento v4.

## [0.0.14] - 2026-08-01

### Adicionado

- interface clara e minimalista com modos Sistema, Claro e Escuro, ícones SVG
  coerentes e os dezoito recursos didáticos adaptados aos dois temas;
- Central progressiva para localizar workspaces em construção, cursos em
  Trilhas, avaliações, Coleções, itens para rever, observações e pendências do
  dispositivo;
- workspaces educacionais administráveis pelo aplicativo, com convites, seis
  papéis locais, composição corrente dos cursos e capacidades compartilhadas
  com Chatbot e Plugin;
- observações pedagógicas situadas no card, com categorias, resposta do
  responsável, triagem qualitativa e funcionamento offline;
- estado de estudo não punitivo para continuar, concluir estruturalmente e
  marcar cards para rever, sem armazenar tempo, tentativas, acertos ou erros;
- autoria composta por curso, módulo, lição, tópico, microssequência e card,
  com uma única representação corrente de cada parte e materialização
  incremental por microssequência;
- fluxo editorial em que autores submetem a publicação privada escolhida,
  inclusive parcial, e contas editoriais podem inspecionar, corrigir, devolver,
  aprovar e publicar trabalhos de terceiros;
- administração conversacional de `Coleções`, incluindo criação, atualização,
  retirada, transferência e realocação de cursos;
- brief persistente e orientação RAG para registrar público, objetivo, fontes,
  recorte e decisões do curso sem copiar anexos para o banco;
- feed limitado das alterações recentes e recibos idempotentes temporários
  para continuidade segura da conversa sem snapshots do documento completo.

### Corrigido

- o modo Editar passa a sincronizar somente as microssequências confirmadas e
  publica uma prévia privada parcial; correções em cursos oficiais criam um
  curso privado em Trilhas sem alterar a publicação do catálogo;
- navegação, toque, retorno entre telas e controles de estudo permanecem
  imediatos em cursos extensos, no navegador e no Android;
- a Action do ChatGPT passa a aceitar estrutura planejada e cards completos
  pelos campos inequívocos `parts`, `cardsJson` e `cardJson`, eliminando a
  rejeição que deixava um workspace recém-criado vazio;
- Chatbot e Plugin usam o mesmo conjunto de operações e resolvem as
  capacidades pela conta OAuth conectada, sem separar artificialmente um GPT
  privado de outro administrativo;
- cursos oficiais só podem ser lidos como fonte de autoria quando pertencem às
  `Trilhas` da conta ou quando a conta possui capacidade editorial;
- a listagem dos próprios envios editoriais volta a funcionar para autores
  privados sem expor a fila de outras contas;
- a retirada conversacional de um curso de `Trilhas` preserva a publicação
  oficial ou arquiva somente a publicação privada própria, com idempotência,
  compare-and-swap e bloqueio de submissão ainda ativa;
- publicação editorial própria deixa de exigir uma submissão fictícia, ao
  passo que a publicação de trabalho alheio permanece vinculada exatamente à
  submissão analisada;
- lacunas autorais são compiladas de `{gap:id}` e `gaps` para a notação
  canônica antes da persistência, e notação interna ou misturada recebe erro
  preciso sem gravar o lote;
- tópicos de lições podem ser corrigidos depois da criação e cursos retirados
  podem ser consultados explicitamente pela administração do catálogo;
- leitores de `Trilhas` e `Coleções` passam a depender apenas da autoridade
  vigente do modelo composto, sem símbolo removido do corte anterior;
- o YAML da Action conserva todas as operações abaixo do orçamento de
  importação e mantém `components.schemas` em formato OpenAPI válido;
- artefatos de publicação são pré-registrados antes do upload, de modo que
  falhas de rede, timeout ou concorrência deixem uma reserva coletável em vez
  de um objeto invisível ao plano de controle;
- o feed pessoal e seu ledger idempotente passam a executar a política de
  retenção automaticamente, no máximo uma vez por dia, sem depender de uma
  chamada administrativa manual.

### Alterado

- o leitor mantém o card como superfície principal: Ler oculta controles de
  autoria e Editar oferece seleção de recursos, edição textual, pedido à IA,
  prévia, aplicação, descarte e uma reversão compacta no próprio contexto;
- a documentação pública passa a ser organizada por público, auditada quanto a
  links, linguagem, neutralidade de domínio e coerência com o produto corrente;
- a publicação de cada curso do workspace agora mantém um vínculo compacto por
  destino: a primeira chamada cria e as seguintes atualizam automaticamente a
  mesma identidade, sem modo manual nem dependência da conversa anterior;
- workspaces deixam de armazenar revisões integrais: cada alteração grava
  somente as partes afetadas, e `revision` atua apenas como controle de
  concorrência;
- cada curso publicado conserva somente a revisão compacta corrente; o
  artefato substituído e os artefatos de submissões encerradas ficam elegíveis
  à coleta de órfãos;
- o feed de revisões conserva somente o sinal mais recente por curso e
  audiência, inclusive um tombstone por curso retirado, sem acumular sinais de
  republicações nem perder a semântica de cursor;
- publicação privada parcial continua permitida para estudo durante a
  construção, enquanto o catálogo aceita somente cursos completos;
- instruções e conhecimento do Chatbot orientam criação em lotes pequenos,
  revisão conceitual pelas microteorias e uso rastreável de fontes atuais,
  oficiais e primárias.

### Removido

- histórico restaurável de workspaces, snapshots integrais, cadeias de
  revisões publicadas e operações externas genéricas de inserir ou substituir
  entidades completas;
- fluxos administrativos duplicados e resíduos dos contratos de autoria
  substituídos.

## [0.0.13] - 2026-07-29

### Adicionado

- seleção explícita do card inteiro ou de recursos identificados, prévia
  renderizada e criação de um card antes, depois, no fim ou em uma nova
  microssequência;
- recursos `system_map` e `reaction`, integrados ao contrato, à autoria, à
  validação, à persistência, ao runtime de estudo e à galeria responsiva;
- workspaces MCP versionados com mutações atômicas, leitura de cursos
  existentes, publicação privada parcial e revisão de microteorias no chat.

### Corrigido

- o painel superior de autoria e seus comandos de criação, organização e
  assistência por linguagem voltam a ficar disponíveis nos cursos selecionados;
- a mensagem de conta limitada a estudo foi removida sem introduzir alça de
  movimentação dentro dos cards de estudo;
- reparos e criações de card passam a ocupar uma área de autoria local
  protegida contra substituição silenciosa por uma nova revisão do catálogo;
- a aba `Trilhas` identifica alterações locais em cursos do catálogo e privados,
  diferencia a existência de revisão oficial nova e oferece descarte explícito
  com confirmação, compare-and-swap e recarga da projeção; cancelamento,
  indisponibilidade, fila pendente ou corrida preservam o trabalho;
- a validação semântica de reparos localizados tolera achados antigos
  inalterados, mas recusa ocorrências novas ou agravadas, inclusive nos campos
  visíveis de `reaction`;
- guides preservam integralmente `exclude` e `avoid`; barreiras que não cabem
  no contexto seguro interrompem o pedido antes da chamada externa;
- ingestão de PDF, DOCX e texto passa a limitar bytes, páginas, entradas,
  expansão, tempo e conteúdo extraído antes de entregar contexto ao provider;
- o bridge local exige token forte e origem exata, limita entrada e saída,
  valida a projeção estrita no processo e o schema canônico no cliente, oculta
  todo diagnóstico que possa repetir o conteúdo do card e remove os temporários
  em todas as terminações;
- os schemas enviados aos providers deixam de conter ramos vazios em recursos
  complexos e toda resposta estruturada volta a ser validada pelo contrato
  canônico antes da prévia;
- `afterBlocks` passa a aceitar de um a cinco blocos com IDs únicos, preservando
  alvos de reparo inequívocos e o orçamento móvel do schema;
- pedidos de prática com lacuna informam ao provider os campos interativos
  autorizados e proíbem repetir a resposta em texto ou geometria já visível;
- a dependência transitiva `brace-expansion` avança para `5.0.8`, eliminando a
  vulnerabilidade de esgotamento de memória apontada pela auditoria npm.

### Alterado

- a assistência por API repara o card ou os recursos selecionados e cria um
  card por pedido, com contexto limitado, schema exato, prévia mínima e
  fingerprint do escopo;
- o smoke real e o harness determinístico passam a exercitar as três fases de
  assistência atômica de revisão;
- a consulta unitária do registro de resources deixa de clonar as dezoito
  definições a cada card, reduzindo o custo de validação e projeção de cursos
  extensos sem alterar o contrato público;
- o GPT de autoria apresenta por padrão somente as microteorias e a quantidade
  de práticas, mantendo o documento integral disponível sob consulta;
- a autoria estrutural externa usa exclusivamente OAuth 2.1 e MCP, com
  permissões efetivas resolvidas no banco.

### Removido

- geração e reparo integral de microssequência, sessões de intervenção,
  seletor de representação preferida, feedback iterativo e fluxo granular
  anterior;
- contratos, prompts, runtimes, benchmarks e testes exclusivos desse motor;
- Edge REST de autoria, chaves pessoais `arl_...`, emissão e rotação de
  credenciais, painel de chaves e caminhos de implantação correspondentes.

## [0.0.12] - 2026-07-28

### Corrigido

- a origem de cada curso na biblioteca passou a ser obrigatória e sincronizada
  para a réplica local; a interface não classifica mais cursos pela ausência de
  `owner_id`;
- o curso de teste Laboratório AraLearn foi retirado das coleções, seleções e
  da biblioteca.

### Removido

- fallback de interface que tratava qualquer curso sem proprietário recebido
  como publicação de catálogo.

## [0.0.11] - 2026-07-28

### Adicionado

- plano de controle de autoria com artefatos JSON imutáveis no Supabase Storage,
  hashing canônico, referências pequenas, leases e feed de revisões;
- upload retomável TUS para artefatos maiores e verificação de hash, tamanho e
  UTF-8 em toda releitura;
- testes de concorrência que comprovam uma única gravação para três pedidos
  simultâneos com o mesmo `requestId`.

### Corrigido

- materiais de Instruções e Conhecimento do Chatbot passam a abrir o seletor nativo de arquivo no APK Android;
- a API e o MCP de autoria aceitam a origem segura do WebView Android, permitindo listar e criar chaves pessoais no aplicativo.
- a Action de autoria repete gravações transitórias de forma idempotente, informa quando tentar novamente e preserva a retomada do registro de fontes;

### Alterado

- planos, ledgers, especificações, submissões, auditorias e revisões completas
  deixam de ocupar JSONB no PostgreSQL;
- publicação privada e oficial passa a trocar um ponteiro de revisão imutável,
  sem reconstruir ou materializar cards no banco;
- o MCP aceita mensagens maiores sem herdar o orçamento reduzido das Actions;
- o limite artificial de 30 mil linhas relacionais é retirado da validação de
  cursos, pois o novo fluxo não converte revisões para linhas remotas;
- o planejamento de cursos passa a revisar automaticamente a cobertura da ementa, os pré-requisitos e a diversidade de prática antes de gravar o plano;
- os materiais de autoria incluem a revisão de cobertura e a retomada automática do registro de fontes para ChatGPT e demais assistentes compatíveis.

### Removido

- árvore pedagógica remota, staging relacional, cópias pessoais e correções
  pontuais por linha;
- rotas, ferramentas MCP, OpenAPI, testes e documentação do fluxo relacional
  anterior;
- limites locais de tamanho do ArtifactStore, das mensagens MCP e dos corpos
  REST fora do orçamento inevitável das Actions e da plataforma hospedada.

## [0.0.10] - 2026-07-24

### Adicionado

- API de autoria do catálogo com planejamento, produção, auditoria, reparo, bloqueio por dúvida, validação e publicação retomável em partes;
- papéis editoriais por UUID, clientes com chave restrita, rotação, limite de requisições, auditoria e retenção do material transitório;
- importação iconográfica de curso privado na aba Trilhas e de curso público autorizado na aba Coleções;
- pacotes públicos de autoria para ChatGPT, Gemini, Microsoft 365, Claude e integrações genéricas, com esquemas, exemplos e OpenAPI;
- gateway MCP remoto de autoria, com transporte Streamable HTTP, ferramentas isoladas por escopo e o mesmo núcleo idempotente da API REST;
- comprovante assinado da releitura de cada entrega antes da auditoria, vinculado ao autor, ao cliente e ao hash persistido;
- autoria privada por integrações pessoais, com emissão, renovação e revogação de chaves restritas pela própria conta;
- oferta autorizada de um curso pessoal ao catálogo, sem permitir que a conta autora publique diretamente;
- intervenção assistida com seleção granular de cards e blocos, proteção do escopo escolhido e cópia pessoal antes da primeira alteração de um curso oficial;
- recurso declarativo para fórmulas matemáticas e químicas, prática digitada em lacunas, fluxogramas ramificados e acessibilidade dos recursos estruturados;
- conteúdo multilíngue com idioma BCP 47, direção de escrita e preservação relacional dos metadados;
- diagnóstico automatizado da implantação, verificação do site publicado e ensaios reais de confirmação e recuperação de conta no Supabase local.
- linguagem formal de autoria para lacunas, com marcadores `{gap:id}`, respostas por escolha ou digitação e compilação determinística para o contrato público;
- lacunas interativas em parágrafo, código, tabela, fluxograma, árvore, grafo, mapa de relações, matriz, plano, fórmula e composição de blocos;
- contrato consultável de recursos, com forma dos dados, usos pedagógicos, limitações, exemplos válidos e campos interativos de cada representação;
- mapa pedagógico de conceitos, operações e equívocos previsíveis, usado para continuidade entre partes e retomada do conhecimento anterior;
- ferramentas editoriais para consultar e organizar o catálogo, suas coleções e a árvore de cada curso sem acesso direto às tabelas;
- ferramentas pessoais para consultar cursos selecionados e organizar trilhas privadas com o mesmo isolamento aplicado no aplicativo;
- correção de conteúdo restrita a uma microssequência, com validação do curso remontado, gravação somente do recorte e cópia pessoal automática quando a edição parte de uma publicação oficial;
- coleção reservada `Outros`, que mantém todos os cursos oficiais classificados enquanto permite reorganizar e aposentar as demais coleções.

### Alterado

- a biblioteca passa a reunir a configuração do chatbot do ChatGPT em um percurso curto de materiais, configuração e chave pessoal;
- Trilhas adota o mesmo padrão visual de Coleções e identifica a origem pelos cartões verdes de cursos oficiais e vermelhos de cursos pessoais, sem chips;
- cursos oferecidos e aceitos deixam a área privada e passam a ocupar a própria árvore oficial do catálogo, sem duplicação;
- a aba Trilhas identifica visualmente cursos do Catálogo e cursos Privados, inclusive cópias pessoais alteradas;
- o gateway MCP permite oferecer cursos próprios, acompanhar ofertas e executar a revisão editorial com permissões separadas;
- a publicação assistida usa as mesmas regras do contrato v3, da normalização relacional e do importador idempotente do catálogo;
- o papel de publicador permanece separado da administração de dados pessoais;
- quotas conservadoras e manutenção incremental limitam o espaço ocupado pelos rascunhos sem apagar publicações ou perder idempotência;
- o planejamento autoral passa a declarar pré-requisitos, idioma, escopo, resultados observáveis, operações e âncoras de contexto, com exemplo resolvido e prática suficiente antes da publicação;
- a implantação passa a distinguir os ambientes comprovados dos caminhos que ainda exigem adaptação, sem apresentar SharePoint, outro serviço de dados ou Supabase auto-hospedado como compatibilidade pronta;
- processos hospedados usam as chaves `sb_publishable_` e `sb_secret_` atuais do Supabase, enquanto as JWTs legadas ficam restritas ao stack local descartável;
- a primeira implantação da autoria gera dois segredos próprios e independentes para integrações pessoais e comprovantes de auditoria, sem gravá-los no computador.
- o agente de autoria passa a enviar somente campos formais; frases em linguagem natural orientam o conteúdo, mas não são convertidas em estrutura visual ou HTML;
- a seleção de recursos passa a considerar a operação de aprendizagem e a representação necessária, evitando usar parágrafo ou escolha quando tabela, código, hierarquia, fluxo, relação, espaço ou notação fazem parte do raciocínio;
- respostas digitadas admitem somente variantes literais declaradas e normalização objetiva, sem expressões regulares ou equivalência semântica inferida;
- a especificação de uma parte recebe o contorno imutável do plano já persistido e envia somente decisões autorais, reduzindo repetições e rejeições evitáveis;
- operações de consulta pelo MCP deixam de exigir identificadores de idempotência, mantidos apenas nas mutações;
- relações de pré-requisito passam a ser avaliadas de forma transitiva, com rejeição de ciclos e transporte apenas do recorte causal necessário à parte seguinte;
- cards retirados por uma correção conservam somente a identidade necessária para progresso e comentários; blocos e demais filhos continuam sendo removidos fisicamente.

### Corrigido

- a exclusão de curso privado não deixa execuções publicadas em uma forma inválida;
- a retirada de cursos de Trilhas não falha ao atualizar o histórico de autoria;
- a especificação distribuída para Actions expõe todos os campos exigidos pela API e elimina parâmetros duplicados;
- falhas de implantação interrompem o processo na primeira etapa inválida e o site não é publicado contra uma revisão incompatível do banco;
- validações de continuidade preservam afirmações compartilhadas entre cards e rejeitam referências históricas divergentes;
- o smoke hospedado aceita a secret key moderna sem enviá-la como token Bearer.
- a validação editorial do catálogo passa a respeitar o modelo enxuto, sem consultar tombstones removidos das tabelas de conteúdo, e a contagem da árvore deixa de depender de SQL dinâmico ambíguo.
- a validação editorial passa a usar o hash canônico já persistido no curso, em vez de chamar o cálculo removido pelo corte enxuto.
- o roteiro de implantação aceita de forma segura as listas de origens copiadas do PowerShell, sem transformar a lista inteira em uma URL inválida.
- a fronteira MCP valida recursivamente os dados recebidos e informa o caminho e a causa de cada rejeição;
- a intenção de publicação, o registro de fontes e a auditoria das dez dimensões passam a ter formas completas e inequívocas no contrato exposto ao agente;
- respostas de autoria informam a próxima ação útil e conservam as etapas obrigatórias de releitura, auditoria, validação e confirmação de publicação;
- variantes de resposta em fluxogramas passam a aceitar apenas valores literais, sem o antigo campo de expressão regular no contrato, no runtime ou nas linhas relacionais.

## [0.0.9] - 2026-07-20

### Adicionado

- schema relacional PostgreSQL/Supabase para a árvore didática, progresso, comentários, dispositivos, mutações idempotentes e feed incremental de alterações;
- autenticação por e-mail e senha com cadastro, confirmação, recuperação, sessão persistida, renovação e saída no runtime JavaScript compartilhado pela web e pelo APK;
- porta de autenticação compacta e iconográfica, saída sem tela transitória e exclusão autenticada da própria conta com limpeza dos dados pessoais remotos e da réplica local;
- réplica relacional `aralearn-relational-v2` no IndexedDB, com outbox, cursor de sincronização e tombstones;
- conversores completos entre o contrato público v3 e linhas relacionais, com round-trip sem perda, validação e hash canônico;
- RPCs transacionais e autorizadas para catálogo compartilhado, seleção, cópia sob demanda, sincronização e substituição de cards de uma microssequência;
- documentação de desenvolvimento local, implantação Supabase, segurança, sincronização e corte de legado;
- coleções oficiais pesquisáveis e trilhas pessoais muitos-para-muitos, com ordenação offline, RLS e sincronização incremental.

### Alterado

- PostgreSQL/Supabase passa a ser a fonte canônica compartilhada; o IndexedDB funciona como réplica offline e nunca como documento único do projeto;
- o catálogo passa a ser exclusivamente remoto e lista somente metadados de cursos oficiais publicados;
- cada publicação oficial mantém uma única árvore compartilhada; adicionar um curso grava somente `user_course_selections` e baixa a réplica offline para o dispositivo;
- a primeira alteração autoral executa cópia sob demanda, com UUIDs novos, sem montar a árvore pessoal por requisições independentes do cliente;
- mudanças então denominadas `bottom-up` naquele fluxo histórico, progresso e
  comentários passam a atualizar somente as linhas afetadas;
- a sincronização passa a separar falhas retentáveis, autenticação necessária e rejeições definitivas, com bootstrap atômico por high-water, pull progressivo e proteção do trabalho local durante rebootstrap ou revogação;
- a réplica IndexedDB passa a ser isolada fisicamente por UUID de usuário, e toda gravação local expõe estado de durabilidade e pode ser aguardada por `flush()` no navegador e no Android;
- privilégios diretos das tabelas técnicas foram removidos, a retenção usa watermark de dispositivos ativos e a CSP limita conexões à origem Supabase configurada;
- o contrato JSON `aralearn.contract` versão 3 permanece como formato público de importação e exportação, contexto de geração, validação e visão de domínio em memória.
- UUIDs de entidades oficiais passam a ser derivados de `identityKey`, preservando progresso e comentários em republicações editoriais;
- árvores baixadas passam por validação relacional e contratual antes da troca atômica do cache;
- arquivar uma publicação retira seleções e estado pessoal de modo transacional, emite tombstones e impede exclusão física acidental do catálogo canônico;
- a interface da biblioteca passa a organizar o catálogo por coleções e os cursos selecionados por trilhas pessoais, preservando o runtime de estudo, edição e assistência completo na web e no Android.

### Corrigido

- erros transitórios de infraestrutura PostgreSQL durante o push agora revertem integralmente a operação e preservam a outbox para retry, em vez de registrar uma rejeição definitiva;
- fixtures SQL de cópia sob demanda passaram a verificar a árvore pessoal pelo escopo correto, sem ambiguidade com a publicação canônica.

### Removido

- catálogo operacional embarcado nos artefatos web e Android;
- persistência documental de projeto, progresso e comentários;
- leitura automática e migração do banco IndexedDB legado;
- funcionamento anônimo e caminhos de compatibilidade com o catálogo local anterior;
- compilador e loaders do catálogo embarcado, incluindo `scripts/compileEmbeddedCourseFromParts.mjs`.
- clonagem automática durante a seleção, refresh de cópia pessoal, `source_entity_id` por linha e caminhos de reconciliação da arquitetura anterior.

## [0.0.8] - 2026-07-18

### Alterado

- persistência local consolidada no IndexedDB para cursos do usuário, progresso e comentários;
- catálogo oficial carregado de forma assíncrona a partir de um manifesto único, com três cursos embarcados;
- contrato JSON validado estritamente na importação, na persistência e no empacotamento;
- geração `top-down` e `bottom-up`, nomes históricos daquela versão, unificada
  em uma configuração explícita de provider e perfil didático;
- runtime web e Android empacotado somente com módulos alcançáveis e cursos inscritos no manifesto;
- suíte ampliada com testes de progressão por toque, persistência real e artefatos publicados.

## [0.0.7] - 2026-07-10

### Adicionado

- curso embarcado `Dataprev: Analista de Processamento`, com os módulos `Segurança da Informação`, `Gestão de Servidores` e `Redes de Computadores`;
- trilha Dataprev composta por `24` lições, `175` microssequências e `1.052` cards validados;
- cursos `Microsoft Azure AI Fundamentals (AI-900)` e `Fundamentos de IA e Análise de Dados` no mesmo catálogo oficial.

### Alterado

- o curso embarcado passa a se chamar `Dataprev: Analista de Processamento` e tem objetivo alinhado à preparação completa para o cargo;
- o módulo inicial `Segurança da Informação` permanece estruturado nos dez tópicos do edital: políticas, procedimentos e gerenciamento, redes, vulnerabilidades e ataques, criptografia, softwares maliciosos, certificação digital, LGPD, IDS/IPS/SIEM e NIST Cybersecurity Framework 1.1;
- APK pública da versão `0.0.7` contém o catálogo oficial completo.

## [0.0.6] - 2026-07-08

### Alterado

- expansão do curso embarcado `Microsoft Azure AI Fundamentals (AI-900)` das Partes 01 a 04 para as Partes 01 a 12, agora com `9` módulos, `12` lições, `72` microssequências e `858` cards ativos;
- integração das Partes 05 a 12 feita sobre o seed já validado das Partes 01 a 04, sem reintroduzir tabelas vazias e outros defeitos estruturais dos arquivos de origem;
- correção estrutural do runtime e do contrato para não aceitar mais `table` com linhas vazias ou desalinhadas e para renderizar `tree` como hierarquia real em vez de lista plana;
- suíte pública atualizada com regressões específicas para o AI-900 expandido e para os cenários de tabela inválida e árvore hierárquica;
- APK pública de release atualizada com a versão completa do curso AI-900 até a Parte 12.

## [0.0.5] - 2026-07-03

### Alterado

- inclusão do curso embarcado `Microsoft Azure AI Fundamentals (AI-900)`, já compilado a partir das Partes 01 a 04, com `2` módulos, `4` lições, `24` microssequências e `269` cards ativos;
- revisão e normalização dos arquivos do curso AI-900 antes da incorporação ao seed oficial, com ajuste de `role`, `tree`, `relation_map` e `plane` ao contrato vigente e revisão editorial de textos e metadados;
- adição do compilador reutilizável `scripts/compileEmbeddedCourseFromParts.mjs` para recompilar cursos embarcados a partir de partes em `json` ou `zip` nas próximas rodadas;
- manifesto oficial dos cursos embarcados atualizado para carregar o novo curso AI-900 diretamente no app;
- correção do título visível do curso `Lógica de Programação 1` no seed oficial embarcado;
- APK pública de release atualizada com o curso AI-900 já embarcado, o catálogo reorganizado e o título corrigido de `Lógica de Programação 1`.

## [0.0.4] - 2026-07-02

### Alterado

- migração coerente dos cursos embarcados oficiais para `JSON` em `src/data/embedded-courses`, sem wrappers `*SeedCourse.js`, sem lista hardcoded de factories em `src/ui` e com manifesto único em `embedded-seed-manifest.json`;
- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `8` módulos, `8` lições, `96` microssequências e `582` cards ativos, com as Aulas 5, 6, 7 e 8 integradas ao app;
- revisão e normalização dos arquivos das Aulas 7 e 8 antes da incorporação ao seed oficial: remoção de campos extras de raiz, revisão editorial e ajuste de `composite` de exercício ao formato do contrato vigente;
- saneamento final da trilha de seed e adoção do manifesto como fonte única do catálogo oficial;
- carregamento Android alinhado ao mesmo manifesto usado na web;
- contrato ajustado para impedir `after` e `afterBlocks` com sintaxe de lacuna interativa;
- APK pública de release atualizada com o catálogo embarcado declarativo e a expansão de `Fundamentos` até a Aula 8.

## [0.0.3] - 2026-06-23

### Alterado

- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `4` módulos, `4` lições, `43` microssequências e a nova Aula 4 sobre dados em planilhas Excel com Pandas;
- Aula 4 cobrindo estrutura tabular, leitura de Excel, inspeção de `shape`, `columns` e `dtypes`, conversão de datas, filtros, estatísticas, agrupamentos e checagens simples de qualidade;
- revisão editorial do seed de `Fundamentos` para manter o texto natural e preciso também na nova aula, além de corrigir a passagem entre leitura de CSV e leitura de Excel;
- APK pública de release atualizada com a quarta aula integrada ao curso.

## [0.0.2] - 2026-06-18

### Alterado

- atualização do curso embarcado `Fundamentos de IA e Análise de Dados`, agora com `3` módulos, `3` lições, `32` microssequências e a nova Aula 3 sobre NumPy e Pandas;
- Aula 3 cobrindo leitura de CSV, métricas em colunas, filtros, classificação com `np.where()` e agrupamento por setor;
- revisão dos enunciados para manter a trilha focada no conteúdo e com linguagem natural;
- cards da Aula 3 agora repetem no próprio card os quadros e resumos necessários aos exercícios;
- APK pública de release atualizada com a versão corrigida do curso.

## [0.0.1] - 2026-06-17

### Adicionado

- aplicação web servida localmente, com projeto persistido no navegador;
- empacotamento Android por WebView, com build pública de depuração e release;
- contrato público `aralearn.contract`, versão `3`, para projeto, curso, módulo, lição, microssequência e card;
- edição de cursos, módulos, lições, microssequências e cards no app;
- importação e exportação em JSON;
- assistência top-down por API para transformar escopo em trilha;
- assistência então denominada `bottom-up` naquele fluxo histórico por API
  para gerar, corrigir, reforçar e continuar etapas locais;
- validações estruturais e didáticas antes de aceitar material gerado;
- renderização de cards como `paragraph`, `choice`, `composite`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix` e `plane`;
- cursos embarcados editáveis para estudo e revisão no próprio app;
- suíte automatizada com testes, validação de exemplo público, smoke tests, harnesses e benchmarks.
