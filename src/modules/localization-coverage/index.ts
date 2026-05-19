import { registerModule } from '../registry';
import { LocalizationCoverage } from './LocalizationCoverage';
import { LocalizationWidget } from './LocalizationWidget';

registerModule({
  id: 'localization-coverage',
  label: 'Localization',
  description: 'Heatmap of entries × locales. Quickly spot missing translations and coverage gaps.',
  icon: 'Globe',
  defaultEnabled: true,
  defaultOrder: 1,
  component: LocalizationCoverage,
  homeWidget: LocalizationWidget,
});
