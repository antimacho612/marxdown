import '@/styles/tokens.css';
import '@/styles/preview/preview.css';
import '@/styles/preview/math.css';
import 'katex/dist/katex.min.css';
import '../styles/base.css';
import '../styles/window.css';
import '../styles/landing.css';

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
