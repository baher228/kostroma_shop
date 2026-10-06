import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { QcError, QcStorage } from './types';

export type MinioQcStorageOptions = {
  endpoint: string; accessKey: string; secretKey: string; bucket: string; region: string;
  maxAudioBytes: number; timeoutMs?: number;
};

/** S3-compatible adapter for the existing private MinIO bucket. It never
 * creates buckets, changes policies, or returns a public URL. */
export class MinioQcStorage implements QcStorage {
  readonly bucket: string;
  private client: S3Client | null = null;

  constructor(private readonly options: MinioQcStorageOptions) { this.bucket = options.bucket; }

  private getClient(): S3Client {
    if (this.client) return this.client;
    if (!this.options.endpoint || !this.options.accessKey || !this.options.secretKey || !this.bucket) {
      throw new QcError('STORAGE_ERROR', 'Quality Control storage is not configured.', 503);
    }
    let endpoint: URL;
    try { endpoint = new URL(this.options.endpoint); } catch {
      throw new QcError('STORAGE_ERROR', 'Quality Control storage endpoint is invalid.', 503);
    }
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
        endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
      throw new QcError('STORAGE_ERROR', 'Quality Control storage endpoint is invalid.', 503);
    }
    this.client = new S3Client({
      endpoint: endpoint.toString(), region: this.options.region, forcePathStyle: true,
      credentials: { accessKeyId: this.options.accessKey, secretAccessKey: this.options.secretKey },
    });
    return this.client;
  }

  private async withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
    try { return await operation(controller.signal); }
    catch (error) {
      if (error instanceof QcError) throw error;
      if (controller.signal.aborted || (error as { name?: string })?.name === 'AbortError') {
        throw new QcError('STORAGE_TIMEOUT', 'Quality Control storage timed out.', 503, true);
      }
      throw new QcError('STORAGE_ERROR', 'Quality Control storage request failed.', 503, true);
    } finally { clearTimeout(timer); }
  }

  async put(key: string, audio: Buffer, mimeType: string): Promise<void> {
    await this.withTimeout(signal => this.getClient().send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: audio, ContentLength: audio.length, ContentType: mimeType,
    }), { abortSignal: signal })).then(() => undefined);
  }

  async get(key: string, bucket = this.bucket): Promise<Buffer> {
    return this.withTimeout(async signal => {
      const output = await this.getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      if (!output.Body) throw new QcError('STORAGE_ERROR', 'Stored Quality Control audio is empty.', 503);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of output.Body as AsyncIterable<Uint8Array>) {
        const data = Buffer.from(chunk);
        size += data.length;
        if (size > this.options.maxAudioBytes) {
          if ('destroy' in output.Body && typeof output.Body.destroy === 'function') output.Body.destroy();
          throw new QcError('STORAGE_ERROR', 'Stored audio exceeds the processing size limit.', 413);
        }
        chunks.push(data);
      }
      if (!size) throw new QcError('STORAGE_ERROR', 'Stored Quality Control audio is empty.', 503);
      return Buffer.concat(chunks, size);
    });
  }

  async remove(key: string, bucket = this.bucket): Promise<void> {
    await this.withTimeout(signal => this.getClient().send(new DeleteObjectCommand({
      Bucket: bucket, Key: key,
    }), { abortSignal: signal })).then(() => undefined);
  }
}
