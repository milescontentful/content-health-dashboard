import { registerModule } from '../registry';
import { SeoAeoGeoAudit } from './SeoAeoGeoAudit';
import { SeoAeoGeoWidget } from './SeoAeoGeoWidget';

registerModule({
  id: 'seo-aeo-geo',
  label: 'SEO / AEO / GEO',
  description: 'Three scorecards per entry: classic SEO signals, Answer Engine Optimization, and Generative Engine Optimization.',
  icon: 'Star',
  defaultEnabled: true,
  defaultOrder: 3,
  component: SeoAeoGeoAudit,
  homeWidget: SeoAeoGeoWidget,
});
