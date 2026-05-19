import { registerModule } from '../registry';
import { AiAudit } from './AiAudit';
import { AiAuditWidget } from './AiAuditWidget';

registerModule({
  id: 'ai-audit',
  label: 'AI Audit',
  description: 'Call a Contentful AI Action to score content quality, clarity, and completeness per entry.',
  icon: 'Ai',
  defaultEnabled: true,
  defaultOrder: 8,
  component: AiAudit,
  homeWidget: AiAuditWidget,
});
