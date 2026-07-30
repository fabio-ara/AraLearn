# Configuração do GPT de autoria

## 1. Backend

Implante a função `aralearn-authoring-mcp` e a entrega protegida de revisões.
Configure no servidor:

- URL e credencial administrativa do projeto Supabase somente no ambiente
  protegido das Edge Functions;
- origens exatas permitidas para o MCP e para a entrega de revisões.

No painel do Supabase:

1. mantenha `https://fabio-ara.github.io/AraLearn/` como Site URL;
2. habilite o OAuth 2.1 Server e Dynamic Client Registration;
3. configure `/` como Authorization Path; o próprio shell do AraLearn recebe
   `authorization_id`, preserva a solicitação durante o login e mostra a tela
   de consentimento;
4. use uma chave de assinatura assimétrica para os JWTs;
5. habilite o hook `public.aralearn_mcp_access_token_hook`;
6. confirme que a descoberta anuncia PKCE `S256`.

O hook associa `aud` à URL do MCP. O GPT nunca recebe `service_role` nem
credencial administrativa. O login e o consentimento emitem um access token
OAuth curto para a conta do autor. Esse token não carrega permissões de
aplicação; o gateway consulta os papéis e permissões efetivos no banco.

## 2. GPT

No construtor do GPT:

1. use o modelo GPT-5.6 Sol quando disponível;
2. copie `INSTRUCTIONS.md`;
3. envie os arquivos de conhecimento gerados `KNOWLEDGE_CORE.md` e
   `KNOWLEDGE_RESOURCES.md`;
4. conecte o MCP remoto `aralearn-authoring-mcp`;
5. escolha OAuth e conclua o login na conta de teste.

O conjunto MCP é a integração completa: ele expõe ferramentas focadas com
schemas e anotações.

O schema completo de cards não é anexado ao conhecimento. Antes de criar um
tipo de recurso pela primeira vez, o GPT usa `consultarRecursoDeCard`; assim o
contrato detalhado, inclusive seu `authoringSchema` estrutural e as regras
semânticas associadas, fica sob demanda e não ocupa o contexto normal.

## 3. Teste mínimo

1. liste workspaces;
2. crie um workspace vazio;
3. leia o `outline`;
4. insira uma estrutura v4 pequena;
5. renomeie uma entidade usando a revisão atual;
6. consulte as microteorias;
7. publique uma prévia privada `partial`;
8. abra o curso na biblioteca e teste o conteúdo pronto.

Confirme que o chat mostra microteorias, não despeja todas as práticas e que
uma revisão antiga produz conflito sem sobrescrever a atual.

O smoke hospedado recebe um access token OAuth de uma conta descartável:

```powershell
./scripts/testAuthoringMcpHosted.ps1 `
  -ProjectUrl https://<project-ref>.supabase.co `
  -Origin https://chatgpt.com
```

## 4. Pacotes

```powershell
npm run authoring:packages
npm run test:authoring-packages
```

Os artefatos gerados ficam em `docs/downloads/authoring/`.
