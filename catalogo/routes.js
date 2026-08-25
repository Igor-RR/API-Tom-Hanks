const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('./db')

const router = express.Router()

const AUTH_URL = process.env.AUTH_SERVICE_URL // ex: http://auth-service:4000

function exigirLogin(req, res, next) {
  if (!req.session.usuario_id) {
    return res.status(401).json({ mensagem: 'Você precisa estar logado.' })
  }
  next()
}

function exigirAdmin(req, res, next) {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ mensagem: 'Acesso restrito a administradores.' })
  }
  next()
}

// limite pra ações de escrita (favoritar, comentar, apagar) -- evita sobrecarregar o banco
// com cliques repetidos ou chamadas automatizadas em loop
const limitadorEscrita = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 20,
  message: { mensagem: 'Muitas requisições. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false
})

// ---------- USUÁRIO LOGADO ----------

router.get('/me', exigirLogin, (req, res) => {
  res.json({
    usuario_id: req.session.usuario_id,
    role: req.session.role
  })
})

// ---------- PROXY PRO AUTH-SERVICE ----------

router.post('/auth/cadastro', async (req, res) => {
  try {
    const resposta = await fetch(`${AUTH_URL}/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const dados = await resposta.json()
    res.status(resposta.status).json(dados)

  } catch (err) {
    console.error(err)
    res.status(502).json({ mensagem: 'Serviço de autenticação indisponível.' })
  }
})

router.post('/auth/login', async (req, res) => {
  try {
    const resposta = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const dados = await resposta.json()

    if (!resposta.ok) {
      return res.status(resposta.status).json(dados)
    }

    req.session.usuario_id = dados.id
    req.session.role = dados.role

    res.json({ mensagem: 'Login realizado com sucesso.' })

  } catch (err) {
    console.error(err)
    res.status(502).json({ mensagem: 'Serviço de autenticação indisponível.' })
  }
})

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ mensagem: 'Logout realizado.' })
  })
})

router.post('/auth/esqueci-senha', async (req, res) => {
  try {
    const resposta = await fetch(`${AUTH_URL}/esqueci-senha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const dados = await resposta.json()
    res.status(resposta.status).json(dados)

  } catch (err) {
    console.error(err)
    res.status(502).json({ mensagem: 'Serviço de autenticação indisponível.' })
  }
})

router.post('/auth/redefinir-senha', async (req, res) => {
  try {
    const resposta = await fetch(`${AUTH_URL}/redefinir-senha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const dados = await resposta.json()
    res.status(resposta.status).json(dados)

  } catch (err) {
    console.error(err)
    res.status(502).json({ mensagem: 'Serviço de autenticação indisponível.' })
  }
})

// ---------- FILMES ----------

router.get('/filmes', exigirLogin, async (req, res) => {
  try {
    const chave = process.env.TMDB_API_KEY

    const respostaPessoa = await fetch(
      `https://api.themoviedb.org/3/search/person?query=Tom+Hanks&api_key=${chave}`
    )
    const dadosPessoa = await respostaPessoa.json()
    const personId = dadosPessoa.results[0].id

    const respostaFilmes = await fetch(
      `https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${chave}`
    )
    const dadosFilmes = await respostaFilmes.json()

    const filmes = dadosFilmes.cast
      .filter(filme => filme.poster_path)
      .map(filme => ({
        tmdb_movie_id: filme.id,
        titulo: filme.title,
        sinopse: filme.overview,
        poster_url: `https://image.tmdb.org/t/p/w500${filme.poster_path}`
      }))

    res.json(filmes)

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar filmes na TMDB.' })
  }
})

// ---------- FAVORITOS ----------

router.get('/favoritos', exigirLogin, async (req, res) => {
  try {
    const [favoritos] = await db.query(
      'SELECT * FROM favoritos WHERE usuario_id = ?',
      [req.session.usuario_id]
    )
    res.json(favoritos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar favoritos.' })
  }
})

router.post('/favoritos', exigirLogin, limitadorEscrita, async (req, res) => {
  const { tmdb_movie_id, titulo, poster_path } = req.body

  if (!tmdb_movie_id || !titulo) {
    return res.status(400).json({ mensagem: 'Dados do filme incompletos.' })
  }

  try {
    await db.query(
      'INSERT INTO favoritos (usuario_id, tmdb_movie_id, titulo, poster_path) VALUES (?, ?, ?, ?)',
      [req.session.usuario_id, tmdb_movie_id, titulo, poster_path]
    )
    res.status(201).json({ mensagem: 'Favoritado com sucesso.' })

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensagem: 'Esse filme já está nos seus favoritos.' })
    }
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao favoritar.' })
  }
})

router.delete('/favoritos/:tmdb_movie_id', exigirLogin, limitadorEscrita, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM favoritos WHERE usuario_id = ? AND tmdb_movie_id = ?',
      [req.session.usuario_id, req.params.tmdb_movie_id]
    )
    res.json({ mensagem: 'Removido dos favoritos.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao remover favorito.' })
  }
})

// ---------- COMENTÁRIOS ----------

router.get('/comentarios/:tmdb_movie_id', exigirLogin, async (req, res) => {
  try {
    let comentarios

    if (req.session.role === 'admin') {
      const [linhas] = await db.query(
        'SELECT * FROM comentarios WHERE tmdb_movie_id = ?',
        [req.params.tmdb_movie_id]
      )
      comentarios = linhas
    } else {
      const [linhas] = await db.query(
        'SELECT * FROM comentarios WHERE usuario_id = ? AND tmdb_movie_id = ?',
        [req.session.usuario_id, req.params.tmdb_movie_id]
      )
      comentarios = linhas
    }

    res.json(comentarios)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar comentários.' })
  }
})

router.post('/comentarios', exigirLogin, limitadorEscrita, async (req, res) => {
  const { tmdb_movie_id, texto } = req.body

  if (!tmdb_movie_id || !texto) {
    return res.status(400).json({ mensagem: 'Preencha o comentário.' })
  }

  try {
    await db.query(
      'INSERT INTO comentarios (usuario_id, tmdb_movie_id, texto) VALUES (?, ?, ?)',
      [req.session.usuario_id, tmdb_movie_id, texto]
    )
    res.status(201).json({ mensagem: 'Comentário adicionado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao comentar.' })
  }
})

router.delete('/comentarios/:id', exigirLogin, exigirAdmin, limitadorEscrita, async (req, res) => {
  try {
    await db.query('DELETE FROM comentarios WHERE id = ?', [req.params.id])
    res.json({ mensagem: 'Comentário removido pela moderação.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao remover comentário.' })
  }
})

module.exports = router