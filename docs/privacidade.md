# Privacidade no AraLearn

O AraLearn guarda somente os dados necessários para autenticação, estudo, sincronização e autoria. A instância oficial não vende dados, não exibe publicidade e não fornece credenciais do usuário a assistentes externos.

## Dados da conta e do estudo

O Supabase Auth trata o endereço de e-mail, a credencial de acesso e as sessões. O banco associa ao UUID da conta os cursos selecionados, as trilhas, o estado funcional de retomada, as observações pedagógicas e os cursos privados. O estado de estudo contém somente cursor, conclusão estrutural e a marca pessoal **Rever**. Não guarda abertura de card, tempo, número de tentativas, acertos, erros ou último resultado. O navegador e o aplicativo Android mantêm uma réplica no dispositivo para permitir o estudo sem conexão. Cada observação conserva categoria, texto curto e referência ao card; em workspace, pode conservar também papel contextual, revisão observada, resposta e estado correntes e referência compacta a uma correção concluída. Não copia o conteúdo estudado nem cria histórico do texto ou da conversa.

O usuário pode retirar cursos, apagar os dados deste dispositivo, encerrar a sessão ou excluir a conta pelo próprio AraLearn. A exclusão da conta remove os dados pessoais conforme as relações e os prazos técnicos definidos no banco.

## Autoria privada e catálogo

O gateway MCP recebe comandos sobre entidades do documento v4 e conserva
as partes atuais do workspace da própria conta. Cada mutação usa uma revisão
esperada e um identificador idempotente. A submissão editorial expõe somente a
revisão privada escolhida, nunca os demais cursos da biblioteca.

Na assistência bottom-up, o serviço configurado recebe o pedido e um recorte
delimitado: hierarquia e guias da etapa, alvos graváveis, ordem, vizinhos
limitados e índice compacto da lição. O curso inteiro não é enviado. Pedido,
contexto montado e resposta bruta não são persistidos junto ao conteúdo; a
mudança validada é gravada atomicamente.

Curso privado próprio permanece na mesma identidade. Curso oficial é somente
leitura para conta comum e só pode ser alterado por conta administrativa ou
editorial, mantendo sua continuidade oficial. O aplicativo não cria cópia
privada automática nem promove conteúdo ao catálogo.

O gateway MCP autentica cada conexão por OAuth e resolve no banco as permissões
efetivas da conta. Não existe chave pessoal estática ou fallback de credencial
para a autoria estrutural.

Em espaços compartilhados, a conta pode ter papéis diferentes em cada
workspace. O servidor reavalia o vínculo em toda leitura e escrita. Um convite
guarda e-mail normalizado, papel, expiração e hash do código; o código aparece
somente no recibo de criação. Revogar participação interrompe o acesso remoto
e remove a seleção concedida exclusivamente pelo workspace, sem apagar cursos
próprios. Em workspace, os papéis de revisão consultam as observações ligadas
àquele espaço; estudantes continuam sem acesso aos registros de colegas. A
lista compartilhada de observações não é guardada no cache persistente de Trilhas.

Os materiais enviados a um serviço externo de linguagem ou de recuperação de
informação também ficam sujeitos às regras desse serviço. O envio ocorre apenas
quando a pessoa aciona a assistência ou usa uma integração escolhida por ela;
o contexto deve permanecer limitado ao necessário para a operação.

## Registros técnicos

O servidor conserva registros de autenticação, recibos idempotentes, limites
de requisição e resumos recentes de alterações suficientes para detectar
falhas, impedir repetição indevida e investigar uma autoria. Esses resumos não
contêm cópias antigas do workspace nem permitem restaurá-las.

Revisões publicadas de curso ficam em objetos privados imutáveis, protegidos
por autorização e pela política de retenção descrita em [Supabase:
desenvolvimento e implantação](supabase.md). Uma submissão ativa retém o hash
exato da revisão privada escolhida. Quem revisa recebe somente esse artefato e
pode trabalhar numa cópia editorial independente.

## Armazenamento no dispositivo

IndexedDB, armazenamento local e cache do aplicativo guardam a sessão e a réplica necessária ao uso sem conexão. Limpar os dados do navegador ou do aplicativo remove essa cópia do dispositivo, mas não exclui automaticamente a conta nem o estado já sincronizado.

## Instâncias mantidas por terceiros

O código do AraLearn é público e pode ser implantado em outra infraestrutura. Quem mantém outra instância passa a responder pelo tratamento realizado nela e deve publicar suas próprias informações de privacidade.

Questões gerais podem ser registradas no [repositório do projeto](https://github.com/fabio-ara/AraLearn/issues). Não publique senhas, chaves, documentos pessoais ou outros dados sigilosos em uma issue.
