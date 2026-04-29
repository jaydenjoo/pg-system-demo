FROM nginx:1.27-alpine

RUN mkdir -p /etc/nginx/ssl

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-check-certificate -qO- https://127.0.0.1/api/v1/health || exit 1
