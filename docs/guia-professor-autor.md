# Guia do professor e autor

No AraLearn, autoria compreende decisões pedagógicas, produção de conteúdo,
revisão e manutenção. O professor ou autor continua responsável por essas
decisões mesmo quando utiliza assistência de linguagem. Este guia distingue
correções locais, mudanças estruturais, triagem de observações e publicação.

## Antes de editar: diagnosticar a dimensão do problema

Escolha a menor unidade que permita resolver o problema sem perder contexto:

| Problema observado | Unidade inicial recomendada |
| --- | --- |
| erro de digitação, rótulo ou frase | campo textual ou instância de recurso |
| representação inadequada ou feedback incoerente | card inteiro |
| falta de prática para um objetivo já ensinado | microssequência |
| progressão incompleta entre objetivos | lição |
| lacuna ampla de programa ou reorganização | workspace de autoria |

Trabalhar no menor escopo reduz alterações acidentais e torna a revisão mais
clara. Isso não significa corrigir um sintoma isolado quando o problema é
pedagógico: se um card pressupõe conceitos ainda não ensinados, pode ser
necessário revisar a microssequência ou a lição.

## Corrigir um texto manualmente

**Pré-condição:** a conta precisa possuir capacidade de escrita sobre o conteúdo.

**Passos:**

1. Abra o curso e navegue até o card.
2. Ative **Editar**.
3. Selecione a instância de recurso pelo contorno.
4. Altere os campos textuais apresentados.
5. Salve e volte a **Visualizar** para conferir a representação final.

**Resultado esperado:** textos visíveis, como título, parágrafo, rótulo, célula, código
ou feedback autorizado, são modificados sem expor o documento estrutural do
card. Tipos, identidades, relações, ordem e critérios de correção continuam
protegidos.

**Sem conexão:** uma edição textual em curso de workspace já carregado pode ser
guardada na fila local. Mudanças estruturais e publicação continuam exigindo o
servidor.

**Recuperação:** se o mesmo texto tiver mudado remotamente, escolha
explicitamente entre **Manter meu texto** e **Descartar alterações locais**.
Depois, revise o card em modo de visualização; não confirme apenas pela
aparência do campo de edição.

## Corrigir com assistência de linguagem

**Pré-condição:** configure um provedor, mantenha conexão e selecione somente os
alvos que o serviço pode alterar.

**Passos:**

1. Ative **IA**.
2. Selecione uma ou mais instâncias do recurso, o card ou o contêiner permitido.
3. Descreva o problema, o resultado esperado e o que deve ser preservado.
4. Envie o pedido.
5. Examine tanto a alteração quanto a explicação.
6. Continue a conversa para ajustar o resultado ou use **Desfazer**.

**Resultado esperado:** o contexto de leitura ajuda o modelo a interpretar o alvo, mas a
resposta só pode gravar os campos autorizados e precisa satisfazer os contratos
do curso. Uma mudança semanticamente relevante em uma prática limpa um
resultado anterior que deixaria de ser confiável.

**Sem conexão:** um provedor remoto não pode responder. O conteúdo anterior
permanece utilizável.

**Recuperação:** se a resposta for inválida, nenhuma alteração parcial deve ser
aceita. Reduza o escopo, explicite um critério verificável e tente novamente.
Se a nova versão estiver formalmente correta mas pedagogicamente pior,
desfaça-a; validação estrutural não substitui julgamento didático.

Diretrizes de interação humano-IA recomendam comunicar escopo e limitações,
permitir correção eficiente e apoiar recuperação de erros
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). O uso educacional também exige supervisão humana e
atenção a vieses, privacidade e adequação contextual ([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

## Acrescentar cards ou uma microssequência

**Pré-condição:** a conta precisa possuir capacidade no contêiner e a assistência
deve estar configurada.

**Passos:**

1. Abra a microssequência ou a lição em modo **IA**.
2. Selecione o contêiner integral autorizado.
3. Informe o objetivo pedagógico ausente, o conhecimento já ensinado e os
   gestos de prática necessários.
4. Solicite a criação.
5. Revise ordem, transições, carga informacional e feedback de cada novo card.

**Resultado esperado:** o escopo de microssequência pode acrescentar cards dentro dela;
o escopo integral de lição pode acrescentar, no máximo, uma microssequência por
operação. A limitação mantém a intervenção revisável e reserva reorganizações
maiores ao workspace.

**Sem conexão:** a criação estrutural não é concluída, pois depende da
assistência configurada e da confirmação do servidor. Preserve o planejamento
local e retome a operação quando a conexão voltar.

**Recuperação:** se o problema atravessar várias lições ou módulos, interrompa a
correção local e passe ao planejamento estrutural. Encadear muitas operações
locais para simular uma reorganização ampla aumenta o risco de incoerência.

## Planejar ou reorganizar um curso

Uma mudança ampla utiliza um workspace: composição mutável que conserva cursos,
módulos, lições, microssequências e cards como partes identificáveis. O
workspace permite materializar por etapas, examinar o que já existe e continuar
em outra sessão sem depender do histórico completo da conversa.

**Pré-condição:** configure uma integração externa de autoria no painel e
autorize sua conta. A superfície **Plugin** atende clientes compatíveis com o
Model Context Protocol (MCP), protocolo que permite a uma ferramenta solicitar
operações estruturadas; a autorização usa OAuth, fluxo em que a pessoa concede
acesso sem entregar sua senha ao cliente.

**Passos:**

1. Pela conversa externa, crie ou abra o workspace.
2. Defina público, finalidade, escopo, profundidade e fontes.
3. Registre a progressão antes de produzir os cards.
4. Divida o trabalho em partes pequenas e ordenadas.
5. Materialize uma microssequência por vez.
6. Depois de cada parte, audite conteúdo, pré-requisitos, recursos, práticas e
   feedback.
7. Repare os achados aprovados e reavalie.
8. Abra o mesmo item em Trilhas para testar a experiência real de estudo.

**Resultado esperado:** o conteúdo já materializado pode ser estudado sem esperar uma
categoria burocrática de “pronto”. O planejamento corrente indica o que ainda
falta; a ausência de partes futuras não torna ilegíveis as partes existentes.

**Sem conexão:** a composição já replicada pode ser lida e receber correções
textuais locais permitidas. Planejamento conversacional, reorganização e
publicação dependem do servidor.

**Recuperação:** retome pelo estado compacto do workspace, releia a parte atual
e confirme a revisão antes de continuar. Não use a lembrança da conversa como
única fonte do planejamento.

O procedimento completo está em [Criar cursos pelo
chat](criar-cursos-pelo-chat.md).

## Escolher e revisar recursos de representação

Um recurso especializado deve corresponder à operação intelectual exigida. Não
se escolhe um grafo, uma matriz ou um diagrama apenas para variar a aparência.

Ao revisar um card, pergunte:

1. A representação torna visível uma relação que a prosa esconderia?
2. Ela segue convenções reconhecíveis na área de conhecimento?
3. O estudante recebeu contexto suficiente para interpretá-la sem decifrar a
   interface?
4. Rótulos, linhas, cores e legendas continuam inequívocos no celular?
5. A prática ocorre dentro do objeto relevante, e não em uma lacuna genérica no
   enunciado?
6. Cada campo interativo é independente e possui resposta própria?
7. A representação continua legível com conteúdo mais complexo que o exemplo
   mínimo?

Múltiplas representações podem complementar-se quando suas relações são
explicitadas; apresentá-las sem coordenação pode acrescentar esforço
desnecessário ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)). Consulte [Recursos de
card](recursos-de-card.md).

## Tratar uma observação pedagógica

**Pré-condição:** a observação deve pertencer a um workspace em que a conta possa
fazer triagem.

**Passos:**

1. Abra o detalhe do workspace em Trilhas.
2. Consulte as observações e filtre quando necessário.
3. Leia o card exato antes de interpretar o texto.
4. Responda ou marque a observação como considerada quando ainda houver trabalho.
5. Se houver correção, execute uma operação de autoria separada.
6. Depois de verificar a gravação, vincule a correção à observação e marque-a
   como incorporada.

**Resultado esperado:** resposta, estado e eventual referência ao reparo retornam à
pessoa que registrou a observação. Responder não altera o curso; mudar o curso
não encerra automaticamente a observação.

**Sem conexão:** a fila compartilhada requer rede. A pessoa que estuda continua
vendo seu texto local e o último retorno sincronizado.

**Recuperação:** se o card não existir mais, mantenha o registro como alvo
indisponível. Não o redirecione por semelhança de título.

Feedback é um processo de interpretação e ação, não apenas informação entregue
ao estudante ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). Isso fundamenta
a separação entre manifestação, resposta, correção e verificação, mas não prova
a eficácia desta interface específica.

## Publicar

**Pré-condição:** distribuir uma revisão para acesso restrito ou em Coleções
exige capacidade de publicação no workspace; entrada no catálogo exige também
capacidade editorial da aplicação.

**Passos:**

1. Teste o curso em Trilhas.
2. Confirme que o planejamento, a auditoria e as correções pertinentes estão
   registrados.
3. Selecione a composição e a revisão exatas.
4. Solicite a publicação no destino autorizado.
5. Verifique a publicação resultante como leitor.

**Resultado esperado:** a revisão distribuída é imutável. Novas correções produzem outra
revisão da mesma identidade de curso, em vez de alterar silenciosamente o
artefato já distribuído.

**Sem conexão:** não é possível publicar.

**Recuperação:** se a revisão corrente tiver avançado, releia as mudanças e
repita a decisão sobre a nova revisão; o servidor não combina concorrência de
modo silencioso.

## O que não deve ser inferido sobre estudantes

Cursor, conclusão estrutural, **Rever**, observação e data de atualização não
medem atenção, frequência, dificuldade ou aprendizagem. Não construa ranking ou
nota a partir desses estados. A distinção entre dado funcional e construto
educacional está em [Estado de estudo não
punitivo](estado-de-estudo-nao-punitivo.md).

## Leituras relacionadas

- [Workspaces educacionais](workspaces-educacionais.md)
- [Observações pedagógicas](observacoes-pedagogicas.md)
- [Autoria e publicação](autoria-do-catalogo.md)
- [Assistência por IA](assistencia-por-ia.md)
- [Fluxos, prompts e contratos](fluxos-prompts-e-contratos.md)
