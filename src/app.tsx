import { BrowserRouter, Route, Routes } from 'react-router';

import Home from '~/views/home';
import Game from '~/views/game';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Home />} />
        <Route path="/game" element={<Game />} />
      </Routes>
    </BrowserRouter>
  );
}
