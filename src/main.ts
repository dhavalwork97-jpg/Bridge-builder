import './style.css';
import { Game } from './game/game';

const game = new Game();
game.start();
// Small hook for automated QA / debugging (read-only helpers + level jump). Harmless in production.
(window as unknown as { __bb: Game }).__bb = game;
