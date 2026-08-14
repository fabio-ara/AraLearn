# Configurar autoria no Gemini

Uma Gem e um cliente MCP resolvem problemas diferentes:

- a **Gem** conserva instruções e arquivos de conhecimento para planejamento e
  produção por documentos;
- um **cliente MCP compatível** consulta o catálogo atual, lê workspaces — os
  espaços persistentes que guardam cursos em construção — e executa ferramentas
  remotas.

Adicionar arquivos a uma Gem não instala uma conexão MCP. Para gravar
diretamente no AraLearn, o ambiente escolhido precisa oferecer Streamable HTTP,
OAuth 2.1 com PKCE e controle explícito das ferramentas.

## Usar uma Gem por arquivos

### Pré-condição

Tenha acesso à criação de Gems e ao pacote Gemini gerado pelo AraLearn.

### Passos

1. Crie uma Gem.
2. Cole `GEM_INSTRUCTIONS.md` nas instruções.
3. Adicione `core/`, `knowledge/`, `schemas/`,
   `docs/aralearn-contract.md` e `docs/recursos-de-card.md` ao conhecimento.
4. Se houver limite de anexos, reúna os textos sem retirar schemas nem
   cabeçalhos que distinguem cada responsabilidade.
5. Planeje ou revise apenas com os contratos disponíveis nos arquivos.
6. Valide o documento final no AraLearn antes de incorporá-lo ao estado
   relacional.

### Resultado esperado

A Gem produz ou revisa documentos, mas não lista workspaces, não descobre novos
packages e não publica no catálogo.

### Offline e recuperação

O acesso aos arquivos segue as condições da plataforma; validação e gravação no
AraLearn exigem rede. Quando faltar o contrato exato, forneça a saída atual de
`contracts` ou use um ambiente MCP. Não coloque tokens ou credenciais em
instruções e anexos.

## Usar um ambiente com MCP

### Pré-condição

Escolha um cliente Gemini ou ambiente de desenvolvimento que aceite servidor
MCP remoto e OAuth. O suporte varia entre produtos; confirme-o na documentação
do cliente, e não apenas na disponibilidade de Gems ou Skills.

### Passos

1. Registre o endpoint Streamable HTTP do AraLearn no cliente.
2. Ative OAuth 2.1 e conclua o fluxo com PKCE.
3. Conserve o access token no cofre do próprio cliente.
4. Inicie com `prepararAutoriaAraLearn` e uma leitura `resume` do workspace.
5. Descubra os resources progressivamente antes de pedir contratos.
6. Faça uma escrita pequena e confirme a revisão devolvida.

Endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O token identifica a sessão, mas as capacidades efetivas continuam sendo
resolvidas no banco para a conta autenticada.

### Resultado esperado

O cliente acessa somente ferramentas e workspaces autorizados. A estrutura
criada aparece em Trilhas sem depender de publicação.

### Offline e recuperação

MCP remoto exige conexão. Depois de uma interrupção, releia `resume`; não
reconstrua a revisão a partir do histórico do chat. Repita um `requestId`
somente com os mesmos argumentos.

## Agent Skills

Ambientes compatíveis, como determinadas configurações do Gemini CLI, podem
usar `SKILL.md`. O arquivo orienta o fluxo e a escolha de ferramentas; não
instala o servidor nem concede acesso. A conexão e a autorização continuam
etapas separadas.

## Teste mínimo

1. Liste workspaces da conta.
2. Leia um workspace em `view: "resume"`.
3. Consulte a biblioteca por `explore`, `search`, `inspect` e `contracts`.
4. Execute `validate_card` e `audit_representation`.
5. Grave um card com revisão atual.
6. Confirme o conflito ao usar uma revisão antiga.

## Diagnóstico

| Sintoma | Causa provável | Recuperação |
| --- | --- | --- |
| A Gem não encontra ferramentas | Gem não é conexão MCP | Use um cliente MCP compatível ou trabalhe por documentos. |
| O cliente aceita Skills, mas não conecta | Skill e transporte são recursos diferentes | Configure endpoint e OAuth separadamente. |
| O OAuth não conclui | Cliente sem descoberta, PKCE ou armazenamento de token compatíveis | Use outro cliente ou o fluxo por arquivos. |
| O modelo inventa campos do resource | Contrato atual não foi consultado | Obtenha `contracts` depois de escolher o package. |
| A escrita parece perdida após queda | O chat não conserva o estado canônico | Releia o workspace e use a revisão devolvida pelo servidor. |

Consulte as [fontes oficiais](../SOURCES.md) e o roteiro de
[implantação](../../../docs/implantacao.md).
