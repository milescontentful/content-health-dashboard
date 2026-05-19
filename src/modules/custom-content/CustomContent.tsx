import { useState } from 'react';
import { Flex, Text, Card, Note, Badge } from '@contentful/f36-components';
import type { ModuleProps, CustomCard } from '../types';

interface ExpandedCardProps {
  card: CustomCard;
  onClose: () => void;
}

function ExpandedCard({ card, onClose }: ExpandedCardProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, padding: 32, maxWidth: 560, width: '90%' }}
      >
        <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeXl" as="p" marginBottom="spacingM">
          {card.title}
        </Text>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          {card.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.5 }}>{b}</li>
          ))}
        </ul>
        {card.url && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', marginTop: 16, color: '#1773EB', fontSize: 14 }}
          >
            Learn more →
          </a>
        )}
        <button
          onClick={onClose}
          style={{ marginTop: 24, padding: '8px 16px', borderRadius: 6, border: '1px solid #cfd9e0', cursor: 'pointer', background: '#f7f9fa', fontSize: 14 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function CustomContent({ installationParams }: ModuleProps) {
  const cards: CustomCard[] = installationParams.customCards ?? [];
  const [expanded, setExpanded] = useState<CustomCard | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());

  if (cards.length === 0) {
    return (
      <Note variant="neutral">
        No cards configured. Go to the <strong>App Configuration → Custom Cards</strong> section to author your cards.
      </Note>
    );
  }

  const handleClick = (card: CustomCard) => {
    setVisited((v) => new Set([...v, card.id]));
    setExpanded(card);
  };

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex flexDirection="column" gap="spacingXs">
        <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeL">Custom Content</Text>
        <Text fontColor="gray600" fontSize="fontSizeS">Free-form cards authored in Config Screen. Add talking points, links, or demo notes.</Text>
      </Flex>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {cards.map((card) => (
          <Card
            key={card.id}
            padding="default"
            style={{
              cursor: 'pointer',
              opacity: visited.has(card.id) ? 0.65 : 1,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onClick={() => handleClick(card)}
          >
            <Flex justifyContent="space-between" alignItems="flex-start" marginBottom="spacingS">
              <Text fontWeight="fontWeightDemiBold">{card.title}</Text>
              {visited.has(card.id) && <Badge variant="secondary">Visited</Badge>}
            </Flex>
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              {card.bullets.slice(0, 3).map((b, i) => (
                <li key={i} style={{ fontSize: 13, color: '#6f7e8c', marginBottom: 4 }}>{b}</li>
              ))}
              {card.bullets.length > 3 && (
                <li style={{ fontSize: 13, color: '#a8bbc6' }}>+{card.bullets.length - 3} more…</li>
              )}
            </ul>
            {card.url && (
              <Text fontSize="fontSizeS" fontColor="blue500" marginTop="spacingXs">
                {card.url}
              </Text>
            )}
          </Card>
        ))}
      </div>

      {expanded && <ExpandedCard card={expanded} onClose={() => setExpanded(null)} />}
    </Flex>
  );
}
