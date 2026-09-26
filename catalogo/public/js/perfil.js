const mensagemStatus = document.getElementById('mensagem-status')
const cabecalhoPerfil = document.getElementById('cabecalho-perfil')
const avatarFoto = document.getElementById('avatar-foto')
const labelTrocarFoto = document.getElementById('label-trocar-foto')
const inputFoto = document.getElementById('input-foto')
const nomeUsuario = document.getElementById('nome-usuario')
const bioTexto = document.getElementById('bio-texto')
const formBio = document.getElementById('form-bio')
const inputBio = document.getElementById('input-bio')
const btnEditarBio = document.getElementById('btn-editar-bio')
const listaFavoritos = document.getElementById('lista-favoritos')
const semFavoritos = document.getElementById('sem-favoritos')
const modeloCardFavorito = document.getElementById('modelo-card-favorito')
const btnLogout = document.getElementById('btn-logout')

const AVATAR_PADRAO = 'img/avatar-padrao.png' // troque pelo placeholder que você já tiver

const params = new URLSearchParams(window.location.search)
const idPerfilVisitado = params.get('id') // ausente = próprio perfil

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

function esconderStatus() {
  mensagemStatus.hidden = true
}

// ---------- carregar o perfil ao abrir a página ----------
async function iniciar() {
  mostrarStatus('Carregando perfil...')

  try {
    const rota = idPerfilVisitado ? `/api/perfil/${idPerfilVisitado}` : '/api/perfil/me'
    const resposta = await fetch(rota)

    if (resposta.status === 401) {
      window.location.href = '/login.html'
      return
    }
    if (!resposta.ok) {
      mostrarStatus('Não foi possível carregar esse perfil.')
      return
    }

    const perfil = await resposta.json()
    esconderStatus()
    renderizarPerfil(perfil)

  } catch (err) {
    mostrarStatus('Erro ao conectar com o servidor.')
  }
}

function renderizarPerfil(perfil) {
  cabecalhoPerfil.hidden = false

  avatarFoto.src = perfil.fotoUrl || AVATAR_PADRAO
  nomeUsuario.textContent = perfil.nome || 'Usuário'
  bioTexto.textContent = perfil.bio || (perfil.ehProprioPerfil ? 'Você ainda não escreveu uma bio.' : 'Sem bio.')

  // controles de edição só aparecem no PRÓPRIO perfil -- isso é só interface; a garantia
  // real está no backend (PUT/POST usam sempre o id do JWT, nunca o :id da URL)
  if (perfil.ehProprioPerfil) {
    labelTrocarFoto.hidden = false
    btnEditarBio.hidden = false
  }

  renderizarFavoritos(perfil.favoritos || [])
}

function renderizarFavoritos(favoritos) {
  listaFavoritos.innerHTML = ''

  if (favoritos.length === 0) {
    semFavoritos.hidden = false
    return
  }
  semFavoritos.hidden = true

  favoritos.forEach(filme => {
    const card = modeloCardFavorito.content.cloneNode(true)
    card.querySelector('.poster').src = filme.poster_path
    card.querySelector('.poster').alt = filme.titulo
    card.querySelector('.titulo-filme').textContent = filme.titulo
    listaFavoritos.appendChild(card)
  })
}

// ---------- editar bio ----------
btnEditarBio.addEventListener('click', () => {
  inputBio.value = bioTexto.dataset.vazio === 'true' ? '' : bioTexto.textContent
  formBio.hidden = false
  btnEditarBio.hidden = true
})

formBio.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const botao = formBio.querySelector('button')
  botao.disabled = true

  try {
    const resposta = await fetch('/api/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: inputBio.value.trim() })
    })
    const dados = await resposta.json()

    const semBio = !dados.bio
    bioTexto.textContent = dados.bio || 'Você ainda não escreveu uma bio.'
    bioTexto.dataset.vazio = String(semBio)

    formBio.hidden = true
    btnEditarBio.hidden = false
  } catch (err) {
    mostrarStatus('Erro ao salvar a bio.')
  } finally {
    botao.disabled = false
  }
})

// ---------- trocar foto ----------
inputFoto.addEventListener('change', async () => {
  const arquivo = inputFoto.files[0]
  if (!arquivo) return

  const formData = new FormData()
  formData.append('foto', arquivo)

  mostrarStatus('Enviando foto...')
  try {
    const resposta = await fetch('/api/perfil/foto', { method: 'POST', body: formData })
    const dados = await resposta.json()

    if (!resposta.ok) {
      mostrarStatus(dados.erro || 'Não foi possível enviar a foto.')
      return
    }

    avatarFoto.src = dados.fotoUrl
    esconderStatus()
  } catch (err) {
    mostrarStatus('Erro ao enviar a foto.')
  } finally {
    inputFoto.value = ''
  }
})

// ---------- logout ----------
btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login.html'
})

iniciar()