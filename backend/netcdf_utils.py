import xarray as xr
from pathlib import Path




##TODO Change this to CREDIT output dir
NETCDF_DIR = "./data"




def list_netcdf_files():
    netcdf_dir = Path(NETCDF_DIR)
    return sorted(list(netcdf_dir.glob("*.nc")))



def netcdf_reader(netcdf_path):
    return xr.open_dataset(netcdf_path)



def variable_data(netcdf_file, variable_name, timestep, level)
    return np.array(netcdf_file.variable_name[timestep, level]


