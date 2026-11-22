"""FEMA National Risk Index, California census tracts, wildfire fields only."""
import sys; sys.path.insert(0, __import__("os").path.dirname(__file__))
from arcgis import layer_to_csv
from pathlib import Path
URL = "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0"
FIELDS = "TRACTFIPS,STCOFIPS,COUNTY,POPULATION,BUILDVALUE,WFIR_EVNTS,WFIR_AFREQ,WFIR_EXPB,WFIR_HLRB,WFIR_EALB,WFIR_EALS,WFIR_EALR,WFIR_ALRB,WFIR_RISKS,WFIR_RISKR"
layer_to_csv(URL, Path(__file__).resolve().parents[1] / "data/raw/nri/nri_wildfire_tracts_CA.csv",
             where="STATEABBRV='CA'", out_fields=FIELDS, label="nri")
