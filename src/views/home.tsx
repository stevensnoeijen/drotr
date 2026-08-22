import { useState } from 'react';
import { Link } from 'react-router';

import { maps } from '~/game/maps';
import { scenarios } from '~/game/scenarios';

function PickerCard({
  id,
  title,
  description,
  selected,
  onSelect,
}: {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col gap-1 rounded border p-4 text-left ${
        selected
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
  const [mapId, setMapId] = useState(maps[0].id);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);

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
              onSelect={() => setMapId(map.id)}
            />
          ))}
        </div>
      </section>

      <section className="w-full max-w-3xl">
        <h2 className="mb-3 text-lg font-semibold text-white">Scenario</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <PickerCard
              key={scenario.id}
              id={scenario.id}
              title={scenario.title}
              description={scenario.description}
              selected={scenario.id === scenarioId}
              onSelect={() => setScenarioId(scenario.id)}
            />
          ))}
        </div>
      </section>

      <Link
        to={`/game?scenario=${scenarioId}&map=${mapId}`}
        className="rounded bg-emerald-600 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-500"
      >
        Launch
      </Link>
    </div>
  );
}
