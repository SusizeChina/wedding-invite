const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const deploy = fs.readFileSync(path.join(root, 'deploy.js'), 'utf8').replace(/main\(\);\s*$/, '');
const context = { require, __dirname: root, console, process };
vm.createContext(context);
vm.runInContext(deploy, context);

test('HTML compression preserves script, style, pre and textarea contents', () => {
  const script = `<script>const a = 1\nconst b = 2\nconst url = 'https://example.com'\nconst regex = /\\/\\//\nconst text = \`first  line\nsecond line\`\n/* keep <!-- text --> */</script>`;
  const blocks = [script, '<style>/* comment */ .x { color: red; }</style>', '<pre>one  two\nthree</pre>', '<textarea>one  two\nthree</textarea>'];
  const output = context.minifyHTML('<html>\n<!-- remove -->\n' + blocks.join('\n') + '\n</html>');
  for (const block of blocks) assert(output.includes(block));
  assert(!output.includes('<!-- remove -->'));
  new vm.Script(context.minifyJS(script.slice(8, -9)));
});

test('all scripts in the production build have valid syntax', () => {
  const html = fs.readFileSync(path.join(root, 'dist/index-wed.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).map(m => m[1]).filter(s => s.trim());
  assert(scripts.length >= 3);
  for (const script of scripts) new vm.Script(script);
  assert(html.includes(fs.readFileSync(path.join(root, 'wx_cloud.js'), 'utf8').trim()));
});

test('built like script binds clicks, updates UI and batches database writes', async () => {
  const html = fs.readFileSync(path.join(root, 'dist/index-wed.html'), 'utf8');
  const script = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).find(m => m[1].includes('WX_RESOURCE_APPID'))[1];
  const handlers = {};
  const classes = new Set();
  const button = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) }, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const count = {};
  const hearts = [];
  const elements = { 'like-btn': button, 'like-count': count, 'like-hearts-wrap': { appendChild: el => hearts.push(el) }, 'like-section': {} };
  const writes = [];
  const timers = new Map();
  let timerId = 0;
  const db = {
    command: { inc: n => ({ increment: n }) },
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'likes', total: 10 }] }) }) }),
      doc: id => ({ update: async value => { writes.push({ id, value }); } })
    })
  };
  const browser = {
    console, window: {},
    localStorage: { getItem: () => null, setItem() {} },
    cloud: { Cloud: function () { this.init = async () => {}; this.database = () => db; } },
    document: {
      readyState: 'complete', getElementById: id => elements[id],
      createElement: () => ({ style: { setProperty() {} }, addEventListener() {} })
    },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(script, browser);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(count.textContent, '10');
  handlers.click();
  handlers.click();
  assert.equal(count.textContent, '12');
  assert(classes.has('liked'));
  assert.equal(hearts.length, 2);
  assert.equal(timers.size, 1);
  for (const fn of timers.values()) fn();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'likes');
  assert.equal(writes[0].value.data.total.increment, 2);
});
