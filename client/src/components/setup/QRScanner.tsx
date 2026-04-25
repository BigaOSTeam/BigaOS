import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

const READER_ID = 'bigaos-qr-reader';

type Phase =
  | { kind: 'requesting' }
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'error'; message: string; canRetry: boolean };

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'requesting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let probeStream: MediaStream | null = null;

    const start = async () => {
      // Step 1: explicitly request camera permission so Capacitor WebView triggers
      // the runtime prompt. Without this, getCameras() can silently return empty.
      setPhase({ kind: 'requesting' });
      try {
        probeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        // Immediately stop the probe stream — html5-qrcode opens its own.
        probeStream.getTracks().forEach((t) => t.stop());
        probeStream = null;
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const denied = /denied|not allowed|permission/i.test(msg);
        setPhase({
          kind: 'error',
          message: denied
            ? 'Camera permission denied. Enable it in Android Settings → Apps → BigaOS → Permissions.'
            : `Camera unavailable: ${msg}`,
          canRetry: !denied,
        });
        return;
      }

      // Step 2: enumerate cameras and start scanner.
      setPhase({ kind: 'starting' });
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!cameras || cameras.length === 0) {
          setPhase({ kind: 'error', message: 'No camera found on this device.', canRetry: true });
          return;
        }
        const back = cameras.find((c) => /back|rear|environment/i.test(c.label)) || cameras[0];

        const scanner = new Html5Qrcode(READER_ID);
        scannerRef.current = scanner;

        await scanner.start(
          back.id,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            scanner.stop().catch(() => {}).finally(() => onScan(decodedText));
          },
          () => { /* per-frame failures are noise */ }
        );
        if (cancelled) {
          scanner.stop().catch(() => {});
          return;
        }
        setPhase({ kind: 'scanning' });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setPhase({ kind: 'error', message: `Scanner failed to start: ${msg}`, canRetry: true });
      }
    };

    start();

    return () => {
      cancelled = true;
      if (probeStream) probeStream.getTracks().forEach((t) => t.stop());
      const s = scannerRef.current;
      if (!s) return;
      s.stop()
        .then(() => { try { s.clear(); } catch { /* ignore */ } })
        .catch(() => {});
      scannerRef.current = null;
    };
  }, [onScan, attempt]);

  return (
    <div style={overlayStyle}>
      <button style={closeButtonStyle} onClick={onClose} aria-label="Close scanner">✕</button>
      <div style={titleStyle}>Scan BigaOS QR code</div>

      <div style={readerWrapperStyle}>
        <div id={READER_ID} style={readerStyle} />
        {phase.kind !== 'scanning' && (
          <div style={readerOverlayStyle}>
            {phase.kind === 'requesting' && (
              <>
                <Spinner />
                <div style={statusTextStyle}>Requesting camera permission…</div>
              </>
            )}
            {phase.kind === 'starting' && (
              <>
                <Spinner />
                <div style={statusTextStyle}>Starting camera…</div>
              </>
            )}
            {phase.kind === 'error' && (
              <>
                <div style={errorTextStyle}>{phase.message}</div>
                {phase.canRetry && (
                  <button style={retryButtonStyle} onClick={() => setAttempt((n) => n + 1)}>
                    Retry
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div style={hintStyle}>Point the camera at the QR code shown by the BigaOS server.</div>
    </div>
  );
};

const Spinner: React.FC = () => <div style={spinnerStyle} />;

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#000',
  color: '#e0e0e0',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 600,
  marginTop: '40px',
  marginBottom: '16px',
};

const readerWrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: '420px',
  minHeight: '320px',
  background: '#0a1929',
  borderRadius: '8px',
  overflow: 'hidden',
};

const readerStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '320px',
};

const readerOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '24px',
  textAlign: 'center',
};

const statusTextStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'rgba(255, 255, 255, 0.7)',
};

const errorTextStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#ef5350',
  lineHeight: 1.4,
};

const retryButtonStyle: React.CSSProperties = {
  marginTop: '8px',
  padding: '8px 16px',
  background: 'rgba(255, 255, 255, 0.1)',
  color: '#e0e0e0',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  fontSize: '0.85rem',
  cursor: 'pointer',
};

const spinnerStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  border: '3px solid rgba(255, 255, 255, 0.15)',
  borderTopColor: '#1976d2',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  width: '40px',
  height: '40px',
  border: 'none',
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.1)',
  color: '#e0e0e0',
  fontSize: '1.2rem',
  cursor: 'pointer',
};

const hintStyle: React.CSSProperties = {
  marginTop: '16px',
  fontSize: '0.8rem',
  color: 'rgba(255, 255, 255, 0.6)',
  textAlign: 'center',
  padding: '0 16px',
};
