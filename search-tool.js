/**
 * search-tool.js — Stealth search via Playwright Headless Chromium or CDP fallback
 * Zero tokens, no API keys, concurrent multi-engine scraping (Google + Bing + DuckDuckGo).
 * Usage: node search-tool.js "<query>" [limit]
 */
let playwright;
try {
    playwright = require('playwright-core');
} catch (e) {
    try {
        playwright = require('/usr/local/lib/node_modules/openclaw/node_modules/playwright-core');
    } catch (err) {
        try {
            const path = require('path');
            playwright = require(path.join(process.cwd(), 'node_modules', 'playwright-core'));
        } catch (x) {
            console.error(JSON.stringify({ error: 'Playwright not found! Install it or run within OpenClaw environment.' }));
            process.exit(1);
        }
    }
}
const { chromium } = playwright;

let query = process.argv[2];
// Auto-heal query encoding if wrongly decoded as Latin1 instead of UTF-8
if (query) {
    try {
        if (/[\u0080-\u00FF]/.test(query)) {
            const healed = Buffer.from(query, 'latin1').toString('utf8');
            if (healed !== query && !healed.includes('\uFFFD')) {
                query = healed;
            }
        }
    } catch (e) {}
}

let optimizedQuery = query;
// Optimize query for consumer goods pricing to prevent Bing's autocorrect-to-gold-rates bug
if (query && /giá|mua|bán|thuê|tuyển/i.test(query) && /xe|máy|honda|yamaha|sh|mode|vision|wave|ab|airblade|exciter|vespa|điện\s*thoại|iphone|samsung|oppo|xiaomi|laptop|dell|hp|asus|macbook|nhà|đất|chung\s*cư|phòng/i.test(query)) {
    optimizedQuery = query.replace(/\b(hôm\s+nay|mới\s+nhất|hiện\s+nay|nay)\b/gi, '').trim().replace(/\s+/g, ' ');
}

const limit = parseInt(process.argv[3]) || 5;
const CDP_URL = 'http://127.0.0.1:9222';

if (!query) {
    console.error(JSON.stringify({ error: 'Usage: node search-tool.js "<query>" [limit]' }));
    process.exit(1);
}

(async () => {
    let browser;
    let ctx;
    let isStandalone = false;
    try {
        // Try connecting to active Chrome CDP first
        try {
            browser = await chromium.connectOverCDP(CDP_URL, { timeout: 3000 });
            ctx = browser.contexts()[0];
        } catch (e) {
            // Fallback to standalone headless Chromium launch
            browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled'
                ]
            });
            isStandalone = true;
            ctx = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                locale: 'vi-VN',
                geolocation: { longitude: 105.8342, latitude: 21.0278 },
                permissions: ['geolocation']
            });
        }

        // Run search queries concurrently on three search engines
        const [googleResults, bingResults, ddgResults] = await Promise.all([
            // Google
            (async () => {
                const page = await ctx.newPage();
                try {
                    await page.goto('https://www.google.com/search?q=' + encodeURIComponent(optimizedQuery) + '&hl=vi&gl=vn', { waitUntil: 'domcontentloaded', timeout: 5000 });
                    const res = await page.evaluate(() => {
                        const list = [];
                        const links = Array.from(document.querySelectorAll('a h3'));
                        for (const head of links) {
                            const a = head.closest('a');
                            if (!a) continue;
                            const url = a.href;
                            const title = head.textContent || '';
                            let snippet = '';
                            let parent = a.parentElement;
                            while (parent && parent.tagName !== 'DIV') {
                                parent = parent.parentElement;
                            }
                            if (parent) {
                                const descEl = parent.parentElement?.querySelector('.VwiC3b, .yHGvwa, div[style*="-webkit-line-clamp"]');
                                if (descEl) {
                                    snippet = descEl.textContent || '';
                                } else {
                                    const texts = Array.from(parent.parentElement?.querySelectorAll('div, span') || [])
                                        .map(el => el.textContent.trim())
                                        .filter(txt => txt.length > 30 && !txt.includes(title));
                                    if (texts.length > 0) snippet = texts[0];
                                }
                            }
                            if (url && title) {
                                list.push({ title, url, snippet });
                            }
                        }
                        return list;
                    });
                    await page.close();
                    return res;
                } catch (e) {
                    if (page) await page.close();
                    return [];
                }
            })(),

            // Bing
            (async () => {
                const page = await ctx.newPage();
                try {
                    await page.goto('https://www.bing.com/search?q=' + encodeURIComponent(optimizedQuery) + '&setlang=vi&cc=VN', { waitUntil: 'domcontentloaded', timeout: 5000 });
                    const res = await page.evaluate(() => {
                        const list = [];
                        const items = document.querySelectorAll('li.b_algo');
                        for (const item of items) {
                            const titleEl = item.querySelector('h2 a');
                            if (!titleEl) continue;
                            const title = titleEl.textContent || '';
                            const url = titleEl.href;
                            let snippet = '';
                            const snippetEl = item.querySelector('.b_caption p, .b_snippet, p');
                            if (snippetEl) {
                                snippet = snippetEl.textContent || '';
                            }
                            if (url && title) {
                                list.push({ title, url, snippet });
                            }
                        }
                        return list;
                    });
                    await page.close();
                    return res;
                } catch (e) {
                    if (page) await page.close();
                    return [];
                }
            })(),

            // DuckDuckGo
            (async () => {
                const page = await ctx.newPage();
                try {
                    await page.goto('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(optimizedQuery) + '&kl=vn-vi', { waitUntil: 'domcontentloaded', timeout: 5000 });
                    const res = await page.evaluate(() => {
                        const list = [];
                        const elements = document.querySelectorAll('.result');
                        for (const el of elements) {
                            const titleEl = el.querySelector('.result__title a');
                            const snippetEl = el.querySelector('.result__snippet');
                            if (titleEl) {
                                list.push({
                                    title: titleEl.textContent.trim(),
                                    url: titleEl.href,
                                    snippet: snippetEl ? snippetEl.textContent.trim() : ''
                                });
                            }
                        }
                        return list;
                    });
                    await page.close();
                    return res;
                } catch (e) {
                    if (page) await page.close();
                    return [];
                }
            })()
        ]);

        // Deduplicate results by normalized URL
        const allResults = [...googleResults, ...bingResults, ...ddgResults];
        const uniqueResults = [];
        const seenUrls = new Set();
        for (const res of allResults) {
            if (!res.url || !res.title) continue;
            let normUrl = res.url.replace(/^(https?:\/\/)?(www\.)?/, '').toLowerCase();
            if (normUrl.endsWith('/')) normUrl = normUrl.slice(0, -1);
            if (!seenUrls.has(normUrl)) {
                seenUrls.add(normUrl);
                uniqueResults.push(res);
            }
        }

        // Score results to prioritize numeric price data for financial queries
        const isPriceQuery = /giá|vàng|đô|usd|sjc|sh|hôm nay|price|gold|rate|vnd|xe|vnđ/i.test(query);
        const scoredResults = uniqueResults.map(res => {
            let score = 0;
            // Base length score
            score += Math.min(res.snippet.length / 50, 5);

            if (isPriceQuery) {
                // Number density check
                const numCount = (res.snippet.match(/\d+/g) || []).length;
                score += Math.min(numCount * 2, 10);

                // Priority keywords boost
                if (/lượng|chỉ|triệu|nghìn|vnd|usd|sjc|xe|bán|mua|giá/i.test(res.snippet)) {
                    score += 8;
                }
            }
            return { ...res, score };
        });

        // Sort by score desc
        scoredResults.sort((a, b) => b.score - a.score);

        // Map back to output format and limit
        const output = scoredResults.map(({ score, ...rest }) => rest).slice(0, limit);
        console.log(JSON.stringify(output, null, 2));

    } catch (err) {
        console.error(JSON.stringify({ error: err.message }));
    } finally {
        if (browser && isStandalone) {
            try {
                await browser.close();
            } catch(e) {}
        }
    }
})();
