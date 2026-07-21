# Privacidade no AraLearn

O AraLearn guarda somente os dados necessários para autenticação, estudo, sincronização e autoria. A instância oficial não vende dados, não exibe publicidade e não fornece credenciais do usuário a assistentes externos.

## Dados da conta e do estudo

O Supabase Auth trata o endereço de e-mail, a credencial de acesso e as sessões. O banco associa ao UUID da conta os cursos selecionados, as trilhas, o progresso, os comentários e os cursos privados. O navegador e o aplicativo Android mantêm uma réplica no dispositivo para permitir o estudo sem conexão.

O usuário pode retirar cursos, apagar os dados deste dispositivo, encerrar a sessão ou excluir a conta pelo próprio AraLearn. A exclusão da conta remove os dados pessoais conforme as relações e os prazos técnicos definidos no banco.

## Autoria do catálogo

A API de autoria recebe o objetivo do curso, o plano, as fontes identificadas pelo autor, as partes produzidas e os relatórios de revisão. Esses dados são usados para validar e publicar o curso solicitado. Chaves de integração são armazenadas somente como resumo criptográfico e podem ser revogadas.

Os materiais enviados a um serviço externo de linguagem ou de recuperação de informação também ficam sujeitos às regras desse serviço. O AraLearn não envia o conteúdo a esses fornecedores por conta própria; essa comunicação ocorre na ferramenta escolhida pelo autor.

## Registros técnicos

O servidor conserva registros de autenticação, comandos idempotentes, limites de requisição e auditoria suficientes para detectar falhas, impedir repetição indevida e investigar uma publicação. Planos, fragmentos e documentos montados durante a autoria são transitórios e entram na política de retenção e compactação descrita em [Supabase: desenvolvimento e implantação](supabase.md).

## Armazenamento no dispositivo

IndexedDB, armazenamento local e cache do aplicativo guardam a sessão e a réplica necessária ao uso sem conexão. Limpar os dados do navegador ou do aplicativo remove essa cópia do dispositivo, mas não exclui automaticamente a conta nem o estado já sincronizado.

## Instâncias mantidas por terceiros

O código do AraLearn é público e pode ser implantado em outra infraestrutura. Quem mantém outra instância passa a responder pelo tratamento realizado nela e deve publicar suas próprias informações de privacidade.

Questões gerais podem ser registradas no [repositório do projeto](https://github.com/fabio-ara/AraLearn/issues). Não publique senhas, chaves, documentos pessoais ou outros dados sigilosos em uma issue.
