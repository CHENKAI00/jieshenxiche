/** 角色守卫：门店端 / 车主端互不串门 */
function isStaff() {
  const app = getApp();
  return !app || !app.globalData || app.globalData.role !== 'customer';
}

/** 门店页调用：若当前是车主身份，跳去车主首页 */
function guardStaff() {
  if (isStaff()) return true;
  wx.reLaunch({ url: '/pages/customer/home/home' });
  return false;
}

/** 车主页调用：若当前是员工身份，跳去门店首页 */
function guardCustomer() {
  const app = getApp();
  if (app && app.globalData && app.globalData.role === 'customer') return true;
  wx.reLaunch({ url: '/pages/index/index' });
  return false;
}

module.exports = { isStaff, guardStaff, guardCustomer };
