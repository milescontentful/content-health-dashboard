import { registerModule } from '../registry';
import { ProductionMetrics } from './ProductionMetrics';
import { ProductionMetricsWidget } from './ProductionMetricsWidget';

registerModule({
  id: 'production-metrics',
  label: 'Production',
  description: 'Publishing velocity, average time to publish, scheduled releases, and stale content.',
  icon: 'BarChart',
  defaultEnabled: true,
  defaultOrder: 0,
  component: ProductionMetrics,
  homeWidget: ProductionMetricsWidget,
});
