/**
 * The two — and only two — teams in the game.
 *
 * Deliberately a two-member string union rather than an enum or a number:
 * there is no neutral, ally or third faction, so "attack a teammate" must be
 * unrepresentable. Any code that decides friend-or-foe can exhaustively switch
 * on this without a fallthrough case.
 */
export type Team = 'blue' | 'red';
