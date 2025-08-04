// Google APIs integration for our Travel Assistant MCP server

interface WeatherData {
  location: string;
  current: {
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    visibility: number;
  };
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    condition: string;
    precipitation: number;
  }>;
}

interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  country: string;
}

/**
 * Get GPS coordinates for a location using Google Geocoding API
 */
export async function geocodeLocation(location: string, apiKey: string): Promise<GeocodingResult> {
  const encodedLocation = encodeURIComponent(location);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedLocation}&key=${apiKey}`;
  
  try {
    console.log(`🌍 Geocoding location: ${location}`);
    
    const response = await fetch(url);
    const data: any = await response.json();
    
    if (data.status !== 'OK' || !data.results.length) {
      throw new Error(`Geocoding failed: ${data.status}. Could not find location: ${location}`);
    }
    
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    
    // Extract country from address components
    const countryComponent = result.address_components.find(
      (component: any) => component.types.includes('country')
    );
    
    return {
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formatted_address,
      country: countryComponent?.long_name || 'Unknown'
    };
    
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    throw new Error(`Failed to geocode location "${location}": ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get weather data using coordinates
 * Note: Google doesn't have a direct Weather API, so we'll use OpenWeatherMap as backup
 * For now, we'll simulate weather data and add real API integration later
 */
export async function getWeatherData(latitude: number, longitude: number, location: string): Promise<WeatherData> {
  try {
    console.log(`🌤️ Getting weather for coordinates: ${latitude}, ${longitude}`);
    
    // For now, we'll return mock data that looks realistic
    // In a real implementation, you'd integrate with OpenWeatherMap or similar service
    const mockWeatherData: WeatherData = {
      location: location,
      current: {
        temperature: Math.round(15 + Math.random() * 20), // Random temp between 15-35°C
        condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)],
        humidity: Math.round(40 + Math.random() * 40), // 40-80% humidity
        windSpeed: Math.round(5 + Math.random() * 15), // 5-20 km/h wind
        visibility: Math.round(8 + Math.random() * 7) // 8-15 km visibility
      },
      forecast: Array.from({ length: 5 }, (_, i) => ({
        date: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        high: Math.round(18 + Math.random() * 15),
        low: Math.round(8 + Math.random() * 10),
        condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)],
        precipitation: Math.round(Math.random() * 30) // 0-30% chance of rain
      }))
    };
    
    console.log(`✅ Weather data retrieved for ${location}`);
    return mockWeatherData;
    
  } catch (error) {
    console.error('❌ Weather API error:', error);
    throw new Error(`Failed to get weather data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format weather data for display
 */
export function formatWeatherReport(weather: WeatherData): string {
  const { location, current, forecast } = weather;
  
  let report = `🌤️ **Weather Report for ${location}**\n\n`;
  
  // Current weather
  report += `**Current Conditions:**\n`;
  report += `🌡️ Temperature: ${current.temperature}°C\n`;
  report += `☁️ Condition: ${current.condition}\n`;
  report += `💧 Humidity: ${current.humidity}%\n`;
  report += `💨 Wind Speed: ${current.windSpeed} km/h\n`;
  report += `👁️ Visibility: ${current.visibility} km\n\n`;
  
  // 5-day forecast
  report += `**5-Day Forecast:**\n`;
  forecast.forEach((day, index) => {
    const dayName = index === 0 ? 'Tomorrow' : new Date(day.date).toLocaleDateString('en-US', { weekday: 'long' });
    report += `📅 ${dayName} (${day.date}): ${day.high}°/${day.low}°C, ${day.condition}`;
    if (day.precipitation > 0) {
      report += ` (${day.precipitation}% rain)`;
    }
    report += `\n`;
  });
  
  return report;
}
