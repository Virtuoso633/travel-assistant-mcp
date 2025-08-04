import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { events, destinations } from '../db/schema.js';
import { awardPoints } from '../lib/gamification.js';
import { geocodeLocation } from '../lib/apis/google.js';

export const eventTools = [
  {
    definition: {
      name: 'find_events',
      description: 'Find local events, attractions, and activities using Google Places API. Awards 10 points per search.',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'Location to find events (e.g., "Paris, France", "Tokyo, Japan")'
          },
          eventType: {
            type: 'string',
            description: 'Type of attractions to find',
            enum: ['tourist_attraction', 'museum', 'amusement_park', 'art_gallery', 'zoo', 'aquarium', 'night_club', 'restaurant', 'shopping_mall', 'all'],
            default: 'tourist_attraction'
          },
          radius: {
            type: 'number',
            description: 'Search radius in meters (max 50000)',
            default: 5000,
            minimum: 1000,
            maximum: 50000
          },
          userId: {
            type: 'string',
            description: 'User ID for points tracking',
            default: 'anonymous'
          }
        },
        required: ['location']
      }
    },
    handler: async (args: any, env: any) => {
      const { location, eventType = 'tourist_attraction', radius = 5000, userId = 'anonymous' } = args;
      
      try {
        console.log(`🎯 Finding ${eventType} in ${location} within ${radius}m radius`);
        
        // First, geocode the location to get coordinates
        const geocodingResult = await geocodeLocation(location, env.GOOGLE_MAPS_API_KEY);
        console.log(`📍 Geocoded ${location} to: ${geocodingResult.latitude}, ${geocodingResult.longitude}`);
        
        // Find places using Google Places API (with fallback to mock data)
        const places = await findPlacesNearby(
          geocodingResult.latitude, 
          geocodingResult.longitude, 
          eventType, 
          radius, 
          env.GOOGLE_MAPS_API_KEY
        );
        
        // Award points for event search (10 points)
        let pointsResult = null;
        if (userId && userId !== 'anonymous') {
          pointsResult = await awardPoints(env.DB, userId, 10, `event_search_${location}_${eventType}`);
        }
        
        const result = {
          success: true,
          location: geocodingResult.formattedAddress,
          coordinates: {
            latitude: geocodingResult.latitude,
            longitude: geocodingResult.longitude
          },
          eventType: eventType,
          searchRadius: radius,
          placesFound: places.length,
          places: places,
          searchTips: [
            'Save interesting places to your travel plan for bonus points',
            'Check place websites for opening hours and current events',
            'Consider booking popular attractions in advance'
          ],
          gamification: pointsResult ? {
            pointsAwarded: 10,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          } : null,
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Found ${places.length} places in ${location}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Events search error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          location: location,
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'save_event',
      description: 'Save an interesting place or event to your travel plan. Awards 15 points per saved item.',
      inputSchema: {
        type: 'object',
        properties: {
          placeName: {
            type: 'string',
            description: 'Name of the place/event to save'
          },
          location: {
            type: 'string',
            description: 'Place location/address'
          },
          placeType: {
            type: 'string',
            description: 'Type of place',
            enum: ['tourist_attraction', 'museum', 'restaurant', 'shopping', 'nightlife', 'entertainment', 'outdoor', 'cultural'],
            default: 'tourist_attraction'
          },
          notes: {
            type: 'string',
            description: 'Personal notes about this place',
            default: ''
          },
          visitDate: {
            type: 'string',
            description: 'Planned visit date (YYYY-MM-DD format, optional)',
            default: ''
          },
          userId: {
            type: 'string',
            description: 'User ID for saving and points'
          }
        },
        required: ['placeName', 'location', 'userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { placeName, location, placeType = 'tourist_attraction', notes = '', visitDate = '', userId } = args;
      
      try {
        console.log(`💾 Saving place: ${placeName} for user ${userId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to save places');
        }
        
        const db = drizzle(env.DB);
        
        // Create or find destination
        const destinationId = await findOrCreateDestination(db, userId, location);
        
        // Save the place/event
        const eventId = crypto.randomUUID();
        await db.insert(events).values({
          id: eventId,
          userId: userId,
          destinationId: destinationId,
          title: placeName,
          description: notes || `Saved ${placeType.replace('_', ' ')} from search results`,
          eventDate: visitDate || new Date().toISOString().split('T')[0],
          location: location,
          source: 'google_places'
        });
        
        // Award points for saving place (15 points)
        const pointsResult = await awardPoints(env.DB, userId, 15, `save_place_${placeName}`);
        
        const result = {
          success: true,
          eventId: eventId,
          placeName: placeName,
          location: location,
          placeType: placeType,
          visitDate: visitDate,
          message: `Place "${placeName}" saved successfully to your travel plan!`,
          gamification: {
            pointsAwarded: 15,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Place saved: ${placeName}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Save place error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          placeName: placeName,
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'get_saved_places',
      description: 'Get all saved places and events for the user. No points awarded (informational).',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'User ID to get saved places for'
          },
          location: {
            type: 'string',
            description: 'Filter by location (optional)',
            default: ''
          }
        },
        required: ['userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { userId, location = '' } = args;
      
      try {
        console.log(`📋 Getting saved places for user ${userId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to get saved places');
        }
        
        const db = drizzle(env.DB);
        
        const savedPlaces = await db.select().from(events).where(eq(events.userId, userId));
        
        // Filter by location if specified
        const filteredPlaces = location ? 
          savedPlaces.filter(place => 
            place.location && place.location.toLowerCase().includes(location.toLowerCase())
          ) : savedPlaces;
        
        return {
          success: true,
          userId: userId,
          totalPlaces: filteredPlaces.length,
          places: filteredPlaces.map(place => ({
            id: place.id,
            title: place.title,
            location: place.location,
            visitDate: place.eventDate,
            description: place.description,
            source: place.source,
            savedAt: place.createdAt
          })),
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        console.error(`❌ Get saved places error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          userId: userId,
          timestamp: new Date().toISOString()
        };
      }
    }
  },

  {
    definition: {
      name: 'get_place_details',
      description: 'Get detailed information about a specific place using Google Places API. Awards 5 points per lookup.',
      inputSchema: {
        type: 'object',
        properties: {
          placeName: {
            type: 'string',
            description: 'Name of the place to get details for'
          },
          location: {
            type: 'string',
            description: 'Location context (city, country)'
          },
          userId: {
            type: 'string',
            description: 'User ID for points tracking',
            default: 'anonymous'
          }
        },
        required: ['placeName', 'location']
      }
    },
    handler: async (args: any, env: any) => {
      const { placeName, location, userId = 'anonymous' } = args;
      
      try {
        console.log(`🔍 Getting details for: ${placeName} in ${location}`);
        
        // Search for the specific place
        const placeDetails = await getPlaceDetails(placeName, location, env.GOOGLE_MAPS_API_KEY);
        
        // Award points for place lookup (5 points)
        let pointsResult = null;
        if (userId && userId !== 'anonymous') {
          pointsResult = await awardPoints(env.DB, userId, 5, `place_details_${placeName}`);
        }
        
        const result = {
          success: true,
          placeName: placeName,
          location: location,
          details: placeDetails,
          gamification: pointsResult ? {
            pointsAwarded: 5,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          } : null,
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Retrieved details for: ${placeName}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Place details error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          placeName: placeName,
          timestamp: new Date().toISOString()
        };
      }
    }
  }
];

// Enhanced function to find places using Google Places API with fallback
async function findPlacesNearby(
  latitude: number, 
  longitude: number, 
  placeType: string, 
  radius: number, 
  apiKey: string
) {
  
  // Try real Google Places API first
  if (apiKey && apiKey.startsWith('AIza') && apiKey.length > 30) {
    console.log(`🌍 Trying Google Places API for ${placeType}`);
    
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&type=${placeType}&key=${apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      const placesData = data as { status: string; results: any[] };
      
      if (placesData.status === 'OK' && placesData.results.length > 0) {
        console.log(`✅ Google Places API returned ${placesData.results.length} results`);
        
        return placesData.results.slice(0, 10).map((place: any) => ({
          id: place.place_id,
          name: place.name,
          type: placeType.replace('_', ' '),
          address: place.vicinity || place.formatted_address,
          rating: place.rating || 'No rating',
          priceLevel: place.price_level ? '$'.repeat(place.price_level) : 'Price not available',
          openNow: place.opening_hours?.open_now ? 'Open now' : 'Check opening hours',
          photoReference: place.photos?.[0]?.photo_reference || null,
          coordinates: {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng
          },
          source: 'Google Places API'
        }));
      } else {
        console.log(`⚠️ Google Places API returned: ${placesData.status}. Using fallback data.`);
      }
    } catch (error) {
      console.log(`⚠️ Google Places API request failed: ${error}. Using fallback data.`);
    }
  }
  
  // Fallback to realistic mock data
  console.log(`🎭 Using mock places data for ${placeType}`);
  return generateMockPlaces(placeType, radius);
}

// Function to get detailed place information
async function getPlaceDetails(placeName: string, location: string, apiKey: string) {
  
  // Try Google Places Text Search API
  if (apiKey && apiKey.startsWith('AIza') && apiKey.length > 30) {
    console.log(`🔍 Searching for ${placeName} via Google Places Text Search`);
    
    const query = encodeURIComponent(`${placeName} ${location}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json() as { status: string; results: any[] };
      
      if (data.status === 'OK' && data.results.length > 0) {
        const place = data.results[0];
        return {
          name: place.name,
          address: place.formatted_address,
          rating: place.rating || 'No rating',
          priceLevel: place.price_level ? '$'.repeat(place.price_level) : 'Price not available',
          types: place.types.slice(0, 3).join(', '),
          openNow: place.opening_hours?.open_now ? 'Open now' : 'Check opening hours',
          coordinates: place.geometry.location,
          source: 'Google Places API'
        };
      }
    } catch (error) {
      console.log(`⚠️ Google Places details request failed: ${error}`);
    }
  }
  
  // Fallback mock details
  return {
    name: placeName,
    address: `${location} (estimated location)`,
    rating: (4.0 + Math.random() * 1.0).toFixed(1),
    priceLevel: ['$', '$$', '$$$'][Math.floor(Math.random() * 3)],
    types: 'tourist attraction, point of interest',
    openNow: 'Check local hours',
    coordinates: { lat: 0, lng: 0 },
    source: 'Mock data'
  };
}

// Generate realistic mock places data
function generateMockPlaces(placeType: string, radius: number) {
  const placeCount = Math.floor(Math.random() * 8) + 5; // 5-12 places
  
  const placeData = {
    tourist_attraction: [
      'Historic Cathedral', 'Ancient Castle', 'Central Park', 'Famous Bridge', 'Monument Square',
      'Historic District', 'Observation Deck', 'Famous Statue', 'Cultural Center', 'Heritage Site'
    ],
    museum: [
      'Art Museum', 'History Museum', 'Science Museum', 'Natural History Museum', 'Modern Art Gallery',
      'Archaeological Museum', 'Technology Museum', 'Cultural Museum', 'Maritime Museum', 'War Memorial'
    ],
    restaurant: [
      'Le Petit Bistro', 'Garden Restaurant', 'Rooftop Dining', 'Traditional Cuisine', 'Seafood House',
      'Local Favorites', 'Fine Dining', 'Street Food Market', 'Cafe Central', 'Wine Bar'
    ],
    amusement_park: [
      'Adventure Park', 'Theme Park', 'Water Park', 'Family Fun Center', 'Carnival Grounds'
    ],
    zoo: [
      'City Zoo', 'Wildlife Park', 'Safari Park', 'Aquarium Center', 'Bird Sanctuary'
    ]
  };
  
  const names = placeData[placeType as keyof typeof placeData] || placeData.tourist_attraction;
  const places = [];
  
  for (let i = 0; i < placeCount; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    
    places.push({
      id: crypto.randomUUID(),
      name: `${name} ${i + 1}`,
      type: placeType.replace('_', ' '),
      address: `Downtown District, Local Area`,
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
      priceLevel: ['$', '$$', '$$$'][Math.floor(Math.random() * 3)],
      openNow: Math.random() > 0.3 ? 'Open now' : 'Closed',
      photoReference: null,
      coordinates: {
        lat: 40.7128 + (Math.random() - 0.5) * 0.1,
        lng: -74.0060 + (Math.random() - 0.5) * 0.1
      },
      source: 'Mock data'
    });
  }
  
  return places;
}

// Helper function to find or create destination (same as before)
async function findOrCreateDestination(db: any, userId: string, location: string) {
  const existing = await db
    .select()
    .from(destinations)
    .where(eq(destinations.userId, userId))
    .where(eq(destinations.name, location))
    .get();
  
  if (existing) {
    return existing.id;
  }
  
  const destinationId = crypto.randomUUID();
  await db.insert(destinations).values({
    id: destinationId,
    userId: userId,
    name: location,
    country: 'Unknown',
    latitude: 40.7128,
    longitude: -74.0060,
    notes: `Destination created from event: ${location}`
  });
  
  return destinationId;
}
