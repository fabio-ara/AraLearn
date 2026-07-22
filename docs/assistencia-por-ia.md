# Assistência de linguagem

O AraLearn pode usar um serviço de linguagem configurado pela pessoa autora para ajudar a planejar cursos e revisar cards. A resposta recebida é tratada como proposta: ela só pode alterar o curso depois de passar pela validação do formato, das regras didáticas e da edição humana.

## Planejar a estrutura

Na criação de um curso, a assistência recebe o tema, o objetivo, os conteúdos que devem entrar, o que deve ficar de fora e as convenções de escrita. A proposta resultante organiza módulos, lições e microssequências. Os cards são produzidos em uma etapa posterior.

## Revisar uma etapa

Durante o estudo, a pessoa pode abrir uma microssequência e pedir a criação ou correção dos seus cards. A solicitação alcança apenas o contexto necessário: objetivo da etapa, dependências, tópicos, cards existentes, referências escolhidas e critérios de verificação.

Esse recorte evita enviar o curso inteiro e mantém a intervenção ligada ao problema encontrado no estudo.

## Conferir antes de gravar

O AraLearn informa as formas de card aceitas, os tipos de exercício e os campos esperados. Depois recebe a proposta, recompõe o resultado no formato público do curso e verifica, entre outros pontos:

- se os campos obrigatórios estão presentes;
- se o conteúdo respeita os limites da microssequência;
- se dependências e posições são válidas;
- se as alternativas apontam para uma resposta existente;
- se um recurso visual traz os dados de que precisa;
- se o exercício não revela a resposta no próprio enunciado.

Uma proposta aprovada altera apenas a microssequência, o card ou o bloco correspondente. Se o curso veio do catálogo, a primeira alteração cria antes uma cópia pessoal.

O aplicativo confere novamente o recorte antes de gravar. Se a lição mudou enquanto o pedido estava em andamento, a resposta antiga não é reaproveitada. Também são recusadas respostas que tentem alterar outro curso, módulo, lição ou microssequência. A gravação local só termina depois que o fragmento validado foi confirmado no IndexedDB.

## Fontes externas

Materiais de referência podem ser escolhidos pela pessoa autora. Em processos de preparação de cursos, sistemas externos de recuperação de informação, como RAG, também podem ajudar a localizar fontes e organizar contexto.

O AraLearn não trata uma fonte recuperada nem uma resposta de modelo como verdade automática. A revisão do conteúdo continua sendo humana, e a publicação de cursos oficiais passa por validação da árvore completa.

## Dados e disponibilidade

Ao pedir assistência, o contexto da etapa é enviado ao serviço escolhido. Custos, limites, retenção de dados e disponibilidade dependem desse serviço.

O estudo não depende de assistência de linguagem. Depois que o curso é baixado, leitura, prática, progresso e comentários continuam disponíveis sem conexão.

A produção do catálogo usa uma API separada. Ela recebe um plano, libera uma parte por vez, registra a revisão e só publica o documento integralmente aprovado. O assistente usa uma chave restrita e nunca recebe acesso direto ao banco. Esse fluxo está descrito em [Autoria e publicação do catálogo](autoria-do-catalogo.md).

O formato de intercâmbio está em [Contrato público](aralearn-contract.md). As etapas de planejamento e validação estão em [Fluxos e contratos de geração](fluxos-prompts-e-contratos.md).
