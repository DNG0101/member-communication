import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test, before, after } from 'node:test';
import { chromium } from 'playwright';

let browser, server, url;
const contexts = [];
const html = await readFile(new URL('../index.html', import.meta.url));

before(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/member/`;
  browser = await chromium.launch({headless: true});
});

after(async () => {
  await Promise.all(contexts.map(context => context.close()));
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

test('every visible application button can be activated without a page error', async () => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  contexts.push(context);
  await context.route('https://**/*', route => route.fulfill({contentType: 'application/javascript', body: ''}));
  await context.addInitScript(() => {
    window.Peer = class {
      constructor(id) { this.id = id; this.events = {}; setTimeout(() => this.emit('open', id), 0); }
      on(type, fn) { (this.events[type] ??= []).push(fn); return this; }
      emit(type, ...args) { for (const fn of this.events[type] ?? []) fn(...args); }
      reconnect() { this.emit('open', this.id); }
      destroy() { this.emit('close'); }
      call() { throw Error('media is not exercised by this control contract'); }
    };
    const nativeInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') return;
      return nativeInputClick.call(this);
    };
    window.confirm = () => true;
    document.exitFullscreen = () => Promise.resolve();
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#btn-ob-start').click();
  await page.locator('#btn-ob-next').click();
  await page.locator('#btn-ob-finish').click();
  for (const tab of await page.locator('.tn[data-tab]').evaluateAll(nodes => nodes.map(node => node.dataset.tab))) {
    await page.evaluate(() => {
      const modal = document.getElementById('ob-modal');
      if (modal) { modal.classList.remove('on'); modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none'; }
    }).catch(() => {});
    await page.locator(`.tn[data-tab="${tab}"]`).click();
    const buttons = page.locator(`#tab-${tab} button:visible`);
    for (let i = 0; i < await buttons.count(); i++) {
      await buttons.nth(i).click({noWaitAfter: true});
      try {
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
          for (const id of ['emoji-picker', 'avatar-popover', 'reaction-menu']) {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
          }
        });
        await page.evaluate(() => {
          const modal = document.getElementById('ob-modal');
          if (modal) { modal.classList.remove('on'); modal.setAttribute('aria-hidden', 'true'); modal.style.display = 'none'; }
        });
      } catch (error) {
        if (!/Execution context was destroyed|Target page, context or browser has been closed/.test(error.message)) throw error;
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      }
      await page.waitForTimeout(20);
    }
  }
  await page.waitForTimeout(250);
  assert.deepEqual(errors, []);
});
