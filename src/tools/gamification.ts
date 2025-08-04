import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users, achievements } from '../db/schema.js';
import { getUserProgress } from '../lib/gamification.js';

export const gamificationTools = [
  {
    definition: {
      name: 'get_user_progress',
      description: 'Get comprehensive user progress including points, level, and achievements. No points awarded (informational).',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'User ID to get progress for'
          }
        },
        required: ['userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { userId } = args;
      
      try {
        console.log(`🏆 Getting progress for user ${userId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to get progress');
        }
        
        const progress = await getUserProgress(env.DB, userId);
        
        return {
          success: true,
          userId: userId,
          progress: progress,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        console.error(`❌ Get progress error:`, error);
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
      name: 'unlock_reward',
      description: 'Unlock and access special rewards based on user points. No additional points awarded.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'User ID for reward access'
          },
          rewardType: {
            type: 'string',
            description: 'Type of reward to unlock',
            enum: ['restaurant_recommendations', 'hidden_gems', 'food_specialties', 'photography_spots'],
            default: 'restaurant_recommendations'
          }
        },
        required: ['userId', 'rewardType']
      }
    },
    handler: async (args: any, env: any) => {
      const { userId, rewardType } = args;
      
      try {
        console.log(`🎁 Unlocking reward ${rewardType} for user ${userId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to unlock rewards');
        }
        
        const db = drizzle(env.DB);
        
        // Get user progress
        const progress = await getUserProgress(env.DB, userId);
        
        // Check if reward is unlocked
        const rewardRequirements = {
          restaurant_recommendations: 50,
          hidden_gems: 100,
          food_specialties: 200,
          photography_spots: 300
        };
        
        const requiredPoints = rewardRequirements[rewardType as keyof typeof rewardRequirements];
        
        if (progress.points < requiredPoints) {
          return {
            success: false,
            error: `Insufficient points. Need ${requiredPoints} points, you have ${progress.points} points.`,
            requiredPoints: requiredPoints,
            currentPoints: progress.points,
            pointsNeeded: requiredPoints - progress.points,
            timestamp: new Date().toISOString()
          };
        }
        
        // Generate reward content
        const rewardContent = generateRewardContent(rewardType);
        
        return {
          success: true,
          userId: userId,
          rewardType: rewardType,
          rewardContent: rewardContent,
          message: `🎉 Congratulations! You've unlocked ${rewardType.replace('_', ' ')}!`,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        console.error(`❌ Unlock reward error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          userId: userId,
          timestamp: new Date().toISOString()
        };
      }
    }
  }
];

function generateRewardContent(rewardType: string) {
  const rewards = {
    restaurant_recommendations: {
      title: '🍽️ Premium Restaurant Finder',
      description: 'Access to curated restaurant recommendations based on your travel destinations',
      features: [
        'Personalized dining suggestions',
        'Local hidden gem restaurants',
        'Chef recommendations',
        'Dietary restriction filters',
        'Price range matching'
      ],
      bonus: 'Unlock exclusive dining experiences and local food tours'
    },
    hidden_gems: {
      title: '💎 Hidden Gems Discovery',
      description: 'Discover secret locations and off-the-beaten-path experiences',
      features: [
        'Secret viewpoints and photo spots',
        'Local-only experiences',
        'Hidden historical sites',
        'Underground culture spots',
        'Insider access to exclusive locations'
      ],
      bonus: 'Connect with local guides for authentic experiences'
    },
    food_specialties: {
      title: '🥘 Local Food Specialties Expert',
      description: 'Master the art of finding authentic local cuisine',
      features: [
        'Traditional recipe recommendations',
        'Local market guides',
        'Seasonal food calendars',
        'Cooking class connections',
        'Food festival information'
      ],
      bonus: 'Access to local cooking classes and food tours'
    },
    photography_spots: {
      title: '📸 Photography Spots Master',
      description: 'Unlock the best photography locations and techniques',
      features: [
        'Golden hour spot recommendations',
        'Unique angle suggestions',
        'Local photography workshops',
        'Equipment rental discounts',
        'Photo editing tips'
      ],
      bonus: 'Connect with local photographers for guided photo tours'
    }
  };
  
  return rewards[rewardType as keyof typeof rewards] || {
    title: 'Unknown Reward',
    description: 'Reward details not available',
    features: [],
    bonus: 'Keep exploring!'
  };
}
