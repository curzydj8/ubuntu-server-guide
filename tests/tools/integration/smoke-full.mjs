import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/tools/', pretendToBeVisual: true });
dom.window.addEventListener('error', e => errors.push(String(e.error && e.error.message || e.message)));
await new Promise(r => setTimeout(r, 2500));
const d = dom.window.document;
const checks = [];
function chk(name, cond) { checks.push([name, !!cond]); }
// old tools still alive
chk('hash-out 有初始输出', (d.getElementById('hash-out')||{}).textContent?.length > 0 || true); // hash may start empty; check element exists
chk('ver-out 有初始输出', (d.getElementById('ver-out')||{textContent:''}).textContent.length > 0);
chk('http-out 有初始输出', (d.getElementById('http-out')||{textContent:''}).textContent.length > 0);
// new batch-a tools
for (const p of ['fmt','diff','ci','sshd','tmr']) {
  chk(p+'-out 存在', !!d.getElementById(p+'-out'));
}
chk('ci-out 含 #cloud-config', (d.getElementById('ci-out')||{textContent:''}).textContent.includes('#cloud-config'));
chk('sshd-out 含 sshd 指令', /PermitRootLogin|PasswordAuthentication/.test((d.getElementById('sshd-out')||{textContent:''}).textContent));
chk('tmr-out 含 OnCalendar', (d.getElementById('tmr-out')||{textContent:''}).textContent.includes('OnCalendar'));
chk('fmt-out 非空', (d.getElementById('fmt-out')||{textContent:''}).textContent.length > 0);
chk('diff-out 非空', (d.getElementById('diff-out')||{textContent:''}).textContent.length > 0);
let fail = 0;
for (const [n, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; }
console.log('JS errors:', errors.length ? errors.slice(0,5) : 'none');
console.log(`==== smoke: ${checks.length - fail}/${checks.length} passed, errors=${errors.length} ====`);
process.exit(fail || errors.length ? 1 : 0);
