const gradePlanos = document.getElementById('grade-planos')

const PLANOS = [
  {
    role: 'espectador',
    nome: 'Espectador',
    descricao: 'Para quem só quer navegar.',
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
    descricao: 'Para quem quer participar.',
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
    descricao: 'Para quem quer ver a comunidade toda.',
    recursos: [
      'Tudo do plano Fan',
      'Ver os comentários de todos os usuários'
    ],
    limitacoes: ['Não modera comentários', 'Não cria tier list']
  },
  {
    role: 'stalker',
    nome: 'Stalker',
    descricao: 'Para quem quer o controle total.',
    recursos: [
      'Tudo do plano Cinéfilo',
      'Apagar qualquer comentário (moderação)',
      'Criar e editar a própria tier list'
    ],
    limitacoes: []
  }
]

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

    if (plano.role !== meuRole) {
      const botao = document.createElement('button')
      botao.textContent = 'Assinar'
      botao.addEventListener('click', () => {
        // lógica de pagamento entra aqui futuramente -- por enquanto, não faz nada
      })
      card.appendChild(botao)
    }

    gradePlanos.appendChild(card)
  })
}

iniciar()