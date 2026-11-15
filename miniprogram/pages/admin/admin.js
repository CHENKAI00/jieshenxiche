const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

Page({
  data: {
    stat: {},
    recent: [],
    health: { db: '—', ocr: '—' },
    plate: '',
    quickMember: null,
    quickBalance: '0.00',
    services: [],
  },

  onShow() {
    this.refresh();
    this.checkHealth();
    this.loadMeta();
  },

  async loadMeta() {
    try {
      const meta = await api.meta();
      this.setData({ services: meta.services || [] });
    } catch (e) {}
  },

  async checkHealth() {
    const h = await api.health();
    this.setData({ health: { db: h.db || 'down', ocr: h.ocr || '—' } });
  },

  async refresh() {
    try {
      const [stat, recent] = await Promise.all([api.overview(), api.recent(12)]);
      stat.balanceSum = fmt.money(stat.balanceSum);
      this.setData({
        stat,
        recent: (recent.list || []).map((r) => ({
          ...r,
          agoText: fmt.timeAgo(r.lastServiceAt),
          tagClass: fmt.serviceTag(r.lastItem),
        })),
      });
    } catch (e) {}
  },

  onPlate(e) {
    this.setData({ plate: (e.detail.value || '').toUpperCase() });
  },

  async quickLookup() {
    const p = (this.data.plate || '').replace(/[·\s]/g, '').toUpperCase();
    if (p.length < 7) return wx.showToast({ title: '车牌至少 7 位', icon: 'none' });
    try {
      const m = await api.lookup(p);
      this.setData({ quickMember: m, quickBalance: fmt.money(m.balance) });
    } catch (e) {}
  },

  openConsume() {
    const services = this.data.services;
    if (!services.length) return wx.showToast({ title: '价目表未加载', icon: 'none' });
    const m = this.data.quickMember;
    if (!m || !m.exists) return;
    wx.showActionSheet({
      itemList: services.map((s) => `${s.name} ¥${s.price}`),
      success: (res) => {
        const svc = services[res.tapIndex];
        const useCount = m.remainCount > 0 && !m.expireWarn;
        const price = Number(svc.price);
        wx.showModal({
          title: '确认核销',
          content: `${m.platePretty}\n${svc.name}\n${useCount ? '扣次数 1 次（剩 ' + m.remainCount + '）' : '余额支付 ¥' + price.toFixed(2)}`,
          success: async (r) => {
            if (!r.confirm) return;
            try {
              const out = await api.consume({ plateNo: m.plateNo, serviceId: svc.id, useCount, operator: getApp().globalData.staffName });
              this.setData({ quickMember: out.member, quickBalance: fmt.money(out.balance) });
              this.refresh();
            } catch (e) {}
          },
        });
      },
    });
  },

  goCreate() {
    const p = (this.data.plate || '').toUpperCase();
    wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(p)}&create=1` });
  },

  openMember(e) {
    const plate = e.currentTarget.dataset.plate;
    if (plate) wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(plate)}` });
  },
});
