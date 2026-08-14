# Assistência de linguagem

O AraLearn oferece duas formas complementares de autoria:

- GPT personalizado com Action ou clientes compatíveis pela integração MCP,
  para planejar e transformar cursos e suas partes;
- assistência por API no próprio conteúdo, para intervenções delimitadas em
  cards, microssequências e lições.

A assistência por API é bottom-up: parte do trecho que a pessoa está vendo e
da seleção feita nessa tela. Ela não substitui a autoria estrutural ampla do
GPT personalizado.

## Autoria estrutural pelo GPT personalizado

Planejar cursos, organizar módulos, lições e microssequências, complementar
árvores existentes e recombinar partes entre cursos são responsabilidades do
GPT personalizado. O painel da interface chamado **Chatbot** fornece os
materiais e endereços necessários para configurar sua Action; a área
**Plugin** descreve separadamente a integração MCP para clientes compatíveis.
As duas superfícies chegam ao mesmo executor de autoria; não são dois motores
de conteúdo.

Ambas resolvem as capacidades da conta conectada no servidor. A passagem de um
curso privado para o catálogo ocorre somente por esse fluxo de autoria
estrutural, nunca por um botão da assistência bottom-up.

## Autoria integrada ao conteúdo

Visualização, edição manual e assistência por API usam a mesma árvore e o
mesmo card renderizado. Ao ativar a edição, o conteúdo selecionável recebe
apenas uma indicação visual de foco; as instâncias de packages não mudam de
tamanho nem são copiadas para outro painel.

O esqueleto, a largura, a altura, a tipografia e os espaçamentos do alvo são
os mesmos nos três modos. Na edição, o texto digitável ocupa a caixa original
e rola dentro dela se ultrapassar o espaço disponível. Salvar e cancelar ficam
no rodapé da tela, nunca dentro do card ou da instância selecionada.

O modo Editar conserva o renderer do package: muda apenas a
editabilidade do texto que possui caminho inequívoco no contrato. Identidades,
relações, respostas, topologia e demais elementos estruturais continuam
somente leitura. Em packages estruturados, um texto só se torna editável
quando pode ser associado deterministicamente ao campo de origem.

Em escolhas, podem ser alterados o texto, o código e o feedback de cada opção,
mas não a opção correta, o modo de seleção nem a identidade ou a ordem. Uma
lacuna liga-se por caminho formal a um campo textual do package de conteúdo;
a edição não muda por acidente sua resposta, seus distratores ou seu modo.
Packages no slot `feedback` usam a mesma superfície textual. Campos longos
respeitam a caixa da representação em tela estreita e a composição do teclado
móvel antes de serem salvos.

Na edição manual, o texto autorizado torna-se editável na própria instância.
Na assistência por API, um toque ou clique seleciona um alvo e outro toque o
retira da seleção. O botão de brilhos abre a conversa na própria superfície;
configuração do serviço e envio aparecem somente nesse momento. Fechar a caixa
não perde a seleção corrente. A caixa flutua acima do rodapé e não reduz nem
desloca o card, suas representações ou a lista estrutural.

Em lições e microssequências, o próprio componente de card renderizado é a
superfície de seleção:
toques sucessivos acumulam alvos, e a seleção permanece ao atualizar a tela.
O contorno é desenhado para dentro, sem cortar a borda nem alterar a largura.

A seleção concede a autoridade máxima daquela solicitação. O texto do pedido
pode escolher uma operação dentro desse limite, mas nunca ampliar o escopo.
Conteúdo não selecionado pode ajudar a interpretar o pedido, sempre como
contexto somente leitura.

No card, a operação pertence a uma lista fechada:

- `edit_text` altera somente caminhos textuais autorizados nas instâncias
  selecionadas ou no card inteiro. O modelo devolve pares de caminho e valor;
  o AraLearn reconstrói o card e rejeita qualquer mudança estrutural;
- `recompose_card` exige o card inteiro e pode trocar sua composição. O catálogo
  propõe alternativas com uma ou mais instâncias em `content`, uma resposta
  compatível quando o papel é prática e os feedbacks pertinentes. O modelo
  escolhe uma alternativa e preenche somente seus contratos exatos;
- `restore_version` restaura localmente uma versão exata da conversa, sem pedir
  ao modelo que tente reproduzi-la.

Selecionar somente instâncias autoriza apenas `edit_text`. Ao selecionar o
card inteiro, o pedido determina se basta alterar textos ou se é necessário
recompor sua representação. Identidade e posição do card permanecem fixas nas
três operações.

Na classificação das demais operações bottom-up, o provider recebe somente o
pedido, a autoridade calculada e a lista fechada de operações; conteúdo
pedagógico, guides e cards não participam dessa classificação. `unsupported` é
uma resposta válida quando o pedido não cabe na seleção, para que uma criação
fora de escopo nunca seja reinterpretada como atualização. Remover ou mover
exige que o pedido se refira explicitamente ao card ou à microssequência:
“remova a redundância do card” é edição de conteúdo, não exclusão do card.

### Conversa e versões do card

A assistência de card é uma conversa iterativa. Cada novo pedido recebe o
estado corrente do card, o contexto didático delimitado e até oito turnos da
conversa ativa. Isso permite pedir uma mudança, avaliar o resultado, refiná-lo,
desfazê-lo, refazê-lo ou retornar a uma versão anterior sem reexplicar tudo.

O histórico volátil conserva no máximo oito turnos e nove versões exatas do
card. Um envio que conclua que nada deve mudar ainda registra a explicação do
assistente como `no-op`, sem fabricar uma versão ou indicar que houve aplicação.
Falhas de transporte ou validação não viram turnos. Uma edição feita depois de
desfazer abre um novo ramo ativo e elimina o refazer daquele ramo abandonado.

Pedidos, respostas e versões da conversa não são gravados no curso, no
IndexedDB nem no Supabase. Uma mudança do mesmo card fora da conversa invalida
o histórico, em vez de restaurar silenciosamente um estado sobre conteúdo mais
novo. Esse histórico curto é uma ferramenta de iteração local, não o
versionamento de proveniência do curso.

## Escopos autorizados

### Card

Ao selecionar um ou mais packages, somente esses alvos podem mudar. Os
identificadores de alvo são fechados:

- `content:<id>` para uma instância de representação;
- `response:<id>` para a instância de resposta;
- `feedback:<id>` para uma instância de explicação posterior.

Selecionar o card inteiro autoriza editar seus textos ou recompor seu conteúdo
pedagógico. Identidade, caminho e posição permanecem fixos. O nível de card não
cria outro card nem uma microssequência.

### Microssequência

Ao selecionar alguns cards, somente esses cards podem ser atualizados, removidos
ou reordenados. Os demais ajudam a preservar progressão e coerência, mas não
podem ser alterados. Uma atualização que precise gerar novamente vários cards alcança
no máximo oito por envio.

Selecionar todos os cards concede também autoridade sobre o recipiente da
microssequência e permite criar até oito cards dentro dela no mesmo envio. A
solicitação continua sem permissão para criar outra microssequência. Uma
microssequência vazia pode ser selecionada como recipiente para receber seu
primeiro card.

### Lição

Ao selecionar uma ou mais microssequências, a assistência pode atualizar seus
metadados, removê-las ou reordená-las dentro da lição. Quando exatamente uma é
selecionada, também pode criar até oito cards dentro dela. Para reparar cards
já existentes, é preciso entrar na microssequência e selecionar esses cards.

Selecionar todas as microssequências concede autoridade sobre o recipiente da
lição e permite criar uma nova microssequência. Cada envio cria no máximo uma.
Ela pode nascer com até oito cards. Uma lição vazia pode ser selecionada para
receber sua primeira microssequência.

Quando a lição contém uma única microssequência, selecioná-la representa ao
mesmo tempo uma unidade e o conjunto completo. O pedido define se a operação
cria cards nela ou uma nova microssequência irmã.

Não existe assistência por API nos níveis de módulo ou curso. Mudanças nessa
escala pertencem ao GPT personalizado.

## Contexto compacto e somente leitura

O contexto é montado a partir da autoridade selecionada. Ele inclui, conforme
necessário:

- caminho hierárquico, objetivos e guias;
- `topics`, `covers`, `checks`, `errors` e `dependsOn` relevantes;
- `guide.exclude` e `guide.avoid` completos;
- índices locais e a ordem dos elementos;
- vizinhos anteriores e posteriores em quantidade limitada;
- um índice compacto da lição.

O curso inteiro não é enviado por padrão. Essa composição ajuda modelos mais
leves a manter coerência sem confundir contexto informativo com conteúdo
gravável. Cada envelope contextual serializado tem o limite de 64 mil
caracteres. Índices e vizinhos são compactados em torno da seleção;
`guide.exclude` e `guide.avoid` permanecem integrais dentro desse orçamento. Se
as próprias barreiras obrigatórias excederem o limite seguro, o pedido é
recusado antes de chamar o serviço. Os demais campos extensos podem ser
truncados, com marcação explícita no contexto.

Em `edit_text`, cada valor selecionado aparece uma única vez em
`writableTargets`, associado ao caminho textual que pode ser alterado. A cópia
do card em `readOnlyContext` conserva as instâncias não selecionadas e marca o
alvo gravável como omitido; essa separação ocorre antes de qualquer
truncamento. A conversa ativa entra separadamente e nunca transforma contexto
anterior em autoridade de escrita.

Em `recompose_card`, o contexto residente orienta primeiro a busca no catálogo.
O modelo recebe uma lista curta de composições válidas, e somente depois da
escolha recebe finalidade, limitações, regras e exemplo dos contratos exatos.
Isso permite combinar packages sem despejar o catálogo inteiro no prompt. Ao
criar cards dentro da única microssequência selecionada no nível de lição, um
índice compacto somente leitura informa `index`, identidade, posição, título e
representação dos cards existentes, para que o modelo escolha uma fronteira de
inserção sem ganhar escrita sobre eles.

Não existe uma configuração separada de “Contexto didático”. O AraLearn monta
esse contexto automaticamente a partir do alvo, da hierarquia, dos guias e dos
vizinhos pertinentes. A pessoa escolhe apenas o provider, o modelo e a chave.

## Envio, validação e gravação

Cada envio executa um turno e uma única intenção. O AraLearn:

1. congela a seleção, o conteúdo e a revisão lidos;
2. monta o contexto delimitado;
3. em `recompose_card`, consulta o catálogo, seleciona uma composição e carrega
   somente os contratos necessários;
4. solicita uma saída estruturada ao serviço configurado;
5. converte a resposta para o contrato exato do escopo e a valida localmente quanto a
   schema, semântica, referências, compatibilidade e limites do escopo;
6. confirma toda a mudança em uma única transação com compare-and-swap;
7. mostra imediatamente o conteúdo e a explicação resultantes.

A validação e a gravação atômica são garantias internas, não etapas adicionais
impostas à pessoa. Uma resposta inválida ou uma revisão desatualizada não
produz alteração parcial.

Na conversa de card, **Desfazer**, **Refazer** e a restauração de uma versão
movem o cursor entre snapshots exatos do próprio card. `edit_text` registra um
patch compacto de caminhos; `recompose_card` registra a transição entre duas
composições completas. O limite curto impede que isso se transforme em cópias
do curso. A fila de sincronização não é apagada, e uma escrita concorrente
invalida a conversa quando seu estado de base já não é o atual.

O conteúdo é salvo primeiro neste dispositivo e a atualização remota é
tentada em seguida. Se ela precisar ser adiada, o AraLearn mantém os caminhos
pendentes, mostra que a alteração ainda não chegou ao curso remoto e tenta de
novo ao recuperar a conexão. Essa fila não guarda pedido, resposta nem contexto
da conversa.

Uma saída estruturada inválida pode receber uma única tentativa orientada de
correção. A chamada inicial admite no máximo uma repetição de transporte para
falha transitória; a reconstrução usa uma única chamada HTTP. Assim, uma fase
tem teto de três chamadas HTTP mesmo quando transporte e estrutura falham em
sequência. Cota esgotada, autenticação, timeout, resposta interrompida e outros
erros determinísticos não são repetidos. A persistência só acontece depois da
resposta final válida, portanto uma repetição do serviço não duplica a escrita.

O AraLearn verifica, entre outros pontos:

- o envelope de card com `role`, `content`, `response` e `feedback`;
- cada instância `{ id, package, version, data }` segundo o schema da versão
  exata e o slot que ela pode ocupar;
- identidades, posições, dependências e referências internas;
- `answerIds`, opções e regras de lacunas;
- `responseCompatibility` e os `practiceTargets` que autorizam a prática no
  campo representado;
- integridade estrutural e dados necessários às representações visuais;
- origem de referências declaradas;
- termos excluídos ou desaconselhados pelos guias;
- ausência de alterações fora da seleção;
- ausência de novas pistas indevidas para respostas.

Em `edit_text`, um problema semântico preexistente fora do alvo não impede uma
correção pontual, mas nenhum achado novo ou agravado é aceito. Em
`recompose_card` e nas criações autorizadas pela microssequência ou pela lição,
o resultado precisa passar integralmente pela validação aplicável. A auditoria
distingue a adequação do conteúdo à intenção, a capacidade da resposta de
exercitar o gesto cognitivo e a legibilidade do feedback. Em lacunas e
digitação, uma prática estruturalmente válida ainda é recusada quando sua
resposta não atua sobre um `practiceTarget` declarado pelo package. Essas
verificações não comprovam verdade factual nem suficiência pedagógica; a
responsabilidade autoral permanece humana.

## Permissões

As permissões derivam da sessão autenticada e falham fechadas quando o estado
é desconhecido ou vem apenas do cache.

| Conteúdo | Pessoa comum | Conta administrativa ou editorial |
| --- | --- | --- |
| Curso privado próprio | Edição manual e assistência por API | Edição manual e assistência por API |
| Curso oficial de Coleções | Somente estudo | Edição manual e assistência por API no curso oficial |
| Curso privado de outra pessoa | Sem edição | Sem edição neste recorte |

Uma edição de curso privado permanece no mesmo curso privado. Uma conta
autorizada que edita um curso oficial atualiza sua continuidade oficial. O
AraLearn não cria automaticamente uma cópia privada de curso do catálogo.
Promover um curso privado para Coleções continua sendo uma operação explícita
do GPT personalizado com Action ou de um cliente compatível pela integração
MCP.

## Dados e disponibilidade

Ao pedir assistência, o contexto delimitado é enviado ao serviço escolhido.
Custos, limites, retenção de dados e disponibilidade dependem desse serviço.

O seletor inclui DeepSeek V4 Flash, DeepSeek V4 Pro, Gemini 3.6 Flash,
Gemini 3.5 Flash-Lite e o serviço local de integração com Codex CLI. Esses são
os presets correntes do
AraLearn e acompanham os modelos documentados pelo
[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/) e pelo
[Gemini](https://ai.google.dev/gemini-api/docs/latest-model). Modelos já
encerrados não permanecem como opções.
Nenhum provider é escolhido silenciosamente: a pessoa faz uma seleção antes do
primeiro envio. Os presets DeepSeek V4 usam o adaptador compatível com a API do
DeepSeek; os presets Gemini 3.6 e 3.5 usam o adaptador oficial do Gemini. Ambos
entregam a resposta ao mesmo validador local. No Gemini, o pedido
estruturado usa `responseMimeType` e `responseJsonSchema` no `generateContent`;
não há troca silenciosa para resposta livre quando o schema é recusado.

A opção **Outro modelo** aceita três protocolos:

- **Compatível com OpenAI:** requer modelo, chave e URL HTTPS completa de Chat
  Completions com saída JSON estruturada; o endpoint oficial
  `https://api.openai.com/v1/responses` usa Structured Outputs estrito;
- **Gemini:** requer modelo e chave e usa a API oficial do Gemini;
- **Codex CLI local:** requer modelo e endereço do serviço local. HTTP só é aceito em
  `localhost`, `127.0.0.1` ou no endereço local IPv6; endereços externos
  precisam de HTTPS.

A chave fica apenas na memória da página e é limpa ao trocar de família de
provider, para que uma credencial do DeepSeek nunca seja enviada ao Gemini, ou
vice-versa.

### Escolha atual do DeepSeek

O preset recomendado para o bottom-up é `deepseek-v4-flash`, atualmente
associado pelo serviço ao DeepSeek-V4-Flash-0731. A documentação oficial lhe
atribui contexto de 1 milhão de tokens, JSON Output e desempenho próximo do
Pro em tarefas agentivas simples, com menor latência, maior concorrência e
custo substancialmente menor. O AraLearn mantém seu próprio recorte de 64 mil
caracteres: a janela maior do modelo não é justificativa para enviar o curso
inteiro.

`deepseek-v4-pro` continua disponível como escolha explícita para um reparo
atipicamente difícil. Ele nunca é acionado como fallback, porque isso tornaria
custo e comportamento imprevisíveis. `deepseek-chat`, `deepseek-reasoner` e
aliases locais antigos são recusados antes da chamada: os dois primeiros foram
[retirados da API](https://api-docs.deepseek.com/news/news260424/).

O caminho de produção usa Chat Completions, `thinking` desativado e
`response_format: {"type":"json_object"}`. O prompt contém a amostra JSON
sintática exigida pelo provider e o schema exato; em seguida, o AraLearn valida
esse schema e todas as regras de autoridade localmente. A
[Responses API](https://api-docs.deepseek.com/guides/responses_api) foi
comparada com esse caminho, mas não é fallback: no ensaio integral ela gastou
mais raciocínio, teve latência muito maior e interrompeu uma fase pelo teto de
saída, enquanto Chat Completions concluiu as dez operações. Essa escolha pode
ser reavaliada quando o comportamento documentado e os testes reais mudarem.

### Validação real econômica do DeepSeek

Desenvolvimento e manutenção dispõem de uma bateria real explícita, que nunca é
executada por `npm test` nem durante build ou publicação:

```powershell
$env:DEEPSEEK_API_KEY = "<chave temporária>"
npm run smoke:deepseek:bottom-up:real
```

Para reiterar somente o recorte que falhou, sem pagar novamente pelos demais,
defina também `DEEPSEEK_SMOKE_SCENARIO`. Os identificadores aceitos são:
`single_resource_readonly_boundary`, `multiple_resources_readonly_boundary`,
`whole_card_identity_boundary`, `multiple_cards_atomic_readonly_boundary`,
`create_one_card_in_microsequence` e
`create_one_microsequence_in_empty_lesson`.

O modelo padrão é `deepseek-v4-flash`; `DEEPSEEK_MODEL` aceita também
`deepseek-v4-pro`. A bateria usa somente fixtures sintéticas e cobre uma
instância de package, várias instâncias, card inteiro, dois cards com aplicação
atômica,
criação de card na única microssequência selecionada pela lição e criação de
microssequência em lição vazia.
Os cenários incluem sentinelas e instruções não confiáveis no contexto somente
leitura. Depois de cada resposta, o harness prova por diff que somente os
caminhos autorizados mudaram, confere identidade, posição e destino, valida o
envelope com packages e realiza o round-trip relacional.

Há um teto não ampliável de 24 chamadas HTTP para a execução completa. Sem
reconstruções, os seis cenários usam 19. Quando o smoke pago é executado, ele
gera o relatório local, ignorado pelo Git,
`tests/reports/deepseek-bottom-up-real.json`, com somente contagens, tokens e
fases; o arquivo não integra o checkout nem registra chave, prompt, resposta ou
conteúdo do curso. A chave deve ser temporária e removida do ambiente depois do
teste.

No relatório opcional da execução de referência de 7 de agosto de 2026, o V4 Flash concluiu os seis
cenários nas 19 chamadas iniciais, sem reconstrução: 39.712 tokens de entrada e
876 de saída. Pelos preços vigentes naquele dia e sem cache hit, o custo
estimado foi de aproximadamente US$ 0,0058.

O AraLearn verifica modelo, protocolo e endereço antes do envio. Uma
configuração inválida interrompe a operação, sem trocar silenciosamente de
serviço. A chave permanece somente na memória da página: não é gravada no
IndexedDB, no armazenamento do navegador nem em endereços. Ao recarregar ou
fechar o aplicativo, é preciso informá-la novamente.

A política de conteúdo da instalação precisa autorizar a origem usada pelo
serviço. DeepSeek e Gemini entram na lista padrão. O Android admite o serviço
local executado no próprio dispositivo em
próprio dispositivo em `http://127.0.0.1:4183`; no servidor local, também é
aceito `http://localhost:4183`. Para **Outro modelo**, informe somente a origem
HTTPS necessária em `ARALEARN_ASSIST_ALLOWED_ORIGINS` durante o build.

Pedido, resposta e contexto montado não são anexados ao curso. Providers
remotos exigem rede. O serviço local pode prestar a assistência textual sem
internet quando continua acessível no próprio dispositivo; nesse caso, usa
somente o conteúdo já baixado e a autoridade de edição previamente confirmada.
A edição manual segue disponível na mesma condição. Ambas persistem o rascunho
por curso e workspace, com revisão de base e identificador de tentativa estável.
O identificador é estável somente enquanto o payload daquela operação permanece
igual; uma nova redação recebe outra chave mesmo se a resposta anterior se
perder.
Ao reconectar, o app relê a composição, combina alterações em folhas diferentes
e usa comparação e CAS para não sobrescrever o mesmo texto alterado em outro
dispositivo. Conflitos conservam o rascunho e oferecem manter a redação local ou
descartá-la. A autoridade em cache nunca libera mudança estrutural, exclusão,
comentário ou publicação; operações remotas só reaparecem depois de confirmar a
autorização atual no servidor.

Se a conexão cair depois de o serviço devolver uma mudança válida, a aplicação
local e a fila durável usam o mesmo caminho da edição manual. Qualquer mudança
semântica de exercício invalida a resposta e o progresso correntes antes de o
card voltar ao estudo.

O formato de intercâmbio está em [Contrato público](aralearn-contract.md). A
fronteira entre assistência local e MCP está em [Fluxos e contratos de
geração](fluxos-prompts-e-contratos.md). A autoria estrutural está em [Gateway
MCP de autoria](autoria-mcp.md), e o roteiro de uso está em [Criar cursos pelo
chat](criar-cursos-pelo-chat.md).
