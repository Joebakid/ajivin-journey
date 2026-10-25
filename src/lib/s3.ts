import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const endpoint = process.env.AWS_ENDPOINT_URL_S3 || 'https://br-wandering-poetry-b46lq3ex.storage.c-6.us-east-2.aws.neon.tech';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  endpoint: endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'nak_live_17a2620eb4ea4f958bd670cf8940a0ee',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'nsk_live_c47f2a6a68404576a9cdbc7547337fdd05046cc0ca3eed62751d504fe2df9d4b',
  },
  forcePathStyle: true,
});

export async function uploadMediaToS3(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const fileExt = file.name.split('.').pop() || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const bucketName = 'chat-media';

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
    })
  );

  // Correct URL path for S3 path-style access
  const cleanEndpoint = endpoint.replace(/\/$/, '');
  return `${cleanEndpoint}/${bucketName}/${fileName}`;
}