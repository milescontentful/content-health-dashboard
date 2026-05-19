import { Flex, Text, Card, Badge, TextLink, Note } from '@contentful/f36-components';
import type { HomeWidgetProps } from '../types';

export function CustomContentWidget({ installationParams, onNavigate }: HomeWidgetProps) {
  const cards = installationParams.customCards ?? [];

  return (
    <Card padding="default" style={{ height: '100%' }}>
      <Flex flexDirection="column" gap="spacingS">
        <Flex justifyContent="space-between" alignItems="center">
          <Text fontWeight="fontWeightDemiBold">Custom Cards</Text>
          <TextLink as="button" onClick={() => onNavigate('custom-content')}>View all →</TextLink>
        </Flex>
        {cards.length === 0 ? (
          <Note variant="neutral" style={{ fontSize: 12 }}>
            Add cards in Config Screen to show talking points here.
          </Note>
        ) : (
          <Flex flexDirection="column" gap="spacingXs">
            {cards.slice(0, 3).map((card) => (
              <Flex key={card.id} justifyContent="space-between" alignItems="center">
                <Text fontSize="fontSizeS">{card.title}</Text>
                <Badge variant="secondary">{card.bullets.length} items</Badge>
              </Flex>
            ))}
            {cards.length > 3 && (
              <Text fontColor="gray500" fontSize="fontSizeS">+{cards.length - 3} more cards</Text>
            )}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
