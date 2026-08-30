const listaFilmes = document.getElementById('lista-filmes')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloCard = document.getElementById('modelo-card')
const btnLogout = document.getElementById('btn-logout')
const badgeRole = document.getElementById('badge-role')

const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker']

let idsFavoritados = new Set()
let contagemFavoritos = {}
let meuUsuarioId = null
let meuRole = 'espectador'

function nivelDe(role) {
  return HIERARQUIA.indexOf(role)
}

function nivelAoMenos(roleMinimo) {
  return nivelDe(meuRole) >= nivelDe(roleMinimo)
}

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
    const respostaMe = await fetch('/api/me')
    if (respostaMe.status === 401) {
      window.location.href = '/login.html'
      return
    }
    const me = await respostaMe.json()
    meuUsuarioId = me.usuario_id
    meuRole = me.role

    badgeRole.textContent = meuRole
    badgeRole.hidden = false

    const chamadas = [fetch('/api/filmes'), fetch('/api/favoritos/contagem')]
    if (nivelAoMenos('fan')) {
      chamadas.push(fetch('/api/favoritos'))
    }

    const respostas = await Promise.all(chamadas)
    const [respostaFilmes, respostaContagem, respostaFavoritos] = respostas

    const filmes = await respostaFilmes.json()
    const contagens = await respostaContagem.json()
    contagemFavoritos = Object.fromEntries(contagens.map(c => [c.tmdb_movie_id, c.total]))

    if (respostaFavoritos) {
      const favoritos = await respostaFavoritos.json()
      idsFavoritados = new Set(favoritos.map(f => f.tmdb_movie_id))
    }

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
    const contagemEl = card.querySelector('.contagem-favoritos')
    contagemEl.textContent = `${contagemFavoritos[filme.tmdb_movie_id] || 0} favoritos`

    if (nivelAoMenos('fan')) {
      atualizarBotaoFavorito(botaoFavoritar, idsFavoritados.has(filme.tmdb_movie_id))
      botaoFavoritar.addEventListener('click', () => {
        alternarFavorito(filme, botaoFavoritar, contagemEl)
      })
    } else {
      // espectador só vê a contagem, não favorita
      botaoFavoritar.remove()
    }

    const formComentario = card.querySelector('.form-comentario')
    const inputComentario = card.querySelector('.input-comentario')
    const listaComentarios = card.querySelector('.lista-comentarios')
    const avisoNivel = card.querySelector('.aviso-nivel')
    const botaoEnviarComentario = formComentario.querySelector('button')

    if (nivelAoMenos('fan')) {
      carregarComentarios(filme.tmdb_movie_id, listaComentarios)

      formComentario.addEventListener('submit', async (evento) => {
        evento.preventDefault()
        const texto = inputComentario.value.trim()
        if (!texto) return

        await enviarComentario(filme.tmdb_movie_id, texto, botaoEnviarComentario)
        inputComentario.value = ''
        carregarComentarios(filme.tmdb_movie_id, listaComentarios)
      })
    } else {
      // espectador não comenta nem vê comentários
      formComentario.remove()
      avisoNivel.textContent = 'Vire fã para comentar e ver comentários.'
      avisoNivel.hidden = false
    }

    listaFilmes.appendChild(card)
  })
}

function atualizarBotaoFavorito(botao, favoritado) {
  botao.classList.toggle('favoritado', favoritado)
  botao.textContent = favoritado ? '★ Favoritado' : '☆ Favoritar'
}

// ---------- favoritar / desfavoritar ----------
async function alternarFavorito(filme, botao, contagemEl) {
  const jaFavoritado = idsFavoritados.has(filme.tmdb_movie_id)

  botao.disabled = true
  try {
    if (jaFavoritado) {
      await fetch(`/api/favoritos/${filme.tmdb_movie_id}`, { method: 'DELETE' })
      idsFavoritados.delete(filme.tmdb_movie_id)
      contagemFavoritos[filme.tmdb_movie_id] = Math.max(0, (contagemFavoritos[filme.tmdb_movie_id] || 1) - 1)
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
      contagemFavoritos[filme.tmdb_movie_id] = (contagemFavoritos[filme.tmdb_movie_id] || 0) + 1
    }

    atualizarBotaoFavorito(botao, idsFavoritados.has(filme.tmdb_movie_id))
    contagemEl.textContent = `${contagemFavoritos[filme.tmdb_movie_id] || 0} favoritos`

  } catch (err) {
    mostrarStatus('Erro ao atualizar favorito.')
  } finally {
    botao.disabled = false
  }
}

// ---------- comentários ----------
async function carregarComentarios(tmdbMovieId, listaComentariosEl) {
  try {
    const resposta = await fetch(`/api/comentarios/${tmdbMovieId}`)
    if (!resposta.ok) return // usuário sem nível suficiente, silencioso
    const comentarios = await resposta.json()

    listaComentariosEl.innerHTML = ''
    comentarios.forEach(c => {
      const item = document.createElement('li')

      const textoSpan = document.createElement('span')
      textoSpan.textContent = c.texto
      item.appendChild(textoSpan)

      const souDono = c.usuario_id === meuUsuarioId
      const souModerador = nivelAoMenos('stalker')

      if (souDono || souModerador) {
        const botaoApagar = document.createElement('button')
        botaoApagar.textContent = '🗑'
        botaoApagar.className = 'botao-apagar-comentario'
        botaoApagar.addEventListener('click', async () => {
          botaoApagar.disabled = true
          if (souDono) {
            await apagarComentarioProprio(c.id)
          } else {
            await apagarComentarioModeracao(c.id)
          }
          carregarComentarios(tmdbMovieId, listaComentariosEl)
        })
        item.appendChild(botaoApagar)
      }

      listaComentariosEl.appendChild(item)
    })

  } catch (err) {
    // silencioso -- não trava o card por causa de um erro de comentário
  }
}

async function enviarComentario(tmdbMovieId, texto, botao) {
  botao.disabled = true
  try {
    await fetch('/api/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdb_movie_id: tmdbMovieId, texto })
    })
  } catch (err) {
    mostrarStatus('Erro ao enviar comentário.')
  } finally {
    botao.disabled = false
  }
}

async function apagarComentarioProprio(id) {
  try {
    await fetch(`/api/comentarios/proprio/${id}`, { method: 'DELETE' })
  } catch (err) {
    mostrarStatus('Erro ao apagar comentário.')
  }
}

async function apagarComentarioModeracao(id) {
  try {
    await fetch(`/api/comentarios/${id}`, { method: 'DELETE' })
  } catch (err) {
    mostrarStatus('Erro ao apagar comentário.')
  }
}

// ---------- logout ----------
btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login.html'
})

iniciar()