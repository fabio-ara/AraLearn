# Integração local com Codex CLI

Esta integração permite usar o Codex CLI como um provedor de assistência à
autoria sem enviar o pedido diretamente, pelo navegador, a uma API configurada
no AraLearn. O aplicativo continua responsável por delimitar o que pode ser
alterado, fornecer o contexto necessário, validar a resposta e gravar a mudança
de forma atômica.

O recurso é destinado a pessoas que já utilizam o Codex CLI na própria máquina.
Ele não é necessário para estudar, editar manualmente ou usar um provedor por
API.

## Conceitos necessários

Uma **interface de linha de comando**, ou CLI, é um programa operado por comandos
de texto. O Codex CLI recebe uma instrução, executa o modelo configurado e pode
devolver uma resposta estruturada. A referência oficial de instalação,
autenticação e comandos está na [documentação do Codex para
desenvolvedores](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

Um navegador não deve iniciar programas arbitrários do sistema operacional.
Por isso, o AraLearn não chama o executável diretamente. Entre os dois existe
uma **ponte local**: um pequeno serviço HTTP executado na mesma máquina.

```text
AraLearn
   │ pedido estruturado e autenticado
   ▼
ponte HTTP local
   │ entrada padrão
   ▼
Codex CLI
   │ JSON conforme um schema fechado
   ▼
validação, compilação e gravação pelo AraLearn
```

O endereço `127.0.0.1` designa a própria máquina. Ele é chamado de endereço de
**loopback**: requisições enviadas a ele não são roteadas para outro computador.
O token local impede que uma página não autorizada use a ponte, enquanto a lista
de origens permitidas restringe quais instalações do AraLearn podem acessá-la.

## O que a integração pode fazer

A ponte atende dois grupos de operações:

- editar textos visíveis ou recompor um card autorizado;
- auxiliar uma autoria ascendente restrita, construindo cards ou, no máximo,
  uma nova microssequência dentro do escopo selecionado.

Planejamento extenso, gestão de workspaces e publicação do catálogo usam o fluxo
de autoria remota descrito em [Autoria conectada por
MCP](../autoria-mcp.md). Essa separação reduz a autoridade concedida ao serviço
local e mantém operações editoriais compartilhadas sob autenticação e controle
de concorrência próprios.

Internamente, a ponte aceita somente fases enumeradas. Nomes como
`card_assistance_text_edit` e `bottom_up_build_card` são identificadores de
protocolo, não comandos que a pessoa precisa digitar. A lista fechada impede que
o cliente transforme o serviço em uma execução genérica do Codex.

## Pré-requisitos

Antes da configuração, confirme:

1. Node.js e as dependências do repositório instalados;
2. Codex CLI instalado e autenticado conforme a documentação oficial;
3. AraLearn aberto na máquina que executará a ponte, ou acessível pelo aparelho
   Android na mesma rede;
4. um token aleatório com pelo menos 32 bytes.

O token da ponte não é uma chave do Supabase nem uma chave de API do modelo. Ele
serve apenas para autenticar a comunicação local entre o AraLearn e o serviço.

## Configuração recomendada pela interface

Na configuração de provedores do AraLearn:

1. selecione **Codex CLI local**;
2. informe ou gere o token local;
3. confira a origem exibida pelo aplicativo;
4. copie o script de inicialização;
5. execute o script em um terminal;
6. use **Testar conexão** antes de iniciar uma assistência.

O script gerado associa o mesmo token aos dois lados e registra a origem exata.
Uma **origem web** é a combinação de protocolo, host e porta. Assim,
`http://127.0.0.1:4182` e `http://localhost:4182` são origens diferentes, embora
possam chegar à mesma máquina.

## Execução manual

Para desenvolvimento local em PowerShell:

```powershell
$env:ARALEARN_CODEX_TOKEN = "<segredo-local-com-32-bytes-ou-mais>"
$env:ARALEARN_CODEX_ALLOWED_ORIGINS = "http://127.0.0.1:4182"
npm run codex:local
```

A ponte oferece:

```text
http://127.0.0.1:4183/health
http://127.0.0.1:4183/assist
```

O primeiro endereço informa se o serviço está ativo. O segundo recebe as
operações do aplicativo e não foi concebido para uso manual.

Para o site publicado, use a origem HTTPS completa. No APK, use
`https://appassets.androidplatform.net`. O serviço recusa `*`, origens com
caminho e HTTP remoto. Essa regra evita transformar uma permissão local em
acesso indistinto por qualquer página.

## Como um pedido é processado

1. O AraLearn identifica a seleção e o escopo autorizados.
2. O kernel separa contexto somente para leitura de campos alteráveis.
3. A ponte recebe um envelope com fase, instrução, schema e limites.
4. O serviço executa o comando fechado `codex exec -` e envia a instrução pela
   entrada padrão.
5. O Codex devolve um único documento JSON.
6. A ponte rejeita texto adicional, Markdown ou estrutura incompatível.
7. O AraLearn recompila a proposta, valida packages, referências e permissões e
   só então grava a alteração.

Um **schema** descreve a forma admitida para o JSON: campos existentes, tipos e
restrições. Exigir essa forma reduz ambiguidades de integração, mas não prova que
o conteúdo está pedagogicamente correto. A revisão humana continua necessária.

## Limites e isolamento

O serviço aceita somente o comando configurado para o executável e não aceita
uma lista arbitrária de argumentos. Nas chamadas do AraLearn, a sessão é
efêmera, o acesso ao sistema de arquivos é somente para leitura e capacidades
como shell, navegador, controle do computador, plugins, hooks, memória e
subagentes são desativadas.

Também existem limites separados para:

- corpo HTTP recebido: `ARALEARN_CODEX_MAX_BODY_BYTES`;
- saída normal do processo: `ARALEARN_CODEX_MAX_STDOUT_BYTES`;
- saída de erro: `ARALEARN_CODEX_MAX_STDERR_BYTES`;
- resposta HTTP devolvida: `ARALEARN_CODEX_MAX_RESPONSE_BYTES`;
- duração da execução: `ARALEARN_CODEX_TIMEOUT_MS`.

Limites diferentes são necessários porque cada superfície consome memória de
modo distinto. Um corpo pequeno não impede, por exemplo, que um processo gere
uma saída excessiva. A validação antecipada evita manter dados inúteis em
memória e torna falhas previsíveis.

Arquivos temporários usados para schema e resposta são removidos em sucesso e em
falha. A instrução é enviada pela entrada padrão, e não gravada como arquivo de
prompt.

## Uso no Android

No computador, `127.0.0.1` aponta para o próprio computador. No celular, aponta
para o próprio celular. Portanto, se a ponte estiver em outro equipamento, o APK
precisa receber um endereço HTTPS alcançável pelo aparelho e autorizado pela
configuração do serviço.

Não exponha a ponte diretamente à internet. Para uso em rede local, aplique as
mesmas precauções de qualquer serviço administrativo: origem exata, token forte,
firewall restritivo e encerramento do processo após a sessão de autoria.

## Diagnóstico

Se **Testar conexão** falhar, verifique nesta ordem:

1. se `/health` responde;
2. se o token tem o mesmo valor no aplicativo e no processo;
3. se a origem informada corresponde exatamente à URL do AraLearn;
4. se o Codex CLI está instalado e autenticado para o mesmo usuário do processo;
5. se firewall ou roteamento impedem o acesso, especialmente no Android;
6. se o tempo ou os limites de saída são suficientes para a operação.

Uma resposta de saúde confirma apenas que a ponte está ativa. O teste de conexão
completo também confirma autenticação local e capacidade de executar o provedor.

## Critério de confiança

Executar o modelo localmente por uma CLI muda o transporte, não a natureza da
assistência. O resultado continua sendo uma proposta probabilística. A confiança
do fluxo vem da combinação de escopo explícito, contrato fechado, validação
determinística, histórico reversível e decisão final da pessoa autora.
