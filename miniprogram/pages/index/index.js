const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

Page({
  data: {
    plate: '',
    stat: {},
    recent: [],
    staffName: '前台',
  },

  onShow() {
    const app = getApp();
    this.setData({ staffName: app.globalData.staffName || '前台' });
    this.refresh();
  },

  async refresh() {
    try {
      const [stat, recent] = await Promise.all([api.overview(), api.recent(6)]);
      stat.todayIncome = fmt.money(stat.todayIncome);
      stat.balanceSum = fmt.money(stat.balanceSum);
      this.setData({
        stat,
        recent: (recent.list || []).map((r) => ({
          ...r,
          amountText: fmt.money(r.amount),
          typeText: fmt.typeText(r.type),
        })),
      });
    } catch (e) { /* 错误已在 api 层提示 */ }
  },

  onPlateInput(e) {
    this.setData({ plate: (e.detail.value || '').toUpperCase() });
  },

  lookupManual() {
    const plate = (this.data.plate || '').trim().toUpperCase().replace(/[·\s]/g, '');
    if (plate.length < 7) return wx.showToast({ title: '车牌至少 7 位', icon: 'none' });
    wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(plate)}` });
  },

  goScan() { wx.switchTab({ url: '/pages/scan/scan' }); },
  goAdmin() { wx.switchTab({ url: '/pages/admin/admin' }); },
  goMembers() { wx.navigateTo({ url: '/pages/records/records?mode=members' }); },

  openMember(e) {
    const plate = e.currentTarget.dataset.plate;
    wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(plate)}` });
  },

  async showPrice() {
    try {
      const meta = await api.meta();
      const lines = meta.items.map((i) => `${i.name}  ¥${i.price}`).join('\n');
      wx.showModal({ title: '洗车价目表', content: lines, showCancel: false });
    } catch (e) {}
  },
});
