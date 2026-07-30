# Assistência de linguagem

O AraLearn pode usar um serviço de linguagem configurado pela pessoa autora
para reparar recursos, reparar um card inteiro ou criar exatamente um card por
pedido. A resposta recebida é tratada como proposta: ela só pode alterar o
curso depois de passar pela validação do formato, das regras didáticas e da
edição humana.

## Autoria estrutural pelo GPT com MCP

Planejar cursos, organizar módulos, lições e microssequências, complementar
árvores existentes e recombinar partes entre cursos são responsabilidades do
GPT externo conectado ao gateway MCP. O botão de autoria das barras superiores
abre diretamente esse ambiente no painel **Chatbot** da biblioteca. Não existe
um gerador estrutural local nem fallback por API para essas operações.

## Assistência atômica de revisão

O manifesto distingue duas capacidades que coexistem:

- `atomic-card-assistance` é este fluxo local por API para reparar resources ou
  o card inteiro e criar exatamente um card;
- `atomic-resource-authoring` é a autoria remota pelo GPT com MCP, que consulta
  contratos de resources e aplica mutações focadas em workspaces versionados.

Elas não são aliases nem fallback uma da outra.

Durante o estudo, a pessoa pode abrir a aba de autoria de uma microssequência e
pedir a criação de um card ou a correção do card atual. O painel continua
disponível em qualquer curso selecionado, inclusive quando a origem é o
catálogo. A solicitação alcança apenas o contexto necessário: objetivo da
etapa, dependências, tópicos, card atual, vizinhos limitados, anexos
autorizados e critérios de verificação.

Esse recorte evita enviar o curso inteiro e mantém a intervenção ligada ao problema encontrado no estudo.

A assistência local usa saída estruturada por schema e duas operações
explícitas: `repair` e `create`. Em reparo, o alvo pode ser o card inteiro ou
qualquer combinação dos recursos identificados do card, incluindo corpo de
`composite` e `afterBlocks`. Em criação, a pessoa escolhe inserir antes,
depois, no fim da microssequência ou numa nova microssequência posterior.
Cards e recursos vizinhos entram como contexto somente leitura.

Os alvos selecionáveis de recurso são fechados:

- `main` para os campos do recurso principal;
- `response` para a prática contextual por escolha de um recurso não
  `choice`;
- `after:text` para o texto posterior canônico;
- `body:<id>` para um bloco do corpo de `composite`;
- `after:<id>` para um bloco de apoio.

Para reparar recursos, a resposta contém substituições identificadas, não a
lição ou o projeto inteiro. Para reparar o card inteiro ou criar um card, uma
fase curta escolhe a representação e a fase seguinte recebe somente o schema
exato dessa representação. IDs e posições são determinados localmente. Uma
guarda compara IDs, ordem, conteúdo não selecionado e fingerprint antes da
gravação.

No destino `new_microsequence`, a persistência aceita exatamente uma
microssequência nova na lição selecionada. O change set pode conter somente a
nova subárvore e alterações no campo `position` das microssequências irmãs
existentes, cuja ordem relativa precisa permanecer idêntica. Qualquer outra
entidade ou campo alterado faz a aplicação falhar fechada.

## Conferir antes de gravar

O AraLearn informa as formas de card aceitas, os tipos de exercício e os campos esperados. Depois recebe a proposta, recompõe o resultado no formato público do curso e verifica, entre outros pontos:

- se os campos obrigatórios estão presentes;
- se o conteúdo respeita os limites da microssequência;
- se identidade, dependências e posições são válidas;
- se `answerIds` aponta para opções existentes e corresponde ao modo de seleção;
- se um recurso visual traz os dados de que precisa;
- se fontes declaradas pertencem aos anexos ou cards autorizados;
- se o card contém termos expressamente excluídos ou desaconselhados pelos
  guides do módulo e da lição;
- se há referência explícita a card, tabela ou anexo ausente;
- se uma resposta de lacuna reaparece em conteúdo visível ou geometria
  derivada.

Essas verificações cobrem invariantes programáveis; elas não comprovam verdade
factual, suficiência pedagógica nem detectam toda forma possível de dependência
externa ou pista de resposta. A pessoa autora ainda precisa revisar a prévia.

Num reparo de recursos, achados semânticos preexistentes fora do alvo não
impedem uma correção pontual. O AraLearn compara os achados antes e depois e
recusa qualquer ocorrência nova ou agravada. No reparo do card inteiro e na
criação, o resultado precisa passar integralmente pela validação semântica.

Uma proposta aprovada altera somente o alvo em edição e marca o curso como uma
área de autoria local alterada. Isso vale tanto para curso privado quanto para
curso do catálogo selecionado em `Trilhas`. O conteúdo é gravado primeiro no
IndexedDB, não entra na outbox pessoal e não cria clone remoto. O marcador
impede que uma revisão baixada substitua silenciosamente o trabalho.

O rascunho permanece restaurável por decisão explícita mesmo quando não há
publicação nova. Para restaurar, o aplicativo baixa novamente a revisão
imutável indicada pela seleção atual, confere contrato e hash e só então troca
o grafo. Duas condições de compare-and-swap — a revisão do rascunho e a
seleção oficial vigente — são verificadas simultaneamente na mesma transação
IndexedDB; nenhuma falha remove apenas o marcador.

O aplicativo confere novamente o recorte antes de gravar. Se o card ou seu
contexto mudou enquanto o pedido estava em andamento, a resposta antiga não é
reaproveitada. Também são recusadas respostas que tentem alterar outro curso,
módulo, lição ou microssequência. A gravação local só termina depois que o
fragmento validado foi confirmado no IndexedDB.

Pedido, resposta do provider e prévia não são anexados ao curso. A prévia
renderizada conserva apenas o change set validado enquanto a tela está aberta.
Ao aplicar, o fingerprint do snapshot funciona como compare-and-swap do escopo
local: se qualquer dado protegido mudou, a proposta falha fechada. A prévia
também leva a revisão esperada do `localDraft`. O IndexedDB confere essa revisão
dentro da mesma transação que grava as linhas do curso e gira o marcador; uma
segunda aba com estado obsoleto é recusada sem substituir a primeira gravação.
Na criação de uma microssequência, a persistência exige exatamente um card e
confere sua igualdade com o card autorizado pela prévia. No MCP, a autoria
remota usa outro CAS, por `expectedRevision`, e cada confirmação cria um
snapshot imutável. Uma revisão incompleta pode ser publicada como prévia
privada; o catálogo exige curso completo.

Os `guide.exclude` e `guide.avoid` entram completos no contexto e nunca são
truncados. Se as próprias barreiras excederem o orçamento seguro, o pedido é
recusado antes de chamar o provider. Os demais campos extensos recebem
envelopes explicitamente marcados como truncados.

## Fontes externas

Materiais de referência podem ser escolhidos pela pessoa autora. Em processos de preparação de cursos, sistemas externos de recuperação de informação, como RAG, também podem ajudar a localizar fontes e organizar contexto.

O AraLearn não trata uma fonte recuperada nem uma resposta de modelo como verdade automática. A revisão do conteúdo continua sendo humana, e a publicação de cursos oficiais passa por validação da árvore completa.

A ingestão aceita texto, CSV, JSON, Markdown, HTML, XML, YAML, PDF e DOCX, no
máximo oito arquivos e 24 MiB declarados no total. Os
tetos por arquivo são 12 MiB e 80 páginas para PDF, 8 MiB para DOCX e 2 MiB
para texto; neste último caso, somente o prefixo necessário é lido. DOCX é
inspecionado antes da extração para rejeitar caminhos inseguros, criptografia,
ZIP64, entradas excessivas e taxas de compressão incompatíveis com uso seguro.
Há limites independentes de texto extraído, prazo e contexto efetivamente
enviado. Avisos e falhas de extração aparecem no painel. Todo anexo selecionado
precisa fornecer algum texto utilizável; formato incompatível, arquivo vazio ou
falha de extração interrompem o pedido antes do provider, mesmo quando também
há instrução escrita. Extrações parciais com conteúdo aproveitável continuam
permitidas e aparecem claramente como truncadas.

## Dados e disponibilidade

Ao pedir assistência, o contexto da etapa é enviado ao serviço escolhido. Custos, limites, retenção de dados e disponibilidade dependem desse serviço.

O seletor inclui configurações prontas para DeepSeek, Gemini e o bridge local. A opção **Outro modelo** aceita três protocolos:

- **Compatível com OpenAI:** requer o identificador do modelo, a chave e a URL
  HTTPS completa de Chat Completions com suporte a
  `response_format: {"type":"json_object"}`; o endpoint oficial
  `https://api.openai.com/v1/responses` usa Structured Outputs estrito;
- **Gemini:** requer o identificador do modelo e a chave; a chamada usa a API oficial do Gemini;
- **Bridge local:** requer o identificador do modelo e o endereço do bridge. HTTP só é aceito em `localhost`, `127.0.0.1` ou no endereço local IPv6; qualquer endereço externo precisa de HTTPS.

O AraLearn verifica modelo, protocolo e endereço antes de enviar o pedido. Uma configuração inválida interrompe a operação, sem escolher outro serviço ou modelo. A chave permanece apenas na memória da página, não é gravada no IndexedDB, no armazenamento do navegador nem em endereços. Ao recarregar ou fechar o aplicativo, é preciso informá-la novamente. Mensagens de erro não reproduzem a credencial.

A política de conteúdo da instalação também precisa autorizar explicitamente a origem usada pelo serviço. DeepSeek e Gemini já entram na lista padrão. O aplicativo Android admite o bridge do próprio dispositivo em `http://127.0.0.1:4183`; no servidor local, também é aceito `http://localhost:4183`. Para **Outro modelo**, informe somente a origem HTTPS necessária em `ARALEARN_ASSIST_ALLOWED_ORIGINS` durante o build. O AraLearn recusa endereços que não estejam nessa lista e não libera conexões para qualquer domínio HTTPS.

O estudo não depende de assistência de linguagem. Depois que o curso é baixado, leitura, prática, progresso e comentários continuam disponíveis sem conexão.

A autoria extensa usa exclusivamente o gateway MCP. Ele lê cursos existentes e
edita um workspace por operações atômicas, revisão esperada e snapshots JSON
imutáveis. A conexão autentica a conta por OAuth, sem chave estática ou rota
REST estrutural alternativa. A autoria privada alcança somente a conta
autenticada, e publicar numa coleção oficial exige permissão editorial
separada. A ferramenta nunca recebe acesso direto ao banco. Esse fluxo está
descrito em [Gateway MCP de autoria](autoria-mcp.md).

O formato de intercâmbio está em [Contrato público](aralearn-contract.md). As
etapas da assistência local e a fronteira com o MCP estão em [Fluxos e
contratos de geração](fluxos-prompts-e-contratos.md).
