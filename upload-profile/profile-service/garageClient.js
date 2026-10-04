const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');

const BUCKET = process.env.GARAGE_BUCKET || 'avatars';

// Único client, sempre interno: upload, exclusão E leitura passam pela rede do Docker,
// nunca por uma porta publicada. A hospedagem usada neste projeto roteia só UMA porta
// por aluno de forma confiável (a do catalogo, atrás do proxy da plataforma) -- uma porta
// extra do Garage não é roteada de forma estável, então o navegador NUNCA fala com o
// Garage diretamente. Quem exibe a foto é o catalogo, via proxy (ver routes.js).
const s3 = new S3Client({
  region: process.env.GARAGE_REGION || 'garage',
  endpoint: process.env.GARAGE_ENDPOINT, // ex: http://garage:3900 (nome do serviço no Docker)
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.GARAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.GARAGE_SECRET_ACCESS_KEY,
  },
});

/**
 * Sobe o arquivo pro Garage e devolve a CHAVE do objeto — é só isso que o banco guarda.
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
 * Baixa o arquivo pela rede interna -- usado pela rota de streaming (GET /:usuarioId/foto-arquivo)
 * que o catalogo consome pra servir a imagem de volta ao navegador.
 */
async function baixarFotoPerfil(key) {
  const comando = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return s3.send(comando); // { Body: Readable, ContentType, ... }
}

module.exports = { uploadFotoPerfil, apagarFotoPerfil, baixarFotoPerfil };