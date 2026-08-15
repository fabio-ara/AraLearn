# Criar cursos pelo chat

Este guia conduz a criação de um curso por uma integração de autoria do
AraLearn. A pessoa descreve público, finalidade, escopo e fontes em linguagem
comum; o assistente organiza a estrutura técnica, consulta os contratos das
representações e grava o trabalho no workspace.

O objetivo não é obter um curso completo numa única resposta. Um curso é
planejado, produzido e revisto em partes para que decisões pedagógicas possam
ser avaliadas antes que erros se propaguem.

## Pré-requisitos

Antes de começar, confirme:

- uma conta autenticada no AraLearn;
- uma integração de autoria configurada para a mesma instância;
- autorização para criar conteúdo privado;
- fontes ou critérios claros quando o curso depender de programa oficial,
  norma ou material externo;
- pesquisa na web habilitada no cliente quando forem necessárias informações
  atuais;
- processamento de anexos habilitado quando houver PDF, planilha ou outro
  arquivo.

Capacidades de submissão, revisão e publicação são adicionais. É possível
construir e testar um curso privado sem elas.

## O que informar no primeiro pedido

Quando essas informações ainda não estiverem nas fontes, no curso ou no
workspace, um pedido inicial útil pode informar, em linguagem comum:

1. quem estudará;
2. qual desempenho se espera ao final;
3. o que entra e o que fica fora;
4. quais fontes têm prioridade;
5. que conhecimento prévio pode ser comprovadamente presumido;
6. qual idioma, notação ou convenção precisa ser preservado;
7. se a tarefa cria, complementa, reorganiza ou revisa um curso.

Essa lista é uma ajuda para formular o pedido, não um questionário obrigatório.
O assistente consulta primeiro o contexto disponível e só pede uma informação
ausente quando a resposta puder mudar materialmente objetivo, escopo,
pré-requisito, sequência, representação, prática ou dependência de outro meio.

Não determine uma quantidade arbitrária de cards nem escolha recursos visuais
sem necessidade. O planejamento deve derivar o volume da cobertura, dos
pré-requisitos, dos erros prováveis e das práticas adequadas.

Exemplo:

```text
Crie um curso privado de segurança da informação para profissionais que estão
entrando numa equipe de operações. Use o programa e os materiais anexados como
fontes principais. Considere que a pessoa conhece informática básica, mas não
pressuponha os conceitos técnicos do programa.

Primeiro proponha a estrutura e explique como os pré-requisitos serão
introduzidos. Depois da minha aprovação, produza uma parte por vez. A teoria
deve ser autocontida e progressiva, sem resumir conceitos diferentes no mesmo
card. As práticas devem ser abundantes e variar conforme a operação cognitiva.
Avise quando houver uma unidade coerente disponível para teste em Trilhas.
```

Não é necessário escrever JSON, identificar ferramentas ou conhecer a versão
dos contratos.

## Etapa 1 — delimitar o contexto

O assistente transforma o pedido num **brief**, isto é, um registro curto do
contexto que deve permanecer estável entre as etapas. Ele inclui público,
objetivo, fontes, inclusões, exclusões, idioma e notação.

Antes de perguntar ou propor o desenho, o assistente relê o brief, as fontes, o
curso e as decisões registradas. Se uma lacuna não alterar o desenho, ela não
justifica interromper a autoria. Se alterar, a pergunta deve explicitar qual
decisão depende da resposta, sem aplicar um roteiro fixo.

Verifique se:

- o público está descrito por conhecimentos e necessidades, não por rótulo
  genérico;
- o objetivo informa o que a pessoa deverá compreender ou fazer;
- o recorte distingue conteúdo obrigatório de conteúdo apenas relacionado;
- fontes atuais foram realmente consultadas;
- lacunas de informação foram declaradas, em vez de preenchidas por suposição.

O diagnóstico contextual que orientará o planejamento distingue:

- **condições de aprendizagem**: fatos ou hipóteses explícitas sobre público,
  conhecimentos presumíveis, convenções e meios disponíveis;
- **exigências do conteúdo**: operações, relações e pré-requisitos impostos pelo
  objeto de estudo;
- **dificuldades previstas**: hipóteses revisáveis sobre onde essas exigências
  podem criar obstáculo nas condições declaradas;
- **respostas de desenho**: decisões locais propostas para enfrentar cada
  dificuldade numa microssequência.

O brief e o diagnóstico não aparecem como texto para o estudante. Eles orientam
a autoria, mas não constituem medição de capacidade, perfil individual ou
predição de aprendizagem. A pessoa autora confirma as condições e julga as
hipóteses; o assistente não substitui responsabilidade disciplinar ou
pedagógica.

Resultado esperado: contexto estável, lacunas materiais identificadas e
contradições relevantes resolvidas antes do planejamento detalhado.

## Etapa 2 — planejar a progressão

O assistente propõe módulos, lições e microssequências. Uma boa proposta
explicita:

- objetivo de cada unidade;
- conceitos e relações cobertos;
- pré-requisitos;
- condições e exigências pertinentes a cada microssequência;
- dificuldades previstas e a resposta de desenho ligada a cada uma;
- erros ou confusões que a prática poderá tornar observáveis;
- tipos de prática previstos;
- razão para separar ou reunir os assuntos;
- fontes que sustentam o recorte.

A decisão pedagógica é local: a existência de uma condição contextual não
prescreve o mesmo estilo para o curso inteiro. Cada microssequência seleciona
explicação, exemplo, representação, prática e apoio conforme seu objetivo e as
dificuldades aprovadas. Não existe uma calibração pedagógica global que dispense
esse julgamento.

A unidade central de produção é a microssequência. Ela deve ensinar um avanço
conceitual delimitado e praticá-lo. “Delimitado” não significa resumido: uma
explicação difícil pode ocupar vários cards, desde a aproximação concreta até a
formalização.

Não há cota fixa de cards. Uma unidade é decomposta quando precisaria concentrar
conceitos, dependências, decisões ou formas de prática que exigem progressões
próprias. Se a ferramenta recusar o tamanho do payload, a divisão respeita o
menor limite causal. A quantidade resultante é consequência pedagógica
aceitável; omitir etapas para reduzir custo não é.

Analise a proposta, inclusive os vínculos dificuldade–resposta, e responda com
aprovação ou ajustes. O assistente não deve começar a produção na mesma resposta
em que pede essa decisão.

Resultado esperado: árvore planejada, dividida em partes de revisão
compreensíveis e visível como plano em Trilhas.

## Etapa 3 — verificar possibilidades de reaproveitamento

Quando houver cursos acessíveis sobre tema semelhante, o assistente pode
consultá-los antes de produzir. Localizar um curso carrega primeiro metadados e
uma árvore compacta; o conteúdo integral só é lido quando uma parte realmente
servirá de referência.

Há duas operações diferentes:

- **usar como referência:** extrair conclusões e registrar as fontes;
- **copiar uma parte:** criar uma subárvore independente, com novas
  identidades, e adaptá-la ao novo público e à nova progressão.

Título parecido não comprova adequação. Uma parte copiada precisa ser revista
quanto a pré-requisitos, terminologia, fontes, dependências e práticas. Mover
uma parte entre cursos deve preservar primeiro o destino e somente depois
retirá-la da origem, para não deixar a única cópia indisponível em caso de
falha.

Resultado esperado: decisão explícita sobre o que será reaproveitado e por
quê.

## Etapa 4 — produzir uma parte

Depois da aprovação, o assistente materializa uma microssequência completa por
vez. Para cada uma, deve produzir:

- microteoria suficiente e progressiva;
- exemplos ou representações que reduzam a dificuldade pertinente;
- práticas que recuperem, discriminem e apliquem a ideia ensinada;
- respostas verificáveis;
- feedback que explique a decisão, não apenas “correto” ou “incorreto”;
- tópicos, dependências e fontes.

Quando uma representação especializada for necessária, o assistente consulta
o catálogo, compara candidatos e carrega o contrato exato antes de construir o
card. Se não houver opção ideal, pode usar o melhor substituto, mas deve
informar brevemente a limitação.

Práticas não são variadas por ornamentação. Lacuna, digitação, escolha,
ordenação e outras respostas devem corresponder à operação cognitiva desejada.
Um diagrama só entra quando sua estrutura torna uma relação mais direta do que
texto ou tabela.

Resultado esperado: parte salva, validada e estudável em Trilhas. O assistente
só deve dizer que foi salva depois da confirmação do AraLearn.

## Etapa 5 — revisar o conteúdo

A apresentação padrão de revisão resume:

- título e objetivo das microteorias;
- explicação conceitual consolidada;
- quantidade e variedade das práticas;
- representações usadas;
- termos introduzidos;
- decisões ainda abertas.

As práticas continuam no curso e podem ser solicitadas integralmente ou por
amostra. Pedidos úteis:

- “Mostre as práticas que verificam a diferença entre os dois conceitos.”
- “Mostre a resposta e o feedback deste card.”
- “Liste as siglas introduzidas e onde foram explicadas.”
- “Verifique se alguma prática cobra conteúdo ainda não ensinado.”
- “Mostre como este diagrama deve ser lido e por que foi escolhido.”

Uma correção pontual deve reler o card canônico e preservar sua identidade. O
resumo exibido no chat não é uma segunda cópia autorizada do conteúdo.

Resultado esperado: aprovação consciente do recorte e identificação de
problemas que exigem auditoria ou reparo.

## Etapa 6 — auditar

Auditoria é uma rodada somente para leitura. Ela examina:

- cobertura do escopo;
- rastreabilidade entre diagnóstico, plano e cards materializados;
- respostas de desenho prometidas, mas ausentes;
- progressão e pré-requisitos;
- densidade dos cards de teoria;
- prática introduzida antes da fundamentação necessária;
- ligação entre teoria, prática e feedback;
- terminologia, siglas e ausência de vocabulário de bastidor;
- pertinência, convenção e legibilidade das representações;
- variedade funcional das práticas;
- qualidade e procedência das fontes;
- continuidade com as partes vizinhas;
- perdas de cobertura causadas por uma resposta local;
- dependências de laboratório, sistema ou outro meio externo indisponível.

Cada achado deve informar localização, tipo, impacto, gravidade e reparo
recomendado. O assistente não corrige na mesma rodada. A pessoa aprova, rejeita
ou restringe os reparos.

Observações registradas durante o estudo também podem orientar a auditoria,
mas uma dúvida de estudante e um achado formal continuam sendo registros
diferentes.

Resultado esperado: relatório localizado e nenhuma mudança de conteúdo.

## Etapa 7 — reparar e reauditar

Na rodada seguinte, o assistente corrige somente os achados autorizados. Cada
correção é ligada ao achado depois da gravação confirmada. Se a sessão for
interrompida, o estado persistido permite retomar o alvo e sua revisão.

A reauditoria relê o resultado e procura:

- resolução do problema original;
- regressões introduzidas pelo reparo;
- novos problemas tornados visíveis pela mudança.

Ela também é somente para leitura. Essa separação evita que uma correção seja
considerada adequada apenas porque conseguiu ser gerada.

Resultado esperado: problemas autorizados resolvidos ou explicitamente
mantidos, com resultado reavaliado.

## Etapa 8 — testar em Trilhas

Uma parte válida pode ser estudada antes de o curso estar completo. Abra o
plano em Trilhas e teste:

- clareza da microteoria na largura de celular;
- navegação pelo botão principal;
- lacunas e campos de digitação dentro do objeto correto;
- legibilidade de diagramas complexos e rolagem interna;
- feedback de respostas corretas e incorretas;
- retomada e funcionamento sem conexão.

Registrar uma observação no card cria um retorno situado para a autoria. Testar
o workspace não o publica em Coleções e não cria uma segunda cópia.

Resultado esperado: evidência de funcionamento e observações humanas para o
próximo ciclo. Um teste individual não demonstra eficácia pedagógica geral.

## Etapa 9 — submeter ou publicar

Quando a revisão estiver pronta:

1. fixe um artefato privado da composição corrente;
2. confirme o hash e a abrangência;
3. submeta-o à avaliação editorial, se a conta possuir essa capacidade;
4. responda a pedidos de ajustes criando nova revisão;
5. publique em Coleções somente depois da decisão editorial autorizada.

Conteúdo incompleto pode continuar privado e estudável, mas o catálogo oficial
aceita somente uma composição completa. A equipe editorial recebe o artefato
submetido, não toda a biblioteca privada.

O ciclo detalhado está em [Autoria e publicação do
catálogo](autoria-do-catalogo.md).

## Como retomar em outra conversa

Uma nova sessão deve começar lendo a retomada compacta do workspace: brief,
condições confirmadas, diagnósticos e respostas aprovados, estrutura, partes,
decisões, achados e revisões pendentes. O curso não depende de o modelo recordar
mensagens anteriores.

Persistem somente informações aprovadas e úteis para continuar ou auditar o
trabalho. O raciocínio privado do modelo e o transcript integral do diálogo não
fazem parte desse estado; justificativas necessárias à revisão devem aparecer
como decisões explícitas e inspecionáveis.

Pedidos de retomada úteis:

- “Leia o estado corrente e mostre a próxima parte não materializada.”
- “Retome os achados aprovados ainda sem correção confirmada.”
- “Mostre o plano aprovado e as mudanças posteriores.”
- “Continue a partir da primeira microssequência incompleta.”

Se o assistente não leu o estado persistido, não deve afirmar que sabe onde a
sessão anterior parou.

## Recuperação de falhas

| Situação | Procedimento |
| --- | --- |
| contrato ou campo inválido | consultar o diagnóstico e corrigir somente o menor lote rejeitado |
| revisão mudou | reler o alvo antes de reaplicar a intenção |
| resposta de rede se perdeu | repetir a mesma tentativa idempotente |
| parte grande demais | dividir por microssequência ou por unidade de decisão |
| fonte contraditória | pedir uma decisão de escopo, sem escolher silenciosamente |
| conta sem capacidade editorial | manter o curso privado e informar a dependência |
| conversa encerrada | retomar pelo workspace, não reconstruir pela memória |

Até receber confirmação, a formulação correta é “a proposta está pronta para
ser salva”, não “o curso foi salvo”.

## Por que o processo é incremental

Produção integral em uma única chamada parece mais rápida, mas dificulta
detectar premissas ocultas, propaga decisões ruins e torna caro refazer grandes
trechos. A produção incremental cria pontos de revisão sem impedir o estudo
precoce.

O custo também fica subordinado ao planejamento: primeiro se determina a
sequência pedagogicamente adequada; depois se geram os contratos necessários.
Economia é obtida por contexto seletivo, persistência por partes e
reaproveitamento consciente, não pela redução arbitrária da teoria ou da
prática.

Para compreender a integração técnica usada por este guia, leia [Autoria por
Model Context Protocol](autoria-mcp.md). Para compreender por que instruções,
conhecimento recuperado e schemas são separados, leia [Fluxos, instruções e
contratos](fluxos-prompts-e-contratos.md).
