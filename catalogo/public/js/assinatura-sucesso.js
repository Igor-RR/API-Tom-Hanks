const mensagem = document.getElementById('mensagem')
const linkDestino = document.getElementById('link-destino')

const TENTATIVAS = 15
const INTERVALO_MS = 3000

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms))

function mostrarLink(href, texto) {
  linkDestino.href = href
  linkDestino.textContent = texto
  linkDestino.hidden = false
}

// Esta página NUNCA promove ninguém: quem altera o papel é o webhook do Stripe, que chega
// de forma assíncrona. Aqui só esperamos ele terminar, renovando o token a cada poucos
// segundos até o papel mudar (o JWT antigo ainda carrega o papel velho).
async function iniciar() {
  let roleAntes

  // o redirect vindo do Stripe chega sem cookie (sameSite strict), mas esta página é
  // estática; a partir daqui os fetch são do mesmo site e levam o cookie normalmente
  try {
    const resposta = await fetch('/api/me')
    if (!resposta.ok) throw new Error('sem sessão')
    roleAntes = (await resposta.json()).role
  } catch (err) {
    mensagem.textContent =
      'Pagamento recebido! Sua sessão expirou durante o pagamento — faça login novamente para ver o seu novo plano.'
    mostrarLink('login.html', 'Fazer login')
    return
  }

  for (let i = 0; i < TENTATIVAS; i++) {
    try {
      const resposta = await fetch('/api/auth/renovar', { method: 'POST' })

      if (resposta.ok) {
        const { role } = await resposta.json()

        if (role !== roleAntes) {
          mensagem.textContent = `Tudo certo! Seu plano agora é ${role}. Redirecionando...`
          mostrarLink('catalogo.html', 'Ir para o catálogo')
          setTimeout(() => { window.location.href = '/catalogo.html' }, 2000)
          return
        }
      }
    } catch (err) {
      // falha de rede momentânea: tenta de novo na próxima volta
    }

    await esperar(INTERVALO_MS)
  }

  mensagem.textContent =
    'Seu pagamento foi recebido, mas a confirmação está demorando. Atualize a página em instantes ou faça login novamente.'
  mostrarLink('catalogo.html', 'Ir para o catálogo')
}

iniciar()
