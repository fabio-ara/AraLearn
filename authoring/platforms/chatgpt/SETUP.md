# Configuração no ChatGPT

1. Escolha o perfil antes de abrir o editor:

   - **pessoal**, para criar cursos somente na conta do autor, sem acesso ao catálogo público. Sugestão de nome: **AraLearn Autoria pessoal**. Descrição: “Planeja, produz e revisa cursos pessoais AraLearn em etapas.”
   - **editorial**, para responsáveis autorizados a publicar no catálogo. Sugestão de nome: **AraLearn Autoria editorial**. Descrição: “Planeja, produz, revisa e publica cursos AraLearn em etapas.”

   O perfil pessoal é a escolha adequada para estudantes e autores sem função editorial. A imagem é opcional.
2. Em **Modelo recomendado**, selecione o modelo de raciocínio mais avançado que o editor mantenha compatível com Actions. Hoje, `GPT-5.6 Thinking` é uma boa opção quando estiver disponível. Esta escolha deve acompanhar o seletor do workspace, pois novos modelos podem substituí-lo.
3. Cole `INSTRUCTIONS.md` no campo de instruções.
4. Em **Conhecimento**, anexe somente o arquivo `KNOWLEDGE.md`. Não anexe pastas nem outros arquivos deste pacote. Esse Markdown único já contém o material de referência de que o GPT precisa, inclusive o contrato AraLearn v3 e as definições dos cards.
5. Ative **Busca na web** e **Intérprete de código e análise de dados**. A busca serve apenas para fontes externas ou atuais; as fontes utilizadas devem entrar no registro. A análise de dados permite trabalhar com anexos extensos e verificar artefatos.
6. Clique em **Criar**. Na tela de publicação, escolha **Apenas para mim**. A Action guardará uma chave no GPT; por isso, não compartilhe essa configuração. Neste ponto, ele já pode receber materiais e preparar cursos, mas ainda não grava no AraLearn.

## Conexão com o AraLearn, após a implantação da API

Só prossiga nesta seção quando a Edge Function `aralearn-authoring-api` estiver implantada e houver uma chave `arl_` compatível com o perfil escolhido. A chave pessoal só grava na conta do autor. A chave editorial pode publicar no catálogo. Até lá, não há nada a configurar em **Actions**.

7. Descubra a **Project URL** no painel do Supabase: abra o projeto e copie o endereço mostrado em **Connect** ou **Project Settings → API**. Ele se parece com `https://abc123abc123abc123ab.supabase.co`. A sequência entre `https://` e `.supabase.co` chama-se **Project Ref**. Ela identifica o projeto, não é senha nem chave. Nesta instalação do AraLearn, a Project URL é `https://jrfkphuhcseqmratijjr.supabase.co` e o Project Ref é `jrfkphuhcseqmratijjr`. Em outra instalação, use os valores daquela instalação.
8. No PowerShell, gere a cópia própria da Action. Ela já recebe o endereço do projeto e usa uma especificação compatível com o editor de Actions.

   Para o perfil pessoal, execute:

   ```powershell
   pwsh -NoProfile -File .\scripts\prepareChatGptAction.ps1 `
     -ProjectUrl https://jrfkphuhcseqmratijjr.supabase.co `
     -Profile private
   ```

   Para o perfil editorial, execute:

   ```powershell
   pwsh -NoProfile -File .\scripts\prepareChatGptAction.ps1 `
     -ProjectUrl https://jrfkphuhcseqmratijjr.supabase.co `
     -Profile editorial
   ```

   O script grava em `Downloads` um arquivo cujo nome contém `private` ou `editorial` e informa o caminho. Ele não pede nem guarda credencial. Se `-Profile` for omitido, o perfil pessoal será usado por ser o mais restrito.

   Se você baixou somente o pacote de autoria, execute o arquivo `platforms/chatgpt/prepareChatGptAction.ps1` que veio dentro do pacote, usando as mesmas opções.
9. Volte ao editor do GPT e abra **Actions → Adicionar ações**. O arquivo criado no passo anterior é um arquivo de texto, não um anexo para esta tela:

   1. Abra o arquivo `.yaml` criado em `Downloads` com o Bloco de Notas ou VS Code.
   2. Pressione `Ctrl+A` e depois `Ctrl+C` para copiar todo o conteúdo.
   3. Na tela **Adicionar ações**, clique na caixa grande da seção **Schema**, que mostra “Informe o seu schema OpenAPI aqui”.
   4. Pressione `Ctrl+V`.

   Não use **Importar de URL**. Esse botão serve somente para uma especificação publicada em um endereço da internet. O arquivo em `Downloads` deve ser colado diretamente na caixa **Schema**. Quando o conteúdo for aceito, o editor exibirá as operações encontradas. Se você já havia colado uma versão anterior, clique na caixa, pressione `Ctrl+A` e substitua todo o conteúdo pelo arquivo recém-gerado.
10. Ainda nessa tela, abra o seletor **Autenticação**, que inicialmente mostra **Nenhum**. Escolha **Chave de API** e, entre os formatos disponíveis, escolha **Cabeçalho personalizado**. Preencha:

    - nome do cabeçalho: `X-AraLearn-API-Key`;
    - valor: a chave do perfil escolhido, que começa com `arl_`.

    A chave é criada pelo AraLearn ou pelo roteiro de implantação, não pelo editor do GPT. No perfil pessoal, use a chave da integração da própria conta. No perfil editorial, use uma chave concedida pelo responsável pela instância; o roteiro [Implantação](../../../docs/implantacao.md#ativar-a-autoria-assistida) explica como criá-la. Nunca use a `service_role` do Supabase e não coloque qualquer chave no OpenAPI, nas instruções ou no arquivo de conhecimento.
11. No campo **Política de privacidade**, ao fim da tela, informe:

   ```text
   https://github.com/fabio-ara/AraLearn/blob/main/docs/privacidade.md
   ```

12. Clique em **Atualizar**, no canto superior direito, para guardar a Action no GPT.
13. Use **Pré-visualizar** para testar a criação de execução, o plano, uma parte, a revisão e a validação. No perfil pessoal, o último teste materializa o curso somente na conta do autor. No perfil editorial, a publicação no catálogo deve ser o último teste e requer confirmação expressa.

### Domínio permitido no workspace, quando houver essa configuração

Esta etapa é administrativa e não aparece para todas as contas. Se você não administra um workspace ou não encontra uma configuração de domínios permitidos, ignore-a: ela não impede salvar nem testar uma Action privada.

Quando a organização oferecer essa lista, permita somente o domínio HTTPS `jrfkphuhcseqmratijjr.supabase.co`. Em outra instalação, substitua-o pelo domínio da Project URL correspondente.

Um GPT usa Actions ou Apps na mesma configuração, não os dois. Actions exigem uma especificação OpenAPI e uma forma de autenticação. As políticas do workspace podem restringir os modelos, os domínios e a própria disponibilidade dessa função. A criação do GPT pode ser concluída sem a Action, mas ele não conseguirá consultar nem gravar cursos no AraLearn até que a API e a chave do perfil estejam prontas.

Os arquivos deste pacote podem ser publicados. Eles não concedem acesso a conta ou catálogo algum. Para usar a Action, a pessoa precisa de uma instância do AraLearn com a API implantada e de uma chave própria. O perfil pessoal não consegue publicar no catálogo, mesmo que o modelo tente fazê-lo. O perfil editorial depende de permissão específica no servidor. O GPT que contém qualquer uma dessas chaves deve permanecer em **Apenas para mim** ou restrito ao espaço de trabalho autorizado. Uma distribuição pública requer autenticação individual, por exemplo com OAuth, e aplicação dos escopos no servidor. A política de privacidade não substitui essa autenticação.

O editor de GPTs recebe a especificação OpenAPI, as configurações de autenticação e instruções que mencionam as operações e seus parâmetros. Teste cada operação pelo botão oferecido no editor antes de confiar nela em uma execução real.

Documentação oficial:

- [Getting started with GPT Actions](https://developers.openai.com/api/docs/actions/getting-started)
- [Configuring actions in GPTs](https://help.openai.com/en/articles/9442513)
