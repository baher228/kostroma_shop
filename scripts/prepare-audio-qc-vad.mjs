import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const artifacts = [
  {
    name: 'sherpa-onnx Android universal AAR',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.4/sherpa-onnx-1.13.4.aar',
    path: 'modules/audio-qc-vad/android/libs/sherpa-onnx-1.13.4.aar',
    sha256: '03f9c4df965f21c71269365a7951a7f23b5696fddd093fa318c80d65550ab780',
  },
  {
    name: 'sherpa-onnx Silero VAD model',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    path: 'modules/audio-qc-vad/android/src/main/assets/models/silero_vad.onnx',
    sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
  },
];

const sha256 = async (filePath) => {
  const contents = await readFile(filePath);
  return createHash('sha256').update(contents).digest('hex');
};

const download = async (artifact, target) => {
  const response = await fetch(artifact.url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download ${artifact.name}: HTTP ${response.status}`);
  }
  const temporary = `${target}.download`;
  await rm(temporary, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, target);
};

for (const artifact of artifacts) {
  const target = resolve(artifact.path);
  await mkdir(dirname(target), { recursive: true });
  let currentHash = null;
  try {
    currentHash = await sha256(target);
  } catch {
    // Missing artifacts are downloaded below.
  }
  if (currentHash !== artifact.sha256) {
    if (currentHash) console.warn(`${artifact.name}: checksum mismatch, downloading a clean copy.`);
    await download(artifact, target);
    currentHash = await sha256(target);
  }
  if (currentHash !== artifact.sha256) {
    throw new Error(`${artifact.name}: SHA-256 verification failed.`);
  }
  console.log(`${artifact.name}: verified ${currentHash}`);
}
