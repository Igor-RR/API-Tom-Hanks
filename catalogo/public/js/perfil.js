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

function iniciaisDoNome(nome) {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] || ''
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (primeira + ultima).toUpperCase()
}

function renderizarAvatar(fotoUrl, nome) {
  if (fotoUrl) {
    avatarFoto.src = fotoUrl
    avatarFoto.hidden = false
    avatarIniciais.hidden = true
  } else {
    avatarIniciais.textContent = iniciaisDoNome(nome)
    avatarIniciais.hidden = false
    avatarFoto.hidden = true
  }
}

function renderizarPerfil(perfil) {
  cartaoPerfil.hidden = false

  // O backend real do catalogo usa snake_case (mesma convenção de usuario_id,
  // tmdb_movie_id etc.), mas o profile-service devolve camelCase em alguns pontos --
  // aceitamos os dois nomes aqui pra não depender de qual dos dois lados foi ajustado.
  const fotoUrl = perfil.foto_url ?? perfil.fotoUrl
  const ehProprioPerfil = perfil.eh_proprio_perfil ?? perfil.ehProprioPerfil

  renderizarAvatar(fotoUrl, perfil.nome)
  nomeUsuario.textContent = perfil.nome || 'Usuário'

  bioAtual = perfil.bio || ''
  bioTexto.textContent = bioAtual || (ehProprioPerfil ? 'Você ainda não escreveu uma bio.' : 'Sem bio.')

  // controles de edição só aparecem no PRÓPRIO perfil -- isso é só interface; a garantia
  // real está no backend (PUT/POST usam sempre o id do JWT, nunca o :id da URL)
  if (ehProprioPerfil) {
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
    const resposta = await fetch('/api/perfil', {
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

  // pré-visualização otimista: mostra a foto local na hora, antes mesmo da resposta do
  // servidor -- se der erro (tipo/tamanho inválido), a linha de baixo desfaz e volta
  // pro estado anterior (foto antiga ou iniciais)
  const fotoAnterior = avatarFoto.hidden ? null : avatarFoto.src
  const preview = URL.createObjectURL(arquivo)
  renderizarAvatar(preview, nomeUsuario.textContent)

  const formData = new FormData()
  formData.append('foto', arquivo)

  try {
    const resposta = await fetch('/api/perfil/foto', { method: 'POST', body: formData })
    const dados = await resposta.json()

    if (!resposta.ok) {
      renderizarAvatar(fotoAnterior, nomeUsuario.textContent)
      mostrarErroFoto(dados.erro || dados.mensagem || 'Não foi possível enviar a foto.')
      return
    }

    renderizarAvatar(dados.foto_url ?? dados.fotoUrl, nomeUsuario.textContent)
  } catch (err) {
    renderizarAvatar(fotoAnterior, nomeUsuario.textContent)
    mostrarErroFoto('Erro ao enviar a foto. Tente novamente.')
  } finally {
    URL.revokeObjectURL(preview)
    inputFoto.value = ''
  }
})

// ---------- logout ----------
btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login.html'
})

iniciar()