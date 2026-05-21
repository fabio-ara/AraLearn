# Uso do app

Este guia descreve o fluxo principal de uso do AraLearn: criar escopo, gerar trilha, abrir microssequência, materializar cards e revisar.

## 1. Criar o escopo

O usuário começa informando:

- título do curso ou tema;
- objetivo opcional;
- prioridade de evidências;
- módulos;
- expressões do que entra em cada módulo;
- expressões do que fica fora;
- observações;
- estilo de avaliação ou uso.

Essas informações formam o contrato `aralearn.scope.v1`.

O escopo pode ser preenchido manualmente ou importado como JSON válido.

## 2. Gerar a trilha

Ao solicitar a geração da trilha, o app deve:

1. validar o contrato de escopo;
2. chamar o provider configurado;
3. validar a saída estrutural;
4. aplicar o resultado ao projeto local.

O resultado esperado é uma árvore com curso, módulos, lições e microssequências planejadas. Os cards ainda não precisam existir.

## 3. Navegar pela árvore

Depois da geração estrutural, o usuário navega por:

```text
curso -> módulo -> lição -> microssequência
```

Cada microssequência possui status:

- `planned`: planejada, ainda sem cards;
- `generated`: possui uma versão de cards;
- `needs_review`: recebeu alteração que pede revisão;
- `ready`: foi considerada pronta pelo usuário.

## 4. Estudar uma microssequência

Ao abrir uma microssequência, o usuário pode:

- gerar cards;
- melhorar explicação;
- acrescentar prática;
- criar complemento;
- gerar a próxima microssequência;
- marcar como pronta.

Essas ações operam apenas sobre o ponto selecionado da trilha.

Na aba `Edição`, o fluxo agora tem duas áreas:

- `Pedido`: o texto editável da intervenção atual, com ação, materialização preferida, anexos e modelo;
- `Retorno da intervenção`: o feedback persistido da última chamada, somente leitura por padrão, com opção de edição do texto-base da próxima iteração.

Se a geração couber em uma chamada, o retorno marca a etapa como concluída. Se houver erro recuperável ou necessidade de continuação, o app habilita nova iteração diretamente a partir desse retorno, inclusive com troca de modelo quando o usuário quiser.

## 5. Revisar versões

Cada geração ou ajuste cria uma nova versão da microssequência. Isso permite comparar resultados e preservar histórico de intervenção.

A versão ativa é a usada para estudo. Versões preservadas podem continuar disponíveis para inspeção ou recuperação.

## 6. Criar complemento

Quando faltar uma etapa intermediária, o usuário pode criar uma microssequência de apoio.

Esse complemento fica ligado à microssequência de origem e deve resolver uma lacuna local, sem refazer a organização inteira do curso.

## 7. Configurar provider

A área de provider permite escolher e configurar:

- Gemini;
- OpenAI compatível;
- Codex local;
- Fake provider para testes.

Dependendo do provider, o usuário informa modelo, chave de API, base URL, token ou endpoint local.

## 8. Exportar e auditar

Como o projeto segue contrato público, ele pode ser exportado, importado, validado e inspecionado. Isso preserva portabilidade e facilita avaliação técnica.
