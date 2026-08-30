const listaTiers = document.getElementById('lista-tiers')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloLinha = document.getElementById('modelo-linha-tier')

let meuRole = 'espectador'
const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker']

function souStalker() {
  return HIERARQUIA.indexOf(meuRole) >= HIERARQUIA.indexOf('stalker')
}

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

async function iniciar() {
  mostrarStatus('Carregando tier list...')

  try {
    const [respostaMe, respostaFilmes, respostaTierList] = await Promise.all([
      fetch('/api/me'),
      fetch('/api/filmes'),
      fetch('/api/tier-list')
    ])

    if (respostaMe.status === 401) {
      window.location.href = '/login.html'
      return
    }

    const me = await respostaMe.json()
    meuRole = me.role

    const filmes = await respostaFilmes.json()
    const tierList = await respostaTierList.json()
    const tierPorFilme = Object.fromEntries(tierList.map(t => [t.tmdb_movie_id, t.tier]))

    mensagemStatus.hidden = true
    renderizar(filmes, tierPorFilme)

  } catch (err) {
    mostrarStatus('Erro ao conectar com o servidor.')
  }
}

function renderizar(filmes, tierPorFilme) {
  listaTiers.innerHTML = ''

  filmes.forEach(filme => {
    const linha = modeloLinha.content.cloneNode(true)

    linha.querySelector('.titulo-filme-tier').textContent = filme.titulo

    const badge = linha.querySelector('.badge-tier')
    const select = linha.querySelector('.select-tier')
    const botaoSalvar = linha.querySelector('.botao-salvar-tier')

    const tierAtual = tierPorFilme[filme.tmdb_movie_id]
    badge.textContent = tierAtual || 'Sem classificação'
    if (tierAtual) badge.className = `badge-tier tier-${tierAtual}`

    if (souStalker()) {
      select.hidden = false
      botaoSalvar.hidden = false
      if (tierAtual) select.value = tierAtual

      botaoSalvar.addEventListener('click', async () => {
        botaoSalvar.disabled = true
        try {
          await fetch(`/api/tier-list/${filme.tmdb_movie_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo: filme.titulo, tier: select.value })
          })
          badge.textContent = select.value
          badge.className = `badge-tier tier-${select.value}`
        } catch (err) {
          mostrarStatus('Erro ao salvar tier.')
        } finally {
          botaoSalvar.disabled = false
        }
      })
    }

    listaTiers.appendChild(linha)
  })
}

iniciar()