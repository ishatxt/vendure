import { Garden } from './garden.js';
import './ui.js';
import './garden-state.js';
import './poster.js';
import './export.js';
import './input.js';
import './draw.js';
import './layout.js';
import './growth.js';
import './butterflies.js';
import './frame.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { window.garden = new Garden(); });
} else {
  window.garden = new Garden();
}
