/**
 * 运行期配置
 *
 * cloud.enabled = true → 所有接口走 wx.cloud.callContainer（不需要备案域名、不需要 request 合法域名）
 * cloud.env 留空时使用小程序绑定的默认云开发/云托管环境；环境不止一个时再填环境 ID。
 */
module.exports = {
  cloud: {
    enabled: true,
    env: '',                 // 只有一个环境时可以留空
    service: 'jieshen-proxy',// 云托管服务名
  },
};
