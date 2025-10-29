To test locally with Docker:

* Ensure Docker Desktop is running
> docker compose up --build                                              
* Connect to- http://localhost:8080/  



To push containers to DockerHub:

credit-viewer> docker compose up --build
> docker tag credit-viewer-backend <username>/credit-viewer-backend:v1
> docker push <username>/credit-viewer-backend:v1
> docker tag credit-viewer-nginx <username>/credit-viewer-nginx:v1
> docker push <username>/credit-viewer-nginx:v1


