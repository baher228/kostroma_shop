import { execFileSync } from 'node:child_process';

const env = {
  ...process.env,
  PERSONAL_POSTGRES_PASSWORD: 'ci-personal-password',
  OPS_POSTGRES_PASSWORD: 'ci-ops-password',
  JWT_SECRET: 'ci-jwt-secret',
  OPS_JWT_SECRET: 'ci-ops-jwt-secret',
  CORS_ORIGIN: 'http://localhost:19006',
};
for (const file of ['docker-compose.ru.yml', 'docker-compose.dubai.yml']) {
  // Quiet validation avoids rendering interpolated credentials in CI or local logs.
  execFileSync('docker', ['compose', '--env-file', '.env.example', '-f', file, 'config', '--quiet'], { env, stdio: 'inherit' });
  console.log(`${file}: valid`);
}
