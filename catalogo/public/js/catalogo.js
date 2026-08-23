const listaFilmes = document.getElementById('lista-filmes')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloCard = document.getElementById('modelo-card')
const btnLogout = document.getElementById('btn-logout')

let idsFavoritados = new Set()

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

function esconderStatus() {
  mensagemStatus.hidden = true
}

// ---------- carregar tudo ao abrir a página ----------
async function iniciar() {
  mostrarStatus('Carregando filmes...')

  try {
    const [respostaFilmes, respostaFavoritos] = await Promise.all([
      fetch('/api/filmes'),
      fetch('/api/favoritos')
    ])

    if (respostaFilmes.status === 401 || respostaFavoritos.status === 401) {
      window.location.href = '/login.html'
      return
    }

    const filmes = await respostaFilmes.json()
    const favoritos = await respostaFavoritos.json()

    idsFavoritados = new Set(favoritos.map(f => f.tmdb_movie_id))

    if (!respostaFilmes.ok) {
      mostrarStatus('Não foi possível carregar os filmes da TMDB.')
      return
    }

    esconderStatus()
    renderizarFilmes(filmes)

  } catch (err) {
    mostrarStatus('Erro ao conectar com o servidor.')
  }
}

// ---------- renderizar os cards ----------
function renderizarFilmes(filmes) {
  listaFilmes.innerHTML = ''

  filmes.forEach(filme => {
    const card = modeloCard.content.cloneNode(true)

    const poster = card.querySelector('.poster')
    poster.src = filme.poster_url
    poster.alt = filme.titulo

    card.querySelector('.titulo-filme').textContent = filme.titulo
    card.querySelector('.sinopse').textContent = filme.sinopse || 'Sem sinopse disponível.'

    const botaoFavoritar = card.querySelector('.botao-favoritar')
    atualizarBotaoFavorito(botaoFavoritar, idsFavoritados.has(filme.tmdb_movie_id))

    botaoFavoritar.addEventListener('click', () => {
      alternarFavorito(filme, botaoFavoritar)
    })

    const formComentario = card.querySelector('.form-comentario')
    const inputComentario = card.querySelector('.input-comentario')
    const listaComentarios = card.querySelector('.lista-comentarios')

    carregarComentarios(filme.tmdb_movie_id, listaComentarios)

    formComentario.addEventListener('submit', async (evento) => {
      evento.preventDefault()
      const texto = inputComentario.value.trim()
      if (!texto) return

      await enviarComentario(filme.tmdb_movie_id, texto)
      inputComentario.value = ''
      carregarComentarios(filme.tmdb_movie_id, listaComentarios)
    })

    listaFilmes.appendChild(card)
  })
}

function atualizarBotaoFavorito(botao, favoritado) {
  botao.classList.toggle('favoritado', favoritado)
  botao.textContent = favoritado ? '★ Favoritado' : '☆ Favoritar'
}

// ---------- favoritar / desfavoritar ----------
async function alternarFavorito(filme, botao) {
  const jaFavoritado = idsFavoritados.has(filme.tmdb_movie_id)

  try {
    if (jaFavoritado) {
      await fetch(`/api/favoritos/${filme.tmdb_movie_id}`, { method: 'DELETE' })
      idsFavoritados.delete(filme.tmdb_movie_id)
    } else {
      await fetch('/api/favoritos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdb_movie_id: filme.tmdb_movie_id,
          titulo: filme.titulo,
          poster_path: filme.poster_url
        })
      })
      idsFavoritados.add(filme.tmdb_movie_id)
    }

    atualizarBotaoFavorito(botao, idsFavoritados.has(filme.tmdb_movie_id))

  } catch (err) {
    mostrarStatus('Erro ao atualizar favorito.')
  }
}

// ---------- comentários ----------
async function carregarComentarios(tmdbMovieId, listaComentariosEl) {
  try {
    const resposta = await fetch(`/api/comentarios/${tmdbMovieId}`)
    const comentarios = await resposta.json()

    listaComentariosEl.innerHTML = ''
    comentarios.forEach(c => {
      const item = document.createElement('li')
      item.textContent = c.texto
      listaComentariosEl.appendChild(item)
    })

  } catch (err) {
    // silencioso -- não trava o card por causa de um erro de comentário
  }
}

async function enviarComentario(tmdbMovieId, texto) {
  try {
    await fetch('/api/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdb_movie_id: tmdbMovieId, texto })
    })
  } catch (err) {
    mostrarStatus('Erro ao enviar comentário.')
  }
}

// ---------- logout ----------
btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login.html'
})

iniciar()