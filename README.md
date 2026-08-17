# Catálogo de Filmes — Tom Hanks

Aplicação web de catálogo de filmes com Tom Hanks, consumindo a API do [TMDB](https://www.themoviedb.org/documentation/api) em tempo real. Usuários podem se cadastrar, fazer login, favoritar filmes e deixar comentários — tudo isolado por conta, com persistência em MariaDB.

Projeto desenvolvido para a disciplina ministrada pelo professor **@siriani**.

## Funcionalidades

- Cadastro e login próprios da aplicação (sessão salva via cookie)
- Listagem de filmes com Tom Hanks, buscados ao vivo na API do TMDB (pôster, título e sinopse nunca são salvos localmente)
- Favoritar / desfavoritar filmes
- Comentar filmes, com opção de apagar todos os comentários de uma vez
- Isolamento total de dados entre contas diferentes — cada usuário só acessa seus próprios favoritos e comentários

## Stack

- **Backend:** Node.js + Express
- **Frontend:** HTML, CSS e JavaScript puros (sem framework)
- **Banco de dados:** MariaDB
- **API externa:** TMDB (The Movie Database)
- **Autenticação:** express-session + bcrypt
- **Deploy:** Docker + Portainer

## Estrutura do projeto

```
.
├── server.js          # ponto de entrada da aplicação
├── db.js              # conexão com o MariaDB
├── routes.js          # rotas da API (auth, filmes, favoritos, comentários)
├── .env.example       # descreve as variáveis de ambiente utilizadas
├── Dockerfile
└── public/             # frontend estático
    ├── login.html
    ├── cadastro.html
    ├── catalogo.html
    ├── css/index.css
    └── js/
        ├── login.js
        ├── cadastro.js
        └── catalogo.js
```

## Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Acesso a um banco MariaDB
- Chave de API do TMDB ([obter aqui](https://www.themoviedb.org/settings/api))(Você deverá criar sua conta na plataforma!)

### Passo a passo

1. Clone o repositório:
   ```bash
   git clone https://github.com/Igor-RR/API-Tom-Hanks
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Copie o arquivo de variáveis de ambiente e preencha com seus valores reais:
   ```bash
   cp .env.example .env
   ```

4. Crie as tabelas no seu banco MariaDB (veja o SQL abaixo).


```sql
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

5. Rode a aplicação:
   ```bash
   npm start
   ```

6. Acesse `http://localhost:3000`(Servidor roda nesta porta)

### Rodando com Docker (local)

```bash
docker compose up --build
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta em que o servidor vai escutar |
| `SESSION_SECRET` | Chave usada para assinar o cookie de sessão |
| `DB_HOST` | Endereço do servidor MariaDB |
| `DB_USER` | Usuário do banco |
| `DB_PASSWORD` | Senha do usuário do banco |
| `DB_NAME` | Nome do banco de dados |
| `TMDB_API_KEY` | Chave de API do TMDB |

OBS: Essas são variáveis de ambiente, você deve definir seus valores quando clonar este repositório

## Segurança

- Senhas armazenadas com hash (`bcrypt`)
- Todas as chamadas à TMDB e ao MariaDB partem do backend — nenhuma credencial é exposta no código do lado do cliente
- Toda consulta a favoritos/comentários é filtrada por `usuario_id`, vinculado à sessão do usuário logado
- Variáveis sensíveis configuradas via ambiente (Portainer), jamais sendo expostas no `Dockerfile`

## Deploy

A aplicação é publicada via Portainer, a partir da imagem construída pelo `Dockerfile` deste repositório. As variáveis de ambiente (TMDB, MariaDB, sessão) são configuradas diretamente no container, no campo Env do Portainer.
