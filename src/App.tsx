import { BrowserRouter, Route, Routes } from 'react-router';

import Home from '~/views/Home';
import Game from '~/views/Game';

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
