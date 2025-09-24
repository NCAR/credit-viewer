To test locally with Docker:

* Ensure Docker Desktop is running

* Build the frontend and run the docker container using the Makefile
> make build

* In a browser, visit localhost:80 or just localhost


To test locally without Docker:

* Start the backend
> cd backend
> uvicorn main:app --reload
# Server is running at http://127.0.0.1:8000

* In a separate terminal, run the frontend in dev mode
> cd frontend
> npm run dev
# In a browser, go to http://127.0.0.1:5173

