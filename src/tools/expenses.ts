import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { expenses, destinations, users } from '../db/schema.js';
import { awardPoints } from '../lib/gamification.js';

export const expenseTools = [
  {
    definition: {
      name: 'add_expense',
      description: 'Add a travel expense with real-time currency conversion. Awards 5 points per expense.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Expense amount (positive number)',
            minimum: 0.01
          },
          currency: {
            type: 'string',
            description: 'Currency code (ISO 4217)',
            enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW', 'MXN', 'BRL', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF'],
            default: 'USD'
          },
          category: {
            type: 'string',
            description: 'Expense category',
            enum: ['accommodation', 'food', 'transport', 'activities', 'shopping', 'other'],
            default: 'other'
          },
          description: {
            type: 'string',
            description: 'Description of the expense'
          },
          location: {
            type: 'string',
            description: 'Location where expense occurred'
          },
          date: {
            type: 'string',
            description: 'Expense date (YYYY-MM-DD format)',
            default: 'today'
          },
          userId: {
            type: 'string',
            description: 'User ID for tracking and points'
          }
        },
        required: ['amount', 'currency', 'category', 'description', 'location', 'userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { amount, currency, category, description, location, date, userId } = args;
      
      try {
        console.log(`💰 Adding expense: ${amount} ${currency} for ${category} by user ${userId}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to track expenses');
        }
        
        if (amount <= 0) {
          throw new Error('Expense amount must be positive');
        }
        
        const db = drizzle(env.DB);
        
        // Convert date if needed
        const expenseDate = date === 'today' ? new Date().toISOString().split('T')[0] : date;
        
        // Get real-time currency conversion to USD
        const conversionData = await convertCurrencyReal(amount, currency, 'USD', env);
        
        // Ensure user exists first
        await ensureUserExists(db, userId);
        
        // Find or create destination
        const destinationId = await findOrCreateDestination(db, userId, location);
        
        // Add the expense
        const expenseId = crypto.randomUUID();
        await db.insert(expenses).values({
          id: expenseId,
          userId: userId,
          destinationId: destinationId,
          category: category,
          amount: amount,
          currency: currency,
          description: description,
          date: expenseDate
        });
        
        // Award points for expense tracking (5 points)
        const pointsResult = await awardPoints(env.DB, userId, 5, `expense_${category}_${amount}${currency}`);
        
        // Get real expense statistics
        const stats = await getRealExpenseStats(db, userId, location);
        
        const result = {
          success: true,
          expenseId: expenseId,
          expense: {
            amount: amount,
            currency: currency,
            category: category,
            description: description,
            location: location,
            date: expenseDate,
            conversionToUSD: {
              amount: conversionData.convertedAmount,
              rate: conversionData.rate,
              lastUpdated: conversionData.lastUpdated
            }
          },
          stats: stats,
          currencyInfo: await getCurrencyInfo(currency),
          budgetAlert: stats.totalUSD > 1000 ? 'You have spent over $1,000! Consider reviewing your budget.' : null,
          gamification: {
            pointsAwarded: 5,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Expense added: ${amount} ${currency} for ${category} (${conversionData.convertedAmount} USD)`);
        return result;
        
      } catch (error) {
        console.error(`❌ Add expense error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'get_live_exchange_rates',
      description: 'Get real-time exchange rates for multiple currencies using FreeCurrencyAPI. Awards 3 points per lookup.',
      inputSchema: {
        type: 'object',
        properties: {
          baseCurrency: {
            type: 'string',
            description: 'Base currency for rates',
            enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW'],
            default: 'USD'
          },
          targetCurrencies: {
            type: 'array',
            description: 'List of target currencies',
            items: {
              type: 'string',
              enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW', 'MXN', 'BRL', 'SGD', 'HKD']
            },
            default: ['EUR', 'GBP', 'JPY', 'CAD']
          },
          userId: {
            type: 'string',
            description: 'User ID for points tracking',
            default: 'anonymous'
          }
        },
        required: ['baseCurrency']
      }
    },
    handler: async (args: any, env: any) => {
      const { baseCurrency, targetCurrencies = ['EUR', 'GBP', 'JPY', 'CAD'], userId = 'anonymous' } = args;
      
      try {
        console.log(`💱 Getting live exchange rates for ${baseCurrency}`);
        
        // Get real-time rates from FreeCurrencyAPI
        const rates = await getLiveExchangeRates(baseCurrency);
        
        // Filter for requested currencies
        const filteredRates = targetCurrencies.reduce((acc: any, currency: string) => {
          if (rates.data && rates.data[currency]) {
            acc[currency] = {
              rate: rates.data[currency],
              symbol: getCurrencySymbol(currency),
              name: getCurrencyName(currency)
            };
          }
          return acc;
        }, {});
        
        // Award points for rate lookup (3 points)
        let pointsResult = null;
        if (userId && userId !== 'anonymous') {
          const db = drizzle(env.DB);
          await ensureUserExists(db, userId);
          pointsResult = await awardPoints(env.DB, userId, 3, `exchange_rates_${baseCurrency}`);
        }
        
        const result = {
          success: true,
          baseCurrency: {
            code: baseCurrency,
            symbol: getCurrencySymbol(baseCurrency),
            name: getCurrencyName(baseCurrency)
          },
          exchangeRates: filteredRates,
          provider: 'FreeCurrencyAPI',
          gamification: pointsResult ? {
            pointsAwarded: 3,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          } : null,
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Live exchange rates retrieved for ${baseCurrency}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Exchange rates error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          baseCurrency: baseCurrency,
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'convert_currency_live',
      description: 'Convert amounts between currencies using real-time exchange rates from FreeCurrencyAPI. Awards 2 points per conversion.',
      inputSchema: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Amount to convert',
            minimum: 0.01
          },
          fromCurrency: {
            type: 'string',
            description: 'Source currency code',
            enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW', 'MXN', 'BRL', 'SGD', 'HKD']
          },
          toCurrency: {
            type: 'string',
            description: 'Target currency code',
            enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW', 'MXN', 'BRL', 'SGD', 'HKD']
          },
          userId: {
            type: 'string',
            description: 'User ID for points tracking',
            default: 'anonymous'
          }
        },
        required: ['amount', 'fromCurrency', 'toCurrency']
      }
    },
    handler: async (args: any, env: any) => {
      const { amount, fromCurrency, toCurrency, userId = 'anonymous' } = args;
      
      try {
        console.log(`💱 Converting ${amount} ${fromCurrency} to ${toCurrency} (FreeCurrencyAPI)`);
        
        if (fromCurrency === toCurrency) {
          return {
            success: true,
            originalAmount: amount,
            originalCurrency: fromCurrency,
            convertedAmount: amount,
            convertedCurrency: toCurrency,
            exchangeRate: 1.0,
            message: 'Same currency - no conversion needed',
            timestamp: new Date().toISOString()
          };
        }
        
        // Get real-time conversion
        const conversionData = await convertCurrencyReal(amount, fromCurrency, toCurrency, env);
        
        // Award points for currency conversion (2 points)
        let pointsResult = null;
        if (userId && userId !== 'anonymous') {
          const db = drizzle(env.DB);
          await ensureUserExists(db, userId);
          pointsResult = await awardPoints(env.DB, userId, 2, `currency_conversion_${fromCurrency}_${toCurrency}`);
        }
        
        // Get additional currency information
        const fromCurrencyInfo = await getCurrencyInfo(fromCurrency);
        const toCurrencyInfo = await getCurrencyInfo(toCurrency);
        
        const result = {
          success: true,
          conversion: {
            originalAmount: amount,
            originalCurrency: fromCurrency,
            convertedAmount: conversionData.convertedAmount,
            convertedCurrency: toCurrency,
            exchangeRate: conversionData.rate,
            calculation: `${amount} ${fromCurrency} × ${conversionData.rate} = ${conversionData.convertedAmount} ${toCurrency}`
          },
          currencyInfo: {
            from: fromCurrencyInfo,
            to: toCurrencyInfo
          },
          rateInfo: {
            lastUpdated: conversionData.lastUpdated,
            provider: 'FreeCurrencyAPI'
          },
          gamification: pointsResult ? {
            pointsAwarded: 2,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          } : null,
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Converted: ${amount} ${fromCurrency} = ${conversionData.convertedAmount} ${toCurrency}`);
        return result;
        
      } catch (error) {
        console.error(`❌ Currency conversion error:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: new Date().toISOString()
        };
      }
    }
  },
  
  {
    definition: {
      name: 'get_expense_summary',
      description: 'Get comprehensive expense analysis with real currency conversions. Awards 10 points per summary.',
      inputSchema: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'User ID to get expenses for'
          },
          location: {
            type: 'string',
            description: 'Filter by specific location (optional)',
            default: ''
          },
          category: {
            type: 'string',
            description: 'Filter by expense category (optional)',
            enum: ['accommodation', 'food', 'transport', 'activities', 'shopping', 'other', 'all'],
            default: 'all'
          },
          timeRange: {
            type: 'string',
            description: 'Time range for analysis',
            enum: ['last_week', 'last_month', 'last_3_months', 'this_year', 'all_time'],
            default: 'last_month'
          },
          baseCurrency: {
            type: 'string',
            description: 'Currency for summary totals',
            enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
            default: 'USD'
          }
        },
        required: ['userId']
      }
    },
    handler: async (args: any, env: any) => {
      const { userId, location = '', category = 'all', timeRange = 'last_month', baseCurrency = 'USD' } = args;
      
      try {
        console.log(`📊 Generating expense summary for user ${userId} in ${baseCurrency}`);
        
        if (!userId || userId === 'anonymous') {
          throw new Error('User ID is required to get expense summary');
        }
        
        const db = drizzle(env.DB);
        
        // Get filtered expenses
        const allExpenses = await getFilteredExpenses(db, userId, location, category, timeRange);
        
        // Convert all expenses to base currency using real rates
        const convertedExpenses = await Promise.all(
          allExpenses.map(async (expense: any) => {
            const conversion = await convertCurrencyReal(expense.amount, expense.currency, baseCurrency, env);
            return {
              ...expense,
              convertedAmount: conversion.convertedAmount,
              conversionRate: conversion.rate,
              baseCurrency: baseCurrency
            };
          })
        );
        
        // Generate comprehensive analysis with real data
        const analysis = await generateRealExpenseAnalysis(convertedExpenses, baseCurrency);
        
        // Award points for generating summary (10 points)
        await ensureUserExists(db, userId);
        const pointsResult = await awardPoints(env.DB, userId, 10, `expense_summary_${timeRange}_${category}`);
        
        const result = {
          success: true,
          userId: userId,
          baseCurrency: baseCurrency,
          filters: {
            location: location || 'All locations',
            category: category,
            timeRange: timeRange
          },
          summary: {
            totalExpenses: convertedExpenses.length,
            totalAmount: analysis.totalSpent,
            averagePerExpense: analysis.averagePerExpense,
            averagePerDay: analysis.averagePerDay,
            highestExpense: analysis.highestExpense,
            mostExpensiveCategory: analysis.categoryBreakdown[0]?.category || 'None'
          },
          categoryBreakdown: analysis.categoryBreakdown,
          currencyBreakdown: analysis.currencyBreakdown,
          dailyTrend: analysis.dailyTrend,
          insights: analysis.insights,
          budgetRecommendations: analysis.recommendations,
          conversionNote: `All amounts converted to ${baseCurrency} using real-time exchange rates from FreeCurrencyAPI`,
          gamification: {
            pointsAwarded: 10,
            newTotal: pointsResult.newTotal,
            unlockedRewards: pointsResult.unlockedRewards
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Expense summary generated: ${convertedExpenses.length} expenses analyzed`);
        return result;
        
      } catch (error) {
        console.error(`❌ Expense summary error:`, error);
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

// Real API Functions using FreeCurrencyAPI

/**
 * Convert currency using FreeCurrencyAPI - gets rate and does manual calculation
 */
async function convertCurrencyReal(amount: number, fromCurrency: string, toCurrency: string, env: any) {
  try {
    console.log(`💱 Converting ${amount} ${fromCurrency} to ${toCurrency} using FreeCurrencyAPI`);
    
    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: amount,
        rate: 1.0,
        lastUpdated: new Date().toISOString().split('T')[0]
      };
    }
    
    // Get exchange rate from FreeCurrencyAPI
    const apiKey = env.FREE_CURRENCY_API_KEY;
    const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${apiKey}&base_currency=${fromCurrency}&currencies=${toCurrency}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TravelAssistantMCP/1.0'
      }
    });
    
    if (!response.ok) {
      console.log(`⚠️ FreeCurrencyAPI failed (${response.status}), using fallback`);
      return getFallbackConversion(amount, fromCurrency, toCurrency);
    }
    
    const data = await response.json() as { data?: Record<string, number> };
    
    if (!data.data || !data.data[toCurrency]) {
      console.log(`⚠️ No exchange rate data for ${fromCurrency} to ${toCurrency}, using fallback`);
      return getFallbackConversion(amount, fromCurrency, toCurrency);
    }
    
    const rate = data.data[toCurrency];
    const convertedAmount = Math.round((amount * rate) * 100) / 100;
    
    console.log(`✅ FreeCurrencyAPI: ${amount} ${fromCurrency} × ${rate} = ${convertedAmount} ${toCurrency}`);
    
    return {
      convertedAmount: convertedAmount,
      rate: rate,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    
  } catch (error) {
    console.error(`❌ FreeCurrencyAPI conversion error:`, error);
    console.log(`🔄 Falling back to static rates`);
    return getFallbackConversion(amount, fromCurrency, toCurrency);
  }
}

/**
 * Get live exchange rates from FreeCurrencyAPI
 */
async function getLiveExchangeRates(baseCurrency: string) {
  try {
    console.log(`💱 Getting live rates from FreeCurrencyAPI for ${baseCurrency}`);
    
    // Get all major currencies from FreeCurrencyAPI
    const currencies = 'USD,EUR,GBP,JPY,CAD,AUD,CHF,CNY,INR,KRW,MXN,BRL,SGD,HKD';
    const url = `https://api.freecurrencyapi.com/v1/latest?apikey=***REMOVED***&base_currency=${baseCurrency}&currencies=${currencies}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TravelAssistantMCP/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`FreeCurrencyAPI returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as { data?: Record<string, number> };
    
    if (!data.data) {
      throw new Error('No exchange rate data received from FreeCurrencyAPI');
    }
    
    console.log(`✅ FreeCurrencyAPI returned rates for ${Object.keys(data.data).length} currencies`);
    
    return {
      data: data.data,
      time_last_update_utc: new Date().toISOString(),
      time_next_update_utc: 'Next hour'
    };
    
  } catch (error) {
    console.error(`❌ FreeCurrencyAPI error:`, error);
    console.log(`🔄 Using fallback exchange rates`);
    return getFallbackExchangeRates(baseCurrency);
  }
}

/**
 * Fallback conversion using static rates (when API fails)
 */
function getFallbackConversion(amount: number, fromCurrency: string, toCurrency: string) {
  console.log(`🔄 Using fallback conversion rates for ${fromCurrency} to ${toCurrency}`);
  
  // Static exchange rates (approximate, updated Jan 2025)
  const rates: Record<string, Record<string, number>> = {
    'USD': { 
      'EUR': 0.92, 'GBP': 0.79, 'JPY': 149.0, 'CAD': 1.35, 'AUD': 1.51, 
      'CHF': 0.90, 'CNY': 7.24, 'INR': 83.1, 'KRW': 1315.0, 'MXN': 16.9,
      'BRL': 5.03, 'SGD': 1.34, 'HKD': 7.83, 'NOK': 10.8, 'SEK': 10.5, 'DKK': 6.9
    },
    'EUR': { 
      'USD': 1.08, 'GBP': 0.86, 'JPY': 161.2, 'CAD': 1.46, 'AUD': 1.64,
      'CHF': 0.97, 'CNY': 7.83, 'INR': 89.9, 'KRW': 1423.0
    },
    'GBP': { 
      'USD': 1.27, 'EUR': 1.16, 'JPY': 188.2, 'CAD': 1.71, 'AUD': 1.91,
      'CHF': 1.14, 'CNY': 9.14, 'INR': 105.0
    }
  };
  
  let rate = 1.0;
  
  if (fromCurrency === toCurrency) {
    rate = 1.0;
  } else if (rates[fromCurrency] && rates[fromCurrency][toCurrency]) {
    rate = rates[fromCurrency][toCurrency];
  } else if (rates[toCurrency] && rates[toCurrency][fromCurrency]) {
    rate = 1.0 / rates[toCurrency][fromCurrency];
  } else {
    // Cross-conversion via USD
    const fromToUSD = rates[fromCurrency] ? (rates[fromCurrency]['USD'] || 1.0) : 1.0;
    const usdToTarget = rates['USD'] ? (rates['USD'][toCurrency] || 1.0) : 1.0;
    rate = fromToUSD * usdToTarget;
  }
  
  const convertedAmount = Math.round((amount * rate) * 100) / 100;
  
  return {
    convertedAmount: convertedAmount,
    rate: rate,
    lastUpdated: new Date().toISOString().split('T')[0] + ' (fallback rates)'
  };
}

/**
 * Fallback exchange rates (when API fails)
 */
function getFallbackExchangeRates(baseCurrency: string) {
  console.log(`🔄 Using fallback exchange rates for ${baseCurrency}`);
  
  const baseRates: Record<string, Record<string, number>> = {
    'USD': { 
      'EUR': 0.92, 'GBP': 0.79, 'JPY': 149.0, 'CAD': 1.35, 'AUD': 1.51, 
      'CHF': 0.90, 'CNY': 7.24, 'INR': 83.1, 'KRW': 1315.0
    },
    'EUR': { 
      'USD': 1.08, 'GBP': 0.86, 'JPY': 161.2, 'CAD': 1.46, 'AUD': 1.64
    },
    'GBP': { 
      'USD': 1.27, 'EUR': 1.16, 'JPY': 188.2, 'CAD': 1.71, 'AUD': 1.91
    }
  };
  
  return {
    data: baseRates[baseCurrency] || baseRates['USD'],
    time_last_update_utc: new Date().toISOString().split('T')[0] + ' (fallback)',
    time_next_update_utc: 'Static rates'
  };
}

/**
 * Get currency information using REST Countries API
 */
async function getCurrencyInfo(currencyCode: string) {
  try {
    // Try to get currency info from REST Countries API
    const url = `https://restcountries.com/v3.1/currency/${currencyCode}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json() as Array<any>;
      if (Array.isArray(data) && data.length > 0) {
        const country = data[0];
        const currencyInfo = country.currencies[currencyCode];
        
        return {
          code: currencyCode,
          name: currencyInfo.name,
          symbol: currencyInfo.symbol || getCurrencySymbol(currencyCode),
          countries: data.map((c: any) => c.name.common).slice(0, 3)
        };
      }
    }
    
    // Fallback to static data
    return {
      code: currencyCode,
      name: getCurrencyName(currencyCode),
      symbol: getCurrencySymbol(currencyCode),
      countries: ['Various']
    };
    
  } catch (error) {
    console.error(`⚠️ Currency info error for ${currencyCode}:`, error);
    return {
      code: currencyCode,
      name: getCurrencyName(currencyCode),
      symbol: getCurrencySymbol(currencyCode),
      countries: ['Unknown']
    };
  }
}

// Helper functions for currency data
function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CAD': 'C$', 
    'AUD': 'A$', 'CHF': 'CHF', 'CNY': '¥', 'INR': '₹', 'KRW': '₩',
    'MXN': '$', 'BRL': 'R$', 'SGD': 'S$', 'HKD': 'HK$'
  };
  return symbols[code] || code;
}

function getCurrencyName(code: string): string {
  const names: Record<string, string> = {
    'USD': 'US Dollar', 'EUR': 'Euro', 'GBP': 'British Pound', 'JPY': 'Japanese Yen',
    'CAD': 'Canadian Dollar', 'AUD': 'Australian Dollar', 'CHF': 'Swiss Franc',
    'CNY': 'Chinese Yuan', 'INR': 'Indian Rupee', 'KRW': 'South Korean Won',
    'MXN': 'Mexican Peso', 'BRL': 'Brazilian Real', 'SGD': 'Singapore Dollar', 'HKD': 'Hong Kong Dollar'
  };
  return names[code] || code;
}

// Database helper functions
async function findOrCreateDestination(db: any, userId: string, location: string) {
  try {
    // Try to find existing destination
    const existing = await db
      .select()
      .from(destinations)
      .where(and(eq(destinations.userId, userId), eq(destinations.name, location)))
      .get();
    
    if (existing) {
      console.log(`✅ Found existing destination: ${location} for user ${userId}`);
      return existing.id;
    }
    
    // Create new destination
    const destinationId = crypto.randomUUID();
    console.log(`🏗️ Creating new destination: ${location} for user ${userId}`);
    
    await db.insert(destinations).values({
      id: destinationId,
      userId: userId,
      name: location,
      country: 'Unknown',
      latitude: 40.7128,
      longitude: -74.0060,
      notes: `Destination created from expense: ${location}`
    });
    
    console.log(`✅ Created destination: ${destinationId}`);
    return destinationId;
    
  } catch (error) {
    console.error(`❌ Error in findOrCreateDestination:`, error);
    const errorMessage = typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error);
    throw new Error(`Failed to create destination: ${errorMessage}`);
  }
}

/**
 * Ensure user exists in database before creating related records
 */
async function ensureUserExists(db: any, userId: string) {
  try {
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    
    if (existingUser) {
      console.log(`✅ User ${userId} exists`);
      return existingUser;
    }
    
    // Create new user
    console.log(`🏗️ Creating new user: ${userId}`);
    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.com`, // Temporary email
      name: `User ${userId}`,
      totalPoints: 0,
      level: 1
    });
    
    console.log(`✅ Created user: ${userId}`);
    return { id: userId };
    
  } catch (error) {
    console.error(`❌ Error ensuring user exists:`, error);
    const errorMessage = typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error);
    throw new Error(`Failed to ensure user exists: ${errorMessage}`);
  }
}

async function getRealExpenseStats(db: any, userId: string, location?: string) {
  const userExpenses = await db
    .select()
    .from(expenses)
    .where(eq(expenses.userId, userId));
  
  const filteredExpenses = location ? 
    userExpenses.filter((exp: any) => exp.description.toLowerCase().includes(location.toLowerCase())) :
    userExpenses;
  
  // Convert all to USD using real rates
  let totalUSD = 0;
  for (const expense of filteredExpenses) {
    try {
      const conversion = await convertCurrencyReal(expense.amount, expense.currency, 'USD', env);
      totalUSD += conversion.convertedAmount;
    } catch (error) {
      console.error(`Error converting ${expense.currency} to USD:`, error);
      totalUSD += expense.amount; // Fallback: assume USD
    }
  }
  
  return {
    totalExpenses: filteredExpenses.length,
    totalUSD: Math.round(totalUSD * 100) / 100,
    averageExpense: filteredExpenses.length > 0 ? Math.round((totalUSD / filteredExpenses.length) * 100) / 100 : 0
  };
}

async function getFilteredExpenses(db: any, userId: string, location: string, category: string, timeRange: string) {
  let expenseRows: any[] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.userId, userId));
  
  // Apply filters
  if (location) {
    expenseRows = expenseRows.filter((exp: any) => 
      exp.description.toLowerCase().includes(location.toLowerCase())
    );
  }
  
  if (category !== 'all') {
    expenseRows = expenseRows.filter((exp: any) => exp.category === category);
  }
  
  // Apply time range filter
  const now = new Date();
  let startDate = new Date();
  
  switch (timeRange) {
    case 'last_week':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'last_month':
      startDate.setMonth(now.getMonth() - 1);
      break;
    case 'last_3_months':
      startDate.setMonth(now.getMonth() - 3);
      break;
    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default: // all_time
      startDate = new Date('2020-01-01');
  }
  
  if (timeRange !== 'all_time') {
    expenseRows = expenseRows.filter((exp: any) => 
      new Date(exp.date) >= startDate
    );
  }
  
  return expenseRows;
}

async function generateRealExpenseAnalysis(expenses: any[], baseCurrency: string) {
  if (expenses.length === 0) {
    return {
      totalSpent: 0,
      averagePerExpense: 0,
      averagePerDay: 0,
      highestExpense: null,
      categoryBreakdown: [],
      currencyBreakdown: [],
      dailyTrend: [],
      insights: ['No expenses found for the selected criteria'],
      recommendations: ['Start tracking your expenses to get insights!']
    };
  }
  
  // Calculate totals using converted amounts
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.convertedAmount, 0);
  const avgPerExpense = Math.round((totalSpent / expenses.length) * 100) / 100;
  
  // Calculate daily average
  const dates = [...new Set(expenses.map(exp => exp.date))];
  const avgPerDay = dates.length > 0 ? Math.round((totalSpent / dates.length) * 100) / 100 : 0;
  
  // Find highest expense
  const highestExpense = expenses.reduce((max, exp) => 
    exp.convertedAmount > max.convertedAmount ? exp : max
  );
  
  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  expenses.forEach(exp => {
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.convertedAmount;
  });
  
  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      total: Math.round(total * 100) / 100,
      percentage: Math.round((total / totalSpent) * 100),
      currency: baseCurrency
    }))
    .sort((a, b) => b.total - a.total);
  
  // Currency breakdown
  const currencyTotals: Record<string, { original: number, converted: number }> = {};
  expenses.forEach(exp => {
    if (!currencyTotals[exp.currency]) {
      currencyTotals[exp.currency] = { original: 0, converted: 0 };
    }
    currencyTotals[exp.currency].original += exp.amount;
    currencyTotals[exp.currency].converted += exp.convertedAmount;
  });
  
  const currencyBreakdown = Object.entries(currencyTotals)
    .map(([currency, amounts]) => ({
      currency,
      originalTotal: Math.round(amounts.original * 100) / 100,
      convertedTotal: Math.round(amounts.converted * 100) / 100,
      percentage: Math.round((amounts.converted / totalSpent) * 100)
    }))
    .sort((a, b) => b.convertedTotal - a.convertedTotal);
  
  // Generate insights
  const insights = [];
  const topCategory = categoryBreakdown[0];
  if (topCategory) {
    insights.push(`Your highest spending category is ${topCategory.category} (${topCategory.percentage}% of total)`);
  }
  
  if (avgPerDay > 50) {
    insights.push(`You're spending an average of ${getCurrencySymbol(baseCurrency)}${avgPerDay}/day`);
  }
  
  if (currencyBreakdown.length > 1) {
    insights.push(`You've spent in ${currencyBreakdown.length} different currencies`);
  }
  
  const recommendations = [
    'Consider using local currency to avoid conversion fees',
    'Track expenses in real-time for better budget control',
    'Set category-specific budget limits based on your spending patterns'
  ];
  
  return {
    totalSpent: Math.round(totalSpent * 100) / 100,
    averagePerExpense: avgPerExpense,
    averagePerDay: avgPerDay,
    highestExpense: {
      amount: highestExpense.convertedAmount,
      originalAmount: highestExpense.amount,
      originalCurrency: highestExpense.currency,
      description: highestExpense.description,
      category: highestExpense.category
    },
    categoryBreakdown,
    currencyBreakdown,
    dailyTrend: [], // Could be expanded with date-based analysis
    insights,
    recommendations
  };
}
