# Capacidades e limites atuais

Esta página reúne o que uma pessoa pode fazer no AraLearn e os limites que
precisa conhecer. Ela descreve o produto corrente, sem transformar planos ou
hipóteses de pesquisa em funções disponíveis.

Catálogos e capacidades conferidos em **2026-09-05** no runtime, com provas
locais de API, banco e políticas. Implementação disponível não significa entrega
hospedada verificada; os clientes externos e a publicação exigem provas próprias.

| Caso de uso | Existe | Conectado | Acessível | Uso verificado | Funciona | Necessário | Alinhamento | Limites e destino |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estudar, responder e rever | sim | após o primeiro carregamento, não | visitante em curso público ou pessoa com acesso | local | sim | sim | produto | visitante conserva progresso e Rever no dispositivo; conta usa estado pessoal |
| Registrar observação | sim | para enviar | pessoa autenticada com acesso | local | sim | sim | produto | observação própria não concede edição |
| Editar Unidade no Estudo | sim | para gravar | proprietário | local | sim | sim | produto | estudante alheio não edita nem cria cópia automática |
| Escolher identificador e compartilhar | sim | sim | titular do perfil; proprietário do curso | local | sim | sim | produto | identificador único; grant confirma a pessoa selecionada |
| Disponibilizar curso público | sim | para publicar e primeiro acesso | proprietário publica; visitante estuda | local | sim | sim | produto | confirmação e política de arquivos explícitas; bucket privado |
| Planejar, materializar e revisar curso | sim | sim | proprietário | sim | sim | sim | produto | não há fila autoral genérica sem conexão |
| Usar Assistência por IA | sim | sim | proprietário | interface e contratos locais; serviços pendentes | condicionado ao provedor | sim | produto | prévia, aplicação ao rascunho e gravação são explícitas; não há comprovação corrente de todos os provedores |
| Criar por MCP | sim | sim | proprietário ou pessoa com permissão específica de cópia | protocolo local | no recorte local | sim | produto | tarefas do catálogo compartilhado; inclui perfis de autoria, mas não perfil pessoal ou manutenção; cliente ChatGPT hospedado pendente |
| Criar por GPT com Actions | sim | sim | proprietário ou pessoa com permissão específica de cópia | protocolo local | no recorte local | sim | produto | mesmas tarefas com OAuth próprio; importação e conversa no cliente hospedado pendentes |
| Inspecionar unidades focadas no chat ou na autoria | sim | sim | proprietário com integração válida | sim | sim | sim | produto | a resposta traz um endereço direto; a autoria abre a mesma unidade em foco |
| Excluir curso próprio ou sair de curso compartilhado | sim | sim | relação correspondente | sim | sim | sim | produto | confirmação explícita; efeitos diferentes |
| Executar Manutenção | sim | sim | identidade administrativa | sim | sim | sim | operação | inventário classificado e revalidação por objeto; sem consulta genérica |
| Medir efeito educacional | não automaticamente | não se aplica | pesquisa autorizada | não como inferência do produto | depende de estudo | quando houver pergunta empírica | pesquisa | requer desenho, participantes, instrumentos e análise |

## Estudo

A entrada apresenta um curso por vez. O seletor distingue curso próprio,
compartilhado e público por iconografia e estado acessível;
o título não recebe sufixo de propriedade. A prévia informa objetivo,
quantidade de módulos, lições e Unidades e progresso. A disponibilidade offline
aparece somente quando muda a capacidade de abrir o curso.

O percurso segue a hierarquia:

```text
Curso → Módulo → Lição → Microssequência didática → Unidade de estudo
```

**Voltar** restaura a origem real do percurso, inclusive rolagem e foco depois
de Rever ou endereço direto. **Home** oferece uma saída global
previsível. O pai só aparece como ação contextual quando uma jornada concreta
o justificar. Curso e módulo oferecem os modos **Visualizar** e **Editar**. Lição,
microssequência e Unidade oferecem **Visualizar**, **Editar** e **Assistência por
IA**. Os modos de alteração aparecem quando a relação de acesso autoriza operar
o alvo.

Durante o estudo, a pessoa pode responder às práticas, receber retorno, avançar,
marcar uma Unidade para rever e abrir fontes autorizadas. Registrar observações
exige uma conta com acesso ao curso.
Progresso, respostas, marcas e Observações são pessoais. Eles não alteram o
conteúdo compartilhado.

A Unidade ocupa a altura útil da tela e mantém o dock de ações no mesmo lugar;
quando o conteúdo cresce, somente o cartão de conteúdo rola. A Home permite
retirar um item de **Rever** diretamente e desfazer a retirada.

Edição manual e assistência são exclusivas do proprietário. Cópias próprias
anteriores permanecem independentes. Um rascunho antigo com resposta perdida
pode recuperar o alvo comprovado; o aplicativo não reaplica a edição nem cria
outro curso para resolver a pendência.

## Autoria

Autoria lista somente os cursos próprios. A pessoa pode criar um curso privado,
definir título, objetivo, público e alcance e organizar sua estrutura. Ao abrir
o curso, **Conteúdo** recebe o foco; Planejamento fica no cabeçalho e
Parâmetros, **Fontes**, Revisão, Analytics e Pessoas ficam no menu compacto.

O planejamento mostra primeiro o mapa curricular completo de módulos, lições e
microssequências, com cobertura do escopo. A aprovação se refere ao mapa
inspecionável e não materializa conteúdo. Depois, partes agrupam
microssequências existentes apenas como lotes operacionais. A produção
confirmada aparece como unidades de estudo em Conteúdo, sem expor passos
técnicos.

O [catálogo canônico de parâmetros](../src/domain/courseDesignParameters.js)
reúne doze decisões, na versão 1.2.1, em Explicações, Prática, Leitura e estilo,
Conversa e Produção. Cada decisão admite os escopos definidos pelo catálogo;
granularidade de parte, lote e frequência de pausa são independentes e têm
escopo de curso. Orientações editoriais e política de componentes complementam
essas decisões.

Herdar conserva a intenção do escopo anterior. O modo automático pode ainda não
ter um valor escolhido; a produção precisa calibrá-lo pelo público, conteúdo e
função e registrar valor e motivo. Uma escolha fixa não é substituída pelo GPT,
e uma condição de pesquisa conflitante bloqueia a aplicação. Perfis guardam
preferências por cópia, com prévia das exceções antes de aplicar. Os alvos de
palavras são flexíveis, não limites, e não autorizam compressão. A interface
mostra de onde veio cada decisão e o valor efetivamente aplicado.

Fontes e Âncoras possuem estado corrente; o bucket de PDFs é privado. O autor
define disponibilidade de arquivos com exceções por fonte e por PDF. Uma
atribuição liga a Unidade à fonte e às Âncoras exatas usadas. Referências sem
prova suficiente não aparecem como citação comprovada no Estudo.

Conteúdo percorre a composição sem ativar respostas. Revisão parte das
Observações abertas e alcança outras unidades quando a coerência do percurso
exigir. Analytics apresenta desenho e intervenções correntes em números simples,
sem inferir eficácia ou causalidade.

## Assistência por IA

Assistência por IA é uma sessão contextual, não uma chamada isolada para trocar
texto. A pessoa conversa sobre uma proposta que pode ser discutida em novos
turnos. **Preparar prévia** gera e valida a proposta sem alterar o rascunho;
**Aplicar ao rascunho** exige outra ação explícita. Gravar no curso continua
sendo uma etapa própria. O modelo recebe contexto somente leitura suficiente
para o alvo.

A sessão pode trabalhar com:

- composição e conteúdo da Unidade;
- estrutura e conteúdo da microssequência;
- criação, remoção e reordenação de microssequências dentro da lição.

Quando a proposta usa componentes didáticos, o AraLearn descobre primeiro as
famílias pertinentes, obtém somente os contratos exatos, valida a composição e
faz no máximo reparos delimitados. A prévia usa o renderer real. JSON válido,
sozinho, não basta: uma proposta inválida ou não renderizável nunca substitui o
conteúdo corrente.

A pessoa escolhe OpenAI, Gemini ou DeepSeek e informa uma chave mantida somente
na memória da sessão. O AraLearn não grava a conversa como conteúdo nem expõe
endpoint ou relay no uso normal. Aplicar uma prévia ainda exige uma
gravação explícita e as cercas de versão do curso. As provas locais da interface
e dos adaptadores não comprovam disponibilidade de cada serviço. A validação
real dos provedores com credenciais válidas permanece pendente.

## Autoria conversacional

O AraLearn oferece dois canais conversacionais distintos.

O **Model Context Protocol (MCP)** conecta um cliente compatível ao
[catálogo compartilhado de tarefas humanas](autoria-mcp.md#tarefas-disponíveis).
Ele permite retomar, planejar, materializar, configurar, reutilizar perfis de
autoria, tratar Observações, revisar, operar fontes e áudios, consultar
componentes, copiar cursos autorizados e comparar ou exportar recortes próprios.
OAuth, escopos e principal do MCP pertencem a esse canal.

Um **GPT personalizado com Actions** usa uma descrição OpenAPI e chamadas HTTP
autorizadas. Ele projeta o mesmo catálogo, com OAuth confidencial próprio.
Actions não é um nome alternativo para
MCP e não compartilha sua sessão ou seu protocolo.

Nos dois canais, a pessoa pode retomar o curso pelo título e conversar sobre o
estado e os efeitos da autoria. Identidades, revisões e chaves de repetição
permanecem no estado estruturado do cliente, sem virar dados que a pessoa precise
transportar entre sessões. Um arquivo anexado só se torna fonte persistente
quando sua função no curso é clara ou confirmada; depois de incorporado, pode ser
recuperado pelo curso em outra sessão sem novo envio. Análise declarada como
temporária não incorpora o documento.

Leituras com continuação são parciais: o cliente percorre o mesmo recorte sem
substituir trechos por resumos. Fragmentos conservam o JSON literal e só permitem
declarar leitura completa quando a continuação termina. As provas de protocolo
local não substituem a renovação do MCP e a importação de Actions em conversas
novas no cliente hospedado.

Perfil pessoal, concessão e revogação de acesso, exclusão de curso ou conta e
Manutenção permanecem ações do aplicativo autenticado. Perfis de autoria e
cópia autorizada são tarefas distintas, presentes no catálogo conversacional.

## Dados, acesso e ciclo de vida

O conteúdo carregado, o estado pessoal e as filas necessárias à continuidade
podem permanecer no dispositivo. **Remover dados deste dispositivo** apaga
somente a réplica da conta ativa e mantém os dados enviados ao servidor. **Sair**
encerra a sessão sem ter o mesmo significado de limpeza local.

Na Home, **Ações deste curso** distingue duas relações:

- o proprietário pode excluir definitivamente um curso próprio;
- uma pessoa com acesso pode sair de um curso compartilhado sem excluir o
  original.

Excluir a conta é uma ação própria e exige uma confirmação literal. Ela remove
a conta, cursos próprios, inclusive cópias anteriores, e objetos vinculados segundo o
contrato de exclusão.

Uma identidade administrativa autorizada também encontra **Manutenção** em
**Conta e aparência**. Essa área mostra o agendamento de retenção e somente os
resíduos que o AraLearn sabe classificar. Cada remoção revalida no servidor a
classe e o objeto exatos e atualiza o inventário. A área não oferece consulta
genérica ao banco nem ao armazenamento.

## Aplicação web e Android

A mesma experiência é distribuída como site e aplicativo Android. Estudo é a
referência visual: uma coluna central, conteúdo em primeiro lugar, poucas ações
simultâneas e divulgação progressiva. A composição permanece utilizável em
telefones de 360, 390 e 430 pixels e em telas maiores, sem criar um painel
paralelo de desktop.

O servidor usa PostgreSQL para o curso vivo e suas relações, Storage privado
para avatares, PDFs e áudios e IndexedDB no dispositivo para continuidade local. A
[arquitetura](arquitetura.md), a [persistência](persistencia-relacional.md) e o
capítulo sobre [Supabase](supabase.md) explicam esses mecanismos.

## O que a implementação não demonstra

Testes e inspeção do produto podem demonstrar contratos, autorização,
persistência, navegação e renderização nas condições exercitadas. Eles não
demonstram, por si, que uma pessoa compreende a interface, aprende mais ou
transfere melhor o conhecimento.

Resultados educacionais exigem população, tarefas, instrumentos e análise
adequados. O [protocolo de avaliação](protocolo-avaliacao-artefato.md) separa
propriedade implementada, hipótese e evidência empírica. A
[matriz de conformidade técnica](matriz-conformidade-tecnica.md) indica onde
verificar os principais contratos do produto.
