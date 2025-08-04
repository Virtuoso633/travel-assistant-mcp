import { sql } from 'drizzle-orm';
import { text, integer, real, sqliteTable } from 'drizzle-orm/sqlite-core';

// Users table - stores user profiles and gamification data
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // Unique user identifier
  email: text('email').unique().notNull(),        // User's email (must be unique)
  name: text('name').notNull(),                   // User's display name
  totalPoints: integer('total_points').default(0), // Gamification points earned
  level: integer('level').default(1),             // User level (future feature)
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`), // When account was created
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)  // Last profile update
});

// Destinations table - stores places users want to visit
export const destinations = sqliteTable('destinations', {
  id: text('id').primaryKey(),                    // Unique destination identifier
  userId: text('user_id').references(() => users.id), // Links to user who added it
  name: text('name').notNull(),                   // Destination name (e.g., "Paris")
  country: text('country').notNull(),             // Country name (e.g., "France")
  latitude: real('latitude').notNull(),           // GPS coordinates for maps
  longitude: real('longitude').notNull(),         // GPS coordinates for maps
  visitDate: text('visit_date'),                  // Planned visit date (optional)
  notes: text('notes'),                           // User's personal notes
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`) // When destination was added
});

// Expenses table - tracks all travel spending
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),                    // Unique expense identifier
  userId: text('user_id').references(() => users.id), // Links to user who spent
  destinationId: text('destination_id').references(() => destinations.id), // Links to destination
  category: text('category').notNull(),           // Type: food, transport, accommodation, activities, other
  amount: real('amount').notNull(),               // Money spent (decimal number)
  currency: text('currency').notNull(),           // Currency code (USD, EUR, etc.)
  description: text('description'),               // What was purchased
  date: text('date'),                             // When expense occurred
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`) // When expense was logged
});

// Itineraries table - stores travel plans and daily schedules
export const itineraries = sqliteTable('itineraries', {
  id: text('id').primaryKey(),                    // Unique itinerary identifier
  userId: text('user_id').references(() => users.id), // Links to user who created it
  destinationId: text('destination_id').references(() => destinations.id), // Links to destination
  title: text('title').notNull(),                 // Itinerary name (e.g., "5 Days in Tokyo")
  description: text('description'),               // Detailed description
  startDate: text('start_date'),                  // Trip start date
  endDate: text('end_date'),                      // Trip end date
  activities: text('activities'),                 // JSON string of planned activities
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`), // When itinerary was created
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)  // Last modification
});

// Events table - stores interesting events and attractions users discover
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),                    // Unique event identifier
  userId: text('user_id').references(() => users.id), // Links to user who saved it
  destinationId: text('destination_id').references(() => destinations.id), // Links to destination
  title: text('title').notNull(),                 // Event name
  description: text('description'),               // Event details
  eventDate: text('event_date'),                  // When event happens
  location: text('location'),                     // Event venue/address
  source: text('source'),                         // How we found it: google_places, manual, ai_recommendation
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`) // When event was saved
});

// Achievements table - tracks gamification rewards and unlocked features
export const achievements = sqliteTable('achievements', {
  id: text('id').primaryKey(),                    // Unique achievement identifier
  userId: text('user_id').references(() => users.id), // Links to user who earned it
  achievementType: text('achievement_type').notNull(), // Type: restaurant_recommendations, hidden_gems, food_specialties, photography_spots
  unlockedAt: text('unlocked_at').default(sql`CURRENT_TIMESTAMP`), // When reward was unlocked
  pointsRequired: integer('points_required').notNull() // How many points were needed
});

// Export types for TypeScript (helps with code completion and error checking)
export type User = typeof users.$inferSelect;           // Type for reading user data
export type NewUser = typeof users.$inferInsert;       // Type for creating new user
export type Destination = typeof destinations.$inferSelect;
export type NewDestination = typeof destinations.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Itinerary = typeof itineraries.$inferSelect;
export type NewItinerary = typeof itineraries.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
