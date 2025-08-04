import type { Config } from 'drizzle-kit';
import fs from 'fs';
import path from 'path';

// Function to find the local SQLite database file
function getLocalD1DB() {
  try {
    const basePath = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    
    if (!fs.existsSync(basePath)) {
      console.log('Local D1 directory not found, using fallback');
      return './local.db'; // Fallback for initial setup
    }
    
    const files = fs.readdirSync(basePath, { encoding: 'utf-8' });
    const dbFile = files.find((f) => f.endsWith('.sqlite'));
    
    if (!dbFile) {
      console.log('SQLite file not found, using fallback');
      return './local.db'; // Fallback
    }
    
    const dbPath = path.resolve(basePath, dbFile);
    console.log(`📍 Using local D1 database: ${dbPath}`);
    return dbPath;
  } catch (err) {
    console.log(`Using fallback database due to: ${err}`);
    return './local.db';
  }
}

// Detect environment
const isProduction = process.env.NODE_ENV === 'production';
const isStudio = process.argv.includes('studio');

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  
  // Use different configurations based on environment
  ...(isProduction && !isStudio ? {
    // Production configuration for remote D1
    driver: 'd1-http',
    dbCredentials: {
      wranglerConfigPath: './wrangler.toml',
      dbName: 'travel-assistant-db'
    }
  } : {
    // Local development configuration
    dbCredentials: {
      url: `file:${getLocalD1DB()}`
    }
  })
} satisfies Config;
