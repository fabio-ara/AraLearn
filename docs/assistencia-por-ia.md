# Assistência por modelo de linguagem

Um modelo de linguagem gera texto a partir das instruções e do contexto que recebe. No AraLearn, essa capacidade pode ajudar a planejar um curso, desenvolver explicações e preparar atividades. A pessoa autora define a finalidade, discute a proposta e inspeciona o conteúdo e sua relação com as fontes.

A assistência pode ocorrer numa conversa externa conectada ou sobre um trecho aberto no próprio aplicativo. O curso permanece salvo e pode ser retomado entre sessões. Em cada fluxo, mudam o contexto recebido pelo assistente, o alcance da alteração e a forma de examinar o resultado antes de gravá-lo.

Para apresentar as propostas, o AraLearn usa conteúdo estruturado: os dados indicam, por exemplo, qual texto pertence a um parágrafo ou quais alternativas compõem uma atividade. Os [contratos de conteúdo](aralearn-contract.md) definem os campos e as relações aceitos. Essa conferência técnica permite verificar se a proposta pode ser utilizada pelo sistema; examinar sua correção factual e pedagógica exige ler o material e as fontes.

A supervisão precisa ser descrita pelo controle exercido em cada fluxo. O
referencial do Ministério da Educação ([Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao), p. 69) distingue
*human-in-the-loop*, com decisão humana necessária antes de efeitos relevantes,
de *human-on-the-loop*, com acompanhamento e possibilidade de intervenção.
No AraLearn, a autorização delimita a produção e os pontos de revisão dão acesso
ao material para inspeção. A exigência de conteúdo revisado para estudo é uma
[política expressa do curso](explicacao-e-revisao-humana.md), separada da simples
gravação. Essa configuração determina quais efeitos dependem de revisão prévia.

## Três formas de assistência

No curso, uma unidade apresenta uma relação ou uma atividade; uma microssequência reúne um percurso com objetivo próprio dentro de uma lição. O [modelo didático](modelo-didatico.md) explica essa organização, usada para delimitar o trabalho da assistência.

| Caminho | Onde ocorre e como se usa |
| --- | --- |
| **Assistência por IA** | Conversa dentro de Estudo sobre a unidade, microssequência ou lição aberta. A pessoa escolhe entre os provedores disponíveis: OpenAI, Gemini ou DeepSeek. |
| **Model Context Protocol (MCP)** | Um cliente externo compatível descobre as tarefas de autoria e as utiliza sobre o curso, com autorização da conta. |
| **Actions/OpenAPI** | As mesmas tarefas são oferecidas por operações descritas em OpenAPI, um formato de descrição de serviços. O cliente de testes atual é o [ChatGPT](https://chatgpt.com), uma aplicação externa, por meio de Actions. |

Os canais têm credenciais e sessões próprias. Uma **credencial** permite ao serviço reconhecer o acesso autorizado; uma **sessão** conserva o contexto de uma interação. Por isso, cada canal precisa de sua própria conexão.

A assistência interna utiliza adaptadores, as partes do código que convertem o pedido para o formato de cada provedor. Os três adaptadores implementados são os listados acima. Nas conversas externas, a separação entre tarefas de autoria e modelos favorece o uso de clientes diferentes, cuja compatibilidade depende dos recursos e da autenticação disponíveis.

O catálogo conversacional cobre o ciclo dos cursos e sua disponibilização a
outras pessoas. Dados do perfil e da conta são cuidados pela interface
autenticada. Os guias de [MCP](autoria-mcp.md) e [Actions](autoria-actions.md)
detalham a configuração e o alcance de cada canal.

## A sessão de assistência por IA

A assistência interna mantém uma conversa sobre o recorte aberto — unidade,
microssequência ou lição, conforme o [modelo didático](modelo-didatico.md).
Esse alvo é fixado ao iniciar a sessão, que progride assim:

1. a pessoa descreve o problema ou objetivo;
2. o modelo responde à discussão; uma explicação pode vir sem proposta de mudança;
3. a pessoa discute, corrige, discorda ou acrescenta condições;
4. quando houver uma mudança solicitada, a proposta incorpora as condições da conversa;
5. **Preparar prévia** gera e valida o resultado, sem alterar o rascunho;
6. **Original** e **Prévia** permitem conferir o conteúdo com o mesmo mecanismo de apresentação usado no estudo;
7. **Aplicar ao rascunho** aceita o resultado conferido; **Descartar prévia** o remove;
8. **Salvar proposta** grava o rascunho com a revisão original; **Descartar rascunho** restaura o original.

Fechar a sessão apaga as mensagens e as propostas ainda não aplicadas. Um
resultado já aceito permanece no rascunho. A conversa existe somente durante a
sessão e fica fora do [conteúdo e dos dados persistidos pelo AraLearn](persistencia-relacional.md).
Os comprovantes de cada gravação, chamados de recibos, registram a operação salva.

### Escopos de escrita

A sessão pode trabalhar com:

- composição e conteúdo da unidade de estudo;
- estrutura e conteúdo da microssequência didática;
- criação, remoção e reordenação de microssequências no escopo da lição.

O alvo corrente permanece visível durante edição e prévia. Uma proposta para
microssequência não recebe autoridade sobre outra microssequência; uma proposta
para lição não altera módulos, outras lições ou dados pessoais.

Edição focal, assistência e alterações estruturais são exclusivas do
proprietário, também quando ele estuda seu próprio curso. Receber acesso privado
ou abrir um curso público permite estudar e, com conta, registrar observações;
isso não concede edição nem cria uma cópia automaticamente. Cópias próprias
existentes continuam cursos independentes sob a autoridade de seu proprietário.

## Contexto enviado

O conjunto enviado ao modelo reúne a instrução da pessoa e até oito mensagens
recentes da sessão. Para situar o pedido, inclui também a proposta corrente e o
trecho do percurso didático necessário para compreender o alvo.
Para a unidade, inclui os componentes e campos editáveis. Para a
microssequência, inclui sua ordem e suas unidades. Para a lição, inclui as
microssequências e o contexto curricular suficiente para criar, remover ou
reordenar sem perder relações.

O modelo recebe somente o conteúdo descrito acima, para leitura. Identificadores
técnicos de autorização e arquivos mantidos no armazenamento permanecem no
serviço; credenciais e dados pessoais externos ao recorte também ficam fora do
envio.
O contexto tem limite de 96 KiB, ou 98.304 bytes. O resumo curricular pode ser reduzido fora do
alvo; se o conteúdo necessário à alteração ainda não couber, a interface informa
o limite e preserva o rascunho.

O AraLearn envia esse contexto diretamente ao provedor escolhido, que pode aplicar
seus próprios termos de tratamento. A revisão humana continua necessária mesmo
com essa seleção de campos, pois o próprio conteúdo educacional pode conter dado
pessoal ou informação sensível.

## Descoberta e geração de componentes

Uma proposta precisa escolher uma forma de apresentar o conteúdo e receber respostas. Os [componentes didáticos](componentes-didaticos.md), como tabela ou atividade de lacunas, definem essas possibilidades. O AraLearn consulta seus contratos para informar ao modelo quais campos precisa preencher. No código, essa consulta é feita por `consultarComponentesDidaticos`. Ao preparar a prévia, a sessão descobre
os componentes, obtém seus contratos, gera a proposta e a valida antes da
inspeção e da aplicação ao rascunho.

A descoberta começa por famílias e intenção. O modelo recebe somente os
contratos dos componentes escolhidos, um por chamada. A composição gerada passa
pela validação de cada [pacote de componente](componentes-didaticos.md), de suas
relações internas e de sua apresentação no estudo.

Reparos são limitados a duas tentativas e recebem os erros estruturados da
validação anterior. Se a proposta continuar inválida, a sessão preserva o
conteúdo corrente e explica a falha. O JSON, formato estruturado usado para descrever os componentes, pode ser
válido sem que a proposta seja apresentável. A aplicação depende também da
prévia e da decisão da pessoa.

## Aplicação ao rascunho e concorrência

A proposta preparada para inspeção é uma candidata à alteração. Antes de mudar o rascunho, o AraLearn verifica essa candidata com o
mesmo mecanismo que apresenta a unidade no estudo e aguarda **Aplicar ao rascunho**. Falha
de geração, validação ou apresentação preserva o conteúdo corrente. Uma
candidata aceita e válida substitui somente o rascunho do alvo; a gravação é
uma operação separada.

Cada escrita informa a revisão esperada do curso e as versões focais
necessárias. Se outra sessão alterar o alvo entre leitura e gravação, o servidor
recusa a proposta. A candidata continua no rascunho para conferência ou descarte;
a revisão mais nova não substitui a revisão original do pedido. Atualizações de
fundo ficam suspensas durante a conversa e enquanto houver rascunho, evitando
substituir o trabalho local por conteúdo externo.

Cada escrita recebe uma identidade estável, `requestId`, para recuperar seu recibo quando a
resposta da rede se perde. Repetir a mesma identidade com conteúdo diferente é
conflito. Essa repetição segura não amplia o escopo confirmado.

Se a resposta da gravação se perder, salvar novamente confere o mesmo pedido.
Descartar nessa situação exige confirmação focal: remove o rascunho local,
mas não desfaz uma gravação que já possa ter sido concluída no curso.

## Provedor remoto e credencial da sessão

A pessoa escolhe OpenAI, Gemini ou DeepSeek, informa o modelo quando necessário
e fornece a própria chave. A chave permanece apenas em memória durante a sessão
e segue somente no cabeçalho da chamada ao provedor escolhido. O AraLearn não a
grava.

Sair, recarregar ou fechar a interface cancela a chamada pendente e apaga a
conversa, sua configuração transitória e qualquer candidata ainda não aplicada. Uma
alteração já aceita permanece no rascunho. Uma resposta tardia não pode reabrir
a sessão nem aplicar conteúdo. Os endereços dos serviços são definidos pelos
adaptadores; a interface pede apenas as escolhas necessárias ao uso.

A pessoa precisa revisar o recorte e os termos do provedor. A permanência da
chave somente em memória não altera sua validade no serviço. Testes automatizados
usam respostas simuladas, sem custo. A interoperabilidade com uma conta e um
modelo reais é verificada à parte, com credencial autorizada e limite de consumo
definido.

## MCP e Actions

MCP e Actions expõem as mesmas tarefas do catálogo compartilhado. O assistente
consulta o estado salvo, prepara o trabalho autorizado e o grava por operações
que distinguem leitura e escrita. A produção das unidades de estudo a partir
do planejamento é chamada de materialização.

O assistente localiza objetos por título, posição ou referência humana. O serviço identifica o item e verifica se ele mudou desde a leitura. Essa conferência protege a gravação sem exigir que a pessoa autora construa identificadores internos ou versões do banco.

MCP usa OAuth 2.1 e Actions mantém sua própria conexão OAuth. Esse mecanismo
permite autorizar o cliente sem lhe entregar a senha da conta. Actions descreve
as operações num arquivo OpenAPI; MCP oferece descoberta de ferramentas. Os dois canais chegam ao mesmo curso e obedecem à
mesma autorização. A [Autoria por MCP](autoria-mcp.md) e o guia de [Autoria por
Actions](autoria-actions.md) desenvolvem as diferenças de transporte.

## Planejamento, fontes e revisão

O [guia da pessoa autora](guia-professor-autor.md) acompanha as decisões do
planejamento à produção, incluindo as bases explicativas e suas fontes. O
[guia por conversa](criar-cursos-pelo-chat.md) mostra como pedir, inspecionar e
ajustar o trabalho com um assistente externo.

Aprovar o mapa confirma a organização salva que foi inspecionada. Autorizar produção delimita o que o assistente pode fazer. Declarar revisão registra uma decisão humana sobre conteúdo já salvo. Essas decisões têm efeitos próprios: uma autorização de continuidade permite avançar até o limite combinado, mas não fabrica uma declaração de inspeção.

A configuração também distingue o que se deseja do que foi realizado. A **intenção corrente** orienta o próximo trabalho; a **configuração aplicada** registra as escolhas usadas na produção de uma unidade. No automático, o assistente escolhe valores conforme conteúdo e público e registra o motivo. Fixações da autoria e condições de pesquisa prevalecem. O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md) explica a relação entre essas escolhas.

Na assistência interna, o aplicativo lê a configuração do recorte na mesma versão do conteúdo original. Ele não preenche valores pendentes nem resolve por conta própria a herança, isto é, a escolha vinda de um nível mais amplo do curso. Se a versão mudou, pede sincronização e reabertura para que conteúdo e configuração sejam examinados juntos. Um conflito de configuração precisa ser resolvido antes da proposta de edição.

Fontes e âncoras — localizações dos trechos utilizados — ficam no curso com os [vínculos que registram seu uso](fontes-e-citacoes.md). Um arquivo anexado à conversa só se torna uma fonte persistente quando essa intenção estiver clara. Em outra sessão, o assistente pode reler a fonte cadastrada; a memória da conversa não substitui esse registro.

Uma correção começa pela leitura do alvo, das observações e dos pontos do curso afetados. Depois da alteração autorizada, a releitura confere o conteúdo salvo e quais observações foram efetivamente atendidas. A [recuperação da mesma tentativa](auditoria-de-conformidade-instrucional.md#aplicação-e-reinspeção) permite conferir uma resposta perdida antes de outra gravação. A declaração humana de revisão permanece uma decisão separada.

## Verificação técnica e avaliação educacional

Os contratos verificam a integridade técnica, a autorização e a correspondência
entre referências. A correção factual e pedagógica depende da inspeção do
conteúdo e das fontes; os efeitos sobre a aprendizagem dependem de investigação
com pessoas. Recomendações de interação humano-IA ressaltam visibilidade,
controle e possibilidade de correção
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Num estudo de
decisão assistida por IA, intervenções que forçavam reflexão reduziram
dependência excessiva, mas acrescentaram custo. Esse resultado ajuda a formular
hipóteses para a autoria educacional, que precisam ser avaliadas no próprio
contexto
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). No uso
educacional de modelos generativos, a responsabilidade factual e pedagógica permanece humana
([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

Consulte [Criar cursos pelo chat](criar-cursos-pelo-chat.md) para o percurso
conversacional e [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md)
para a relação entre intenção, confirmação e escrita estruturada.

<!-- referências locais: início -->

## Referências

- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao): Brasil. Ministério da Educação (2026). **Referencial para Desenvolvimento e Uso Responsáveis de Inteligência Artificial na Educação.** Ministério da Educação.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
