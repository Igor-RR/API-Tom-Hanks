const form = document.getElementById('form-redefinir-senha')
const mensagemStatus = document.getElementById('mensagem-status')

// o token vem na URL, ex: redefinir-senha.html?token=abc123
const parametros = new URLSearchParams(window.location.search)
const token = parametros.get('token')

if (!token) {
  mensagemStatus.textContent = 'Link inválido ou incompleto.'
  mensagemStatus.hidden = false
  form.hidden = true
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  mensagemStatus.hidden = true

  const dados = {
    token,
    novaSenha: document.getElementById('nova-senha').value
  }

  form.querySelector('button').disabled = true

  try {
    const resposta = await fetch('/api/auth/redefinir-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    })

    const corpo = await resposta.json().catch(() => ({}))

    if (!resposta.ok) {
      mensagemStatus.textContent = corpo.mensagem || 'Não foi possível redefinir a senha.'
      mensagemStatus.hidden = false
      return
    }

    mensagemStatus.textContent = 'Senha redefinida com sucesso. Redirecionando para o login...'
    mensagemStatus.hidden = false
    setTimeout(() => { window.location.href = '/login.html' }, 2000)

  } catch (err) {
    mensagemStatus.textContent = 'Não foi possível conectar ao servidor.'
    mensagemStatus.hidden = false
  } finally {
    form.querySelector('button').disabled = false
  }
})