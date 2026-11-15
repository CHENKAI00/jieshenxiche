const api = require('../../utils/api');
const fmt = require('../../utils/fmt');

Page({
  data: {
    keyword: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '会员名录' });
    this.fetchList(1);
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
      const mapped = (r.list || []).map((m) => ({
        ...m,
        balanceText: fmt.money(m.balance),
        agoText: m.lastServiceAt ? fmt.timeAgo(m.lastServiceAt) : '未到店',
      }));
      const list = page === 1 ? mapped : this.data.list.concat(mapped);
      this.setData({ list, total: r.total, page, hasMore: list.length < r.total });
    } catch (e) {}
  },

  openMember(e) {
    const plate = e.currentTarget.dataset.plate;
    wx.navigateTo({ url: `/pages/member/member?plate=${encodeURIComponent(plate)}` });
  },
});
