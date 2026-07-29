# Configuração do GPT de autoria

## 1. Backend

Implante as funções `aralearn-authoring-api` e `aralearn-authoring-mcp` e
configure no servidor:

- URL e chaves do projeto Supabase;
- segredo de integração privada;
- origens exatas permitidas para API e MCP.

O GPT nunca recebe `service_role`. O usuário cria uma integração no painel de
autoria e copia uma chave `arl_...` com os escopos necessários.

## 2. GPT

No construtor do GPT:

1. use o modelo GPT-5.6 Sol quando disponível;
2. copie `INSTRUCTIONS.md`;
3. envie o arquivo de conhecimento gerado
   `docs/downloads/authoring/aralearn-chatgpt-knowledge.md`;
4. conecte o MCP remoto `aralearn-authoring-mcp`;
5. configure a chave privada da integração no mecanismo de autenticação.

Não importe simultaneamente uma Action REST de autoria. O conjunto MCP já
expõe ferramentas focadas com schemas e anotações; duplicá-lo aumenta
ambiguidade de seleção.

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

## 4. Pacotes

```powershell
npm run authoring:packages
npm run test:authoring-packages
```

Os artefatos gerados ficam em `docs/downloads/authoring/`.
