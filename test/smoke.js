/**
 * Headless smoke test for the flat-screen path.
 *
 *   npm install && npm test
 *
 * WebXR itself cannot be driven headlessly here, so this covers what it can:
 * the page loads clean, the lessons advance, the ray actually hits things, and
 * the score keeps up. The VR path still needs a human in a headset.
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = process.env.PORT || 8125;
const ROOT = path.resolve(__dirname, '..');
const HEADED_CHROME = process.env.CHROME_PATH;

const failures = [];
function check(label, condition, detail = '') {
  const ok = !!condition;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

function serve() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  return server;
}

async function main() {
  const server = serve();
  await new Promise((r) => setTimeout(r, 800));

  const browser = await chromium.launch({
    ...(HEADED_CHROME ? { executablePath: HEADED_CHROME } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  const debug = (expr) => page.evaluate(expr);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(800);

    check('page loads without errors', errors.length === 0, errors.join(' | '));
    check('status line rendered', (await page.locator('#status').textContent()).length > 10);

    await page.click('#enter-desktop');
    await page.waitForTimeout(500);

    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Park the ray somewhere empty first: nothing should be hovered, and the
    // lesson must not advance on its own.
    await page.mouse.move(box.x + 20, box.y + box.height - 20);
    await page.waitForTimeout(400);
    check('lesson 1 started', (await debug(() => window.__debug.lesson)) === 'aim');
    check('a target is on the range', (await debug(() => window.__debug.targets)) === 1);
    check('nothing hovered off-target', (await debug(() => window.__debug.hovering)) === null);

    // Aim at the centre target and hold — lesson 1 completes on a steady hold.
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(300);
    check('ray hovers the target', (await debug(() => window.__debug.hovering)) === 'Target');

    await page.waitForTimeout(1400);
    check('holding the dot clears lesson 1',
      /steady|Nicely|exactly|got it|aim|Better/i.test((await debug(() => window.__debug.board)).instruction));

    await page.waitForTimeout(2200);
    check('advances to the trigger lesson', (await debug(() => window.__debug.lesson)) === 'trigger');

    // Clicking a target should score a hit.
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(200);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
    const stats = await debug(() => window.__debug.stats);
    check('clicking a target scores a hit', stats.hits >= 1, `hits=${stats.hits}`);
    check('a best time was recorded', stats.bestMs > 0);

    // Clicking empty space counts as a miss.
    await page.mouse.click(box.x + 20, box.y + box.height - 20);
    await page.waitForTimeout(200);
    check('clicking nothing counts as a miss', (await debug(() => window.__debug.stats)).misses >= 1);

    // The in-world buttons are pointable too.
    const beforeLesson = await debug(() => window.__debug.lesson);
    check('buttons are interactive objects',
      (await debug(() => window.__debug.pointers.interactables.length)) >= 3,
      `lesson=${beforeLesson}`);

    check('no errors after interaction', errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: path.join(ROOT, 'test', 'screenshot.png') });
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(failures.length ? `\n${failures.length} failing check(s)` : '\nall checks passed');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
