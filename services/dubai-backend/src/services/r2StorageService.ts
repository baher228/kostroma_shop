import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/config';

type UploadInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
};

const hasAnyR2Config = Boolean(config.r2AccountId || config.r2AccessKeyId || config.r2SecretAccessKey || config.r2Bucket);
const hasR2Config = Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Bucket);

const client = hasR2Config
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId!,
        secretAccessKey: config.r2SecretAccessKey!,
      },
    })
  : null;

const assertR2Configured = () => {
  if (!hasR2Config) {
    const suffix = hasAnyR2Config ? ' Проверьте, что заполнены все R2_* переменные.' : ' R2_* переменные не заполнены.';
    throw new Error(`R2 storage не настроен.${suffix}`);
  }
};

export const uploadObject = async ({ key, body, contentType }: UploadInput): Promise<string> => {
  assertR2Configured();
  await client!.send(
    new PutObjectCommand({
      Bucket: config.r2Bucket!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
};

export const createDownloadUrl = async (key: string): Promise<string> => {
  if (config.r2PublicBaseUrl) {
    return `${config.r2PublicBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  }
  assertR2Configured();
  return getSignedUrl(
    client!,
    new GetObjectCommand({
      Bucket: config.r2Bucket!,
      Key: key,
    }),
    { expiresIn: config.r2SignedUrlTtlSeconds },
  );
};
