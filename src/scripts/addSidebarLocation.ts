import 'dotenv/config';
import { createClient } from 'contentful-management';

const { CONTENTFUL_ORG_ID, CONTENTFUL_APP_DEF_ID, CONTENTFUL_ACCESS_TOKEN } = process.env;

async function main() {
  const client = createClient({ accessToken: CONTENTFUL_ACCESS_TOKEN! }, { type: 'plain' });
  const params = { organizationId: CONTENTFUL_ORG_ID!, appDefinitionId: CONTENTFUL_APP_DEF_ID! };
  const def = await client.appDefinition.get(params);

  const locations: any[] = def.locations ?? [];
  console.log('Current locations:', locations.map((l: any) => l.location).join(', '));

  if (locations.some((l: any) => l.location === 'entry-sidebar')) {
    console.log('entry-sidebar already present — nothing to do.');
    return;
  }

  locations.push({ location: 'entry-sidebar' });
  await client.appDefinition.update(params, { ...def, locations });
  console.log('✓ Added entry-sidebar location.');
}

main().catch((e) => { console.error('Failed:', e.message ?? e); process.exit(1); });
