import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";



const crons = cronJobs();

// Cron jobs for background processing

// Generate semantic groups every 30 minutes
crons.interval("generate semantic groups", { minutes: 30 }, internal.semanticAnalysis.generateSemanticGroups, {});

// Detect arbitrage every 5 minutes
crons.interval("detect arbitrage", { minutes: 5 }, internal.arbitrage.detectArbitrageOpportunities, {});

export default crons;
