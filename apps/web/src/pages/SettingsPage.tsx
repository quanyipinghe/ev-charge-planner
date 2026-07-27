import { useRef, useState } from 'react';
import type { Locale, Theme } from '@evcp/models';
import { LOCALES, useT } from '@/i18n';
import { useSettings, useSettingsValue } from '@/store/settings';
import { useGarage } from '@/store/garage';
import { useTariffs } from '@/store/tariffs';
import { useSessions } from '@/store/sessions';
import { Button, Card, Field, NumberInput, Notice, Segmented, TextInput, Toggle } from '@/components/ui';
import { api, buildTargets } from '@/lib/api';
import { downloadFile } from '@/lib/format';

const APP_VERSION = '0.1.0';
const REPO_URL = 'https://github.com/quanyipinghe/ev-charge-planner';

interface Backup {
  version: number;
  exportedAt: string;
  settings: unknown;
  vehicles: unknown;
  tariffs: unknown;
  sessions: unknown;
}

export function SettingsPage() {
  const t = useT();
  const settings = useSettingsValue();
  const { update, updateNotification, replace } = useSettings();
  const garage = useGarage();
  const tariffs = useTariffs();
  const sessions = useSessions();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null);

  const notify = (text: string, tone: 'info' | 'warn' = 'info') => {
    setMessage({ text, tone });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const exportAll = () => {
    const backup: Backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settings,
      vehicles: garage.vehicles,
      tariffs: tariffs.custom,
      sessions: sessions.sessions,
    };
    downloadFile(
      `evcharge-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
  };

  const importAll = async (file: File) => {
    if (!window.confirm(t.settings.importConfirm)) return;
    try {
      const backup = JSON.parse(await file.text()) as Backup;
      if (backup.settings) replace(backup.settings as never);
      if (Array.isArray(backup.vehicles)) garage.replaceAll(backup.vehicles as never);
      if (Array.isArray(backup.tariffs)) tariffs.replaceAll(backup.tariffs as never);
      if (Array.isArray(backup.sessions)) sessions.replaceAll(backup.sessions as never);
      notify(t.settings.imported);
    } catch {
      notify(t.settings.importFailed, 'warn');
    }
  };

  const sendTest = async () => {
    const targets = buildTargets(settings.notification);
    if (!settings.notification.apiBaseUrl || targets.length === 0) {
      notify(t.notify.needsApi, 'warn');
      return;
    }
    try {
      await api.notifyNow(settings.notification.apiBaseUrl, targets, {
        title: t.app.name,
        body: t.settings.testSend,
      });
      notify(t.settings.testSent);
    } catch (error) {
      notify(`${t.settings.testFailed}: ${(error as Error).message}`, 'warn');
    }
  };

  return (
    <div className="space-y-4">
      <Card title={t.settings.appearance}>
        <div className="space-y-4">
          <Field label={t.settings.theme}>
            <Segmented<Theme>
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: 'system', label: t.settings.themeSystem },
                { value: 'light', label: t.settings.themeLight },
                { value: 'dark', label: t.settings.themeDark },
              ]}
            />
          </Field>

          <Field label={t.settings.language}>
            <Segmented<Locale>
              value={settings.locale}
              onChange={(locale) => update({ locale })}
              options={LOCALES.map((item) => ({ value: item.value, label: item.label }))}
            />
          </Field>

          <Field label={t.settings.timeZone} htmlFor="timezone">
            <TextInput
              id="timezone"
              value={settings.timeZone}
              onChange={(event) => update({ timeZone: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card title={t.settings.defaults}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.planner.targetSoc} htmlFor="default-target">
            <NumberInput
              id="default-target"
              value={settings.targetSoc}
              min={0}
              max={100}
              onValueChange={(targetSoc) => update({ targetSoc })}
              suffix="%"
            />
          </Field>
          <Field label={t.planner.efficiency} htmlFor="default-efficiency">
            <NumberInput
              id="default-efficiency"
              value={Math.round(settings.efficiency * 100)}
              min={50}
              max={100}
              onValueChange={(value) => update({ efficiency: value / 100 })}
              suffix="%"
            />
          </Field>
          <Field label={t.planner.highSocDwell} htmlFor="high-soc">
            <NumberInput
              id="high-soc"
              value={settings.highSocThreshold}
              min={50}
              max={100}
              onValueChange={(highSocThreshold) => update({ highSocThreshold })}
              suffix="%"
            />
          </Field>
          <Field label={t.planner.finishCharging} htmlFor="buffer">
            <NumberInput
              id="buffer"
              value={settings.bufferMinutes}
              min={0}
              max={240}
              onValueChange={(bufferMinutes) => update({ bufferMinutes })}
              suffix={t.common.minutes}
            />
          </Field>
        </div>
      </Card>

      <Card title={t.settings.notification}>
        <div className="space-y-5">
          <Field
            label={t.settings.apiBaseUrl}
            hint={t.settings.apiBaseUrlHint}
            htmlFor="api-base-url"
          >
            <TextInput
              id="api-base-url"
              type="url"
              placeholder="https://evcp-api.example.workers.dev"
              value={settings.notification.apiBaseUrl}
              onChange={(event) => updateNotification({ apiBaseUrl: event.target.value })}
            />
          </Field>

          <Field label={t.settings.leadMinutes} htmlFor="lead-minutes">
            <NumberInput
              id="lead-minutes"
              value={settings.notification.leadMinutes}
              min={0}
              max={240}
              onValueChange={(leadMinutes) => updateNotification({ leadMinutes })}
              suffix={t.common.minutes}
            />
          </Field>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <Toggle
              checked={settings.notification.telegram.enabled}
              onChange={(enabled) =>
                updateNotification({
                  telegram: { ...settings.notification.telegram, enabled },
                })
              }
              label={t.settings.telegram}
            />
            {settings.notification.telegram.enabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t.settings.botToken} htmlFor="tg-token">
                  <TextInput
                    id="tg-token"
                    type="password"
                    autoComplete="off"
                    value={settings.notification.telegram.botToken}
                    onChange={(event) =>
                      updateNotification({
                        telegram: { ...settings.notification.telegram, botToken: event.target.value },
                      })
                    }
                  />
                </Field>
                <Field label={t.settings.chatId} htmlFor="tg-chat">
                  <TextInput
                    id="tg-chat"
                    value={settings.notification.telegram.chatId}
                    onChange={(event) =>
                      updateNotification({
                        telegram: { ...settings.notification.telegram, chatId: event.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <Toggle
              checked={settings.notification.wecom.enabled}
              onChange={(enabled) =>
                updateNotification({ wecom: { ...settings.notification.wecom, enabled } })
              }
              label={t.settings.wecom}
            />
            {settings.notification.wecom.enabled && (
              <Field label={t.settings.webhookUrl} htmlFor="wecom-url">
                <TextInput
                  id="wecom-url"
                  type="url"
                  autoComplete="off"
                  value={settings.notification.wecom.webhookUrl}
                  onChange={(event) =>
                    updateNotification({
                      wecom: { ...settings.notification.wecom, webhookUrl: event.target.value },
                    })
                  }
                />
              </Field>
            )}
          </div>

          <Button onClick={sendTest}>{t.settings.testSend}</Button>
        </div>
      </Card>

      <Card title={t.settings.data}>
        <div className="space-y-4">
          <Notice>{t.settings.privacy}</Notice>

          <div className="flex flex-wrap gap-2">
            <Button onClick={exportAll}>{t.settings.exportJson}</Button>
            <Button onClick={() => fileInput.current?.click()}>{t.settings.importJson}</Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importAll(file);
                event.target.value = '';
              }}
            />
            <Button
              variant="danger"
              onClick={() => {
                if (!window.confirm(t.settings.clearConfirm)) return;
                sessions.clear();
                garage.replaceAll([]);
                tariffs.replaceAll([]);
                useSettings.getState().reset();
              }}
            >
              {t.settings.clearAll}
            </Button>
          </div>

          {message && (
            <Notice severity={message.tone === 'warn' ? 'warn' : 'info'}>{message.text}</Notice>
          )}
        </div>
      </Card>

      <Card title={t.settings.about}>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t.settings.version}</dt>
            <dd className="tnum">{APP_VERSION}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t.settings.sourceCode}</dt>
            <dd>
              <a
                className="text-accent underline underline-offset-4"
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
