#!/usr/bin/env node
/**
 * One-time setup: subscribe the app to Entry.publish events, targeting the
 * onEntryPublish App Function (auto-grade on publish → comment on the entry).
 *
 * Usage: npm run setup-events
 * Needs CONTENTFUL_ORG_ID, CONTENTFUL_APP_DEF_ID, CONTENTFUL_ACCESS_TOKEN in .env.
 */
import 'dotenv/config';
import { createClient } from 'contentful-management';

const { CONTENTFUL_ORG_ID, CONTENTFUL_APP_DEF_ID, CONTENTFUL_ACCESS_TOKEN } = process.env;

async function main() {
  if (!CONTENTFUL_ORG_ID || !CONTENTFUL_APP_DEF_ID || !CONTENTFUL_ACCESS_TOKEN) {
    console.error('Set CONTENTFUL_ORG_ID, CONTENTFUL_APP_DEF_ID, CONTENTFUL_ACCESS_TOKEN in .env');
    process.exit(1);
  }

  const client = createClient({ accessToken: CONTENTFUL_ACCESS_TOKEN }, { type: 'plain' });

  const subscription = await client.appEventSubscription.upsert(
    {
      organizationId: CONTENTFUL_ORG_ID,
      appDefinitionId: CONTENTFUL_APP_DEF_ID,
    },
    {
      topics: ['Entry.publish'],
      functions: {
        handler: {
          sys: { type: 'Link', linkType: 'Function', id: 'onEntryPublish' },
        },
      },
    },
  );

  console.log('✓ App Event Subscription created/updated:');
  console.log(`  topics:  ${subscription.topics.join(', ')}`);
  console.log('  handler: onEntryPublish (App Function)');
  console.log('\nPublish an entry in a space with the app installed to see the health comment.');
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
