# Makefile for rebuilding frontend dist folder and updating Docker containers

# Path to the frontend directory
FRONTEND_DIR = frontend

# Build the frontend (update the dist folder)
build-frontend:
	@echo "Building the frontend..."
	cd $(FRONTEND_DIR) && rm -rf node_modules package-lock.json && npm install && npm run build
	@echo "Frontend build complete"

# Clean up docker volumes and containers
clean:
	@echo "Cleaning up Docker containers and volumes"
	docker-compose down -v
	@echo "Cleanup complete"

# Start the new containers
docker-up:
	@echo "Starting the containers "
	docker-compose up --build
	@echo "Docker containers are up and running"

# Full build
build: build-frontend clean docker-up
	@echo "Full build complete"

# .PHONY: build-frontend docker-build docker-up full-build clean
