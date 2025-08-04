import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { itineraries, destinations, events } from '../db/schema.js';
import { awardPoints } from '../lib/gamification.js';
import { geocodeLocation } from '../lib/apis/google.js';

export const itineraryTools = [
  {
    definition: {
      name: 'create_itinerary',
      description: 'Create a comprehensive travel itinerary with AI-powered suggestions. Awards 20 points per itinerary.',
      inputSchema: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            description: 'Travel destination (e.g., "Paris, France", "Tokyo, Japan")'
          },
          duration: {
            type: 'number',
            description: 'Trip duration in days',
            minimum: 1,
            maximum: 30
          },
          startDate: {
            type: 'string',
            description: 'Trip start date (YYYY-MM-DD format)'
          },
          endDate: {
            type: 'string',
            description: 'Trip end date (YYYY-MM-DD format, optional - calculated from duration)',
            default: ''
          },
          interests: {
            type: 'array',
            description: 'User interests for personalized recommendations',
            items: {
              type: 'string',
              enum: ['culture', 'food', 'nightlife', 'nature', 'adventure', 'relaxation', 'shopping', 'history', 'art', 'architecture']
            },
            default: ['culture', 'food']
          },
          budget: {
            type: 'string',
            description: 'Budget level for recommendations',
            enum: ['budget', 'mid-range', 'luxury'],
            default: 'mid-range'
          },
          travelStyle: {
            type: 'string',
            description: 'Travel style preference',
            enum: ['solo', 'couple', 'family', 'group'],
            default: 'solo'
          },
          userId: {
            type: 'string',
            description: 'User ID for saving and points'
          }
        },
        required: ['destination', 'duration', 'startDate', 'userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { 
        destination, 
        duration, 
        startDate, 
        endDate = '', 
        interests = ['culture', 'food'], 
        budget = 'mid-range', 
        travelStyle = 'solo', 
        userId 
      } = args;
      
      try {
        console.log(`🗺️ Creating itinerary for ${destination} (${duration} days) for user ${userId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to create itinerary');
        }
        
        const db = drizzle(env.DB);
        
        // Ensure user exists
        await ensureUserExists(db, userId);
        
        // Calculate end date if not provided
        const calculatedEndDate = endDate || calculateEndDate(startDate, duration);
        
        // Geocode destination
        const geocodingResult = await geocodeLocation(destination, env.GOOGLE_MAPS_API_KEY);
        
        // Generate AI-powered itinerary
        const itineraryData = await generateSmartItinerary(
          destination,
          duration,
          interests,
          budget,
          travelStyle,
          geocodingResult
        );
        
        // Find or create destination
        const destinationId = await findOrCreateDestination(db, userId, destination, geocodingResult);
        
        // Save the itinerary
        const itineraryId = crypto.randomUUID();
        await db.insert(itineraries).values({
          id: itineraryId,
          userId: userId,
          destinationId: destinationId,
          title: `${duration}-Day ${destination} Adventure`,
          description: `Personalized ${duration}-day itinerary for ${destination} focusing on ${interests.join(', ')}`,
          startDate: startDate,
          endDate: calculatedEndDate,
          activities: JSON.stringify(itineraryData.dailyPlan)
        });
        
        // Award points for itinerary creation (20 points)
        const pointsResult = await awardPoints(env.DB, userId, 20, `create_itinerary_${destination}_${duration}days`);
        
        const result = {
          success: true,
          itineraryId: itineraryId,
          destination: geocodingResult.formattedAddress,
          duration: duration,
          dates: {
            start: startDate,
            end: calculatedEndDate
          },
          preferences: {
            interests: interests,
            budget: budget,
            travelStyle: travelStyle
          },
          overview: itineraryData.overview,
          dailyPlan: itineraryData.dailyPlan,
          recommendations: itineraryData.recommendations,
          budgetEstimate: itineraryData.budgetEstimate,
          tips: itineraryData.tips,
          gamification: {
            pointsAwarded: 20,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Itinerary created: ${itineraryId} for ${destination}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Create itinerary error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          destination: destination,
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'optimize_itinerary',
      description: 'Optimize an existing itinerary for better routes and timing. Awards 15 points per optimization.',
      inputSchema: {
        type: 'object',
        properties: {
          itineraryId: {
            type: 'string',
            description: 'ID of the itinerary to optimize'
          },
          optimizationGoal: {
            type: 'string',
            description: 'Optimization goal',
            enum: ['minimize_travel_time', 'maximize_experiences', 'reduce_costs', 'balance_activities'],
            default: 'minimize_travel_time'
          },
          userId: {
            type: 'string',
            description: 'User ID for verification and points'
          }
        },
        required: ['itineraryId', 'userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { itineraryId, optimizationGoal = 'minimize_travel_time', userId } = args;
      
      try {
        console.log(`🔧 Optimizing itinerary ${itineraryId} for ${optimizationGoal}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to optimize itinerary');
        }
        
        const db = drizzle(env.DB);
        
        // Get existing itinerary
        const existingItinerary = await db
          .select()
          .from(itineraries)
          .where(and(eq(itineraries.id, itineraryId), eq(itineraries.userId, userId)))
          .get();
        
        if (!existingItinerary) {
          throw new Error('Itinerary not found or access denied');
        }
        
        // Parse existing activities
        const currentActivities = JSON.parse(existingItinerary.activities || '[]');
        
        // Apply optimization based on goal
        const optimizedActivities = await optimizeActivities(currentActivities, optimizationGoal);
        
        // Update the itinerary
        await db
          .update(itineraries)
          .set({
            activities: JSON.stringify(optimizedActivities),
            updatedAt: new Date().toISOString()
          })
          .where(eq(itineraries.id, itineraryId));
        
        // Award points for optimization (15 points)
        const pointsResult = await awardPoints(env.DB, userId, 15, `optimize_itinerary_${optimizationGoal}`);
        
        const result = {
          success: true,
          itineraryId: itineraryId,
          optimizationGoal: optimizationGoal,
          optimizedPlan: optimizedActivities,
          improvements: getOptimizationImprovements(currentActivities, optimizedActivities, optimizationGoal),
          gamification: {
            pointsAwarded: 15,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Itinerary optimized: ${itineraryId}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Optimize itinerary error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          itineraryId: itineraryId,
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'get_user_itineraries',
      description: 'Get all itineraries created by the user. No points awarded (informational).',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'User ID to get itineraries for'
          },
          status: {
            type: 'string',
            description: 'Filter by status',
            enum: ['all', 'upcoming', 'past', 'current'],
            default: 'all'
          }
        },
        required: ['userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { userId, status = 'all' } = args;
      
      try {
        console.log(`📋 Getting itineraries for user ${userId} with status: ${status}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to get itineraries');
        }
        
        const db = drizzle(env.DB);
        
        const userItineraries = await db
          .select()
          .from(itineraries)
          .where(eq(itineraries.userId, userId));
        
        // Filter by status
        const currentDate = new Date().toISOString().split('T')[0];
        const filteredItineraries = userItineraries.filter(itinerary => {
          switch (status) {
            case 'upcoming':
              return itinerary.startDate && itinerary.startDate > currentDate;
            case 'past':
              return itinerary.endDate && itinerary.endDate < currentDate;
            case 'current':
              return (
                itinerary.startDate != null &&
                itinerary.endDate != null &&
                itinerary.startDate <= currentDate &&
                itinerary.endDate >= currentDate
              );
            default:
              return true;
          }
        });
        
        return {
          success: true,
          userId: userId,
          status: status,
          totalItineraries: filteredItineraries.length,
          itineraries: filteredItineraries.map(itinerary => ({
            id: itinerary.id,
            title: itinerary.title,
            description: itinerary.description,
            startDate: itinerary.startDate,
            endDate: itinerary.endDate,
            destination: itinerary.destinationId,
            createdAt: itinerary.createdAt,
            lastUpdated: itinerary.updatedAt
          })),
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        console.error(`❌ Get itineraries error:`, error);
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
      name: 'get_itinerary_details',
      description: 'Get detailed information about a specific itinerary. Awards 5 points per view.',
      inputSchema: {
        type: 'object',
        properties: {
          itineraryId: {
            type: 'string',
            description: 'ID of the itinerary to get details for'
          },
          userId: {
            type: 'string',
            description: 'User ID for verification and points'
          }
        },
        required: ['itineraryId', 'userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { itineraryId, userId } = args;
      
      try {
        console.log(`📖 Getting details for itinerary ${itineraryId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to view itinerary details');
        }
        
        const db = drizzle(env.DB);
        
        // Get itinerary with destination info
        const itinerary = await db
          .select()
          .from(itineraries)
          .where(and(eq(itineraries.id, itineraryId), eq(itineraries.userId, userId)))
          .get();
        
        if (!itinerary) {
          throw new Error('Itinerary not found or access denied');
        }
        
        // Parse activities
        const activities = JSON.parse(itinerary.activities || '[]');
        
        // Award points for viewing details (5 points)
        const pointsResult = await awardPoints(env.DB, userId, 5, `view_itinerary_${itineraryId}`);
        
        const result = {
          success: true,
          itinerary: {
            id: itinerary.id,
            title: itinerary.title,
            description: itinerary.description,
            startDate: itinerary.startDate,
            endDate: itinerary.endDate,
            activities: activities,
            createdAt: itinerary.createdAt,
            lastUpdated: itinerary.updatedAt
          },
          gamification: {
            pointsAwarded: 5,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Itinerary details retrieved: ${itineraryId}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Get itinerary details error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          itineraryId: itineraryId,
          timestamp: new Date().toISOString()
        };
      }
    }
  }
];

// Helper functions

async function ensureUserExists(db: any, userId: string) {
  const { users } = await import('../db/schema.js');
  
  try {
    const existingUser = await db.select().from(users).where(eq(users.id, userId)).get();
    
    if (existingUser) {
      return existingUser;
    }
    
    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`,
      name: `User ${userId}`,
      totalPoints: 0,
      level: 1
    });
    
    return { id: userId };
  } catch (error) {
    console.error(`❌ Error ensuring user exists:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ensure user exists: ${errorMessage}`);
  }
}

async function findOrCreateDestination(db: any, userId: string, destination: string, geocodingResult: any) {
  try {
    const existing = await db
      .select()
      .from(destinations)
      .where(and(eq(destinations.userId, userId), eq(destinations.name, destination)))
      .get();
    
    if (existing) {
      return existing.id;
    }
    
    const destinationId = crypto.randomUUID();
    await db.insert(destinations).values({
      id: destinationId,
      userId: userId,
      name: geocodingResult.formattedAddress,
      country: geocodingResult.country,
      latitude: geocodingResult.latitude,
      longitude: geocodingResult.longitude,
      notes: `Destination created from itinerary: ${destination}`
    });
    
    return destinationId;
    
  } catch (error) {
    console.error(`❌ Error in findOrCreateDestination:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create destination: ${errorMessage}`);
  }
}

function calculateEndDate(startDate: string, duration: number): string {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + duration - 1);
  return end.toISOString().split('T')[0];
}


async function generateSmartItinerary(
  destination: string,
  duration: number,
  interests: string[],
  budget: string,
  travelStyle: string,
  geocodingResult: any
) {
  console.log(`🤖 Generating smart itinerary for ${destination}`);
  
  // Generate intelligent itinerary based on destination and preferences
  const dailyPlan = [];
  
  for (let day = 1; day <= duration; day++) {
    const dayPlan = generateDayPlan(day, destination, duration, interests, budget, travelStyle); // ✅ Added duration parameter
    dailyPlan.push(dayPlan);
  }
  
  return {
    overview: `A ${duration}-day ${budget} adventure in ${destination}, perfect for ${travelStyle} travelers interested in ${interests.join(' and ')}.`,
    dailyPlan: dailyPlan,
    recommendations: generateRecommendations(destination, interests, budget),
    budgetEstimate: generateBudgetEstimate(duration, budget, travelStyle),
    tips: generateLocationTips(destination, interests)
  };
}


function generateDayPlan(day: number, destination: string, duration: number, interests: string[], budget: string, travelStyle: string) {
  const activities = [];
  const cityName = destination.split(',')[0].trim();
  
  // Morning activity
  if (interests.includes('culture') || interests.includes('history')) {
    activities.push({
      time: '09:00',
      activity: `Visit ${cityName} Museum or Historic Site`,
      duration: '2-3 hours',
      type: 'cultural',
      notes: 'Perfect morning activity to learn about local culture'
    });
  } else if (interests.includes('nature')) {
    activities.push({
      time: '09:00',
      activity: `Explore ${cityName} Park or Gardens`,
      duration: '2-3 hours',
      type: 'nature',
      notes: 'Enjoy fresh air and natural beauty'
    });
  } else if (interests.includes('adventure')) {
    activities.push({
      time: '09:00',
      activity: `${cityName} Adventure Activity`,
      duration: '2-3 hours',
      type: 'adventure',
      notes: 'Start your day with an exciting adventure'
    });
  }
  
  // Lunch
  activities.push({
    time: '12:30',
    activity: interests.includes('food') ? 'Local Food Tour' : 'Traditional Restaurant',
    duration: '1-2 hours',
    type: 'dining',
    notes: budget === 'luxury' ? 'Fine dining experience' : 'Authentic local cuisine'
  });
  
  // Afternoon activity
  if (interests.includes('shopping')) {
    activities.push({
      time: '15:00',
      activity: `${cityName} Shopping District`,
      duration: '2-3 hours',
      type: 'shopping',
      notes: 'Explore local markets and boutiques'
    });
  } else if (interests.includes('art')) {
    activities.push({
      time: '15:00',
      activity: `${cityName} Art Gallery or Studio`,
      duration: '2-3 hours',
      type: 'cultural',
      notes: 'Discover local and international art'
    });
  } else if (interests.includes('adventure')) {
    activities.push({
      time: '15:00',
      activity: `${cityName} Adventure Experience`,
      duration: '2-3 hours',
      type: 'adventure',
      notes: 'Continue your adventurous exploration'
    });
  }
  
  // Evening activity
  if (interests.includes('nightlife') && travelStyle !== 'family') {
    activities.push({
      time: '19:00',
      activity: 'Evening Entertainment',
      duration: '3-4 hours',
      type: 'nightlife',
      notes: 'Experience local nightlife and entertainment'
    });
  } else {
    activities.push({
      time: '19:00',
      activity: 'Sunset Viewing & Dinner',
      duration: '2-3 hours',
      type: 'relaxation',
      notes: 'Peaceful evening with great views'
    });
  }
  
  return {
    day: day,
    date: '', // Will be calculated based on start date
    theme: day === 1 ? 'Arrival & Exploration' : day === duration ? 'Final Adventures' : `Discover ${cityName}`,
    activities: activities
  };
}


function generateRecommendations(destination: string, interests: string[], budget: string) {
  const cityName = destination.split(',')[0].trim();
  
  return {
    mustSee: [
      `${cityName} Historic Center`,
      `Famous ${cityName} Landmark`,
      `Local ${cityName} Market`
    ],
    dining: interests.includes('food') ? [
      'Local specialty restaurants',
      'Street food tours',
      'Cooking classes'
    ] : [
      'Traditional cuisine',
      'Popular local restaurants'
    ],
    transportation: budget === 'luxury' ? [
      'Private transfers',
      'Premium public transport'
    ] : [
      'Public transportation',
      'Walking and cycling',
      'Shared rides'
    ]
  };
}

function generateBudgetEstimate(duration: number, budget: string, travelStyle: string) {
  const budgetMultipliers = {
    budget: { base: 50, accommodation: 30, food: 25, activities: 20 },
    'mid-range': { base: 100, accommodation: 80, food: 50, activities: 40 },
    luxury: { base: 200, accommodation: 180, food: 100, activities: 80 }
  };
  
  const multiplier = budgetMultipliers[budget as keyof typeof budgetMultipliers];
  const styleMultiplier = travelStyle === 'family' ? 1.5 : travelStyle === 'group' ? 0.8 : 1.0;
  
  return {
    totalEstimate: Math.round(duration * multiplier.base * styleMultiplier),
    breakdown: {
      accommodation: Math.round(duration * multiplier.accommodation * styleMultiplier),
      food: Math.round(duration * multiplier.food * styleMultiplier),
      activities: Math.round(duration * multiplier.activities * styleMultiplier),
      transportation: Math.round(duration * 15 * styleMultiplier)
    },
    currency: 'USD',
    note: 'Estimates vary based on season, location, and personal preferences'
  };
}

function generateLocationTips(destination: string, interests: string[]) {
  const tips = [
    'Check local weather and pack accordingly',
    'Learn basic local phrases or greetings',
    'Research local customs and etiquette'
  ];
  
  if (interests.includes('food')) {
    tips.push('Try local street food and traditional dishes');
  }
  
  if (interests.includes('culture')) {
    tips.push('Visit during local festivals or cultural events');
  }
  
  if (interests.includes('nature')) {
    tips.push('Bring comfortable walking shoes for outdoor activities');
  }
  
  return tips;
}

async function optimizeActivities(activities: any[], goal: string) {
  console.log(`🔧 Optimizing activities for goal: ${goal}`);
  
  // Simple optimization logic (can be enhanced with real algorithms)
  let optimizedActivities = [...activities];
  
  switch (goal) {
    case 'minimize_travel_time':
      // Group nearby activities together
      optimizedActivities = activities.map(day => ({
        ...day,
        activities: day.activities.sort((a: any, b: any) => a.time.localeCompare(b.time))
      }));
      break;
      
    case 'maximize_experiences':
      // Add more diverse activities
      optimizedActivities = activities.map(day => ({
        ...day,
        activities: [...day.activities, {
          time: '16:00',
          activity: 'Hidden Local Gem',
          duration: '1-2 hours',
          type: 'discovery',
          notes: 'Explore off-the-beaten-path locations'
        }]
      }));
      break;
      
    case 'reduce_costs':
      // Replace expensive activities with budget alternatives
      optimizedActivities = activities.map(day => ({
        ...day,
        activities: day.activities.map((activity: any) => ({
          ...activity,
          notes: activity.notes + ' (Budget-friendly option)'
        }))
      }));
      break;
      
    case 'balance_activities':
      // Ensure good mix of activity types
      optimizedActivities = activities.map(day => ({
        ...day,
        theme: `Balanced ${day.theme}`,
        activities: day.activities
      }));
      break;
  }
  
  return optimizedActivities;
}

function getOptimizationImprovements(original: any[], optimized: any[], goal: string) {
  const improvements = [];
  
  switch (goal) {
    case 'minimize_travel_time':
      improvements.push('Reorganized activities to reduce travel time between locations');
      improvements.push('Grouped nearby attractions together for efficient touring');
      break;
      
    case 'maximize_experiences':
      improvements.push('Added hidden gems and local experiences');
      improvements.push('Increased variety of activity types');
      break;
      
    case 'reduce_costs':
      improvements.push('Replaced expensive activities with budget-friendly alternatives');
      improvements.push('Added cost-saving tips and recommendations');
      break;
      
    case 'balance_activities':
      improvements.push('Balanced high-energy and relaxing activities');
      improvements.push('Ensured diverse experience types throughout the trip');
      break;
  }
  
  return improvements;
}
