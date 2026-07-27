import { useState } from 'react';
import type { BatteryChemistry } from '@evcp/models';
import { useT } from '@/i18n';
import { useSettings, useSettingsValue } from '@/store/settings';
import { type CustomVehicleSpec, type GarageVehicle, garageLabel, useGarage } from '@/store/garage';
import { Button, Card, Chip, EmptyState, Field, NumberInput, Notice, Select, TextInput } from '@/components/ui';
import { VehiclePicker } from '@/components/VehiclePicker';

const CHEMISTRIES: BatteryChemistry[] = ['LFP', 'LMFP', 'NMC', 'NCA', 'NAION'];

export function GaragePage() {
  const t = useT();
  const settings = useSettingsValue();
  const updateSettings = useSettings((state) => state.update);
  const { vehicles, addFromCatalog, addCustom, update, updateSpec, remove } = useGarage();
  const [mode, setMode] = useState<'list' | 'catalog' | 'custom'>('list');
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card
        title={t.garage.myVehicles}
        action={
          mode === 'list' && (
            <div className="flex gap-2">
              <Button onClick={() => setMode('catalog')}>{t.garage.fromDatabase}</Button>
              <Button onClick={() => setMode('custom')}>{t.garage.customVehicle}</Button>
            </div>
          )
        }
      >
        {mode === 'catalog' && (
          <VehiclePicker
            locale={settings.locale}
            t={t}
            onCancel={() => setMode('list')}
            onPick={(vehicle) => {
              const id = addFromCatalog(vehicle);
              if (!settings.defaultVehicleId) updateSettings({ defaultVehicleId: id });
              setMode('list');
            }}
          />
        )}

        {mode === 'custom' && (
          <CustomVehicleForm
            t={t}
            onCancel={() => setMode('list')}
            onSubmit={(spec, nickname) => {
              const id = addCustom(spec, nickname);
              if (!settings.defaultVehicleId) updateSettings({ defaultVehicleId: id });
              setMode('list');
            }}
          />
        )}

        {mode === 'list' &&
          (vehicles.length === 0 ? (
            <EmptyState>{t.garage.noVehicles}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {vehicles.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {garageLabel(entry, settings.locale)}
                        </span>
                        {settings.defaultVehicleId === entry.id && (
                          <Chip color="var(--accent)">{t.garage.isDefault}</Chip>
                        )}
                        {!entry.vehicle.verified && !entry.custom && (
                          <Chip>{t.common.unverified}</Chip>
                        )}
                      </div>
                      <div className="tnum mt-1 text-xs text-faint">
                        {entry.vehicle.batteryCapacityKwh} {t.units.kwh} ·{' '}
                        {entry.vehicle.batteryType} · AC {entry.vehicle.acMaxKw} {t.units.kw}
                        {entry.vehicle.dcMaxKw > 0 &&
                          ` · DC ${entry.vehicle.dcMaxKw} ${t.units.kw}`}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {settings.defaultVehicleId !== entry.id && (
                        <Button
                          variant="ghost"
                          onClick={() => updateSettings({ defaultVehicleId: entry.id })}
                        >
                          {t.garage.setDefault}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => setEditing(editing === entry.id ? null : entry.id)}
                        aria-expanded={editing === entry.id}
                      >
                        {t.common.edit}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(t.garage.deleteConfirm)) remove(entry.id);
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>

                  {editing === entry.id && (
                    <VehicleEditor
                      entry={entry}
                      t={t}
                      onNickname={(nickname) => update(entry.id, { nickname })}
                      onSpec={(patch) => updateSpec(entry.id, patch)}
                    />
                  )}
                </li>
              ))}
            </ul>
          ))}
      </Card>

      <Notice>{t.garage.dataNotice}</Notice>
    </div>
  );
}

function VehicleEditor({
  entry,
  t,
  onNickname,
  onSpec,
}: {
  entry: GarageVehicle;
  t: ReturnType<typeof useT>;
  onNickname: (nickname: string) => void;
  onSpec: (patch: Partial<GarageVehicle['vehicle']>) => void;
}) {
  const { vehicle } = entry;
  return (
    <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
      <Field label={t.garage.nickname} htmlFor={`nickname-${entry.id}`}>
        <TextInput
          id={`nickname-${entry.id}`}
          value={entry.nickname ?? ''}
          onChange={(event) => onNickname(event.target.value)}
        />
      </Field>
      <Field label={t.garage.capacity} htmlFor={`capacity-${entry.id}`}>
        <NumberInput
          id={`capacity-${entry.id}`}
          value={vehicle.batteryCapacityKwh}
          min={1}
          step={0.01}
          onValueChange={(value) => onSpec({ batteryCapacityKwh: value })}
          suffix={t.units.kwh}
        />
      </Field>
      <Field label={t.garage.acMax} htmlFor={`ac-${entry.id}`}>
        <NumberInput
          id={`ac-${entry.id}`}
          value={vehicle.acMaxKw}
          min={0.1}
          step={0.1}
          onValueChange={(value) => onSpec({ acMaxKw: value })}
          suffix={t.units.kw}
        />
      </Field>
      <Field label={t.garage.dcMax} htmlFor={`dc-${entry.id}`}>
        <NumberInput
          id={`dc-${entry.id}`}
          value={vehicle.dcMaxKw}
          min={0}
          step={1}
          onValueChange={(value) => onSpec({ dcMaxKw: value })}
          suffix={t.units.kw}
        />
      </Field>
      <Field label={t.garage.chemistry} htmlFor={`chem-${entry.id}`}>
        <Select
          id={`chem-${entry.id}`}
          value={vehicle.batteryType}
          onChange={(event) => onSpec({ batteryType: event.target.value as BatteryChemistry })}
        >
          {CHEMISTRIES.map((chemistry) => (
            <option key={chemistry} value={chemistry}>
              {chemistry}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.garage.consumption} htmlFor={`consumption-${entry.id}`}>
        <NumberInput
          id={`consumption-${entry.id}`}
          value={vehicle.consumptionKwhPer100km ?? ''}
          min={1}
          step={0.1}
          onValueChange={(value) => onSpec({ consumptionKwhPer100km: value })}
          suffix={`${t.units.kwh}/100${t.units.km}`}
        />
      </Field>
    </div>
  );
}

function CustomVehicleForm({
  t,
  onSubmit,
  onCancel,
}: {
  t: ReturnType<typeof useT>;
  onSubmit: (spec: CustomVehicleSpec, nickname?: string) => void;
  onCancel: () => void;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [batteryCapacityKwh, setCapacity] = useState(60);
  const [batteryType, setChemistry] = useState<BatteryChemistry>('LFP');
  const [acMaxKw, setAc] = useState(7);
  const [dcMaxKw, setDc] = useState(90);
  const [consumption, setConsumption] = useState(13);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand" htmlFor="custom-brand">
          <TextInput id="custom-brand" value={brand} onChange={(event) => setBrand(event.target.value)} />
        </Field>
        <Field label="Model" htmlFor="custom-model">
          <TextInput id="custom-model" value={model} onChange={(event) => setModel(event.target.value)} />
        </Field>
        <Field label={t.garage.capacity} htmlFor="custom-capacity">
          <NumberInput
            id="custom-capacity"
            value={batteryCapacityKwh}
            min={1}
            step={0.01}
            onValueChange={setCapacity}
            suffix={t.units.kwh}
          />
        </Field>
        <Field label={t.garage.chemistry} htmlFor="custom-chemistry">
          <Select
            id="custom-chemistry"
            value={batteryType}
            onChange={(event) => setChemistry(event.target.value as BatteryChemistry)}
          >
            {CHEMISTRIES.map((chemistry) => (
              <option key={chemistry} value={chemistry}>
                {chemistry}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.garage.acMax} htmlFor="custom-ac">
          <NumberInput id="custom-ac" value={acMaxKw} min={0.1} step={0.1} onValueChange={setAc} suffix={t.units.kw} />
        </Field>
        <Field label={t.garage.dcMax} htmlFor="custom-dc">
          <NumberInput id="custom-dc" value={dcMaxKw} min={0} step={1} onValueChange={setDc} suffix={t.units.kw} />
        </Field>
        <Field label={t.garage.consumption} htmlFor="custom-consumption">
          <NumberInput
            id="custom-consumption"
            value={consumption}
            min={1}
            step={0.1}
            onValueChange={setConsumption}
            suffix={`${t.units.kwh}/100${t.units.km}`}
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!brand.trim() || !model.trim()}
          onClick={() =>
            onSubmit({
              brand: brand.trim(),
              model: model.trim(),
              batteryCapacityKwh,
              batteryType,
              acMaxKw,
              dcMaxKw,
              consumptionKwhPer100km: consumption,
            })
          }
        >
          {t.common.save}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  );
}
