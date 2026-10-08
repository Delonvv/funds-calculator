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
  const current = Math.max(before.lastIndexOf('сейчас размещаются'), before.lastIndexOf('первичные размещения'));
  return analyst > current ? 'analyst' : 'current';
}

function firstMatch(text, patterns, fallback) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).replace(/\s+/g, ' ').trim();
  }
  return fallback;
}

function cardImage(fragment = '') {
  const img = fragment.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i)?.[1];
  const source = fragment.match(/<source\b[^>]*srcset=["']([^"',\s]+)[^"']*["'][^>]*>/i)?.[1];
  const value = img || source || '';
  if (!value || /^data:/i.test(value)) return '';
  return absoluteUrl(value);
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
    const deadline = firstMatch(text, [
      /(?:приём\s+заявок\s+)?до\s+(\d{1,2}\s+[А-Яа-яЁё]+(?:\s+\d{4})?)/i,
      /(?:окончание\s+размещения|срок\s+подачи)\s*[:—-]?\s*([^|•]{3,35})/i
    ], 'Срок заявки не указан');
    const term = firstMatch(text, [
      /(?:срок\s+обращения|срок\s+до\s+погашения|на\s+срок)\s*[:—-]?\s*(\d+(?:[.,]\d+)?\s+(?:месяц\w*|год\w*|дн\w*))/i,
      /погашение\s*[:—-]?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i
    ], 'Не указан');
    const minimumAmount = firstMatch(text, [
      /(?:минимальн\w*\s+(?:сумм\w*|заявк\w*)|сумма\s+от)\s*[:—-]?\s*([\d\s.,]+\s*(?:₽|руб\w*|CNY|USD|EUR|¥|\$|€))/i,
      /(?:минимальн\w*\s+(?:сумм\w*|заявк\w*))\s*[:—-]?\s*(\d[\d\s.,]*)/i
    ], 'Не указана');
    const issuer = title.replace(/^Облигации\s+/i, '').replace(/\s+(?:CNY|USD|EUR).*$/i, '').trim();
    const url = absoluteUrl(match[2]);
    const image = cardImage(match[4]);
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
      minimumAmount,
      image,
      term,
      currency: currency(text),
      deadline,
      url
    });
  }

  return cards;
}

async function renderedHtml() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    page = await browser.newPage({
      viewport: { width: 1440, height: 1400 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
    });
    await page.goto(SOURCE, { waitUntil: 'commit', timeout: 45000 }).catch(error => {
      console.warn(`DCM: переход не завершён (${error.message}), проверяю уже полученный контент`);
    });
    let cardsVisible = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await page.waitForTimeout(1500);
      const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      if (/облигаци/i.test(text) && /купон|доходност/i.test(text)) {
        cardsVisible = true;
        break;
      }
    }
    await page.evaluate(() => window.stop()).catch(() => {});
    await page.waitForTimeout(800);
    if (!cardsVisible) {
      const title = await page.title().catch(() => 'неизвестен');
      throw new Error(`карточки не появились; URL: ${page.url()}; title: ${title}`);
    }
    const grouped = await page.evaluate(() => {
      const all = [...document.body.querySelectorAll('*')];
      const index = new Map(all.map((node, i) => [node, i]));
      const normalized = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const markers = all.filter(node => {
        const text = normalized(node.textContent);
        if (node.children.length > 2) return false;
        return text === 'сейчас размещаются' || text === 'первичные размещения' ||
          text === 'по мнению аналитиков' || text === 'мнение аналитиков';
      }).map(node => ({
        position: index.get(node) || 0,
        section: /аналитик/.test(normalized(node.textContent)) ? 'analyst' : 'current'
      }));
      return [...document.querySelectorAll('a[href]')].map(anchor => {
        const text = normalized(anchor.innerText || anchor.textContent);
        if (!/облигац/.test(text) || !/купон|доходност/.test(text)) return null;
        const position = index.get(anchor) || 0;
        const preceding = markers.filter(marker => marker.position < position).sort((a, b) => b.position - a.position)[0];
        return { section: preceding?.section || 'current', html: anchor.outerHTML };
      }).filter(Boolean);
    });
    const fullHtml = await page.content();
    await fs.writeFile('dcm-debug.html', fullHtml);
    await page.screenshot({ path: 'dcm-debug.png', fullPage: true });
    if (!grouped.length) return fullHtml;
    return grouped.map(item => `<h2>${item.section === 'analyst' ? 'По мнению аналитиков' : 'Первичные размещения'}</h2>${item.html}`).join('\n');
  } catch (error) {
    if (page) {
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
      await page.screenshot({ path: 'dcm-debug.png', fullPage: true }).catch(() => {});
      const debugHtml = await page.content().catch(() => '');
      if (debugHtml) await fs.writeFile('dcm-debug.html', debugHtml).catch(() => {});
    }
    throw error;
  } finally {
    await browser.close();
  }
}

try {
  let html = '';
  try {
    const response = await fetch(SOURCE, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; funds-calculator-data/1.0)',
        accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    if (response.ok) html = await response.text();
  } catch (fetchError) {
    console.warn(`DCM: обычный запрос недоступен (${fetchError.message}), запускаю браузер`);
  }
  let placements = html ? extractCards(html) : [];
  if (placements.length < 3) {
    console.log(`DCM: статическая страница дала ${placements.length} карточек, запускаю браузер`);
    html = await renderedHtml();
    placements = extractCards(html);
  }
  if (placements.length < 3) throw new Error(`распознано только ${placements.length} размещений`);
  const payload = {updatedAt: new Date().toISOString(), source: SOURCE, placements};
  await fs.writeFile(FILE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`DCM: сохранено размещений — ${placements.length}`);
} catch (error) {
  console.error(`DCM update failed; previous dcm.json preserved: ${error.message}`);
  await fs.writeFile('dcm-debug-error.txt', String(error.stack || error)).catch(() => {});
  process.exitCode = 1;
}
