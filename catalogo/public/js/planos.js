const gradePlanos = document.getElementById('grade-planos')

// mesma ordem da hierarquia do backend (admin fica de fora: não é plano vendável)
const ORDEM = ['espectador', 'fan', 'cinefilo', 'stalker']

// os preços exibidos aqui precisam bater com os Prices criados no painel do Stripe
const PLANOS = [
  {
    role: 'espectador',
    nome: 'Espectador',
    preco: 'Grátis',
    descricao: 'Para que gosta de assitir um filminho de tarde 🍿',
    recursos: [
      'Ver a lista de filmes',
      'Ver quantos favoritaram cada filme',
      'Ver as tier lists dos stalkers'
    ],
    limitacoes: ['Não comenta', 'Não favorita', 'Não cria tier list']
  },
  {
    role: 'fan',
    nome: 'Fan',
    preco: 'R$ 9,90/mês',
    descricao: 'Para que se familiariza com o tom hanks',
    recursos: [
      'Tudo do plano Espectador',
      'Favoritar filmes',
      'Comentar filmes',
      'Apagar os próprios comentários'
    ],
    limitacoes: ['Só vê os próprios comentários', 'Não modera nem cria tier list']
  },
  {
    role: 'cinefilo',
    nome: 'Cinéfilo',
    preco: 'R$ 29,90/mês',
    descricao: 'Para que realmente é fã de um bom filme e do Tom Hanks',
    recursos: [
      'Tudo do plano Fan',
      'Ver os comentários de todos os usuários'
    ],
    limitacoes: ['Não modera comentários', 'Não cria tier list']
  },
  {
    role: 'stalker',
    nome: 'Stalker',
    preco: 'R$ 99,90/mês',
    descricao: 'Para os stalkes de plantão 🥸🕵️',
    recursos: [
      'Tudo do plano Cinéfilo',
      'Apagar qualquer comentário (moderação)',
      'Criar e editar a própria tier list'
    ],
    limitacoes: []
  }
]

// área de aviso (erros do checkout, pagamento cancelado), criada aqui pra não depender do HTML
const aviso = document.createElement('p')
aviso.className = 'status'
aviso.hidden = true
gradePlanos.before(aviso)

function mostrarAviso(texto) {
  aviso.textContent = texto
  aviso.hidden = false
}

async function assinar(plano, botao) {
  botao.disabled = true

  try {
    const resposta = await fetch('/api/assinatura/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plano })
    })

    if (resposta.status === 401) {
      window.location.href = '/login.html'
      return
    }

    const dados = await resposta.json()

    if (!resposta.ok) {
      mostrarAviso(dados.mensagem || 'Não foi possível iniciar o pagamento.')
      botao.disabled = false
      return
    }

    // o cartão é digitado na página hospedada pelo Stripe, nunca aqui
    window.location.href = dados.url
  } catch (err) {
    mostrarAviso('Erro de conexão. Tente novamente.')
    botao.disabled = false
  }
}

async function iniciar() {
  let meuRole = null

  try {
    const resposta = await fetch('/api/me')
    if (resposta.ok) {
      const me = await resposta.json()
      meuRole = me.role
    }
  } catch (err) {
    // sem login ainda -- mostra os planos mesmo assim, sem destacar nenhum
  }

  if (new URLSearchParams(window.location.search).get('cancelado')) {
    mostrarAviso('Pagamento cancelado. Nenhuma cobrança foi feita.')
  }

  const ehAdmin = meuRole === 'admin'
  const nivelAtual = ORDEM.indexOf(meuRole) // -1 sem login

  gradePlanos.innerHTML = ''

  PLANOS.forEach(plano => {
    const card = document.createElement('div')
    card.className = 'card-plano'
    if (plano.role === meuRole) card.classList.add('plano-atual')

    if (plano.role === meuRole) {
      const selo = document.createElement('span')
      selo.className = 'selo-plano-atual'
      selo.textContent = 'Seu plano atual'
      card.appendChild(selo)
    }

    const titulo = document.createElement('h3')
    titulo.textContent = plano.nome
    card.appendChild(titulo)

    const preco = document.createElement('p')
    preco.className = 'preco-plano'
    preco.textContent = plano.preco
    card.appendChild(preco)

    const descricao = document.createElement('p')
    descricao.textContent = plano.descricao
    card.appendChild(descricao)

    const listaRecursos = document.createElement('ul')
    plano.recursos.forEach(r => {
      const li = document.createElement('li')
      li.textContent = r
      listaRecursos.appendChild(li)
    })
    card.appendChild(listaRecursos)

    if (plano.limitacoes.length > 0) {
      const listaLimitacoes = document.createElement('ul')
      listaLimitacoes.style.color = '#c0524a'
      plano.limitacoes.forEach(l => {
        const li = document.createElement('li')
        li.textContent = l
        listaLimitacoes.appendChild(li)
      })
      card.appendChild(listaLimitacoes)
    }

    // só oferece upgrade: planos pagos acima do atual. O espectador é gratuito (sem botão)
    // e admin não assina nada. A validação real continua no backend.
    const ehPago = plano.role !== 'espectador'
    const ehUpgrade = ORDEM.indexOf(plano.role) > nivelAtual

    if (ehPago && ehUpgrade && !ehAdmin) {
      const botao = document.createElement('button')
      botao.textContent = 'Assinar'
      botao.addEventListener('click', () => assinar(plano.role, botao))
      card.appendChild(botao)
    }

    gradePlanos.appendChild(card)
  })
}

iniciar()