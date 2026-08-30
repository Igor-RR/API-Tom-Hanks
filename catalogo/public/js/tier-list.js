const listaStalkers = document.getElementById('lista-stalkers')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloCard = document.getElementById('modelo-card-stalker')

const modalUpgrade = document.getElementById('modal-upgrade')
const modalTitulo = document.getElementById('modal-titulo')
const modalTexto = document.getElementById('modal-texto')
const modalBtnCancelar = document.getElementById('modal-btn-cancelar')
const modalBtnAssinar = document.getElementById('modal-btn-assinar')

const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker']

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
  fecharModalUpgrade()
})

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

async function iniciar() {
  mostrarStatus('Carregando tier lists...')

  try {
    const [respostaMe, respostaStalkers] = await Promise.all([
      fetch('/api/me'),
      fetch('/api/tier-lists')
    ])

    if (respostaMe.status === 401) {
      window.location.href = '/login.html'
      return
    }

    const me = await respostaMe.json()
    const stalkers = await respostaStalkers.json()
    const souStalker = HIERARQUIA.indexOf(me.role) >= HIERARQUIA.indexOf('stalker')
    const euJaTenhoLista = stalkers.some(s => String(s.usuario_id) === String(me.usuario_id))

    mensagemStatus.hidden = true
    listaStalkers.innerHTML = ''

    // stalker sem lista ainda -- card real pra começar
    if (souStalker && !euJaTenhoLista) {
      const card = modeloCard.content.cloneNode(true)
      const link = card.querySelector('.card-stalker')
      link.href = `tier-list-detalhe.html?usuario_id=${me.usuario_id}`
      card.querySelector('.nome-stalker').textContent = `${me.nome} (você)`
      card.querySelector('.contagem-stalker').textContent = 'Começar minha tier list'
      listaStalkers.appendChild(card)
    }

    // não é stalker -- card sempre visível, mas clique abre modal de upgrade
    if (!souStalker) {
      const card = modeloCard.content.cloneNode(true)
      const link = card.querySelector('.card-stalker')
      link.removeAttribute('href')
      link.style.cursor = 'pointer'
      card.querySelector('.nome-stalker').textContent = 'Criar minha própria tier list'
      card.querySelector('.contagem-stalker').textContent = 'Recurso do plano stalker'
      link.addEventListener('click', (evento) => {
        evento.preventDefault()
        abrirModalUpgrade('stalker')
      })
      listaStalkers.appendChild(card)
    }

    stalkers.forEach(s => {
      const card = modeloCard.content.cloneNode(true)
      const link = card.querySelector('.card-stalker')
      link.href = `tier-list-detalhe.html?usuario_id=${s.usuario_id}`
      const souEu = String(s.usuario_id) === String(me.usuario_id)
      card.querySelector('.nome-stalker').textContent = souEu ? `${s.usuario_nome} (você)` : s.usuario_nome
      card.querySelector('.contagem-stalker').textContent = `${s.total_filmes} filmes classificados`
      listaStalkers.appendChild(card)
    })

  } catch (err) {
    mostrarStatus('Erro ao conectar com o servidor.')
  }
}

iniciar()