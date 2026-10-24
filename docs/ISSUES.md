# Backlog — issues para criar no repositório novo

> Produto: **Atenas SGE**. Cada bloco abaixo vira uma issue: o título é o título da issue, e "Pronto quando" vai como critério de aceite.
> Sugestão de labels: `atividade-10`, `atividade-11`, `backend`, `frontend`, `infra`, `regressao`, `seguranca`.

---

## Atividade 10: negócio no ar

### 1. Redefinir os papéis para `professional`, `expert` e `admin`
**Labels:** `atividade-10` `backend` `seguranca`
Trocar `espectador/fan/cinefilo/stalker/admin` por `professional < expert < admin`, cumulativos. Atualizar a `HIERARQUIA` em todos os pontos onde ela se repete: `auth-service`, `app`, `pagamentos` e os JS do front (`app.js`, `planos.js`).
**Pronto quando:** todo usuário novo nasce `professional`, o `exigirNivel` bloqueia com `403` quem não tem o papel, e o `403` aparece no log de auditoria.

### 2. Modelar as tabelas de projetos, itens e demandas
**Labels:** `atividade-10` `backend`
Criar `projetos`, `itens` (RG, quantidade, id do projeto) e `demandas` (atividade: montagem, almoxarifado ou usinagem; responsável; status). Atualizar o `schema.sql` do CI junto, para os dois ficarem sincronizados.
**Pronto quando:** as tabelas existem no banco de produção e no schema do CI, com chaves estrangeiras para o usuário.

### 3. Cadastro de processos, itens e projetos (todos os papéis)
**Labels:** `atividade-10` `backend` `frontend`
Rotas e telas para qualquer usuário logado cadastrar processos, itens e projetos. Substitui o catálogo de filmes e remove a dependência da API do TMDB. Inclui renomear a pasta e o serviço `catalogo` para `app` e remover as telas e rotas de tier list e de filmes (favoritos, comentários).
**Pronto quando:** um usuário `professional` cadastra um projeto com itens e o vê na listagem.

### 4. Demandas: cada usuário vê só as próprias, e só Expert/Admin exclui
**Labels:** `atividade-10` `backend` `frontend` `seguranca`
O filtro por `usuario_id` vem sempre do JWT validado, nunca do cliente. A exclusão de demanda exige `expert` ou superior. Botões bloqueados continuam visíveis e abrem o modal de upgrade.
**Pronto quando:** um `professional` não consegue ver a demanda de outro nem excluir nenhuma (`403` nas duas), e um `expert` exclui.

### 5. Trocar nome, textos e identidade visual de "Tom Hanks"
**Labels:** `atividade-10` `frontend` `infra`
Substituir o nome nos títulos dos HTMLs, no `planos.js`, no remetente do e-mail de redefinição de senha, nos `package.json` e no `package-lock.json` da raiz. Extrair as cores do `index.css` para variáveis em `:root` (já feito no pacote de arquivos editados) e conferir que não restam classes de filmes sem uso.
**Pronto quando:** nenhuma ocorrência de "Tom Hanks" resta no repositório e o `.badge-role` não está duplicado.

### 6. Landing page do produto
**Labels:** `atividade-10` `frontend`
Página pública com a dor, a proposta de valor e os dois planos, levando ao cadastro.
**Pronto quando:** a página abre sem login e tem botões para cadastrar e para entrar.

### 7. Publicar no mesmo domínio e na mesma stack do Portainer
**Labels:** `atividade-10` `infra`
Apontar a stack existente para o repositório novo, sem criar stack nem subdomínio novos. Renomear as imagens do Docker Hub e extrair o nome das imagens para uma variável no workflow, que hoje se repete em dez lugares.
**Pronto quando:** o domínio atual serve o Atenas SGE e o pipeline publica as imagens com o nome novo.

### 8. Log-service aceitar as ações do novo produto (e as que já são descartadas)
**Labels:** `atividade-10` `backend`
A lista fixa `ACOES_VALIDAS` rejeita `assinatura_ativada`, `assinatura_cancelada` e `foto_perfil_atualizada`, que já são enviadas hoje. Trocar a lista por validação de formato e incluir as ações `projeto_criado`, `item_cadastrado`, `demanda_criada` e `demanda_excluida`. Adicionar `nivel` (informação ou erro) e filtros na consulta, e limitar o tamanho do stream.
**Pronto quando:** um evento de cada ação aparece na consulta do `admin` e o `400` deixa de ocorrer.

---

## Atividade 11: assinatura com Stripe e Expert

### 9. Plano Expert único no Stripe
**Labels:** `atividade-11` `backend`
Trocar os três planos pagos por um só preço (`STRIPE_PRICE_EXPERT`). Simplificar `PLANOS_PAGOS`, a regra de upgrade e o cancelamento de assinaturas anteriores no `pagamentos`. O webhook muda o papel de `professional` para `expert`, e o cancelamento devolve a `professional`. Corrigir também o ponto em que o retorno de `definirRoleNoAuth` é ignorado: se o `auth-service` recusar, não registrar `assinatura_ativada`.
**Pronto quando:** o pagamento com o cartão de teste promove o usuário, o cancelamento no painel do Stripe o rebaixa, e o CI cobre o fluxo sem cobrança real.

### 10. Microsserviço de regressão (Python)
**Labels:** `atividade-11` `regressao` `backend`
Novo serviço interno (Python), sem porta pública, que ajusta uma **regressão linear múltipla** e devolve o número previsto de funcionários. Entradas: nº de itens do projeto, quantidade total de unidades, nº de atividades envolvidas (montagem, almoxarifado, usinagem) e prazo em dias. Alvo: funcionários usados (coluna `demandas.funcionarios_usados`). Treina com dados mockados no início e reajusta o modelo quando um projeto é concluído com o valor real informado. Acessível só pelo `app`, com `INTERNAL_API_KEY`, e liberado só para `expert` e `admin`. Entra no `docker-compose`, no override do CI e no pipeline, com um teste que confere que a previsão devolve um número.
**Pronto quando:** um `expert` pede a previsão pelo `app`, um `professional` recebe `403`, e o CI sobe o serviço e valida a resposta.

### 11. Painel de previsão de equipe e indicadores (Expert/Admin)
**Labels:** `atividade-11` `frontend` `backend`
Substitui a tela de tier list. Tela `previsao.html` com a previsão da regressão linear múltipla por projeto (e um formulário para simular um projeto novo), mais carga por funcionário, demandas por atividade e horas extras. Bloqueada no Professional pelo modal de upgrade, com a trava real no backend.
**Pronto quando:** o painel carrega para `expert` e `admin`, e um `professional` que forja a chamada recebe `403`.

### 12. Atualizar o CI: testes, schema e serviço de regressão
**Labels:** `atividade-11` `infra`
Ajustar o teste de cadastro e login e o de renovação de token ao papel `professional`. Incluir a tabela `perfis` no schema do CI e o `profile-service` no override de `DB_HOST`. Padronizar o `restart: unless-stopped` no compose.
**Pronto quando:** o pipeline passa de ponta a ponta com o serviço de regressão incluído.

---

### 13. Limites de uso do plano Professional
**Labels:** `atividade-11` `backend` `frontend` `seguranca`
Aplicar no backend os limites do Professional: até 3 projetos **ativos**, até 50 itens por projeto e até 20 demandas **abertas**, contados por conta de usuário (`criado_por`). Projetos e demandas concluídos saem da contagem e continuam alimentando a regressão. Os valores ficam em constantes de configuração, fáceis de ajustar. Ao estourar o limite, a API responde `403` com uma mensagem clara, e o front abre o modal de upgrade. O Expert e o `admin` não têm limite.
**Pronto quando:** um `professional` com 3 projetos ativos recebe `403` ao criar o quarto e vê o modal de upgrade; ao concluir um projeto, consegue criar outro; um `expert` cria sem limite.

---

## Melhorias futuras (fora das atividades 10 e 11)

### 14. Tema visual por tipo de estabelecimento
CSS configurável por tipo de negócio, reaproveitável se o produto crescer para outros segmentos.

### 15. Anexos de projeto no profile-service
Aceitar PDF e vários arquivos por projeto, com outra chave de objeto e uma tabela de anexos.

### 16. Dependências do profile-service
Remover `audit`, `fix` e `@aws-sdk/s3-request-presigner` do `package.json` e atualizar o `multer` para a linha 2.x.
