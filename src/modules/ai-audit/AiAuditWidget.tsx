import { Flex, Text, Card, Badge, TextLink, Note } from '@contentful/f36-components';
import { OpenAiLogoIcon } from '@contentful/f36-icons';
import type { HomeWidgetProps } from '../types';

export function AiAuditWidget({ installationParams, onNavigate }: HomeWidgetProps) {
  const actionId = (installationParams as any).aiActionId ?? '';

  return (
    <Card padding="default" style={{ height: '100%' }}>
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Flex alignItems="center" gap="spacingXs">
            <OpenAiLogoIcon size="small" style={{ color: '#8B2EEA' }} />
            <Text fontWeight="fontWeightDemiBold">AI Content Audit</Text>
          </Flex>
          <TextLink as="button" onClick={() => onNavigate('ai-audit')}>Run audit →</TextLink>
        </Flex>
        {actionId ? (
          <Flex gap="spacingM">
            <Flex flexDirection="column" gap="spacingXs">
              <Text fontColor="gray500" fontSize="fontSizeS">AI Action</Text>
              <Badge variant="positive">Configured</Badge>
            </Flex>
          </Flex>
        ) : (
          <Note variant="warning" style={{ fontSize: 12 }}>
            Configure an AI Action ID in Config Screen to enable live scoring.
          </Note>
        )}
      </Flex>
    </Card>
  );
}
