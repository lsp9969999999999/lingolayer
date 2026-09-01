const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));
const content = fs.readFileSync(path.resolve(__dirname, '../src/content.js'), 'utf8');
const popup = fs.readFileSync(path.resolve(__dirname, '../src/popup.js'), 'utf8');

const checks = [
  ['内容脚本只注入顶层页面', manifest.content_scripts?.[0]?.all_frames === false],
  ['内容脚本不再使用永久轮询检测路由', !/setInterval\(\(\) => \{[\s\S]*location\.href/.test(content)],
  ['路由监听覆盖 pushState', /history\.pushState/.test(content)],
  ['路由监听覆盖 popstate', /addEventListener\('popstate'/.test(content)],
  ['弹窗关闭时清理状态轮询', /clearInterval\(statusTimer\)/.test(popup)],
  ['空 opacity 不会被误判隐藏', /st\.opacity !== '' && Number\(st\.opacity\) === 0/.test(content)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name);
  if (!ok) failed++;
}
console.log('\n性能策略检查: ' + (failed ? failed + ' 项失败' : '全部通过'));
process.exit(failed ? 1 : 0);
