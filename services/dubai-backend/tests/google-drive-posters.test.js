const assert = require('node:assert/strict');
const test = require('node:test');

test('poster file name normalization handles pdf extension and punctuation', () => {
  const { normalizePosterName } = require('../dist/services/googleDrivePosterService');

  assert.equal(normalizePosterName('Колбаски для гриля с моц и травами.pdf'), 'колбаски для гриля с моц и травами');
  assert.equal(normalizePosterName('Шашлык свиной.pdf'), 'шашлык свинои');
  assert.equal(normalizePosterName('Докторская (целлоф.) 1 кг'), 'докторская целлоф 1 кг');
});

test('poster file scoring prefers exact and word-overlap matches', () => {
  const { scorePosterFileName } = require('../dist/services/googleDrivePosterService');

  assert.equal(scorePosterFileName('Ветчина прага', 'Ветчина прага.pdf'), 1);
  assert.equal(scorePosterFileName('Ветчина в оболочке (синюга) 1 кг.', 'Ветчина в оболочке (синюга) 1 кг.psd'), 1);
  assert.ok(scorePosterFileName('Колбаски для гриля с моцареллой и травами', 'Колбаски для гриля с моц и травами.pdf') > 0.7);
  assert.ok(scorePosterFileName('Ветчина прага', 'Сосиски сливочные.pdf') < 0.45);
});

test('poster selection rejects a merely similar product and reports a friendly message', () => {
  const {
    POSTER_NOT_READY_MESSAGE,
    selectPosterFileForProduct,
  } = require('../dist/services/googleDrivePosterService');
  const files = [
    { id: 'finnish', name: 'Сервелат Финский п:к 1 кг.psd', mimeType: 'image/x-photoshop' },
    { id: 'milk', name: 'Молочная (целлоф.) 1 кг.psd', mimeType: 'image/x-photoshop' },
  ];

  assert.equal(selectPosterFileForProduct('Сервелат Кремлёвский п/к 1 кг.', files).best, null);
  assert.equal(POSTER_NOT_READY_MESSAGE, 'Такой постер ещё не сделали.');
});

test('poster content disposition supports cyrillic filenames', () => {
  const { posterPdfContentDisposition } = require('../dist/services/googleDrivePosterService');

  const header = posterPdfContentDisposition('Ветчина прага.pdf');
  assert.match(header, /^attachment; filename="/);
  assert.match(header, /filename="poster\.pdf"/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.doesNotMatch(header.split(';')[1], /[А-Яа-я]/);
});
