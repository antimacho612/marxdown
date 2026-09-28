import { initCommon } from './common';
import { initHero } from './landing/hero';
import { initScenes } from './landing/scenes';
import { initThemes } from './landing/themes';
import { initTour } from './landing/tour';
import { initTypography } from './landing/typography';
import { observeMermaid } from './mermaid';

initCommon();
initHero();
initScenes();
initTour();
initThemes();
initTypography();
observeMermaid();
