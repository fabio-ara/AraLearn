# Guia do desenvolvedor

Este guia apresenta o modelo técnico necessário para modificar o AraLearn com segurança. O objetivo não é ensinar a sintaxe de cada linguagem, mas explicar onde cada responsabilidade vive, por que as fronteiras existem e quais evidências uma mudança precisa produzir.

## 1. Modelo mental do sistema

Alguns conceitos formam o vocabulário mínimo deste guia:

- **aplicação web**: programa executado por um navegador a partir de documentos, estilos e código de interface;
- **offline-first**: estratégia em que as ações que podem ser resolvidas no dispositivo usam primeiro o estado local e sincronizam com o servidor depois;
- **WebView**: componente do Android que incorpora um navegador dentro do aplicativo; o **APK** é o arquivo instalável que reúne esse componente e os demais arquivos Android;
- **front-end ou interface**: parte do sistema com a qual a pessoa interage;
- **runtime**: ambiente e código efetivamente em execução;
- **resource de card**: representação didática exibida num card; cada tipo é implementado por um **package**, isto é, um módulo autocontido;
- **envelope**: estrutura externa comum que identifica o package e sua posição no card;
- **kernel de resources**: núcleo estável que recebe packages, confere seu envelope e coordena sua execução sem conhecer os detalhes de cada representação;
- **IndexedDB**: banco de dados do navegador usado como réplica local durável, isto é, como cópia que continua disponível no dispositivo;
- **Supabase**: conjunto de serviços remotos usado pelo projeto; nele, PostgreSQL armazena relações e transações, Auth autentica contas, Storage guarda arquivos e Edge Functions executam código protegido no servidor.

O AraLearn é uma aplicação web offline-first empacotada também num WebView Android. O mesmo código de interface opera nos dois ambientes.

```text
interface e kernel de resources
        │
        ├── IndexedDB: réplica, estado local e fila durável
        │
        └── Supabase
            ├── PostgreSQL/Auth: relações, autoridade e transações
            ├── Storage: revisões imutáveis de curso
            └── Edge Functions: protocolos e segredos de servidor
```

Quatro regras evitam a maior parte dos erros arquiteturais:

1. transição local de estudo não espera a rede;
2. o cliente não recebe autoridade administrativa;
3. conteúdo publicado é artefato imutável; relações mutáveis ficam no banco;
4. o kernel conhece envelopes; cada package conhece sua representação.

Leia antes de alterar:

- [Arquitetura](arquitetura.md);
- [Persistência e sincronização](persistencia-relacional.md);
- [Contratos públicos](aralearn-contract.md);
- [Componentes didáticos e packages](componentes-didaticos.md);
- [Supabase](supabase.md);
- [Sistema visual](sistema-visual.md).

## 2. Preparar o ambiente

As ferramentas abaixo cumprem funções diferentes no desenvolvimento:

- **JavaScript** é a linguagem principal da aplicação; **Node.js 22 ou posterior** a executa fora do navegador e roda os scripts do repositório;
- **npm** instala dependências e oferece os comandos padronizados do projeto;
- **Git** registra versões do código; no Windows, os comandos operacionais usam **PowerShell 7**;
- **Playwright** automatiza um navegador Chromium; os testes **E2E** (*end to end*) exercitam jornadas completas pela interface;
- **Docker** cria ambientes locais isolados, **Deno** executa as funções de servidor e a **interface de linha de comando** (*command-line interface*, **CLI**) do Supabase, na versão 2.109.1, administra o ambiente Supabase;
- **Java 17** e o **kit de desenvolvimento de software do Android** (*software development kit*, **SDK**) compilam o APK.

Depois de clonar:

```powershell
npm.cmd ci
npm.cmd run dev
```

`npm ci` instala exatamente o **lockfile**, arquivo que fixa as versões das dependências; `npm install` pode recalculá-las e deve ser reservado a uma alteração intencional.

O servidor gera `/runtime-config.js` em memória a partir de:

```text
ARALEARN_SUPABASE_URL
ARALEARN_SUPABASE_PUBLISHABLE_KEY
```

Não preencha `public/runtime-config.js` nem use uma **secret key**, credencial com autoridade reservada ao servidor, no navegador. Para trabalhar apenas com **fixtures** — dados controlados usados em testes — e verificações que não exigem o backend, preserve a configuração vazia prevista por cada script.

## 3. Estrutura do repositório

Antes da tabela, convém distinguir os termos empregados nos nomes das camadas:

- **shell da aplicação** é o conjunto mínimo da interface; o **Service Worker** é o processo do navegador que o mantém disponível sem rede;
- **repositório**, neste contexto, é o componente que lê e grava dados; **schema** descreve a forma que esses dados devem ter; **invariante** é uma condição que deve permanecer verdadeira;
- **bootstrap** é a carga inicial; **feed** é o fluxo incremental de mudanças; **outbox** é a fila local de operações ainda não confirmadas pelo servidor;
- **registry** é o registro que associa cada package à sua implementação; **renderer** é o componente que converte os dados do package em apresentação;
- **UI** (*user interface*) é a interface; **provider** é o serviço externo que executa um modelo;
- **HTTP** é o protocolo de comunicação web; **PostgREST** expõe operações do PostgreSQL por HTTP;
- **migration** é uma alteração versionada e reproduzível do banco; **RPC** é uma operação do banco chamada remotamente como unidade; **RLS** (*row-level security*) restringe quais linhas cada conta pode acessar;
- **API** é uma interface para comunicação entre programas; **Action** é a fachada HTTP usada por plataformas que não chamam diretamente o *Model Context Protocol* (MCP);
- **pgTAP** testa regras do PostgreSQL; **smoke test** é uma verificação curta das funções essenciais num ambiente real;
- **build** é a produção dos artefatos distribuíveis a partir das fontes.

| Caminho | Responsabilidade |
|---|---|
| `public/` | shell, estilos, Service Worker e ativos servidos |
| `src/domain/` | invariantes do documento didático |
| `src/persistence/` | esquema relacional local, repositórios e montagem |
| `src/sync/` | bootstrap, feed, outbox e reconciliação |
| `src/resources/kernel/` | envelope, registry e validação comum |
| `src/resources/packages/` | contratos e renderizadores independentes |
| `src/resources/catalog/` | vocabulário e busca de packages |
| `src/render/` | composição de packages dentro do card |
| `src/ui/` | telas, foco, gestos e estados de interface |
| `src/assist/` e `src/generation/` | escopo, conversa, providers e validação da assistência |
| `src/supabase/` | cliente HTTP, Auth, catálogo e projeções remotas |
| `supabase/migrations/` | esquema e RPCs versionados |
| `supabase/functions/` | autoria, Action e entrega de revisões |
| `supabase/tests/` | pgTAP, PostgREST, Auth e smokes |
| `tests/kernel/` | contratos e regras isoladas |
| `tests/runtime/` | integração sem navegador completo |
| `tests/e2e/` | jornadas reais no Chromium |
| `scripts/` | geração, auditoria, build e implantação |
| `authoring/` | materiais-fonte da autoria externa |
| `docs/` | documentação pública e artefatos explicativos |

Antes de criar um diretório novo, verifique se a responsabilidade já possui uma fronteira. Duplicar uma regra entre UI, runtime e Edge Function cria divergência; adaptar uma entrada ao mesmo executor preserva o comportamento.

## 4. Fluxo de mudança

### 4.1 Formular a propriedade

Descreva primeiro o comportamento observável e o invariante. Exemplos:

- “tocar Play mostra feedback antes de qualquer requisição”;
- “cada lacuna altera apenas seu próprio alvo”;
- “commit sobre revisão antiga retorna conflito sem escrever parte alguma”.

Um teste deve provar a propriedade, não apenas executar uma função.

### 4.2 Localizar a autoridade

Pergunte onde a regra precisa ser garantida:

- aparência e foco: UI/CSS;
- forma do card: kernel/package;
- invariantes do curso: domínio;
- durabilidade local: persistência;
- concorrência compartilhada: RPC/PostgreSQL;
- segredo ou protocolo externo: Edge Function.

Pode haver validação defensiva em mais de uma fronteira, mas apenas uma deve ser a fonte da regra.

### 4.3 Alterar o menor recorte coerente

Edite implementação, testes, geração derivada e documentação na mesma mudança. Remova responsabilidade substituída; não mantenha fallback ou alias sem um contrato explícito de migração.

### 4.4 Validar por risco

Comece pelo teste específico, depois amplie. Uma mudança de texto documental não exige APK, mas uma alteração em Service Worker ou IndexedDB exige E2E e build. Uma migration exige banco local, RLS e PostgREST.

## 5. Alterar contratos e domínio

Mudanças em `aralearn.library.v1`, envelope de card ou semântica compartilhada têm alto impacto.

1. documente o invariante e sua compatibilidade;
2. atualize validador normativo;
3. atualize schema de integração quando aplicável;
4. atualize montagem relacional e fixtures;
5. acrescente casos válidos e inválidos;
6. regenere materiais derivados;
7. execute `validate:example`, `validate:cutover` e testes integrais.

Não use um normalizador para esconder documento inválido. Normalização resolve variações previstas; migração transforma dados de uma revisão conhecida; fallback indefinido acumula contratos paralelos.

## 6. Adicionar ou revisar package

Um package nasce de uma necessidade de representação, não de uma variação estética. Siga o processo de [Componentes didáticos e packages](componentes-didaticos.md): justificativa, convenção acadêmica, contrato de alto nível, renderer, acessibilidade, edição e práticas internas.

Comandos principais:

```powershell
npm.cmd run resources:gallery:fixture
npm.cmd run resources:test-course
npm.cmd run resources:test-course:e2e
npm.cmd run resources:gallery:visual
npm.cmd run validate:resource-corpus
npm.cmd run resources:sync-edge
npm.cmd run authoring:packages
```

`resources:sync-edge` mantém o runtime das funções coerente com o registry do app. `authoring:packages` gera downloads a partir das fontes; não edite o resultado derivado diretamente.

Teste ao menos exposição, alvo textual, lacunas independentes, digitação, texto longo, claro/escuro, larguras móveis, equivalente acessível e exemplo complexo. Um screenshot simples não testa escalabilidade.

## 7. Alterar persistência local

IndexedDB contém estado durável do dispositivo. Mudar stores, índices ou forma das rows requer:

1. nova versão do banco;
2. upgrade idempotente;
3. migração dos dados existentes ou descarte explicitamente seguro da classe derivada;
4. teste partindo da versão anterior;
5. teste de interrupção durante a escrita;
6. compatibilidade com montagem e sincronização.

Não confunda IndexedDB com cache descartável. Progresso, rascunho ou outbox não podem ser apagados para corrigir uma incompatibilidade de servidor. Consulte a [persistência relacional](persistencia-relacional.md).

## 8. Criar uma migration Supabase

Migration é a evolução reproduzível do banco. Para criar uma, use o fluxo da CLI ou um arquivo numerado coerente em `supabase/migrations/`; não edite uma migration já aplicada.

Antes de escrever:

- defina estado anterior e posterior;
- identifique locks e duração esperada;
- preserve RLS e grants;
- torne backfill observável e limitado;
- planeje a aplicação antes do novo cliente;
- escreva teste pgTAP ou runtime para o invariante.

Valide localmente:

```powershell
npx.cmd --yes supabase@2.109.1 start
npx.cmd --yes supabase@2.109.1 db reset
pwsh -NoProfile -File .\scripts\validateLocalSupabase.ps1
```

`db reset` é local. No remoto, `deploySupabase.ps1` exige dry-run e confirmação. Veja [Supabase no AraLearn](supabase.md).

### RLS e RPC

Uma nova tabela exposta precisa de RLS e políticas negativas/positivas testadas com contas distintas. Uma RPC deve representar unidade transacional, validar sessão, capacidade, alvo, revisão e limites. `security definer` exige especial cuidado com `search_path`, grants e entrada.

## 9. Alterar sincronização

Nesta seção, **CAS** (*compare-and-swap*) é a regra que só aceita uma gravação quando a revisão ainda é a mesma que o cliente leu; se outra sessão a alterou, ocorre conflito em vez de sobrescrita silenciosa.

Sincronização combina rede não confiável e estado local durável. Teste:

- repetição após timeout;
- ordenação causal;
- rejeição de uma operação sem perder as outras;
- conflito CAS;
- remoção remota com mutação local pendente;
- bootstrap depois da janela de retenção;
- alternância de conta no mesmo dispositivo;
- fechamento do processo antes e depois do commit local.

Evite uma outbox universal com payload arbitrário. Cada família de mutação precisa de identidade, limite e reconciliação próprios.

## 10. Alterar interface e sistema visual

Use **tokens de design** — nomes estáveis para decisões visuais como cor, espaço e estado — definidos em `public/styles-tokens.css`, além dos componentes existentes e dos ícones de `src/ui/renderUiIcons.js`. Não introduza cor literal, emoji funcional ou medição geométrica manual quando um renderer especializado resolve o problema.

Teste:

- toque e teclado;
- foco restaurado;
- 360, 390, 412 e 1280 px;
- claro, escuro e Sistema;
- zoom/reflow;
- offline e CPU reduzida para ações imediatas;
- scroll dentro e fora de frames;
- nomes, papéis e estados acessíveis.

Execute `audit:frontend` e `audit:residues`. Uma tela antiga mantida invisível ainda é responsabilidade duplicada.

## 11. Alterar assistência por API

Provider remoto não recebe autoridade direta sobre o projeto. Preserve:

- escopo derivado da seleção;
- contexto de leitura separado dos caminhos graváveis;
- contratos exatos dos packages usados;
- limites de prompt, resposta, itens e tentativas;
- validação estrutural e semântica do retorno;
- ledger volátil de versões para desfazer/refazer;
- segredo do provider apenas na memória da página.

Teste resposta malformada, mudança fora do escopo, timeout, nova iteração sobre resultado anterior e restauração. Um modelo mais capaz não substitui a barreira determinística.

## 12. Service Worker e artefatos

O Service Worker determina o shell offline. Uma mudança precisa conservar:

- revisão de cache derivada do conteúdo;
- exclusão de callback de autenticação;
- atualização sem travar versão antiga indefinidamente;
- funcionamento em subcaminho de hospedagem;
- tipos MIME e arquivos do manifest.

Use `pages:build`, `deployment:verify-site` no host e `verifyDeploymentArtifacts.ps1`. Não edite a revisão do cache manualmente.

## 13. Estratégia de testes

| Camada | Finalidade | Comando ou local |
|---|---|---|
| lint | erros estáticos e convenções | `npm.cmd run lint` |
| kernel | contratos e regras puras | `tests/kernel/` |
| runtime | integração de módulos | `tests/runtime/` |
| E2E | jornadas no navegador | `npm.cmd run test:e2e` |
| Supabase local | migrations, RLS, RPC, Auth e funções | `validateLocalSupabase.ps1` |
| artefato | site e APK produzidos | `verifyDeploymentArtifacts.ps1` |
| remoto | serviço realmente implantado | smoke hospedado |
| visual | temas, larguras e geometrias | `resources:gallery:visual` |

Suíte geral:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run validate:example
npm.cmd run validate:cutover
npm.cmd run catalog:validate
npm.cmd run audit:frontend
npm.cmd run audit:residues
npm.cmd run audit:docs
```

E2E inicia servidor isolado. Se a porta estiver ocupada, defina `ARALEARN_E2E_PORT`; não encerre uma sessão de desenvolvimento alheia.

## 14. Documentação e codificação

Mudança de comportamento, estrutura, persistência, fluxo ou regra atualiza documentação pública e memória operacional no mesmo ciclo. Escreva UTF-8 sem BOM e preserve acentuação. `audit:docs` verifica links, âncoras, títulos, hierarquia e resíduos contextuais.

Documentação descreve o produto e justifica decisões. Comentários de percurso, nomes de interlocutores e instruções de uma sessão de trabalho não pertencem ao texto público.

## 15. Segurança

- nunca registre secret key, senha, token, keystore ou chave de provider;
- não mostre segredo em log de diagnóstico;
- trate conteúdo autoral como entrada não confiável;
- escape HTML e restrinja origens de rede;
- mantenha CSP e CORS com origens exatas;
- revalide capacidade no servidor;
- aplique limites antes de alocar payload grande;
- não use teste aprovado como argumento para reduzir RLS ou validação.

## 16. Checklist de conclusão

- [ ] propriedade e autoridade foram identificadas;
- [ ] responsabilidade não foi duplicada;
- [ ] implementação e testes específicos foram atualizados;
- [ ] dados existentes possuem migração ou tratamento seguro;
- [ ] offline, repetição e conflito foram considerados;
- [ ] acessibilidade e mobile foram verificados quando há UI;
- [ ] artefatos derivados foram regenerados pelas fontes;
- [ ] documentação foi atualizada;
- [ ] `git diff --check` está limpo;
- [ ] validações proporcionais ao risco foram executadas e registradas.

Consulte também [CONTRIBUTING.md](../CONTRIBUTING.md).
