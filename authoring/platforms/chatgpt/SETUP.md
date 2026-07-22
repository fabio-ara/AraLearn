# Configuração no ChatGPT

1. Abra o editor de GPTs e informe nome e descrição. Sugestão: **AraLearn Autoria** e “Planeja, produz, revisa e publica cursos AraLearn em etapas.” A imagem é opcional.
2. Em **Modelo recomendado**, selecione o modelo de raciocínio mais avançado que o editor mantenha compatível com Actions. Hoje, `GPT-5.6 Thinking` é uma boa opção quando estiver disponível. Esta escolha deve acompanhar o seletor do workspace, pois novos modelos podem substituí-lo.
3. Cole `INSTRUCTIONS.md` no campo de instruções.
4. Adicione somente `KNOWLEDGE.md` como conhecimento. O arquivo já reúne `core/`, `knowledge/`, `schemas/`, o contrato v3 e os recursos de card. Ele é gerado dentro deste pacote para respeitar o limite atual de 20 arquivos por GPT.
5. Ative **Busca na web** e **Intérprete de código e análise de dados**. A busca serve apenas para fontes externas ou atuais; as fontes utilizadas devem entrar no registro. A análise de dados permite trabalhar com anexos extensos e verificar artefatos.
6. Clique em **Criar**. Na tela de publicação, escolha **Somente eu**. O GPT não deve ser compartilhado enquanto usar uma chave editorial comum. Neste ponto, ele já pode receber materiais e preparar cursos, mas ainda não publica no AraLearn.

## Conexão com o catálogo, após a implantação da API

Só prossiga nesta seção quando a Edge Function `aralearn-authoring-api` estiver implantada e houver uma chave editorial restrita. Até lá, não há nada a configurar em **Actions**.

7. Faça uma cópia local de `docs/openapi/aralearn-authoring-api.yaml`. No bloco `servers`, substitua `default: seu-projeto` pelo Project Ref real. O endereço deve ficar como `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api`. Não altere o arquivo distribuído para guardar credenciais.
8. Em **Actions**, importe essa cópia. A versão deste pacote contém somente `AuthoringApiKey` e não inclui `/v1/imports`. A especificação geral do repositório também aceita sessão Supabase e não deve ser usada no GPT.
9. Escolha autenticação por API Key e configure o cabeçalho personalizado `X-AraLearn-API-Key`. Informe somente uma chave de autoria com prefixo `arl_` e escopos restritos. Não coloque a chave no OpenAPI, nas instruções ou nos arquivos de conhecimento. Nunca use a `service_role` do Supabase.
10. Permita somente o domínio HTTPS `<project-ref>.supabase.co` nas configurações do workspace e informe `https://github.com/fabio-ara/AraLearn/blob/main/docs/privacidade.md` como política de privacidade da Action.
11. Use o teste de cada Action para conferir autenticação, endereço e payload. Em seguida, teste no Preview a criação de execução, o plano, uma parte, a revisão e a validação. Só depois teste a publicação com uma chave que tenha esse escopo.

Um GPT usa Actions ou Apps na mesma configuração, não os dois. Actions exigem uma especificação OpenAPI e uma forma de autenticação. As políticas do workspace podem restringir os modelos, os domínios e a própria disponibilidade dessa função. A criação do GPT pode ser concluída sem a Action, mas ele não conseguirá ler nem gravar no catálogo até que a API e a chave editorial estejam prontas.

Os arquivos deste pacote podem ser publicados. Eles não concedem acesso a catálogo algum. Para usar a Action, a pessoa precisa de uma instância do AraLearn com a API implantada e de uma autorização individual ou de uma chave editorial concedida pelo responsável. A instância que contém uma chave editorial não deve ser publicada. Uma futura versão aberta a vários autores deverá autenticar cada pessoa individualmente, por exemplo com OAuth, e aplicar os respectivos escopos no servidor. A política de privacidade é necessária para compartilhar uma Action publicamente, mas não substitui essa autenticação.

O editor de GPTs recebe a especificação OpenAPI, as configurações de autenticação e instruções que mencionam as operações e seus parâmetros. Teste cada operação pelo botão oferecido no editor antes de confiar nela em uma execução real.

Documentação oficial:

- [Getting started with GPT Actions](https://developers.openai.com/api/docs/actions/getting-started)
- [Configuring actions in GPTs](https://help.openai.com/en/articles/9442513)
