# Configuração no ChatGPT

1. Crie um GPT no editor do workspace.
2. Cole `INSTRUCTIONS.md` no campo de instruções.
3. Adicione somente `KNOWLEDGE.md` como conhecimento. O arquivo já reúne `core/`, `knowledge/`, `schemas/`, o contrato v3 e os recursos de card. Ele é gerado dentro deste pacote para respeitar o limite atual de 20 arquivos por GPT.
4. Ative Análise de Dados para ler anexos extensos e verificar artefatos. Ative pesquisa na web somente quando o recorte exigir fonte externa ou informação atual; as fontes utilizadas devem entrar no registro.
5. Faça uma cópia de `docs/openapi/aralearn-authoring-api.yaml` para configuração. No bloco `servers`, substitua `default: seu-projeto` pelo Project Ref real do Supabase. O resultado deve apontar exatamente para `https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-api`. Não altere o arquivo distribuído para guardar credenciais.
6. Valide a cópia e confira o host antes de importá-la. Em Actions, crie uma ação e importe essa cópia do OpenAPI. A versão deste pacote contém somente `AuthoringApiKey` e não inclui `/v1/imports`. A especificação geral do repositório também aceita sessão Supabase e não deve ser usada no GPT.
7. Escolha autenticação por API Key e configure o cabeçalho personalizado `X-AraLearn-API-Key`. Informe somente uma chave de autoria com prefixo `arl_` e escopos restritos. Não coloque a chave no OpenAPI, nas instruções ou nos arquivos de conhecimento. Nunca use a `service_role` do Supabase.
8. Permita somente o domínio HTTPS `<project-ref>.supabase.co` nas configurações do workspace.
9. Mantenha privada a instância configurada com a chave `arl_`, ou restrinja-a ao workspace autorizado. Compartilhar esse GPT também compartilharia o poder editorial concedido à chave, mesmo que seu valor não apareça nas conversas.
10. Informe `https://github.com/fabio-ara/AraLearn/blob/main/docs/privacidade.md` como política de privacidade da Action.
11. Teste em Preview: criar execução, gravar plano compacto, enviar um trecho de cada seção do registro, finalizar o plano, especificar e produzir uma parte, pedir reparo, aprovar e validar. Se a chamada tentar alcançar `seu-projeto.supabase.co`, corrija o valor de `servers` e importe novamente.
12. Só depois teste a publicação com uma chave de autoria que possua o escopo correspondente.

Um GPT usa Actions ou Apps na mesma configuração, não os dois. Actions exigem uma especificação OpenAPI e uma forma de autenticação. A documentação atual informa que Actions não funcionam no modo Pro; escolha no editor um modelo compatível com Actions. As políticas do workspace também podem restringir os domínios permitidos.

Os arquivos deste pacote podem ser publicados. A instância que contém uma chave editorial, não. Uma futura versão aberta a vários autores deverá autenticar cada pessoa individualmente, por exemplo com OAuth, e aplicar os respectivos escopos no servidor. A política de privacidade é necessária para compartilhar uma Action publicamente, mas não substitui essa autenticação.

O editor de GPTs recebe a especificação OpenAPI, as configurações de autenticação e instruções que mencionam as operações e seus parâmetros. Teste cada operação pelo botão oferecido no editor antes de confiar nela em uma execução real.

Documentação oficial:

- [Getting started with GPT Actions](https://developers.openai.com/api/docs/actions/getting-started)
- [Configuring actions in GPTs](https://help.openai.com/en/articles/9442513)
