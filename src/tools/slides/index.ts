import type { FastMCP } from 'fastmcp';
import { register as registerCreatePresentation } from './createPresentation.js';
import { register as registerReadPresentation } from './readPresentation.js';
import { register as registerListSlides } from './listSlides.js';

export function registerSlidesTools(server: FastMCP) {
  registerCreatePresentation(server);
  registerReadPresentation(server);
  registerListSlides(server);
}
