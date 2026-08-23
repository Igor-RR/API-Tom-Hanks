const express = require('express')
const bcrypt = require('bcrypt') // geração de hash
const db = require('./db') // Arquivo de conexão com BD

const router = express.Router()

// Exige estar logado, caso contrário lança erro 401
function exigirLogin(req, res, next) {
  if (!req.session.usuario_id) {
    return res.status(401).json({ mensagem: 'Você precisa estar logado.' })
  }
  next()
}

// Cadastrar usuários
router.post('/auth/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body
 
  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha nome, e-mail e senha.' })
  }
 
  try {
    const senhaHash = await bcrypt.hash(senha, 10)
 
    await db.query(
      'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
      [nome, email, senhaHash]
    )
 
    res.status(201).json({ mensagem: 'Conta criada com sucesso.' })
 
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensagem: 'Esse e-mail já está cadastrado.' })
    }
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao criar conta.' })
  }
})

// autentica e cria a sessão
router.post('/auth/login', async (req, res) => {
  const { email, senha } = req.body
 
  if (!email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha e-mail e senha.' })
  }
 
  try {
    const [linhas] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email])
    const usuario = linhas[0]
 
    if (!usuario) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' })
    }
 
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash)
    if (!senhaCorreta) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' })
    }
 
    req.session.usuario_id = usuario.id
    res.json({ mensagem: 'Login realizado com sucesso.' })
 
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao fazer login.' })
  }
})

// encerra a sessão
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ mensagem: 'Logout realizado.' })
  })
})

// busca os filmes com Tom Hanks
router.get('/filmes', exigirLogin, async (req, res) => {
  try {
    const chave = process.env.TMDB_API_KEY
 
    // 1. acha o person_id do Tom Hanks
    const respostaPessoa = await fetch(
      `https://api.themoviedb.org/3/search/person?query=Tom+Hanks&api_key=${chave}`
    )
    const dadosPessoa = await respostaPessoa.json()
    const personId = dadosPessoa.results[0].id
 
    // 2. busca os filmes desse ator
    const respostaFilmes = await fetch(
      `https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${chave}`
    )
    const dadosFilmes = await respostaFilmes.json()
 
    // 3. monta a lista já com a URL do pôster pronta
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
 
// lista os favoritos do usuário logado
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
 
// favorita um filme
router.post('/favoritos', exigirLogin, async (req, res) => {
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
 
// remove um favorito (só se for do próprio usuário)
router.delete('/favoritos/:tmdb_movie_id', exigirLogin, async (req, res) => {
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
 
// lista comentários do usuário logado sobre um filme específico
router.get('/comentarios/:tmdb_movie_id', exigirLogin, async (req, res) => {
  try {
    const [comentarios] = await db.query(
      'SELECT * FROM comentarios WHERE usuario_id = ? AND tmdb_movie_id = ?',
      [req.session.usuario_id, req.params.tmdb_movie_id]
    )
    res.json(comentarios)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao buscar comentários.' })
  }
})
 
// adiciona um comentário
router.post('/comentarios', exigirLogin, async (req, res) => {
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
 
module.exports = router