from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from io import BytesIO
from netcdf_utils import *
from pathlib import Path
import numpy as np 

import pyarrow as pa
import io





##TODO Change this to CREDIT output dir
NETCDF_DIR = "./data"



app = FastAPI()



@app.get("/get_data")
def get_data():

# def get_data(netcdf_file, variable_name, timestep, level):
    ## TODO Get these from client ->
    netcdf_file = "QTUV_pred_2025-07-02T00Z_001.nc"
    variable_name = 'Q'
    timestep = 0
    level = 0
    netcdf_path = Path(NETCDF_DIR, netcdf_file)

    netcdf_data = netcdf_reader(netcdf_path)

    if variable_name == 'M':
        u = get_variable_data(netcdf_data, 'U', timestep, level) 
        v = get_variable_data(netcdf_data, 'V', timestep, level) 
        variable_data = np.sqrt(u**2 + v**2)

    else:
        variable_data = get_variable_data(
                    netcdf_data, variable_name, timestep, level) 





    #-- Send NumPy Array ------------------------------------------------------

    # arrayBuffer = io.BytesIO()
    # np.save(arrayBuffer, variable_data)
    # arrayBuffer.seek(0)

    # return StreamingResponse(
        # arrayBuffer,
        # media_type="application/octet-stream"
    # )






    #-- Send array with Apache Arrow ------------------------------------------

    # NOTE Might be able to send Zarr files directly from
        # CREDIT output to the client


    stream = io.BytesIO()

    table = pa.table({'variable_data': variable_data.flatten()})

    # Metadata for client
    ##TODO Add netcdf info later
    rows, cols = variable_data.shape

    table = table.replace_schema_metadata({
        "rows": str(rows),
        "cols": str(cols),
    })

    with pa.ipc.new_stream(stream, table.schema) as writer:
        writer.write_table(table)

    stream.seek(0)

    return StreamingResponse(
        stream, media_type="application/vnd.apache.arrow.stream")








    # m255 = normalize(m, (0, 182), (0, 255), True)
    # m8 = np.around(m255).astype(np.uint8)

    # Save the image to a BytesIO object (in memory)
    # img_byte_arr = BytesIO()
    # img.save(img_byte_arr, format="PNG")
    # img_byte_arr.seek(0)

    # Return the image in the response
    # return Response(content=img_byte_arr.read(), media_type="image/png")




