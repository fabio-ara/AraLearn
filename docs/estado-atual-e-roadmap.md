# Capacidades e limites atuais

Esta página reúne o que uma pessoa pode fazer no AraLearn e os limites que
precisa conhecer. Ela descreve o produto corrente, sem transformar planos ou
hipóteses de pesquisa em funções disponíveis.

Evidência corrente revisada em **2026-08-29**.

| Caso de uso | Existe | Conectado | Acessível | Uso verificado | Funciona | Necessário | Alinhamento | Limites e destino |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Estudar, responder, rever e observar | sim | após o primeiro carregamento, não | pessoa com acesso ao Curso | sim | sim | sim | produto | estado pessoal sincroniza quando a rede retorna |
| Editar Unidade no Estudo | sim | para gravar | proprietário ou pessoa apta a criar cópia | sim | sim | sim | produto | acesso compartilhado grava somente numa cópia pessoal |
| Planejar, materializar e revisar Curso | sim | sim | proprietário | sim | sim | sim | produto | não há fila autoral genérica sem conexão |
| Usar Assistência por IA | sim | sim | pessoa autorizada no alvo | sim | sim | sim | produto | exige proposta aceita, contratos válidos e gravação explícita |
| Criar por MCP | sim | sim | proprietário com OAuth válido | sim | sim | sim | produto | seis ferramentas canônicas e `add_part` dedicado; não inclui perfil ou Manutenção |
| Criar por GPT com Actions | sim | sim | proprietário com OAuth válido | sim | sim | sim | produto | canal OpenAPI distinto do MCP |
| Inspecionar Unidades focadas no chat ou na Autoria | sim | sim | proprietário com integração válida | sim | sim | sim | produto | MCP Apps incorpora o material; o endereço abre o mesmo conjunto filtrado |
| Excluir Curso próprio ou sair de Curso compartilhado | sim | sim | relação correspondente | sim | sim | sim | produto | confirmação explícita; efeitos diferentes |
| Executar Manutenção | sim | sim | identidade administrativa | sim | sim | sim | operação | inventário classificado e revalidação por objeto; sem consulta genérica |
| Medir efeito educacional | não automaticamente | não se aplica | pesquisa autorizada | não como inferência do produto | depende de estudo | quando houver pergunta empírica | pesquisa | requer desenho, participantes, instrumentos e análise |

## Estudo

A entrada apresenta um Curso por vez. O seletor distingue Curso próprio,
**Curso compartilhado** e **Cópia pessoal** por iconografia e estado acessível;
o título não recebe sufixo de propriedade. A prévia informa objetivo,
quantidade de Módulos, Lições e Unidades e progresso. A disponibilidade offline
aparece somente quando muda a capacidade de abrir o Curso.

O percurso segue a hierarquia:

```text
Curso → Módulo → Lição → Microssequência didática → Unidade de estudo
```

**Voltar** restaura a origem real do percurso, inclusive rolagem e foco depois
de Rever ou endereço direto. **Home** oferece uma saída global
previsível. O pai só aparece como ação contextual quando uma jornada concreta
o justificar. Curso e Módulo oferecem os modos **Visualizar** e **Editar**. Lição,
Microssequência e Unidade oferecem **Visualizar**, **Editar** e **Assistência por
IA**. Os modos de alteração aparecem quando a relação de acesso autoriza operar
o alvo.

Durante o estudo, a pessoa pode responder às práticas, receber retorno, avançar,
marcar uma Unidade para rever, registrar Observações e abrir Fontes autorizadas.
Progresso, respostas, marcas e Observações são pessoais. Eles não alteram o
conteúdo compartilhado.

A Unidade ocupa a altura útil da tela e mantém o dock de ações no mesmo lugar;
quando o conteúdo cresce, somente o cartão de conteúdo rola. A Home permite
retirar um item de **Rever** diretamente e desfazer a retirada.

Quando uma pessoa com acesso de Estudo edita uma Unidade compartilhada, a
primeira gravação material cria uma cópia privada. O original permanece
inalterado, e o percurso continua na mesma Unidade da nova cópia.

## Autoria

Autoria lista somente os Cursos próprios. A pessoa pode criar um Curso privado,
definir título, objetivo, público e alcance e organizar sua estrutura. Ao abrir
o Curso, a **Visão geral** mostra estado, próxima ação e as sete tarefas:
**Planejamento**, **Conteúdo**, **Parâmetros e componentes**, **Fontes**,
**Revisão**, **Variantes e pesquisa** e **Pessoas e acesso**.

O Planejamento organiza Partes em linguagem natural e pode ligá-las a
Microssequências reais. A materialização registra passos retomáveis sem declarar
como produzido aquilo que o servidor ainda não confirmou.

Parâmetros pedagógicos, orientações e política de componentes podem ser
definidos no Curso ou em um escopo didático mais específico. A interface mostra
de onde veio cada decisão e o valor efetivo herdado.

Fontes possuem revisões imutáveis, Âncoras e PDFs privados. Uma atribuição liga
a Unidade à revisão e às Âncoras exatas usadas. Referências anteriores sem prova
suficiente permanecem identificadas para resolução e não aparecem como citação
comprovada no Estudo.

Conteúdo percorre a composição sem ativar respostas. A Auditoria registra
rodadas, achados, correções, verificações e reversões. Observações de estudantes
continuam separadas de achados de auditoria. Variantes registram relações entre
Cursos; Pesquisa apresenta fatos, definições, denominadores, ausências e
exportações sem inferir eficácia ou causalidade.

## Assistência por IA

Assistência por IA é uma sessão contextual, não uma chamada isolada para trocar
texto. A pessoa conversa, e cada resposta mantém uma proposta concreta que pode
ser discutida em novos turnos. Somente o aceite explícito autoriza gerar,
validar e aplicar operações tipadas ao rascunho. O modelo recebe contexto
somente leitura suficiente para o alvo.

A sessão pode trabalhar com:

- composição e conteúdo da Unidade;
- estrutura e conteúdo da Microssequência;
- criação, remoção e reordenação de Microssequências dentro da Lição.

Quando a proposta usa componentes didáticos, o AraLearn descobre primeiro as
famílias pertinentes, obtém somente os contratos exatos, valida a composição e
faz no máximo reparos delimitados. A prévia usa o renderer real. JSON válido,
sozinho, não basta: uma proposta inválida ou não renderizável nunca substitui o
conteúdo corrente.

A pessoa escolhe OpenAI, Gemini ou DeepSeek e informa uma chave mantida somente
na memória da sessão. O AraLearn não grava a conversa como conteúdo nem expõe
endpoint ou relay no uso normal. Aplicar uma prévia ainda exige uma
gravação explícita e as cercas de versão do Curso.

## Autoria conversacional

O AraLearn oferece dois canais conversacionais distintos.

O **Model Context Protocol (MCP)** conecta um cliente compatível às ferramentas
canônicas de Curso. Ele permite localizar Cursos próprios, ler composição,
planejar, materializar, operar Fontes, Auditoria, Variantes, Pesquisa e consultar
componentes didáticos. Também pode reunir Unidades num foco ordenado, mostrá-las
por Microssequência no próprio chat e oferecer o endereço filtrado da Autoria.
OAuth, escopos e principal do MCP pertencem a esse canal.

Um **GPT personalizado com Actions** usa uma descrição OpenAPI e chamadas HTTP
autorizadas. Suas seis operações canônicas e três projeções dedicadas a itens do
plano e à criação de Parte atuam sobre os mesmos contratos de Curso, com OAuth
confidencial próprio.
Actions não é um nome alternativo para
MCP e não compartilha sua sessão ou seu protocolo.

Nos dois canais, a pessoa pode retomar o Curso pelo título e conversar sobre o
estado e os efeitos da autoria. Identidades, revisões e chaves de repetição
permanecem no estado estruturado do cliente, sem virar dados que a pessoa precise
transportar entre sessões. Um arquivo anexado só se torna Fonte persistente
quando sua função no Curso é clara ou confirmada; depois de incorporado, pode ser
recuperado pelo Curso em outra sessão sem novo envio. Análise declarada como
temporária não incorpora o documento.

Perfil, cópia pessoal, ciclo de vida de Curso e Manutenção permanecem ações do
aplicativo autenticado. Elas não são expostas como ferramentas públicas só para
aumentar o alcance de um chat.

## Dados, acesso e ciclo de vida

O conteúdo carregado, o estado pessoal e as filas necessárias à continuidade
podem permanecer no dispositivo. **Remover dados deste dispositivo** apaga
somente a réplica da conta ativa e mantém os dados enviados ao servidor. **Sair**
encerra a sessão sem ter o mesmo significado de limpeza local.

Na Home, **Ações deste Curso** distingue duas relações:

- o proprietário pode excluir definitivamente um Curso próprio;
- uma pessoa com acesso pode sair de um Curso compartilhado sem excluir o
  original.

Excluir a conta é uma ação própria e exige uma confirmação literal. Ela remove
a conta, Cursos próprios, cópias pessoais e objetos vinculados segundo o
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

O servidor usa PostgreSQL para o Curso vivo e suas relações, Storage privado
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
