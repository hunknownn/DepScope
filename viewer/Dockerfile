# syntax=docker/dockerfile:1.7

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY viewer/package.json viewer/package-lock.json ./
RUN npm ci

COPY viewer/ ./
RUN npm run build

# ---- runtime stage ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY viewer/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
