# Novari API — backend do planejador 3D

API em Node.js + Express que dá suporte ao planejador 3D da Novari Mobiliário Exclusivo:
projetos persistentes, clientes, orçamento aproximado, envio do projeto à Novari e
integração segura com a IA.

```
Navegador (configurador.html)
   │  novariApi.js  ──►  /api/projects, /api/clients, /api/quotes, /api/ai
   ▼
Express (routes → controllers → services → models) ──► Banco (SQLite / PostgreSQL)
   │
   ├── services/engine.js ─ carrega furnitureCatalog.js + projectState.js (os mesmos do site)
   └── services/aiService.js ─► API de IA (Claude) ─► validação dos comandos ─► navegador
```

**Princípio central:** o backend reutiliza o catálogo e o motor de regras do frontend
(`furnitureCatalog.js` e `projectState.js`). Por isso, o orçamento do servidor é igual ao que
o cliente vê no ecrã, e os comandos da IA são testados com as mesmas regras do planejador
antes de chegarem ao 3D.

---

## 1. Instalar

Requisitos: **Node.js 20 ou superior** (testado com Node 24).

```bash
cd backend
npm install
```

> O SQLite usa o pacote nativo `better-sqlite3`. Se o `npm` avisar que os *install scripts*
> estão bloqueados e o servidor não arrancar, execute `npm install-scripts approve better-sqlite3`
> e depois `npm rebuild better-sqlite3`.

## 2. Configurar (`.env`)

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

| Variável | Para que serve | Padrão |
|---|---|---|
| `PORT` | Porta HTTP | `3000` |
| `NODE_ENV` | `development`, `production` ou `test` | `development` |
| `DATABASE_URL` | Vazio = SQLite em `database/novari.sqlite`. Também aceita `sqlite:<ficheiro>` ou `postgres://…` | vazio |
| `CORS_ORIGINS` | Origens do navegador autorizadas, separadas por vírgula | em dev: `localhost:3000`, `:5500`, `:8080` |
| `SERVE_FRONTEND` | Servir o site (`configurador.html`…) pelo próprio backend | `true` |
| `AI_API_KEY` | Chave da API de IA (Anthropic). **Nunca** vai para o navegador | vazio |
| `AI_MODEL` | Modelo de IA | `claude-opus-5` |
| `AI_EFFORT` | Profundidade de raciocínio: `low`, `medium` ou `high` | `medium` |
| `AI_RATE_LIMIT_PER_MIN` | Pedidos à IA por minuto, por IP | `20` |
| `NOVARI_EMAIL` | Email que recebe os projetos | `novarimobiliarioexclusivo@gmail.com` |
| `LOG_LEVEL` | `error`, `warn`, `info`, `debug` ou `silent` | `info` |

Nunca coloque chaves reais no código nem faça commit do `.env` (já está no `.gitignore`).

## 3. Banco de dados

As tabelas são criadas **automaticamente** quando o servidor arranca. Para criá-las
sem arrancar o servidor:

```bash
npm run db:migrate
```

| Tabela | Conteúdo |
|---|---|
| `clients` | nome, email (único), telefone, observações |
| `projects` | nome, tipo, estado, orçamento estimado, `client_id`, e o **estado completo do projeto 3D** em `dados` (JSON) |
| `project_submissions` | cada envio à Novari: resumo em texto, especificações, valor aproximado e estado do envio |
| `submission_views` | planificação 3D de cada envio: imagens das vistas (perspetiva, planta, frontal, lateral) |

Um cliente tem vários projetos (`projects.client_id`). Os dados do cliente não são
copiados para os projetos. Se o cliente for excluído, os projetos continuam a existir, sem
cliente associado.

**Migrar para PostgreSQL:** todo o acesso a dados usa o query builder do Knex (sem SQL
específico do SQLite). Basta executar `npm install pg`, definir
`DATABASE_URL=postgres://utilizador:senha@host:5432/novari` e arrancar o servidor, e as
migrações criam as tabelas. Os dados já guardados em SQLite têm de ser copiados à parte.

## 4. Iniciar

```bash
npm run dev     # desenvolvimento (reinicia ao guardar ficheiros, com nodemon)
npm start       # modo normal
npm test        # testes automáticos da API
```

Com o servidor a correr:

- API: http://localhost:3000/api/health
- Planejador: http://localhost:3000/configurador.html (o site servido pelo backend, na mesma origem)

Também funciona com o Live Server do VS Code (`localhost:5500`). Nesse caso, o planejador
procura a API em `http://localhost:3000/api`.

### Como o frontend usa a API

O ficheiro `novariApi.js` (na raiz do site) liga o planejador ao backend **apenas se a API
responder**. Sem backend (por exemplo no GitHub Pages), tudo funciona como antes:
`localStorage`, `mailto:` e o assistente local.

| Ação no planejador | Com backend |
|---|---|
| **Guardar projeto** | `POST /api/projects` (depois `PUT`). O ID fica no endereço (`?projeto=<id>`) e no navegador |
| Qualquer alteração depois de guardar | Gravação automática com *debounce* de 3 s (agrupa alterações, nunca envia um pedido por cada movimento) |
| Abrir `configurador.html?projeto=<id>` | `GET /api/projects/:id`, o estado é reconstruído e o Babylon.js volta a renderizar |
| **Enviar projeto** | `POST /api/projects/:id/send` regista o pedido. O email do cliente (`mailto:`) continua a abrir enquanto o envio automático não estiver configurado |
| Assistente | Se `AI_API_KEY` estiver definido, as mensagens vão para `POST /api/ai`; senão continua o interpretador local |

Em produção, com o site e a API em domínios diferentes, defina antes dos scripts:
`<script>window.NOVARI_API_URL = 'https://api.exemplo.com/api';</script>`

---

## 5. Formato das respostas

Sucesso:

```json
{ "success": true, "data": { … } }
```

As listagens incluem `meta`:

```json
{ "success": true, "data": [ … ], "meta": { "total": 12, "limit": 20, "offset": 0 } }
```

Erro (nunca inclui stack traces nem detalhes internos):

```json
{
  "success": false,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Projeto não encontrado."
  }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `INVALID_JSON`, `INVALID_BODY` | corpo mal formado |
| 404 | `PROJECT_NOT_FOUND`, `CLIENT_NOT_FOUND`, `MODULE_NOT_FOUND`, `ROUTE_NOT_FOUND` | recurso inexistente |
| 409 | `CLIENT_EMAIL_IN_USE`, `CONFLICT` | email de cliente repetido |
| 413 | `PAYLOAD_TOO_LARGE` | pedido acima de 2 MB |
| 422 | `VALIDATION_ERROR` (com `details: [{ campo, mensagem }]`), `CLIENT_NOT_FOUND`, `CLIENT_REQUIRED`, `PROJECT_EMPTY` | dados inválidos |
| 429 | `TOO_MANY_REQUESTS`, `AI_RATE_LIMITED` | limite de pedidos à IA |
| 500 | `INTERNAL_ERROR` | erro inesperado (detalhes só no log do servidor) |
| 502 / 503 | `AI_UNAVAILABLE`, `AI_INVALID_RESPONSE` / `AI_NOT_CONFIGURED` | problemas com a IA |

---

## 6. Endpoints

### Health check

`GET /api/health`

```json
{
  "success": true,
  "message": "Novari API funcionando.",
  "data": { "versao": "0.1.0", "bancoDeDados": "ok", "ia": { "configurada": false } }
}
```

### Projetos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/projects?limit=20&offset=0&clienteId=&tipo=&estado=` | Listar (resumo, sem o estado 3D) |
| `POST` | `/api/projects` | Criar → `201` + cabeçalho `Location` |
| `GET` | `/api/projects/:id` | Obter o projeto completo |
| `PUT` | `/api/projects/:id` | Substituir o estado completo |
| `PATCH` | `/api/projects/:id` | Atualizar parte ([JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7386): objetos fundem-se, listas substituem-se, `null` apaga) |
| `DELETE` | `/api/projects/:id` | Excluir → `204` |
| `GET` | `/api/projects/:id/quote` | Orçamento aproximado do projeto guardado |
| `POST` | `/api/projects/:id/send` | Enviar à Novari |
| `GET` | `/api/projects/:id/submissions` | Histórico de envios |
| `GET` | `/api/submissions/:id/ficha` | Ficha do marceneiro (HTML): medidas, pontos técnicos, vistas 3D e link para o 3D |
| `GET` | `/api/submissions/:id/vistas/:ordem` | Imagem de uma vista 3D do envio |

O projeto usa **o mesmo formato do estado do planejador** (`projectState.js`), com os
metadados `nome` e `clienteId`. Todas as medidas estão em cm, com a origem no centro do chão
do ambiente.

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Cozinha da Maria",
    "tipo": "cozinha",
    "espaco": { "largura": 360, "profundidade": 250, "altura": 270 },
    "material": "MDF",
    "acabamento": "Carvalho",
    "estilo": "moderno",
    "modulos": [
      { "id": "modulo-001", "catalogoId": "inferior-60", "tipo": "inferior", "nome": "Armário inferior 60",
        "parede": "fundo", "posicao": { "x": -150, "y": 0, "z": 96 }, "rotacao": 0,
        "dimensoes": { "largura": 60, "altura": 82, "profundidade": 58 },
        "componentes": { "portas": 1, "gavetas": 1, "prateleiras": 1 } }
    ],
    "eletrodomesticos": ["frigorifico", "forno"],
    "preferencias": { "formato": "linear" },
    "observacoes": ""
  }'
```

Resposta `201` (resumida):

```json
{
  "success": true,
  "data": {
    "id": "3dee8ed6-5b0c-4f3e-9a51-8f0c2f1f7a10",
    "nome": "Cozinha da Maria",
    "clienteId": null,
    "orcamentoEstimado": 2006.64,
    "criadoEm": "2026-09-27T09:15:00.000Z",
    "atualizadoEm": "2026-09-27T09:15:00.000Z",
    "enviadoEm": null,
    "tipo": "cozinha",
    "espaco": { "largura": 360, "profundidade": 250, "altura": 270 },
    "paredes": [ … ], "portas": [], "janelas": [],
    "pontos": { "agua": [], "gas": [], "eletrica": [] },
    "modulos": [ … ],
    "preferencias": { … }, "conversa": { … }, "estado": "em_configuracao"
  }
}
```

Regras aplicadas pelo servidor:

- **ID único (UUID)** gerado pelo servidor. O nome não identifica o projeto.
- **O `orcamentoEstimado` é sempre recalculado** no servidor. Um valor enviado pelo navegador é ignorado.
- **Validação do estado:** tipo de ambiente, material, acabamento, estilo e eletrodomésticos
  têm de existir no catálogo. As medidas do ambiente têm de estar dentro dos limites (largura
  100–1200, profundidade 100–1000, altura 200–400 cm). Cada módulo tem de ter `catalogoId`
  válido, ID único, valores numéricos finitos e posição dentro do ambiente. Os campos em falta
  recebem os valores padrão do planejador.

Atualização parcial:

```bash
curl -X PATCH http://localhost:3000/api/projects/<id> \
  -H "Content-Type: application/json" \
  -d '{ "observacoes": "Puxadores pretos", "preferencias": { "ilha": true } }'
```

### Clientes

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/clients?q=maria&limit=20&offset=0` | Listar / pesquisar |
| `POST` | `/api/clients` | Criar (`nome` obrigatório; `email` único) |
| `GET` | `/api/clients/:id` | Cliente + os seus projetos |
| `PATCH` | `/api/clients/:id` | Atualizar |
| `DELETE` | `/api/clients/:id` | Excluir (os projetos ficam sem cliente) |
| `GET` | `/api/clients/:id/projects` | Projetos do cliente |

```bash
curl -X POST http://localhost:3000/api/clients -H "Content-Type: application/json" \
  -d '{ "nome": "Maria Silva", "email": "maria@exemplo.com", "telefone": "(11) 98888-7777" }'

# associar um projeto existente ao cliente
curl -X PATCH http://localhost:3000/api/projects/<projetoId> -H "Content-Type: application/json" \
  -d '{ "clienteId": "<clienteId>" }'
```

### Orçamento (valor aproximado)

O cálculo fica em `services/quoteService.js`, separado das rotas. Todas as respostas trazem
`"aviso": "Valor aproximado — não é o orçamento final da Novari."`

| Método | Rota | Entrada |
|---|---|---|
| `GET` | `/api/projects/:id/quote` | projeto guardado |
| `POST` | `/api/quotes/project` | estado completo de um projeto (ainda não guardado) |
| `POST` | `/api/quotes/estimate` | lista de módulos do catálogo + material/acabamento |

```bash
curl -X POST http://localhost:3000/api/quotes/estimate -H "Content-Type: application/json" \
  -d '{
    "modulos": [
      { "catalogoId": "inferior-60", "quantidade": 2 },
      { "catalogoId": "superior-80", "componentes": { "led": true } },
      { "catalogoId": "gaveteiro-60", "dimensoes": { "largura": 80 } }
    ],
    "material": "MDF",
    "acabamento": "Branco"
  }'
```

```json
{
  "success": true,
  "data": {
    "valorAproximado": 8575.2,
    "valorFormatado": "R$ 8.575",
    "moeda": "BRL",
    "linhas": [
      { "rotulo": "Estrutura dos módulos", "valor": 4340 },
      { "rotulo": "Portas e gavetas", "valor": 1820 },
      { "rotulo": "Interiores e acessórios", "valor": 280 },
      { "rotulo": "Bancada", "valor": 1300 },
      { "rotulo": "Iluminação", "valor": 200 },
      { "rotulo": "Montagem", "valor": 635.2 }
    ],
    "aviso": "Valor aproximado — não é o orçamento final da Novari.",
    "calculadoEm": "2026-09-27T09:15:00.000Z",
    "modulos": 4
  }
}
```

(Valores com os preços atuais de `furnitureCatalog.js`.)

### Envio do projeto à Novari

`POST /api/projects/:id/send`

```json
{
  "cliente": { "nome": "Maria Silva", "email": "maria@exemplo.com", "telefone": "(11) 98888-7777" },
  "observacoes": "Prefiro contacto à tarde.",
  "vistas": [{ "nome": "perspetiva", "imagem": "data:image/jpeg;base64,…" }]
}
```

`vistas` (opcional) é a planificação 3D capturada pelo planejador: até 4 imagens
(`perspetiva`, `planta`, `frontal`, `lateral`), JPEG/PNG/WebP até 2,5 MB cada.

O servidor:

1. valida o projeto (tem de ter módulos) e o contacto (email ou telefone);
2. encontra o cliente pelo email ou cria-o, sem duplicar, e associa-o ao projeto;
3. gera um resumo em texto, as especificações técnicas (módulos, medidas, componentes, pontos técnicos) e o valor aproximado;
4. regista o envio em `project_submissions`, com destino `novarimobiliarioexclusivo@gmail.com`,
   e as vistas em `submission_views`;
5. acrescenta ao resumo os links para o marceneiro: a **ficha técnica**
   (`/api/submissions/:id/ficha` — medidas de cada módulo, pontos de água/gás/eletricidade e
   vistas 3D) e o **3D interativo** (`configurador.html?projeto=…&modo=leitura`, só para ver:
   não grava alterações). Os links usam `PUBLIC_URL` e `SITE_URL` do `.env`;
6. chama `services/notificationService.js`. **O envio automático de email ainda não está
   configurado**, por isso a resposta traz `"emailEnviado": false` e o planejador continua a
   abrir o email do cliente. Para ativar o envio, implemente `enviarEmail()` nesse ficheiro
   (SMTP/nodemailer, Resend, SES…).

### Catálogo

| Método | Rota |
|---|---|
| `GET` | `/api/catalog?ambiente=cozinha` |
| `GET` | `/api/catalog/modules/:id` |

Hoje o catálogo vem de `furnitureCatalog.js`. Todo o backend lê o catálogo através de
`services/catalogService.js`. Para a Novari passar a editar preços, módulos, medidas padrão,
acessórios e materiais sem mexer no frontend, o próximo passo é:

1. criar uma tabela (por exemplo `catalog_modules`) e importar os dados atuais;
2. fazer o `catalogService` ler dessa tabela;
3. o planejador passar a carregar o catálogo por `GET /api/catalog`.

### Assistente de IA

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/ai/status` | `{ configurada: true/false }` |
| `POST` | `/api/ai` | Mensagem do cliente + estado do projeto → resposta estruturada |
| `POST` | `/api/ai/validate` | Valida comandos sem chamar a IA |

Pedido (aceita nomes em inglês ou no formato do `aiParser.js`: `mensagem`, `projeto`, `historico`):

```json
{
  "message": "Coloque mais duas gavetas",
  "project": { "tipo": "cozinha", "espaco": { … }, "modulos": [ … ] },
  "history": [ { "autor": "cliente", "texto": "Olá" } ]
}
```

Resposta:

```json
{
  "success": true,
  "data": {
    "message": "Adicionei duas gavetas ao módulo inferior.",
    "actions": [ { "action": "add_drawer", "id": "modulo-003", "quantidade": 2 } ],
    "options": ["Ver valor aproximado"],
    "completed": false,
    "rejected": []
  }
}
```

Segurança da integração:

- A chave (`AI_API_KEY`) existe **apenas** no servidor. O navegador chama `/api/ai` e nunca a API de IA.
- A IA responde com **JSON estruturado** (structured outputs), não com texto livre.
- **Todos os comandos são validados** em `validators/actionValidator.js`:
  - tipo de comando permitido (lista branca);
  - tipos e limites numéricos de cada campo;
  - IDs de módulos existentes no projeto;
  - `catalogoId`, material, acabamento, estilo e eletrodoméstico existentes no catálogo;
  - medidas do ambiente e do módulo dentro dos limites;
  - posições dentro do ambiente.

  Depois disso, os comandos são **simulados** numa cópia do projeto com o mesmo motor do
  planejador. O que o motor recusar também é rejeitado e aparece em `rejected`, com o motivo.
- Aliases em inglês (`type`, `moduleId`, `quantity`, `width`…) são convertidos para o
  formato do frontend (`action`, `id`, `quantidade`, `largura`…).
- Os pedidos à IA têm limite por IP (`AI_RATE_LIMIT_PER_MIN`).
- Os logs registam o modelo, a duração e o uso de tokens da IA, mas **não** o texto das
  mensagens, as chaves, os emails nem os telefones.

---

## 7. Estrutura

```
backend/
├── server.js              arranque: migrações + servidor HTTP + encerramento limpo
├── app.js                 app Express (usada pelo servidor e pelos testes)
├── config/                .env e configuração do banco (Knex)
├── database/              ligação + migrações
├── routes/                projects, clients, quotes, catalog, ai (+ index com /health)
├── controllers/           HTTP ↔ serviços
├── services/              regras de negócio
│   ├── engine.js          carrega furnitureCatalog.js + projectState.js numa sandbox
│   ├── projectService.js  quoteService.js  clientService.js  catalogService.js
│   ├── aiService.js       submissionService.js  notificationService.js
├── models/                acesso a dados (Knex)
├── validators/            esquemas (zod) + validação de comandos
├── middleware/            erros, logs de pedidos, CORS, rate limit, proteção de estáticos
├── utils/                 logger, AppError, helpers
└── tests/                 testes de ponta a ponta (node:test)
```

## 8. Ainda não implementado (fora do âmbito desta fase)

Login e autenticação, painel administrativo, pagamentos, deploy em cloud, domínio, Docker,
CI/CD, funcionários e permissões, envio automático de email, e catálogo editável no banco
(a arquitetura já está preparada — ver secção Catálogo).

> Sem autenticação, qualquer pessoa que conheça o ID (UUID) de um projeto consegue lê-lo e
> alterá-lo, e as rotas de listagem mostram todos os projetos e clientes. Isto serve para o
> desenvolvimento local, mas **antes de publicar a API na internet** é preciso proteger as
> rotas de listagem e de clientes (por exemplo, com o login do painel administrativo).
