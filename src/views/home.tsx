import { Link } from 'react-router';

export default function Home() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-neutral-900">
      <h1 className="text-4xl font-bold text-white">
        Dracula: Reign of Terror
      </h1>
      <Link
        to="/game"
        className="rounded bg-neutral-700 px-4 py-2 text-white hover:bg-neutral-600"
      >
        Play
      </Link>
    </div>
  );
}
