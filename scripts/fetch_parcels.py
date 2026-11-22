"""LA County assessor parcels inside the 2025 fire perimeters (floor area for replacement cost)."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from arcgis import layer_to_csv
from pathlib import Path
URL = "https://services.arcgis.com/RmCCgQtiZLDCtblq/ArcGIS/rest/services/2025_Parcels_with_DINS_data/FeatureServer/5"
layer_to_csv(URL, Path(__file__).resolve().parents[1] / "data/raw/la_parcels/parcels_2025_fires.csv",
             out_fields="AIN_1,APN_1,SQFTmain1,YearBuilt1,Units1,UseType,SitusZIP,Fire_Name", label="parcels")
