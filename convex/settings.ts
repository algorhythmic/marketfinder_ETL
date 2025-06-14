import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

// Save LLM API Key for the authenticated user
export const saveLlmApiKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('User must be authenticated to save an API key.');
    }

    const userProfile = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', userId))
      .first();

    if (!userProfile) {
      throw new Error('User profile not found.');
    }

    // Update the user profile with the new API key
    await ctx.db.patch(userProfile._id, {
      llmApiKey: args.apiKey,
    });

    return { success: true };
  },
});

// Get the status of the LLM API Key for the authenticated user
export const getLlmApiKeyStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { isSet: false };
    }

    const userProfile = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', userId))
      .first();

    return { isSet: !!userProfile?.llmApiKey };
  },
});

// Delete the LLM API Key for the authenticated user
export const deleteLlmApiKey = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('User must be authenticated to delete an API key.');
    }

    const userProfile = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', userId))
      .first();

    if (!userProfile) {
      throw new Error('User profile not found.');
    }

    // Use unset to remove the field
    await ctx.db.patch(userProfile._id, {
      llmApiKey: undefined,
    });

    return { success: true };
  },
});
