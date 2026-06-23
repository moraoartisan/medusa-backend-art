


////////////////////



import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils';

loadEnv(process.env.NODE_ENV || 'development', process.cwd());

// ─────────────────────────────────────────────────────────────
// CONDITIONAL MODULES
// Pattern: only register a module if its required env vars are present.
// This means you can deploy now with some integrations unconfigured,
// and turn them on later just by adding env vars + restarting — no
// code changes needed.
// ─────────────────────────────────────────────────────────────
const dynamicModules: Record<string, any> = {};

// --- Stripe (payments) — unchanged from Rigby's original ---
const stripeApiKey = process.env.STRIPE_API_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const isStripeConfigured = Boolean(stripeApiKey) && Boolean(stripeWebhookSecret);

if (isStripeConfigured) {
  console.log('Stripe API key and webhook secret found. Enabling payment module');
  dynamicModules[Modules.PAYMENT] = {
    resolve: '@medusajs/medusa/payment',
    options: {
      providers: [
        {
          resolve: '@medusajs/medusa/payment-stripe',
          id: 'stripe',
          options: {
            apiKey: stripeApiKey,
            webhookSecret: stripeWebhookSecret,
          },
        },
      ],
    },
  };
}

// --- Redis Event Bus ---
// Default (no module set) is an in-memory event bus: queued events
// (e.g. "order.placed" → trigger email) are LOST on every pod restart.
// In a k8s cluster, pods restart often (deploys, crashes, scaling) —
// so this is effectively required once you're running on the cluster,
// not just a "nice to have."
const eventsRedisUrl = process.env.EVENTS_REDIS_URL;
const isEventBusRedisConfigured = Boolean(eventsRedisUrl);

if (isEventBusRedisConfigured) {
  console.log('EVENTS_REDIS_URL found. Enabling Redis event bus');
  dynamicModules[Modules.EVENT_BUS] = {
    resolve: '@medusajs/medusa/event-bus-redis',
    options: {
      redisUrl: eventsRedisUrl,
      // Prevents unbounded job accumulation in Redis over time
      jobOptions: {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 3600, count: 1000 },
      },
    },
  };
} else {
  console.log('EVENTS_REDIS_URL not set — using in-memory event bus (events lost on restart)');
}

// --- Redis Workflow Engine ---
// Same reasoning as event bus: default in-memory engine loses all
// in-progress workflow state (e.g. mid-checkout steps) on restart.
const weRedisUrl = process.env.WE_REDIS_URL;
const isWorkflowEngineRedisConfigured = Boolean(weRedisUrl);

if (isWorkflowEngineRedisConfigured) {
  console.log('WE_REDIS_URL found. Enabling Redis workflow engine');
  dynamicModules[Modules.WORKFLOW_ENGINE] = {
    resolve: '@medusajs/medusa/workflow-engine-redis',
    options: {
      redis: { url: weRedisUrl },
    },
  };
} else {
  console.log('WE_REDIS_URL not set — using in-memory workflow engine (state lost on restart)');
}

// --- Redis Cache ---
// Optional performance layer — caches frequently-read data
// (e.g. product listings) to reduce DB load. Safe to skip initially;
// add later purely by setting CACHE_REDIS_URL.
const cacheRedisUrl = process.env.CACHE_REDIS_URL;
const isCacheRedisConfigured = Boolean(cacheRedisUrl);

if (isCacheRedisConfigured) {
  console.log('CACHE_REDIS_URL found. Enabling Redis cache');
  dynamicModules[Modules.CACHE] = {
    resolve: '@medusajs/medusa/cache-redis',
    options: {
      redisUrl: cacheRedisUrl,
    },
  };
} else {
  console.log('CACHE_REDIS_URL not set — using in-memory cache');
}
// ─────────────────────────────────────────────────────────────
// STATIC MODULES — exactly as Rigby shipped them, except FILE
// module updated from DO Spaces → Cloudflare R2 to match our setup.
// ─────────────────────────────────────────────────────────────
const modules = {
  // File storage — Cloudflare R2 (S3-compatible)
  [Modules.FILE]: {
  resolve: '@medusajs/medusa/file',
  options: {
    providers: [
      {
        resolve: '@medusajs/file-s3',
        id: 's3',
        options: {
          file_url: process.env.R2_PUBLIC_URL,
          access_key_id: process.env.R2_ACCESS_KEY_ID,
          secret_access_key: process.env.R2_SECRET_ACCESS_KEY,
          region: 'auto',   // required literal value for Cloudflare R2
          bucket: process.env.R2_BUCKET,
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        },
      },
    ],
  },
},

  // Notifications — Resend (email), using Rigby's custom local module
  // at src/modules/resend — handles order confirmations, password
  // resets, user invites (see src/subscribers/*.ts in your repo)
  [Modules.NOTIFICATION]: {
    resolve: '@medusajs/medusa/notification',
    options: {
      providers: [
        {
          resolve: './src/modules/resend',
          id: 'resend',
          options: {
            channels: ['email'],
            api_key: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
          },
        },
      ],
    },
  },

  // Search/filter index — REQUIRED. This is what backs the custom
  // src/api/store/search/* routes and src/scripts/enable-search-engine.ts
  // that make Rigby's fork different from vanilla Medusa. Do not remove.
  [Modules.INDEX]: {
    resolve: '@medusajs/index',
  },
};

module.exports = defineConfig({
  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL,
    disable: process.env.DISABLE_MEDUSA_ADMIN === 'true',
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,

    // workerMode lets you run separate "server" and "worker" pods
    // (matches your Phase 6.5 quick-reference: medusa-server, medusa-worker).
    // Falls back to "shared" (single process does both) if unset —
    // safe default for local dev or a single-pod deployment.
    workerMode: (process.env.MEDUSA_WORKER_MODE as 'shared' | 'worker' | 'server') || 'shared',

    http: {
      storeCors: process.env.STORE_CORS,
      adminCors: process.env.ADMIN_CORS,
      authCors: process.env.AUTH_CORS,
      jwtSecret: process.env.JWT_SECRET || 'supersecret',
      cookieSecret: process.env.COOKIE_SECRET || 'supersecret',
    },
  },
  modules: {
    ...dynamicModules,
    ...modules,
  },
});