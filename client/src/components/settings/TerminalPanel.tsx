/**
 * TerminalPanel - Server log viewer and command execution
 *
 * Two sections:
 *  1. Server Logs — live journalctl output with follow mode
 *  2. Terminal — interactive command prompt with unified output
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { wsService } from '../../services/websocket';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePlugins } from '../../context/PluginContext';
import { SButton, SSection } from '../ui/SettingsUI';

const HELPFUL_COMMANDS = [
  { labelKey: 'terminal.cmd_sysinfo', cmd: 'uname -a' },
  { labelKey: 'terminal.cmd_uptime', cmd: 'uptime' },
  { labelKey: 'terminal.cmd_disk', cmd: 'df -h' },
  { labelKey: 'terminal.cmd_memory', cmd: 'free -h' },
  { labelKey: 'terminal.cmd_temp', cmd: 'vcgencmd measure_temp 2>/dev/null || echo "N/A"' },
  { labelKey: 'terminal.cmd_ip', cmd: 'hostname -I' },
  { labelKey: 'terminal.cmd_can', cmd: 'ip -details link show can0 2>/dev/null || echo "CAN interface not found"' },
  { labelKey: 'terminal.cmd_i2c', cmd: 'i2cdetect -y 1 2>/dev/null || echo "i2c-tools not installed"' },
  { labelKey: 'terminal.cmd_status', cmd: 'systemctl status bigaos --no-pager -l' },
  { labelKey: 'terminal.cmd_node', cmd: 'node --version' },
];

const MONO_FONT = '"Cascadia Code", "Fira Code", "Source Code Pro", "Consolas", monospace';


interface TerminalLine {
  type: 'cmd' | 'stdout' | 'stderr' | 'exit';
  text: string;
}

export const TerminalPanel: React.FC = () => {
  const { theme } = useTheme();

  const termBtnStyle: React.CSSProperties = {
    padding: `${theme.space.xs} ${theme.space.sm}`,
    fontSize: theme.fontSize.sm,
    minHeight: "36px",
  };

  const { t } = useLanguage();
  const { rebootSystem } = usePlugins();
  const [logs, setLogs] = useState('');
  const [following, setFollowing] = useState(false);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [termLines, setTermLines] = useState<TerminalLine[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoScrollRef = useRef(true);

  // Load initial logs
  useEffect(() => {
    wsService.emit('terminal_logs', { lines: 200 });

    const handleLogs = (data: { logs: string }) => {
      setLogs(data.logs);
      setTimeout(() => {
        if (logRef.current && autoScrollRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      }, 50);
    };

    const handleLogLine = (data: { line: string }) => {
      setLogs(prev => prev + data.line);
      setTimeout(() => {
        if (logRef.current && autoScrollRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
      }, 10);
    };

    const handleExecResult = (data: { command: string; stdout: string; stderr: string; exitCode: number }) => {
      setTermLines(prev => {
        const next = [...prev, { type: 'cmd' as const, text: data.command }];
        if (data.stdout) next.push({ type: 'stdout' as const, text: data.stdout });
        if (data.stderr) next.push({ type: 'stderr' as const, text: data.stderr });
        if (data.exitCode !== 0) next.push({ type: 'exit' as const, text: `exit code: ${data.exitCode}` });
        // Keep last ~200 lines
        return next.slice(-200);
      });
      setTimeout(() => {
        if (termRef.current) {
          termRef.current.scrollTop = termRef.current.scrollHeight;
        }
      }, 10);
    };

    wsService.on('terminal_logs_sync', handleLogs);
    wsService.on('terminal_log_line', handleLogLine);
    wsService.on('terminal_exec_result', handleExecResult);

    return () => {
      wsService.off('terminal_logs_sync', handleLogs);
      wsService.off('terminal_log_line', handleLogLine);
      wsService.off('terminal_exec_result', handleExecResult);
      wsService.emit('terminal_logs_follow', { follow: false });
    };
  }, []);

  const toggleFollow = useCallback(() => {
    const newFollow = !following;
    setFollowing(newFollow);
    wsService.emit('terminal_logs_follow', { follow: newFollow });
    if (newFollow) autoScrollRef.current = true;
  }, [following]);

  const refreshLogs = useCallback(() => {
    wsService.emit('terminal_logs', { lines: 200 });
  }, []);

  const executeCommand = useCallback((cmd?: string) => {
    const toRun = cmd || command.trim();
    if (!toRun) return;
    setCommandHistory(prev => {
      const filtered = prev.filter(c => c !== toRun);
      return [...filtered, toRun].slice(-50);
    });
    setHistoryIndex(-1);
    wsService.emit('terminal_exec', { command: toRun });
    if (!cmd) setCommand('');
  }, [command]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCommand(commandHistory[newIndex]);
        }
      }
    }
  };

  const handleLogScroll = () => {
    if (logRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logRef.current;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.lg, height: '100%' }}>

      {/* ── Server Logs ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SSection style={{ marginBottom: 0 }}>{t('terminal.title')}</SSection>
          <div style={{ display: 'flex', gap: theme.space.xs }}>
            <SButton
              variant="outline"
              onClick={refreshLogs}
              title={t('terminal.refresh')}
              style={termBtnStyle}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              }
            >
              {t('terminal.refresh')}
            </SButton>
            <SButton
              variant={following ? 'primary' : 'outline'}
              onClick={toggleFollow}
              style={{
                ...termBtnStyle,
                ...(following ? {} : {}),
              }}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill={following ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              }
            >
              {following ? t('terminal.following') : t('terminal.follow')}
            </SButton>
            <SButton
              variant="outline"
              onClick={() => rebootSystem()}
              title={t('terminal.reboot')}
              style={{
                ...termBtnStyle,
                background: theme.colors.warningLight,
                color: theme.colors.warning,
              }}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              }
            >
              {t('terminal.reboot')}
            </SButton>
          </div>
        </div>

        <pre
          ref={logRef}
          onScroll={handleLogScroll}
          className="settings-scroll"
          style={{
            background: '#000',
            color: '#c8d6e5',
            fontFamily: MONO_FONT,
            fontSize: '11px',
            lineHeight: 1.5,
            padding: theme.space.md,
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            height: '260px',
            overflow: 'auto',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {logs || t('terminal.loading')}
        </pre>
      </div>

      {/* ── Terminal ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SSection style={{ marginBottom: 0 }}>{t('terminal.terminal') || 'Terminal'}</SSection>
          <SButton
            variant="ghost"
            onClick={() => setShowHelp(!showHelp)}
            style={termBtnStyle}
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: showHelp ? 'rotate(90deg)' : 'none', transition: `transform ${theme.transition.fast}` }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            }
          >
            {t('terminal.quick_commands')}
          </SButton>
        </div>

        {showHelp && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: theme.space.xs,
            padding: `${theme.space.xs} 0`,
          }}>
            {HELPFUL_COMMANDS.map(({ labelKey, cmd }) => (
              <SButton
                key={cmd}
                variant="outline"
                onClick={() => { setCommand(cmd); inputRef.current?.focus(); }}
                title={cmd}
                style={{
                  padding: `${theme.space.xs} ${theme.space.md}`,
                  fontSize: theme.fontSize.sm,
                  minHeight: '36px',
                }}
              >
                {t(labelKey)}
              </SButton>
            ))}
          </div>
        )}

        {/* Terminal output */}
        <div
          ref={termRef}
          className="settings-scroll"
          style={{
            background: '#000',
            fontFamily: MONO_FONT,
            fontSize: '11px',
            lineHeight: 1.5,
            padding: theme.space.md,
            borderRadius: `${theme.radius.md} ${theme.radius.md} 0 0`,
            border: `1px solid ${theme.colors.border}`,
            borderBottom: 'none',
            height: '180px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {termLines.length === 0 ? (
            <span style={{ color: theme.colors.textMuted }}>{t('terminal.placeholder')}</span>
          ) : (
            termLines.map((line, i) => {
              if (line.type === 'cmd') {
                return <div key={i} style={{ color: theme.colors.primary }}>$ {line.text}</div>;
              }
              if (line.type === 'stderr') {
                return <div key={i} style={{ color: theme.colors.error, margin: 0 }}>{line.text}</div>;
              }
              if (line.type === 'exit') {
                return <div key={i} style={{ color: theme.colors.warning, fontSize: '10px' }}>{line.text}</div>;
              }
              return <div key={i} style={{ color: '#c8d6e5', margin: 0 }}>{line.text}</div>;
            })
          )}
        </div>

        {/* Command input — attached to bottom of terminal output */}
        <div style={{
          display: 'flex',
          background: '#0a0a0a',
          border: `1px solid ${theme.colors.border}`,
          borderRadius: `0 0 ${theme.radius.md} ${theme.radius.md}`,
          marginTop: '-1px',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${theme.space.sm}`,
            color: theme.colors.primary,
            fontFamily: MONO_FONT,
            fontSize: '12px',
            fontWeight: theme.fontWeight.bold,
          }}>$</div>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('terminal.placeholder')}
            style={{
              flex: 1,
              padding: `${theme.space.sm} ${theme.space.xs}`,
              background: 'transparent',
              border: 'none',
              color: '#c8d6e5',
              fontFamily: MONO_FONT,
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <SButton
            variant="primary"
            onClick={() => executeCommand()}
            disabled={!command.trim()}
            style={{
              padding: `${theme.space.sm} ${theme.space.md}`,
              minHeight: '36px',
              borderRadius: 0,
            }}
          >
            {t('terminal.run')}
          </SButton>
        </div>
      </div>
    </div>
  );
};
