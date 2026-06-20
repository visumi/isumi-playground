# Isumi Playground

Aplicação Angular com API em Cloudflare Workers e banco Turso/libSQL para ferramentas autenticadas, como divisão de gastos e controle de gastos mensais.

## Stack

- Angular 21 no frontend.
- Cloudflare Workers com Wrangler na API.
- Turso/libSQL como banco de dados.
- Firebase Authentication para login.

## Pré-requisitos

1. Instale o Node.js 24 ou superior.
2. Tenha acesso a um projeto Firebase com Authentication habilitado.
3. Tenha um banco Turso/libSQL criado.
4. Tenha as credenciais do Turso: `TURSO_URL` e `TURSO_AUTH_TOKEN`.

## Configuração local passo a passo

### 1. Instale as dependências

```bash
npm install
```

### 2. Crie o arquivo de ambiente

Copie o exemplo:

```bash
cp .env.example .env
```

No Windows PowerShell, se preferir:

```powershell
Copy-Item .env.example .env
```

### 3. Preencha o `.env`

Use este formato:

```env
API_BASE_URL=http://localhost:8787
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
FIREBASE_MESSAGING_SENDER_ID=
TURSO_URL=
TURSO_AUTH_TOKEN=
OWNER_EMAIL=
ALLOWED_EMAILS=
```

Preencha assim:

- `API_BASE_URL`: URL local da API. Para desenvolvimento, use `http://localhost:8787`.
- `FIREBASE_API_KEY`: chave Web API do app Firebase.
- `FIREBASE_AUTH_DOMAIN`: domínio de autenticação do Firebase. Normalmente `seu-projeto.firebaseapp.com`.
- `FIREBASE_PROJECT_ID`: ID do projeto Firebase.
- `FIREBASE_APP_ID`: ID do app Web no Firebase.
- `FIREBASE_MESSAGING_SENDER_ID`: sender ID do Firebase.
- `TURSO_URL`: URL do banco Turso/libSQL.
- `TURSO_AUTH_TOKEN`: token de acesso ao banco.
- `OWNER_EMAIL`: e-mail do dono da plataforma. Esse usuário sempre pode acessar a tela de administração.
- `ALLOWED_EMAILS`: lista opcional usada somente para migrar e-mails antigos para a nova gestão de acessos.

### 4. Gere o ambiente do frontend

```bash
npm run web:env
```

Esse comando cria `apps/web/src/environments/environment.ts`. O arquivo é local, gerado automaticamente e não deve ser commitado.

### 5. Rode as migrações do banco

```bash
npm run db:migrate
```

As migrações ficam em `db/migrations` e são aplicadas em ordem alfabética.

### 6. Inicie a API

Em um terminal:

```bash
npm run api:dev
```

A API local sobe pelo Wrangler usando `apps/api/wrangler.jsonc`.

### 7. Inicie o frontend

Em outro terminal:

```bash
npm run web:start
```

Por padrão, o Angular fica disponível em `http://localhost:4200`.

### 8. Acesse a aplicação

Abra:

```text
http://localhost:4200
```

Entre com a conta Firebase configurada em `OWNER_EMAIL`. Depois, gerencie os demais acessos pela tela "Acessos".

## Comandos úteis

```bash
npm run web:start
```

Inicia o frontend Angular.

```bash
npm run api:dev
```

Inicia a API local com Wrangler.

```bash
npm run db:migrate
```

Aplica as migrações no Turso/libSQL configurado no `.env`.

```bash
npm run web:test
```

Roda os testes do frontend.

```bash
npm run api:test
```

Roda os testes da API.

```bash
npm run web:build
```

Gera o build de produção do frontend.

```bash
npm run api:deploy
```

Publica a API no Cloudflare Workers.

## Observações para testes no Windows

Se o comando `npm run web:test` não encontrar o Chrome, defina `CHROME_BIN` apontando para o Microsoft Edge:

```powershell
$env:CHROME_BIN='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run web:test
```

## Configuração do Cloudflare Worker

O Worker usa `apps/api/wrangler.jsonc`.

Variáveis públicas configuradas no `wrangler.jsonc`:

- `ALLOWED_ORIGIN`

Secrets obrigatórios no Cloudflare:

- `TURSO_URL`
- `TURSO_AUTH_TOKEN`
- `FIREBASE_PROJECT_ID`
- `OWNER_EMAIL`

Configure os secrets com:

```bash
npx wrangler secret put TURSO_URL --config apps/api/wrangler.jsonc
npx wrangler secret put TURSO_AUTH_TOKEN --config apps/api/wrangler.jsonc
npx wrangler secret put FIREBASE_PROJECT_ID --config apps/api/wrangler.jsonc
npx wrangler secret put OWNER_EMAIL --config apps/api/wrangler.jsonc
```

## Produção

- Frontend: GitHub Pages com domínio `playground.isumi.com.br`.
- API: Cloudflare Workers em `playground-api.isumi.com.br`.
- Banco: Turso/libSQL.
- Ambiente do frontend: gerado por `npm run web:env`.

Antes de publicar, confirme que os secrets do GitHub Actions e do Cloudflare estão configurados.

## Estrutura principal

```text
apps/web        Frontend Angular
apps/api        API Cloudflare Workers
db/migrations   Migrações SQL do Turso/libSQL
scripts         Scripts de ambiente e banco
```
