# Autoria e publicação

O AraLearn publica cursos a partir do contrato JSON v4. A construção extensa
acontece num workspace composto acessado pelo gateway MCP. Um reparo ou card
criado no aplicativo permanece como `localDraft`; para levá-lo ao fluxo remoto,
a pessoa exporta o documento e pede ao assistente que o importe.

Fixtures oficiais continuam usando uma ferramenta de implantação separada.
Elas não são uma forma de editar cursos pelo aplicativo.

## Da conversa ao workspace

O assistente pode listar e ler cursos acessíveis antes de criar conteúdo. Um
workspace pode começar vazio, partir de um curso, reunir vários cursos ou abrir
uma revisão editorial já assumida.

As operações são focadas:

- registrar estrutura planejada em lotes pequenos;
- salvar os cards de uma microssequência;
- corrigir metadados ou um card;
- copiar, renomear, mover ou excluir partes;
- juntar e separar microssequências;
- transformar módulo em curso ou curso em módulo.

O PostgreSQL mantém uma linha corrente por parte. Cada alteração informa
`expectedRevision` e `requestId`, toca somente o necessário e valida o documento
recomposto. Não há merge silencioso, cópias integrais do workspace no Storage
nem restauração de estados antigos.

Copiar cria novas identidades e mantém a origem. Mover transfere a parte atual
e remove a origem na mesma confirmação. Assim, módulos, lições,
microssequências e cards podem atravessar cursos sem compartilhar estado.

## Revisão humana durante a autoria

O assistente mostra por padrão somente as microteorias produzidas e a quantidade
de práticas. A pessoa autora consegue avaliar recorte, sequência e explicação
conceitual sem receber todos os exercícios no chat. As práticas continuam no
curso e podem ser lidas sob demanda.

O procedimento em linguagem comum está em [Criar cursos pelo
chat](criar-cursos-pelo-chat.md).

## Prévia privada

| Destino | Estado | Resultado |
| --- | --- | --- |
| biblioteca privada | `partial` | prévia estudável, mesmo com microssequências ainda em construção |
| biblioteca privada | `complete` | curso pessoal integral |
| catálogo | `complete` | revisão editorial publicada |

Uma prévia `partial` permite testar cedo o que já está pronto. O catálogo recusa
`partial`. Atualizar uma publicação existente exige o hash vigente, impedindo
sobrescrita acidental.

## Submissão editorial

Uma pessoa autora envia uma revisão privada específica para avaliação. A
submissão registra seu hash e pode conter uma nota curta. Ela não concede à
equipe editorial acesso aos outros cursos privados da conta.

O fluxo é:

```text
publicação privada
→ submissão
→ fila de revisão
→ workspace editorial independente
→ pedido de ajustes, rejeição ou publicação
```

A pessoa autora acompanha os próprios envios, inclusive depois de uma decisão.
A listagem conserva o hash enviado, a nota da autoria, o parecer editorial e a
data da decisão; portanto, a orientação continua legível mesmo quando o JSON
antigo já não precisa permanecer no Storage.

Há no máximo uma submissão ativa de cada curso por pessoa:

- repetir o mesmo hash ainda ativo recupera o mesmo envio;
- publicar uma revisão nova substitui automaticamente um envio que ainda esteja
  apenas aguardando na fila;
- uma revisão já assumida não é atropelada: a pessoa aguarda a decisão ou pede
  explicitamente a retirada antes de enviar outra.

Quando recebe um pedido de ajustes, a pessoa continua seu próprio workspace,
publica outra vez o mesmo curso privado e submete o novo hash. A submissão
anterior fica como registro compacto da decisão, sem conservar outra cópia do
curso.

Quem revisa assume um item da fila, lê o artefato exato e abre um workspace
editorial independente. A reserva dura 30 minutos e é renovada quando o mesmo
revisor retoma o trabalho. Depois de expirar, outra pessoa pode assumir; o
AraLearn fecha workspaces editoriais abandonados antes da transferência, para
que duas cópias não avancem como se fossem a revisão vigente. Pedir ajustes ou
rejeitar exige justificativa. Publicar um curso completo em uma coleção marca a
submissão como aceita.

## Capacidades por conta

Não existe um GPT administrativo separado. Plugin e Chatbot usam o mesmo
executor; o backend mostra apenas as capacidades que a conta conectada possui:

- autoria privada e leitura da própria biblioteca em Trilhas;
- leitura de Coleções somente com capacidade editorial;
- submissão de curso próprio;
- revisão da fila;
- publicação e organização do catálogo.

Essas capacidades vêm do banco, não de um texto que o assistente possa inventar
nem de um `scope` confiado ao modelo. A conexão usa OAuth, e a service role
permanece exclusivamente no ambiente protegido da Edge Function. Nenhuma
capacidade editorial concede acesso a progresso, comentários ou trilhas de
outras pessoas.

Uma conta com `catalog:read` pode pedir “procure cursos sobre Kubernetes e
virtualização”. O assistente usa `consultarCatalogo` com
`operation: "search_courses"` uma vez para pesquisar todas as Coleções: cada
termo precisa aparecer em algum metadado do curso ou da coleção. A lista
compacta informa onde o curso está, seu hash, revisão e contagens; o conteúdo
só é lido depois, quando um curso ou uma parte for realmente necessário como
contexto. Contas privadas não recebem essa ferramenta.

## Artefatos e organização do catálogo

Somente ao publicar o servidor recompõe o curso, valida o contrato, calcula
SHA-256 e grava o artefato imutável no Storage. A submissão aponta para esse
mesmo conteúdo exato. A atualização troca a única referência corrente do curso;
um artefato anterior sem referência de curso nem de submissão torna-se elegível
à coleta de lixo.

O trabalho entregue por outro autor segue submissão e revisão. Uma conta
editorial também pode criar ou atualizar diretamente um curso `complete` de seu
próprio workspace, desde que informe a coleção e tenha a capacidade efetiva.

Coleções, ordem e posicionamento dos cursos são metadados relacionais. Mover ou
renomear uma coleção não reabre a árvore pedagógica.

Fixtures oficiais são validadas e publicadas com:

```powershell
npm run catalog:validate
npm run catalog:publish
```

Consulte [Gateway MCP de autoria](autoria-mcp.md), [Workspaces compostos e
artefatos](plano-de-controle-e-artefatos.md) e [Contrato
público](aralearn-contract.md).
