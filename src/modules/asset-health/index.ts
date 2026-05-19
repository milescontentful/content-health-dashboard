import { registerModule } from '../registry';
import { AssetHealth } from './AssetHealth';
import { AssetHealthWidget } from './AssetHealthWidget';

registerModule({
  id: 'asset-health',
  label: 'Assets',
  description: 'Orphaned assets, oversized files, missing alt text, and format breakdown.',
  icon: 'Asset',
  defaultEnabled: true,
  defaultOrder: 4,
  component: AssetHealth,
  homeWidget: AssetHealthWidget,
});
