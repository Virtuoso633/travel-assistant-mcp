import { geocodeLocation, getWeatherData, formatWeatherReport } from '../lib/apis/google.js';
import { awardPoints } from '../lib/gamification.js';
import { drizzle } from 'drizzle-orm/d1';

export const weatherTools = [
  {
    definition: {
      name: 'get_weather',
      description: 'Get current weather and 5-day forecast for any location. Awards 5 points per check.',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Location to get weather for (e.g., "Paris, France", "New York, USA", "Tokyo")'
          },
          userId: {
            type: 'string',
            description: 'User ID for points tracking (optional)',
            default: 'anonymous'
          }
        },
        required: ['location']
      }
    },
    handler: async (args: any, env: any) => {
      const { location, userId = 'anonymous' } = args;
      try {
        console.log(`🌤️ Weather request for: ${location} by user: ${userId}`);

        if (!location || typeof location !== 'string') {
          throw new Error('Location is required and must be a string');
        }

        const geocodingResult = await geocodeLocation(location, env.GOOGLE_MAPS_API_KEY);
        console.log(`📍 Geocoded ${location} to: ${geocodingResult.latitude}, ${geocodingResult.longitude}`);

        const weatherData = await getWeatherData(
          geocodingResult.latitude,
          geocodingResult.longitude,
          geocodingResult.formattedAddress
        );

        let pointsResult = null;
        if (userId && userId !== 'anonymous') {
          try {
            const db = drizzle(env.DB);
            await ensureUserExists(db, userId);
            pointsResult = await awardPoints(env.DB, userId, 5, `weather_check_${location}`);
          } catch (error) {
            console.error(`⚠️ Points award failed for user ${userId}:`, error);
            pointsResult = {
              newTotal: 0,
              unlockedRewards: [],
              message: 'Weather data retrieved, but points could not be awarded. User may need to be created first.'
            };
          }
        }

        const weatherReport = formatWeatherReport(weatherData);

        return {
          success: true,
          location: geocodingResult.formattedAddress,
          country: geocodingResult.country,
          coordinates: {
            latitude: geocodingResult.latitude,
            longitude: geocodingResult.longitude
          },
          weather: weatherData,
          formattedReport: weatherReport,
          gamification: pointsResult ? {
            pointsAwarded: 5,
            newTotal: pointsResult.newTotal,
            level: pointsResult.levelsGained && pointsResult.levelsGained > 0 ? `Level up! Now level ${pointsResult.newTotal}` : null,
            unlockedRewards: pointsResult.unlockedRewards,
            message: 'message' in pointsResult ? pointsResult.message : null
          } : null,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error(`❌ Weather tool error for ${location}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          location: location,
          timestamp: new Date().toISOString(),
          suggestion: 'Please try with a more specific location (e.g., "Paris, France" instead of just "Paris")'
        };
      }
    }
  },

  {
    definition: {
      name: 'compare_weather',
      description: 'Compare weather between two locations. Awards 10 points per comparison.',
      inputSchema: {
        type: 'object',
        properties: {
          location1: {
            type: 'string',
            description: 'First location to compare'
          },
          location2: {
            type: 'string',
            description: 'Second location to compare'
          },
          userId: {
            type: 'string',
            description: 'User ID for points tracking (optional)',
            default: 'anonymous'
          }
        },
        required: ['location1', 'location2']
      }
    },
    handler: async (args: any, env: any) => {
      const { location1, location2, userId = 'anonymous' } = args;
      try {
        console.log(`🔄 Comparing weather: ${location1} vs ${location2}`);

        const [geo1, geo2] = await Promise.all([
          geocodeLocation(location1, env.GOOGLE_MAPS_API_KEY),
          geocodeLocation(location2, env.GOOGLE_MAPS_API_KEY)
        ]);

        const [weather1, weather2] = await Promise.all([
          getWeatherData(geo1.latitude, geo1.longitude, geo1.formattedAddress),
          getWeatherData(geo2.latitude, geo2.longitude, geo2.formattedAddress)
        ]);

        let pointsResult = null;
        if (userId && userId !== 'anonymous') {
          try {
            const db = drizzle(env.DB);
            await ensureUserExists(db, userId);
            pointsResult = await awardPoints(env.DB, userId, 10, `weather_comparison_${location1}_vs_${location2}`);
          } catch (error) {
            console.error(`⚠️ Points award failed for user ${userId}:`, error);
            pointsResult = {
              newTotal: 0,
              unlockedRewards: [],
              message: 'Weather comparison done, but points could not be awarded.'
            };
          }
        }

        const comparison = {
          location1: {
            name: geo1.formattedAddress,
            temperature: weather1.current.temperature,
            condition: weather1.current.condition,
            humidity: weather1.current.humidity
          },
          location2: {
            name: geo2.formattedAddress,
            temperature: weather2.current.temperature,
            condition: weather2.current.condition,
            humidity: weather2.current.humidity
          },
          analysis: {
            temperatureDifference: Math.abs(weather1.current.temperature - weather2.current.temperature),
            warmerLocation: weather1.current.temperature > weather2.current.temperature ? geo1.formattedAddress : geo2.formattedAddress,
            recommendation: weather1.current.temperature > weather2.current.temperature ?
              `${geo1.formattedAddress} is ${Math.abs(weather1.current.temperature - weather2.current.temperature)}°C warmer` :
              `${geo2.formattedAddress} is ${Math.abs(weather2.current.temperature - weather1.current.temperature)}°C warmer`
          }
        };

        return {
          success: true,
          comparison,
          gamification: pointsResult ? {
            pointsAwarded: 10,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards,
            message: 'message' in pointsResult ? pointsResult.message : null
          } : null,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error(`❌ Weather comparison error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: new Date().toISOString()
        };
      }
    }
  }
];

async function ensureUserExists(db: any, userId: string) {
  const { users } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (existingUser) {
      console.log(`✅ User ${userId} exists`);
      return existingUser;
    }

    console.log(`🏗️ Creating new user: ${userId}`);
    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
      name: `User ${userId}`,
      totalPoints: 0,
      level: 1
    });

    console.log(`✅ Created user: ${userId}`);
    return { id: userId };

  } catch (error) {
    console.error(`❌ Error ensuring user exists:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ensure user exists: ${errorMessage}`);
  }
}