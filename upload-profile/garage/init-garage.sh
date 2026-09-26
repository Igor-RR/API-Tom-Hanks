#!/usr/bin/env bash
# Bootstrap único do Garage: cria o layout do cluster (obrigatório mesmo com 1 nó só),
# o bucket dedicado a este projeto e a chave de acesso usada pelo serviço `catalogo`.
#
# Rode isso UMA VEZ, depois que `docker compose up -d garage` já estiver de pé:
#   chmod +x garage/init-garage.sh
#   ./garage/init-garage.sh
#
# Idempotente: pode rodar de novo sem quebrar nada (pula o que já existe).
# Se perder o segredo da chave, rode `docker compose exec garage /garage key create nova-chave`
# manualmente e ajuste o bucket allow — o Garage não reexibe o secret de uma chave antiga.

set -euo pipefail

SERVICO="garage"
BUCKET_NOME="${GARAGE_BUCKET:-avatars}"
NOME_CHAVE="catalogo-app-key"

exec_garage() {
  docker compose exec -T "$SERVICO" /garage "$@"
}

echo "==> Status atual do nó Garage:"
exec_garage status

echo
echo "==> 1/3 — Layout do cluster"
if exec_garage status | grep -q "NO ROLE ASSIGNED"; then
  NODE_ID=$(exec_garage status | awk '/NO ROLE ASSIGNED/{print $1; exit}')
  echo "    Nenhum layout aplicado ainda. Atribuindo nó $NODE_ID à zona dc1..."
  exec_garage layout assign -z dc1 -c 1G "$NODE_ID"
  exec_garage layout apply --version 1
else
  echo "    Layout já aplicado, pulando."
fi

echo
echo "==> 2/3 — Bucket '$BUCKET_NOME'"
if exec_garage bucket list | grep -qw "$BUCKET_NOME"; then
  echo "    Bucket já existe, pulando criação."
else
  exec_garage bucket create "$BUCKET_NOME"
fi

echo
echo "==> 3/3 — Chave de acesso '$NOME_CHAVE'"
if exec_garage key list | grep -q "$NOME_CHAVE"; then
  echo "    Chave já existe. Se você ainda tem o secret salvo, não precisa fazer nada."
  echo "    Se perdeu o secret, crie uma nova chave com outro nome e repita o 'bucket allow'."
else
  echo "    Criando chave (o secret só é exibido nesta hora — copie agora):"
  echo
  exec_garage key create "$NOME_CHAVE"
  echo
fi

echo "==> Garantindo permissão de leitura/escrita/dono da chave sobre o bucket..."
exec_garage bucket allow --read --write --owner "$BUCKET_NOME" --key "$NOME_CHAVE"

echo
echo "==> Feito. Preencha no seu .env:"
echo "    GARAGE_ENDPOINT=http://garage:3900"
echo "    GARAGE_REGION=garage"
echo "    GARAGE_BUCKET=$BUCKET_NOME"
echo "    GARAGE_ACCESS_KEY_ID=<Key ID mostrado acima>"
echo "    GARAGE_SECRET_ACCESS_KEY=<Secret key mostrado acima>"