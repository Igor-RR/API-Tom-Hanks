# Catálogo de Filmes — Tom Hanks

Aplicação web de catálogo de filmes com Tom Hanks, consumindo a API do [TMDB](https://www.themoviedb.org/documentation/api) em tempo real. Usuários podem se cadastrar, fazer login, favoritar filmes e deixar comentários — tudo isolado por conta, com persistência em MariaDB.

A aplicação é dividida em **dois serviços independentes**: um catálogo público e um serviço de autenticação isolado, que não é acessível diretamente pela internet.

Projeto desenvolvido para a disciplina ministrada pelo professor **@siriani**.

## Funcionalidades

- Cadastro e login próprios da aplicação (sessão salva via cookie)
- Papéis de usuário (`usuario` / `admin`)
- Recuperação de senha por e-mail, com token de expiração de 30 minutos e uso único
- Listagem de filmes com Tom Hanks, buscados ao vivo na API do TMDB (pôster, título e sinopse nunca são salvos localmente)
- Favoritar / desfavoritar filmes
- Comentar filmes; cada usuário pode apagar os próprios comentários; administradores podem moderar (apagar) qualquer comentário
- Isolamento total de dados entre contas diferentes — cada usuário só acessa seus próprios favoritos e comentários
- Limite de requisições (rate limiting) em rotas sensíveis e de escrita, para reduzir risco de força bruta e sobrecarga do banco

## Arquitetura

```
Navegador → catálogo (Ponto público)
                │
                ├── TMDB (filmes)
                ├── MariaDB (favoritos, comentários)
                └── auth-service (rede interna do Docker, sem porta pública)
                          │
                          ├── MariaDB (usuários, reset_tokens)
                          └── Mailtrap (Testar a coleta de e-mails)

O `catalogo` é o único serviço com porta publicada. Toda autenticação (login, cadastro, papéis, recuperação de senha) é isolada no `auth-service`, acessível apenas pela rede interna do Docker, pelo nome do serviço (`http://auth-service:<porta>`). O `catalogo` nunca acessa a tabela de usuários diretamente — ele repassa as requisições de auth via HTTP interno e decide a sessão com base na resposta.

## Stack

- **Backend:** Node.js + Express (dois serviços independentes)
- **Frontend:** HTML, CSS e JavaScript puros (sem framework), servido pelo `catalogo`
- **Banco de dados:** MariaDB (remoto, compartilhado pelos dois serviços)
- **API externa:** TMDB (The Movie Database)
- **Autenticação:** express-session (no catálogo) + bcrypt + crypto (no auth-service)
- **E-mail transacional:** nodemailer — Mailtrap (dev/sandbox)
- **Deploy:** Docker + Docker Hub + Docker Compose + Portainer

## Estrutura do projeto

```
.
├── docker-compose.yml
├── .env                        # não versionado — veja .env.example
├── .env.example
├── README.md
│
├── catalogo/                   # container público — filmes, favoritos, comentários
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── db.js
│   ├── routes.js
│   └── public/
│       ├── login.html
│       ├── cadastro.html
│       ├── catalogo.html
│       ├── esqueci-senha.html
│       ├── redefinir-senha.html
│       ├── css/index.css
│       └── js/
│           ├── login.js
│           ├── cadastro.js
│           ├── catalogo.js
│           ├── esqueci-senha.js
│           └── redefinir-senha.js
│
└── auth-service/               # container interno, sem porta publicada
    ├── Dockerfile
    ├── package.json
    ├── server.js
    ├── db.js
    └── routes.js                # cadastro, login, esqueci-senha, redefinir-senha
```

## Como rodar localmente

### Pré-requisitos
- Docker e Docker Compose
- Acesso a um banco MariaDB (local ou remoto)
- Chave de API do TMDB ([obter aqui](https://www.themoviedb.org/settings/api)) — requer criar conta na plataforma
- Conta no [Mailtrap](https://mailtrap.io) (Email Sandbox — não exige cadastro de domínio)

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

3. Crie as tabelas no seu banco MariaDB (veja o SQL abaixo).

4. Suba os dois serviços com Docker Compose:
   ```bash
   docker compose up --build
   ```

5. Acesse `http://localhost:3000` (porta do serviço `catalogo` — o `auth-service` não é acessível diretamente, por padrão de arquitetura).

### Schema do banco

```sql
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'usuario',
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
```

### Promovendo um usuário a admin

Não há tela de administração — a promoção é feita diretamente no banco:
```sql
UPDATE usuarios SET role = 'admin' WHERE email = 'seu-email@exemplo.com';
```
É necessário logar novamente após a alteração, para que a sessão seja recriada com o novo papel.

## Variáveis de ambiente

| Variável | Serviço | Descrição |
|---|---|---|
| `PORT_CATALOGO` | catálogo | Porta interna em que o catálogo escuta (mapeada no `docker-compose.yml`) |
| `SESSION_SECRET` | catálogo | Chave usada para assinar o cookie de sessão |
| `TMDB_API_KEY` | catálogo | Chave de API do TMDB |
| `AUTH_SERVICE_URL` | catálogo | URL interna do auth-service (ex: `http://auth-service:4000`) |
| `PORT_AUTH` | auth-service | Porta interna em que o auth-service escuta (uso interno, sem exposição) |
| `APP_URL` | auth-service | URL pública do catálogo — usada para montar o link de redefinição de senha enviado por e-mail (ex: `https://seu-dominio.com`, sem porta e sem barra final) |
| `MAILTRAP_HOST` | auth-service | Host SMTP do Mailtrap (sandbox) |
| `MAILTRAP_PORT` | auth-service | Porta SMTP do Mailtrap |
| `MAILTRAP_USER` | auth-service | Usuário SMTP do Mailtrap |
| `MAILTRAP_PASS` | auth-service | Senha SMTP do Mailtrap |
| `DB_HOST` | ambos | Endereço do servidor MariaDB |
| `DB_USER` | ambos | Usuário do banco |
| `DB_PASSWORD` | ambos | Senha do usuário do banco |
| `DB_NAME` | ambos | Nome do banco de dados |

Localmente, ambos os serviços leem o mesmo arquivo `.env` na raiz (o Docker Compose resolve automaticamente os `${...}` do `docker-compose.yml` a partir dele). Em produção (Portainer), os mesmos pares chave-valor são cadastrados na tela de *Environment variables* da stack.

## Segurança

- Senhas armazenadas com hash (`bcrypt`), nunca em texto puro
- Tokens de redefinição de senha gerados com `crypto.randomBytes` (aleatoriedade criptográfica), com expiração de 30 minutos e uso único
- O `auth-service` não é acessível pela internet — não possui porta publicada no `docker-compose.yml`, apenas a rede interna do Docker
- O catálogo nunca recebe ou armazena o hash de senha de um usuário — o `auth-service` devolve apenas os dados necessários para montar a sessão
- Toda consulta a favoritos/comentários é filtrada por `usuario_id`, vinculado à sessão do usuário logado
- Rotas de escrita (favoritar, comentar, apagar) e as rotas de login/esqueci-senha possuem limite de requisições (`express-rate-limit`)
- A rota de "esqueci minha senha" sempre responde a mesma mensagem, exista ou não o e-mail informado, evitando enumeração de contas cadastradas
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
      - SESSION_SECRET=${SESSION_SECRET}
      - TMDB_API_KEY=${TMDB_API_KEY}
      - AUTH_SERVICE_URL=${AUTH_SERVICE_URL}
      - DB_HOST=${DB_HOST}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
    depends_on:
      - auth-service

  auth-service:
    image: igorrueda/api-tom-hanks-microserv-auth-service:latest
    environment:
      - PORT_AUTH=${PORT_AUTH}
      - APP_URL=${APP_URL}
      - MAILTRAP_HOST=${MAILTRAP_HOST}
      - MAILTRAP_PORT=${MAILTRAP_PORT}
      - MAILTRAP_USER=${MAILTRAP_USER}
      - MAILTRAP_PASS=${MAILTRAP_PASS}
      - DB_HOST=${DB_HOST}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
```

Pontos importantes:
- **Apenas o `catalogo` tem `ports:`** — o `auth-service` nunca deve expor porta ao host, é isso que garante seu isolamento da internet.
- **A tela de "Environment variables" da stack, sozinha, não injeta nada nos containers** — ela só disponibiliza valores para os `${...}` referenciados dentro do `environment:` de cada serviço no compose. Sem esse `environment:` explícito, os valores cadastrados na stack são ignorados pelos containers.
- Após qualquer mudança de código, é necessário `docker compose build && docker compose push` local, seguido de **"Re-pull image and redeploy"** na stack do Portainer.
- Após qualquer mudança apenas nas variáveis de ambiente ou no `docker-compose.yml` (sem mudança de código), basta **"Update the stack"** no Portainer.

Em produção, o serviço de e-mail é trocado de Mailtrap (sandbox de testes) para Brevo (envio transacional real, com domínio verificado).