const assert = require('node:assert/strict');
const test = require('node:test');

test('poster file name normalization handles pdf extension and punctuation', () => {
  const { normalizePosterName } = require('../dist/services/googleDrivePosterService');

  assert.equal(normalizePosterName('Колбаски для гриля с моц и травами.pdf'), 'колбаски для гриля с моц и травами');
  assert.equal(normalizePosterName('Шашлык свиной.pdf'), 'шашлык свинои');
});

test('poster file scoring prefers exact and word-overlap matches', () => {
  const { scorePosterFileName } = require('../dist/services/googleDrivePosterService');

  assert.equal(scorePosterFileName('Ветчина прага', 'Ветчина прага.pdf'), 1);
  assert.ok(scorePosterFileName('Колбаски для гриля с моцареллой и травами', 'Колбаски для гриля с моц и травами.pdf') > 0.7);
  assert.ok(scorePosterFileName('Ветчина прага', 'Сосиски сливочные.pdf') < 0.45);
});

test('poster content disposition supports cyrillic filenames', () => {
  const { posterPdfContentDisposition } = require('../dist/services/googleDrivePosterService');

  const header = posterPdfContentDisposition('Ветчина прага.pdf');
  assert.match(header, /^attachment; filename="/);
  assert.match(header, /filename="poster\.pdf"/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.doesNotMatch(header.split(';')[1], /[А-Яа-я]/);
});
