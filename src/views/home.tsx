import { Link } from 'react-router';

import { testCases } from '~/game/testcases';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-neutral-900 px-6 py-12">
      <h1 className="text-4xl font-bold text-white">
        Dracula: Reign of Terror
      </h1>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {testCases.map((testCase) => (
          <Link
            key={testCase.id}
            to={`/game?case=${testCase.id}`}
            className="flex flex-col gap-1 rounded border border-neutral-700 bg-neutral-800 p-4 text-left hover:border-neutral-500 hover:bg-neutral-700"
          >
            <span className="font-mono text-xs text-neutral-400">
              {testCase.id}
            </span>
            <span className="text-lg font-semibold text-white">
              {testCase.title}
            </span>
            <span className="text-sm text-neutral-300">
              {testCase.description}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
