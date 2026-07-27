import { useState } from 'react';
import {
  type Tariff,
  type TariffLevel,
  type TariffWindow,
  MINUTES_PER_DAY,
  TARIFF_LEVELS,
  expandWindows,
  findCoverageIssue,
} from '@evcp/models';
import { useT } from '@/i18n';
import { useSettingsValue } from '@/store/settings';
import { useAllTariffs, useTariffs } from '@/store/tariffs';
import { Button, Card, Chip, Field, NumberInput, Notice, Select, TextInput } from '@/components/ui';
import { levelColorValue } from '@/lib/format';
import { newId } from '@/store/persist';

/** Colour-coded 24h strip — quicker to read than a table of window rows. */
function DayPreview({ windows }: { windows: readonly TariffWindow[] }) {
  const intervals = expandWindows(windows);
  return (
    <div className="flex h-7 w-full overflow-hidden rounded-lg border border-line">
      {intervals.map((interval, index) => (
        <div
          key={`${interval.startMin}-${index}`}
          title={`${interval.level} ${interval.price}`}
          style={{
            width: `${((interval.endMin - interval.startMin) / MINUTES_PER_DAY) * 100}%`,
            background: levelColorValue(interval.level),
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

const HOURS = Array.from({ length: 25 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

export function TariffPage() {
  const t = useT();
  const settings = useSettingsValue();
  const all = useAllTariffs();
  const { custom, upsert, remove } = useTariffs();
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = custom.find((tariff) => tariff.id === editingId) ?? null;

  const duplicate = (source: Tariff) => {
    const copy: Tariff = {
      ...source,
      id: newId('tariff'),
      name: `${source.name} (${t.common.custom})`,
      verified: false,
    };
    upsert(copy);
    setEditingId(copy.id);
  };

  const createBlank = () => {
    const blank: Tariff = {
      id: newId('tariff'),
      name: t.tariff.addTariff,
      region: { country: 'CN' },
      currency: 'CNY',
      seasons: [
        {
          months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          windows: [
            { level: 'valley', from: '23:00', to: '07:00', price: 0.3 },
            { level: 'peak', from: '07:00', to: '23:00', price: 0.6 },
          ],
        },
      ],
      verified: false,
    };
    upsert(blank);
    setEditingId(blank.id);
  };

  if (editing) {
    return (
      <TariffEditor
        tariff={editing}
        t={t}
        onChange={upsert}
        onDone={() => setEditingId(null)}
        onDelete={() => {
          remove(editing.id);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title={t.tariff.title}
        action={<Button onClick={createBlank}>{t.tariff.addTariff}</Button>}
      >
        <ul className="space-y-3">
          {all.map((tariff) => {
            const isCustom = custom.some((item) => item.id === tariff.id);
            const season = tariff.seasons[0];
            return (
              <li key={tariff.id} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {settings.locale === 'zh-CN' ? tariff.name : (tariff.nameEn ?? tariff.name)}
                    </span>
                    {tariff.region.province && <Chip>{tariff.region.province}</Chip>}
                    {isCustom ? (
                      <Chip color="var(--accent)">{t.common.custom}</Chip>
                    ) : (
                      !tariff.verified && <Chip>{t.common.unverified}</Chip>
                    )}
                    {tariff.tiers && <Chip>{t.tariff.tiers}</Chip>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {isCustom ? (
                      <Button variant="ghost" onClick={() => setEditingId(tariff.id)}>
                        {t.common.edit}
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => duplicate(tariff)}>
                        {t.tariff.duplicate}
                      </Button>
                    )}
                  </div>
                </div>

                {season && <DayPreview windows={season.windows} />}

                <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
                  {season?.windows.map((window, index) => (
                    <span key={`${window.from}-${index}`} style={{ color: levelColorValue(window.level) }}>
                      {window.from}–{window.to} {window.price}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Notice>{t.tariff.dataNotice}</Notice>
    </div>
  );
}

function TariffEditor({
  tariff,
  t,
  onChange,
  onDone,
  onDelete,
}: {
  tariff: Tariff;
  t: ReturnType<typeof useT>;
  onChange: (tariff: Tariff) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const season = tariff.seasons[0]!;
  const issue = findCoverageIssue(season.windows);

  const setWindows = (windows: TariffWindow[]) =>
    onChange({ ...tariff, seasons: [{ ...season, windows }] });

  const updateWindow = (index: number, patch: Partial<TariffWindow>) =>
    setWindows(season.windows.map((window, i) => (i === index ? { ...window, ...patch } : window)));

  return (
    <div className="space-y-4">
      <Card
        title={t.tariff.name}
        action={
          <div className="flex gap-2">
            <Button variant="primary" onClick={onDone}>
              {t.common.save}
            </Button>
            <Button variant="danger" onClick={onDelete}>
              {t.common.delete}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label={t.tariff.name} htmlFor="tariff-name">
            <TextInput
              id="tariff-name"
              value={tariff.name}
              onChange={(event) => onChange({ ...tariff, name: event.target.value })}
            />
          </Field>

          <div>
            <div className="field-label">{t.tariff.preview}</div>
            <DayPreview windows={season.windows} />
          </div>

          {issue && <Notice severity="critical">{t.tariff.coverageError}</Notice>}
        </div>
      </Card>

      <Card
        title={t.tariff.windows}
        action={
          <Button
            onClick={() =>
              setWindows([...season.windows, { level: 'flat', from: '12:00', to: '13:00', price: 0.5 }])
            }
          >
            {t.tariff.addWindow}
          </Button>
        }
      >
        <ul className="space-y-3">
          {season.windows.map((window, index) => (
            <li key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-5">
              <Field label={t.tariff.level}>
                <Select
                  value={window.level}
                  onChange={(event) => updateWindow(index, { level: event.target.value as TariffLevel })}
                >
                  {TARIFF_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t.level[level]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.tariff.from}>
                <Select value={window.from} onChange={(event) => updateWindow(index, { from: event.target.value })}>
                  {HOURS.slice(0, 24).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.tariff.to}>
                <Select value={window.to} onChange={(event) => updateWindow(index, { to: event.target.value })}>
                  {HOURS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.tariff.price}>
                <NumberInput
                  value={window.price}
                  min={0}
                  step={0.0001}
                  onValueChange={(value) => updateWindow(index, { price: value })}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  disabled={season.windows.length <= 1}
                  onClick={() => setWindows(season.windows.filter((_, i) => i !== index))}
                >
                  {t.common.delete}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={t.tariff.tiers}
        action={
          <Button
            onClick={() =>
              onChange({
                ...tariff,
                tiers: [...(tariff.tiers ?? []).slice(0, -1), { upToKwh: 200, delta: 0.05 }, { upToKwh: null, delta: 0.3 }],
              })
            }
          >
            {t.tariff.addTier}
          </Button>
        }
      >
        <p className="mb-3 text-xs text-faint">{t.tariff.tiersHint}</p>
        {tariff.tiers?.length ? (
          <ul className="space-y-2">
            {tariff.tiers.map((tier, index) => (
              <li key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3">
                <Field label={tier.upToKwh === null ? t.tariff.unlimited : t.tariff.upTo}>
                  <NumberInput
                    value={tier.upToKwh ?? ''}
                    disabled={tier.upToKwh === null}
                    min={0}
                    onValueChange={(value) =>
                      onChange({
                        ...tariff,
                        tiers: tariff.tiers?.map((item, i) =>
                          i === index ? { ...item, upToKwh: value } : item,
                        ),
                      })
                    }
                    suffix={t.units.kwh}
                  />
                </Field>
                <Field label={t.tariff.delta}>
                  <NumberInput
                    value={tier.delta}
                    min={0}
                    step={0.01}
                    onValueChange={(value) =>
                      onChange({
                        ...tariff,
                        tiers: tariff.tiers?.map((item, i) =>
                          i === index ? { ...item, delta: value } : item,
                        ),
                      })
                    }
                  />
                </Field>
              </li>
            ))}
          </ul>
        ) : (
          <Button
            onClick={() =>
              onChange({
                ...tariff,
                tiers: [
                  { upToKwh: 230, delta: 0 },
                  { upToKwh: 400, delta: 0.05 },
                  { upToKwh: null, delta: 0.3 },
                ],
              })
            }
          >
            {t.tariff.addTier}
          </Button>
        )}
      </Card>
    </div>
  );
}
