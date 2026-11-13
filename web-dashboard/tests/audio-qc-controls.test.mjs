import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { AudioQcSettings } = require('../src/panels/audioQc/AudioQcSettings.tsx');
const { AudioQcHistory } = require('../src/panels/audioQc/AudioQcHistory.tsx');
const policy = { shopId: 'one', enabled: false, mode: 'vad_auto', maxSegmentDurationSec: 300,
  silenceToStopSec: 10, preRollSec: 5, uploadImmediately: true, heartbeat: null };

test('Settings expose only automatic recording and fleet save is explicit', () => {
  const html = renderToStaticMarkup(React.createElement(AudioQcSettings, {
    fleet: true, saved: policy, draft: policy, dirty: false, saving: false, onChange() {}, onSave() {},
  }));
  assert.ok(html.includes('Авто по речи'));
  assert.ok(!html.includes('Ручная запись'));
  assert.ok(html.includes('Применить ко всем магазинам'));
  assert.match(html, /<button disabled="">Применить ко всем магазинам<\/button>/);
  assert.ok(!html.includes('Планшет магазина'));
});

test('All-shops history labels rows with the corresponding store', () => {
  const recordings = ['one', 'two'].map((shopId, i) => ({ localRecordingId: `r${i}`, shopId,
    startedAt: '2026-11-12T10:00:00Z', durationSec: 60, recordingMode: 'vad_auto', status: 'completed', qc: null }));
  const html = renderToStaticMarkup(React.createElement(AudioQcHistory, {
    shopName: 'Все магазины', shops: [{ id: 'one', name: 'Панова' }, { id: 'two', name: 'Южная' }],
    showShop: true, recordings, total: 2, loading: false, page: 1, pageSize: 25, onPageChange() {}, onOpen() {},
  }));
  assert.ok(html.includes('<th>Магазин</th>'));
  assert.ok(html.includes('<td>Панова</td>'));
  assert.ok(html.includes('<td>Южная</td>'));
  assert.ok(html.includes('Все магазины'));
});
