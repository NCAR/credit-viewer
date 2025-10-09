
# Stage 1: build frontend with Vite
FROM node:latest AS build-frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: serve with nginx
FROM nginx
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /app/dist /usr/share/nginx/html

