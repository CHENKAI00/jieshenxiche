const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

const LEVEL_NAMES = ['普通会员（无折扣）', '银卡会员（95折）', '金卡会员（9折）', '钻石会员（85折）'];

Page({
  data: {
    plate: '',
    platePretty: '',
    member: {},
    balanceText: '0.00',
    discountText: '',
    records: [],
    loaded: false,
    items: [],
    levelNames: LEVEL_NAMES,
    levelIndex: 0,
    form: { plateNo: '', nickname: '', phone: '', level: 1, remark: '' },
  },

  onLoad(options) {
    const plate = decodeURIComponent(options.plate || '');
    this.setData({ plate, platePretty: fmt.prettyPlate(plate), 'form.plateNo': plate });
    this.load(plate, options.create === '1');
    this.loadMeta();
  },

  async loadMeta() {
    try {
      const meta = await api.meta();
      this.setData({ items: meta.items || [] });
    } catch (e) {}
  },

  async load(plate, forceCreate) {
    try {
      const m = await api.lookup(plate || this.data.plate);
      if (!m.exists) {
        this.setData({ member: { ...m, exists: false }, records: [], loaded: true, form: { ...this.data.form, plateNo: m.plateNo } });
        return;
      }
      this.setData({
        member: m,
        balanceText: fmt.money(m.balance),
        discountText: m.discount === 1 ? '无折扣' : (m.discount * 10).toFixed(1) + ' 折',
        records: (m.records || []).map((r) => ({ ...r, amountText: fmt.money(r.amount) })),
        levelIndex: Math.max(0, Number(m.level) - 1),
        loaded: true,
      });
    } catch (e) {
      if (forceCreate) this.setData({ member: { exists: false } });
    }
  },

  onForm(e) {
    const k = e.currentTarget.dataset.k;
    let v = e.detail.value;
    if (k === 'plateNo') v = String(v || '').toUpperCase();
    this.setData({ [`form.${k}`]: v });
  },

  onLevel(e) {
    this.setData({ levelIndex: Number(e.detail.value), 'form.level': Number(e.detail.value) + 1 });
  },

  async submitCreate() {
    const f = this.data.form;
    if (!f.plateNo || f.plateNo.length < 7) return wx.showToast({ title: '请填写完整车牌', icon: 'none' });
    try {
      const r = await api.createMember({
        plateNo: f.plateNo,
        nickname: f.nickname || '车主',
        phone: f.phone,
        level: f.level || 1,
        remark: f.remark,
      });
      wx.showToast({ title: r.created ? '建档成功' : '该车牌已有档案', icon: 'success' });
      this.setData({ plate: r.plateNo, platePretty: r.platePretty });
      this.load(r.plateNo);
    } catch (e) {}
  },

  /** 洗车核销：选项目 → 调用后端 */
  openWash() {
    const items = this.data.items;
    if (!items.length) return wx.showToast({ title: '价目表加载失败', icon: 'none' });
    wx.showActionSheet({
      itemList: items.map((i) => `${i.name} ¥${i.price}`),
      success: (res) => this.doConsume(items[res.tapIndex]),
    });
  },

  doConsume(item) {
    const m = this.data.member;
    const usePackage = m.packageLeft > 0 && !m.expireWarn;
    const price = Math.round(item.price * (m.discount || 1) * 100) / 100;
    wx.showModal({
      title: '确认核销',
      content: `项目：${item.name}\n本次：${usePackage ? '扣套餐 1 次（剩 ' + m.packageLeft + ' 次）' : '余额支付 ¥' + price.toFixed(2)}\n核销后余额：${usePackage ? '¥' + fmt.money(m.balance) : '¥' + fmt.money(m.balance - price)}`,
      confirmText: '确认核销',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          const out = await api.consume({ plateNo: m.plateNo, itemId: item.id, usePackage, operator: getApp().globalData.staffName });
          wx.showToast({ title: '核销成功', icon: 'success' });
          this.load(m.plateNo);
          if (out.record) {
            wx.showModal({
              title: '核销完成',
              content: `${out.item} · ${out.payType}\n积分 +${out.record.points}\n套餐剩余 ${out.packageLeft} 次`,
              showCancel: false,
            });
          }
        } catch (e) {}
      },
    });
  },

  openPoints() {
    const m = this.data.member;
    wx.showModal({
      title: '积分兑换',
      editable: true,
      placeholderText: `当前 ${m.points} 分，输入要兑换的积分数`,
      success: async (r) => {
        if (!r.confirm) return;
        const p = Number(r.content);
        if (!(p > 0)) return wx.showToast({ title: '请输入正确积分', icon: 'none' });
        try {
          const out = await api.points(m.plateNo, { points: p, item: `积分兑换${p}分礼品` });
          wx.showToast({ title: '兑换成功', icon: 'success' });
          this.load(m.plateNo);
        } catch (e) {}
      },
    });
  },

  goRecharge() {
    wx.navigateTo({ url: `/pages/recharge/recharge?plate=${encodeURIComponent(this.data.member.plateNo)}` });
  },

  goRecords() {
    wx.navigateTo({ url: `/pages/records/records?plate=${encodeURIComponent(this.data.member.plateNo)}` });
  },

  callOwner() {
    const phone = this.data.member.phoneRaw;
    if (!phone) return wx.showToast({ title: '未登记手机号', icon: 'none' });
    wx.makePhoneCall({ phoneNumber: phone });
  },
});
