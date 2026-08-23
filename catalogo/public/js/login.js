const form = document.getElementById('form-login')
const mensagemErro = document.getElementById('mensagem-erro')

form.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  mensagemErro.hidden = true

  const dados = {
    email: document.getElementById('email').value,
    senha: document.getElementById('senha').value
  }

  try {
    const resposta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    })

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}))
      mensagemErro.textContent = erro.mensagem || 'E-mail ou senha inválidos.'
      mensagemErro.hidden = false
      return
    }

    // login deu certo -> vai pro catálogo
    window.location.href = '/catalogo.html'

  } catch (err) {
    mensagemErro.textContent = 'Não foi possível conectar ao servidor.'
    mensagemErro.hidden = false
  }
})