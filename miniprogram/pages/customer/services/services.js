const api = require('../../../utils/api');
const fmt = require('../../../utils/fmt');
const { guardCustomer } = require('../../../utils/role');

Page({
  data: { all: [], list: [], tags: [], activeTag: '' },

  onShow() {
    if (!guardCustomer()) return;
    this.load();
  },

  async load() {
    try {
      const d = await api.customerServices();
      const all = (d.services || []).map((s) => ({
        ...s,
        imageUrl: api.absUrl(s.image),
        phClass: s.tag === '洗车' ? 'wash' : 'beauty',
      }));
      this.setData({ all, tags: d.tags || [], list: this.filter(all, this.data.activeTag) });
    } catch (e) {}
  },

  filter(all, tag) {
    return tag ? all.filter((s) => s.tag === tag) : all;
  },

  pickTag(e) {
    const tag = e.currentTarget.dataset.tag || '';
    this.setData({ activeTag: tag, list: this.filter(this.data.all, tag) });
  },

  detail(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.all.find((x) => x.id === id);
    if (!s) return;
    wx.showModal({
      title: `${s.name} ¥${fmt.money(s.price)}`,
      content: `${s.desc || ''}\n\n约 ${s.mins} 分钟\n\n到店后把车牌报给前台即可核销次数或余额支付。`,
      confirmText: '知道了',
      showCancel: false,
    });
  },
});
