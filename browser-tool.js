/**
 * browser-tool.js v2 — Full-featured Chrome CDP controller
 * Commands: open|get_url|get_text|get_links|get_posts|evaluate|console|screenshot|screenshot_full|pdf|click|fill|press|hover|select|upload|scroll|wait|resize|tabs|new_tab|switch_tab|close_tab|status
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
            console.error('[Browser] Playwright not found!');
            process.exit(1);
        }
    }
}
const { chromium } = playwright;

const action = process.argv[2];
const param1 = process.argv[3];
const param2 = process.argv[4];
const dns = require('dns').promises;
const DEFAULT_CDP_URLS = [
    'host-gateway:9222',
    'http://127.0.0.1:9222',
];
const CDP_URLS = (process.env.OPENCLAW_BROWSER_CDP_URLS || DEFAULT_CDP_URLS.join(','))
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

async function normalizeCdpUrl(url) {
    if (url === 'host-gateway:9222') {
        try {
            const resolved = await dns.lookup('host.docker.internal');
            return 'http://' + resolved.address + ':9222';
        } catch (_) {
            return 'http://host.docker.internal:9222';
        }
    }
    return url;
}

async function connectPreferredChrome() {
    let lastError;
    for (const rawUrl of CDP_URLS) {
        const url = await normalizeCdpUrl(rawUrl);
        try {
            const connected = await chromium.connectOverCDP(url, { timeout: 2500 });
            console.error('[Browser] Connected CDP: ' + url);
            return connected;
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('No Chrome CDP endpoint available');
}

(async () => {
    let browser;
    try {
        browser = await connectPreferredChrome();
        const ctx = browser.contexts()[0];
        const pages = ctx.pages();
        let page = pages.length > 0 ? pages[0] : await ctx.newPage();

        if (action === 'open') {
            console.log('[Browser] Opening: ' + param1);
            await page.goto(param1, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(1500);
            console.log('[Browser] Opened: ' + (await page.title()) + ' | ' + page.url());
        } else if (action === 'get_url') {
            console.log(page.url());
        } else if (action === 'status') {
            const allPages = ctx.pages();
            console.log('[Browser] Connected! Tabs: ' + allPages.length);
            console.log('[Browser] Current: ' + (await page.title()) + ' | ' + page.url());
        } else if (action === 'get_text') {
            const maxLen = parseInt(param1) || 4000;
            const text = await page.evaluate(() => { 
                document.querySelectorAll('script,style,noscript,svg').forEach(e => e.remove()); 
                return document.body.innerText.trim(); 
            });
            console.log(text.substring(0, maxLen));
        } else if (action === 'get_links') {
            const filter = param1 || '';
            const links = await page.evaluate((f) => { 
                const a = Array.from(document.querySelectorAll('a[href]')).map(e => e.href).filter(h => h && h.startsWith('http')); 
                return [...new Set(f ? a.filter(h => h.includes(f)) : a)]; 
            }, filter);
            console.log(JSON.stringify(links.slice(0, 50), null, 2));
        } else if (action === 'get_posts') {
            const posts = await page.evaluate(() => {
                const results = [];
                const articles = document.querySelectorAll('[role="article"]');
                for (const article of articles) {
                    const allLinks = Array.from(article.querySelectorAll('a[href]'));
                    let permalink = '';
                    for (const a of allLinks) { 
                        const h = a.href || ''; 
                        if (h.includes('/posts/') || h.includes('/permalink/') || h.includes('story_fbid')) { 
                            permalink = h.split('?')[0]; 
                            break; 
                        } 
                    }
                    
                    let author = '';
                    // 1. Try first to find links representing the author
                    const authorCandidateLinks = Array.from(article.querySelectorAll('h2 a[role="link"], h3 a[role="link"], h4 a[role="link"], a[role="link"] strong, a[role="link"] > span'));
                    for (const el of authorCandidateLinks) {
                        const n = el.innerText.trim();
                        if (n && n.length > 1 && n.length < 50 && !n.includes('·') && !n.includes('Group') && !n.includes('nhóm')) {
                            author = n;
                            break;
                        }
                    }
                    // 2. If not found, check headings h2/h3/h4/role="heading" directly (e.g. anonymous posts)
                    if (!author) {
                        const headings = Array.from(article.querySelectorAll('h2, h3, h4, [role="heading"]'));
                        for (const h of headings) {
                            const spans = Array.from(h.querySelectorAll('span'));
                            const textSource = spans.length > 0 ? spans[0] : h;
                            const n = textSource.innerText.trim();
                            if (n && n.length > 1 && n.length < 50 && !n.includes('·') && !n.includes('Group') && !n.includes('nhóm')) {
                                author = n;
                                break;
                            }
                        }
                    }

                    let textEl = article.querySelector('[data-ad-comet-preview="message"],[data-ad-preview="message"]');
                    if (!textEl) {
                        // Look for a div/span with dir="auto" that is outside headings, links, and buttons
                        const dirAutoEls = Array.from(article.querySelectorAll('[dir="auto"]'));
                        for (const el of dirAutoEls) {
                            if (el.closest('h2, h3, h4, [role="heading"], a, button')) continue;
                            if (el.innerText.trim().length > 10) {
                                textEl = el;
                                break;
                            }
                        }
                    }

                    let fullText = '';
                    if (textEl) {
                        fullText = textEl.innerText.trim();
                    } else {
                        // Fallback to article innerText but clean up the header
                        const rawText = article.innerText.trim();
                        fullText = rawText;
                        if (author && author !== 'N/A' && rawText.startsWith(author)) {
                            const lines = rawText.split('\n');
                            let contentStartIdx = 1;
                            while (contentStartIdx < lines.length) {
                                const line = lines[contentStartIdx].trim();
                                if (line.length === 0 || line.includes('·') || line.length < 15) {
                                    contentStartIdx++;
                                } else {
                                    break;
                                }
                            }
                            fullText = lines.slice(contentStartIdx).join('\n').trim() || rawText;
                        }
                    }

                    let timePosted = '';
                    const timeLinks = allLinks.filter(a => { 
                        const h = a.href || ''; 
                        return h.includes('/posts/') || h.includes('/permalink/'); 
                    });
                    if (timeLinks.length > 0) { 
                        const t = timeLinks[0].innerText.trim(); 
                        if (t && t.length < 30) timePosted = t; 
                    }
                    if (!timePosted) { 
                        const te = article.querySelector('abbr,[data-utime]'); 
                        if (te) timePosted = te.innerText.trim() || te.getAttribute('title') || ''; 
                    }
                    if (fullText.length > 20) {
                        results.push({ 
                            author: author || 'N/A', 
                            text: fullText.substring(0, 500), 
                            permalink: permalink || 'N/A', 
                            time: timePosted || 'N/A' 
                        });
                    }
                }
                return results;
            });
            console.log(posts.length === 0 ? '[Browser] No posts found. Try scroll then get_posts again.' : JSON.stringify(posts.slice(0, 10), null, 2));
        } else if (action === 'evaluate') {
            const code = process.argv.slice(3).join(' ');
            if (!code) { console.log('[Browser] Usage: evaluate <js_code>'); process.exit(1); }
            const result = await page.evaluate(code);
            console.log(result !== undefined && result !== null ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)) : '[Browser] Done');
        } else if (action === 'console') {
            const msgs = []; 
            page.on('console', m => msgs.push('[' + m.type() + '] ' + m.text()));
            await page.waitForTimeout(2000);
            console.log(msgs.length === 0 ? '[Browser] No console messages in 2s' : msgs.join('\n'));
        } else if (action === 'screenshot') {
            const p = param1 || '/tmp/screenshot.png'; 
            await page.screenshot({ path: p, fullPage: false }); 
            console.log('[Browser] Screenshot: ' + p);
        } else if (action === 'screenshot_full') {
            const p = param1 || '/tmp/screenshot_full.png'; 
            await page.screenshot({ path: p, fullPage: true }); 
            console.log('[Browser] Full screenshot: ' + p);
        } else if (action === 'pdf') {
            const p = param1 || '/tmp/page.pdf'; 
            await page.pdf({ path: p, format: 'A4' }); 
            console.log('[Browser] PDF: ' + p);
        } else if (action === 'click') {
            await page.locator(param1).first().click({ timeout: 5000 }); 
            await page.waitForTimeout(600); 
            console.log('[Browser] Clicked: ' + param1);
        } else if (action === 'fill') {
            await page.locator(param1).first().fill(param2, { timeout: 5000 }); 
            console.log('[Browser] Filled: ' + param1);
        } else if (action === 'press') {
            await page.keyboard.press(param1); 
            await page.waitForTimeout(1000); 
            console.log('[Browser] Pressed: ' + param1);
        } else if (action === 'hover') {
            await page.locator(param1).first().hover({ timeout: 5000 }); 
            console.log('[Browser] Hovered: ' + param1);
        } else if (action === 'select') {
            await page.locator(param1).first().selectOption(param2, { timeout: 5000 }); 
            console.log('[Browser] Selected: ' + param2);
        } else if (action === 'upload') {
            await page.locator(param1).first().setInputFiles(param2, { timeout: 5000 }); 
            console.log('[Browser] Uploaded: ' + param2);
        } else if (action === 'scroll') {
            const px = parseInt(param1) || 800; 
            await page.evaluate((p) => window.scrollBy(0, p), px); 
            await page.waitForTimeout(2000); 
            console.log('[Browser] Scrolled: ' + px + 'px');
        } else if (action === 'wait') {
            const ms = parseInt(param1) || 1000; 
            await page.waitForTimeout(ms); 
            console.log('[Browser] Waited: ' + ms + 'ms');
        } else if (action === 'resize') {
            const w = parseInt(param1) || 1280, h = parseInt(param2) || 720; 
            await page.setViewportSize({ width: w, height: h }); 
            console.log('[Browser] Resized: ' + w + 'x' + h);
        } else if (action === 'tabs') {
            const ap = ctx.pages(); 
            for (let i = 0; i < ap.length; i++) { 
                const t = await ap[i].title().catch(() => '(untitled)'); 
                console.log('[' + i + '] ' + t + ' | ' + ap[i].url() + (ap[i] === page ? ' < current' : '')); 
            }
        } else if (action === 'new_tab') {
            const np = await ctx.newPage(); 
            if (param1) await np.goto(param1, { waitUntil: 'domcontentloaded', timeout: 30000 }); 
            console.log('[Browser] New tab' + (param1 ? ': ' + param1 : ''));
        } else if (action === 'switch_tab') {
            const idx = parseInt(param1), ap = ctx.pages(); 
            if (isNaN(idx) || idx < 0 || idx >= ap.length) { 
                console.log('[Browser] Invalid index. Use tabs to list.'); 
            } else { 
                page = ap[idx]; 
                await page.bringToFront(); 
                console.log('[Browser] Switched to [' + idx + ']: ' + page.url()); 
            }
        } else if (action === 'close_tab') {
            const ap = ctx.pages(), idx = param1 !== undefined ? parseInt(param1) : ap.indexOf(page); 
            if (ap.length <= 1) { 
                console.log('[Browser] Cannot close last tab.'); 
            } else if (isNaN(idx) || idx < 0 || idx >= ap.length) { 
                console.log('[Browser] Invalid index.'); 
            } else { 
                await ap[idx].close(); 
                console.log('[Browser] Closed tab [' + idx + ']'); 
            }
        } else {
            console.log('browser-tool.js v2 — Commands:');
            console.log('  Nav:      open <url> | get_url | status');
            console.log('  Content:  get_text [max] | get_links [filter] | get_posts | evaluate <js> | console');
            console.log('  Export:   screenshot [path] | screenshot_full [path] | pdf [path]');
            console.log('  Interact: click <sel> | fill <sel> <txt> | press <key> | hover <sel> | select <sel> <val> | upload <sel> <path>');
            console.log('  View:     scroll [px] | wait <ms> | resize <w> <h>');
            console.log('  Tabs:     tabs | new_tab [url] | switch_tab <idx> | close_tab [idx]');
        }
    } catch(e) {
        if (e.message.includes('ECONNREFUSED') || e.message.includes('Timeout')) {
            console.error('[Browser] Chrome Debug not running! Start with --remote-debugging-port=9222');
        } else { 
            console.error('[Browser] Error:', e.message); 
        }
    } finally { 
        if (browser) {
            try {
                await browser.close();
            } catch(x) {}
        }
    }
})();
