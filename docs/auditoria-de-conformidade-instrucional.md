# Revisão e correções do curso

Revisar um curso significa inspecionar o conteúdo salvo, localizar um problema
factual, pedagógico ou editorial e examinar o percurso necessário para corrigi-lo.
O apontamento pode estar na
explicação compartilhada por uma microssequência ou numa unidade de estudo e
envolver também suas fontes e observações. O [modelo
didático](modelo-didatico.md) distingue a base explicativa da sequência de
atividades e explicações que a mobiliza durante o estudo.

A assistência de inteligência artificial (IA) pode comparar versões, analisar
fontes, propor correções e registrar uma inspeção do material salvo. A pessoa
autora orienta o trabalho, autoriza seu alcance e decide as questões ainda
abertas. A [declaração de revisão humana](explicacao-e-revisao-humana.md)
registra quando ela própria examinou o conteúdo. O parecer da IA mantém sua
identidade e seu alcance, mesmo quando todo o trabalho de correção foi
autorizado antecipadamente.

## O ciclo de revisão

1. Inspecione a explicação ou unidade e suas fontes.
2. Registre ou consulte as observações pertinentes.
3. Prepare a revisão, incluindo os pontos do percurso que podem ser afetados.
4. Examine a proposta e resolva as decisões ainda abertas.
5. Aplique as correções autorizadas e releia o resultado e a fila.
6. Decida quais incidências das observações foram atendidas ou podem ser encerradas.
7. Declare a revisão quando tiver concluído sua inspeção.

Uma [observação](observacoes-pedagogicas.md) registra um apontamento sem alterar
o conteúdo. Um apontamento pode alcançar uma explicação e várias unidades;
cada relação com um desses alvos constitui uma incidência. Selecionar várias
unidades cria uma única observação com várias incidências. Editar seu texto
atualiza a versão da mesma observação, preservando sua identidade e a
pendência. A versão do conjunto de alvos também é conferida ao decidir sobre
ela, para que a decisão corresponda ao conjunto inspecionado.

Antes de propor mudanças, o assistente usa `preparar_revisao` para reler o
conteúdo, as observações abertas e o contexto pedagógico pertinente. Quando a
resposta é paginada, precisa terminar as continuações necessárias à análise.
A proposta identifica o problema e o conjunto que precisa mudar. Correções já
incluídas no pedido podem prosseguir; uma decisão substantiva ainda não
autorizada volta à pessoa autora.

## Contexto pedagogicamente afetado

O alcance da análise acompanha as dependências do problema. Uma mudança pode
exigir reler unidades anteriores e posteriores quando elas preparam ou usam a
explicação alterada. Fontes e parâmetros do recorte também entram nessa
conferência.

O assistente deve propor o menor conjunto coerente de mudanças. Unidades lidas
como contexto podem permanecer intactas; outras podem precisar de nova
transição ou de outra distribuição do conteúdo. A escrita continua limitada ao
que a pessoa autora autorizou, ainda que a análise tenha precisado ler um trecho
maior.

## Julgamento e validação técnica

O servidor verifica se a escrita tem estrutura e referências válidas, está
autorizada e ainda se refere à versão lida. Essas regras impedem algumas
gravações indevidas. A adequação do conteúdo, porém, depende da análise do
material e de suas fontes.

Uma representação aceita pelo contrato ainda pode condensar uma relação que
precisa ser ensinada. Por exemplo, um cálculo de média pode mostrar a divisão
correta sem explicar por que o total é dividido pela quantidade de observações.
A revisão localiza essa relação implícita e examina sua função na sequência.
Na prática de consolidação, a relação precisa ter sido desenvolvida ou estar
assumida como pré-requisito. Uma tentativa exploratória pode pedir uma previsão
antes desse ensino: nesse caso, o estudante precisa compreender a situação, os
dados e a pergunta, e o ensino posterior precisa retomar o alvo investigado.
A inspeção confere essas condições conforme a
[função da prática](modelo-didatico.md#suficiência-teórica-no-percurso), sem
contar a tentativa inicial como ensino. A escolha de
[componentes didáticos](componentes-didaticos.md) atende à função do conteúdo;
não há quantidade obrigatória de formatos diferentes.

## Inspeção por IA sobre o conteúdo salvo

A inspeção compara aquilo que o curso pretende ensinar com o que o estudante
encontra. Cada unidade e cada explicação recebe um parecer próprio. A base da
leitura reúne o alvo e o percurso pertinente, incluindo a ordem das unidades,
a [configuração aplicada](desenho-instrucional-parametrizado.md#contexto-efetivo-e-aplicação-corrente)
— as escolhas pedagógicas usadas na produção — e as fontes utilizadas. Na explicação, a análise
alcança também as práticas e os retornos das unidades da microssequência.

O contrato registra seis dimensões:

| Dimensão | Pergunta de inspeção |
| --- | --- |
| Alinhamento (`alignment`) | A operação solicitada corresponde ao objetivo e aos requisitos do recorte? |
| Evidência (`evidence`) | A resposta recolhida permite observar o que a tarefa pretende examinar? |
| Representação (`representation`) | A notação e a composição preservam as relações necessárias? |
| Retorno (`feedback`) | A pessoa encontra explicação da resposta e apoio para compreender erros plausíveis? |
| Suficiência (`sufficiency`) | O material oferece contexto e desenvolvimento adequados à tarefa e ao público? |
| Configuração (`configuration`) | As escolhas pedagógicas aplicadas se realizam no conteúdo e na sequência? |

Cada dimensão recebe julgamento, justificativa e de um a seis trechos presentes
na base inspecionada. O serviço confere a presença textual desses trechos,
normalizando espaços, caixa e composição Unicode. Copiar a evidência da própria
leitura evita substituir o trecho por uma paráfrase que o contrato recusará. A
qualidade da inferência ainda depende da análise: encontrar as palavras
confirma sua origem, enquanto a justificativa explica o que elas demonstram.

As citações também são confrontadas com as
[âncoras](fontes-e-citacoes.md), localizações das passagens escolhidas em cada
vínculo com uma fonte.
A obra pode ser pertinente ao tema e ainda sustentar insuficientemente uma
afirmação específica. Uma localização apenas por página exige abrir a passagem
ou registrar o limite de verificação. Lacunas de sustentação permanecem como
pendências do parecer.

O resultado `consistent` indica que a inspeção registrada considerou o recorte
consistente e exige uma lista de pendências vazia. `needs_attention` registra
pontos a tratar; qualquer dimensão `insufficient` exige esse resultado. A opção
`human_preference_retained` registra a preservação de uma escolha humana,
explicitando-a no parecer e conservando a exigência de tratar insuficiências.
`not_applicable` precisa de uma razão de inaplicabilidade. Alinhamento,
representação e suficiência sempre recebem julgamento; havendo prática,
evidência e retorno também são examinados. Na dimensão de configuração, falta
de evidência relevante exige apontar a insuficiência.

A validade temporal do parecer é outro dado. `current` informa que ele ainda
corresponde à base salva, inclusive quando contém ressalvas. Uma mudança
relevante torna necessária nova inspeção. Como a ordem das unidades integra a
base, reordená-las também altera essa validade. Uma referência de inspeção
emitida antes da mudança deve ser substituída por uma nova leitura. A declaração
humana permanece separada, e resultados de aprendizagem exigem observação do
estudante.

O [domínio da auditoria](../src/domain/coursePedagogicalAudit.js) contém as
regras dos seis juízos e os diagnósticos objetivos. Os
[testes de inspeção](../tests/runtime/course-pedagogical-audit.test.js) cobrem
recusa de evidência ausente e contradições no parecer. A
[base ordenada](../supabase/migrations/20260930010000_pedagogical_basis_study_order.sql)
explicita como a posição de estudo participa da identificação do conteúdo
inspecionado. O fluxo de leitura, registro e recuperação está em
[Autoria por MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md).

## Fontes e contestação

A revisão apresenta a referência da fonte, seu papel e a localização do trecho
pertinente. Uma fonte pode sustentar uma afirmação, contextualizá-la, contrastar
uma posição ou fornecer um exemplo. O vínculo precisa expressar o uso feito
naquele conteúdo, conforme [Fontes, citações e referências](fontes-e-citacoes.md).

A pessoa pode corrigir os metadados, ajustar a localização, mudar o vínculo ou
retirar a fonte. Identificar a obra e localizar o trecho torna a atribuição
verificável; avaliar a qualidade da fonte e o apoio que oferece à afirmação é
outra parte da revisão. A conferência da fonte atribuída à pessoa autora exige
sua declaração expressa.

## Parâmetros e próxima revisão

A preparação consulta os parâmetros e as orientações efetivos do recorte.
Escolhas automáticas precisam de valores e motivos adequados ao conteúdo;
fixações da autoria e condições de pesquisa permanecem protegidas. A
[configuração corrente](desenho-instrucional-parametrizado.md) orienta o próximo
trabalho, enquanto a configuração aplicada registra as escolhas que produziram
o material existente.

Uma correção focal alcança somente o recorte solicitado. Mudar uma preferência
não reescreve automaticamente unidades anteriores. Alvos de palavras
orientam a extensão, sem justificar a retirada de uma explicação, exemplo ou
prática necessários. Se a unidade estiver densa demais, reveja sua organização
e sua relação com o restante do percurso.

## Aplicação e reinspeção

`aplicar_correcoes` aceita unidades, explicações ou ambas num conjunto coerente.
Quando `fontes` é fornecido para um alvo, a lista substitui seus vínculos na mesma
transação do conteúdo; uma lista vazia os remove. Omitir o campo preserva os
vínculos atuais. Remover um vínculo não exclui a obra nem seu arquivo do catálogo.
`salvar_explicacoes` permite corrigir apenas as bases e suas fontes, preservando
as unidades existentes. O serviço identifica os alvos e verifica a
revisão corrente antes de gravar.

Quando uma correção atende a observações, `observacoesTratadas` identifica as
versões que ela procurou atender. A gravação e a releitura conferem seus efeitos;
a decisão humana sobre as incidências permanece pendente. Para essa inspeção,
`preparar_revisao.comparacao` recebe a referência devolvida pela fila e permite
ler o conteúdo e as fontes anteriores junto dos vigentes.

`decidir_observacao` registra a aceitação do conteúdo vigente ou o encerramento
sem alteração, conforme a decisão expressa da pessoa. A referência conserva
as versões da observação e do conjunto de alvos, além da base de cada incidência
examinada. Decidir sobre parte dos alvos preserva as demais pendências. Se o
alvo foi removido, sua incidência permite encerramento expresso; a aceitação
pressupõe conteúdo vigente para inspecionar.

Se a resposta de correção se perder, `retomar_correcao` recupera a tentativa
original e reconcilia o recibo, o conteúdo e a fila. Essa conferência recupera
os efeitos persistidos e mantém a decisão sobre a observação numa operação
própria. Os detalhes da referência de recuperação estão em [Autoria pelo
MCP](autoria-mcp.md#fontes-observações-e-revisão).

Depois, reinspecione o percurso corrigido. A confirmação técnica prova que a
alteração foi salva; a leitura permite avaliar se ela resolveu o problema.
A decisão sobre uma observação e a declaração de revisão humana têm alcances
próprios: a primeira resolve o apontamento nos alvos examinados; a segunda
registra que a pessoa revisou o objeto. A marca de revisão é registrada ou
retirada por decisão expressa e fica desatualizada após mudança material.

O estado corrente do curso conserva o material e os registros necessários para
continuar o trabalho. Uma pesquisa que precise identificar a versão examinada
deve fazer uma exportação explícita: a conversa serve à coordenação, e não como
arquivo permanente de todas as versões.

## Na interface e na conversa

Na área **Conteúdo**, os controles da explicação e da unidade dão acesso às
observações e às fontes. A pessoa pode voltar a uma unidade anterior, selecionar
várias unidades e conferir o contexto. **Dados de autoria** apresenta medidas do desenho
e das intervenções registradas; seus [indicadores](analytics-instrucionais.md)
não substituem a inspeção.

Os canais [MCP](autoria-mcp.md) e [Actions/OpenAPI](autoria-actions.md) ligam
um assistente externo às tarefas de autoria. Para revisão e correção, oferecem:

| Tarefa | Efeito |
| --- | --- |
| `consultar_observacoes` | lê a fila pertinente |
| `registrar_observacao` | acrescenta uma entrada à explicação ou às unidades escolhidas |
| `editar_observacao` | altera a versão inspecionada de uma entrada e mantém a pendência |
| `preparar_revisao` | reúne conteúdo literal, fontes e contexto sem alterar o curso |
| `salvar_explicacoes` | produz ou corrige bases e fontes, preservando as unidades |
| `aplicar_correcoes` | grava o conjunto de correções autorizado |
| `retomar_correcao` | recupera a tentativa original e confere seus efeitos persistidos |
| `decidir_observacao` | registra a decisão humana sobre as incidências inspecionadas |
| `registrar_inspecao` | salva o parecer de IA com a referência da base lida |
| `declarar_revisao` | registra ou retira a declaração humana sobre o conteúdo inspecionado |

Na conversa, o resultado deve permitir localizar o conteúdo corrigido e saber
quais questões continuam abertas. A pessoa pode solicitar o texto integral
salvo para conferência, além de abri-lo no aplicativo. Uma síntese do trabalho
é útil para retomar a coordenação; a inspeção depende do próprio material.
