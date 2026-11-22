#!/bin/bash
# Download market and hazard tables (all public, no account).
set -e
cd "$(dirname "$0")/../data/raw"
mkdir -p cdi nri zillow census
UA="Mozilla/5.0 (research prototype)"
CDI=https://www.insurance.ca.gov/01-consumers/200-wrr/upload
curl -sfL -A "$UA" -o cdi/new_renew_nonrenew_zip_2020_2023.xlsx "$CDI/Residential-Insurance-Voluntary-Market-New-Renew-NonRenew-by-ZIP-2020-2023.xlsx"
curl -sfL -A "$UA" -o cdi/new_renew_nonrenew_zip_2015_2021.xlsx "$CDI/Residential-Property-Voluntary-Market-New-Renew-NonRenew-by-ZIP-2015-2021.xlsx"
curl -sfL -A "$UA" -o cdi/fair_vs_voluntary_zip_2022.pdf "$CDI/Number-of-Residential-Dwelling-Units-Insured-in-2022-FAIR-Plan-vs-Voluntary.pdf"
curl -sfL -A "$UA" -o nri/NRI_tracts_CA.zip "https://hazards.fema.gov/nri/Content/StaticDocuments/DataDownload//NRI_Table_CensusTracts/NRI_Table_CensusTracts_California.zip" || echo "NRI download failed"
curl -sfL -A "$UA" -o zillow/zhvi_zip.csv "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv" || echo "Zillow failed"
curl -sfL -A "$UA" -o census/zcta_tract_rel.txt "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt" || echo "Census rel failed"
ls -la cdi nri zillow census
