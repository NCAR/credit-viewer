from fastapi import FastAPI
from fastapi.responses import Response
from pathlib import Path
from io import BytesIO
from PIL import Image
import xarray as xr



app = FastAPI()

# @app.get("/")
# def read_root():
    # return {"message": "Hello, World!"}

# Example API endpoint
# @app.get("/api/data")
# def get_data():
    # return {"data": "This is some backend data from FastAPI!"}





@app.get("/data_image") ##TODO add variable arg, min/max
async def get_image():

    ##TODO separate netcdf reading, image creation to module(s)


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




