const tituloPagina = document.getElementById('titulo-pagina')
const mensagemStatus = document.getElementById('mensagem-status')
const tiersContainer = document.getElementById('tiers-container')
const secaoNaoClassificados = document.getElementById('secao-nao-classificados')
const listaNaoClassificados = document.getElementById('lista-nao-classificados')
const modeloFileira = document.getElementById('modelo-fileira-tier')
const modeloPoster = document.getElementById('modelo-poster-tier')
const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker']
const TIERS = ['S', 'A', 'B', 'C', 'D']

const params = new URLSearchParams(window.location.search)
const usuarioIdDaLista = params.get('usuario_id')

let meuUsuarioId = null
let meuRole = 'espectador'
let ehMinhaLista = false
let souStalker = false

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

async function iniciar() {
  if (!usuarioIdDaLista) {
    mostrarStatus('Tier list não encontrada.')
    return
  }

  mostrarStatus('Carregando...')

  try {
    const [respostaMe, respostaTierList, respostaFilmes] = await Promise.all([
      fetch('/api/me'),
      fetch(`/api/tier-list/${usuarioIdDaLista}`),
      fetch('/api/filmes')
    ])

    if (respostaMe.status === 401) {
      window.location.href = '/login.html'
      return
    }

    const me = await respostaMe.json()
    meuUsuarioId = me.usuario_id
    meuRole = me.role
    souStalker = HIERARQUIA.indexOf(meuRole) >= HIERARQUIA.indexOf('stalker')
    // só é "minha lista editável" se o ID bater E o papel for stalker
    ehMinhaLista = String(meuUsuarioId) === String(usuarioIdDaLista) && souStalker
    console.log('DEBUG:', { meuUsuarioId, usuarioIdDaLista, meuRole, souStalker, ehMinhaLista })


    const tierList = await respostaTierList.json()
    const filmes = await respostaFilmes.json()

    if (tierList.length > 0) {
      tituloPagina.textContent = `Tier List de ${tierList[0].usuario_nome}`
    } else if (ehMinhaLista) {
      tituloPagina.textContent = 'Minha Tier List'
    }

    mensagemStatus.hidden = true
    renderizarTiers(tierList)

    if (ehMinhaLista) {
      const idsClassificados = new Set(tierList.map(t => t.tmdb_movie_id))
      const naoClassificados = filmes.filter(f => !idsClassificados.has(f.tmdb_movie_id))
      renderizarNaoClassificados(naoClassificados)
    }

  } catch (err) {
    mostrarStatus('Erro ao conectar com o servidor.')
  }
}

function renderizarTiers(tierList) {
  tiersContainer.innerHTML = ''

  TIERS.forEach(tier => {
    const fileira = modeloFileira.content.cloneNode(true)
    fileira.querySelector('.rotulo-tier').textContent = tier
    fileira.querySelector('.fileira-tier').classList.add(`fileira-${tier}`)

    const posteresDoTier = tierList.filter(t => t.tier === tier)
    const containerPosteres = fileira.querySelector('.posters-tier')

    posteresDoTier.forEach(item => {
      const poster = criarPoster(item.titulo, item.poster_path, item.tmdb_movie_id, item.tier)
      containerPosteres.appendChild(poster)
    })

    tiersContainer.appendChild(fileira)
  })
}

function criarPoster(titulo, posterPath, tmdbMovieId, tierAtual) {
  const poster = modeloPoster.content.cloneNode(true)
  const img = poster.querySelector('.poster-img')
  img.src = posterPath || ''
  img.alt = titulo
  poster.querySelector('.poster-titulo').textContent = titulo

  if (ehMinhaLista) {
    const acoes = poster.querySelector('.poster-acoes')
    acoes.hidden = false

    const select = poster.querySelector('.select-mudar-tier')
    if (tierAtual) select.value = tierAtual

    select.addEventListener('change', async () => {
      await classificarFilme(tmdbMovieId, titulo, posterPath, select.value)
      iniciar() // recarrega pra reorganizar as fileiras
    })

    poster.querySelector('.botao-remover-tier').addEventListener('click', async () => {
      await removerClassificacao(tmdbMovieId)
      iniciar()
    })
  }

  return poster
}

function renderizarNaoClassificados(filmes) {
  secaoNaoClassificados.hidden = filmes.length === 0
  listaNaoClassificados.innerHTML = ''

  filmes.forEach(filme => {
    const item = document.createElement('div')
    item.className = 'poster-item'

    const img = document.createElement('img')
    img.className = 'poster-img'
    img.src = filme.poster_url
    img.alt = filme.titulo
    item.appendChild(img)

    const tituloEl = document.createElement('span')
    tituloEl.className = 'poster-titulo'
    tituloEl.textContent = filme.titulo
    item.appendChild(tituloEl)

    const select = document.createElement('select')
    select.className = 'select-mudar-tier'
    const optDefault = document.createElement('option')
    optDefault.value = ''
    optDefault.textContent = 'Classificar...'
    select.appendChild(optDefault)
    TIERS.forEach(t => {
      const opt = document.createElement('option')
      opt.value = t
      opt.textContent = t
      select.appendChild(opt)
    })

    select.addEventListener('change', async () => {
      if (!select.value) return
      await classificarFilme(filme.tmdb_movie_id, filme.titulo, filme.poster_url, select.value)
      iniciar()
    })

    item.appendChild(select)
    listaNaoClassificados.appendChild(item)
  })
}

async function classificarFilme(tmdbMovieId, titulo, posterPath, tier) {
  try {
    await fetch(`/api/tier-list/${tmdbMovieId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, poster_path: posterPath, tier })
    })
  } catch (err) {
    mostrarStatus('Erro ao classificar filme.')
  }
}

async function removerClassificacao(tmdbMovieId) {
  try {
    await fetch(`/api/tier-list/${tmdbMovieId}`, { method: 'DELETE' })
  } catch (err) {
    mostrarStatus('Erro ao remover classificação.')
  }
}

iniciar()