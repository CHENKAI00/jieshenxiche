/**
 * 当 github.com:443 被本地代理/网络卡住时的兜底推送：
 * 用 Git Data API（api.github.com 通）把本地这次提交原样搬到远程。
 * 只上传本次变更的文件，复用远程已有 tree，生成与本地一致的 tree；
 * 若作者/时间/信息完全一致，生成的 commit sha 会与本地相同。
 *
 * 用法：node scripts/push-via-api.js
 */
const { execSync } = require('child_process');

const TOKEN = process.env.GH_TOKEN || '';
const REPO = process.env.GH_REPO || 'CHENKAI00/jieshenxiche';
const API = 'https://api.github.com';
if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: {
      authorization: `token ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'jieshenxiche-deploy',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

(async () => {
  const localSha = sh('git rev-parse HEAD');
  const localTree = sh('git rev-parse HEAD^{tree}');
  const message = sh('git log -1 --pretty=%B');
  const authorName = sh('git log -1 --pretty=%an');
  const authorEmail = sh('git log -1 --pretty=%ae');
  const authorDate = sh('git log -1 --pretty=%aI');
  const committerName = sh('git log -1 --pretty=%cn');
  const committerEmail = sh('git log -1 --pretty=%ce');
  const committerDate = sh('git log -1 --pretty=%cI');

  const ref = await api(`/repos/${REPO}/git/ref/heads/main`);
  const remoteHead = ref.object.sha;
  const remoteCommit = await api(`/repos/${REPO}/git/commits/${remoteHead}`);
  console.log('远程 HEAD:', remoteHead.slice(0, 8), '| 本地 HEAD:', localSha.slice(0, 8));

  const changes = sh('git diff-tree --no-commit-id --name-status -r -z HEAD')
    .split('\0').filter(Boolean)
    .reduce((acc, v, i, arr) => { if (i % 2 === 0) acc.push({ status: v, path: arr[i + 1] }); return acc; }, []);

  const treeItems = [];
  for (const { status, path } of changes) {
    if (status === 'D') { treeItems.push({ path, mode: '100644', type: 'blob', sha: null }); continue; }
    const mode = sh(`git ls-tree HEAD "${path}"`).split(/\s+/)[0] || '100644';
    const content = require('fs').readFileSync(path).toString('base64');
    const blob = await api(`/repos/${REPO}/git/blobs`, { method: 'POST', body: { content, encoding: 'base64' } });
    treeItems.push({ path, mode, type: 'blob', sha: blob.sha });
    console.log('  blob', path, '→', blob.sha.slice(0, 8));
  }

  const tree = await api(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: { base_tree: remoteCommit.tree.sha, tree: treeItems },
  });
  console.log('远程新 tree:', tree.sha.slice(0, 8), '| 本地 tree:', localTree.slice(0, 8), tree.sha === localTree ? '✅ 内容一致' : '⚠️ 不一致');

  const commit = await api(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: {
      message,
      tree: tree.sha,
      parents: [remoteHead],
      author: { name: authorName, email: authorEmail, date: authorDate },
      committer: { name: committerName, email: committerEmail, date: committerDate },
    },
  });
  console.log('远程新 commit:', commit.sha.slice(0, 8), commit.sha === localSha ? '✅ 与本地完全一致' : '（内容一致，SHA 不同）');

  await api(`/repos/${REPO}/git/refs/heads/main`, { method: 'PATCH', body: { sha: commit.sha, force: true } });
  console.log('✅ 已更新 main →', commit.sha.slice(0, 8));

  // 让本地 origin/main 跟上（本地已有该 commit 时）
  try {
    sh(`git cat-file -e ${commit.sha}^{commit}`);
    execSync(`git update-ref refs/remotes/origin/main ${commit.sha}`, { encoding: 'utf8' });
    console.log('✅ 本地 origin/main 已对齐');
  } catch {
    console.log('ℹ️ 本地暂无该 commit 对象，等网络恢复后 git fetch 对齐即可（文件内容已一致）');
  }
})().catch((e) => { console.error('推送失败:', e.message); process.exit(1); });
