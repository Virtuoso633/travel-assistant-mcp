import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import { users, achievements } from '../db/schema.js';

/**
 * Award points to a user for completing an action
 */
export async function awardPoints(
  db: D1Database,
  userId: string,
  points: number,
  action: string
): Promise<{ newTotal: number; levelsGained: number; unlockedRewards: string[] }> {
  
  const drizzleDb = drizzle(db);
  
  try {
    console.log(`🎯 Awarding ${points} points to user ${userId} for action: ${action}`);
    
    // Get current user data
    const currentUser = await drizzleDb
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    
    if (!currentUser) {
      // Create new user if doesn't exist
      await drizzleDb.insert(users).values({
        id: userId,
        email: `user${userId}@example.com`, // Temporary email
        name: `User ${userId}`,
        totalPoints: points,
        level: 1
      });
      
      console.log(`✨ Created new user ${userId} with ${points} points`);
      return { newTotal: points, levelsGained: 0, unlockedRewards: [] };
    }
    
    // Calculate new totals
    const oldTotal = currentUser.totalPoints || 0;
    const newTotal = oldTotal + points;
    const oldLevel = currentUser.level || 1;
    const newLevel = calculateLevel(newTotal);
    const levelsGained = newLevel - oldLevel;
    
    // Update user points and level
    await drizzleDb
      .update(users)
      .set({
        totalPoints: newTotal,
        level: newLevel,
        updatedAt: new Date().toISOString()
      })
      .where(eq(users.id, userId));
    
    // Check for newly unlocked rewards
    const unlockedRewards = await checkUnlockedRewards(drizzleDb, userId, oldTotal, newTotal);
    
    console.log(`✅ User ${userId} now has ${newTotal} points (level ${newLevel})`);
    if (unlockedRewards.length > 0) {
      console.log(`🎉 Unlocked rewards: ${unlockedRewards.join(', ')}`);
    }
    
    return { newTotal, levelsGained, unlockedRewards };
    
  } catch (error) {
    console.error('❌ Error awarding points:', error);
    throw new Error(`Failed to award points: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate user level based on total points
 */
function calculateLevel(totalPoints: number): number {
  // Level progression: 50 points per level
  return Math.floor(totalPoints / 50) + 1;
}

/**
 * Check if user has unlocked new rewards based on points
 */
async function checkUnlockedRewards(
  db: any,
  userId: string,
  oldTotal: number,
  newTotal: number
): Promise<string[]> {
  
  const rewardThresholds = [
    { points: 50, type: 'restaurant_recommendations', name: 'Restaurant Finder' },
    { points: 100, type: 'hidden_gems', name: 'Hidden Gems Discovery' },
    { points: 200, type: 'food_specialties', name: 'Local Food Specialties' },
    { points: 300, type: 'photography_spots', name: 'Photography Spots' }
  ];
  
  const newlyUnlocked: string[] = [];
  
  for (const reward of rewardThresholds) {
    // Check if this reward was just unlocked (crossed threshold)
    if (oldTotal < reward.points && newTotal >= reward.points) {
      
      // Check if already exists in achievements
      const existingAchievement = await db
        .select()
        .from(achievements)
        .where(eq(achievements.userId, userId))
        .where(eq(achievements.achievementType, reward.type))
        .get();
      
      if (!existingAchievement) {
        // Add new achievement
        await db.insert(achievements).values({
          id: crypto.randomUUID(),
          userId: userId,
          achievementType: reward.type,
          pointsRequired: reward.points,
          unlockedAt: new Date().toISOString()
        });
        
        newlyUnlocked.push(reward.name);
      }
    }
  }
  
  return newlyUnlocked;
}

/**
 * Get user's current progress and achievements
 */
export async function getUserProgress(db: D1Database, userId: string) {
  const drizzleDb = drizzle(db);
  
  try {
    // Get user data
    const user = await drizzleDb
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    
    if (!user) {
      return {
        points: 0,
        level: 1,
        achievements: [],
        nextReward: { name: 'Restaurant Finder', pointsNeeded: 50 }
      };
    }
    
    // Get achievements
    const userAchievements = await drizzleDb
      .select()
      .from(achievements)
      .where(eq(achievements.userId, userId));
    
    // Calculate next reward
    const totalPoints = user.totalPoints || 0;
    const nextReward = getNextReward(totalPoints);
    
    return {
      points: totalPoints,
      level: user.level || 1,
      achievements: userAchievements.map(a => a.achievementType),
      nextReward
    };
    
  } catch (error) {
    console.error('❌ Error getting user progress:', error);
    throw new Error(`Failed to get user progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get the next reward the user can unlock
 */
function getNextReward(currentPoints: number) {
  const rewards = [
    { points: 50, name: 'Restaurant Finder' },
    { points: 100, name: 'Hidden Gems Discovery' },
    { points: 200, name: 'Local Food Specialties' },
    { points: 300, name: 'Photography Spots' }
  ];
  
  for (const reward of rewards) {
    if (currentPoints < reward.points) {
      return {
        name: reward.name,
        pointsNeeded: reward.points - currentPoints
      };
    }
  }
  
  return { name: 'All rewards unlocked!', pointsNeeded: 0 };
}
