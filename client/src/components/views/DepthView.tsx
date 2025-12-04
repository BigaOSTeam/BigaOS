import React, { useEffect, useRef } from 'react';
import { useSettings, depthConversions } from '../../context/SettingsContext';

interface DepthViewProps {
  depth: number; // Current depth in meters
  onClose: () => void;
}

export const DepthView: React.FC<DepthViewProps> = ({ depth, onClose }) => {
  const {
    depthUnit,
    depthAlarm,
    setDepthAlarm,
    soundAlarmEnabled,
    setSoundAlarmEnabled,
    isDepthAlarmTriggered,
    depthHistory,
    convertDepth,
  } = useSettings();

  const audioContextRef = useRef<AudioContext | null>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const convertedDepth = convertDepth(depth);

  // Beep function
  const playBeep = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 2500;
    osc1.type = 'square';
    gain1.gain.value = 0.4;
    osc1.start();
    osc1.stop(ctx.currentTime + 0.1);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 3200;
      osc2.type = 'square';
      gain2.gain.value = 0.4;
      osc2.start();
      osc2.stop(ctx.currentTime + 0.1);
    }, 120);
  };

  // Handle sound alarm
  useEffect(() => {
    if (isDepthAlarmTriggered && soundAlarmEnabled) {
      if (!beepIntervalRef.current) {
        playBeep();
        beepIntervalRef.current = setInterval(playBeep, 500);
      }
    } else {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    }
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [isDepthAlarmTriggered, soundAlarmEnabled]);

  const getDepthColor = (depthInMeters: number) => {
    if (isDepthAlarmTriggered) return '#ef5350';
    if (depthInMeters < 2) return '#ef5350';
    if (depthInMeters < 5) return '#ffa726';
    if (depthInMeters < 10) return '#66bb6a';
    return '#4fc3f7';
  };

  // Render depth history graph
  const renderGraph = () => {
    if (depthHistory.length < 2) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          opacity: 0.5,
          fontSize: '0.9rem',
        }}>
          Collecting depth data...
        </div>
      );
    }

    const graphHeight = 200; // pixels

    // Find max for scaling
    const depths = depthHistory.map(p => p.depth);
    const maxDepth = Math.max(...depths, 10) * 1.2; // Add 20% headroom

    // Create path
    const points = depthHistory.map((point, index) => {
      const x = (index / (depthHistory.length - 1)) * 100;
      const y = (point.depth / maxDepth) * graphHeight;
      return `${x},${y}`;
    });

    // Alarm line position
    const alarmLineY = depthAlarm !== null
      ? ((depthUnit === 'ft' ? depthAlarm / depthConversions.ft.factor : depthAlarm) / maxDepth) * graphHeight
      : null;

    return (
      <svg
        viewBox={`0 0 100 ${graphHeight}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: `${graphHeight}px` }}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
          <line
            key={i}
            x1="0"
            y1={ratio * graphHeight}
            x2="100"
            y2={ratio * graphHeight}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.3"
          />
        ))}

        {/* Alarm threshold line */}
        {alarmLineY !== null && (
          <line
            x1="0"
            y1={alarmLineY}
            x2="100"
            y2={alarmLineY}
            stroke="#ef5350"
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        )}

        {/* Area fill */}
        <path
          d={`M0,0 L${points.join(' L')} L100,0 Z`}
          fill="url(#depthGradient)"
          opacity="0.3"
        />

        {/* Depth line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#4fc3f7"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Gradient definition */}
        <defs>
          <linearGradient id="depthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4fc3f7" />
            <stop offset="100%" stopColor="#0a1929" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  const alarmOptions = depthUnit === 'm' ? [1, 2, 3, 5, 10] : [3, 6, 10, 15, 30];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#0a1929',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '1rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '0.5rem',
            marginRight: '1rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Depth</h1>
      </div>

      {/* Main depth display */}
      <div style={{
        flex: '0 0 auto',
        padding: '2rem',
        textAlign: 'center',
        background: isDepthAlarmTriggered ? 'rgba(239, 83, 80, 0.2)' : 'transparent',
        transition: 'background 0.3s',
      }}>
        <div style={{
          fontSize: '6rem',
          fontWeight: 'bold',
          color: getDepthColor(depth),
          lineHeight: 1,
          animation: isDepthAlarmTriggered ? 'pulse 1s infinite' : 'none',
        }}>
          {convertedDepth.toFixed(1)}
        </div>
        <div style={{
          fontSize: '1.5rem',
          opacity: 0.6,
          marginTop: '0.5rem',
        }}>
          {depthConversions[depthUnit].label}
        </div>
        {isDepthAlarmTriggered && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            background: 'rgba(239, 83, 80, 0.9)',
            borderRadius: '8px',
            display: 'inline-block',
            fontWeight: 'bold',
            animation: 'pulse 1s infinite',
          }}>
            SHALLOW WATER ALARM
          </div>
        )}
      </div>

      {/* Depth history graph */}
      <div style={{
        flex: '1 1 auto',
        padding: '1rem',
        minHeight: '200px',
      }}>
        <div style={{
          fontSize: '0.75rem',
          opacity: 0.6,
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Recent Depth
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '8px',
          padding: '1rem',
          height: 'calc(100% - 2rem)',
        }}>
          {renderGraph()}
        </div>
      </div>

      {/* Alarm settings */}
      <div style={{
        flex: '0 0 auto',
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}>
          <div style={{
            fontSize: '0.75rem',
            opacity: 0.6,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Depth Alarm
          </div>
          {depthAlarm !== null && (
            <button
              onClick={() => setDepthAlarm(null)}
              style={{
                background: 'rgba(239, 83, 80, 0.2)',
                border: '1px solid rgba(239, 83, 80, 0.5)',
                borderRadius: '4px',
                color: '#ef5350',
                padding: '0.25rem 0.75rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Clear Alarm
            </button>
          )}
        </div>

        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          {alarmOptions.map((alarmDepth) => (
            <button
              key={alarmDepth}
              onClick={() => setDepthAlarm(alarmDepth)}
              style={{
                flex: '1 1 auto',
                minWidth: '60px',
                padding: '1rem 0.5rem',
                background: depthAlarm === alarmDepth ? 'rgba(25, 118, 210, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                border: depthAlarm === alarmDepth ? '2px solid rgba(25, 118, 210, 0.8)' : '2px solid transparent',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: depthAlarm === alarmDepth ? 'bold' : 'normal',
              }}
            >
              &lt; {alarmDepth} {depthUnit}
            </button>
          ))}
        </div>

        {/* Sound toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '1rem',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {soundAlarmEnabled && (
                <>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
            <span>Sound Alarm</span>
          </div>
          <button
            onClick={() => setSoundAlarmEnabled(!soundAlarmEnabled)}
            style={{
              width: '50px',
              height: '28px',
              borderRadius: '14px',
              background: soundAlarmEnabled ? 'rgba(25, 118, 210, 0.8)' : 'rgba(255,255,255,0.2)',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: soundAlarmEnabled ? '25px' : '3px',
              transition: 'left 0.2s',
            }} />
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `}
      </style>
    </div>
  );
};
