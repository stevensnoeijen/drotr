import { HashRouter, Route, Routes } from 'react-router';

import Home from '~/views/home';
import Game from '~/views/game';

// Hash-based routing: the URL contract for test cases is
// `#/game?case=<id>&map=<name>&debug=<flags>`, so a case can be bookmarked
// and reloaded straight off a static host without server-side routing.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route index element={<Home />} />
        <Route path="/game" element={<Game />} />
      </Routes>
    </HashRouter>
  );
}
