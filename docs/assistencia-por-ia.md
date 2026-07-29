# Assistência de linguagem

O AraLearn pode usar um serviço de linguagem configurado pela pessoa autora para ajudar a planejar cursos e revisar cards. A resposta recebida é tratada como proposta: ela só pode alterar o curso depois de passar pela validação do formato, das regras didáticas e da edição humana.

## Planejar a estrutura

Na criação de um curso, a assistência recebe o tema, o objetivo, os conteúdos que devem entrar, o que deve ficar de fora e as convenções de escrita. A proposta resultante organiza módulos, lições e microssequências. Os cards são produzidos em uma etapa posterior.

## Revisar uma etapa

Durante o estudo, a pessoa pode abrir a aba de autoria de uma microssequência e pedir a criação ou correção dos seus cards. O painel e os comandos de criação continuam disponíveis em qualquer curso selecionado, inclusive quando a origem é o catálogo. A solicitação alcança apenas o contexto necessário: objetivo da etapa, dependências, tópicos, cards existentes, referências escolhidas e critérios de verificação.

Esse recorte evita enviar o curso inteiro e mantém a intervenção ligada ao problema encontrado no estudo.

O fluxo bottom-up usa saída estruturada por schema e intenções explícitas:
`rewrite_content`, `rebuild_practice`, `change_resource` ou `rebuild_card`. O
alvo pode ser o card inteiro, um bloco ou vários blocos do mesmo `composite`.
Cards e blocos vizinhos entram como contexto somente leitura.

Para trocar recurso, o runtime primeiro limita a seleção a
`allowedResources`; depois solicita somente o schema do recurso escolhido. A
resposta contém substituições identificadas, não a lição ou o projeto inteiro.
Uma guarda compara IDs, ordem, conteúdo não selecionado e fingerprint antes da
gravação.

## Conferir antes de gravar

O AraLearn informa as formas de card aceitas, os tipos de exercício e os campos esperados. Depois recebe a proposta, recompõe o resultado no formato público do curso e verifica, entre outros pontos:

- se os campos obrigatórios estão presentes;
- se o conteúdo respeita os limites da microssequência;
- se dependências e posições são válidas;
- se `answerIds` aponta para opções existentes e corresponde ao modo de seleção;
- se um recurso visual traz os dados de que precisa;
- se o exercício não revela a resposta no próprio enunciado.

Uma proposta aprovada altera somente as linhas locais do alvo em edição e marca
o curso como uma área de autoria local alterada. Esse marcador impede que uma
nova revisão baixada substitua silenciosamente o trabalho. A autoria remota
extensa cria revisões imutáveis; uma revisão incompleta pode ser publicada
como prévia privada, enquanto o catálogo exige o curso integralmente pronto.

O aplicativo confere novamente o recorte antes de gravar. Se a lição mudou enquanto o pedido estava em andamento, a resposta antiga não é reaproveitada. Também são recusadas respostas que tentem alterar outro curso, módulo, lição ou microssequência. A gravação local só termina depois que o fragmento validado foi confirmado no IndexedDB.

## Fontes externas

Materiais de referência podem ser escolhidos pela pessoa autora. Em processos de preparação de cursos, sistemas externos de recuperação de informação, como RAG, também podem ajudar a localizar fontes e organizar contexto.

O AraLearn não trata uma fonte recuperada nem uma resposta de modelo como verdade automática. A revisão do conteúdo continua sendo humana, e a publicação de cursos oficiais passa por validação da árvore completa.

## Dados e disponibilidade

Ao pedir assistência, o contexto da etapa é enviado ao serviço escolhido. Custos, limites, retenção de dados e disponibilidade dependem desse serviço.

O seletor inclui configurações prontas para DeepSeek, Gemini e o bridge local. A opção **Outro modelo** aceita três protocolos:

- **Compatível com OpenAI:** requer o identificador do modelo, a chave e a URL HTTPS completa da operação de conversa;
- **Gemini:** requer o identificador do modelo e a chave; a chamada usa a API oficial do Gemini;
- **Bridge local:** requer o identificador do modelo e o endereço do bridge. HTTP só é aceito em `localhost`, `127.0.0.1` ou no endereço local IPv6; qualquer endereço externo precisa de HTTPS.

O AraLearn verifica modelo, protocolo e endereço antes de enviar o pedido. Uma configuração inválida interrompe a operação, sem escolher outro serviço ou modelo. A chave permanece apenas na memória da página, não é gravada no IndexedDB, no armazenamento do navegador nem em endereços. Ao recarregar ou fechar o aplicativo, é preciso informá-la novamente. Mensagens de erro não reproduzem a credencial.

A política de conteúdo da instalação também precisa autorizar explicitamente a origem usada pelo serviço. DeepSeek e Gemini já entram na lista padrão. O aplicativo Android admite o bridge do próprio dispositivo em `http://127.0.0.1:4183`; no servidor local, também é aceito `http://localhost:4183`. Para **Outro modelo**, informe somente a origem HTTPS necessária em `ARALEARN_ASSIST_ALLOWED_ORIGINS` durante o build. O AraLearn recusa endereços que não estejam nessa lista e não libera conexões para qualquer domínio HTTPS.

O estudo não depende de assistência de linguagem. Depois que o curso é baixado, leitura, prática, progresso e comentários continuam disponíveis sem conexão.

A autoria extensa usa o gateway MCP. Ele lê cursos existentes e edita um
workspace por operações atômicas, revisão esperada e snapshots JSON
imutáveis. Uma chave pessoal grava apenas na conta que a emitiu; publicar numa
coleção oficial exige permissão editorial separada. A ferramenta nunca recebe
acesso direto ao banco. Esse fluxo está descrito em [Gateway MCP de
autoria](autoria-mcp.md).

O formato de intercâmbio está em [Contrato público](aralearn-contract.md). As etapas de planejamento e validação estão em [Fluxos e contratos de geração](fluxos-prompts-e-contratos.md).
