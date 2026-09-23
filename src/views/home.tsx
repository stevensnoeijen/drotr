import { useState } from 'react';
import { Link } from 'react-router';

import { useParsedMaps } from '~/game/map/use-parsed-maps';
import { maps } from '~/game/maps';
import { scenarios } from '~/game/scenarios';
import {
  isScenarioCompatibleWithMap,
  pickCompatibleScenarioId,
} from '~/game/scenarios/compatibility';

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

  // Map cards are always clickable — never greyed out — so the selected map
  // is just whatever the user last clicked, with no compatibility fallback.
  const mapId = selectedMapId;
  const mapState = parsedMaps[mapId];
  const mapDefinition = maps.find((map) => map.id === mapId);

  // Whether each scenario can be used with the selected map, so incompatible
  // scenario cards stay greyed out. Falls back to the first compatible
  // scenario if the current pick no longer fits (e.g. right after switching
  // maps, before `handleSelectMap`'s state write below has taken effect, or
  // while the map is still loading) — a display/launch-link safety net, not
  // the mechanism that actually performs the auto-switch.
  const scenarioAvailability = new Map(
    scenarios.map((s) => [s.id, isScenarioCompatibleWithMap(s, mapDefinition, mapState)])
  );
  const scenarioId = scenarioAvailability.get(selectedScenarioId)
    ? selectedScenarioId
    : (scenarios.find((s) => scenarioAvailability.get(s.id))?.id ?? selectedScenarioId);

  const launchDisabled = !scenarioAvailability.get(scenarioId);

  // Selecting a map is a real user action: if the newly picked map isn't
  // compatible with the currently selected scenario, stick the selection to
  // the first scenario (in registry order) that is, rather than leaving the
  // scenario picker's visible selection stale until a later render's
  // fallback silently redirects Launch underneath it.
  function handleSelectMap(newMapId: string) {
    setSelectedMapId(newMapId);
    const newMapDefinition = maps.find((map) => map.id === newMapId);
    const newMapState = parsedMaps[newMapId];
    setSelectedScenarioId((currentScenarioId) =>
      pickCompatibleScenarioId(scenarios, currentScenarioId, newMapDefinition, newMapState)
    );
  }

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
              onSelect={() => handleSelectMap(map.id)}
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
