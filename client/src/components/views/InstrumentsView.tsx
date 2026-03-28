import React from 'react';
import { SensorData } from '../../types';
import type { ViewType } from '../../types/dashboard';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { ViewLayout } from './shared';

// Dashboard item components
import { SpeedItem } from '../dashboard/items/SpeedItem';
import { HeadingItem } from '../dashboard/items/HeadingItem';
import { DepthItem } from '../dashboard/items/DepthItem';
import { WindItem } from '../dashboard/items/WindItem';
import { PositionItem } from '../dashboard/items/PositionItem';
import { BatteryItem } from '../dashboard/items/BatteryItem';
import { BatteryDrawItem } from '../dashboard/items/BatteryDrawItem';
import { RollItem } from '../dashboard/items/RollItem';
import { PitchItem } from '../dashboard/items/PitchItem';
import { WindRoseItem } from '../dashboard/items/WindRoseItem';

interface InstrumentsViewProps {
  sensorData: SensorData;
  onClose: () => void;
  onNavigate: (view: ViewType) => void;
}

interface InstrumentCard {
  label: string;
  view: ViewType;
  content: React.ReactNode;
}

export const InstrumentsView: React.FC<InstrumentsViewProps> = ({
  sensorData,
  onClose,
  onNavigate,
}) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const instruments: InstrumentCard[] = [
    {
      label: t('dashboard.speed'),
      view: 'speed',
      content: <SpeedItem speed={sensorData.navigation.speedOverGround} />,
    },
    {
      label: t('dashboard.heading'),
      view: 'heading',
      content: <HeadingItem heading={sensorData.navigation.heading} />,
    },
    {
      label: t('dashboard.depth'),
      view: 'depth',
      content: <DepthItem depth={sensorData.environment.depth.belowTransducer} />,
    },
    {
      label: t('dashboard.wind'),
      view: 'wind',
      content: (
        <WindItem
          speedApparent={sensorData.environment.wind.speedApparent}
          angleApparent={sensorData.environment.wind.angleApparent}
        />
      ),
    },
    {
      label: t('dashboard.wind_rose'),
      view: 'wind',
      content: (
        <WindRoseItem
          speedApparent={sensorData.environment.wind.speedApparent}
          angleApparent={sensorData.environment.wind.angleApparent}
          angleTrue={sensorData.environment.wind.angleTrue}
        />
      ),
    },
    {
      label: t('dashboard.position'),
      view: 'position',
      content: <PositionItem position={sensorData.navigation.position} />,
    },
    {
      label: t('dashboard.battery'),
      view: 'battery',
      content: (
        <BatteryItem
          voltage={sensorData.electrical.battery.voltage}
          temperature={sensorData.electrical.battery.temperature}
          stateOfCharge={sensorData.electrical.battery.stateOfCharge}
          timeRemaining={sensorData.electrical.battery.timeRemaining}
        />
      ),
    },
    {
      label: t('dashboard.battery_draw'),
      view: 'battery',
      content: (
        <BatteryDrawItem
          current={sensorData.electrical.battery.current}
          power={sensorData.electrical.battery.power}
          temperature={sensorData.electrical.battery.temperature}
          timeRemaining={sensorData.electrical.battery.timeRemaining}
        />
      ),
    },
    {
      label: t('dashboard.roll'),
      view: 'roll',
      content: <RollItem roll={sensorData.navigation.attitude.roll} />,
    },
    {
      label: t('dashboard.pitch'),
      view: 'pitch',
      content: <PitchItem pitch={sensorData.navigation.attitude.pitch} />,
    },
  ];

  return (
    <ViewLayout title={t('instruments.title')} onClose={onClose}>
      <div style={{
        padding: theme.space.md,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: theme.space.sm,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
      }}>
        {instruments.map((item, i) => (
          <button
            key={i}
            onClick={() => onNavigate(item.view)}
            style={{
              background: theme.colors.bgCard,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.lg,
              color: theme.colors.textPrimary,
              cursor: 'pointer',
              padding: 0,
              aspectRatio: '1',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'border-color 0.15s',
              containerType: 'size',
            }}
          >
            {/* Instrument content */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              overflow: 'hidden',
            }}>
              {item.content}
            </div>
            {/* Label */}
            <div style={{
              fontSize: theme.fontSize.xs,
              color: theme.colors.textMuted,
              padding: `${theme.space.xs} ${theme.space.sm}`,
              borderTop: `1px solid ${theme.colors.border}`,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {item.label}
            </div>
          </button>
        ))}
      </div>
    </ViewLayout>
  );
};
