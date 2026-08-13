import { chromium } from 'playwright';
const APP='http://localhost:5173', SLUG='kazanchis-office-interiors';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1500,height:1000} });
await p.goto(`${APP}/login`);
await p.waitForSelector('input[type="email"]',{timeout:20000});
await p.fill('input[type="email"]','sabonawaktole17@gmail.com');
await p.fill('input[type="password"]','S@b0n@W@');
await p.click('button[type="submit"]');
await p.waitForTimeout(4500);
await p.goto(`${APP}/${SLUG}/settings/categories`);
await p.waitForTimeout(4000);
const shot='C:/Users/sebon/AppData/Local/Temp/claude/d--nevacrm/ac27807e-4da7-4bc2-a52e-925104295214/scratchpad/';
// Main sidebar nav items are the proof the app shell is present.
const main = await p.$$eval('nav a, aside a, aside button', els=>els.map(e=>e.innerText.trim()).filter(Boolean));
console.log('URL:', p.url());
console.log('shell items:', JSON.stringify([...new Set(main)].slice(0,16)));
await p.screenshot({path: shot+'categories-fixed.png'});
await b.close();
