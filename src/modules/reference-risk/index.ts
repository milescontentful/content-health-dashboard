import { registerModule } from '../registry';
import { ReferenceRisk } from './ReferenceRisk';
import { ReferenceRiskWidget } from './ReferenceRiskWidget';

registerModule({
  id: 'reference-risk',
  label: 'References',
  description: 'Detect broken links, orphaned entries, and high blast-radius content across your space.',
  icon: 'Link',
  defaultEnabled: true,
  defaultOrder: 7,
  component: ReferenceRisk,
  homeWidget: ReferenceRiskWidget,
});
