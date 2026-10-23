import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync(process.argv[2], 'utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/tools/', pretendToBeVisual: true });
dom.window.addEventListener('error', e => errors.push(String(e.error && e.error.message || e.message)));
await new Promise(r => setTimeout(r, 2500));
const d = dom.window.document;
let pass = 0, fail = 0;
function chk(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); cond ? pass++ : fail++; }
function out(id) { const el = d.getElementById(id); return el ? el.textContent : ''; }
for (const p of ['dns','hdr','fwm']) chk(p + '-out 存在', !!d.getElementById(p + '-out'));
chk('hdr-out 非空', out('hdr-out').length > 0);
chk('fwm-out 含 ufw', out('fwm-out').includes('ufw'));
chk('dns 章节含联网标注', html.includes('DoH') || html.includes('解析商'));
chk('ngx-lb 下拉存在', !!d.getElementById('ngx-lb'));
// nginx LB interaction: enable multi, set least_conn
const multi = d.getElementById('ngx-multi');
if (multi) { multi.checked = true; multi.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
const lb = d.getElementById('ngx-lb');
if (lb) { lb.value = 'least_conn'; lb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
chk('nginx 输出含 least_conn;', out('ngx-out').includes('least_conn;'));
if (lb) { lb.value = 'ip_hash'; lb.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
chk('nginx 输出含 ip_hash; 与权重警告', out('ngx-out').includes('ip_hash;') && out('ngx-out').includes('不参与计算'));
// count sections
const heads = [...d.querySelectorAll('h2')].length;
console.log('h2 count:', heads);
console.log('JS errors:', errors.length ? errors.slice(0, 5) : 'none');
console.log(`==== smoke-d: ${pass}/${pass + fail} passed, errors=${errors.length} ====`);
process.exit(fail || errors.length ? 1 : 0);
