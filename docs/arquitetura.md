# Arquitetura

O AraLearn atual é um aplicativo estudantil offline-first. O PostgreSQL do Supabase mantém o catálogo compartilhado e o estado pessoal canônico; o IndexedDB mantém, por usuário e dispositivo, as linhas necessárias ao estudo sem conexão.

## Visão de domínio

O contrato público mantém a árvore didática:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

O documento raiz usa `contract: "aralearn.contract"`, `version: 3` e `kind: "project"`. Essa visão é montada em memória a partir de linhas relacionais; ela não é salva como um único documento no PostgreSQL nem no IndexedDB.

**Coleções** e **trilhas** não pertencem ao contrato v3. Coleções são agrupamentos administrativos do catálogo oficial. Trilhas são organizações pessoais dos cursos selecionados pelo estudante: cada curso ocupa no máximo uma trilha. Movê-lo para outra trilha atualiza a mesma associação ordenada e preserva sua seleção na biblioteca.

## Catálogo compartilhado

Curso, módulo, lição, tópico, microssequência, dependência, card, bloco e recursos estruturados são linhas com UUIDs, chaves estrangeiras e posição. Cada curso oficial publicado possui uma única árvore no PostgreSQL.

A biblioteca consulta apenas coleções e metadados. Ao adicionar um curso, `select_catalog_course` cria uma linha em `user_course_selections`; nenhuma árvore é clonada para a conta. O dispositivo solicita `get_selected_course_graph` e armazena a árvore no cache IndexedDB desse usuário.

Uma publicação oficial selecionada permanece imutável e compartilhada. Retirar o curso remove somente a seleção e o estado pessoal relacionado; não altera a publicação nem a biblioteca de outra conta. Nenhum curso operacional é empacotado no site ou no APK.

A interface completa continua oferecendo edição e assistência bottom-up. A primeira gravação autoral sobre uma publicação executa copy-on-write: uma RPC transacional cria uma árvore pessoal independente com UUIDs novos, preserva as chaves do contrato e troca a seleção da conta. A partir daí o diff envia apenas as linhas alteradas. A simples seleção ou leitura nunca duplica conteúdo no PostgreSQL.

## Estado pessoal

O estado que cresce por usuário é pequeno e relacional:

- seleções de cursos;
- trilhas e referências ordenadas;
- progresso de lições e cards;
- comentários por card.

Essas relações usam identidades naturais estáveis e são protegidas por RLS. Um usuário autenticado pode ler publicações oficiais, mas somente o próprio `auth.uid()` pode ler ou alterar seu estado pessoal.

## Réplica offline

Cada conta usa um banco físico `aralearn-relational-v2:user:<uuid>`. O e-mail não participa da identidade local. Entrar com outra conta abre outro banco; logout não apaga a réplica nem a outbox da conta anterior.

O bootstrap recebe o estado pessoal, os metadados selecionados e um `highWaterSequence` coerente. A aplicação grava snapshot e cursor numa única transação local e baixa separadamente apenas as árvores selecionadas ausentes ou desatualizadas.

A árvore oficial no IndexedDB é cache de leitura. Quando a publicação muda, a versão atual é baixada, validada relacionalmente e remontada como contrato v3 antes da troca transacional; um download incompleto ou grafo inválido preserva o cache anterior. Se uma entidade removida ainda tiver mutação local não resolvida, a atualização fica adiada e conserva tanto o cache quanto a outbox até uma resolução explícita.

Arquivar uma publicação retira, na mesma transação remota, as seleções e o estado pessoal relacionado. O feed torna essa retirada visível aos dispositivos; o bootstrap nunca devolve curso arquivado. Exclusão física direta da árvore canônica é proibida.

## Sincronização

Uma ação pessoal segue este fluxo:

```text
alteração em memória
→ transação IndexedDB
→ mutação pequena na outbox
→ push oportunista
→ pull incremental paginado
```

A sincronização é automática quando o app está visível e online: na inicialização, ao recuperar rede, ao voltar à tela e após gravações locais. Fechar ou ocultar o app encerra o ciclo periódico. O controle manual apenas solicita uma tentativa imediata.

`mutationId` torna repetições idempotentes. O pull aplica uma página por transação e só então persiste o cursor. Rede instável mantém a mutação pendente; falha de autenticação preserva integralmente a outbox até novo login.

Para o mesmo estado pessoal, vale a última mutação válida confirmada pelo servidor. O runtime estudantil não oferece versionamento, revisão autoral, merge ou resolução manual de conflitos.

## Autenticação e segurança

Sem sessão, o runtime mostra somente a porta de autenticação. Cadastro, confirmação, recuperação, login, renovação e saída usam Supabase Auth no runtime JavaScript compartilhado pela web e pelo WebView Android.

O frontend recebe somente Project URL e publishable key. Service role, senha de banco e outros segredos administrativos não entram no site, no APK ou no IndexedDB. Tabelas técnicas são encapsuladas por RPCs autorizadas com `search_path` fixo.

## Camadas de código

| Camada | Responsabilidade atual |
|---|---|
| `src/domain/` | Entidades e validações do domínio. |
| `src/contract/` | Contrato público v3 e validação estrutural. |
| `src/model/` | Conversões internas para apresentação. |
| `src/render/` | Renderização dos cards e telas de estudo. |
| `src/ui/` | Autenticação, biblioteca, trilhas, navegação, estudo e superfícies de autoria. |
| `src/persistence/` | Normalização, montagem, transações e repositório relacional. |
| `src/supabase/` | Configuração pública, Auth, catálogo e cliente HTTP. |
| `src/sync/` | Dispositivo, outbox, bootstrap e sincronização incremental. |
| `src/generation/` | Planejamento top-down, assistência bottom-up e geração estruturada. |

## Contrato, validação e publicação

O JSON v3 permanece útil para intercâmbio, testes, validação integral, ferramentas administrativas e montagem da visão de domínio. A publicação oficial segue:

```text
JSON v3 válido
→ normalização relacional
→ staging administrativo
→ validação integral
→ publicação atômica
```

Cursos grandes podem ser enviados em fragmentos idempotentes, mas só aparecem no catálogo depois da validação final. Fixtures não são catálogo operacional.

## Fora do runtime atual

O runtime não oferece versionamento ou merge manual de conteúdo, GPT Actions, Edge Function administrativa nem fluxo Planner/Builder/Auditor. A futura autoria administrativa por GPT personalizado será outro sistema, separado do aplicativo e sem acesso bruto às tabelas.

Consulte [Persistência relacional e sincronização](persistencia-relacional.md), [Contrato público](aralearn-contract.md) e [Estado atual e próximos passos](estado-atual-e-roadmap.md).
