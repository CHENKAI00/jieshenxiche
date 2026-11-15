const api = require('../../utils/api');
const { guardStaff } = require('../../utils/role');
const fmt = require('../../utils/fmt');

Page({
  data: {
    plate: '',
    stat: {},
    recent: [],
    staffName: '前台',
  },

  onShow() {
    if (!guardStaff()) return;
    const app = getApp();
    this.setData({ staffName: app.globalData.staffName || '前台' });
    this.refresh();
  },

  async refresh() {
    try {
      const [stat, recent] = await Promise.all([api.overview(), api.recent(6)]);
      stat.balanceSum = fmt.money(stat.balanceSum);
      this.setData({
        stat,
        recent: (recent.list || []).map((r) => ({
          ...r,
          agoText: fmt.timeAgo(r.lastServiceAt),
          tagClass: fmt.serviceTag(r.lastItem),
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
  goMembers() { wx.navigateTo({ url: '/pages/records/records' }); },
  goCatalog() { wx.switchTab({ url: '/pages/catalog/catalog' }); },

  openMember(e) {
    const plate = e.currentTarget.dataset.plate;
    wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(plate)}` });
  },

});
