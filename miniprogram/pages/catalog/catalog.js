const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

Page({
  data: {
    tags: [],
    list: [],
    all: [],
    activeTag: '',
    sheet: null,
    plate: '',
    member: null,
    useCount: true,
    afterBalance: '0.00',
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const [meta] = await Promise.all([api.meta()]);
      const all = (meta.services || []).map((s) => ({
        ...s,
        imageUrl: api.absUrl(s.image),
        priceText: fmt.money(s.price),
        // WXSS 选择器只能用 ASCII，中文分类映射成 wash / beauty
        phClass: s.tag === '洗车' ? 'wash' : 'beauty',
      }));
      this.setData({ all, tags: meta.tags || [], list: this.filter(all, this.data.activeTag) });
    } catch (e) {}
  },

  filter(all, tag) {
    return tag ? all.filter((s) => s.tag === tag) : all;
  },

  pickTag(e) {
    const tag = e.currentTarget.dataset.tag || '';
    this.setData({ activeTag: tag, list: this.filter(this.data.all, tag) });
  },

  chooseService(e) {
    const id = e.currentTarget.dataset.id;
    const svc = this.data.all.find((s) => s.id === id);
    if (!svc) return;
    this.setData({ sheet: svc, member: null, plate: '', useCount: true, afterBalance: fmt.money(svc.price) });
  },

  closeSheet() {
    this.setData({ sheet: null, member: null, plate: '' });
  },

  noop() {},

  onPlate(e) {
    this.setData({ plate: (e.detail.value || '').toUpperCase() });
  },

  async lookup() {
    const p = (this.data.plate || '').replace(/[·\s]/g, '').toUpperCase();
    if (p.length < 7) return wx.showToast({ title: '车牌至少 7 位', icon: 'none' });
    try {
      const m = await api.lookup(p);
      if (!m.exists) {
        wx.showModal({
          title: '未建档',
          content: `${m.platePretty} 还没有会员档案，先建档再核销？`,
          confirmText: '去建档',
          success: (r) => {
            if (r.confirm) wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(m.plateNo)}&create=1` });
          },
        });
        return;
      }
      const useCount = m.remainCount > 0 && !m.expireWarn;
      this.setData({
        member: { ...m, balanceText: fmt.money(m.balance) },
        useCount,
        afterBalance: fmt.money(m.balance - Number(this.data.sheet.price)),
      });
    } catch (e) {}
  },

  setPay(e) {
    const v = e.currentTarget.dataset.v === '1';
    this.setData({
      useCount: v,
      afterBalance: fmt.money(this.data.member.balance - Number(this.data.sheet.price)),
    });
  },

  async submit() {
    const { sheet, member, useCount } = this.data;
    if (!sheet || !member) return;
    try {
      const out = await api.consume({
        plateNo: member.plateNo,
        serviceId: sheet.id,
        useCount,
        operator: getApp().globalData.staffName,
      });
      wx.showToast({ title: '核销成功', icon: 'success' });
      wx.showModal({
        title: '核销完成',
        content: `${out.service}\n${out.payType === '次数' ? '扣次数 1 次' : '余额支付 ¥' + fmt.money(out.amount)}\n剩余 ${out.remainCount} 次 · 洗车 ${out.washCount} 次 / 打蜡 ${out.waxCount} 次\n余额 ¥${fmt.money(out.balance)}`,
        showCancel: false,
      });
      const m = await api.lookup(member.plateNo);
      this.setData({
        member: { ...m, balanceText: fmt.money(m.balance) },
        useCount: m.remainCount > 0 && !m.expireWarn,
        afterBalance: fmt.money(m.balance - Number(sheet.price)),
      });
    } catch (e) {}
  },
});
