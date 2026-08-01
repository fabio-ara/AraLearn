# Observações pedagógicas nos cards

Durante o estudo, a pessoa pode registrar uma observação sem sair do card. O ícone de observação abre uma folha curta com cinco tipos:

- **Dúvida**: algo que a pessoa quer compreender melhor;
- **Possível erro**: informação que parece incorreta;
- **Confuso**: explicação, exemplo ou prática difícil de interpretar;
- **Sugestão**: proposta de melhoria do material;
- **Observação**: registro que não cabe nos tipos anteriores.

Escolher um tipo não classifica a aprendizagem nem produz nota. O texto tem até 1.000 caracteres. Salvar substitui a observação corrente daquele card; retirar apaga essa observação. O contador discreto indica apenas que existe um registro da própria pessoa no card atual.

## Da anotação ao retorno

A observação é gravada primeiro no dispositivo e sincronizada quando houver conexão. O conteúdo do card não é copiado e não há histórico das edições do texto. Mover ou renomear o card preserva o vínculo pela identidade estável; se ele for retirado do curso corrente, a Central o indica como indisponível.

Quando o curso pertence a um workspace educacional, a observação passa a compor a triagem desse espaço. A própria pessoa continua vendo somente seus registros. Proprietário, administrador, professor/autor e revisor podem consultar as observações do workspace, filtrar por tipo e estado e responder. A resposta e o estado corrente voltam ao dispositivo e aparecem na mesma folha do card.

Os estados são:

- **Aberta**: ainda não foi tratada;
- **Considerada**: foi lida ou recebeu resposta, mas não foi encerrada;
- **Resolvida**: houve encaminhamento sem alteração vinculada no curso;
- **Incorporada**: uma correção concluída foi vinculada à observação.

Responder não altera o curso. Para incorporar uma sugestão ou corrigir um erro, o responsável usa uma operação de autoria validada e só então vincula o identificador e o caminho desse reparo. O Chatbot e o Plugin seguem a mesma separação: primeiro leem e selecionam observações; depois, mediante pedido, corrigem o menor alvo; por fim, vinculam a correção que de fato foi gravada. Não existe reparo automático disparado por quantidade, categoria ou texto.

## Central e acesso

Em **Central → Em construção → workspace → Observações**, responsáveis encontram a triagem corrente. Estudantes não recebem acesso aos registros de colegas. O papel é local ao workspace e revalidado no servidor em cada leitura e escrita. A lista compartilhada requer conexão e não é guardada no cache da Central; a observação própria e o retorno já sincronizado continuam na réplica do dispositivo.

Para papéis de revisão, a Central também calcula, no momento da leitura, as contagens por tipo e estado e apresenta **Pontos de melhoria**: até vinte cards ordenados primeiro pela quantidade de observações abertas e depois pelo total. Cada item disponível abre o card corrente no modo de edição; um card retirado continua identificado, mas não desvia para outro conteúdo. A síntese considera o workspace inteiro, mesmo quando a página visível está filtrada. Ela não é uma tabela, um histórico nem outra cópia das observações; uma nova leitura recalcula o estado corrente. Para estudantes, a mesma resposta resume somente as próprias observações.

Quando o card ainda existe na réplica corrente, o ícone de edição da observação abre diretamente esse card no modo contextual. O atalho valida curso, módulo, lição, microssequência e card antes de navegar. Se qualquer nível tiver sido retirado ou substituído, o AraLearn mantém a triagem aberta e informa que o alvo mudou; não desvia silenciosamente para outro conteúdo.

Se um curso estiver ligado de forma inequívoca a um único workspace do qual a pessoa participa, a observação recebe esse vínculo ao ser criada. Um curso presente em vários workspaces não é associado por suposição: o registro permanece pessoal para evitar que um comentário apareça no contexto errado.

## Persistência e custo

Há uma linha corrente por pessoa e card. Além da categoria e do texto, o ciclo compartilhado acrescenta somente a identidade do workspace, o hash da revisão observada, resposta e resolução correntes e, quando aplicável, a referência compacta ao reparo. Não são guardadas cópias do card, do curso, da conversa, da resposta anterior, de cada mudança de estado nem dos agregados de triagem. Recibos idempotentes são pequenos e expiram com a janela operacional do workspace.

## Como interpretar

Uma observação é evidência qualitativa do que a pessoa decidiu registrar em um momento e contexto específicos. Pode orientar diálogo e revisão humana do material, mas não demonstra, isoladamente, erro do curso, dificuldade, atenção ou falta de domínio. A ausência de observações também não demonstra compreensão. Tipo, estado, resposta, quantidade, posição em **Pontos de melhoria** e tempo não devem virar ranking, nota ou indicador automático de aprendizagem ou de desempenho docente.

A hipótese de design é que uma manifestação curta e situada, seguida de retorno específico quando pertinente, ofereça agência com pouca interrupção do estudo. Ela deve ser avaliada por tarefas de uso, entrevistas e análise qualitativa. A literatura sobre feedback sustenta diálogo, interpretação e possibilidade de ação; não prova a eficácia específica desta implementação.

## Fundamentação

- Nicol, D. J., & Macfarlane-Dick, D. (2006). Formative assessment and self-regulated learning: a model and seven principles of good feedback practice. *Studies in Higher Education, 31*(2), 199–218. <https://doi.org/10.1080/03075070600572090>
- Shute, V. J. (2008). Focus on formative feedback. *Review of Educational Research, 78*(1), 153–189. <https://doi.org/10.3102/0034654307313795>
- Carless, D., & Boud, D. (2018). The development of student feedback literacy: enabling uptake of feedback. *Assessment & Evaluation in Higher Education, 43*(8), 1315–1325. <https://doi.org/10.1080/02602938.2018.1463354>
- Nicol, D., & Kushwah, L. (2024). Shifting feedback agency to students by having them write their own feedback comments. *Assessment & Evaluation in Higher Education, 49*(3), 419–439. <https://doi.org/10.1080/02602938.2023.2265080>
- Wood, J. (2021). A dialogic technology-mediated model of feedback uptake and literacy. *Assessment & Evaluation in Higher Education, 46*(8), 1173–1190. <https://doi.org/10.1080/02602938.2020.1852174>

Os limites e a primeira medição do recorte pessoal permanecem no [registro de evidência](evidence/situated-personal-comments-stage-2026-08-01.json). O [orçamento do ciclo compartilhado](evidence/workspace-pedagogical-comments-storage-budget-2026-08-01.json) mede 440 bytes para uma observação representativa já respondida e ligada a uma correção e estima 22,46 MiB, com margens para índices, para 10.000 observações correntes e 2.000 recibos na janela de sete dias. O valor não representa o consumo total do projeto.
