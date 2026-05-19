// Importing each module file triggers its registerModule() side effect.
// Order here doesn't matter — ordering is controlled by defaultOrder + ModuleConfig.
import './production-metrics';
import './localization-coverage';
import './search-builder';
import './seo-aeo-geo';
import './asset-health';
import './taxonomy-coverage';
import './custom-content';
import './reference-risk';
import './ai-audit';
