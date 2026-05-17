# Codex CLI local no AraLearn

## Visão geral

O AraLearn suporta provider local via `Codex CLI`. Esse caminho permite rodar fluxos estruturais e locais sem depender exclusivamente de providers por API.

## Arquitetura

O app fala com um bridge HTTP local que, por sua vez, aciona o `Codex CLI`. Essa separação permite que a interface web permaneça simples e que a execução local seja tratada como provider formal do produto.

## O que o app espera

O app espera:

- bridge local ativo;
- endpoint acessível;
- `Codex CLI` instalado;
- ambiente Node funcional para o bridge.

## Plataformas

### Android

No Android, o setup operacional usa `Termux` e endpoint local, normalmente em `127.0.0.1`.

### Windows

No Windows, o fluxo esperado usa PowerShell, bridge local e binário do `Codex CLI` disponível no ambiente.

### Linux

No Linux, o princípio é o mesmo: bridge local, Node e `Codex CLI` acessível.

## Saúde do bridge

O produto verifica o estado do bridge antes de iniciar operações pesadas. Isso evita abrir geração estrutural ou local quando o provider local não está operacional.

## Limitações

Esse modo depende de ambiente corretamente preparado no dispositivo do usuário. Ele não substitui a necessidade de configuração local mínima.

## Quando esse modo faz mais sentido

O provider local tende a ser útil quando o usuário quer:

- testar fluxos mais pesados;
- evitar custo direto de API;
- operar com maior autonomia local;
- manter parte importante do trabalho no próprio dispositivo.
