# Autoria e publicação do catálogo

O catálogo pode receber um curso de duas formas. Um arquivo AraLearn 3 já concluído pode ser importado pela biblioteca. Um assistente externo também pode preparar o curso em partes pela API de autoria. Nos dois casos, a publicação só ocorre depois da validação integral do contrato e da árvore relacional.

Agentes compatíveis com MCP podem usar o [gateway MCP de autoria](autoria-mcp.md). Actions e conectores REST continuam usando a API descrita nesta página. As duas portas executam o mesmo núcleo transacional.

## Autoria em partes

A API conserva o modo de trabalho usado na produção dos primeiros cursos do AraLearn:

```text
objetivo e fontes
→ planejamento do curso e das partes
→ produção de uma parte
→ revisão separada da parte
→ reparo ou reconstrução, quando necessário
→ próxima parte
→ validação do curso remontado
→ publicação
```

Um único assistente pode executar todas essas funções, mas não as mistura na mesma resposta. Primeiro produz a parte solicitada; depois volta a lê-la como revisor e registra uma decisão. A API só libera a etapa seguinte quando a anterior foi aprovada.

O plano mantém a estrutura inicial do documento AraLearn 3, a ordem das partes, os objetivos e os resultados de aprendizagem. Um manifesto declara a quantidade de trechos do registro; fontes, afirmações e termos são gravados em seguida, sem inflar o plano. A especificação detalhada só é enviada quando a respectiva parte se torna a próxima pendência. Cada parte contém uma ou mais microssequências completas. Esse recorte permite retomar uma produção longa sem pedir ao modelo que escreva o curso inteiro de uma vez.

Quando uma dúvida impede uma decisão segura, a execução pode ser bloqueada com as perguntas que precisam de resposta. A retomada registra a decisão do autor antes de devolver o trabalho ao estado anterior. Uma execução também pode ser cancelada; se a validação final localizar um defeito, a parte responsável pode ser reaberta para reparo ou reconstrução.

Cada trecho do registro contém ao menos um item. Fontes conservam autoria, data, versão, data de acesso, condições de uso e observações editoriais; afirmações e termos preservam suas ligações com as partes. A finalização confere a quantidade e o resumo de cada trecho declarados no manifesto.

O identificador de uma solicitação pode ser reutilizado somente para repetir a mesma operação. A comparação usa uma forma canônica do JSON, portanto a simples mudança na ordem das propriedades não cria outro comando. Se o conteúdo mudar, a API rejeita a reutilização. Essa regra permite retomar uma chamada cuja resposta se perdeu sem duplicar plano, parte, auditoria ou publicação.

## Validação e publicação

Uma parte aprovada não aparece no catálogo. Ela permanece em uma área privada de preparação. Depois da última aprovação, o servidor remonta o documento, marca como prontas somente as microssequências aprovadas e executa os validadores estruturais usados na importação comum:

- contrato `aralearn.contract` versão 3;
- relações, posições e referências da árvore;
- todos os tipos de card e recurso visual;
- remontagem sem perda de campos;
- estado editorial de todas as microssequências;
- hash canônico do curso.

Os validadores também examinam os campos internos de árvores, grafos, fluxos, relações, matrizes, planos e composições. Referências inexistentes, ciclos proibidos, duplicidades e propriedades desconhecidas são rejeitados na entrada. Nenhum campo pode desaparecer durante a normalização.

Essas verificações comprovam integridade, relações e algumas regras didáticas expressas como restrições. Elas não julgam, por conta própria, a correção científica, a adequação pedagógica integral nem a equivalência semântica de duas versões. Fontes, revisão separada e decisão editorial continuam necessárias.

Cursos grandes são materializados em lotes idempotentes. Cada pedido de publicação termina em até 45 segundos. HTTP 202 com `status: publishing` indica que o progresso foi persistido; o cliente aguarda o intervalo de `pollAfterSeconds` e repete a operação com o mesmo `requestId` até receber HTTP 200 com `status: published`. O catálogo só muda na finalização; um rascunho incompleto nunca fica visível para estudantes.

O mesmo protocolo aceita `target: private`. Nesse destino, qualquer conta autenticada pode planejar, produzir, revisar e validar um curso próprio. A etapa final cria uma árvore relacional pessoal e a seleciona na conta do autor. O staging privado é separado do staging oficial, e a árvore, a seleção e a conclusão da execução entram no banco na mesma transação. Uma falha mantém o trabalho de autoria para nova tentativa, mas não deixa um curso parcial disponível no aplicativo.

Os documentos e fragmentos usados durante a preparação são transitórios. Depois do prazo de retenção, eles são removidos sem afetar a publicação relacional. Permanecem os recibos necessários à idempotência e um registro administrativo resumido, com hashes e decisões, em vez de uma segunda cópia do curso.

O banco limita esse material antes que ele cresça sem controle. A configuração
padrão admite até 32 MiB por execução, 64 MiB por autor e 128 MiB no conjunto de
execuções ativas. O histórico terminal conservado tem limites próprios de 64 MiB
por autor e 128 MiB no total. A medição inclui a linha completa e reserva margem
para índices, páginas e armazenamento externo do PostgreSQL; portanto, é mais
conservadora do que a soma dos campos recebidos pela API.

A manutenção percorre o histórico em lotes. Cada chamada trata uma fase e guarda
o cursor no banco: recupera publicações interrompidas, encerra execuções vencidas,
remove cancelamentos e publicações fora da retenção em percursos separados e, por
fim, reduz recibos e janelas auxiliares. O lote padrão contém dez execuções,
limitado a 25; a redução auxiliar
trata até 250 linhas por chamada. Uma execução adiada não faz o ciclo parecer
concluído. Assim, a limpeza pode ser retomada sem varrer todas as tabelas nem
ultrapassar o tempo de uma Edge Function.

## Permissões

Os papéis são atribuídos ao UUID da conta no Supabase. Nenhum e-mail fica gravado no código ou nas regras de acesso.

| Papel | Permissão |
| --- | --- |
| `owner` | administra papéis, clientes da API e todo o fluxo editorial |
| `catalog_publisher` | prepara, revisa, importa e publica no catálogo, sem acesso administrativo aos dados pessoais |
| `author` | cria e desenvolve rascunhos do catálogo |
| `reviewer` | examina partes e registra aprovação, reparo ou reconstrução |

Toda conta autenticada pode importar um curso privado pela aba **Trilhas**. O botão de importação da aba **Coleções** só aparece para `owner` e `catalog_publisher`. A importação privada passa pelo repositório relacional do próprio aplicativo; a importação pública passa pela API e pelas regras editoriais do servidor.

Uma sessão autenticada também pode usar a API para autoria privada. Chaves destinadas a assistentes pessoais recebem somente `authoring:private:read`, `authoring:private:write` e `authoring:private:audit`. Elas não criam execuções de catálogo, não consultam o trabalho privado de outra conta e não promovem um curso pessoal a publicação oficial. A promoção para o catálogo não faz parte desse fluxo.

### Integrações pessoais

A própria conta pode emitir uma chave para seu assistente sem receber privilégios editoriais. Essa administração exige o JWT da sessão do AraLearn e passa por quatro operações da API:

| Operação | Efeito |
| --- | --- |
| `GET /v1/integrations` | lista somente nome, prefixo, validade, uso recente e situação |
| `POST /v1/integrations` | emite uma chave com validade de 1 a 365 dias |
| `POST /v1/integrations/{clientId}/rotate` | cria a substituta e revoga a anterior na mesma transação |
| `DELETE /v1/integrations/{clientId}` | revoga a chave indicada |

A chave completa aparece uma única vez, na resposta da emissão ou da renovação. O banco recebe apenas o prefixo e o hash SHA-256. A repetição do mesmo `requestId` não cria outra integração e não revela novamente o segredo; se a primeira resposta tiver sido perdida, é preciso renovar a integração. Cada conta pode manter até cinco chaves pessoais ativas.

Uma chave `arl_...` não pode chamar essas quatro operações. Isso impede que um assistente crie ou renove suas próprias credenciais. A especificação usada pela Action do ChatGPT também omite as rotas de administração; a chave é criada por uma sessão autenticada e só depois é informada no campo de autenticação da ferramenta.

Depois de configurado, o assistente usa `target: private` no mesmo ciclo de planejamento, produção, revisão e validação. A conclusão materializa o curso na árvore relacional da conta e cria sua seleção. A operação não publica o curso em uma coleção e não torna nenhuma etapa parcial visível no aplicativo.

Os pacotes de configuração para assistentes são públicos, mas não representam uma conta editorial. Baixar um pacote, criar um GPT ou enviar os arquivos de conhecimento não permite ler nem alterar o catálogo de outra instância. Para gravar cursos, a pessoa precisa usar uma integração da própria conta ou ter autorização editorial na instância correspondente. A chave `arl_...` deve ficar em um assistente privado ou em um espaço de trabalho restrito.

A ferramenta administrativa local encontra o UUID pelo e-mail informado no terminal, mas envia ao banco somente identidades e papéis. A chave administrativa fica apenas na variável temporária do processo:

```powershell
$env:ARALEARN_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role>"

npm.cmd run authoring:access -- bootstrap-owner --email <conta>
npm.cmd run authoring:access -- grant-role --actor-email <proprietário> --email <conta> --role catalog_publisher
npm.cmd run authoring:access -- create-client --actor-email <proprietário> --name "Autoria do catálogo"

Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

A chave `arl_...` do cliente é mostrada uma única vez. O banco conserva somente seu prefixo e o resumo SHA-256. Ela pode ser rotacionada ou revogada sem trocar a configuração do Supabase:

```powershell
npm.cmd run authoring:access -- rotate-client --actor-email <proprietário> --client-id <uuid>
npm.cmd run authoring:access -- revoke-client --actor-email <proprietário> --client-id <uuid>
```

## Pacotes para assistentes

O [material de autoria](../authoring/README.md) reúne o fluxo, os critérios didáticos, os esquemas JSON, um exemplo completo e a [especificação OpenAPI](openapi/aralearn-authoring-api.yaml). Os arquivos prontos para download são:

- [núcleo comum](downloads/authoring/aralearn-authoring-core.zip);
- [ChatGPT](downloads/authoring/aralearn-authoring-chatgpt.zip);
- [Gemini](downloads/authoring/aralearn-authoring-gemini.zip);
- [Microsoft 365](downloads/authoring/aralearn-authoring-microsoft-365.zip);
- [Claude](downloads/authoring/aralearn-authoring-claude.zip);
- [integração genérica](downloads/authoring/aralearn-authoring-generic.zip);
- [hashes SHA-256](downloads/authoring/SHA256SUMS.txt).

O pacote do ChatGPT inclui instruções para um GPT personalizado e uma Action baseada em OpenAPI. O Copilot Studio pode usar a mesma API por ferramenta REST ou conector personalizado. Ambientes do Gemini e do Claude recebem as mesmas regras e formatos, mas a gravação automática depende dos recursos de integração habilitados naquela plataforma. Uma Gem clássica, por exemplo, aceita instruções e arquivos, mas não ganha por isso acesso arbitrário a uma API. Os planos, limites e licenças continuam sendo definidos por cada fornecedor.

Referências oficiais: [Actions em GPTs](https://help.openai.com/en/articles/8554397-creating-a-gpt), [function calling do Gemini](https://ai.google.dev/gemini-api/docs/tools), [Gems](https://support.google.com/gemini/answer/15235603), [ferramentas REST no Copilot Studio](https://learn.microsoft.com/en-us/training/modules/take-action-external-systems-connector-rest-api-tools-copilot-studio/) e [conectores MCP no Claude](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp).

## Implantação da API

Depois de aplicar as migrations, implante a função:

```powershell
npx.cmd --yes supabase@2.109.1 functions deploy aralearn-authoring-api --project-ref <project-ref> --no-verify-jwt
npx.cmd --yes supabase@2.109.1 functions deploy aralearn-authoring-mcp --project-ref <project-ref> --no-verify-jwt
```

O gateway não pode exigir JWT porque assistentes usam a chave `arl_...`. A própria função valida exatamente uma das duas credenciais aceitas, aplica escopos e rejeita autenticação ausente ou ambígua.

O Supabase fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente da função. Para limitar as origens usadas pelo upload do aplicativo, defina:

```powershell
npx.cmd --yes supabase@2.109.1 secrets set `
  ARALEARN_AUTHORING_ALLOWED_ORIGINS="https://fabio-ara.github.io,http://127.0.0.1:4182,http://localhost:4182,https://appassets.androidplatform.net" `
  --project-ref <project-ref>
```

A leitura que antecede a auditoria recebe um comprovante HMAC válido por cinco
minutos. Por padrão, a função deriva a chave desse comprovante da service role com
separação de domínio. É recomendável definir também um segredo independente, com
pelo menos 32 caracteres, em `ARALEARN_AUTHORING_RECEIPT_SECRET`. A troca desse
segredo invalida apenas comprovantes ainda não usados; basta reler a entrega.

A emissão de integrações pessoais usa outra derivação HMAC. Defina um segredo independente, com pelo menos 32 caracteres, para que ele possa ser renovado sem depender da service role:

```powershell
npx.cmd --yes supabase@2.109.1 secrets set `
  ARALEARN_AUTHORING_INTEGRATION_SECRET="<segredo-aleatório-com-32-ou-mais-caracteres>" `
  --project-ref <project-ref>
```

Se esse valor não estiver definido, a função usa o segredo do comprovante e, em último caso, a service role. Nenhum desses valores sai do ambiente da Edge Function.

O comprovante vincula a execução, a parte, a tentativa, o hash da entrega, o
usuário e o cliente da API. Ele não é gravado em logs nem no banco. Uma auditoria
nova exige uma leitura nova; a repetição idempotente da mesma auditoria continua
aceita enquanto a autorização do usuário e do cliente permanecer válida.

A service role nunca é copiada para o GPT, para o navegador ou para o APK. Assistentes usam a chave restrita `arl_...`; o upload feito dentro do AraLearn usa o JWT da sessão. Todas as chamadas chegam às mesmas funções SQL autorizadas e auditadas.
