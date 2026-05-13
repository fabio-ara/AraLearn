# Abrir com AraLearn no Android

## 1. O que o recurso faz

O APK Android do AraLearn pode receber JSON compartilhado por outros apps e reaproveitar o fluxo interno de importação já existente.

Isso permite importar conteúdo vindo de:

- ChatGPT;
- navegador;
- gerenciador de arquivos;
- editor de texto;
- qualquer app Android que envie texto ou arquivo JSON compatível.

## 2. Fluxo

```text
ChatGPT / outro app
→ Compartilhar ou Abrir com
→ AraLearn
→ validação do contrato
→ revisão/importação
```

## 3. Formatos aceitos

- `aralearn.contract`
- `aralearn.storage`
- JSON de recortes estruturais já exportados pelo AraLearn, quando embalados no mesmo envelope `aralearn.contract`

## 4. Como usar com ChatGPT

Exemplo de uso:

- pedir ao ChatGPT para gerar um arquivo JSON compatível com `aralearn.contract`;
- baixar ou compartilhar o arquivo;
- escolher `AraLearn`;
- revisar o formato detectado;
- tocar em `Importar`.

O mesmo vale para texto JSON compartilhado como `text/plain`.

## 5. Limitações

- O AraLearn não controla como cada app Android compartilha arquivos.
- Alguns apps enviam JSON como `text/plain`.
- Arquivos muito grandes podem ser rejeitados.
- O conteúdo ainda precisa obedecer ao contrato do AraLearn.
- A importação deve ser revisada pelo usuário antes de ser aplicada.
- Em `ACTION_SEND_MULTIPLE`, o app usa apenas o primeiro item legível.

## 6. Privacidade

- O arquivo recebido é processado localmente pelo AraLearn.
- O AraLearn não envia o arquivo para servidor próprio.
- Se o arquivo foi criado por ChatGPT ou outro serviço externo, continuam valendo as políticas desse serviço.

## 7. Teste manual obrigatório

1. Gerar o APK:

```powershell
npm run android:debug
```

2. Instalar o APK no Android.

3. Criar um arquivo `teste-aralearn.json` com:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": [
    {
      "title": "Curso recebido por compartilhamento",
      "modules": [
        {
          "title": "Módulo 1",
          "lessons": [
            {
              "title": "Lição 1",
              "microsequences": []
            }
          ]
        }
      ]
    }
  ]
}
```

4. Abrir o arquivo no Android com `Abrir com AraLearn`.

5. Confirmar que o AraLearn abre e mostra a revisão de importação.

6. Compartilhar texto JSON para o AraLearn.

7. Confirmar que o AraLearn importa ou mostra erro claro.
