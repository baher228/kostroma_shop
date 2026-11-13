import { readFileSync } from 'node:fs';

const files = ['app.config.js', 'worker-app/app.config.js'];
const suspiciousPatterns = [
  /\b(?:eval|Function)\s*\(/,
  /\b(?:spawn|exec(?:File)?)\s*\(/,
  /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
  /0xa322E5f3D311D3080e6f0121063e9aDC2490Ef1a/i,
  /91\.218\.183\.174/,
  /blockscout|1rpc|drpc|publicnode/i,
  /dWJ1bnR1/,
  /GSkqNNyuJw/,
];

let failed = false;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.length > 500) {
      console.error(`${file}:${index + 1} has an unexpectedly long line (${line.length} chars).`);
      failed = true;
    }
  });

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      console.error(`${file} matches suspicious pattern ${pattern}.`);
      failed = true;
    }
  }
}

// The obfuscated loader has also appeared behind package startup/build scripts.
for (const file of ['package.json', 'worker-app/package.json', 'web-dashboard/package.json',
  'services/ru-backend/package.json', 'services/dubai-backend/package.json']) {
  const { scripts = {} } = JSON.parse(readFileSync(file, 'utf8'));
  if (Object.values(scripts).some(command => /\bnode\s+init(?:\s|$)/.test(command))) {
    console.error(`${file} starts the retired init loader.`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('Expo app config files passed static safety checks.');
