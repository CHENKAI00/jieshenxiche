/**
 * 把 MySQL 里的会员数据搬到「微信云开发数据库」
 *   npm run migrate:cloud -- --dry     # 只看会搬多少条
 *   npm run migrate:cloud             # 真搬（按 plate_no 幂等 upsert）
 *
 * 需要环境变量：TCB_ENV / TCB_SECRET_ID / TCB_SECRET_KEY（腾讯云 API 密钥）
 * 集合名默认 js_member；手机号仍是密文，密钥不变，搬到云端照样能解。
 */
const tcb = require('@cloudbase/node-sdk');
const cfg = require('../src/config');
const { pool } = require('../src/db');

const DRY = process.argv.includes('--dry');
const COLL = cfg.cloudDb.collection || 'js_member';

async function main() {
  if (!cfg.cloudDb.env) throw new Error('缺少 TCB_ENV（云开发环境 ID）');

  const app = tcb.init({
    env: cfg.cloudDb.env,
    secretId: cfg.cloudDb.secretId || undefined,
    secretKey: cfg.cloudDb.secretKey || undefined,
  });
  const db = app.database();
  const c = db.collection(COLL);

  const [rows] = await pool.query('SELECT * FROM `js_member`');
  console.log(`源库 ${rows.length} 条，目标集合 ${COLL}，模式 ${DRY ? 'dry-run' : '写入'}`);

  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const { id, ...rest } = r;
    const doc = {
      ...rest,
      balance: Number(rest.balance || 0),
      remain_count: Number(rest.remain_count || 0),
      wash_count: Number(rest.wash_count || 0),
      wax_count: Number(rest.wax_count || 0),
      expire_at: rest.expire_at || null,
      last_service_at: rest.last_service_at || null,
      last_item: rest.last_item || null,
      status: rest.status == null ? 1 : rest.status,
      created_at: rest.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const found = await c.where({ plate_no: doc.plate_no }).limit(1).get();
    const hit = (found.data || [])[0];
    if (DRY) {
      hit ? updated++ : created++;
      continue;
    }
    if (hit) {
      await c.doc(hit._id).update(doc);
      updated++;
    } else {
      await c.add(doc);
      created++;
    }
  }
  console.log(`完成：新增 ${created}，更新 ${updated}`);
  if (!DRY) {
    console.log('提示：把 .env 改成 DB_DRIVER=cloud 并重启服务即可切库（MySQL 原数据保留不删）');
  }
  await pool.end();
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
