/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as arbitrage from "../arbitrage.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as marketUtils from "../marketUtils.js";
import type * as markets from "../markets.js";
import type * as platforms from "../platforms.js";
import type * as router from "../router.js";
import type * as sampleAlerts from "../sampleAlerts.js";
import type * as sampleData from "../sampleData.js";
import type * as semanticAnalysis from "../semanticAnalysis.js";
import type * as settings from "../settings.js";
import type * as syncLogs from "../syncLogs.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  arbitrage: typeof arbitrage;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  jobs: typeof jobs;
  marketUtils: typeof marketUtils;
  markets: typeof markets;
  platforms: typeof platforms;
  router: typeof router;
  sampleAlerts: typeof sampleAlerts;
  sampleData: typeof sampleData;
  semanticAnalysis: typeof semanticAnalysis;
  settings: typeof settings;
  syncLogs: typeof syncLogs;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
