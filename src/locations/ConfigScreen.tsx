import React, { useCallback, useState, useEffect } from 'react';
import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Heading,
  Form,
  Flex,
  FormControl,
  Switch,
  Text,
  Paragraph,
  Image,
  Select,
  Tooltip,
  TextInput,
  Button,
  Card,
  Note,
  IconButton,
  Stack,
  Badge,
} from '@contentful/f36-components';
import { DotsSixVerticalIcon, PlusIcon, TrashSimpleIcon, InfoIcon } from '@contentful/f36-icons';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useSortable, SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import ContentTypeMultiSelect, { ContentType } from '../components/ContentTypeMultiSelect';
import {
  NEEDS_UPDATE_MONTHS_RANGE,
  RECENTLY_PUBLISHED_DAYS_RANGE,
  TIME_TO_PUBLISH_DAYS_RANGE,
  CREATOR_VIEW_OPTIONS,
} from '../utils/consts';
import { CreatorViewSetting, ConfigField } from '../utils/types';
import gearImage from '../assets/gear.png';
import appearanceImage from '../assets/appearance.png';
import { styles } from './ConfigScreen.styles';
import { Validator } from '../utils/Validator';
import TextInputInteger from '../components/TextInputInteger';
import { getModuleConfigs } from '../modules/registry';
import type { AppInstallationParameters, ModuleConfig, CustomCard, ThemeConfig } from '../modules/types';
import { DEFAULT_THEME, CONTENTFUL_BRAND_COLORS } from '../modules/types';
// Register modules so getModuleConfigs works
import '../modules';

// ─── Module manager row ───────────────────────────────────────────────────────

function SortableModuleRow({
  mod,
  onToggle,
}: {
  mod: ReturnType<typeof getModuleConfigs>[0];
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
    width: '100%',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card padding="default" style={{ width: '100%', boxSizing: 'border-box' }}>
        <Flex alignItems="center" gap="spacingS">
          <span
            {...attributes}
            {...listeners}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', color: '#8c9bab', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <DotsSixVerticalIcon />
          </span>
          <Flex flexDirection="column" style={{ flex: 1, minWidth: 0 }}>
            <Text fontWeight="fontWeightDemiBold">{mod.label}</Text>
            <Text fontColor="gray500" fontSize="fontSizeS">
              {mod.description}
            </Text>
          </Flex>
          <Switch
            id={`module-toggle-${mod.id}`}
            isChecked={mod.enabled}
            onChange={() => onToggle(mod.id)}
          >
            {mod.enabled ? 'On' : 'Off'}
          </Switch>
        </Flex>
      </Card>
    </div>
  );
}

// ─── Custom card editor ───────────────────────────────────────────────────────

function CustomCardEditor({
  cards,
  onChange,
}: {
  cards: CustomCard[];
  onChange: (cards: CustomCard[]) => void;
}) {
  const addCard = () => {
    onChange([
      ...cards,
      { id: `card-${Date.now()}`, title: 'New card', bullets: ['Add a bullet point'] },
    ]);
  };

  const updateCard = (id: string, patch: Partial<CustomCard>) => {
    onChange(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCard = (id: string) => onChange(cards.filter((c) => c.id !== id));

  const updateBullet = (cardId: string, idx: number, value: string) => {
    const card = cards.find((c) => c.id === cardId)!;
    const bullets = [...card.bullets];
    bullets[idx] = value;
    updateCard(cardId, { bullets });
  };

  const addBullet = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId)!;
    updateCard(cardId, { bullets: [...card.bullets, ''] });
  };

  const removeBullet = (cardId: string, idx: number) => {
    const card = cards.find((c) => c.id === cardId)!;
    updateCard(cardId, { bullets: card.bullets.filter((_, i) => i !== idx) });
  };

  return (
    <Stack flexDirection="column" spacing="spacingS">
      {cards.map((card) => (
        <Card key={card.id} padding="default">
          <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingS">
            <TextInput
              value={card.title}
              onChange={(e) => updateCard(card.id, { title: e.target.value })}
              placeholder="Card title"
              size="small"
            />
            <IconButton
              variant="transparent"
              icon={<TrashSimpleIcon />}
              aria-label="Delete card"
              onClick={() => removeCard(card.id)}
            />
          </Flex>
          <Stack flexDirection="column" spacing="spacingXs">
            {card.bullets.map((bullet, idx) => (
              <Flex key={idx} gap="spacingXs" alignItems="center">
                <Text fontColor="gray500">•</Text>
                <TextInput
                  value={bullet}
                  onChange={(e) => updateBullet(card.id, idx, e.target.value)}
                  placeholder={`Bullet ${idx + 1}`}
                  size="small"
                  style={{ flex: 1 }}
                />
                <IconButton
                  variant="transparent"
                  icon={<TrashSimpleIcon />}
                  aria-label="Remove bullet"
                  size="small"
                  onClick={() => removeBullet(card.id, idx)}
                />
              </Flex>
            ))}
            <Button size="small" variant="transparent" startIcon={<PlusIcon />} onClick={() => addBullet(card.id)}>
              Add bullet
            </Button>
          </Stack>
          <FormControl marginTop="spacingS">
            <FormControl.Label>URL (optional)</FormControl.Label>
            <TextInput
              value={card.url ?? ''}
              onChange={(e) => updateCard(card.id, { url: e.target.value })}
              placeholder="https://..."
              size="small"
            />
          </FormControl>
        </Card>
      ))}
      <Button variant="secondary" startIcon={<PlusIcon />} onClick={addCard}>
        Add card
      </Button>
    </Stack>
  );
}

// ─── Theme editor ─────────────────────────────────────────────────────────────

function ThemeEditor({
  theme,
  onChange,
  sdk,
}: {
  theme: ThemeConfig;
  onChange: (t: ThemeConfig) => void;
  sdk: ConfigAppSDK;
}) {
  const update = (patch: Partial<ThemeConfig>) => onChange({ ...theme, ...patch });

  const pickBackgroundFromContentful = async () => {
    try {
      const asset = await sdk.dialogs.selectSingleAsset({});
      if (!asset) return;
      const fileFields = (asset as any).fields?.file;
      if (!fileFields) return;
      const locale = Object.keys(fileFields)[0];
      const url: string | undefined = fileFields[locale]?.url;
      if (url) update({ backgroundImageUrl: url.startsWith('http') ? url : `https:${url}` });
    } catch {
      sdk.notifier.error('Could not pick asset. Please try again.');
    }
  };

  const pickLogoFromContentful = async () => {
    try {
      const asset = await sdk.dialogs.selectSingleAsset({});
      if (!asset) return;
      const fileFields = (asset as any).fields?.file;
      if (!fileFields) return;
      const locale = Object.keys(fileFields)[0];
      const url: string | undefined = fileFields[locale]?.url;
      if (url) update({ brandLogoUrl: url.startsWith('http') ? url : `https:${url}` });
    } catch {
      sdk.notifier.error('Could not pick asset. Please try again.');
    }
  };

  return (
    <Stack flexDirection="column" spacing="spacingM">
      <FormControl>
        <FormControl.Label>Dashboard title</FormControl.Label>
        <TextInput
          value={theme.dashboardTitle}
          onChange={(e) => update({ dashboardTitle: e.target.value })}
          placeholder="Content Health Dashboard"
        />
      </FormControl>

      <FormControl>
        <FormControl.Label>Accent color</FormControl.Label>
        <Flex gap="spacingXs" flexWrap="wrap" marginBottom="spacingXs">
          {CONTENTFUL_BRAND_COLORS.map((c) => (
            <button
              key={c.hex}
              title={c.name}
              onClick={() => update({ accentColor: c.hex })}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: c.hex,
                border: theme.accentColor === c.hex ? '3px solid #000' : '2px solid #ccc',
                cursor: 'pointer',
              }}
            />
          ))}
        </Flex>
        <Flex gap="spacingXs" alignItems="center">
          <input
            type="color"
            value={theme.accentColor}
            onChange={(e) => update({ accentColor: e.target.value })}
            style={{ width: 40, height: 32, cursor: 'pointer', borderRadius: 4 }}
          />
          <TextInput
            value={theme.accentColor}
            onChange={(e) => update({ accentColor: e.target.value })}
            size="small"
            style={{ width: 120, fontFamily: 'monospace' }}
          />
        </Flex>
      </FormControl>

      <FormControl>
        <FormControl.Label>Background image</FormControl.Label>
        <Flex gap="spacingS" alignItems="center">
          <Button size="small" variant="secondary" onClick={pickBackgroundFromContentful}>
            Pick from Contentful Media
          </Button>
          {theme.backgroundImageUrl && (
            <Button size="small" variant="transparent" onClick={() => update({ backgroundImageUrl: undefined })}>
              Remove
            </Button>
          )}
        </Flex>
        {theme.backgroundImageUrl && (
          <img
            src={theme.backgroundImageUrl}
            alt="Background preview"
            style={{ marginTop: 8, width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, filter: `blur(${(theme.imageBlur ?? 5) * 0.4}px)` }}
          />
        )}
      </FormControl>

      <FormControl>
        <FormControl.Label>Brand logo</FormControl.Label>
        <Flex gap="spacingS" alignItems="center">
          <Button size="small" variant="secondary" onClick={pickLogoFromContentful}>
            Pick from Contentful Media
          </Button>
          {theme.brandLogoUrl && (
            <>
              <img src={theme.brandLogoUrl} alt="Logo preview" style={{ height: 28, width: 28, objectFit: 'contain' }} />
              <Button size="small" variant="transparent" onClick={() => update({ brandLogoUrl: undefined })}>
                Remove
              </Button>
            </>
          )}
        </Flex>
      </FormControl>
    </Stack>
  );
}

// ─── Main Config Screen ───────────────────────────────────────────────────────

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();
  const [parameters, setParameters] = useState<AppInstallationParameters>({});
  const [selectedContentTypes, setSelectedContentTypes] = useState<ContentType[]>([]);
  const [selectedTopLevelCTs, setSelectedTopLevelCTs] = useState<ContentType[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<'analytics' | 'modules' | 'theme' | 'cards' | 'ai' | 'p13n' | 'contentful-analytics' | 'reference-risk'>('analytics');

  // Module configs derived from params
  const moduleConfigs = getModuleConfigs(parameters);
  const [orderedModules, setOrderedModules] = useState(moduleConfigs);

  useEffect(() => {
    setOrderedModules(getModuleConfigs(parameters));
  }, [parameters.modules]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const handleModuleToggle = (id: string) => {
    setOrderedModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
    );
    syncModulesToParams(
      orderedModules.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
    );
  };

  const handleModuleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedModules.findIndex((m) => m.id === active.id);
    const newIdx = orderedModules.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(orderedModules, oldIdx, newIdx);
    setOrderedModules(reordered);
    syncModulesToParams(reordered);
  };

  const syncModulesToParams = (mods: typeof orderedModules) => {
    const moduleParams: ModuleConfig[] = mods.map((m, i) => ({
      id: m.id,
      enabled: m.enabled,
      order: i,
    }));
    setParameters((prev) => ({ ...prev, modules: moduleParams }));
  };

  const validationErrors = (): boolean => {
    const newErrors: Record<string, string> = {};
    Validator.isWithinRange(newErrors, parameters.needsUpdateMonths, ConfigField.NeedsUpdateMonths, 'Needs update months', NEEDS_UPDATE_MONTHS_RANGE);
    Validator.isWithinRange(newErrors, parameters.recentlyPublishedDays, ConfigField.RecentlyPublishedDays, 'Recently published days', RECENTLY_PUBLISHED_DAYS_RANGE);
    Validator.isWithinRange(newErrors, parameters.timeToPublishDays, ConfigField.TimeToPublishDays, 'Time to publish days', TIME_TO_PUBLISH_DAYS_RANGE);
    setErrors(newErrors);
    return Validator.hasErrors(newErrors);
  };

  const onConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState();
    if (validationErrors()) {
      sdk.notifier.error('Please fix validation errors before saving.');
      return false;
    }
    return {
      parameters: {
        ...parameters,
        defaultContentTypes: selectedContentTypes.map((ct) => ct.id),
        topLevelContentTypes: selectedTopLevelCTs.map((ct) => ct.id),
      },
      targetState: currentState,
    };
  }, [parameters, selectedContentTypes, sdk]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const currentParameters = (await sdk.app.getParameters()) as AppInstallationParameters | null;
      if (currentParameters) {
        setParameters(currentParameters);
        if (currentParameters.defaultContentTypes?.length) {
          // ContentTypeMultiSelect will handle loading from initialSelectedIds
        }
      }
      sdk.app.setReady();
    })();
  }, [sdk]);

  const handleIntegerChange = (field: ConfigField) => (value: number | undefined) => {
    setParameters((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const e = { ...prev }; delete e[field]; return e; });
  };

  const SECTIONS = [
    { id: 'analytics', label: 'Analytics' },
    { id: 'modules', label: 'Modules' },
    { id: 'theme', label: 'Theme' },
    { id: 'cards', label: 'Custom Cards' },
    { id: 'ai', label: 'AI Audit' },
    { id: 'p13n', label: 'Personalization' },
    { id: 'contentful-analytics', label: 'Contentful Analytics' },
    { id: 'reference-risk', label: 'Reference Risk' },
  ] as const;

  return (
    <Flex flexDirection="column" fullWidth>
      <Flex flexDirection="column" style={styles.container}>
        <Heading marginBottom="spacingS">Content Health Dashboard</Heading>
        <Paragraph marginBottom="spacingL">
          Configure production analytics, enable/reorder modules, theme the dashboard, and author custom content cards.
        </Paragraph>

        {/* Section nav */}
        <Flex gap="spacingXs" marginBottom="spacingL">
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              variant={activeSection === s.id ? 'primary' : 'secondary'}
              size="small"
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </Flex>

        <hr style={{ border: 0, borderTop: '1px solid #e5e9ed', marginBottom: 24, width: '100%' }} />

        {/* ── Analytics ── */}
        {activeSection === 'analytics' && (
          <Form>
            <Heading as="h3" marginBottom="spacingM">Analytics settings</Heading>
            <Text as="p" marginBottom="spacingL" fontSize="fontSizeM">
              Configure time periods for the production-metrics module.
            </Text>

            <FormControl marginBottom="spacingL" isRequired isInvalid={!!errors.needsUpdateMonths}>
              <FormControl.Label>Content &quot;Needs update&quot; threshold (months)</FormControl.Label>
              <TextInputInteger id="needs-update-months" name="needs-update-months" value={parameters.needsUpdateMonths} onChange={handleIntegerChange(ConfigField.NeedsUpdateMonths)} />
              {errors.needsUpdateMonths && <FormControl.ValidationMessage>{errors.needsUpdateMonths}</FormControl.ValidationMessage>}
              <FormControl.HelpText>Range: {NEEDS_UPDATE_MONTHS_RANGE.min}–{NEEDS_UPDATE_MONTHS_RANGE.max} months.</FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL" isRequired isInvalid={!!errors.recentlyPublishedDays}>
              <FormControl.Label>&quot;Recently published&quot; period (days)</FormControl.Label>
              <TextInputInteger id="recently-published-days" name="recently-published-days" value={parameters.recentlyPublishedDays} onChange={handleIntegerChange(ConfigField.RecentlyPublishedDays)} />
              {errors.recentlyPublishedDays && <FormControl.ValidationMessage>{errors.recentlyPublishedDays}</FormControl.ValidationMessage>}
              <FormControl.HelpText>Range: {RECENTLY_PUBLISHED_DAYS_RANGE.min}–{RECENTLY_PUBLISHED_DAYS_RANGE.max} days.</FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL" isRequired isInvalid={!!errors.timeToPublishDays}>
              <FormControl.Label>Time-to-publish threshold (days)</FormControl.Label>
              <TextInputInteger id="time-to-publish-days" name="time-to-publish-days" value={parameters.timeToPublishDays} onChange={handleIntegerChange(ConfigField.TimeToPublishDays)} />
              {errors.timeToPublishDays && <FormControl.ValidationMessage>{errors.timeToPublishDays}</FormControl.ValidationMessage>}
              <FormControl.HelpText>Range: {TIME_TO_PUBLISH_DAYS_RANGE.min}–{TIME_TO_PUBLISH_DAYS_RANGE.max} days.</FormControl.HelpText>
            </FormControl>

            <FormControl marginBottom="spacingL">
              <Switch id="show-upcoming-releases" name="show-upcoming-releases" isChecked={parameters.showUpcomingReleases ?? false} onChange={(e) => setParameters((p) => ({ ...p, showUpcomingReleases: e.target.checked }))}>
                Show upcoming releases section
              </Switch>
            </FormControl>

            <Heading as="h3" marginBottom="spacingM" marginTop="spacingL">Publishing trends</Heading>
            <FormControl marginBottom="spacingL">
              <Flex alignItems="center" gap="spacing2Xs">
                <FormControl.Label>Default content types</FormControl.Label>
                <Tooltip content="Select up to 5."><InfoIcon size="tiny" /></Tooltip>
              </Flex>
              <ContentTypeMultiSelect
                selectedContentTypes={selectedContentTypes}
                setSelectedContentTypes={setSelectedContentTypes}
                sdk={sdk}
                initialSelectedIds={parameters.defaultContentTypes}
                maxSelected={5}
              />
            </FormControl>

            <FormControl marginBottom="spacingL">
              <FormControl.Label>Default creator view</FormControl.Label>
              <Select id="creator-view" name="creator-view" value={parameters.defaultCreatorViewSetting ?? ''} onChange={(e) => setParameters((p) => ({ ...p, defaultCreatorViewSetting: e.target.value as CreatorViewSetting }))}>
                <Select.Option value="" isDisabled>Select one</Select.Option>
                {CREATOR_VIEW_OPTIONS.map((o) => (
                  <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                ))}
              </Select>
            </FormControl>
          </Form>
        )}

        {/* ── Modules ── */}
        {activeSection === 'modules' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">Module manager</Heading>
            <Text fontColor="gray600" marginBottom="spacingM">
              Enable, disable, and drag to reorder tabs in the dashboard. Changes take effect after saving.
            </Text>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
              <SortableContext items={orderedModules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <Stack flexDirection="column" spacing="spacingXs" style={{ width: '100%' }}>
                  {orderedModules.map((mod) => (
                    <SortableModuleRow key={mod.id} mod={mod} onToggle={handleModuleToggle} />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          </Flex>
        )}

        {/* ── Theme ── */}
        {activeSection === 'theme' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">Theme</Heading>
            <Text fontColor="gray600" marginBottom="spacingM">
              Customise the dashboard title, accent color, background, and brand logo. Great for white-labelling demos for specific clients.
            </Text>
            <ThemeEditor
              theme={parameters.theme ?? DEFAULT_THEME}
              onChange={(t) => setParameters((p) => ({ ...p, theme: t }))}
              sdk={sdk}
            />
          </Flex>
        )}

        {/* ── Custom cards ── */}
        {activeSection === 'cards' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">Custom content cards</Heading>
            <Text fontColor="gray600" marginBottom="spacingM">
              Author free-form cards that appear in the &quot;Custom Content&quot; module. Each card has a title, bullet points, and an optional link.
            </Text>
            <CustomCardEditor
              cards={parameters.customCards ?? []}
              onChange={(cards) => setParameters((p) => ({ ...p, customCards: cards }))}
            />
          </Flex>
        )}

        {/* ── AI Audit ── */}
        {activeSection === 'ai' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">AI Audit configuration</Heading>
            <Text fontColor="gray600" marginBottom="spacingM">
              Connect the AI Audit module to a Contentful App Action that grades content quality.
              The action should accept <code>{'{ entryId, title, body, contentType }'}</code> and return{' '}
              <code>{'{ score, summary, suggestions[] }'}</code>.
            </Text>
            <Note variant="neutral">
              Docs:{' '}
              <a href="https://www.contentful.com/developers/docs/extensibility/app-framework/app-actions/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                Contentful App Actions →
              </a>
            </Note>
            <FormControl>
              <FormControl.Label>Content Grading — App Action ID</FormControl.Label>
              <TextInput
                value={(parameters as any).aiActionId ?? ''}
                onChange={(e) => setParameters((p) => ({ ...p, aiActionId: e.target.value }))}
                placeholder="grade-content"
              />
              <FormControl.HelpText>
                Accepts <code>{'{ entryId, title, body, contentType }'}</code> · Returns <code>{'{ score, summary, suggestions[] }'}</code>
              </FormControl.HelpText>
            </FormControl>

            <hr style={{ border: 0, borderTop: '1px solid #e5e9ed', margin: '8px 0' }} />
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeM">Translation</Text>
            <Text fontColor="gray600" fontSize="fontSizeS">
              Power the <strong>Translate</strong> buttons in the Localization Coverage module.
              The action receives source locale field values and returns translated text for each field.
            </Text>
            <FormControl>
              <FormControl.Label>Translation — App Action ID <Badge variant="secondary">Optional</Badge></FormControl.Label>
              <TextInput
                value={parameters.translationActionId ?? ''}
                onChange={(e) => setParameters((p) => ({ ...p, translationActionId: e.target.value }))}
                placeholder="translate-entry"
              />
              <FormControl.HelpText>
                Accepts <code>{'{ entryId, sourceLocale, targetLocale, fields: { [id]: string } }'}</code> · Returns <code>{'{ [fieldId]: string }'}</code>
              </FormControl.HelpText>
            </FormControl>

            <hr style={{ border: 0, borderTop: '1px solid #e5e9ed', margin: '8px 0' }} />
            <Text fontWeight="fontWeightDemiBold" fontSize="fontSizeM">Alt Text Generation</Text>
            <Text fontColor="gray600" fontSize="fontSizeS">
              Power the <strong>Generate alt text</strong> buttons in the Asset Health module.
              The action analyses the image URL and returns a descriptive alt text string.
            </Text>
            <FormControl>
              <FormControl.Label>Alt Text — App Action ID <Badge variant="secondary">Optional</Badge></FormControl.Label>
              <TextInput
                value={parameters.altTextActionId ?? ''}
                onChange={(e) => setParameters((p) => ({ ...p, altTextActionId: e.target.value }))}
                placeholder="generate-alt-text"
              />
              <FormControl.HelpText>
                Accepts <code>{'{ assetId, imageUrl, locale }'}</code> · Returns <code>{'{ altText: string }'}</code>
              </FormControl.HelpText>
            </FormControl>
          </Flex>
        )}

        {/* ── Personalization ── */}
        {activeSection === 'p13n' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">Personalization (Ninetailed)</Heading>
            <Text fontColor="gray600" marginBottom="spacingM">
              The Personalization module works without any keys — it reads Ninetailed&apos;s content types
              (<code>nt_experience</code>, <code>nt_audience</code>) directly from the CMA. Add a Ninetailed
              Management API key below to unlock impression and conversion analytics in a future update.
            </Text>
            <Note variant="neutral">
              No key needed for experience coverage, audiences, and content type heatmap.
            </Note>
            <FormControl>
              <FormControl.Label>Ninetailed Management API key <Badge variant="secondary">Optional</Badge></FormControl.Label>
              <TextInput
                value={parameters.ninetailedApiKey ?? ''}
                onChange={(e) => setParameters((p) => ({ ...p, ninetailedApiKey: e.target.value }))}
                placeholder="nt_…"
                type="password"
              />
              <FormControl.HelpText>
                Found in your Ninetailed dashboard under API Keys. Required for impression/conversion data.
              </FormControl.HelpText>
            </FormControl>
            <FormControl>
              <FormControl.Label>Ninetailed Environment ID <Badge variant="secondary">Optional</Badge></FormControl.Label>
              <TextInput
                value={parameters.ninetailedEnvironmentId ?? ''}
                onChange={(e) => setParameters((p) => ({ ...p, ninetailedEnvironmentId: e.target.value }))}
                placeholder="main"
              />
              <FormControl.HelpText>Defaults to &quot;main&quot; if left blank.</FormControl.HelpText>
            </FormControl>
          </Flex>
        )}

        {/* ── Contentful Analytics ── */}
        {activeSection === 'contentful-analytics' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">Contentful Analytics</Heading>
            <Text fontColor="gray600" marginBottom="spacingM">
              Contentful Analytics is currently in limited availability. Add your API key here so the
              Analytics module can connect automatically when the API becomes generally available.
            </Text>
            <Note variant="neutral">
              <Text fontSize="fontSizeS">
                The Analytics tab already shows content velocity (publishing rate, top publishers, top content types)
                using live CMA data — no key needed for that. The Contentful Analytics key unlocks page views,
                engagement time, and traffic data.{' '}
                <a href="https://www.contentful.com/blog/introducing-contentful-analytics/" target="_blank" rel="noopener noreferrer" style={{ color: '#1773EB' }}>
                  Learn more →
                </a>
              </Text>
            </Note>
            <FormControl>
              <FormControl.Label>Contentful Analytics API key <Badge variant="secondary">Optional</Badge></FormControl.Label>
              <TextInput
                value={parameters.analyticsApiKey ?? ''}
                onChange={(e) => setParameters((p) => ({ ...p, analyticsApiKey: e.target.value }))}
                placeholder="ca_…"
                type="password"
              />
              <FormControl.HelpText>
                Will be available in your Contentful organization settings when Analytics launches.
              </FormControl.HelpText>
            </FormControl>
          </Flex>
        )}

        {/* ── Reference Risk ── */}
        {activeSection === 'reference-risk' && (
          <Flex flexDirection="column" gap="spacingM">
            <Heading as="h3" marginBottom="spacingXs">Reference Risk — top-level content types</Heading>
            <Text fontColor="gray600" marginBottom="spacingS">
              Top-level content types (landing pages, blog posts, product pages, etc.) are intentional entry-points
              in your content model — they are not referenced by other entries by design.
              Mark them here so the Reference Risk module excludes them from the{' '}
              <strong>Orphaned entries</strong> list, keeping that list focused on truly unused content.
            </Text>
            <Note variant="neutral">
              <Text fontSize="fontSizeS">
                You can find your top-level types in the{' '}
                <a
                  href={`https://app.contentful.com/spaces/${sdk.ids.space}/environments/${sdk.ids.environment}/visual_modeler/content_types`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#1773EB' }}
                >
                  Visual Content Modeler →
                </a>{' '}
                — look for types that appear at the root of your model with no inbound arrows (e.g. Page, Landing Page, Blog Post).
              </Text>
            </Note>
            <FormControl>
              <FormControl.Label>
                Top-level content types <Badge variant="secondary">Optional</Badge>
              </FormControl.Label>
              <ContentTypeMultiSelect
                selectedContentTypes={selectedTopLevelCTs}
                setSelectedContentTypes={setSelectedTopLevelCTs}
                sdk={sdk}
                initialSelectedIds={parameters.topLevelContentTypes}
              />
              <FormControl.HelpText>
                Entries of these types will be excluded from the Orphaned entries tab in Reference Risk.
                Broken references and high-risk entries are unaffected.
              </FormControl.HelpText>
            </FormControl>
          </Flex>
        )}

        {/* Setup guide */}
        <hr style={{ border: 0, borderTop: '1px solid #e5e9ed', marginTop: 48, marginBottom: 24, width: '100%' }} />
        <Heading as="h3" marginBottom="spacingM">Set as home page</Heading>
        <Flex flexDirection="row" gap="spacing2Xl" marginBottom="spacing2Xl">
          <Flex flexDirection="column" style={styles.setupColumn} justifyContent="space-between">
            <Paragraph>Select the gear icon in the Contentful navigation to open Settings.</Paragraph>
            <Image alt="Contentful settings dropdown" height="257px" width="390px" style={styles.image} src={gearImage} />
          </Flex>
          <Flex flexDirection="column" style={styles.setupColumn} justifyContent="space-between">
            <Paragraph>Select &quot;Content Health Dashboard&quot; and click Save.</Paragraph>
            <Image alt="Home page appearance settings" height="257px" width="400px" style={styles.image} src={appearanceImage} />
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default ConfigScreen;
