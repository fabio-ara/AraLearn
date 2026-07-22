# Configuração no ChatGPT

1. Abra o editor de GPTs e informe nome e descrição. Sugestão: **AraLearn Autoria** e “Planeja, produz, revisa e publica cursos AraLearn em etapas.” A imagem é opcional.
2. Em **Modelo recomendado**, selecione o modelo de raciocínio mais avançado que o editor mantenha compatível com Actions. Hoje, `GPT-5.6 Thinking` é uma boa opção quando estiver disponível. Esta escolha deve acompanhar o seletor do workspace, pois novos modelos podem substituí-lo.
3. Cole `INSTRUCTIONS.md` no campo de instruções.
4. Em **Conhecimento**, anexe somente o arquivo `KNOWLEDGE.md`. Não anexe pastas nem outros arquivos deste pacote. Esse Markdown único já contém o material de referência de que o GPT precisa, inclusive o contrato AraLearn v3 e as definições dos cards.
5. Ative **Busca na web** e **Intérprete de código e análise de dados**. A busca serve apenas para fontes externas ou atuais; as fontes utilizadas devem entrar no registro. A análise de dados permite trabalhar com anexos extensos e verificar artefatos.
6. Clique em **Criar**. Na tela de publicação, escolha **Apenas para mim**. O GPT não deve ser compartilhado enquanto usar uma chave editorial comum. Neste ponto, ele já pode receber materiais e preparar cursos, mas ainda não publica no AraLearn.

## Conexão com o catálogo, após a implantação da API

Só prossiga nesta seção quando a Edge Function `aralearn-authoring-api` estiver implantada e houver uma chave editorial restrita. Até lá, não há nada a configurar em **Actions**.

7. Descubra a **Project URL** no painel do Supabase: abra o projeto e copie o endereço mostrado em **Connect** ou **Project Settings → API**. Ele se parece com `https://abc123abc123abc123ab.supabase.co`. A sequência entre `https://` e `.supabase.co` chama-se **Project Ref**. Ela identifica o projeto, não é senha nem chave. Nesta instalação do AraLearn, a Project URL é `https://jrfkphuhcseqmratijjr.supabase.co` e o Project Ref é `jrfkphuhcseqmratijjr`. Em outra instalação, use os valores daquela instalação.
8. No PowerShell, gere a cópia própria da Action. Ela já recebe o endereço do projeto e usa uma especificação compatível com o editor de Actions. Se você está na pasta do repositório AraLearn, execute:

   ```powershell
   pwsh -NoProfile -File .\scripts\prepareChatGptAction.ps1 `
     -ProjectUrl https://jrfkphuhcseqmratijjr.supabase.co
   ```

   O script grava o arquivo em `Downloads` e informa o caminho. Ele não pede nem guarda credencial.

   Se você baixou somente o pacote de autoria, execute o arquivo `platforms/chatgpt/prepareChatGptAction.ps1` que veio dentro do pacote, usando a mesma opção `-ProjectUrl`.
9. Volte ao editor do GPT e abra **Actions → Adicionar ações**. O arquivo criado no passo anterior é um arquivo de texto, não um anexo para esta tela:

   1. Abra o arquivo `.yaml` criado em `Downloads` com o Bloco de Notas ou VS Code.
   2. Pressione `Ctrl+A` e depois `Ctrl+C` para copiar todo o conteúdo.
   3. Na tela **Adicionar ações**, clique na caixa grande da seção **Schema**, que mostra “Informe o seu schema OpenAPI aqui”.
   4. Pressione `Ctrl+V`.

   Não use **Importar de URL**. Esse botão serve somente para uma especificação publicada em um endereço da internet. O arquivo em `Downloads` deve ser colado diretamente na caixa **Schema**. Quando o conteúdo for aceito, o editor exibirá as operações encontradas. Se você já havia colado uma versão anterior, clique na caixa, pressione `Ctrl+A` e substitua todo o conteúdo pelo arquivo recém-gerado.
10. Ainda nessa tela, abra o seletor **Autenticação**, que inicialmente mostra **Nenhum**. Escolha **Chave de API** e, entre os formatos disponíveis, escolha **Cabeçalho personalizado**. Preencha:

   - nome do cabeçalho: `X-AraLearn-API-Key`;
   - valor: a chave editorial que começa com `arl_`.

   A chave é criada pelo roteiro de implantação, não pelo editor do GPT. Se você ainda não recebeu uma chave `arl_`, pare aqui: mantenha a Action sem salvar e execute `bootstrapAuthoringAccess.ps1`, conforme [Implantação](../../../docs/implantacao.md#ativar-a-autoria-assistida). Nunca use a `service_role` do Supabase e não coloque qualquer chave no OpenAPI, nas instruções ou no arquivo de conhecimento.
11. No campo **Política de privacidade**, ao fim da tela, informe:

   ```text
   https://github.com/fabio-ara/AraLearn/blob/main/docs/privacidade.md
   ```

12. Clique em **Atualizar**, no canto superior direito, para guardar a Action no GPT.
13. Use **Pré-visualizar** para testar a criação de execução, o plano, uma parte, a revisão e a validação. A publicação deve ser o último teste e requer uma chave com esse escopo.

### Domínio permitido no workspace, quando houver essa configuração

Esta etapa é administrativa e não aparece para todas as contas. Se você não administra um workspace ou não encontra uma configuração de domínios permitidos, ignore-a: ela não impede salvar nem testar uma Action privada.

Quando a organização oferecer essa lista, permita somente o domínio HTTPS `jrfkphuhcseqmratijjr.supabase.co`. Em outra instalação, substitua-o pelo domínio da Project URL correspondente.

Um GPT usa Actions ou Apps na mesma configuração, não os dois. Actions exigem uma especificação OpenAPI e uma forma de autenticação. As políticas do workspace podem restringir os modelos, os domínios e a própria disponibilidade dessa função. A criação do GPT pode ser concluída sem a Action, mas ele não conseguirá ler nem gravar no catálogo até que a API e a chave editorial estejam prontas.

Os arquivos deste pacote podem ser publicados. Eles não concedem acesso a catálogo algum. Para usar a Action, a pessoa precisa de uma instância do AraLearn com a API implantada e de uma autorização individual ou de uma chave editorial concedida pelo responsável. A instância que contém uma chave editorial não deve ser publicada. Uma futura versão aberta a vários autores deverá autenticar cada pessoa individualmente, por exemplo com OAuth, e aplicar os respectivos escopos no servidor. A política de privacidade é necessária para compartilhar uma Action publicamente, mas não substitui essa autenticação.

O editor de GPTs recebe a especificação OpenAPI, as configurações de autenticação e instruções que mencionam as operações e seus parâmetros. Teste cada operação pelo botão oferecido no editor antes de confiar nela em uma execução real.

Documentação oficial:

- [Getting started with GPT Actions](https://developers.openai.com/api/docs/actions/getting-started)
- [Configuring actions in GPTs](https://help.openai.com/en/articles/9442513)
