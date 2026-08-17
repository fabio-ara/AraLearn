# Configurar autoria no Claude

O Claude oferece duas formas diferentes de apoio à autoria:

- um **Project** conserva instruções e arquivos de conhecimento, mas não ganha
  acesso ao AraLearn apenas porque esses arquivos foram anexados;
- um **conector MCP remoto** permite chamar as ferramentas do AraLearn e gravar
  no workspace — o espaço persistente que guarda a árvore corrente —, desde
  que o ambiente aceite OAuth 2.1 e o usuário autorize a conta.

Escolher a forma correta evita uma confusão frequente: conhecimento sobre o
contrato não equivale a uma conexão capaz de consultar o contrato atual ou
persistir conteúdo.

## Usar um Project sem conexão MCP

### Pré-condição

Tenha permissão para criar um Project e os arquivos do pacote Claude gerado
pelo AraLearn.

### Passos

1. Crie um Project.
2. Use `PROJECT_INSTRUCTIONS.md` como instruções do Project.
3. Adicione `core/`, `knowledge/`, `schemas/`,
   `docs/aralearn-contract.md` e `docs/componentes-didaticos.md` ao conhecimento.
4. Se houver limite de anexos, reúna os textos em um arquivo único sem remover
   schemas nem distinguir menos as seções.
5. Use o Project para planejar, revisar ou produzir conteúdo apenas quando os
   contratos exatos necessários tiverem sido fornecidos.
6. Valide o documento pelo fluxo disponível no AraLearn antes de incorporá-lo.

### Resultado esperado

O Project consegue raciocinar sobre os arquivos recebidos, mas não lista
workspaces, não descobre packages e não grava no banco por conta própria.

### Offline e recuperação

Os arquivos permanecem disponíveis conforme as regras da plataforma, mas
qualquer validação ou incorporação no AraLearn exige conexão. Se o contrato de
um resource não estiver no material anexado, não peça ao modelo que o invente;
obtenha a definição pelo MCP ou escolha uma representação cujo contrato esteja
disponível.

## Conectar o MCP remoto

### Pré-condição

O ambiente Claude precisa permitir conectores MCP remotos personalizados. Em
contas organizacionais, proprietários podem precisar autorizar o conector antes
de os membros o conectarem; a disponibilidade depende do plano e da política.

### Passos

1. No AraLearn, copie o endpoint apresentado na área de integração.
2. Em uma conta individual compatível, abra **Customize > Connectors**, use
   **Add custom connector** e informe o endpoint.
3. Em Team ou Enterprise, a pessoa administradora registra o conector em
   **Organization settings > Connectors**; depois, cada membro autorizado o
   conecta em **Customize > Connectors**.
4. Selecione OAuth e conclua a autorização com a conta AraLearn correta.
5. Em uma conversa nova, liste workspaces e leia `resume` antes de escrever.

Endpoint:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

O transporte é Streamable HTTP. O servidor oferece descoberta de protected
resource e OAuth 2.1 com PKCE. O tráfego de um conector remoto parte da nuvem da
plataforma, portanto o endpoint precisa ser publicamente alcançável por HTTPS.

### Resultado esperado

O Claude vê o registro de ferramentas permitido e o AraLearn reavalia a
autorização da conta em cada operação.

### Offline e recuperação

O conector remoto exige rede. Se uma escrita for interrompida, retome o
workspace e confira a revisão antes de continuar. Um Project não funciona como
fila offline para operações MCP.

## Usar Agent Skills

Ambientes compatíveis podem instalar o `SKILL.md` incluído no pacote. O Skill
orienta o processo de autoria, mas não cria o conector, não autentica a conta e
não concede permissão. Mantenha essas responsabilidades separadas.

## Teste mínimo

1. Liste workspaces e confirme isolamento entre contas.
2. Leia um `outline` e um recorte `entity`.
3. Descubra um resource por `explore`, `search`, `inspect` e `contracts`.
4. Valide um card sem gravá-lo.
5. Faça uma escrita pequena com `expectedRevision` atual.
6. Repita a mesma chamada com o mesmo `requestId` e argumentos idênticos.
7. Tente uma revisão antiga e confirme que ela não sobrescreve a atual.

## Diagnóstico

| Sintoma | Causa provável | Recuperação |
| --- | --- | --- |
| O Project conhece o AraLearn, mas não chama ferramentas | Arquivos não estabelecem MCP | Adicione um conector remoto ou mantenha o fluxo apenas por documentos. |
| O conector não pode ser criado | Plano ou política organizacional não permite conector personalizado | Consulte a administração da conta e use o fluxo por Project enquanto necessário. |
| O endpoint local não conecta | O tráfego parte da nuvem da plataforma | Implante o gateway em HTTPS público. |
| A gravação é negada | Conta sem papel ou capacidade suficiente | Solicite acesso no workspace; não compartilhe credenciais de outra pessoa. |
| O contrato parece desatualizado | Foi usado apenas o conhecimento anexado | Consulte `contracts` no servidor antes de materializar o card. |

Consulte as [fontes oficiais](../SOURCES.md) e o roteiro de
[implantação](../../../docs/implantacao.md).
