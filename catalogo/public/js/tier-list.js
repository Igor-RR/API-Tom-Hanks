const listaStalkers = document.getElementById('lista-stalkers')
const mensagemStatus = document.getElementById('mensagem-status')
const modeloCard = document.getElementById('modelo-card-stalker')

function mostrarStatus(texto) {
  mensagemStatus.textContent = texto
  mensagemStatus.hidden = false
}

async function iniciar() {
  mostrarStatus('Carregando tier lists...')

  try {
    const resposta = await fetch('/api/tier-lists')
    if (resposta.status === 401) {
      window.location.href = '/login.html'
      return
    }

    const stalkers = await resposta.json()

    if (stalkers.length === 0) {
      mostrarStatus('Nenhum stalker criou uma tier list ainda.')
      return
    }

    mensagemStatus.hidden = true
    listaStalkers.innerHTML = ''

    stalkers.forEach(s => {
      const card = modeloCard.content.cloneNode(true)
      const link = card.querySelector('.card-stalker')
      link.href = `tier-list-detalhe.html?usuario_id=${s.usuario_id}`
      card.querySelector('.nome-stalker').textContent = s.usuario_nome
      card.querySelector('.contagem-stalker').textContent = `${s.total_filmes} filmes classificados`
      listaStalkers.appendChild(card)
    })

  } catch (err) {
    mostrarStatus('Erro ao conectar com o servidor.')
  }
}

iniciar()