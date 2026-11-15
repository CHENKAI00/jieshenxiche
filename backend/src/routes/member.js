const express = require('express');
const svc = require('../services/member');

const router = express.Router();

/** GET /api/v1/member?keyword=&page=&size=  会员列表（搜索车牌/姓名/手机/卡号） */
router.get('/', async (req, res, next) => {
  try {
    const data = await svc.listMembers(req.query);
    res.json({ ok: true, ...data });
  } catch (e) { next(e); }
});

/** GET /api/v1/member/:plate  拍照识别后或手输车牌后的会员详情 */
router.get('/:plate', async (req, res, next) => {
  try {
    const data = await svc.getMemberView(req.params.plate);
    res.json({ ok: true, ...data });
  } catch (e) { next(e); }
});

/** POST /api/v1/member  会员建档 {plateNo,nickname,phone,level,remark} */
router.post('/', async (req, res, next) => {
  try {
    const data = await svc.createMember(req.body || {});
    res.status(data.created ? 201 : 200).json({ ok: true, ...data });
  } catch (e) { next(e); }
});

/** POST /api/v1/member/:plate/points  积分兑换 {points,item} */
router.post('/:plate/points', async (req, res, next) => {
  try {
    const data = await svc.usePoints({ plateNo: req.params.plate, ...req.body });
    res.json({ ok: true, ...data });
  } catch (e) { next(e); }
});

module.exports = router;
