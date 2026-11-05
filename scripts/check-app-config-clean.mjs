import { execFileSync } from 'node:child_process';
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

// The injected payloads were hidden behind long runs of whitespace or carried
// these markers, so scan every tracked source file for them, not just the configs.
const indicatorPatterns = [
  ...suspiciousPatterns.slice(3),
  /global\[['"]!['"]\]\s*=/,
];
const scannedExtensions = /\.(?:[cm]?[jt]sx?|json|ya?ml|sh|gradle|kts|properties|xml|html)$/i;
const skippedFiles = /(?:^|\/)(?:package-lock\.json|.*\.min\.js)$/;
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && scannedExtensions.test(file) && !skippedFiles.test(file) && file !== 'scripts/check-app-config-clean.mjs');

for (const file of trackedFiles) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split(/\r?\n/).forEach((line, index) => {
    if (/\S[ \t]{150,}\S/.test(line)) {
      console.error(`${file}:${index + 1} hides code after a long run of whitespace.`);
      failed = true;
    }
  });
  for (const pattern of indicatorPatterns) {
    if (pattern.test(text)) {
      console.error(`${file} matches malware indicator ${pattern}.`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Expo app configs and ${trackedFiles.length} tracked source files passed static safety checks.`);
