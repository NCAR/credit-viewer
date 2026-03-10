# Stage 1: build frontend with Vite
FROM node:18-alpine AS build-frontend
# FROM node:latest AS build-frontend
WORKDIR /app
COPY frontend/ ./frontend
WORKDIR /app/frontend
RUN npm ci
RUN npm run build

# Stage 2: serve with nginx
FROM nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
