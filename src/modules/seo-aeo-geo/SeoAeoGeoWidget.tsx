import { Flex, Text, Card, Badge, TextLink, Note } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function SeoAeoGeoWidget({ onNavigate }: HomeWidgetProps) {
  return (
    <Card padding="default" style={{ height: '100%' }}>
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">SEO / AEO / GEO Audit</Text>
          <TextLink as="button" onClick={() => onNavigate('seo-aeo-geo')}>Run audit →</TextLink>
        </Flex>
        <Flex gap="spacingM" flexWrap="wrap">
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">SEO</Text>
            <Badge variant="secondary">Classic signals</Badge>
          </Flex>
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">AEO</Text>
            <Badge variant="secondary">Answer engine</Badge>
          </Flex>
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">GEO</Text>
            <Badge variant="secondary">Generative AI</Badge>
          </Flex>
        </Flex>
        <Note variant="neutral" style={{ fontSize: 12 }}>
          Select a content type in the audit tab to score entries.
        </Note>
      </Flex>
    </Card>
  );
}
