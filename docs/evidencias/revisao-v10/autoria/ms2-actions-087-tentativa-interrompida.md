# Condição B — tentativa por Actions na versão 0.0.87

Em 27/09/2026, a etapa **Quando a comparação muda?** foi solicitada ao ChatGPT Chat, raciocínio Médio, pelo GPT com Actions do AraLearn. A explicação já existia e havia recebido revisão; esta tentativa não é um ensaio de produção inicial independente. O pedido foi formulado pelo Codex sob o mandato do proprietário.

## Pedido e interrupção

Pedido enviado às 2026-09-27T11:03:50.795Z:

> Quero agora desenvolver o percurso de estudo da etapa “Quando a comparação muda?”, no curso “Do sinal à decisão: como representamos situações para prever o que acontece depois”. Reabra o planejamento, a explicação e as escolhas pedagógicas que já estão salvos. Preserve a condição B: uma tentativa antes do ensino e novas oportunidades depois dele. A primeira tentativa deve permitir que a pessoa revele como pensa, sem exigir que já domine algo que ainda será ensinado. Depois, desenvolva o raciocínio e proponha situações novas em que ela precise comparar os planos quando a quantidade muda, calcular o que for necessário e distinguir uma igualdade de custos de uma troca de vantagem entre quantidades inteiras. Use as representações que realmente ajudem a perceber essas relações, com retornos específicos para as respostas. Deixe essa etapa completa e pronta para estudar, sem alterar as demais, confira o que ficou salvo e me dê o link. A sua auditoria é autônoma e não deve ser registrada como aprovação humana.

A consulta de diagnóstico cobre 11:03:50.795–11:48:00 UTC: 57 chamadas Actions, sendo 40 respostas 200 e 17 respostas 422. Doze recusas ocorreram em materialização e cinco no grupo de desenho instrucional. Não houve chamada OAuth nessa janela. Status HTTP não identifica a causa de cada recusa nem, sozinho, comprova a gravação do conteúdo pretendido.

A última proposta visível continha dez unidades: uma prática inicial, três de ensino e seis práticas posteriores. O operador interrompeu a geração às 11:48:43 UTC, após observar a repetição de recusas, para preservar a tentativa e investigar. Não foram enviadas alterações manuais desse conteúdo ao serviço.

Depois da interrupção, foi enviada esta pergunta de diagnóstico, sem autorização de novas gravações:

> As novas atividades dessa etapa ainda não apareceram, e a produção recebeu várias recusas. Interrompi a tentativa para entender o impedimento. Sem alterar o curso nem tentar gravar novamente agora, explique o que as ferramentas disseram que faltava ou estava incompatível. Traga a mensagem de erro recebida e diga o que chegou a ficar salvo e o que não chegou, distinguindo o que você confirmou do que ainda não sabe. Não mude a condição de prática antes e depois para conseguir concluir.

O GPT relatou recusas sucessivas ligadas a vínculos de requisitos, reconciliação da explicação, referência do processo e uso de ideias ainda não registradas como introduzidas. Indicou como impedimento final suficiência/variação da prática, sem conseguir identificar o requisito. Isso é relato do GPT sobre a execução; as causas individuais dos 422 não foram reconstruídas a partir dos status HTTP.

## Estado salvo e diferenças

A exportação completa posterior confirmou a **revisão 105**, com **zero unidades nesta etapa**, 21 unidades no curso, oito Explicações e 14 dos 34 componentes. Foram preservadas 41 páginas contíguas, 431.299 caracteres; SHA-256 do arquivo privado: `befca1141136a2197544a085b1757ef96352789ce7ca5be25c0d165c3a6748cb`. O recorte focal de 23 páginas coincide com o recorte correspondente do export completo. A pré-triagem mecânica não encontrou erro estrutural; isso não certifica pedagogia nem a proposta recusada.

No documento do curso, a comparação 91→105 encontrou somente mudança na reconciliação da Explicação da MS2. Seu texto visível e as 21 unidades permaneceram iguais. No inventário de autoria, porém, a tentativa também restaurou aplicação e declaração da primeira unidade da MS1 e ampliou de três para seis as formas declaradas para cada uma de duas ideias na segunda unidade da MS1. A P7 da MS1 continuou sem aplicação e declaração. Portanto, não se afirma que toda alteração tenha ficado restrita à MS2 nem que toda a rastreabilidade tenha sido recuperada.

A segunda unidade preserva três parágrafos: calcula custos para seis e dez entregas e distingue uma conclusão local de uma universal. A ampliação da declaração, sem alteração desse texto, exige auditoria semântica; não comprova que cada uma das seis formas foi desenvolvida para cada ideia. O relato do GPT sobre uma “restauração” não substitui esse confronto.

A consulta atual de parâmetros confirmou `before_and_after` fixo, origem **condição de pesquisa**, escopo desta microssequência e nenhum conflito. Mínimo de oportunidades e dimensões de variação continuavam em modo automático, com escolha contextual pendente. A condição B permaneceu solicitada, mas não chegou a ser realizada em unidades salvas. Não há comparação controlada de eficácia com A.

## Investigação do contrato

A última proposta sanitizada passa nos schemas locais de MCP e Actions. Uma chamada de prontidão feita pelo Codex, **somente para diagnóstico via MCP**, foi recusada antes do backend pelo connector, que classificou `explicacoes[].ideia` como propriedade adicional. O campo existe nos dois schemas versionados. Essa disparidade do cliente é registrada separadamente das recusas Actions; a causa interna da transformação não foi estabelecida.

A consulta do repertório confirmou seis requisitos-alvo da etapa. A reprodução local encontrou duas, duas, duas, duas, três e duas oportunidades distintas declaradas: todas satisfazem o mínimo dois. Entretanto, o requisito “Rejeitar generalizações não sustentadas pelos casos disponíveis” declara variação de casos/dados e de aspectos da tarefa nas unidades U1 e U10, enquanto a configuração escolhida para U10 exige também variação da representação externa. Nenhuma das duas declara essa terceira dimensão. Essa incompatibilidade reproduz a condição do bloqueio final, sem permitir atribuir os 17 retornos 422 à mesma causa.

Foi confirmado um defeito de orientação: a verificação final de suficiência devolvia mensagem genérica sem nomear o requisito nem distinguir quantidade de dimensão ausente. A correção compartilhada na candidata 0.0.88 informa requisito, microssequência, oportunidades distintas declaradas, mínimo efetivo e dimensões faltantes, usando os campos já existentes nos retornos MCP e Actions. Três testes focais de materialização e um de cada canal passaram, incluindo o caminho válido e a remoção de conteúdo privado dos erros. Regras, contagem e condição B permanecem iguais.

A recuperação deve reconciliar conteúdo, declaração e calibração automática justificada, preservando as fixações de pesquisa. Acrescentar uma dimensão à declaração apenas para passar no teste não demonstraria sua realização. Da mesma forma, a posição antes/depois não multiplica o mínimo nem certifica a ordem efetivamente produzida: essa relação exige inspeção do percurso. A correção da mensagem ainda não prova recuperação da autoria hospedada.

Estado: tentativa interrompida e preservada; incompatibilidade focal reproduzida e orientação corrigida/testada localmente; publicação, materialização da condição B e sua inspeção de Estudo pendentes. Exports integrais, argumentos operacionais e logs permanecem privados. **Nenhum resultado desta intervenção constitui validação humana pós-correção.**
