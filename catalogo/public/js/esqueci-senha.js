const form = document.getElementById('form-esqueci-senha')
const mensagemStatus = document.getElementById('mensagem-status')

form.addEventListener('submit', async (evento) => {
  evento.preventDefault()

  const dados = {
    email: document.getElementById('email').value
  }

  form.querySelector('button').disabled = true

  try {
    const resposta = await fetch('/api/auth/esqueci-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    })

    const corpo = await resposta.json().catch(() => ({}))

    // a rota sempre responde a mesma mensagem, exista ou não o e-mail --
    // não damos tratamento diferente aqui de propósito
    mensagemStatus.textContent = corpo.mensagem || 'Se esse e-mail existir, um link foi enviado.'
    mensagemStatus.hidden = false

  } catch (err) {
    mensagemStatus.textContent = 'Não foi possível conectar ao servidor.'
    mensagemStatus.hidden = false
  } finally {
    form.querySelector('button').disabled = false
  }
})