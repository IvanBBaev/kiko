import type { OgImageRenderer } from '../core/ports.js';
import type { OgCardData } from '../core/types.js';
import { config } from '../config.js';
import { buildCardElement, buildCardModel } from './card.js';
import { interBold, interRegular } from './font-data.js';

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Renders the OG card with satori (layout + text -> SVG <path>, so the output is
 * independent of any system font) and rasterizes the SVG to PNG with resvg.
 * satori, resvg and their wasm/native deps are imported lazily so CLIs that never
 * render (ingest, pipeline, backup) don't pay to load them.
 */
export class SatoriOgRenderer implements OgImageRenderer {
  readonly name = 'satori';

  /** Render the card to an SVG string (text already vectorized to paths). */
  async renderSvg(card: OgCardData): Promise<string> {
    const { default: satori } = await import('satori');
    // Date locale follows the post's own channel, not always the site channel.
    const locale = card.kind === 'linkedin' ? config.languages.linkedin : config.languages.site;
    // satori types its element as React's ReactNode; with no @types/react that
    // resolves structurally to `any`, so our plain {type, props} tree (which is
    // exactly satori's runtime contract) is accepted directly.
    const element = buildCardElement(buildCardModel(card, locale));
    return satori(element, {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
        { name: 'Inter', data: interBold, weight: 700, style: 'normal' },
      ],
    });
  }

  async render(card: OgCardData): Promise<Buffer> {
    const svg = await this.renderSvg(card);
    const { Resvg } = await import('@resvg/resvg-js');
    // satori already vectorized every glyph to <path>, so resvg needs no fonts at
    // all; loadSystemFonts:false just keeps rasterization deterministic and off-disk.
    const resvg = new Resvg(svg, { font: { loadSystemFonts: false } });
    return Buffer.from(resvg.render().asPng());
  }
}
