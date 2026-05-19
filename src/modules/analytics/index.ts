import { registerModule } from '../registry';
import { Analytics } from './Analytics';
import { AnalyticsWidget } from './AnalyticsWidget';

registerModule({
  id: 'analytics',
  label: 'Analytics',
  description: 'Content velocity from live CMA data. Contentful Analytics integration ready to wire up when the API ships.',
  icon: 'BarChart',
  defaultEnabled: true,
  defaultOrder: 10,
  component: Analytics,
  homeWidget: AnalyticsWidget,
});
