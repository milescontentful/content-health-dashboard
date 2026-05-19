import { registerModule } from '../registry';
import { SearchBuilder } from './SearchBuilder';

registerModule({
  id: 'search-builder',
  label: 'Search',
  description: 'Visual query builder with AND/OR/NOT conditions, free-text search, and paginated results.',
  icon: 'Search',
  defaultEnabled: true,
  defaultOrder: 2,
  component: SearchBuilder,
});
