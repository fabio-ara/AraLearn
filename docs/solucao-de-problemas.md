# Solução de problemas

## Os cursos não abrem neste dispositivo

1. Confirme que a sessão continua ativa.
2. Volte a uma conexão estável e use o botão de sincronização na Central.
3. Aguarde o download terminar antes de testar sem rede.
4. Se apenas um curso falhar, remova-o de **Trilhas**, adicione-o novamente em
   **Coleções** e sincronize.

Uma publicação inválida é isolada; ela não deve impedir os demais cursos de
abrir. Não limpe todos os dados do navegador como primeira tentativa, pois isso
remove a réplica offline e alterações que ainda não foram enviadas.

## A tela mostra o último estado conhecido

O dispositivo está offline ou a leitura remota falhou. Estudo, **Rever** e suas
observações locais continuam disponíveis. Convites, papéis, publicação e
assistência externa precisam de rede.

## Uma alteração está aguardando envio

Ela já foi gravada localmente. Reconecte e sincronize. Se o servidor rejeitar a
alteração por referência removida ou permissão revogada, a Central a mostra em
**Neste dispositivo** para descarte consciente.

## O curso informa alterações locais

Você editou a cópia deste dispositivo. Uma revisão oficial nova não substitui
esse trabalho. Use o controle de descarte somente se quiser restaurar a versão
oficial; a confirmação é irreversível para o rascunho local.

## Chatbot ou Plugin não acessa a conta

Confirme que a integração usa o endpoint mostrado pelo AraLearn e conclua o
OAuth entrando na conta correta. O Chatbot personalizado também precisa ter a
Action salva e vinculada. Não use chave estática. Veja [Gateway MCP de
autoria](autoria-mcp.md).

## O serviço de linguagem não gera uma prévia

Confira a configuração do provider, a conexão e o tamanho dos anexos. Uma
falha, resposta tardia ou saída fora do contrato não altera o card. Refaça o
pedido com um alvo menor e uma mudança verificável. Veja [Assistência por
IA](assistencia-por-ia.md).

## Desenvolvimento local não inicia

Confira as variáveis públicas e a porta. O servidor aceita outro valor por
configuração; não encerre um processo desconhecido. Para testes E2E, use uma
porta isolada com `ARALEARN_E2E_PORT`.

Se o problema persistir, registre uma issue sem senhas, chaves, documentos
pessoais ou conteúdo privado.

