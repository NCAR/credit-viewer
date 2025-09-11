# frontend/Dockerfile

# Use the official Node.js image as a base
FROM node:latest

# Set the working directory in the container
WORKDIR /frontend

# Install dependencies
COPY ./package.json ./package-lock.json /frontend/
RUN npm install

# Copy the Vite app source code
COPY . /frontend

# Build the Vite app
RUN npm run build

# Set up the static folder (Vite build output)
# RUN cp -r /frontend/dist /usr/share/nginx/html

# Expose the NGINX port
EXPOSE 80
