// A simple, standalone script to count active markets on Kalshi and Polymarket.
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

const KALSHI_API_URL = "https://trading-api.kalshi.com/v1";
const POLYMARKET_API_URL = "https://gamma-api.polymarket.com/markets";

// --- Kalshi Authentication ---
async function getKalshiToken(): Promise<string | null> {
  const email = process.env.KALSHI_EMAIL;
  const password = process.env.KALSHI_PASSWORD;

  if (!email || !password) {
    console.error("Kalshi email or password not found in .env file.");
    return null;
  }

  try {
    const response = await fetch(`${KALSHI_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      console.error(`Kalshi Login Error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: any = await response.json();
    return data.token;
  } catch (error) {
    console.error("Error during Kalshi login:", error);
    return null;
  }
}


// --- Kalshi Counter ---
async function countKalshiMarkets(token: string): Promise<number> {
  let count = 0;
  let cursor: string | null = null;
  let page = 1;

  console.log("Fetching Kalshi markets...");

  do {
    const url = cursor ? `${KALSHI_API_URL}/cached/markets/?cursor=${cursor}` : `${KALSHI_API_URL}/cached/markets/`;
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        console.error(`Kalshi API Error: ${response.status} ${response.statusText}`);
        break;
      }
      const data: any = await response.json();
      const activeMarkets = data.markets.filter((m: any) => m.status === 'active');
      count += activeMarkets.length;
      cursor = data.cursor;
      console.log(`  Kalshi Page ${page++}: Found ${activeMarkets.length} active markets (Total: ${count})`);
    } catch (error) {
      console.error("Error fetching from Kalshi:", error);
      break;
    }
  } while (cursor);

  return count;
}

// --- Polymarket Counter ---
async function countPolymarketMarkets(): Promise<number> {
  let count = 0;
  let offset = 0;
  const limit = 1000;
  let page = 1;

  console.log("Fetching Polymarket markets...");

  while (true) {
    const url = `${POLYMARKET_API_URL}?active=true&archived=false&limit=${limit}&offset=${offset}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Polymarket API Error: ${response.status} ${response.statusText}`);
        break;
      }
      const data: any = await response.json();
      const markets = data.markets || data; // API response format can vary
      if (markets.length === 0) {
        break; // No more markets
      }
      count += markets.length;
      offset += limit;
      console.log(`  Polymarket Page ${page++}: Found ${markets.length} markets (Total: ${count})`);
    } catch (error) {
      console.error("Error fetching from Polymarket:", error);
      break;
    }
  }

  return count;
}

// --- Main Execution ---
async function runVerification() {
  console.log("--- Starting Market Count Verification ---");

  const kalshiToken = await getKalshiToken();
  let kalshiCount = 0;
  if (kalshiToken) {
    kalshiCount = await countKalshiMarkets(kalshiToken);
  }

  const polymarketCount = await countPolymarketMarkets();

  console.log("\n--- Verification Complete ---");
  console.log(`Kalshi Active Markets: ${kalshiCount}`);
  console.log(`Polymarket Active Markets: ${polymarketCount}`);
  console.log("-----------------------------");
}

runVerification();