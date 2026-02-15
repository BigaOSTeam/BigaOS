import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface SpeedLogProps {
  speed: number;
}

export const SpeedLog: React.FC<SpeedLogProps> = ({ speed }) => {
  const { t } = useLanguage();
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <h3 style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '0.5rem' }}>{t('units.speed_label')}</h3>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#66bb6a' }}>
        {speed.toFixed(1)}
      </div>
      <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>{t('units.knots')}</div>
    </div>
  );
};
