# Importação por compartilhamento no Android

O APK pode receber um documento JSON do AraLearn por **Abrir com** ou
**Compartilhar**. Esse caminho importa uma biblioteca `aralearn.library.v1`
por packages para o dispositivo; ele não transforma PDF ou DOCX em curso, não chama um modelo de
linguagem e não publica conteúdo.

## Como funciona

O Android entrega ao AraLearn um texto compartilhado ou o conteúdo de um arquivo
marcado como `application/json`, `text/json`, `text/plain` ou tipo JSON
compatível. O host nativo:

- lê no máximo 5 MiB;
- recusa conteúdo vazio, ilegível ou que não possa ser tratado como texto UTF-8;
- encaminha texto e nome de origem à aplicação web somente depois que o runtime
  está pronto;
- consome a intenção uma única vez para não repetir a importação ao recriar a
  tela.

A aplicação analisa o JSON, reconhece exclusivamente o formato público
`aralearn.library.v1` e abre uma confirmação com a origem e o formato
detectado. **Importar** valida o documento e incorpora seus cursos ao projeto
local; **Cancelar** não altera nada. JSON inválido, outra versão de contrato ou
um formato desconhecido permanecem bloqueados.

Em um compartilhamento com vários arquivos, o host tenta o primeiro fluxo que
consiga ler. Para uma importação previsível, compartilhe um documento por vez.

## O que este fluxo não faz

- não extrai PDF, DOCX, imagem, áudio ou página web;
- não usa o texto compartilhado como prompt ou anexo;
- não planeja trilhas, microssequências ou cards;
- não sincroniza continuamente com o aplicativo de origem;
- não cria workspace remoto nem publicação privada ou de catálogo.

## Privacidade e publicação

A leitura e a validação inicial ocorrem no dispositivo. Importar não envia o
arquivo a um provider nem concede acesso administrativo. O conteúdo passa a
integrar o projeto local somente após confirmação. Uma publicação remota exige
o fluxo separado de workspace por GPT com MCP, autenticação OAuth e revisão
explícita da pessoa autora.
