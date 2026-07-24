# Privacidade no AraLearn

O AraLearn guarda somente os dados necessários para autenticação, estudo, sincronização e autoria. A instância oficial não vende dados, não exibe publicidade e não fornece credenciais do usuário a assistentes externos.

## Dados da conta e do estudo

O Supabase Auth trata o endereço de e-mail, a credencial de acesso e as sessões. O banco associa ao UUID da conta os cursos selecionados, as trilhas, o progresso, os comentários e os cursos privados. O navegador e o aplicativo Android mantêm uma réplica no dispositivo para permitir o estudo sem conexão.

O usuário pode retirar cursos, apagar os dados deste dispositivo, encerrar a sessão ou excluir a conta pelo próprio AraLearn. A exclusão da conta remove os dados pessoais conforme as relações e os prazos técnicos definidos no banco.

## Autoria privada e catálogo

A API de autoria recebe o objetivo do curso, o plano, as fontes identificadas pelo autor, as partes produzidas e os relatórios de revisão. Numa integração pessoal, o resultado validado fica somente na conta autora. A publicação numa coleção oficial exige uma permissão editorial diferente e uma validação integral antes de tornar o curso visível no catálogo.

Cada conta pode emitir, renovar e revogar suas próprias chaves `arl_...`. A chave completa aparece somente na criação ou na renovação; o banco conserva o prefixo e o resumo criptográfico. Uma chave pessoal não publica no catálogo, não administra outras credenciais e não acessa dados de outra conta.

Os materiais enviados a um serviço externo de linguagem ou de recuperação de informação também ficam sujeitos às regras desse serviço. O AraLearn não envia o conteúdo a esses fornecedores por conta própria; essa comunicação ocorre na ferramenta escolhida pelo autor.

## Registros técnicos

O servidor conserva registros de autenticação, comandos idempotentes, limites de requisição e auditoria suficientes para detectar falhas, impedir repetição indevida e investigar uma autoria ou publicação. Planos, fragmentos e documentos montados durante a autoria são transitórios e entram na política de retenção e compactação descrita em [Supabase: desenvolvimento e implantação](supabase.md).

## Armazenamento no dispositivo

IndexedDB, armazenamento local e cache do aplicativo guardam a sessão e a réplica necessária ao uso sem conexão. Limpar os dados do navegador ou do aplicativo remove essa cópia do dispositivo, mas não exclui automaticamente a conta nem o estado já sincronizado.

## Instâncias mantidas por terceiros

O código do AraLearn é público e pode ser implantado em outra infraestrutura. Quem mantém outra instância passa a responder pelo tratamento realizado nela e deve publicar suas próprias informações de privacidade.

Questões gerais podem ser registradas no [repositório do projeto](https://github.com/fabio-ara/AraLearn/issues). Não publique senhas, chaves, documentos pessoais ou outros dados sigilosos em uma issue.
