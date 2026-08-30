const express = require('express')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const db = require('./db')

const router = express.Router()

const AUTH_URL = process.env.AUTH_SERVICE_URL
const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker']

function nivelDe(role) {
  return HIERARQUIA.indexOf(role)
}

// lê e valida o JWT do cookie, popula req.usuario
function exigirLogin(req, res, next) {
  const token = req.cookies.token
  if (!token) {
    return res.status(401).json({ mensagem: 'Você precisa estar logado.' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = payload // { usuario_id, role }
    next()
  } catch (err) {
    return res.status(401).json({ mensagem: 'Sessão inválida ou expirada.' })
  }
}

function exigirNivel(roleMinimo) {
  return (req, res, next) => {
    if (nivelDe(req.usuario.role) < nivelDe(roleMinimo)) {
      return res.status(403).json({ mensagem: 'Seu papel não tem permissão para essa ação.' })
    }
    next()
  }
}

const limitadorEscrita = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { mensagem: 'Muitas requisições. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false
})

// ---------- USUÁRIO LOGADO ----------

router.get('/me', exigirLogin, (req, res) => {
  res.json({
    usuario_id: req.usuario.usuario_id,
    nome: req.usuario.nome,
    role: req.usuario.role
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

    // seta o JWT recebido do auth-service como cookie httpOnly
    res.cookie('token', dados.token, {
      httpOnly: true,
      secure: true,       // exige HTTPS, false para Testes locais, true para produção
      sameSite: 'strict',
      maxAge: 1 * 60 * 60 * 1000 // 1 hora
    })

    res.json({ mensagem: 'Login realizado com sucesso.' })

  } catch (err) {
    console.error(err)
    res.status(502).json({ mensagem: 'Serviço de autenticação indisponível.' })
  }
})

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ mensagem: 'Logout realizado.' })
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

// contagem pública -- espectador+
router.get('/favoritos/contagem', exigirLogin, async (req, res) => {
  try {
    const [linhas] = await db.query(
      'SELECT tmdb_movie_id, COUNT(*) AS total FROM favoritos GROUP BY tmdb_movie_id'
    )
    res.json(linhas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar contagem de favoritos.' })
  }
})

router.get('/favoritos', exigirLogin, exigirNivel('fan'), async (req, res) => {
  try {
    const [favoritos] = await db.query(
      'SELECT * FROM favoritos WHERE usuario_id = ?',
      [req.usuario.usuario_id]
    )
    res.json(favoritos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar favoritos.' })
  }
})

router.post('/favoritos', exigirLogin, exigirNivel('fan'), limitadorEscrita, async (req, res) => {
  const { tmdb_movie_id, titulo, poster_path } = req.body

  if (!tmdb_movie_id || !titulo) {
    return res.status(400).json({ mensagem: 'Dados do filme incompletos.' })
  }

  try {
    await db.query(
      'INSERT INTO favoritos (usuario_id, tmdb_movie_id, titulo, poster_path) VALUES (?, ?, ?, ?)',
      [req.usuario.usuario_id, tmdb_movie_id, titulo, poster_path]
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

router.delete('/favoritos/:tmdb_movie_id', exigirLogin, exigirNivel('fan'), limitadorEscrita, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM favoritos WHERE usuario_id = ? AND tmdb_movie_id = ?',
      [req.usuario.usuario_id, req.params.tmdb_movie_id]
    )
    res.json({ mensagem: 'Removido dos favoritos.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao remover favorito.' })
  }
})

// ---------- COMENTÁRIOS ----------

router.get('/comentarios/:tmdb_movie_id', exigirLogin, exigirNivel('fan'), async (req, res) => {
  try {
    let comentarios

    if (nivelDe(req.usuario.role) >= nivelDe('cinefilo')) {
      const [linhas] = await db.query(
        'SELECT * FROM comentarios WHERE tmdb_movie_id = ?',
        [req.params.tmdb_movie_id]
      )
      comentarios = linhas
    } else {
      const [linhas] = await db.query(
        'SELECT * FROM comentarios WHERE usuario_id = ? AND tmdb_movie_id = ?',
        [req.usuario.usuario_id, req.params.tmdb_movie_id]
      )
      comentarios = linhas
    }

    res.json(comentarios)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar comentários.' })
  }
})

router.post('/comentarios', exigirLogin, exigirNivel('fan'), limitadorEscrita, async (req, res) => {
  const { tmdb_movie_id, texto } = req.body

  if (!tmdb_movie_id || !texto) {
    return res.status(400).json({ mensagem: 'Preencha o comentário.' })
  }

  try {
    await db.query(
      'INSERT INTO comentarios (usuario_id, tmdb_movie_id, texto) VALUES (?, ?, ?)',
      [req.usuario.usuario_id, tmdb_movie_id, texto]
    )
    res.status(201).json({ mensagem: 'Comentário adicionado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao comentar.' })
  }
})

router.delete('/comentarios/proprio/:id', exigirLogin, exigirNivel('fan'), limitadorEscrita, async (req, res) => {
  try {
    const [resultado] = await db.query(
      'DELETE FROM comentarios WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.usuario.usuario_id]
    )
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ mensagem: 'Comentário não encontrado ou não pertence a você.' })
    }
    res.json({ mensagem: 'Comentário removido.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao remover comentário.' })
  }
})

router.delete('/comentarios/:id', exigirLogin, exigirNivel('stalker'), limitadorEscrita, async (req, res) => {
  try {
    await db.query('DELETE FROM comentarios WHERE id = ?', [req.params.id])
    res.json({ mensagem: 'Comentário removido pela moderação.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao remover comentário.' })
  }
})

// ---------- TIER LIST ----------

// lista todos os stalkers que já têm uma tier list, com contagem de filmes classificados
router.get('/tier-lists', exigirLogin, async (req, res) => {
  try {
    const [linhas] = await db.query(
      `SELECT usuario_id, usuario_nome, COUNT(*) AS total_filmes
       FROM tier_list
       GROUP BY usuario_id, usuario_nome
       ORDER BY usuario_nome`
    )
    res.json(linhas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar tier lists.' })
  }
})

// tier list completa de um stalker específico
router.get('/tier-list/:usuario_id', exigirLogin, async (req, res) => {
  try {
    const [linhas] = await db.query(
      'SELECT * FROM tier_list WHERE usuario_id = ? ORDER BY FIELD(tier, "S","A","B","C","D")',
      [req.params.usuario_id]
    )
    res.json(linhas)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar tier list.' })
  }
})

// stalker classifica/reclassifica um filme na própria lista
router.put('/tier-list/:tmdb_movie_id', exigirLogin, exigirNivel('stalker'), limitadorEscrita, async (req, res) => {
  const { titulo, poster_path, tier } = req.body
  if (!titulo || !tier) {
    return res.status(400).json({ mensagem: 'Informe título e tier.' })
  }
  try {
    await db.query(
      `INSERT INTO tier_list (usuario_id, usuario_nome, tmdb_movie_id, titulo, poster_path, tier)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE titulo = ?, poster_path = ?, tier = ?`,
      [req.usuario.usuario_id, req.usuario.nome, req.params.tmdb_movie_id, titulo, poster_path, tier,
       titulo, poster_path, tier]
    )
    res.json({ mensagem: 'Filme classificado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao classificar filme.' })
  }
})

// stalker remove um filme da própria lista (volta pro "não classificado")
router.delete('/tier-list/:tmdb_movie_id', exigirLogin, exigirNivel('stalker'), limitadorEscrita, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM tier_list WHERE usuario_id = ? AND tmdb_movie_id = ?',
      [req.usuario.usuario_id, req.params.tmdb_movie_id]
    )
    res.json({ mensagem: 'Filme removido da tier list.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao remover filme.' })
  }
})