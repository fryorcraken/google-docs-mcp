import type { FastMCP } from 'fastmcp';
import { register as registerCreatePresentation } from './createPresentation.js';
import { register as registerReadPresentation } from './readPresentation.js';
import { register as registerListSlides } from './listSlides.js';
import { register as registerAddSlide } from './addSlide.js';
import { register as registerDeleteSlide } from './deleteSlide.js';
import { register as registerDuplicateSlide } from './duplicateSlide.js';
import { register as registerMoveSlide } from './moveSlide.js';
import { register as registerReplaceAllText } from './replaceAllText.js';
import { register as registerInsertSlideText } from './insertSlideText.js';
import { register as registerApplySlideTextStyle } from './applySlideTextStyle.js';
import { register as registerInsertSlideImage } from './insertSlideImage.js';

export function registerSlidesTools(server: FastMCP) {
  registerCreatePresentation(server);
  registerReadPresentation(server);
  registerListSlides(server);
  registerAddSlide(server);
  registerDeleteSlide(server);
  registerDuplicateSlide(server);
  registerMoveSlide(server);
  registerReplaceAllText(server);
  registerInsertSlideText(server);
  registerApplySlideTextStyle(server);
  registerInsertSlideImage(server);
}
