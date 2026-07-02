import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime

CSV_PATH = '/Users/shawnscomputer/Documents/iaw-saas/docs/BACKUP of Requests - Archive.csv'
OUTPUT_PATH = '/Users/shawnscomputer/Documents/iaw-saas/mobile/src/database/suggestions.json'

VERIFIED_BUSINESSES = [
    "ALS Environmental", "Anmar", "B&D Manufacturing", "BDI Canada Inc.", "Bélanger Construction",
    "Brankor Trophies", "Bull Power", "Consbec", "CRD (Creighton Rock Drill)", "DMC Mining Services",
    "Dr. Jordi Cisa", "Dunrite", "Enterprise Radiators", "Epiroc Lively", "Equipment North",
    "Equipment Sales", "Jannetec", "Komatsu (145 McGill)", "Komatsu (260)", "MacLean Engineering",
    "Metal-Air Mechanical", "Mobile Parts Inc.", "Nedco", "Northfast", "Onaping Depth Project (ODP)",
    "Rastall", "Redpath (Falconbridge Rd)", "Rock-Tech", "Sandvik Mining", "Shop Industrial",
    "Skyline Helicopter Technologies", "Sling-Choker Manufacturing", "Staples", "Strongco",
    "Tim McDowell Equipment (TME)", "Timberland Equipment Limited", "Toromont", "Total Equipment Services",
    "Tracks & Wheels", "Victoria Mine", "Wajax"
]

KNOWN_BUSINESS_INFO = {
    "ALS Environmental": {
        "address": "88 Elisabella St, Sudbury, ON P3A 5K1",
        "lat": 46.5290, "lon": -80.9310
    },
    "Anmar": {
        "address": "196 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4312, "lon": -81.0811
    },
    "B&D Manufacturing": {
        "address": "2500 Elm St, Chelmsford, ON P0Y 1L0",
        "lat": 46.5790, "lon": -81.2010
    },
    "BDI Canada Inc.": {
        "address": "1185 Kelly Lake Rd, Sudbury, ON P3E 5P5",
        "lat": 46.4682, "lon": -81.0255
    },
    "Bélanger Construction": {
        "address": "10 Belisle Dr, Chelmsford, ON P3Y 1K8",
        "lat": 46.5810, "lon": -81.1990
    },
    "Brankor Trophies": {
        "address": "4785 Highway 69 North, Val Therese, ON P3P 1S7",
        "lat": 46.6212, "lon": -80.9854
    },
    "Bull Power": {
        "address": "198 Mumford Rd, Lively, ON P3Y 1L2",
        "lat": 46.4385, "lon": -81.0850
    },
    "Consbec": {
        "address": "272 Highway 144, Chelmsford, ON P3Y 1K8",
        "lat": 46.5750, "lon": -81.2050
    },
    "CRD (Creighton Rock Drill)": {
        "address": "1030 Fielding Rd, Lively, ON P3Y 1R7",
        "lat": 46.4290, "lon": -81.0890
    },
    "DMC Mining Services": {
        "address": "198 Belisle Dr, Val Caron, ON P3N 1B5",
        "lat": 46.5990, "lon": -80.9920
    },
    "Dr. Jordi Cisa": {
        "address": "2120 Regent Street South, Unit 2, Sudbury, ON P3E 3Z9",
        "lat": 46.4610, "lon": -80.9990
    },
    "Dunrite": {
        "address": "200 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4315, "lon": -81.0813
    },
    "Enterprise Radiators": {
        "address": "100 Algonquin Rd, Sudbury, ON P3E 4Z6",
        "lat": 46.4670, "lon": -81.0020
    },
    "Epiroc Lively": {
        "address": "200 Mumford Rd, Lively, ON P3Y 1L2",
        "lat": 46.4382, "lon": -81.0862
    },
    "Equipment North": {
        "address": "1800 Regent St, Sudbury, ON P3E 3Z8",
        "lat": 46.4680, "lon": -80.9970
    },
    "Equipment Sales": {
        "address": "20 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4325, "lon": -81.0790
    },
    "Jannetec": {
        "address": "1545 Maley Dr, Sudbury, ON P3A 4R7",
        "lat": 46.5298, "lon": -80.9412
    },
    "Komatsu (145 McGill)": {
        "address": "145 Magill St, Lively, ON P3Y 1K7",
        "lat": 46.4354, "lon": -81.0841
    },
    "Komatsu (260)": {
        "address": "260 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4305, "lon": -81.0820
    },
    "MacLean Engineering": {
        "address": "1000 Fielding Rd, Lively, ON P3Y 1R7",
        "lat": 46.4295, "lon": -81.0880
    },
    "Metal-Air Mechanical": {
        "address": "28 Belisle Dr, Val Caron, ON P3N 1B5",
        "lat": 46.5980, "lon": -80.9930
    },
    "Mobile Parts Inc.": {
        "address": "2472 Evans Rd, Val Caron, ON P3N 1P5",
        "lat": 46.5925, "lon": -80.9992
    },
    "Nedco": {
        "address": "1151 Frobisher St, Sudbury, ON P3A 4N7",
        "lat": 46.5210, "lon": -80.9350
    },
    "Northfast": {
        "address": "150 Notre Dame Ave, Sudbury, ON P3A 2T2",
        "lat": 46.4980, "lon": -80.9910
    },
    "Onaping Depth Project (ODP)": {
        "address": "85 Regional Road 8, Onaping, ON P0M 2R0",
        "lat": 46.6110, "lon": -81.4210
    },
    "Rastall": {
        "address": "268 Hemlock St, Sudbury, ON P3C 1H9",
        "lat": 46.4950, "lon": -81.0090
    },
    "Redpath (Falconbridge Rd)": {
        "address": "1701 Elm St Unit 2, Copper Cliff, ON P0M 1N0",
        "lat": 46.4712, "lon": -81.0538
    },
    "Rock-Tech": {
        "address": "1040 Fielding Rd, Lively, ON P3Y 1R7",
        "lat": 46.4288, "lon": -81.0895
    },
    "Sandvik Mining": {
        "address": "801 Lapointe St, Sudbury, ON P3A 5N8",
        "lat": 46.5186, "lon": -80.9255
    },
    "Shop Industrial": {
        "address": "200 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4315, "lon": -81.0813
    },
    "Skyline Helicopter Technologies": {
        "address": "350 Magill St, Lively, ON P3Y 1K7",
        "lat": 46.4330, "lon": -81.0860
    },
    "Skyline Helicopters": {
        "address": "350 Magill St, Lively, ON P3Y 1K7",
        "lat": 46.4330, "lon": -81.0860
    },
    "Sling-Choker Manufacturing": {
        "address": "2122 Algonquin Rd, Sudbury, ON P3E 4Z6",
        "lat": 46.4678, "lon": -81.0028
    },
    "Staples": {
        "address": "747 Notre Dame Avenue, Sudbury, ON P3A 2T2",
        "lat": 46.5050, "lon": -80.9850
    },
    "Strongco": {
        "address": "21 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4320, "lon": -81.0795
    },
    "Tim McDowell Equipment (TME)": {
        "address": "206 Belisle Dr, Val Caron, ON P3N 1B5",
        "lat": 46.5985, "lon": -80.9915
    },
    "Timberland Equipment Limited": {
        "address": "1038 Elisabella St, Sudbury, ON P3A 5K2",
        "lat": 46.5270, "lon": -80.9290
    },
    "Toromont": {
        "address": "30 Fielding Rd, Lively, ON P3Y 1L6",
        "lat": 46.4318, "lon": -81.0805
    },
    "Total Equipment Services": {
        "address": "2500 Elm St, Chelmsford, ON P0Y 1L0",
        "lat": 46.5790, "lon": -81.2010
    },
    "Tracks & Wheels": {
        "address": "400 Highway 69 North, Val Caron, ON P3P 1S7",
        "lat": 46.5910, "lon": -81.0010
    },
    "Victoria Mine": {
        "address": "Victoria Mine Rd, Beaver Lake, ON",
        "lat": 46.3680, "lon": -81.3910
    },
    "Wajax": {
        "address": "199 Mumford Rd, Lively, ON P3Y 1L2",
        "lat": 46.4388, "lon": -81.0855
    }
}

def map_to_verified(raw_name):
    if not raw_name:
        return None
    name = raw_name.strip().lower()
    
    # Custom mappings for known fuzzy variations in CSV
    if 'joy' in name or 'komatsu' in name:
        if '145' in name or 'magill' in name or 'mcgill' in name:
            return "Komatsu (145 McGill)"
        else:
            return "Komatsu (260)"
            
    if 'redpath' in name or 'red path' in name or 'north mine' in name or 'odp' in name or 'onaping' in name or 'craig mine' in name:
        if 'falconbridge' in name:
            return "Redpath (Falconbridge Rd)"
        return "Onaping Depth Project (ODP)"

    if 'als' in name:
        return "ALS Environmental"
    if 'anmar' in name:
        return "Anmar"
    if 'b&d' in name or 'b & d' in name or 'b and d' in name:
        return "B&D Manufacturing"
    if 'bdi' in name:
        return "BDI Canada Inc."
    if 'belanger' in name or 'bélanger' in name:
        return "Bélanger Construction"
    if 'brankor' in name or 'brancore' in name:
        return "Brankor Trophies"
    if 'bull power' in name:
        return "Bull Power"
    if 'consbec' in name:
        return "Consbec"
    if 'crd' in name or 'creighton' in name:
        return "CRD (Creighton Rock Drill)"
    if 'dmc' in name:
        return "DMC Mining Services"
    if 'cisa' in name:
        return "Dr. Jordi Cisa"
    if 'dunrite' in name:
        return "Dunrite"
    if 'enterprise radiator' in name:
        return "Enterprise Radiators"
    if 'epiroc' in name or 'epirock' in name:
        return "Epiroc Lively"
    if 'equipment north' in name:
        return "Equipment North"
    if 'equipment sales' in name:
        return "Equipment Sales"
    if 'jannatec' in name or 'jannetec' in name:
        return "Jannetec"
    if 'maclean' in name or 'mclean' in name:
        return "MacLean Engineering"
    if 'metal air' in name or 'metal-air' in name:
        return "Metal-Air Mechanical"
    if 'mobile parts' in name:
        return "Mobile Parts Inc."
    if 'nedco' in name:
        return "Nedco"
    if 'northfast' in name:
        return "Northfast"
    if 'rastall' in name:
        return "Rastall"
    if 'rocktek' in name or 'rock-tech' in name or 'rock tech' in name:
        return "Rock-Tech"
    if 'sandvik' in name:
        return "Sandvik Mining"
    if 'shop industrial' in name:
        return "Shop Industrial"
    if 'skyline' in name:
        return "Skyline Helicopter Technologies"
    if 'sling' in name or 'choker' in name:
        return "Sling-Choker Manufacturing"
    if 'staples' in name:
        return "Staples"
    if 'strongco' in name:
        return "Strongco"
    if 'mcdowell' in name or 'tme' in name:
        return "Tim McDowell Equipment (TME)"
    if 'timberland' in name:
        return "Timberland Equipment Limited"
    if 'toromont' in name or 'tormont' in name:
        return "Toromont"
    if 'total equip' in name:
        return "Total Equipment Services"
    if 'tracks' in name:
        return "Tracks & Wheels"
    if 'victoria' in name:
        return "Victoria Mine"
    if 'wajax' in name:
        return "Wajax"
        
    # Check general substrings of verified business names
    for v in VERIFIED_BUSINESSES:
        if v.lower() in name or name in v.lower():
            return v
            
    return None

def analyze():
    pickups = []
    dropoffs = []
    routes = []
    
    with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_pickup = row.get('Pick Up Location')
            raw_dropoff = row.get('Destination')
            if not raw_pickup or not raw_dropoff:
                continue
                
            p_map = map_to_verified(raw_pickup)
            d_map = map_to_verified(raw_dropoff)
            
            if p_map and d_map:
                pickups.append(p_map)
                dropoffs.append(d_map)
                routes.append((p_map, d_map))

    # Calculate overall pickup distribution sorted alphabetically
    top_pickups = sorted(list(set(pickups)))
    if not top_pickups:
        top_pickups = VERIFIED_BUSINESSES
        
    # Calculate conditional dropoff distribution for each verified pickup
    conditional_dropoffs = defaultdict(list)
    pickup_route_map = defaultdict(list)
    for p, d in routes:
        pickup_route_map[p].append(d)

    for p in top_pickups:
        d_counts = Counter(pickup_route_map[p]).most_common(15)
        # Ensure we only include dropoffs that are verified proper names
        unique_dropoffs = []
        for d, count in d_counts:
            if d not in unique_dropoffs:
                unique_dropoffs.append(d)
        # Pad with other common verified if less than 12
        for v in VERIFIED_BUSINESSES:
            if len(unique_dropoffs) >= 12:
                break
            if v != p and v not in unique_dropoffs:
                unique_dropoffs.append(v)
        conditional_dropoffs[p] = unique_dropoffs

    # Structure final JSON
    output_data = {
        "commonPickups": VERIFIED_BUSINESSES,
        "conditionalDropoffs": dict(conditional_dropoffs),
        "locations": KNOWN_BUSINESS_INFO
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2)

    print(f"Successfully wrote clean suggestions to {OUTPUT_PATH}")

if __name__ == '__main__':
    analyze()
