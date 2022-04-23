# Dracula: Reign of Terror Remake

Dracula: Reign of Terror Remake is a remake of "Dracula: Reign of Terror" (a.k.a. Vlad Tepes Dracula) strategy game from 1997.

This game is in development, but not every actively.

I do not own any of the rights of the original game!

Take a peek of the current state of the game [here](https://stevensnoeijen.github.io/drotr/).

# Requirements

- node

# QuickStart

```
npm install
npm run dev
```

A browser tab will open, click "Run in web browser".

# Test

Currently only some unit-tests are available thought running `npm run test`.

All tests are automaticly ran at pr!

# Debug

To use debug options add `#debug=<options>` and replace `<options>` to the url and refresh the page.
Example: `#debug=grid`.

Current debug options are:

- `grid`

# Levels

To select a level add `#level=<level>` and replace `<level>` to the url and refresh the page.

Current levels are:

- `randomunits` (default)
- `pathfinding`