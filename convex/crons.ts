import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Cron jobs for background processing

// Platform data sync jobs
crons.interval("polymarket sync", { minutes: 30 }, internal.jobs.fetchAndStorePolymarketMarkets, {});
crons.interval("kalshi sync", { minutes: 40 }, internal.jobs.fetchAndStoreKalshiMarkets, {});

// Stagger the sync jobs to avoid overwhelming the database and API rate limits
// Each platform sync is offset by 10 minutes

// Generate semantic groups every 30 minutes
// crons.interval("generate semantic groups", { minutes: 30 }, internal.semanticAnalysis.generateSemanticGroups, {});

// Detect arbitrage every 5 minutes
crons.interval("detect arbitrage", { minutes: 5 }, internal.arbitrage.detectArbitrageOpportunities, {});

export default crons;
