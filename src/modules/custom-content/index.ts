import { registerModule } from '../registry';
import { CustomContent } from './CustomContent';
import { CustomContentWidget } from './CustomContentWidget';

registerModule({
  id: 'custom-content',
  label: 'Cards',
  description: 'Free-form cards authored in Config Screen. Add talking points, links, or demo notes for non-dev audiences.',
  icon: 'LayoutGrid',
  defaultEnabled: true,
  defaultOrder: 6,
  component: CustomContent,
  homeWidget: CustomContentWidget,
});
