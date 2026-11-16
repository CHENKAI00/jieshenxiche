# 极简 https 入口：nginx 反代到已有后端（微信云托管 / 腾讯云 CloudBase Run 通用）
FROM nginx:1.27-alpine

# 上游后端地址（换服务器时改这里重新部署即可）
ENV BACKEND=http://27.124.46.63:8099

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
