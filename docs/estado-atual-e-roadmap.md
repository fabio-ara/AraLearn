# Capacidades e limites atuais

Esta página reúne o que uma pessoa pode fazer no AraLearn e os limites que
precisa conhecer. Ela descreve o produto corrente, sem transformar planos ou
hipóteses de pesquisa em funções disponíveis.

Identidade e acesso revisados em **2026-09-05**, com provas locais de API, banco
e políticas. Implantação e clientes hospedados exigem verificação própria.

| Caso de uso | Existe | Conectado | Acessível | Uso verificado | Funciona | Necessário | Alinhamento | Limites e destino |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estudar, responder e rever | sim | após o primeiro carregamento, não | visitante em curso público ou pessoa com acesso | local | sim | sim | produto | visitante conserva progresso e Rever no dispositivo; conta usa estado pessoal |
| Registrar observação | sim | para enviar | pessoa autenticada com acesso | local | sim | sim | produto | observação própria não concede edição |
| Editar Unidade no Estudo | sim | para gravar | proprietário | local | sim | sim | produto | estudante alheio não edita nem cria cópia automática |
| Escolher identificador e compartilhar | sim | sim | titular do perfil; proprietário do curso | local | sim | sim | produto | identificador único; grant confirma a pessoa selecionada |
| Disponibilizar curso público | sim | para publicar e primeiro acesso | proprietário publica; visitante estuda | local | sim | sim | produto | confirmação e política de arquivos explícitas; bucket privado |
| Planejar, materializar e revisar curso | sim | sim | proprietário | sim | sim | sim | produto | não há fila autoral genérica sem conexão |
| Usar Assistência por IA | sim | sim | pessoa autorizada no alvo | sim | sim | sim | produto | exige proposta aceita, contratos válidos e gravação explícita |
| Criar por MCP | sim | sim | proprietário com OAuth válido | sim | sim | sim | produto | dezessete tarefas humanas; não inclui perfil ou manutenção |
| Criar por GPT com Actions | sim | sim | proprietário com OAuth válido | sim | sim | sim | produto | canal OpenAPI distinto do MCP |
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

Quatro parâmetros pedagógicos, dois alvos editoriais quantitativos, orientações
e política de componentes podem ser definidos no curso ou em um escopo didático
mais específico. No estado `default`, o GPT precisa calibrar automaticamente o
desenho para cada microssequência ou unidade pelo conteúdo e pela função; uma
condição fixada pelo pesquisador prevalece. Os alvos de palavras são flexíveis,
não limites, e não autorizam compressão. A interface mostra de onde veio cada
decisão e o valor efetivamente aplicado.

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
texto. A pessoa conversa, e cada resposta mantém uma proposta concreta que pode
ser discutida em novos turnos. Somente o aceite explícito autoriza gerar,
validar e aplicar operações tipadas ao rascunho. O modelo recebe contexto
somente leitura suficiente para o alvo.

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
gravação explícita e as cercas de versão do curso.

## Autoria conversacional

O AraLearn oferece dois canais conversacionais distintos.

O **Model Context Protocol (MCP)** conecta um cliente compatível às dezessete
tarefas humanas de curso. Ele permite retomar, planejar, materializar, configurar,
tratar Observações, revisar, operar fontes e consultar componentes didáticos.
OAuth, escopos e principal do MCP pertencem a esse canal.

Um **GPT personalizado com Actions** usa uma descrição OpenAPI e chamadas HTTP
autorizadas. Ele projeta as mesmas dezessete tarefas, com OAuth confidencial
próprio.
Actions não é um nome alternativo para
MCP e não compartilha sua sessão ou seu protocolo.

Nos dois canais, a pessoa pode retomar o curso pelo título e conversar sobre o
estado e os efeitos da autoria. Identidades, revisões e chaves de repetição
permanecem no estado estruturado do cliente, sem virar dados que a pessoa precise
transportar entre sessões. Um arquivo anexado só se torna fonte persistente
quando sua função no curso é clara ou confirmada; depois de incorporado, pode ser
recuperado pelo curso em outra sessão sem novo envio. Análise declarada como
temporária não incorpora o documento.

Perfil, acesso, ciclo de vida de curso e Manutenção permanecem ações do
aplicativo autenticado. Elas não são expostas como ferramentas públicas só para
aumentar o alcance de um chat.

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
para avatares e PDFs e IndexedDB no dispositivo para continuidade local. A
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
