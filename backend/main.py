from fastapi import FastAPI
from fastapi.responses import Response
from io import BytesIO
from ./netcdf_reader import *



app = FastAPI()

# @app.get("/")
# def read_root():
    # return {"message": "Hello, World!"}

# Example API endpoint
# @app.get("/api/data")
# def get_data():
    # return {"data": "This is some backend data from FastAPI!"}




##TODO function to generate list of netcdf files






@app.get("/data_image")
async def get_image():


    ##TODO Replace this test netcdf with the value from date selector
    nc_file = Path("./data", "UV_pred_2025-07-02T00Z_001.nc")
    # nc_file = "UV_pred_2025-07-02T00Z_001.nc"

    uv = xr.open_dataset(nc_file)
    u = np.array(uv.U[0,0,:,:])
    v = np.array(uv.V[0,0,:,:])
    m = np.sqrt(u**2 + v**2)

    m255 = normalize(m, (0, 182), (0, 255), True)
    m8 = np.around(m255).astype(np.uint8)

    # img = c.mapdata2image(m8[::-1,:], (640, 1280), return_type='rgb')
    # img = c.mapdata2image(m8[::-1,:], (640, 1280))


    # Save the image to a BytesIO object (in memory)
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    # Return the image in the response
    return Response(content=img_byte_arr.read(), media_type="image/png")




