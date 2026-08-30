const listaStalkers = document.getElementById('lista-stalkers')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloCard = document.getElementById('modelo-card-stalker')

const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker']

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

    listaStalkers.innerHTML = ''

    // se sou stalker e ainda não apareço na lista (0 filmes classificados),
    // adiciona um card pra eu poder começar minha própria tier list
    if (souStalker && !euJaTenhoLista) {
      const card = modeloCard.content.cloneNode(true)
      const link = card.querySelector('.card-stalker')
      link.href = `tier-list-detalhe.html?usuario_id=${me.usuario_id}`
      card.querySelector('.nome-stalker').textContent = `${me.nome} (você)`
      card.querySelector('.contagem-stalker').textContent = 'Começar minha tier list'
      listaStalkers.appendChild(card)
    }

    if (stalkers.length === 0 && !souStalker) {
      mostrarStatus('Nenhum stalker criou uma tier list ainda.')
      return
    }

    mensagemStatus.hidden = true

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