import xarray as xr
from pathlib import Path
import numpy as np






def list_netcdf_files():
    netcdf_dir = Path(NETCDF_DIR)
    return sorted(list(netcdf_dir.glob("*.nc")))



def netcdf_reader(netcdf_path):
    return xr.open_dataset(netcdf_path)



def get_variable_data(netcdf_data, variable_name, timestep, level):
    variable = getattr(netcdf_data, variable_name)
    return np.array(variable[timestep,level,:,:])


