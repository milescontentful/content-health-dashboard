import { registerModule } from '../registry';
import { Personalization } from './Personalization';
import { PersonalizationWidget } from './PersonalizationWidget';

registerModule({
  id: 'personalization',
  label: 'Personalization',
  description: 'Ninetailed experience coverage, active A/B tests, and audience targeting. Gracefully shows setup guide when Ninetailed is not installed.',
  icon: 'Users',
  defaultEnabled: true,
  defaultOrder: 9,
  component: Personalization,
  homeWidget: PersonalizationWidget,
});
