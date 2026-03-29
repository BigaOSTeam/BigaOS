import React, { useEffect, useState, useCallback } from 'react';

const LAYOUTS = {
  default: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '{bksp}'],
    ['{numbers}', ',', '{space}', '.', '{enter}'],
  ],
  shift: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['{shift}', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '{bksp}'],
    ['{numbers}', ',', '{space}', '.', '{enter}'],
  ],
  numbers: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '/', ':', ';', '(', ')', '&', '@', '"'],
    ['.', ',', '?', '!', "'", '#', '%', '*', '{bksp}'],
    ['{abc}', '{space}', '+', '{enter}'],
  ],
};

const DISPLAY: Record<string, string> = {
  '{bksp}': '\u232b',
  '{enter}': '\u21b5',
  '{shift}': '\u21e7',
  '{space}': ' ',
  '{numbers}': '123',
  '{abc}': 'ABC',
};

export const VirtualKeyboard: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [activeInput, setActiveInput] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [layout, setLayout] = useState<'default' | 'shift' | 'numbers'>('default');

  const isKioskClient = /^\/c\/[a-f0-9-]+$/i.test(window.location.pathname);
  const enabled = isKioskClient;

  const handleKey = useCallback((key: string) => {
    if (!activeInput) return;

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    const start = activeInput.selectionStart ?? activeInput.value.length;
    const end = activeInput.selectionEnd ?? activeInput.value.length;

    if (key === '{bksp}') {
      if (start === end && start > 0) {
        nativeSetter?.call(activeInput, activeInput.value.slice(0, start - 1) + activeInput.value.slice(start));
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        activeInput.setSelectionRange(start - 1, start - 1);
      } else if (start !== end) {
        nativeSetter?.call(activeInput, activeInput.value.slice(0, start) + activeInput.value.slice(end));
        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        activeInput.setSelectionRange(start, start);
      }
    } else if (key === '{enter}') {
      activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      activeInput.blur();
    } else if (key === '{shift}') {
      setLayout(l => l === 'shift' ? 'default' : 'shift');
    } else if (key === '{numbers}') {
      setLayout('numbers');
    } else if (key === '{abc}') {
      setLayout('default');
    } else if (key === '{space}') {
      nativeSetter?.call(activeInput, activeInput.value.slice(0, start) + ' ' + activeInput.value.slice(end));
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.setSelectionRange(start + 1, start + 1);
    } else {
      nativeSetter?.call(activeInput, activeInput.value.slice(0, start) + key + activeInput.value.slice(end));
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.setSelectionRange(start + 1, start + 1);
      if (layout === 'shift') setLayout('default');
    }
  }, [activeInput, layout]);

  useEffect(() => {
    if (!enabled) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const input = target as HTMLInputElement | HTMLTextAreaElement;
        if (input.type === 'range' || input.type === 'checkbox' || input.type === 'radio' || input.readOnly) return;
        setActiveInput(input);
        setVisible(true);
        setLayout('default');
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (active?.tagName !== 'INPUT' && active?.tagName !== 'TEXTAREA') {
          setVisible(false);
          setActiveInput(null);
        }
      }, 200);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [enabled]);

  if (!enabled || !visible) return null;

  const rows = LAYOUTS[layout];

  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        background: '#1a1a2e',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        padding: '6px 4px 8px',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: ri < rows.length - 1 ? '4px' : 0 }}>
          {row.map((key) => {
            const isSpecial = key.startsWith('{');
            const isSpace = key === '{space}';
            const isShiftActive = key === '{shift}' && layout === 'shift';

            return (
              <button
                key={key}
                onMouseDown={(e) => { e.preventDefault(); }}
                onTouchStart={(e) => { e.preventDefault(); }}
                onClick={() => handleKey(key)}
                style={{
                  flex: isSpace ? 4 : 1,
                  height: '44px',
                  background: isShiftActive ? 'rgba(25,118,210,0.4)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '6px',
                  color: '#e0e0e0',
                  fontSize: isSpecial && !isSpace ? '14px' : '16px',
                  fontWeight: isSpecial ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {DISPLAY[key] || key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};
