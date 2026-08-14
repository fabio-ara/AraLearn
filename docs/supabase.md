# Supabase no AraLearn

O **Supabase** é a plataforma que reúne o banco de dados, a autenticação, o
armazenamento de arquivos e as funções de servidor usadas pelo AraLearn. Esses
serviços remotos tratam identidade, autorização, concorrência entre dispositivos
e distribuição controlada de conteúdo.

O projeto versionado fica em `supabase/` e reúne a configuração local, as
alterações ordenadas do banco, os testes, as funções de servidor e os dados
mínimos de desenvolvimento. A aplicação web e o aplicativo Android acessam as
mesmas operações remotas; não existe uma implementação de dados paralela no
Android. Em produção, o caminho mantido pelo projeto usa o Supabase gerenciado.
O ambiente local é descartável e serve a desenvolvimento e testes, não a uma
instalação auto-hospedada.

Este documento explica o papel de cada componente e o procedimento seguro para operá-lo. O roteiro completo de publicação está em [Implantação](implantacao.md).

## Vocabulário de entrada

- **PostgreSQL**: sistema gerenciador de banco de dados relacional usado pelo
  Supabase;
- **Structured Query Language (SQL)**: linguagem usada para definir e consultar
  dados relacionais;
- **Auth**: serviço que comprova a identidade e mantém a sessão de uma conta;
- **Storage**: serviço de armazenamento de objetos, como os documentos integrais
  de curso;
- **Edge Function**: função executada no servidor quando uma operação precisa
  conservar segredo ou aplicar autorização antes de devolver dados;
- **Application Programming Interface (API)** por **Hypertext Transfer Protocol
  (HTTP)**: conjunto de operações remotas acessadas pelo protocolo da web;
- **SHA-256**: função que produz um resumo criptográfico do conteúdo, usado para
  identificar bytes sem depender do nome do arquivo.

O [glossário técnico](glossario-tecnico.md) aprofunda esses conceitos e as
siglas usadas nas seções seguintes.

## 1. Modelo de responsabilidade

Integrar esses serviços numa plataforma não torna todos os dados iguais. No
AraLearn, cada componente resolve um problema distinto:

| Serviço | Problema resolvido | Conteúdo que recebe |
|---|---|---|
| PostgreSQL | relações mutáveis, autorização e transações concorrentes | contas, permissões, seleções, trilhas, estado pessoal, workspaces e descritores de artefatos |
| Auth | comprovação da identidade da conta | credenciais, sessões e fluxos de recuperação |
| Storage | objetos grandes e imutáveis | revisões de curso endereçadas por SHA-256 |
| Edge Functions | operações que precisam de segredo ou protocolo de servidor | autoria externa, entrega autorizada de revisões e integração com o aplicativo |

O banco não guarda uma cópia completa de cada curso para cada estudante. O Storage não decide quem pode ler um objeto. A função de entrega consulta o plano de controle relacional, autoriza a conta e só então entrega o artefato. Essa separação reduz duplicação e permite revogar acesso sem reescrever o objeto.

## 2. Migrations: o esquema como código versionado

Uma **migration** é uma alteração ordenada e versionada do esquema ou do comportamento do banco. Ela pode criar tabelas, índices, políticas de segurança, funções transacionais e verificações. O histórico em `supabase/migrations/` é a fonte reproduzível do banco; alterações manuais no SQL Editor não são equivalentes porque não podem ser reaplicadas nem confrontadas automaticamente em outro ambiente.

### Problema e alternativas

Um banco remoto pode ser alterado manualmente, reconstruído por um arquivo SQL único ou evoluído por migrations incrementais. A edição manual é rápida no primeiro uso, mas cria divergência invisível. Um arquivo único descreve o estado final, porém não explica como bancos já existentes devem chegar a ele sem perda de dados.

### Decisão

O AraLearn usa migrations incrementais, imutáveis depois de aplicadas. O manifesto público do banco informa a revisão de esquema exigida pelo aplicativo. A implantação aplica primeiro o banco, depois as Edge Functions e, por último, o site ou o APK.

### Funcionamento

As migrations recentes separam, entre outras responsabilidades:

- artefatos no Storage e seu plano de controle (`20260728010000_storage_artifact_control_plane.sql` e `20260728030000_finalize_catalog_artifact_cutover.sql`);
- workspaces compostos e concorrência por revisão (`20260729010000_authoring_workspaces_v4.sql` e `20260729070000_authoring_workspace_hardening.sql`);
- trilhas e estado pessoal (`20260807210000_unified_trails.sql` e `20260807220000_trail_personal_state.sql`);
- continuidade da autoria (`20260809010000_authoring_continuity.sql`);
- biblioteca de packages e manifesto plano do runtime (`20260812120000_package_library_contract.sql` a `20260812164000_flat_runtime_manifest.sql`).

O nome numérico estabelece a ordem. O comando `db reset` deve ser usado apenas no stack local: ele recria o banco, aplica todas as migrations e executa `supabase/seed.sql`. No projeto remoto, o roteiro faz primeiro um `db push --dry-run` e nunca executa reset, seed, `db pull` ou `migration repair` automaticamente.

### Consequências e limites

Migrations tornam o estado auditável e repetível, mas não substituem backup nem ensaio de restauração. Uma migration aplicada deve ser corrigida por outra migration; editar o arquivo antigo falsifica a história já executada. O mecanismo e seus comandos são documentados oficialmente pelo [Supabase](https://supabase.com/docs/guides/deployment/database-migrations).

## 3. RLS e autoridade efetiva

**Row Level Security** (RLS) é o mecanismo do PostgreSQL que decide, linha a linha, se uma operação pode ler ou alterar dados. Quando RLS está habilitado e nenhuma política permite a operação, o comportamento é negar por padrão. A definição formal está na documentação de [segurança por linha do PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### Problema e alternativas

Confiar apenas na interface esconderia botões, mas não impediria chamadas diretas à API. Concentrar toda autorização em uma chave administrativa dentro do cliente exporia poder irrestrito. Duplicar regras em cada tela também criaria decisões inconsistentes.

### Decisão e funcionamento

O JWT do Supabase Auth identifica a conta. Políticas RLS e funções do banco derivam a autoridade a partir de relações persistidas: propriedade, participação em workspace, papel editorial, vínculo com um curso e estado corrente do objeto. O cliente recebe capacidades por `current_user_capabilities`, mas essa projeção serve à interface; o servidor revalida a autorização em toda escrita.

Operações comuns não recebem chave administrativa. A chave protegida é usada somente em Edge Functions e rotinas operacionais que precisam atravessar RLS de modo controlado. Tabelas expostas pelo Data API permanecem com RLS habilitado, conforme recomenda a documentação de [segurança de dados do Supabase](https://supabase.com/docs/guides/database/secure-data).

### Consequências e evidência

Ocultar um controle deixa de ser uma medida de segurança; é apenas uma adaptação de UX. Os testes SQL e o smoke hospedado criam contas diferentes e verificam isolamento. RLS, entretanto, não protege um segredo já enviado ao navegador nem corrige uma função `security definer` mal projetada; por isso essas funções têm superfície fechada, validação própria e testes específicos.

## 4. RPCs: comandos transacionais de domínio

Uma **RPC** é uma função do banco chamada remotamente pela API. No AraLearn ela não é um atalho genérico para SQL: representa um comando ou uma consulta de domínio que precisa combinar validação, autorização e transação.

### Por que não escrever tabelas diretamente

Uma operação como mover um curso entre coleções altera mais de uma relação e precisa conferir a revisão esperada. Se o navegador atualizasse cada tabela separadamente, uma falha intermediária deixaria estado parcial. A RPC executa a unidade de trabalho inteira no PostgreSQL, onde transações e bloqueios podem preservar os invariantes.

### Famílias de operação

| Responsabilidade | RPCs representativas |
|---|---|
| seleção e réplica pessoal | `select_catalog_course`, `unselect_catalog_course`, `bootstrap_replica`, `pull_sync_changes`, `apply_sync_batch` |
| trilhas | `list_trail_items_v1`, `mutate_trails_v1`, `get_trail_workspace_course_v1` |
| estado pessoal | `load_trail_personal_state_v1`, `mutate_trail_personal_state_v1` |
| catálogo editorial | `list_catalog_collections`, `create_catalog_collection_v5`, `update_catalog_collection_v5`, `retire_catalog_collection_v5`, `move_catalog_course_v5` |
| workspaces de autoria | `create_authoring_workspace_v5`, `get_authoring_workspace_v5`, `commit_authoring_workspace_changes_v5`, `delete_authoring_workspace_v5` |
| continuidade e auditoria | `get_authoring_workspace_continuity_v1`, `update_authoring_workspace_continuity_v1`, `manage_authoring_workspace_finding_v1`, `list_authoring_workspace_observations_for_actor_v1` |
| governança de workspace educacional | `get_current_educational_workspace_v1`, `manage_current_educational_workspace_v1` |
| revisão e publicação | `submit_private_course_for_catalog_review_v5`, `claim_catalog_review_v5`, `decide_catalog_review_v5`, `publish_authoring_workspace_course_v5` |
| artefatos e coleta | `register_authoring_artifact_v5`, `get_course_revision_artifact_v4`, `claim_unreferenced_artifacts_v4`, `complete_artifact_gc_v4` |

Os nomes completos e as assinaturas normativas estão nas migrations e no manifesto do runtime. A lista acima ensina as responsabilidades; não deve ser usada para deduzir parâmetros.

## 5. Concorrência, CAS e idempotência

**Compare-and-swap** (CAS) significa aceitar uma alteração somente se a revisão corrente ainda for a revisão que o cliente leu. **Idempotência** significa que repetir a mesma solicitação identificada produz o mesmo efeito observável, sem duplicar a mutação.

O AraLearn usa ambos porque dispositivos, navegadores e integrações podem trabalhar sobre o mesmo objeto e repetir chamadas após timeout. Uma escrita carrega `expectedRevision` e um identificador de requisição ou mutação. A função bloqueia ou compara a linha corrente, valida a alteração recomposta e grava a nova revisão numa transação. Se a revisão já mudou, retorna conflito explícito; se a solicitação idempotente já foi confirmada, recupera o recibo anterior.

CAS evita sobrescrever trabalho alheio sem aviso, mas não resolve semanticamente dois textos incompatíveis. O chamador precisa reler o estado e decidir se refaz, combina ou abandona a mudança. Idempotência evita duplicação; não transforma uma requisição inválida em válida. As garantias dependem das transações e dos níveis de isolamento do [PostgreSQL](https://www.postgresql.org/docs/current/transaction-iso.html).

## 6. Autenticação e callback

O AraLearn oferece cadastro, confirmação, reenvio de confirmação, recuperação e troca de senha, login, renovação, sessão persistida, saída e exclusão da própria conta. Não há catálogo anônimo.

O fluxo usa **Proof Key for Code Exchange** (PKCE): o navegador gera um
verificador secreto, envia apenas seu desafio ao servidor e recebe no retorno
um código de uso único. A troca do código só funciona no dispositivo que
conserva o verificador. Um `auth_state` aleatório, de uso único e válido por até
quinze minutos, vincula o retorno à tentativa original. O Service Worker não
guarda navegações com parâmetros de autenticação. O mecanismo é definido na
[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).

Cadastre no painel apenas os destinos usados pela instalação:

```text
http://localhost:<porta>/
https://<domínio-da-aplicação>/<caminho>/
aralearn://auth/callback
```

O esquema customizado atende ao APK atual, mas não comprova ao Android que o AraLearn é seu único proprietário. PKCE impede a troca do código por outro aplicativo, embora um interceptor ainda possa causar negação de serviço. Uma distribuição ampla deve usar Android App Link HTTPS verificado, com `assetlinks.json` no domínio controlado.

No stack local, o Mailpit em `http://127.0.0.1:54324` recebe mensagens de confirmação e recuperação. Os testes exercitam o fluxo completo; não inicie o stack local excluindo esse serviço.

## 7. Storage e artefatos endereçados por conteúdo

Uma revisão publicada de curso é um objeto imutável. Seu endereço lógico inclui o SHA-256 do conteúdo canônico. O banco guarda descritor, tamanho, estado, vínculos e autorização; o Storage guarda os bytes.

### Decisão

Objetos grandes não são repetidos em colunas relacionais nem distribuídos diretamente por URL pública. Antes do upload, a Edge Function pré-registra o descritor. Depois do envio, o servidor confere hash e tamanho e conclui a publicação transacionalmente. O estudante baixa por `aralearn-course-revisions`; a função verifica o acesso, entrega o objeto e o cliente valida novamente contrato, tamanho e SHA-256 antes de ativá-lo.

Uploads grandes usam o protocolo TUS, recomendado pelo Supabase para transferências retomáveis acima de 6 MiB. O limite atual do domínio é 32 MiB por documento composto ou artefato. A documentação primária está em [uploads retomáveis do Supabase Storage](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

### Coleta de lixo

Remover uma publicação não apaga imediatamente o objeto. Primeiro o plano de controle registra um tombstone. Uma rotina lista artefatos sem referência com idade mínima, os reivindica, remove do Storage e registra a conclusão. Essa janela impede que uma corrida entre publicação e coleta apague um objeto ainda em uso.

As políticas do bucket são parte da segurança; um bucket privado por si só não substitui RLS e autorização da função. Consulte o modelo de [controle de acesso do Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control).

## 8. Edge Functions e protocolos externos

Uma **Edge Function** é código de servidor distribuído e executado pelo Supabase. No AraLearn, ela existe quando a operação precisa conservar segredo, validar um protocolo externo ou entregar bytes mediante autorização. A plataforma documenta seu modelo de execução em [Supabase Edge Functions](https://supabase.com/docs/guides/functions).

| Função | Responsabilidade |
|---|---|
| `aralearn-authoring-mcp` | superfície MCP de autoria, autenticada por OAuth 2.1 |
| `aralearn-authoring-action` | adaptador da Action e rota restrita usada pelo aplicativo |
| `aralearn-course-revisions` | entrega autorizada e verificada de artefatos privados |

MCP, Action e aplicativo reutilizam o mesmo registro de operações e o mesmo executor de domínio. Os adaptadores traduzem autenticação e envelopes; não criam regras de autoria paralelas. `verify_jwt` fica desabilitado na configuração das funções porque cada entrada executa a verificação completa apropriada ao próprio protocolo.

As secret keys hospedadas chegam por `SUPABASE_SECRET_KEYS`; `ARALEARN_SUPABASE_SECRET_KEY_NAME` seleciona o nome quando houver mais de uma. Não copie secret key hospedada para `SUPABASE_SERVICE_ROLE_KEY`: no ambiente local essa variável pertence à chave efêmera emitida pela CLI.

### Origem, CORS e CSP

Uma **origem** é a combinação de esquema, host e porta que identifica de onde
uma página foi carregada. **Cross-Origin Resource Sharing** (CORS) é o protocolo
de cabeçalhos HTTP pelo qual um servidor informa ao navegador quais outras
origens podem ler uma resposta. **Content Security Policy** (CSP) é a política
enviada com a própria página para limitar, entre outras capacidades, os
destinos de rede aos quais ela pode se conectar.

Sem essas barreiras, a alternativa mais simples seria aceitar qualquer origem
no servidor e permitir qualquer destino HTTPS na página. Isso reduziria a
configuração inicial, mas ampliaria a superfície para páginas não autorizadas
tentarem usar as APIs e para um script comprometido exfiltrar dados. O AraLearn
mantém listas explícitas nos dois lados: as funções autorizam somente as
origens cadastradas, e a diretiva `connect-src` da CSP inclui somente o projeto
Supabase e provedores de assistência autorizados.

Inclua a origem do site, a do servidor local quando necessária e
`https://appassets.androidplatform.net` para o WebView. Nunca use `*`. CORS
decide se o servidor aceita a origem; CSP restringe o que a página pode tentar.
Um não substitui o outro, e nenhum deles substitui Auth, RLS ou validação de
capacidade no servidor. A definição normativa de CORS integra o padrão
[Fetch](https://fetch.spec.whatwg.org/#http-cors-protocol), e a CSP é definida
pela recomendação [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/).

## 9. Configuração pública e segredos

O servidor de desenvolvimento e os builds leem somente:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

A URL e a publishable key são identificadores públicos; sua segurança depende de RLS e das autorizações do servidor. Senha do banco, secret key, chave de assinatura e keystore são segredos e nunca entram no build.

Durante `npm.cmd run dev`, `/runtime-config.js` é gerado em memória. Nos builds, o arquivo é gerado dentro do artefato. `public/runtime-config.js` permanece vazio no repositório. A preparação rejeita chaves administrativas e exige HTTPS fora de `localhost`, `127.0.0.1` e do endereço especial do emulador Android.

A mesma etapa gera a diretiva `connect-src` da CSP com a origem exata do projeto. Não existe `connect-src https:` nem coringa de host local. Scripts permanecem restritos a `'self'`.

## 10. Ambiente local reproduzível

### Pré-requisitos

- Node.js e npm;
- Supabase CLI 2.109.1;
- Docker Desktop ou runtime compatível;
- Deno para validar as Edge Functions;
- Java 17 e Android SDK somente para o APK.

Use a versão fixada sem instalação global:

```powershell
npm.cmd ci
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

O validador verifica as três Edge Functions, lint do banco, pgTAP, RLS, PostgREST, Auth, publicação temporária, entrega de revisões e MCP. Ao terminar:

```powershell
npx.cmd --yes supabase@2.109.1 stop --no-backup
```

Para abrir o aplicativo, obtenha a URL e a publishable key mostradas por `supabase status`, defina as duas variáveis públicas e execute `npm.cmd run dev`.

## 11. Vinculação e aplicação no projeto remoto

Crie o projeto no painel e guarde credenciais administrativas em um gerenciador de segredos. Faça primeiro a simulação protegida:

```powershell
npx.cmd --yes supabase@2.109.1 login
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co
```

O script vincula o projeto, mostra o histórico e executa `db push --linked --dry-run`. Interrompa se houver migration desconhecida ou divergência. Para aplicar:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply
```

O terminal exige `APLICAR` e recebe a senha pelo prompt da CLI. Em seguida:

```powershell
npx.cmd --yes supabase@2.109.1 migration list --linked
npx.cmd --yes supabase@2.109.1 db lint --linked --level warning --fail-on warning
```

Um erro `PGRST202` ou “schema cache” em uma RPC costuma indicar que aplicação e migrations estão em revisões diferentes. Limpar IndexedDB não corrige o servidor. Compare o histórico, aplique somente migrations pendentes e repita lint e smoke.

Para implantar também as funções:

```powershell
pwsh -NoProfile -File .\scripts\deploySupabase.ps1 `
  -ProjectUrl https://abc123abc123abc123ab.supabase.co `
  -Mode Apply `
  -DeployAuthoringFunctions `
  -PublicAppUrl https://aplicacao.exemplo.org/ `
  -AllowedOrigin "https://aplicacao.exemplo.org","http://localhost:4182","http://127.0.0.1:4182"
```

Ao chamar `pwsh -File`, mantenha a lista de origens na mesma linha e separada por vírgulas. O roteiro preserva as origens obrigatórias do site, do desenvolvimento local e do Android.

## 12. Sincronização, retenção e custo

O feed incremental conserva mudanças pessoais leves. Conteúdo pedagógico não passa por `apply_sync_batch`; revisões são artefatos imutáveis. Cada mutação sincronizável possui identidade e sequência causal. Repetição após timeout devolve o resultado idempotente; uma rejeição determinística reverte apenas aquela operação.

Retenção é a política que determina por quanto tempo histórico e recibos permanecem disponíveis. Os valores correntes são:

- dispositivo considerado ativo por 90 dias;
- mudanças do feed conservadas por pelo menos 30 dias, respeitado o watermark seguro;
- recibos de mutação do dispositivo conservados por 90 dias;
- até 200 eventos recentes por workspace;
- observações transitórias por 14 dias e estados temporários de governança por 7 dias;
- artefatos sem referência elegíveis à coleta somente após a janela de segurança configurada.

`compact_sync_history` calcula o menor ponto que ainda pode ser necessário aos dispositivos ativos. A rotina diária usa advisory lock para impedir duas compactações concorrentes. Retenção reduz armazenamento, mas um dispositivo ausente além da janela pode precisar de novo bootstrap; não se promete replay ilimitado.

### Orçamento do plano gratuito

Os limites do provedor mudam. Na consulta realizada em 14 de agosto de 2026, o plano gratuito informava 500 MB de banco, 1 GB de Storage, 5 GB de egress, 5 GB de cached egress e 500 mil invocações mensais de funções. As Edge Functions informavam 256 MB de memória, 150 segundos de duração e 2 segundos de CPU por requisição. Antes de planejar uma implantação, confirme separadamente as [cotas comerciais](https://supabase.com/pricing), as [características de compute e disco](https://supabase.com/docs/guides/platform/compute-and-disk) e os [limites das Edge Functions](https://supabase.com/docs/guides/functions/limits).

As decisões de artefato imutável, seleção leve, continuidade compacta e coleta de lixo existem para manter o consumo proporcional a revisões distintas, não ao número de estudantes.

## Publicação inicial das fixtures oficiais

As fixtures em `supabase/fixtures/catalog/` são exemplos e material de validação; não são seed remoto nem entram no site ou APK. Para publicar uma fixture oficial, primeiro valide contrato e catálogo:

```powershell
npm.cmd run validate:example
npm.cmd run catalog:validate
```

Depois use o fluxo administrativo de autoria e publicação. A publicação deve produzir o JSON canônico, calcular SHA-256, pré-registrar o descritor, enviar o objeto, conferir hash e tamanho e concluir a revisão. Não copie a fixture diretamente para uma tabela ou bucket, pois isso contornaria autorização, proveniência e coleta de lixo.

Uma publicação oficial precisa estar vinculada a uma coleção ativa e possuir alias distribuído. O aplicativo descobre seus metadados no catálogo e baixa a revisão somente quando a conta a seleciona.

## 13. Web e Android

Web e APK recebem a mesma URL de projeto e publishable key. O build Android exige HTTPS e inclui a configuração no artefato. Chaves de assinatura ficam apenas no processo local:

- `ARALEARN_ANDROID_KEYSTORE_PATH`;
- `ARALEARN_ANDROID_KEYSTORE_PASSWORD`;
- `ARALEARN_ANDROID_KEY_ALIAS`;
- `ARALEARN_ANDROID_KEY_PASSWORD`.

`verifyDeploymentArtifacts.ps1` examina configuração, CSP, ausência de segredos, ausência de catálogo embarcado e, no Android, os recursos dentro do APK. Ele não prova migrations, RLS, SMTP ou disponibilidade remota; esses pontos exigem lint, smoke e teste funcional.

## 14. Verificação hospedada

Depois de aplicar migrations, configurar Auth, implantar funções e publicar ao menos um curso, execute o procedimento de [smoke no projeto hospedado](implantacao.md#9-smoke-no-projeto-hospedado). O teste cria duas contas temporárias, verifica isolamento, RPCs, artefatos e limpeza.

Antes de liberar a instalação, comprove ainda:

1. cadastro, confirmação, recuperação e troca de senha;
2. seleção de curso e materialização verificada;
3. estudo sem rede e retomada após reinício;
4. reconexão, envio da fila local e continuidade em outro dispositivo;
5. conflito CAS e repetição idempotente;
6. autoria, revisão, publicação e retirada conforme a capacidade da conta;
7. ausência de segredo em site e APK;
8. restauração a partir de backup ensaiada.

## 15. Fontes de evidência

As afirmações deste documento podem ser confrontadas em quatro camadas:

- esquema e regras: `supabase/migrations/` e `supabase/tests/`;
- protocolos de servidor: `supabase/functions/`;
- implantação: `scripts/deploySupabase.ps1`, `scripts/validateLocalSupabase.ps1` e `scripts/verifyDeploymentArtifacts.ps1`;
- compatibilidade do cliente: manifesto público do runtime e testes de integração.

Um teste aprovado demonstra o cenário codificado, não disponibilidade permanente do provedor, segurança absoluta ou restauração bem-sucedida de um backup que nunca foi ensaiado.
