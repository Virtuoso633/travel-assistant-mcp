import requests

GOOGLE_API_KEY = ""

def test_geocoding_api(address="New York, NY"):
    print(f"\n🔍 Testing Geocoding API for: {address}")
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={GOOGLE_API_KEY}"
    response = requests.get(url)
    data = response.json()

    if response.status_code == 200 and data.get("status") == "OK":
        location = data["results"][0]["geometry"]["location"]
        print(f"✅ Geocoding Success: {location}")
        return location
    else:
        print(f"❌ Geocoding Failed: {data.get('status')}")
        return None

def test_places_api(lat, lng, radius=1500, place_type="restaurant"):
    print(f"\n📍 Testing Places API near ({lat}, {lng}) for type: {place_type}")
    url = (
        f"https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        f"?location={lat},{lng}&radius={radius}&type={place_type}&key={GOOGLE_API_KEY}"
    )
    response = requests.get(url)
    data = response.json()

    if response.status_code == 200 and data.get("status") == "OK":
        print(f"✅ Places Found: {len(data['results'])}")
        for place in data["results"][:3]:  # Show top 3
            print(f" - {place['name']} ({place['vicinity']})")
    else:
        print(f"❌ Places API Failed: {data.get('status')}")

def test_weather_api(lat, lng):
    print(f"\n⛅ Testing Weather API for ({lat}, {lng})")
    # Replace below with your actual weather API or endpoint
    # Here's an example using Open-Meteo (Free weather API)
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current_weather=true"
    response = requests.get(url)
    data = response.json()

    if response.status_code == 200 and "current_weather" in data:
        weather = data["current_weather"]
        print(f"✅ Weather: {weather['temperature']}°C, Windspeed: {weather['windspeed']} km/h")
    else:
        print("❌ Weather API Failed or Invalid Response")

if __name__ == "__main__":
    # 1. Test Geocoding
    location = test_geocoding_api("Times Square, New York")
    if location:
        lat, lng = location["lat"], location["lng"]
        
        # 2. Test Places API
        test_places_api(lat, lng)
        
        # 3. Test Weather API
        test_weather_api(lat, lng)
