# Catálogo de Filmes — Tom Hanks

Aplicação web de catálogo de filmes com Tom Hanks, consumindo a API do [TMDB](https://www.themoviedb.org/documentation/api) em tempo real. Usuários podem se cadastrar, fazer login, favoritar filmes, comentar e montar suas próprias tier lists — tudo isolado por conta, com persistência em MariaDB.

A aplicação é dividida em **três serviços independentes**: um catálogo público, um serviço de autenticação isolado e um serviço de log de auditoria isolado — os dois últimos não são acessíveis diretamente pela internet. O controle de acesso segue o modelo **RBAC** (Role-Based Access Control), com 4 papéis hierárquicos e permissões crescentes.

Projeto desenvolvido para a disciplina ministrada pelo professor **@siriani**.

## Funcionalidades

- Cadastro e login próprios da aplicação, com sessão via **JWT em cookie httpOnly**
- 4 papéis de usuário hierárquicos (`espectador` < `fan` < `cinefilo` < `stalker`), cada um herdando as permissões do anterior
- Recuperação de senha por e-mail, com token de expiração de 30 minutos e uso único
- Listagem de filmes com Tom Hanks, buscados ao vivo na API do TMDB (pôster, título e sinopse nunca são salvos localmente)
- Contagem pública de favoritos por filme, visível a qualquer usuário logado
- Favoritar / desfavoritar filmes e comentar (a partir do papel `fan`)
- Ver os comentários de todos os usuários, não só os próprios (a partir do papel `cinefilo`)
- Moderação: apagar qualquer comentário (a partir do papel `stalker`)
- Tier lists **pessoais**: cada `stalker` monta e mantém sua própria classificação de filmes (S/A/B/C/D, com pôsteres); qualquer usuário logado pode navegar e visualizar a tier list de qualquer stalker, mas só o dono edita a sua
- Página de Planos, listando os 4 papéis com seus recursos e limitações, destacando o plano atual do usuário
- Recursos bloqueados por papel continuam visíveis na interface (não são escondidos), mas abrem um modal de upgrade ao serem acionados sem permissão — a validação de segurança real acontece sempre no backend, nunca depende do que a interface mostra ou esconde
- Isolamento total de dados entre contas diferentes — cada usuário só acessa seus próprios favoritos e comentários
- Limite de requisições (rate limiting) em rotas sensíveis e de escrita, para reduzir risco de força bruta e sobrecarga do banco
- **Log de auditoria**: login, logout, favoritar, comentar, apagar comentário (moderação) e toda tentativa de ação negada por permissão (`403`) são registrados num serviço próprio, consultável apenas por `stalker` (ver seção [Log de auditoria (log-service)](#log-de-auditoria-log-service))

## Controle de acesso (RBAC)

O sistema segue Role-Based Access Control: permissões são atribuídas a **papéis**, não a pessoas. Um usuário recebe um papel; o papel carrega um conjunto de permissões. Mudar o que um papel pode fazer é uma mudança num lugar só no código (a lista `HIERARQUIA` e os middlewares `exigirNivel`), não em cada usuário individualmente.

As permissões são **cumulativas** — um papel superior sempre pode tudo que os papéis abaixo dele podem, mais suas permissões exclusivas.

| Papel | Nível | Pode fazer |
|---|---|---|
| `espectador` | 1 | Ver a lista de filmes; ver a contagem de favoritos por filme; visualizar a tier list de qualquer stalker |
| `fan` | 2 | Tudo do espectador **+** favoritar/desfavoritar filmes; comentar; apagar os próprios comentários; ver apenas os próprios comentários em cada filme |
| `cinefilo` | 3 | Tudo do fan **+** ver os comentários de **todos** os usuários em cada filme |
| `stalker` | 4 | Tudo do cinéfilo **+** apagar **qualquer** comentário (moderação); criar e editar a própria tier list; consultar o log de auditoria |

Todo usuário novo nasce no papel `espectador`. A promoção de papel é feita diretamente no banco (não há tela de administração de papéis nesta versão):
```sql
UPDATE usuarios SET role = 'fan' WHERE email = 'seu-email@exemplo.com';
```
É necessário fazer login novamente após a alteração, já que o papel fica embutido no token JWT emitido no momento do login (ver seção "Padrão de arquitetura" abaixo).

Não existe um papel "administrador" separado neste projeto: o `stalker`, topo da hierarquia, acumula tanto a moderação de comentários quanto o acesso ao log de auditoria.

### Enforcement: nunca só na interface

Um erro comum é esconder um botão de ação restrita na tela e considerar isso segurança — não é, é só interface. Qualquer pessoa consegue chamar o endpoint direto via Postman/curl, ignorando completamente o que a tela mostra ou esconde.

Por isso, nesta aplicação, **os controles de ações restritas continuam visíveis na interface** mesmo para quem não tem o papel necessário (ex: o botão de favoritar aparece para um `espectador`) — o clique abre um modal convidando para upgrade de plano, em vez de simplesmente sumir. A validação real acontece exclusivamente no backend, no middleware `exigirNivel`, que lê o papel a partir do JWT assinado (nunca de algo que o cliente possa forjar) e responde **403** sempre que o nível for insuficiente, independente de qual caminho a requisição tenha vindo. Toda ocorrência de **403** é também registrada no log de auditoria, por ser especialmente valiosa para segurança.

### Padrão de arquitetura: claims no token (Padrão B)

Existem dois padrões comuns para decidir "o que esse usuário pode fazer":

- **Padrão A — enforcement centralizado:** cada ação sensível faz uma chamada de rede ao serviço de autenticação perguntando se é permitida. Mudar uma regra tem efeito imediato para todos, mas cada ação paga o custo de uma ida-e-volta de rede extra.
- **Padrão B — claims no token (JWT):** o papel do usuário já vem dentro do próprio token, assinado no momento do login. Cada serviço decide sozinho, sem chamada extra. É mais rápido e desacopla os serviços, mas uma mudança de papel só tem efeito quando o token expirar e o usuário logar novamente.

Este projeto usa o **Padrão B**: o `auth-service` assina um JWT contendo `usuario_id`, `nome` e `role` no login; o `catalogo` valida e decodifica esse token localmente (via `jsonwebtoken`, com a mesma `JWT_SECRET` compartilhada) em cada requisição, sem nunca chamar o `auth-service` de novo para confirmar permissão.

Se fosse trocado para o Padrão A, o `catalogo` deixaria de decodificar o token sozinho e passaria a fazer uma chamada HTTP interna ao `auth-service` (ex: `GET /verificar-permissao`) a cada ação sensível, perguntando se aquele `usuario_id` tem o papel necessário — o middleware `exigirNivel` deixaria de ler `req.usuario.role` do JWT e passaria a aguardar essa resposta de rede antes de decidir. Isso tornaria mudanças de papel (ex: promover um usuário) instantâneas, mas colocaria o `auth-service` como dependência síncrona de toda ação da aplicação, e a latência de rede aumentaria em cada requisição.

O `log-service`, por sua vez, **não participa** dessa decisão de autorização — ele nunca decodifica JWT nem sabe o que é um papel. Quem autoriza o acesso ao log é sempre o mesmo middleware `exigirNivel('stalker')` do catálogo, que só então repassa a consulta ao log-service via proxy interno.

## Demonstração

- **Espectador**:
![alt text](test-pictures/teste-espectador.png)

- **Fan e cinéfilo**:
![alt text](test-pictures/teste-fan-e-cinefilo.png)

- **Stalker**:
![alt text](test-pictures/test-stalker-before.png)
![alt text](test-pictures/test-stalker-after.png)


## Arquitetura

```
Navegador → catálogo (único ponto público)
                │
                ├── TMDB (filmes)
                ├── MariaDB (favoritos, comentários, tier_list)
                ├── auth-service (rede interna do Docker, sem porta pública)
                │         │
                │         ├── MariaDB (usuários, reset_tokens)
                │         └── SMTP (Gmail SMTP)
                │
                └── log-service (rede interna do Docker, sem porta pública)
                          │
                          └── Redis (Streams)
```

O `catalogo` é o único serviço com porta publicada. Toda autenticação (login, cadastro, papéis, recuperação de senha) é isolada no `auth-service`, e todo o log de auditoria é isolado no `log-service` — ambos acessíveis apenas pela rede interna do Docker, pelo nome do serviço (`http://auth-service:<porta>` e `http://log-service:<porta>`). O `catalogo` nunca acessa a tabela de usuários diretamente — ele repassa as requisições de auth via HTTP interno e, no login, recebe de volta um JWT assinado pelo `auth-service`, que passa a guardar como cookie httpOnly no navegador do usuário. Da mesma forma, nem o `catalogo` nem o `auth-service` acessam o Redis diretamente — ambos disparam eventos de auditoria via HTTP interno ao `log-service`, que é o único que fala com o Redis.

## Log de auditoria (log-service)

Um terceiro microsserviço, **isolado** dos outros dois, com o único propósito de registrar eventos de auditoria: login, logout, favoritar, comentar, apagar comentário (moderação) e toda tentativa de ação negada por permissão (`403`).

### Por que um serviço à parte, e por que Redis (não MariaDB)

Log de auditoria tem um padrão de uso bem diferente de dado de negócio: escreve muito, lê pouco, e praticamente nunca precisa de transação complexa ou de `JOIN` com outras tabelas. Colocar isso no MariaDB junto com `favoritos`/`comentarios` misturaria duas responsabilidades distintas.

O `log-service` usa **Redis Streams** (`XADD` para gravar, `XREVRANGE` para consultar), uma estrutura de dados pensada especificamente para logs de eventos ordenados no tempo, com escrita rápida em alto volume. Todos os eventos vão para um único stream (`logs:eventos`), o que facilita reconstruir a ordem cronológica de ações vindas de serviços diferentes (auth-service e catálogo) numa única consulta.

### Duas camadas de assincronismo — log nunca atrasa nem quebra a ação do usuário

**Camada 1 — catálogo/auth-service → log-service.**
As chamadas para o `log-service` são **fire-and-forget**: nunca usam `await` bloqueando a resposta ao usuário, e qualquer falha (log-service ou Redis fora do ar) é apenas registrada no console do serviço de origem. Uma falha no log jamais pode impedir a ação principal do usuário (ex: favoritar não pode quebrar porque o log caiu).

**Camada 2 — dentro do próprio log-service, fila em memória antes do Redis.**
O `POST /eventos` não grava direto no Redis: ele valida o evento, empilha numa fila em memória e responde **`202 Accepted`** imediatamente. Um worker assíncrono, rodando em background no mesmo processo, drena essa fila um evento por vez e só então faz o `XADD`. Isso garante que o log-service responde rápido a quem o chamou mesmo que o Redis esteja temporariamente lento — reforçando, numa segunda camada, o mesmo princípio da primeira.

Se o `XADD` falhar (ex: Redis momentaneamente indisponível), o evento volta pro fim da fila e é tentado novamente, até 3 vezes; depois disso é descartado com um log de erro, para não travar os eventos seguintes indefinidamente.

```
POST /eventos → valida → enfileira (memória) → responde 202
                                │
                    worker em loop (background)
                                │
                          XADD no Redis (com retry)
```

**Limitação conhecida:** a fila é em memória. Se o container do log-service reiniciar com eventos ainda pendentes de gravação, esses eventos se perdem (não sobrevivem a um restart). Para o escopo deste projeto, esse trade-off é aceitável em troca de simplicidade — não foi introduzido nenhum componente de infraestrutura novo (como uma fila dedicada) só para esse fim. Uma rota de diagnóstico (`GET /fila/status`, interna) expõe quantos eventos estão pendentes de gravação a qualquer momento, útil para observar se a fila está acumulando (sinal de problema na conexão com o Redis).

### Estrutura de cada evento

| Campo | Descrição |
|---|---|
| `usuario_id` | id do usuário que originou a ação (pode ser `null`, ex. em `logout` com token já expirado) |
| `acao` | `login`, `logout`, `favoritar`, `comentar`, `comentario_deletado_moderacao` ou `acesso_negado` |
| `timestamp` | gerado no momento em que o evento chega ao log-service (não quando o worker eventualmente grava), refletindo a ordem real de chegada |
| `ip_origem` | IP de quem chamou o log-service — como tudo roda na rede interna do Docker, é o **IP interno do container de origem** (`catalogo` ou `auth-service`), não o IP público do navegador do cliente |
| `detalhe` | opcional, texto livre (ex: rota tentada e papel atual, no caso de `acesso_negado`) |

### Endpoints

**log-service** (interno, sem porta publicada):
- `POST /eventos` — valida e enfileira um evento; responde `202` imediatamente, a gravação (`XADD`) acontece em background
- `GET /eventos?limit=N` — retorna os N eventos mais recentes já gravados no stream, em ordem cronológica
- `GET /fila/status` — diagnóstico: quantidade de eventos ainda pendentes de gravação

**catálogo** (público, proxy protegido):
- `GET /api/logs?limit=N` — protegido por `exigirLogin` + `exigirNivel('stalker')`, o mesmo controle de acesso das rotas de moderação e tier list. Um `usuario` comum recebe `403`.

### Demonstração do log de auditoria

1. Fazer login (`POST /api/auth/login`) → evento `login` registrado
2. Favoritar um filme (`POST /api/favoritos`) → evento `favoritar` registrado
3. Comentar (`POST /api/comentarios`) → evento `comentar` registrado
4. Com um usuário **não-stalker**, tentar apagar um comentário de moderação (`DELETE /api/comentarios/:id`) → recebe `403`, evento `acesso_negado` registrado
5. Fazer logout (`POST /api/auth/logout`) → evento `logout` registrado
6. Logar como **stalker** e consultar `GET /api/logs?limit=20` (pelo navegador ou via `fetch` no DevTools) → todos os eventos acima aparecem, na ordem em que aconteceram

Para inspecionar o stream diretamente no Redis (depuração, fora do fluxo normal da aplicação):
```bash
docker compose exec redis redis-cli
XRANGE logs:eventos - +
```

## Stack

- **Backend:** Node.js + Express (três serviços independentes)
- **Frontend:** HTML, CSS e JavaScript puros (sem framework), servido pelo `catalogo`
- **Banco de dados:** MariaDB (remoto, compartilhado pelo catálogo e pelo auth-service)
- **Log de auditoria:** Redis (Streams), isolado no `log-service`
- **API externa:** TMDB (The Movie Database)
- **Autenticação:** JWT (`jsonwebtoken`) em cookie httpOnly (`cookie-parser`, no catálogo) + bcrypt + crypto (no auth-service)
- **E-mail transacional:** Gmail SMTP
- **Deploy:** Docker + Docker Hub + Docker Compose + Portainer

## Estrutura do projeto

```
.
├── docker-compose.yml
├── .env                        # não versionado — veja .env.example
├── .env.example
├── README.md
│
├── catalogo/                   # container público — filmes, favoritos, comentários, tier lists, planos
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── db.js
│   ├── routes.js
│   ├── logClient.js            # dispara eventos de auditoria pro log-service (fire-and-forget)
│   └── public/
│       ├── login.html
│       ├── cadastro.html
│       ├── catalogo.html
│       ├── esqueci-senha.html
│       ├── redefinir-senha.html
│       ├── tier-list.html            # índice: cards de cada stalker
│       ├── tier-list-detalhe.html    # tier list individual, visual tradicional (fileiras S/A/B/C/D)
│       ├── planos.html
│       ├── css/index.css
│       └── js/
│           ├── login.js
│           ├── cadastro.js
│           ├── catalogo.js
│           ├── esqueci-senha.js
│           ├── redefinir-senha.js
│           ├── tier-list.js
│           ├── tier-list-detalhe.js
│           └── planos.js
│
├── auth-service/               # container interno, sem porta publicada
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── db.js
│   ├── logClient.js            # dispara eventos de auditoria pro log-service (fire-and-forget)
│   └── routes.js                # cadastro, login (emite JWT), esqueci-senha, redefinir-senha
│
└── log-service/                # container interno, sem porta publicada
    ├── Dockerfile
    ├── package.json
    ├── server.js
    ├── routes.js                # POST /eventos, GET /eventos, GET /fila/status
    ├── queue.js                 # fila em memória + worker que grava no Redis em background
    └── redisClient.js
```

## Como rodar localmente

### Pré-requisitos
- Docker e Docker Compose
- Acesso a um banco MariaDB (local ou remoto)
- Chave de API do TMDB ([obter aqui](https://www.themoviedb.org/settings/api)) — requer criar conta na plataforma
- Conta no Google para @gmail.com

O Redis usado pelo `log-service` **não precisa ser provisionado à parte** — sobe junto com os demais serviços pelo próprio `docker-compose.yml`.

### Passo a passo

1. Clone o repositório:
   ```bash
   git clone https://github.com/Igor-RR/API-Tom-Hanks
   cd API-Tom-Hanks
   ```

2. Copie o arquivo de variáveis de ambiente e preencha com seus valores reais:
   ```bash
   cp .env.example .env
   ```

3. Crie as tabelas no seu banco MariaDB (veja o SQL abaixo). O `log-service` não usa MariaDB, então não há schema adicional para ele.

4. Suba os serviços com Docker Compose:
   ```bash
   docker compose up --build
   ```

5. Acesse `http://localhost:3000` (porta do serviço `catalogo` — o `auth-service` e o `log-service` não são acessíveis diretamente, por padrão de arquitetura).

### Schema do banco

```sql
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'espectador',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  usuario_id INT NOT NULL,
  criado_em DATETIME NOT NULL,
  expira_em DATETIME NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE favoritos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  tmdb_movie_id INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  UNIQUE (usuario_id, tmdb_movie_id)
);

CREATE TABLE comentarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  tmdb_movie_id INT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- uma tier list por stalker: cada linha é um filme classificado por um usuário específico
CREATE TABLE tier_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  usuario_nome VARCHAR(100) NOT NULL,
  tmdb_movie_id INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  tier VARCHAR(2) NOT NULL,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE (usuario_id, tmdb_movie_id)
);
```

### Promovendo um usuário

Não há tela de administração de papéis — a promoção é feita diretamente no banco, usando qualquer um dos 4 valores (`espectador`, `fan`, `cinefilo`, `stalker`):
```sql
UPDATE usuarios SET role = 'stalker' WHERE email = 'seu-email@exemplo.com';
```
É necessário logar novamente após a alteração, para que um novo JWT seja emitido com o papel atualizado. Lembrando que `stalker` também é quem passa a ter acesso à rota de consulta do log de auditoria.

## Variáveis de ambiente

| Variável | Serviço | Descrição |
|---|---|---|
| `PORT_CATALOGO` | catálogo | Porta interna em que o catálogo escuta (mapeada no `docker-compose.yml`) |
| `JWT_SECRET` | catálogo, auth-service | Chave usada para assinar e validar o token JWT — precisa ser **idêntica** nos dois serviços |
| `TMDB_API_KEY` | catálogo | Chave de API do TMDB |
| `AUTH_SERVICE_URL` | catálogo | URL interna do auth-service (ex: `http://auth-service:4000`) |
| `LOG_SERVICE_URL` | catálogo, auth-service | URL interna do log-service (ex: `http://log-service:5000`) |
| `PORT_AUTH` | auth-service | Porta interna em que o auth-service escuta (uso interno, sem exposição) |
| `APP_URL` | auth-service | URL pública do catálogo — usada para montar o link de redefinição de senha enviado por e-mail (ex: `https://seu-dominio.com`, sem porta e sem barra final) |
| `SMTP_HOST` | auth-service | Host do servidor SMTP (Gmail) |
| `SMTP_PORT` | auth-service | Porta SMTP |
| `SMTP_USER` | auth-service | Usuário/e-mail de autenticação SMTP |
| `SMTP_PASS` | auth-service | Senha SMTP (senha de app, no caso do Gmail — nunca a senha normal da conta) |
| `PORT_LOG` | log-service | Porta interna em que o log-service escuta |
| `REDIS_HOST` | log-service | Host do Redis (nome do serviço no Docker Compose) |
| `REDIS_PORT` | log-service | Porta do Redis |
| `DB_HOST` | catálogo, auth-service | Endereço do servidor MariaDB |
| `DB_USER` | catálogo, auth-service | Usuário do banco |
| `DB_PASSWORD` | catálogo, auth-service | Senha do usuário do banco |
| `DB_NAME` | catálogo, auth-service | Nome do banco de dados |

Localmente, os três serviços leem o mesmo arquivo `.env` na raiz (o Docker Compose resolve automaticamente os `${...}` do `docker-compose.yml` a partir dele). Em produção (Portainer), os mesmos pares chave-valor são cadastrados na tela de *Environment variables* da stack. O `log-service` não usa `DB_HOST`/`DB_USER`/etc. — ele não acessa o MariaDB.

## Segurança

- Senhas armazenadas com hash (`bcrypt`), nunca em texto puro
- Autenticação via **JWT em cookie httpOnly**, `secure` (exige HTTPS em produção) e `sameSite: strict` (mitigação de CSRF) — o token nunca é acessível via JavaScript no navegador
- O papel (`role`) do usuário vem embutido no JWT assinado pelo `auth-service`; o middleware `exigirNivel` do catálogo decodifica e valida esse token a cada requisição, nunca confiando em nada vindo do corpo/parâmetros da requisição do cliente
- Toda ação restrita por papel responde **403** quando o nível é insuficiente (distinto de **401**, reservado para ausência/invalidade do token) — a checagem acontece sempre no backend, independente do que a interface mostra ou esconde
- Toda ocorrência de **403** é registrada no log de auditoria (`log-service`), com a rota tentada e o papel atual do usuário, para permitir investigar tentativas de acesso indevido
- Tokens de redefinição de senha gerados com `crypto.randomBytes` (aleatoriedade criptográfica), com expiração de 30 minutos e uso único
- O `auth-service` e o `log-service` não são acessíveis pela internet — não possuem porta publicada no `docker-compose.yml`, apenas a rede interna do Docker
- O catálogo nunca recebe ou armazena o hash de senha de um usuário
- Toda consulta a favoritos/comentários/tier list pessoal é filtrada por `usuario_id`, extraído do JWT validado
- A consulta ao log de auditoria (`GET /api/logs`) é restrita a `stalker`, pelo mesmo middleware `exigirNivel` usado nas demais rotas sensíveis
- Rotas de escrita (favoritar, comentar, classificar filme, apagar) e as rotas de login/esqueci-senha possuem limite de requisições (`express-rate-limit`)
- A rota de "esqueci minha senha" sempre responde a mesma mensagem, exista ou não o e-mail informado, evitando enumeração de contas cadastradas
- Chamadas de auditoria (`catalogo`/`auth-service` → `log-service`) são fire-and-forget: uma falha no log nunca bloqueia nem reverte a ação principal do usuário
- Variáveis sensíveis configuradas via ambiente (`.env` local, nunca commitado; ou na tela de variáveis da stack no Portainer), jamais expostas no `Dockerfile` ou no código do cliente

## Deploy

### Publicando as imagens no Docker Hub

Cada serviço possui seu próprio `Dockerfile` e imagem, publicados separadamente:
```bash
docker login
docker compose build
docker compose push
```

### Subindo no Portainer

No Portainer, a stack usa as imagens já publicadas no Docker Hub (sem `build:`, já que o servidor não tem acesso ao código-fonte diretamente):

```yaml
services:
  catalogo:
    image: igorrueda/api-tom-hanks-microserv-catalogo:latest
    ports:
      - "<porta-do-host>:<PORT_CATALOGO>"
    environment:
      - PORT_CATALOGO=${PORT_CATALOGO}
      - JWT_SECRET=${JWT_SECRET}
      - TMDB_API_KEY=${TMDB_API_KEY}
      - AUTH_SERVICE_URL=${AUTH_SERVICE_URL}
      - LOG_SERVICE_URL=${LOG_SERVICE_URL}
      - DB_HOST=${DB_HOST}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
    depends_on:
      - auth-service
      - log-service

  auth-service:
    image: igorrueda/api-tom-hanks-microserv-auth-service:latest
    environment:
      - PORT_AUTH=${PORT_AUTH}
      - JWT_SECRET=${JWT_SECRET}
      - APP_URL=${APP_URL}
      - LOG_SERVICE_URL=${LOG_SERVICE_URL}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - DB_HOST=${DB_HOST}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
    depends_on:
      - log-service

  redis:
    image: redis:7-alpine
    # sem "ports:" -- mesmo princípio do auth-service: só acessível pela
    # rede interna do Docker, nunca pela internet
    restart: unless-stopped
    volumes:
      - redis-data:/data
    command: ["redis-server", "--appendonly", "yes"]

  log-service:
    image: igorrueda/api-tom-hanks-microserv-log-service:latest
    environment:
      - PORT_LOG=${PORT_LOG}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis-data:
```

Pontos importantes:
- **Apenas o `catalogo` tem `ports:`** — o `auth-service` e o `log-service` nunca devem expor porta ao host, é isso que garante seu isolamento da internet.
- **`JWT_SECRET` precisa ser exatamente igual no `catalogo` e no `auth-service`** — é essa chave compartilhada que permite ao catálogo validar um token assinado pelo auth-service, sem consultá-lo a cada requisição. O `log-service` não usa `JWT_SECRET` — ele nunca decodifica token, só recebe eventos já autorizados pelo catálogo.
- **A tela de "Environment variables" da stack, sozinha, não injeta nada nos containers** — ela só disponibiliza valores para os `${...}` referenciados dentro do `environment:` de cada serviço no compose. Sem esse `environment:` explícito, os valores cadastrados na stack são ignorados pelos containers.
- **O volume `redis-data` garante persistência do stream em disco** entre reinicializações do container do Redis (`--appendonly yes`) — sem ele, um restart do container do Redis apagaria todo o histórico de auditoria já gravado.
- Após qualquer mudança de código, é necessário `docker compose build && docker compose push` local, seguido de **"Re-pull image and redeploy"** na stack do Portainer.
- Após qualquer mudança apenas nas variáveis de ambiente ou no `docker-compose.yml` (sem mudança de código), basta **"Update the stack"** no Portainer.

Em produção, o envio de e-mail usa Gmail SMTP como remetente.