# Privacidade no AraLearn

O AraLearn guarda somente os dados necessários para autenticação, estudo, sincronização e autoria. A instância oficial não vende dados, não exibe publicidade e não fornece credenciais do usuário a assistentes externos.

## Dados da conta e do estudo

O Supabase Auth trata o endereço de e-mail, a credencial de acesso e as sessões. O banco associa ao UUID da conta os cursos selecionados, as trilhas, o progresso, os comentários e os cursos privados. O navegador e o aplicativo Android mantêm uma réplica no dispositivo para permitir o estudo sem conexão.

O usuário pode retirar cursos, apagar os dados deste dispositivo, encerrar a sessão ou excluir a conta pelo próprio AraLearn. A exclusão da conta remove os dados pessoais conforme as relações e os prazos técnicos definidos no banco.

## Autoria privada e catálogo

O gateway MCP recebe comandos sobre entidades do documento v4 e conserva
revisões privadas do workspace da própria conta. Cada mutação usa uma revisão
esperada e um identificador idempotente; publicação no catálogo exige permissão
editorial separada, documento completo e validação integral.

Na assistência local de cards, o serviço configurado recebe o pedido e um
recorte delimitado: hierarquia e guias da etapa, tópicos pertinentes, card
atual, vizinhos imediatos, fontes já vinculadas e somente os anexos escolhidos.
O curso inteiro não é enviado. Resposta bruta e prévia permanecem efêmeras.
Depois da confirmação, o documento validado é gravado primeiro no dispositivo;
um curso do catálogo selecionado recebe um rascunho local explícito, sem
duplicação remota automática.

O gateway MCP autentica cada conexão por OAuth e resolve no banco as permissões
efetivas da conta. Não existe chave pessoal estática ou fallback de credencial
para a autoria estrutural.

Os materiais enviados a um serviço externo de linguagem ou de recuperação de
informação também ficam sujeitos às regras desse serviço. O envio ocorre apenas
quando a pessoa aciona a assistência ou usa uma integração escolhida por ela;
o contexto deve permanecer limitado ao necessário para a operação.

## Registros técnicos

O servidor conserva registros de autenticação, comandos idempotentes, limites
de requisição e histórico de revisões suficientes para detectar falhas,
impedir repetição indevida e investigar uma autoria ou publicação. Snapshots
canônicos de workspaces e revisões de curso ficam em objetos privados
imutáveis, protegidos por autorização e pela política de retenção descrita em
[Supabase: desenvolvimento e implantação](supabase.md).

## Armazenamento no dispositivo

IndexedDB, armazenamento local e cache do aplicativo guardam a sessão e a réplica necessária ao uso sem conexão. Limpar os dados do navegador ou do aplicativo remove essa cópia do dispositivo, mas não exclui automaticamente a conta nem o estado já sincronizado.

## Instâncias mantidas por terceiros

O código do AraLearn é público e pode ser implantado em outra infraestrutura. Quem mantém outra instância passa a responder pelo tratamento realizado nela e deve publicar suas próprias informações de privacidade.

Questões gerais podem ser registradas no [repositório do projeto](https://github.com/fabio-ara/AraLearn/issues). Não publique senhas, chaves, documentos pessoais ou outros dados sigilosos em uma issue.
