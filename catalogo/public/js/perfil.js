const mensagemStatus = document.getElementById('mensagem-status')
const cartaoPerfil = document.getElementById('cartao-perfil')

const avatarFoto = document.getElementById('avatar-foto')
const avatarIniciais = document.getElementById('avatar-iniciais')
const labelTrocarFoto = document.getElementById('label-trocar-foto')
const inputFoto = document.getElementById('input-foto')
const erroFoto = document.getElementById('erro-foto')

const nomeUsuario = document.getElementById('nome-usuario')
const bioTexto = document.getElementById('bio-texto')

const btnEditarBio = document.getElementById('btn-editar-bio')
const formBio = document.getElementById('form-bio')
const inputBio = document.getElementById('input-bio')
const contadorBio = document.getElementById('contador-bio')
const btnCancelarBio = document.getElementById('btn-cancelar-bio')

const listaFavoritos = document.getElementById('lista-favoritos')
const vazioFavoritos = document.getElementById('vazio-favoritos')
const contagemFavoritosPerfil = document.getElementById('contagem-favoritos-perfil')
const modeloCardFavorito = document.getElementById('modelo-card-favorito')

const btnLogout = document.getElementById('btn-logout')

const LIMITE_BIO = 280

const params = new URLSearchParams(window.location.search)
const idPerfilVisitado = params.get('id') // ausente = próprio perfil

let bioAtual = ''
let meuUsuarioId = null

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

function esconderStatus() {
  mensagemStatus.hidden = true
}

function mostrarErroFoto(texto) {
  erroFoto.textContent = texto
  erroFoto.hidden = false
}

function esconderErroFoto() {
  erroFoto.hidden = true
}

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

function iniciaisDoNome(nome) {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] || ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

function renderizarAvatar(fotoUrl, nome) {
  // Se a URL for um blob temporário ou uma string válida do proxy
  if (fotoUrl && fotoUrl.trim() !== '') {
    // Se for blob local, não adiciona cache buster
    if (fotoUrl.startsWith('blob:')) {
      avatarFoto.src = fotoUrl
    } else {
      const separador = fotoUrl.includes('?') ? '&' : '?'
      avatarFoto.src = `${fotoUrl}${separador}t=${Date.now()}`
    }
    avatarFoto.hidden = false
    avatarIniciais.hidden = true
  } else {
    avatarFoto.removeAttribute('src')
    avatarIniciais.textContent = iniciaisDoNome(nome)
    avatarIniciais.hidden = false
    avatarFoto.hidden = true
  }
}

function renderizarPerfil(perfil) {
  cartaoPerfil.hidden = false

  const fotoUrl = perfil.foto_url ?? perfil.fotoUrl
  const ehProprioPerfil = perfil.eh_proprio_perfil ?? perfil.ehProprioPerfil

  renderizarAvatar(fotoUrl, perfil.nome)
  nomeUsuario.textContent = perfil.nome || 'Usuário'

  bioAtual = perfil.bio || ''
  bioTexto.textContent = bioAtual || (ehProprioPerfil ? 'Você ainda não escreveu uma bio.' : 'Sem bio.')

  if (ehProprioPerfil) {
    meuUsuarioId = perfil.usuario_id ?? perfil.usuarioId
    labelTrocarFoto.hidden = false
    btnEditarBio.hidden = false
  }

  renderizarFavoritos(perfil.favoritos || [])
}

function renderizarFavoritos(favoritos) {
  listaFavoritos.innerHTML = ''
  contagemFavoritosPerfil.textContent = favoritos.length > 0 ? `(${favoritos.length})` : ''

  if (favoritos.length === 0) {
    vazioFavoritos.hidden = false
    return
  }
  vazioFavoritos.hidden = true

  favoritos.forEach(filme => {
    const card = modeloCardFavorito.content.cloneNode(true)
    card.querySelector('.poster').src = filme.poster_path
    card.querySelector('.poster').alt = filme.titulo
    card.querySelector('.titulo-filme').textContent = filme.titulo
    listaFavoritos.appendChild(card)
  })
}

// ---------- editar bio ----------
function atualizarContadorBio() {
  contadorBio.textContent = `${inputBio.value.length}/${LIMITE_BIO}`
}

btnEditarBio.addEventListener('click', () => {
  inputBio.value = bioAtual
  atualizarContadorBio()
  formBio.hidden = false
  btnEditarBio.hidden = true
  inputBio.focus()
})

btnCancelarBio.addEventListener('click', () => {
  formBio.hidden = true
  btnEditarBio.hidden = false
})

inputBio.addEventListener('input', atualizarContadorBio)

formBio.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const botaoSalvar = formBio.querySelector('button[type="submit"]')
  botaoSalvar.disabled = true

  try {
    const resposta = await fetch(`/api/perfil/${meuUsuarioId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: inputBio.value.trim() })
    })
    const dados = await resposta.json()

    if (!resposta.ok) {
      mostrarStatus(dados.erro || dados.mensagem || 'Não foi possível salvar a bio.')
      return
    }

    bioAtual = dados.bio || ''
    bioTexto.textContent = bioAtual || 'Você ainda não escreveu uma bio.'

    formBio.hidden = true
    btnEditarBio.hidden = false
  } catch (err) {
    mostrarStatus('Erro ao salvar a bio.')
  } finally {
    botaoSalvar.disabled = false
  }
})

// ---------- trocar foto ----------
inputFoto.addEventListener('change', async () => {
  const arquivo = inputFoto.files[0]
  if (!arquivo) return

  esconderErroFoto()

  const fotoAnterior = avatarFoto.hidden ? null : avatarFoto.src
  const preview = URL.createObjectURL(arquivo)
  renderizarAvatar(preview, nomeUsuario.textContent)

  const formData = new FormData()
  formData.append('foto', arquivo)

  try {
    const resposta = await fetch(`/api/perfil/${meuUsuarioId}/foto`, { method: 'POST', body: formData })
    const dados = await resposta.json()

    // Revoga o preview local para liberar memória
    URL.revokeObjectURL(preview)

    if (!resposta.ok) {
      renderizarAvatar(fotoAnterior, nomeUsuario.textContent)
      mostrarErroFoto(dados.erro || dados.mensagem || 'Não foi possível enviar a foto.')
      return
    }

    const novaUrl = dados.foto_url ?? dados.fotoUrl
    renderizarAvatar(novaUrl, nomeUsuario.textContent)
  } catch (err) {
    URL.revokeObjectURL(preview)
    renderizarAvatar(fotoAnterior, nomeUsuario.textContent)
    mostrarErroFoto('Erro ao enviar a foto. Tente novamente.')
  } finally {
    inputFoto.value = ''
  }
})

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login.html'
})

iniciar()