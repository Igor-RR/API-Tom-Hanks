const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.GARAGE_BUCKET || 'avatars';
const URL_EXPIRATION_SECONDS = Number(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || 300);

const credentials = {
  accessKeyId: process.env.GARAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.GARAGE_SECRET_ACCESS_KEY,
};

// Client INTERNO: usado só pra upload/exclusão, servidor-a-servidor dentro da rede do
// Docker. Aponta pro nome do serviço ("garage"), que só é resolvido dentro do compose.
const s3Interno = new S3Client({
  region: process.env.GARAGE_REGION || 'garage',
  endpoint: process.env.GARAGE_ENDPOINT, // ex: http://garage:3900
  forcePathStyle: true,
  credentials,
});

// Client PÚBLICO: usado só pra gerar a URL assinada que o NAVEGADOR do usuário vai
// acessar diretamente. Precisa de um endpoint alcançável de fora do Docker -- "garage"
// não resolve fora da rede interna, então isso tem que ser um host/porta publicada
// (ex: http://localhost:3900 em dev, ou o domínio/IP público do servidor em produção).
// A porta 3900 do Garage PRECISA estar publicada no docker-compose.yml pra isso funcionar
// (ver GARAGE_PUBLIC_ENDPOINT no .env) -- isso não expõe as fotos publicamente: sem uma
// assinatura válida, o Garage recusa a requisição de qualquer jeito (o bucket continua
// privado).
const s3Publico = new S3Client({
  region: process.env.GARAGE_REGION || 'garage',
  endpoint: process.env.GARAGE_PUBLIC_ENDPOINT,
  forcePathStyle: true,
  credentials,
});

/**
 * Sobe o arquivo pro Garage e devolve a CHAVE do objeto — é só isso que o banco guarda.
 * Uma foto por usuário: a chave é sempre `avatars/{usuarioId}.{extensao}`, então um novo
 * upload substitui o objeto anterior automaticamente se a extensão não mudar (e o objeto
 * antigo com extensão diferente é apagado explicitamente pela rota, ver routes.js).
 */
async function uploadFotoPerfil(usuarioId, buffer, extensao, mimeType) {
  const key = `avatars/${usuarioId}.${extensao}`;
  await s3Interno.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
  return key;
}

/** Apaga um objeto antigo do bucket. Nunca deve derrubar o fluxo principal se falhar. */
async function apagarFotoPerfil(key) {
  if (!key) return;
  try {
    await s3Interno.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (erro) {
    console.error(`[perfil-service] Falha ao apagar objeto antigo (${key}) do Garage:`, erro.message);
  }
}

/**
 * Gera uma URL temporária (pré-assinada) para ler o objeto — usa o client PÚBLICO de
 * propósito, porque quem abre essa URL é o navegador do usuário, não o servidor.
 */
async function gerarUrlFotoPerfil(key) {
  if (!key) return null;
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Publico, comando, { expiresIn: URL_EXPIRATION_SECONDS });
}

module.exports = { uploadFotoPerfil, apagarFotoPerfil, gerarUrlFotoPerfil };