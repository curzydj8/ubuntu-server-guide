// 阶段 B / P0-1 专项测试矩阵：Netplan + UFW（构建后页面，jsdom 驱动）
// 用法：node test-p0-1.mjs <built tools/index.html path>
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { execFileSync } from 'child_process';

const html = fs.readFileSync(process.argv[2], 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/tools/', pretendToBeVisual: true });
await new Promise(r => setTimeout(r, 2000));
const d = dom.window.document;
const results = [];
function rec(id, name, cond, actual) { results.push({ id, name, pass: !!cond, actual: String(actual || '').slice(0, 120) }); }
function setVal(id, v) { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
function setSel(id, v) { const el = d.getElementById(id); el.value = v; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }
function errVisible(id) { const e = d.getElementById(id); return e && e.style.display !== 'none' && e.textContent.length > 0; }
function errText(id) { const e = d.getElementById(id); return e ? e.textContent : ''; }
function outText(id) { const e = d.getElementById(id); return e ? e.textContent : ''; }
function yamlCheck(yamlText) {
  fs.writeFileSync('/tmp/np-test.yaml', yamlText);
  try {
    const out = execFileSync('python3', ['-c', `
import yaml, json, sys
doc = yaml.safe_load(open('/tmp/np-test.yaml'))
eth = doc['network']['ethernets']
iface = list(eth.keys())[0]
body = eth[iface]
print(json.dumps({'iface': iface, 'addresses': body.get('addresses'), 'dhcp4': body.get('dhcp4'), 'routes': body.get('routes'), 'ns': (body.get('nameservers') or {}).get('addresses')}))
`], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) { return { error: String(e).slice(0, 200) }; }
}

/* ============ UFW ============ */
// U1 默认生成：SSH 放行在首位
rec('U1', 'UFW 默认：输出含 SSH 放行与 enable 步骤', outText('ufw-out').includes("sudo ufw allow 22/tcp") && outText('ufw-out').includes('ufw --force enable'), outText('ufw-out').split('\n')[1]);
// U2 IPv4 来源
setVal('ufw-src', '192.0.2.100');
rec('U2', 'UFW IPv4 来源：from 192.0.2.100', !errVisible('ufw-err') && outText('ufw-out').includes('allow from 192.0.2.100 to any port 22'), outText('ufw-out').split('\n').find(l => l.includes('from')));
// U3 IPv4 CIDR
setVal('ufw-src', '10.0.0.0/8');
rec('U3', 'UFW IPv4 CIDR 来源', !errVisible('ufw-err') && outText('ufw-out').includes('allow from 10.0.0.0/8'), '');
// U4 IPv6 来源（本批新增）
setVal('ufw-src', '2001:db8::1');
rec('U4', 'UFW IPv6 来源：from 2001:db8::1 且无错误', !errVisible('ufw-err') && outText('ufw-out').includes('allow from 2001:db8::1 to any port 22'), errText('ufw-err'));
// U5 IPv6 CIDR（本批新增）
setVal('ufw-src', '2001:db8::/32');
rec('U5', 'UFW IPv6 CIDR 来源', !errVisible('ufw-err') && outText('ufw-out').includes('allow from 2001:db8::/32'), errText('ufw-err'));
// U6 IPv6 前缀越界
setVal('ufw-src', '2001:db8::/129');
rec('U6', 'UFW IPv6 前缀 /129 被拒', errVisible('ufw-err') && errText('ufw-err').includes('0–128') && outText('ufw-out').includes('请先修正'), errText('ufw-err'));
// U7 IPv6 非法格式
setVal('ufw-src', '2001:::1');
rec('U7', 'UFW IPv6 非法格式 2001:::1 被拒', errVisible('ufw-err'), errText('ufw-err'));
setVal('ufw-src', 'gggg::1');
rec('U7b', 'UFW IPv6 非法字符 gggg::1 被拒', errVisible('ufw-err'), errText('ufw-err'));
// U8 注入组
for (const [tag, payload] of [['分号', '1.2.3.4; rm -rf /'], ['命令替换', '$(reboot)'], ['反引号', '`id`'], ['引号', "1.2.3.4'"], ['空格', '1.2.3.4 5.6.7.8'], ['换行', '1.2.3.4\nMalicious']]) {
  setVal('ufw-src', payload);
  rec('U8-' + tag, 'UFW 注入拒绝（' + tag + '）', errVisible('ufw-err') && !outText('ufw-out').includes('rm -rf') && !outText('ufw-out').includes('reboot'), errText('ufw-err'));
}
// U9 SSH 端口边界
setVal('ufw-src', '');
setVal('ufw-ssh-port', '0');
rec('U9a', 'UFW SSH 端口 0 被拒', errVisible('ufw-err'), errText('ufw-err'));
setVal('ufw-ssh-port', '65536');
rec('U9b', 'UFW SSH 端口 65536 被拒', errVisible('ufw-err'), errText('ufw-err'));
setVal('ufw-ssh-port', '65535');
rec('U9c', 'UFW SSH 端口 65535 通过', !errVisible('ufw-err') && outText('ufw-out').includes('65535'), '');
setVal('ufw-ssh-port', 'abc');
rec('U9d', 'UFW SSH 端口非数字被拒', errVisible('ufw-err'), errText('ufw-err'));
setVal('ufw-ssh-port', '22');
// U10 自定义端口范围
setVal('ufw-port', '8000:8010');
rec('U10a', 'UFW 端口范围 8000:8010 通过', !errVisible('ufw-err') && outText('ufw-out').includes('8000:8010'), '');
setVal('ufw-port', '8010:8000');
rec('U10b', 'UFW 端口范围倒置被拒', errVisible('ufw-err'), errText('ufw-err'));
setVal('ufw-port', '8000:70000');
rec('U10c', 'UFW 端口范围越界被拒', errVisible('ufw-err'), errText('ufw-err'));
setVal('ufw-port', '');

/* ============ Netplan ============ */
// N1 默认（普通服务器静态）：YAML 结构断言
let y = yamlCheck(outText('np-out'));
rec('N1', 'Netplan 默认 YAML 可解析且 addresses 为列表含 192.0.2.10/24', !y.error && Array.isArray(y.addresses) && y.addresses.includes('192.0.2.10/24'), JSON.stringify(y));
rec('N1b', 'Netplan 默认 routes 含网关 192.0.2.1、DNS 为列表', !y.error && JSON.stringify(y.routes).includes('192.0.2.1') && Array.isArray(y.ns), JSON.stringify(y));
// N2 DHCP 模式
setSel('np-mode', 'dhcp');
y = yamlCheck(outText('np-out'));
rec('N2', 'Netplan DHCP 模式：dhcp4=true 且无 addresses', !y.error && y.dhcp4 === true && (y.addresses === null || y.addresses === undefined), JSON.stringify(y));
// N3 双栈
setSel('np-mode', 'dual');
y = yamlCheck(outText('np-out'));
rec('N3', 'Netplan 双栈：addresses 含 v4 与 v6、routes 双网关', !y.error && y.addresses.includes('192.0.2.10/24') && y.addresses.includes('2001:db8::10/64') && JSON.stringify(y.routes).includes('2001:db8::1'), JSON.stringify(y));
setSel('np-mode', 'static');
// N4 空接口名
setVal('np-iface', '');
rec('N4', 'Netplan 空接口名被拒且输出无配置', errVisible('np-err') && !outText('np-out').includes('network:'), errText('np-err'));
setVal('np-iface', 'eth0');
// N5 接口名注入
setVal('np-iface', 'eth0;rm -rf');
rec('N5', 'Netplan 接口名注入被拒', errVisible('np-err'), errText('np-err'));
setVal('np-iface', 'eth0');
// N6 前缀越界
setVal('np-ip', '192.0.2.10/33');
rec('N6', 'Netplan IPv4 前缀 /33 被拒', errVisible('np-err') && !outText('np-out').includes('network:'), errText('np-err'));
// N7 网关不同族
setVal('np-ip', '192.0.2.10/24');
setVal('np-gw', '2001:db8::1');
rec('N7', 'Netplan 网关不同族被拒', errVisible('np-err') && errText('np-err').includes('不同族'), errText('np-err'));
setVal('np-gw', '192.0.2.1');
// N8 DNS 非法条目
setVal('np-dns', '192.0.2.53, not-an-ip');
rec('N8', 'Netplan DNS 非法条目被拒', errVisible('np-err'), errText('np-err'));
setVal('np-dns', '192.0.2.53');
// N9 静态模式空 IP
setVal('np-ip', '');
rec('N9', 'Netplan 静态模式空 IP 被拒', errVisible('np-err'), errText('np-err'));
setVal('np-ip', '192.0.2.10/24');

/* ============ F-1 回归（子网计算器跨族文案） ============ */
setSel('sub-family', 'v6');
setVal('sub-ip', 'not-an-ip');
const f1ErrShown = errVisible('sub-err');
setSel('sub-family', 'v4');
setVal('sub-ip', '192.0.2.10');
rec('F1', 'F-1 回归：v6 报错后切回 v4 合法输入，err 隐藏', f1ErrShown && !errVisible('sub-err'), 'v6err=' + f1ErrShown);

let fail = 0;
for (const r of results) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id + ' ' + r.name + (r.pass ? '' : ' | actual: ' + r.actual)); if (!r.pass) fail++; }
console.log(`==== P0-1 matrix: ${results.length - fail}/${results.length} passed ====`);
process.exit(fail ? 1 : 0);
