/**
 * 精简 miniprogram_npm/@vant/weapp：只保留页面真正用到的组件及其依赖
 * 用法：node scripts/prune-vant.js
 *
 * 依赖解析：usingComponents + require() + wxs src + @import
 * 输出：替换 miniprogram/miniprogram_npm/@vant/weapp（只留可达文件）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const VANT_SRC = path.join(MP, 'node_modules', '@vant', 'weapp', 'dist');
const VANT_OUT = path.join(MP, 'miniprogram_npm', '@vant', 'weapp');

if (!fs.existsSync(VANT_SRC)) {
  console.error('找不到源目录:', VANT_SRC);
  process.exit(1);
}

const keep = new Set(); // 相对 VANT_SRC 的文件路径

function addFile(rel) {
  const abs = path.join(VANT_SRC, rel);
  if (!fs.existsSync(abs) || keep.has(rel)) return;
  keep.add(rel);
  const ext = path.extname(rel);
  if (ext === '.js') scanJs(abs);
  else if (ext === '.wxml') scanWxml(abs);
  else if (ext === '.wxss') scanWxss(abs);
  else if (ext === '.json') scanJson(abs, path.dirname(rel));
}

function addComponentDir(relDir) {
  const idx = path.join(VANT_SRC, relDir, 'index.js');
  if (!fs.existsSync(idx)) return;
  for (const f of ['index.js', 'index.json', 'index.wxml', 'index.wxss']) {
    const rel = path.posix.join(relDir, f);
    if (fs.existsSync(path.join(VANT_SRC, rel))) addFile(rel);
  }
}

function resolveRelative(fromDirAbs, target) {
  // target 可能带 .js/.wxml 等后缀，或指向目录
  const base = path.resolve(fromDirAbs, target);
  const rel = path.relative(VANT_SRC, base).split(path.sep).join('/');
  return rel;
}

function scanJs(abs) {
  const src = fs.readFileSync(abs, 'utf8');
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const p = m[1];
    if (!p.startsWith('.')) continue; // 只处理包内相对引用
    const rel = resolveRelative(path.dirname(abs), p);
    // 补 .js
    const cand = rel.endsWith('.js') ? rel : `${rel}.js`;
    if (fs.existsSync(path.join(VANT_SRC, cand))) addFile(cand);
    else if (fs.existsSync(path.join(VANT_SRC, rel, 'index.js'))) addComponentDir(rel);
  }
}

function scanWxml(abs) {
  const src = fs.readFileSync(abs, 'utf8');
  // <wxs src="../wxs/utils.wxs" />
  const reWxs = /src="([^"]+\.wxs)"/g;
  let m;
  while ((m = reWxs.exec(src))) {
    const rel = resolveRelative(path.dirname(abs), m[1]);
    if (fs.existsSync(path.join(VANT_SRC, rel))) addFile(rel);
  }
  // <import src="..."/> / <include src="..."/>
  const reImp = /<(?:import|include)[^>]*src="([^"]+)"/g;
  while ((m = reImp.exec(src))) {
    const rel = resolveRelative(path.dirname(abs), m[1]);
    if (fs.existsSync(path.join(VANT_SRC, rel))) addFile(rel);
  }
}

function scanWxss(abs) {
  const src = fs.readFileSync(abs, 'utf8');
  const re = /@import\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const rel = resolveRelative(path.dirname(abs), m[1]);
    if (fs.existsSync(path.join(VANT_SRC, rel))) addFile(rel);
  }
}

function scanJson(abs, dirRel) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return; }
  const uc = j.usingComponents || {};
  for (const v of Object.values(uc)) {
    if (!v.startsWith('.')) continue;
    const target = path.resolve(path.dirname(abs), v);
    const relDir = path.relative(VANT_SRC, target).split(path.sep).join('/').replace(/\/index$/, '');
    addComponentDir(relDir);
  }
}

/** 1. 从项目里找出所有 vant 入口组件 */
const entries = new Set();
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const abs = path.join(dir, f);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (f === 'node_modules' || f === 'miniprogram_npm' || f === '.git') continue;
      walk(abs);
    } else if (f.endsWith('.json')) {
      try {
        const j = JSON.parse(fs.readFileSync(abs, 'utf8'));
        for (const v of Object.values(j.usingComponents || {})) {
          const m = String(v).match(/@vant\/weapp\/([a-z0-9-]+)\/index/);
          if (m) entries.add(`/${m[1]}`);
        }
      } catch { /* ignore */ }
    }
  }
})(MP);

if (!entries.size) { console.error('没有找到 vant 组件引用'); process.exit(1); }

for (const e of entries) addComponentDir(e);
// 共享基础设施（组件内部 require 会再展开）
for (const extra of ['/common', '/wxs', '/mixins', '/utils']) {
  const dir = path.join(VANT_SRC, extra.slice(1));
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const rel = `${extra.slice(1)}/${f}`;
    if (fs.statSync(path.join(VANT_SRC, rel)).isFile()) addFile(rel);
  }
}

/** 2. 复制到输出目录 */
fs.rmSync(VANT_OUT, { recursive: true, force: true });
let bytes = 0;
for (const rel of keep) {
  const dst = path.join(VANT_OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(VANT_SRC, rel), dst);
  bytes += fs.statSync(dst).size;
}
// package.json 保留（开发者工具识别包）
const pkg = path.join(VANT_SRC, '..', 'package.json');
if (fs.existsSync(pkg)) fs.copyFileSync(pkg, path.join(VANT_OUT, 'package.json'));

const dirs = [...new Set([...keep].map((r) => r.split('/')[0]))].filter((d) => d !== 'index.');
console.log('保留组件:', dirs.sort().join(', '));
console.log(`文件数 ${keep.size}，体积 ${(bytes / 1024).toFixed(0)} KB`);
