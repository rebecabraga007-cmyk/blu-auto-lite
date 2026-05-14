# BLU Auto Lite

Painel local com os scripts que nao dependem da Meetime.

## Scripts incluidos

- Dono do Zap - validar telefones
- Formatar planilha
- Avaliar ICP com IA
- Validar tempo de existencia / MEI
- Unificar empresas + socios

## Privacidade

Este projeto nao usa banco de dados, login, sessoes, historico ou arquivo de configuracao para guardar dados do usuario.

- O token de IA fica salvo apenas no navegador via `localStorage`.
- O servidor recebe o token somente durante a requisicao de processamento.
- Uploads sao apagados ao final da requisicao.
- Resultados ficam em `tmp/outputs` apenas para download e sao removidos automaticamente depois do TTL configurado.
- A memoria/checkpoint do ICP fica desativada neste projeto.

## Rodar localmente

```powershell
cd "C:\Users\rebec\Documents\Codex\2026-05-06\files-mentioned-by-the-user-script\blu-auto-lite"
npm install
npm start
```

URL padrao:

```text
http://localhost:3100
```

## Variaveis opcionais

- `PORT`: porta do servidor. Padrao: `3100`
- `BLU_LITE_TMP_DIR`: pasta temporaria. Padrao: `./tmp`
- `BLU_LITE_OUTPUT_TTL_MS`: tempo ate remover resultados. Padrao: 2 horas

## Deploy no Railway

1. Suba a pasta `blu-auto-lite` como o projeto no GitHub.
2. No Railway, crie um novo projeto a partir desse repositorio.
3. Railway/Nixpacks detecta `package.json`, roda `npm install` e inicia com `npm start`.
4. A porta e definida automaticamente pela variavel `PORT` do Railway.
5. O healthcheck configurado esta em `/health`.

Nao configure volume persistente para este app se a regra for nao armazenar dados do usuario. Os arquivos de upload e resultado sao temporarios e ficam em `tmp/`.
