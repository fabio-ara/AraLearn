# Criar cursos pelo chat

O AraLearn permite construir um curso em uma única conversa sem exigir que a
pessoa conheça JSON, schemas ou operações do backend. O assistente cuida da
estrutura técnica; a pessoa autora decide o público, o recorte, as fontes e a
qualidade conceitual.

A conversa é descartável: o curso não depende de mensagens antigas para ser
retomado. No início de cada nova etapa, o assistente relê a retomada compacta:
contagens da árvore, Partes, decisões, mandato e achados persistidos; depois
consulta `outline` ou a entidade necessária. Assim, trocar de conversa ou de
cliente não obriga a reconstruir o plano pela memória do chat. Tecnicamente, a
retomada usa `lerWorkspaceDeAutoria` com `view: "resume"`.

No Chatbot personalizado, mantenha **Pesquisa na Web** habilitada quando o
curso depender de editais, normas, produtos ou outras informações atuais.
Habilite também **Intérprete de código e Análise de Dados** para trabalhar com
PDFs, planilhas e outros anexos. Essas capacidades são configuradas no
construtor do GPT; a Action AraLearn cuida da leitura e da gravação dos cursos.

## O que acontece durante a conversa

O trabalho avança em etapas pequenas e decididas pela pessoa:

1. o assistente registra o contexto estável e salva o planejamento;
2. mostra as partes propostas e espera aprovação ou ajuste;
3. constrói somente uma parte aprovada, gravando uma microssequência por vez;
4. mostra microteorias, contagens de práticas, resources e termos e espera;
5. quando autorizado, audita a parte sem alterá-la e espera a decisão;
6. quando autorizado, repara somente os problemas escolhidos e espera;
7. quando autorizado, reaudita sem reparar e espera;
8. fixa uma revisão privada para submissão, distribui em Coleções ou avança
   para outra parte somente quando a pessoa pedir.

Cada etapa termina com o resultado real, o estado corrente e exatamente uma
próxima etapa sugerida. O assistente não executa essa sugestão na mesma
resposta. A pessoa pode pular auditoria ou reauditoria, rejeitar reparos,
aprovar apenas alguns deles e testar uma parte incompleta em Trilhas sem criar erro
artificial.

Depois que a ferramenta confirma o workspace e a estrutura inicial, o plano
aparece automaticamente em `Trilhas`. Não é preciso criar antes um plano vazio
no aplicativo. À medida que os cards são materializados, o mesmo item passa a
oferecer estudo; não surge uma segunda cópia do curso.

Planejar no chat e salvar no AraLearn são coisas diferentes. O assistente só
deve afirmar que uma estrutura ou um conteúdo foi salvo depois da confirmação
da ferramenta.

## Como fazer um bom pedido

Um pedido útil informa:

- quem vai estudar;
- qual resultado se espera;
- quais assuntos entram e quais ficam fora;
- quais materiais podem ser usados;
- idioma, notação ou convenções importantes;
- se a intenção é criar, complementar, reorganizar ou revisar.

Não é necessário escolher resources, escrever campos técnicos ou determinar a
quantidade de cards. O assistente seleciona representações adequadas, consulta
seus contratos e explica apenas decisões que realmente precisam de participação
humana.

Também não é necessário escrever um “prompt perfeito”. Uma descrição em
linguagem comum basta quando deixa claro o resultado desejado. Se alguma
informação não existir, diga isso diretamente — por exemplo, “não presuma
conhecimento prévio”. O assistente transforma o pedido em um `brief` curto e
mostra decisões conceituais; ids, revisões, JSON e nomes de ferramentas
continuam sendo responsabilidade da integração.

## Exemplo: formação profissional

```text
Quero criar um curso privado de segurança da informação para profissionais que
estão entrando numa equipe de operações. Use o programa de formação e os
materiais que anexei como fontes principais. Considere uma pessoa que já
conhece informática básica, mas precisa construir os pré-requisitos técnicos
antes das aplicações mais avançadas.

Primeiro verifique se há cursos ou partes acessíveis que possam ser
reaproveitados. Depois proponha uma árvore compacta de módulos, lições e
microteorias. Registre a estrutura planejada em lotes pequenos e produza uma
microssequência por vez, com teoria suficiente e práticas variadas. Mostre no
chat somente as microteorias e a quantidade de práticas. Assim que houver um
trecho coerente, avise que ele já pode ser testado em Trilhas.
```

O assistente pode pedir uma decisão sobre o recorte se o programa e os materiais
forem contraditórios. Ele não deve pedir que a pessoa escolha ids, revisions,
schemas ou nomes de operações.

## Como o curso é construído

### 1. Contexto

O assistente resume no `brief` somente público, objetivo, fontes, inclusões,
exclusões, idioma e notação que continuem válidos entre etapas. Esse contexto
orienta a autoria, mas não aparece como texto de bastidor nos cards do
estudante. Partes, decisões, mandatos e achados possuem registros próprios e
não são misturados ao `brief`.

Uma mudança de contexto estável substitui o `brief` inteiro depois de o
assistente reler seu valor corrente. Isso evita perder fontes ou limites ainda
válidos e impede usar a conversa como armazenamento implícito.

### 2. Estrutura planejada

O assistente usa `criarEstruturaNoWorkspace` para registrar lotes pequenos de
curso, módulos, lições e microssequências. As microssequências começam como
`planned` e sem cards.

Microssequência é a unidade técnica de gravação. Parte é a unidade da conversa
e pode reunir várias lições ou microssequências que façam sentido avaliar em
conjunto. O assistente não transforma cada microssequência em uma etapa para a
pessoa. Em cursos com centenas de cards, cerca de 6 a 10 partes substanciais é
uma heurística inicial, não um limite.

Depois que a pessoa aprova o plano, o assistente usa uma única
`record_approved_plan` para gravar atomicamente todas as Partes, decisões e o
mandato corrente. Cada Parte é uma lista ordenada dos ids exatos de suas
microssequências. Essa fronteira permite retomar “Parte 2” sem inferir o recorte
pelo título ou pelo chat e evita perder Partes se a sessão cair entre chamadas.
Operações unitárias servem a ajustes posteriores. A mesma ferramenta substitui
o contexto estável com `replace_stable_brief`, sempre depois de uma releitura.

O dimensionamento não parte de uma cota fixa de lições ou cards. O assistente
mapeia cada item substantivo da ementa e das fontes obrigatórias para tópicos
de lição e para `covers`, `checks` e `errors` verificáveis. Separa
microssequências quando mudam o vocabulário, as relações, as decisões ou a
forma de prática. Na ausência de indicação contrária, constrói os
pré-requisitos desde o início. O volume decorre da cobertura necessária, dos
erros prováveis, da complexidade das decisões e da recuperação espaçada.
Revisões integradas e transferência para o estilo da avaliação entram no
plano, mas uma prática nunca deve cobrar conceito ainda não ensinado.

Quando outro curso servir apenas de referência, o assistente lê o recorte
pertinente e registra no contexto somente as conclusões úteis. Para reaproveitar
literalmente uma parte, ele importa primeiro o curso acessível para o mesmo
workspace, relê a árvore importada e então copia ou move a parte. A raiz
temporária é excluída quando não fizer parte do resultado. A cópia precisa ser
revista no novo contexto: tópicos, dependências e guias não se tornam adequados
apenas porque o título é parecido.

Na conta editorial, a procura global usa poucos termos distintivos. Todos são
obrigatórios, mas podem ocorrer em campos diferentes: título ou objetivo do
curso, chave contratual, título ou descrição da coleção. O resultado é uma lista
leve de metadados; localizar um curso não carrega seu JSON. Depois da escolha, o
assistente lê primeiro a árvore compacta e somente as partes pertinentes.

Mover uma parte da cópia importada não altera o curso que foi consultado. Se a
pessoa pedir uma transferência entre dois cursos já publicados, o assistente
atualiza primeiro o curso de destino e, depois do sucesso, atualiza o curso de
origem sem a parte. Ele informa o estado intermediário e usa a revisão corrente
de cada publicação, evitando que uma falha deixe a única cópia indisponível.

Depois de salvar o plano, o chat mostra as partes, suas lições e
microssequências, objetivos, cobertura, dependências, faixa de práticas,
justificativa do dimensionamento e riscos. Em seguida sugere aprovação ou
ajuste e espera, sem começar a construir.

### 3. Microteoria e práticas

Antes de usar um resource pela primeira vez, o assistente consulta seu contrato.
Depois da aprovação, produz uma microssequência completa por chamada até
concluir somente a parte pedida:

- microteoria pequena e conceitualmente suficiente;
- exemplos ou representações necessários;
- práticas variadas que recuperam e aplicam a mesma ideia;
- respostas verificáveis e feedback específico.

`salvarCardsNaMicrossequencia` valida e salva o conjunto dessa unidade. O
assistente não tenta enviar um curso populado inteiro em uma única chamada e
também não obriga a pessoa a aprovar card por card.

Conteúdo recém-construído permanece normalmente `generated` ou
`needs_review`. `ready` significa que a pessoa aceitou o conteúdo corrente ou
deu ordem inequívoca para avançar; não é sinônimo de JSON válido.

### 4. Revisão conceitual

No chat, a visualização padrão apresenta:

- título e objetivo da microteoria;
- conteúdo conceitual consolidado;
- quantidade de práticas;
- resources relevantes e termos introduzidos;
- decisões conceituais ainda abertas.

As práticas permanecem no curso e podem ser examinadas sob demanda. Essa forma
de revisão economiza leitura sem esconder o que será estudado.

É possível pedir todas as práticas, uma amostra, apenas lacunas, apenas
alternativas, um resource, uma microssequência, um tópico ou um erro provável.
O assistente então relê os cards pedidos e apresenta título, enunciado,
representação suficiente, alternativas ou lacuna, resposta, feedback,
resource, tópicos e fontes em texto legível, sem depender da tela do app.

Para uma correção pontual, o assistente lista os cards da microssequência em
páginas leves, identifica o card pelo resumo e lê integralmente só esse card.
Depois salva a correção preservando o id. Essa operação conclui o reparo
atômico sem pedir uma chancela técnica adicional. Ao mover um card, origem e destino voltam para
revisão. Ao copiar, somente o destino volta. Renomear uma parte sem mudar seu
conteúdo não desfaz uma revisão.

Essa listagem atua em workspace. Um curso já publicado precisa primeiro ser
aberto ou importado para autoria; a publicação original permanece estável até
uma atualização explícita.

Ao abrir um workspace a partir de um curso publicado, o AraLearn reconhece
automaticamente qual publicação aquele curso deve continuar atualizando. Ao
importar um curso apenas como referência ou para copiar partes, a cópia não
ganha esse vínculo. Depois da primeira publicação de um curso novo, o vínculo
fica no workspace e pode ser retomado em outra conversa; não é preciso escolher
entre “criar” e “atualizar” nem copiar IDs técnicos.

### 5. Auditoria, reparo e reauditoria

Auditoria não é a mesma coisa que apresentação de microteorias. Quando a pessoa
a autoriza, o assistente relê a parte persistida e assume postura independente.
Ele examina cobertura, dimensionamento, autossuficiência, carga cognitiva,
linguagem sem bastidor, ancoragem das práticas, termos e siglas, relação entre
teoria e prática, resources, fontes e continuidade. Não altera conteúdo.

O relatório separa aspectos adequados de problemas e informa, para cada achado,
localização, tipo, impacto, gravidade, reparo recomendado e escopo. O reparo só
ocorre numa resposta posterior e apenas para os problemas aprovados. Depois, a
reauditoria relê o resultado para procurar resolução, regressões e novos
problemas; ela também não repara na mesma rodada.

Antes da auditoria, o assistente reúne tanto observações feitas durante o estudo
quanto notas situadas na árvore do workspace (`list_observations` com
`kinds: ["note"]`). Achados ativos já vêm na retomada; histórico de auditoria
usa `kinds: ["audit_finding"]`, estados e paginação. Registra achados compactos, grava
a decisão e o mandato humano, repara somente os achados aprovados, vincula a
correção apenas depois da escrita confirmada e então reaudita. O chat nunca é a
única fonte dessa autorização.

Se o reparo exigir mais de uma escrita ou a conversa for interrompida, o achado
continua aprovado e conserva somente o identificador e a revisão pendentes mais
recentes. A retomada apresenta esse par para que o alvo seja relido antes de
continuar ou confirmar o vínculo.

Cada autorização recebe um novo identificador de mandato. O mandato de
construção termina quando toda a Parte tem cards aceitos como `ready`; os de
auditoria e reestruturação são limpos ao concluir a rodada; cada vínculo de
correção retira o achado confirmado do mandato de reparo, e o último o encerra.
A reauditoria usa outro mandato de auditoria, com a Parte quando esse for o
recorte autorizado. Se a retomada indicar achados truncados, o
assistente percorre `list_observations` antes de reparar.

O vínculo de correção de um comentário de estudo é distinto do vínculo do
achado formal de auditoria; o assistente não intercambia essas duas operações.

### 6. Trilhas, submissão e catálogo

O conteúdo já pronto pode ser testado em Trilhas mesmo que outras unidades
continuem planejadas. “Publicado” significa apenas fixado para submissão ou
distribuído; não é condição para estudar. Testar a composição corrente não
publica nem copia o workspace. Para submeter, o
assistente fixa um artefato privado com hash; para distribuir, uma conta
editorial publica a revisão completa em Coleções. O fluxo completo é:

```text
autoria privada em Trilhas -> artefato privado -> submissão -> revisão administrativa -> Coleções
```

É sempre o mesmo assistente. O que muda são as capacidades da conta:

- uma conta autora constrói e testa conteúdo privado;
- uma conta habilitada pode submeter;
- uma conta administrativa pode revisar e devolver ajustes;
- uma conta editorial autorizada pode aprovar e publicar no catálogo.

O assistente não inventa permissões nem promete uma ação administrativa que a
conta conectada não possui.

Um pedido explícito para retirar de Trilhas um curso selecionado usa a seleção e
o hash acabados de ler. Se o curso veio de Coleções, somente a seleção daquela
conta é retirada. Um item cuja fonte seja o workspace não possui seleção: para
excluí-lo, o assistente relê a revisão e exclui a raiz do curso ou o workspace,
conforme o pedido. Um artefato submetido segue as regras da revisão editorial e
não transforma o workspace corrente numa categoria separada em Trilhas.

## Se alguma etapa falhar

Uma falha técnica não apaga o trabalho já confirmado e não significa que o
curso inteiro precisa ser planejado novamente.

| Situação | O que o assistente deve fazer |
| --- | --- |
| campo ou resource inválido | ler todos os caminhos do erro, corrigir somente o menor lote rejeitado e enviar o payload corrigido com um novo `requestId` |
| revisão mudou | reler o alvo e reaplicar apenas a alteração que ainda fizer sentido |
| estrutura grande demais | dividir a estrutura em lotes de até 40 entidades estruturais e salvar uma microssequência por vez |
| revisão conceitual grande demais | revisar uma lição ou microssequência por chamada e percorrer as lições sucessivamente |
| resposta perdida ou falha temporária | repetir exatamente a mesma chamada, sem duplicar conteúdo |
| conta sem capacidade administrativa | manter o curso privado e explicar qual etapa depende de outra conta |

Até uma ferramenta confirmar o sucesso, a formulação correta é “a proposta
está pronta para ser salva”, e não “o curso foi salvo”.

## Por que as instruções e o conhecimento são separados

O assistente recebe dois tipos de orientação:

- **instruções curtas** definem como conduzir a conversa, quando usar
  ferramentas e como reagir a falhas;
- **conhecimento sob demanda** traz somente as regras pertinentes ao pedido,
  como desenho de práticas, continuidade ou escolha de resources.

Esse funcionamento é uma forma leve de recuperação de conhecimento. Em vez de
carregar todo o manual em cada resposta, o AraLearn seleciona trechos pequenos
a partir da intenção e do nível estrutural. Em pedidos de criação, a seleção
sempre inclui:

- contrato operacional e brief;
- disciplina de fontes;
- materialização incremental;
- cobertura e dimensionamento;
- desenho da microteoria;
- desenho das práticas;
- escolha e consulta de resources.

O servidor recupera no máximo oito unidades pequenas e versionadas. O schema
exato de um resource é consultado no momento do uso. Assim, o assistente não
depende de memória para campos técnicos e a validação determinística continua
decidindo o que pode ser salvo.

## Pedidos úteis durante a continuação

Depois de iniciar o curso, a pessoa pode dizer:

- “Mostre as microteorias já produzidas e quantas práticas há em cada uma.”
- “A segunda microteoria pressupõe um conceito que ainda não foi apresentado;
  corrija a ordem.”
- “Reaproveite a lição equivalente do meu outro curso e adapte-a a este
  público.”
- “Avise quando a primeira lição já puder ser testada em Trilhas.”
- “Fixe a revisão corrente e envie-a para avaliação editorial.”
- “Aplique os ajustes devolvidos pela revisão administrativa.”

O assistente continua a partir do estado confirmado no AraLearn, sem exigir que
a pessoa repita toda a conversa.
