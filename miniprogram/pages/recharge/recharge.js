const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

const PLANS = [
  { amount: 100, gift: 0, times: 0 },
  { amount: 200, gift: 30, times: 0 },
  { amount: 300, gift: 60, times: 2 },
  { amount: 500, gift: 150, times: 5 },
  { amount: 1000, gift: 400, times: 12 },
];

Page({
  data: {
    plate: '',
    platePretty: '',
    memberName: '',
    balanceText: '0.00',
    plans: PLANS,
    active: 1,
    custom: '',
    monthOptions: ['不设有效期', '3 个月', '6 个月', '12 个月', '24 个月'],
    monthIndex: 3,
    payText: '0.00',
    creditText: '0.00',
    timesText: 0,
  },

  onLoad(options) {
    const plate = decodeURIComponent(options.plate || '');
    this.setData({ plate, platePretty: fmt.prettyPlate(plate) });
    this.load(plate);
    this.recalc();
  },

  onShow() {
    if (this.data.plate) this.load(this.data.plate);
  },

  async load(plate) {
    try {
      const m = await api.lookup(plate);
      if (m.exists) {
        this.setData({
          memberName: `${m.nickname} · 累计服务 ${m.totalCount} 次`,
          balanceText: fmt.money(m.balance),
        });
      } else {
        this.setData({ memberName: '未建档车牌' });
      }
    } catch (e) {}
  },

  pickPlan(e) {
    this.setData({ active: Number(e.currentTarget.dataset.index), custom: '' });
    this.recalc();
  },

  onCustom(e) {
    this.setData({ custom: e.detail.value, active: -1 });
    this.recalc();
  },

  onMonth(e) {
    this.setData({ monthIndex: Number(e.detail.value) });
  },

  recalc() {
    const { plans, active, custom } = this.data;
    let amount = 0, gift = 0, times = 0;
    if (active >= 0 && plans[active]) {
      const p = plans[active];
      amount = p.amount; gift = p.gift; times = p.times;
    } else {
      amount = Number(custom || 0);
    }
    this.setData({
      payText: fmt.money(amount),
      creditText: fmt.money(Number(amount) + Number(gift)),
      timesText: times,
    });
  },

  async submit() {
    const pay = Number(this.data.payText);
    if (!(pay > 0)) return wx.showToast({ title: '请选择或输入充值金额', icon: 'none' });
    const plan = this.data.active >= 0 ? this.data.plans[this.data.active] : { gift: 0, times: 0 };
    const monthsMap = [0, 3, 6, 12, 24];
    wx.showModal({
      title: '确认收款',
      content: `车牌 ${this.data.platePretty}\n实收 ¥${fmt.money(pay)}\n到账 ¥${this.data.creditText}\n赠送 ${plan.times || 0} 次`,
      confirmText: '已收款',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const out = await api.recharge({
            plateNo: this.data.plate,
            amount: pay,
            giftAmount: plan.gift || 0,
            times: plan.times || 0,
            months: monthsMap[this.data.monthIndex] || 0,
            operator: getApp().globalData.staffName,
          });
          wx.showToast({ title: '充值成功', icon: 'success' });
          this.setData({ balanceText: fmt.money(out.balance) });
          setTimeout(() => wx.navigateBack(), 800);
        } catch (e) {}
      },
    });
  },
});
