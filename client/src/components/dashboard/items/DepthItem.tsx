import React from 'react';
import { useSettings, depthConversions } from '../../../context/SettingsContext';

interface DepthItemProps {
  depth: number;
}

export const DepthItem: React.FC<DepthItemProps> = ({ depth }) => {
  const { depthUnit, depthAlarm, isDepthAlarmTriggered, convertDepth } = useSettings();

  const convertedDepth = convertDepth(depth);

  const getDepthColor = (d: number): string => {
    if (isDepthAlarmTriggered) return '#ef5350';  // Alarm - red
    if (d < 3) return '#ef5350';  // Danger - red
    if (d < 5) return '#ffa726';  // Warning - orange
    return '#4fc3f7';  // Safe - blue
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '1rem',
      background: isDepthAlarmTriggered ? 'rgba(239, 83, 80, 0.15)' : 'transparent',
      transition: 'background 0.3s',
    }}>
      <div style={{
        fontSize: '0.75rem',
        opacity: 0.6,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}>
        Depth
        {depthAlarm !== null && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isDepthAlarmTriggered ? '#ef5350' : '#4fc3f7'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
      </div>
      <div style={{
        fontSize: '3rem',
        fontWeight: 'bold',
        color: getDepthColor(depth),
        lineHeight: 1,
        marginTop: '0.25rem',
        animation: isDepthAlarmTriggered ? 'pulse 1s infinite' : 'none',
      }}>
        {convertedDepth.toFixed(1)}
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.5 }}>{depthConversions[depthUnit].label}</div>
    </div>
  );
};
