const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.GARAGE_REGION || 'garage',
  endpoint: process.env.GARAGE_ENDPOINT, // ex: http://garage:3900 (nome do serviço no Docker)
  forcePathStyle: true, // obrigatório no Garage (e no MinIO): sem isso o SDK tenta
  // virtual-hosted-style (https://bucket.endpoint/chave) e a requisição falha.
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.GARAGE_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.GARAGE_BUCKET || 'avatars';
const URL_EXPIRATION_SECONDS = Number(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || 300);

/**
 * Sobe o arquivo pro Garage e devolve a CHAVE do objeto — é só isso que o banco guarda.
 * Uma foto por usuário: a chave é sempre `avatars/{usuarioId}.{extensao}`, então um novo
 * upload substitui o objeto anterior automaticamente se a extensão não mudar (e o objeto
 * antigo com extensão diferente é apagado explicitamente pela rota, ver routes.js).
 */
async function uploadFotoPerfil(usuarioId, buffer, extensao, mimeType) {
  const key = `avatars/${usuarioId}.${extensao}`;
  await s3.send(
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
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (erro) {
    console.error(`[perfil-service] Falha ao apagar objeto antigo (${key}) do Garage:`, erro.message);
  }
}

/**
 * Gera uma URL temporária (pré-assinada) para ler o objeto — decisão documentada no README:
 * o bucket fica privado, e cada exibição do perfil pede uma URL nova, que expira em
 * PRESIGNED_URL_EXPIRATION_SECONDS segundos.
 */
async function gerarUrlFotoPerfil(key) {
  if (!key) return null;
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, comando, { expiresIn: URL_EXPIRATION_SECONDS });
}

module.exports = { uploadFotoPerfil, apagarFotoPerfil, gerarUrlFotoPerfil };