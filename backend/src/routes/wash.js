const express = require('express');
const svc = require('../services/member');

const router = express.Router();

/** POST /api/v1/wash/consume  洗车核销 {plateNo,itemId,usePackage,operator,note} */
router.post('/consume', async (req, res, next) => {
  try {
    const data = await svc.consume(req.body || {});
    res.json({ ok: true, ...data });
  } catch (e) { next(e); }
});

/** POST /api/v1/wash/recharge  充值/买套餐 {plateNo,amount,giftAmount,times,packageName,months,level} */
router.post('/recharge', async (req, res, next) => {
  try {
    const data = await svc.recharge({ ...(req.body || {}) });
    res.json({ ok: true, ...data });
  } catch (e) { next(e); }
});

module.exports = router;
