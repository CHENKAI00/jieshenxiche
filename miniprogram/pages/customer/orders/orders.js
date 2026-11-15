const api = require('../../../utils/api');
const { guardCustomer } = require('../../../utils/role');

const STEP = { pending: 0, confirmed: 1, serving: 2, done: 3 };
const TAG = { pending: 'warning', confirmed: 'primary', serving: 'primary', done: 'success', cancelled: 'default' };
const HINT = {
  pending: '等待门店确认，一般 10 分钟内',
  confirmed: '已确认，按时到店即可',
  serving: '正在服务中',
  done: '服务已完成，欢迎再来',
  cancelled: '已取消',
};

function dateText(d) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00+08:00`);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  return `${dt.getMonth() + 1}月${dt.getDate()}日 ${week}`;
}

Page({
  data: {
    tab: 0, all: [], list: [], loaded: false,
    stepLabels: [{ text: '预约提交' }, { text: '门店确认' }, { text: '到店服务' }, { text: '已完成' }],
  },

  onShow() {
    if (!guardCustomer()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const d = await api.myBookings();
      const all = (d.list || []).map((b) => ({
        ...b,
        price: Number(b.price).toFixed(0),
        dateText: dateText(b.date),
        platePretty: b.plateNo ? `${b.plateNo.slice(0, 2)}·${b.plateNo.slice(2)}` : '—',
        step: STEP[b.status] === undefined ? 0 : STEP[b.status],
        tagType: TAG[b.status] || 'default',
        plain: b.status !== 'serving',
        hint: HINT[b.status] || '',
        canCancel: b.status === 'pending' || b.status === 'confirmed',
      }));
      this.setData({ all, list: this.filter(all, this.data.tab), loaded: true });
    } catch (e) {
      this.setData({ loaded: true });
    }
  },

  filter(all, tab) {
    if (tab === 1) return all;
    return all.filter((b) => ['pending', 'confirmed', 'serving'].includes(b.status));
  },

  onTab(e) {
    const tab = Number(e.detail.index || 0);
    this.setData({ tab, list: this.filter(this.data.all, tab) });
  },

  cancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消预约',
      content: '确定取消这次预约吗？',
      confirmColor: '#d9463a',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.cancelBooking(id);
          wx.showToast({ title: '已取消', icon: 'success' });
          this.load();
        } catch (err) {}
      },
    });
  },

  rebook(e) {
    const item = this.data.all[Number(e.currentTarget.dataset.index)];
    wx.navigateTo({ url: `/pages/customer/booking/booking?serviceId=${item.serviceId}` });
  },

  goBooking() {
    wx.reLaunch({ url: '/pages/customer/booking/booking' });
  },
});
