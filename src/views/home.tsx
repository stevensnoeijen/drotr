import { useState } from 'react';
import { Link } from 'react-router';

import { useParsedMaps } from '~/game/map/use-parsed-maps';
import { maps } from '~/game/maps';
import { scenarios } from '~/game/scenarios';
import { isScenarioCompatibleWithMap } from '~/game/scenarios/compatibility';

function PickerCard({
  id,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      className={`flex flex-col gap-1 rounded border p-4 text-left ${
        disabled
          ? 'cursor-not-allowed border-neutral-800 bg-neutral-900 opacity-50'
          : selected
            ? 'border-neutral-400 bg-neutral-700'
            : 'border-neutral-700 bg-neutral-800 hover:border-neutral-500 hover:bg-neutral-700'
      }`}
    >
      <span className="font-mono text-xs text-neutral-400">{id}</span>
      <span className="text-lg font-semibold text-white">{title}</span>
      <span className="text-sm text-neutral-300">{description}</span>
    </button>
  );
}

export default function Home() {
  const parsedMaps = useParsedMaps(maps);
  const [selectedMapId, setSelectedMapId] = useState(maps[0].id);
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarios[0].id);

  const selectedScenario =
    scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0];

  // Whether each map can be used with the user's selected scenario.
  const mapAvailability = new Map(
    maps.map((map) => [
      map.id,
      isScenarioCompatibleWithMap(selectedScenario, parsedMaps[map.id]),
    ])
  );

  // If the selected map isn't usable with the selected scenario (e.g. the
  // scenario was just switched to one this map doesn't support), fall back
  // to the first map that is, rather than highlighting a disabled card and
  // pointing Launch at a combination `validateMap` would reject. Derived at
  // render time — not written back into `selectedMapId` — so this never
  // needs a state-syncing effect; it just recomputes as inputs change.
  const mapId = mapAvailability.get(selectedMapId)
    ? selectedMapId
    : (maps.find((map) => mapAvailability.get(map.id))?.id ?? selectedMapId);

  const mapState = parsedMaps[mapId];

  // Same idea in the other direction: whether each scenario can be used
  // with the (possibly just-fallen-back-to) selected map, and falling back
  // to the first one that can if the current pick no longer fits.
  const scenarioAvailability = new Map(
    scenarios.map((s) => [s.id, isScenarioCompatibleWithMap(s, mapState)])
  );
  const scenarioId = scenarioAvailability.get(selectedScenarioId)
    ? selectedScenarioId
    : (scenarios.find((s) => scenarioAvailability.get(s.id))?.id ?? selectedScenarioId);

  const launchDisabled = !mapAvailability.get(mapId) || !scenarioAvailability.get(scenarioId);

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-neutral-900 px-6 py-12">
      <h1 className="text-4xl font-bold text-white">
        Dracula: Reign of Terror
      </h1>

      <section className="w-full max-w-3xl">
        <h2 className="mb-3 text-lg font-semibold text-white">Map</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {maps.map((map) => (
            <PickerCard
              key={map.id}
              id={map.id}
              title={map.title}
              description={map.description}
              selected={map.id === mapId}
              disabled={!mapAvailability.get(map.id)}
              onSelect={() => setSelectedMapId(map.id)}
            />
          ))}
        </div>
      </section>

      <section className="w-full max-w-3xl">
        <h2 className="mb-3 text-lg font-semibold text-white">Scenario</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {scenarios.map((s) => (
            <PickerCard
              key={s.id}
              id={s.id}
              title={s.title}
              description={s.description}
              selected={s.id === scenarioId}
              disabled={!scenarioAvailability.get(s.id)}
              onSelect={() => setSelectedScenarioId(s.id)}
            />
          ))}
        </div>
      </section>

      {launchDisabled ? (
        <span className="cursor-not-allowed rounded bg-neutral-700 px-6 py-3 text-lg font-semibold text-neutral-400">
          Launch
        </span>
      ) : (
        <Link
          to={`/game?scenario=${scenarioId}&map=${mapId}`}
          className="rounded bg-emerald-600 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-500"
        >
          Launch
        </Link>
      )}
    </div>
  );
}
