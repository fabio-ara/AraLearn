# Exemplos de operações de autoria

Os arquivos deste diretório mostram o formato de operações pequenas. Eles não
são cursos completos nem sequências prontas para copiar sem leitura. Servem
para relacionar três conceitos do gateway:

- `requestId` identifica uma tentativa e permite repetir a mesma chamada com
  os mesmos argumentos;
- `expectedRevision` protege uma escrita contra alterações concorrentes;
- ids e caminhos identificam entidades da árvore corrente do workspace.

Esses valores dependem da execução. Um exemplo não pode fornecer a revisão ou
os ids válidos de outro workspace.

## Exemplos disponíveis

| Arquivo | O que demonstra | Leitura necessária antes do uso |
| --- | --- | --- |
| `01-workspace-create.json` | Pedido mínimo para criar um workspace vazio, com título e contexto estável | Confirmar que não será reutilizado um workspace existente. |
| `02-rename-entity.json` | Operação `rename_entity` protegida por revisão | Ler `outline` ou `entity` e copiar `expectedRevision` e `entityPath` atuais. |
| `03-editorial-submission.json` | Fixação privada de uma revisão antes de submissão editorial | Ler o curso, confirmar a revisão e obter autorização explícita para fixá-la. |

`02-rename-entity.json` ilustra o payload do roteador de operações. Clientes
MCP devem usar o schema anunciado pela ferramenta correspondente, sem supor
que o fragmento seja um segundo contrato público.

## Como estudar um exemplo

### Pré-condição

Tenha acesso a um ambiente de autoria e conheça a ferramenta à qual o fragmento
se refere.

### Passos

1. Leia o exemplo sem alterar seus arquivos de origem.
2. Consulte o workspace e obtenha ids, caminhos e revisão atuais.
3. Confira o schema anunciado pela ferramenta.
4. Construa um novo payload, com um `requestId` novo e estável.
5. Execute a operação e guarde a revisão devolvida.
6. Releia o recorte alterado e confirme o resultado humano esperado.

### Resultado esperado

A operação modifica somente o alvo declarado e devolve uma revisão mais nova.
O exemplo permanece apenas como documentação.

### Offline e recuperação

As operações dependem do gateway remoto. Se a conexão cair durante uma
escrita, repita o mesmo `requestId` somente com argumentos idênticos. Se não
for possível confirmar o resultado, releia o workspace antes de criar outra
tentativa.

## Validar os exemplos

```powershell
npm run validate:example
npm run authoring:packages
npm run test:authoring-packages
```

O comando `validate:example` usa os exemplos canônicos configurados nos scripts
do projeto. Estes fragmentos, por sua vez, explicam chamadas do ciclo de autoria
e não substituem um documento integral de curso.

## Diagnóstico

| Falha | Significado | Recuperação |
| --- | --- | --- |
| Conflito de revisão | O workspace mudou depois da leitura | Releia o alvo e reconstrua a operação sobre a revisão atual. |
| Entidade não encontrada | O id ou `entityPath` pertence a outra árvore ou foi movido | Leia `outline` novamente e copie o caminho completo. |
| Repetição rejeitada | O mesmo `requestId` foi usado com argumentos diferentes | Preserve a tentativa antiga e gere outro `requestId`. |
| Publicação negada | A conta não tem a capacidade necessária ou faltou autorização humana | Não tente contornar a permissão; confirme o âmbito e a intenção. |
