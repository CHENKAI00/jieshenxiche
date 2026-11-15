const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

Page({
  data: {
    mode: 'flow',
    plate: '',
    platePretty: '',
    member: {},
    balanceText: '0.00',
    records: [],
    keyword: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
  },

  onLoad(options) {
    if (options.mode === 'members') {
      this.setData({ mode: 'members' });
      wx.setNavigationBarTitle({ title: '会员名录' });
      this.doSearch();
      return;
    }
    const plate = decodeURIComponent(options.plate || '');
    this.setData({ plate, platePretty: fmt.prettyPlate(plate) });
    wx.setNavigationBarTitle({ title: '会员流水' });
    this.loadFlow(plate);
  },

  async loadFlow(plate) {
    try {
      const m = await api.lookup(plate);
      this.setData({
        member: m,
        balanceText: fmt.money(m.balance),
        records: (m.records || []).map((r) => ({
          ...r, amountText: fmt.money(r.amount), balanceText: fmt.money(r.balanceAfter),
        })),
      });
    } catch (e) {}
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  doSearch() {
    this.setData({ page: 1, list: [] });
    this.fetchList(1);
  },

  loadMore() {
    this.fetchList(this.data.page + 1);
  },

  async fetchList(page) {
    try {
      const r = await api.listMembers(this.data.keyword, page, 20);
      const mapped = (r.list || []).map((m) => ({ ...m, balanceText: fmt.money(m.balance) }));
      const list = page === 1 ? mapped : this.data.list.concat(mapped);
      this.setData({
        list,
        total: r.total,
        page,
        hasMore: list.length < r.total,
      });
    } catch (e) {}
  },

  openMember(e) {
    const plate = e.currentTarget.dataset.plate;
    wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(plate)}` });
  },
});
