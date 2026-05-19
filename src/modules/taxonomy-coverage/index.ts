import { registerModule } from '../registry';
import { TaxonomyCoverage } from './TaxonomyCoverage';
import { TaxonomyWidget } from './TaxonomyWidget';

registerModule({
  id: 'taxonomy-coverage',
  label: 'Taxonomy',
  description: 'Concept assignment coverage per content type — pairs with your Taxonomy Viewer app.',
  icon: 'ListBulleted',
  defaultEnabled: true,
  defaultOrder: 5,
  component: TaxonomyCoverage,
  homeWidget: TaxonomyWidget,
});
