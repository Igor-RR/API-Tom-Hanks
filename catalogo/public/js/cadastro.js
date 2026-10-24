const form = document.getElementById('form-cadastro')
const mensagemErro = document.getElementById('mensagem-erro')

form.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  mensagemErro.hidden = true

  const dados = {
    nome: document.getElementById('nome').value,
    email: document.getElementById('email').value,
    senha: document.getElementById('senha').value
  }

  try {
    const resposta = await fetch('/api/auth/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    })

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}))
      mensagemErro.textContent = erro.mensagem || 'Não foi possível criar a conta.'
      mensagemErro.hidden = false
      return
    }

    // cadastro deu certo -> manda pro login
    window.location.href = '/login.html'

  } catch (err) {
    mensagemErro.textContent = 'Não foi possível conectar ao servidor.'
    mensagemErro.hidden = false
  }
})
