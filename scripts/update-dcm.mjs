import fs from 'node:fs/promises';

const FILE = new URL('../dcm.json', import.meta.url);
const SOURCE = 'https://www.tbank.ru/invest/recommendations/';

function decode(value = '') {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(href = '') {
  try { return new URL(href, SOURCE).href; } catch { return SOURCE; }
}

function currency(text) {
  if (/CNY|юан/i.test(text)) return 'CNY';
  if (/USD|доллар/i.test(text)) return 'USD';
  if (/EUR|евро/i.test(text)) return 'EUR';
  return 'RUB';
}

function sectionAt(html, index) {
  const before = html.slice(0, index).toLowerCase();
  const analyst = Math.max(before.lastIndexOf('по мнению аналитиков'), before.lastIndexOf('мнение аналитиков'));
  const current = before.lastIndexOf('сейчас размещаются');
  return analyst > current ? 'analyst' : 'current';
}

function extractCards(html) {
  const cards = [];
  const seen = new Set();
  const anchors = [...html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)];

  for (const match of anchors) {
    const text = decode(match[4]);
    if (!/облигаци/i.test(text) || !/купон|доходност/i.test(text)) continue;
    const title = text.match(/(Облигации\s+.{2,80}?)(?=\s+(?:Фиксированн|Плавающ|Купон|До\s+\d)|$)/i)?.[1]?.trim();
    const coupon = text.match(/((?:Фиксированный|Плавающий)?\s*купон\s+до\s+[\d,.]+%[^.]{0,22})/i)?.[1]?.trim();
    if (!title || !coupon) continue;
    const deadline = text.match(/До\s+\d{1,2}\s+[А-Яа-яЁё]+/i)?.[0] || 'Уточнить';
    const term = text.match(/(?:Срок|на срок)\s*[:—-]?\s*(\d+\s+(?:месяц\w*|год\w*))/i)?.[1] || 'Уточнить в карточке';
    const issuer = title.replace(/^Облигации\s+/i, '').replace(/\s+(?:CNY|USD|EUR).*$/i, '').trim();
    const url = absoluteUrl(match[2]);
    const id = `${issuer}-${coupon}`.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push({
      id,
      section: sectionAt(html, match.index || 0),
      issuer,
      title,
      coupon,
      description: /плавающ/i.test(coupon)
        ? 'Плавающий купон меняется вместе с базовой рыночной ставкой.'
        : 'Фиксированный купон позволяет заранее оценить денежный поток.',
      term,
      currency: currency(text),
      deadline,
      url
    });
  }

  return cards;
}

try {
  const response = await fetch(SOURCE, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; funds-calculator-data/1.0)',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const placements = extractCards(html);
  if (placements.length < 3) throw new Error(`распознано только ${placements.length} размещений`);
  const payload = {updatedAt: new Date().toISOString(), source: SOURCE, placements};
  await fs.writeFile(FILE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`DCM: сохранено размещений — ${placements.length}`);
} catch (error) {
  console.warn(`DCM update skipped; previous dcm.json preserved: ${error.message}`);
}
