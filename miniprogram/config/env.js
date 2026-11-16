/**
 * 运行期配置（改这里不用改业务代码）
 *
 * cloud.enabled = true 时，小程序用 wx.cloud.callContainer 直连云托管，
 * **不需要**在小程序后台配置 request 合法域名 —— 这是体验版/正式版
 * 在「没有备案域名」时唯一能用的官方通道。
 */
module.exports = {
  cloud: {
    enabled: false,          // 填好 env 后改成 true
    env: '',                 // 云托管环境 ID，形如 prod-8gxxxxxx / jieshen-prod-xxxx
    service: 'jieshen-proxy',// 云托管服务名（部署时填的那个）
  },
};
