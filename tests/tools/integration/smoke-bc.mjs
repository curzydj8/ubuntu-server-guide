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
// batch B outputs
for (const p of ['diag','csrev','disk','bk','re','env']) chk(p + '-out 存在', !!d.getElementById(p + '-out'));
chk('disk-out 含预计/天', /天|已满|警戒/.test(out('disk-out')));
chk('bk-out 含 RPO', out('bk-out').includes('RPO'));
chk('env-out 非空', out('env-out').length > 0);
// batch C outputs
for (const p of ['gha','plan','log','apt','mig','curl','sshlog','git','explain']) chk(p + '-out 存在', !!d.getElementById(p + '-out'));
chk('gha-out 含 workflow 关键行', /jobs:|runs-on/.test(out('gha-out')));
chk('curl-out 含 curl', out('curl-out').includes('curl'));
chk('mig-out 含 回滚', out('mig-out').includes('回滚'));
chk('explain-out 非空', out('explain-out').length > 0);
// interactive spot checks
const reIn = d.getElementById('re-pattern'), reTxt = d.getElementById('re-text');
if (reIn && reTxt) { reIn.value = '\\d+'; reTxt.value = 'abc123'; reIn.dispatchEvent(new dom.window.Event('input', { bubbles: true })); chk('re 交互：匹配到 123', out('re-out').includes('123')); }
const exIn = d.getElementById('explain-in');
if (exIn) { exIn.value = 'rm -rf /tmp/x'; exIn.dispatchEvent(new dom.window.Event('input', { bubbles: true })); chk('explain 交互：rm -rf 标风险', /⚠|高风险|危险/.test(out('explain-out'))); }
console.log('JS errors:', errors.length ? errors.slice(0, 5) : 'none');
console.log(`==== smoke-bc: ${pass}/${pass + fail} passed, errors=${errors.length} ====`);
process.exit(fail || errors.length ? 1 : 0);
