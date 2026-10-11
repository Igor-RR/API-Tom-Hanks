const listaFilmes = document.getElementById('lista-filmes')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloCard = document.getElementById('modelo-card')
const btnLogout = document.getElementById('btn-logout')
const badgeRole = document.getElementById('badge-role')

const modalUpgrade = document.getElementById('modal-upgrade')
const modalTitulo = document.getElementById('modal-titulo')
const modalTexto = document.getElementById('modal-texto')
const modalBtnCancelar = document.getElementById('modal-btn-cancelar')
const modalBtnAssinar = document.getElementById('modal-btn-assinar')

const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker','admin']

let idsFavoritados = new Set()
let contagemFavoritos = {}
let comentariosPorFilme = {} // vem em lote no iniciar(): { tmdb_movie_id: [comentarios] }
let meuUsuarioId = null
let meuRole = 'espectador'

function nivelDe(role) {
  return HIERARQUIA.indexOf(role)
}

function nivelAoMenos(roleMinimo) {
  return nivelDe(meuRole) >= nivelDe(roleMinimo)
}

// ---------- modal de upgrade ----------
function abrirModalUpgrade(roleNecessario) {
  modalTitulo.textContent = `Recurso do plano "${roleNecessario}"`
  modalTexto.textContent = `Essa ação exige o plano "${roleNecessario}" ou superior. Assine para desbloquear.`
  modalUpgrade.hidden = false
}

function fecharModalUpgrade() {
  modalUpgrade.hidden = true
}

modalBtnCancelar.addEventListener('click', fecharModalUpgrade)
modalUpgrade.addEventListener('click', (evento) => {
  if (evento.target === modalUpgrade) fecharModalUpgrade()
})
modalBtnAssinar.addEventListener('click', () => {
  // leva pra página de planos, onde o botão "Assinar" abre o checkout do Stripe
  window.location.href = '/planos.html'
})

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
      // favoritos do usuário e TODOS os comentários, cada um numa chamada só
      // (antes eram 1 requisição de comentários POR CARD: o clássico N+1)
      chamadas.push(fetch('/api/favoritos'), fetch('/api/comentarios'))
    }

    const respostas = await Promise.all(chamadas)
    const [respostaFilmes, respostaContagem, respostaFavoritos, respostaComentarios] = respostas

    const filmes = await respostaFilmes.json()
    const contagens = await respostaContagem.json()
    contagemFavoritos = Object.fromEntries(contagens.map(c => [c.tmdb_movie_id, c.total]))

    if (respostaFavoritos) {
      const favoritos = await respostaFavoritos.json()
      idsFavoritados = new Set(favoritos.map(f => f.tmdb_movie_id))
    }

    if (respostaComentarios && respostaComentarios.ok) {
      comentariosPorFilme = await respostaComentarios.json()
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
    poster.loading = 'lazy' // não baixa os ~60 pôsteres de uma vez
    poster.src = filme.poster_url
    poster.alt = filme.titulo

    card.querySelector('.titulo-filme').textContent = filme.titulo
    card.querySelector('.sinopse').textContent = filme.sinopse || 'Sem sinopse disponível.'

    const botaoFavoritar = card.querySelector('.botao-favoritar')
    const contagemEl = card.querySelector('.contagem-favoritos')
    contagemEl.textContent = `${contagemFavoritos[filme.tmdb_movie_id] || 0} favoritos`

    // botão sempre visível -- ação real se tiver nível, modal de upgrade se não tiver
    atualizarBotaoFavorito(botaoFavoritar, idsFavoritados.has(filme.tmdb_movie_id))
    botaoFavoritar.addEventListener('click', () => {
      if (nivelAoMenos('fan')) {
        alternarFavorito(filme, botaoFavoritar, contagemEl)
      } else {
        abrirModalUpgrade('fan')
      }
    })

    const formComentario = card.querySelector('.form-comentario')
    const inputComentario = card.querySelector('.input-comentario')
    const listaComentarios = card.querySelector('.lista-comentarios')
    const botaoEnviarComentario = formComentario.querySelector('button')

    // os comentários já vieram em lote no iniciar() (o backend decide o que cada papel vê):
    // aqui só desenha, sem nenhuma requisição por card
    if (nivelAoMenos('fan')) {
      desenharComentarios(filme.tmdb_movie_id, listaComentarios)
    }

    formComentario.addEventListener('submit', async (evento) => {
      evento.preventDefault()
      const texto = inputComentario.value.trim()
      if (!texto) return

      if (!nivelAoMenos('fan')) {
        abrirModalUpgrade('fan')
        return
      }

      await enviarComentario(filme.tmdb_movie_id, texto, botaoEnviarComentario)
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
// desenha a lista de UM card a partir dos dados já em memória (sem rede)
function desenharComentarios(tmdbMovieId, listaComentariosEl) {
  const comentarios = comentariosPorFilme[tmdbMovieId] || []

  listaComentariosEl.innerHTML = ''
  comentarios.forEach(c => {
    const item = document.createElement('li')

    const textoSpan = document.createElement('span')
    textoSpan.textContent = c.texto
    item.appendChild(textoSpan)

    const souDono = c.usuario_id === meuUsuarioId

    // ícone de apagar sempre visível pra quem já vê comentários (fan+);
    // ação real se for dono ou stalker, modal de upgrade caso contrário
    const botaoApagar = document.createElement('button')
    botaoApagar.textContent = '🗑'
    botaoApagar.className = 'botao-apagar-comentario'
    botaoApagar.addEventListener('click', async () => {
      if (souDono) {
        botaoApagar.disabled = true
        await apagarComentarioProprio(c.id)
        carregarComentarios(tmdbMovieId, listaComentariosEl)
      } else if (nivelAoMenos('stalker')) {
        botaoApagar.disabled = true
        await apagarComentarioModeracao(c.id)
        carregarComentarios(tmdbMovieId, listaComentariosEl)
      } else {
        abrirModalUpgrade('stalker')
      }
    })
    item.appendChild(botaoApagar)

    listaComentariosEl.appendChild(item)
  })
}

// recarrega só os comentários DESTE filme (1 requisição) -- usado depois de comentar/apagar
async function carregarComentarios(tmdbMovieId, listaComentariosEl) {
  try {
    const resposta = await fetch(`/api/comentarios/${tmdbMovieId}`)
    if (!resposta.ok) return
    comentariosPorFilme[tmdbMovieId] = await resposta.json()
    desenharComentarios(tmdbMovieId, listaComentariosEl)
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