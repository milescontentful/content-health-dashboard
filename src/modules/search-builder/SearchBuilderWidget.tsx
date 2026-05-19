import { Flex, Text, Card, Badge, TextLink } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function SearchBuilderWidget({ installationParams, onNavigate }: HomeWidgetProps) {
  const savedSearches = installationParams.savedSearches ?? [];

  return (
    <Card padding="default">
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Content Search</Text>
          <TextLink as="button" onClick={() => onNavigate('search-builder')}>Open →</TextLink>
        </Flex>
        {savedSearches.length > 0 ? (
          <Flex flexDirection="column" gap="spacingXs">
            <Text fontColor="gray500" fontSize="fontSizeS">Saved searches</Text>
            <Flex gap="spacingXs" flexWrap="wrap">
              {savedSearches.slice(0, 4).map((s) => (
                <Badge key={s.id} variant="secondary">{s.label}</Badge>
              ))}
              {savedSearches.length > 4 && (
                <Badge variant="secondary">+{savedSearches.length - 4} more</Badge>
              )}
            </Flex>
          </Flex>
        ) : (
          <Text fontColor="gray500" fontSize="fontSizeS">
            Visual query builder with AND/OR/NOT conditions and paginated results.
          </Text>
        )}
      </Flex>
    </Card>
  );
}
