# Military reward tags

Created for DUSTLINE on 2026-11-09 using the built-in `image_gen` tool.
The three backplates and numeral texture are original generated raster assets.
Portraits come from the existing TMDC_Zombie atlas imports in `public/autoplay`.

Generation mode: `bronze` and `digits` are text-to-image generations. `silver` and
`gold` are image edits referencing the generated bronze plate, with alpha preserved.
All files below are saved in `public/reward-tags/`; the prompts are recorded verbatim.

Files: `bronze.png`, `silver.png`, `gold.png`, `digits.png`, `digits.fnt`.
The font descriptor uses the original unmodified generated numeral atlas.
`tools/build_reward_font.py` finds its glyph rectangles and writes BMFont metrics.

## Prompts

### bronze

Use case: stylized-concept. Asset type: production-ready transparent game HUD sprite, one empty horizontal military reward dog-tag backplate for a polished dark tactical zombie FPS. Primary request: Create a striking BRONZE tier military dog tag, inspired by classic Counter-Strike Online medal UI aesthetics but original artwork, no logo. Straight-on orthographic 2D presentation, absolutely no perspective tilt, one long horizontal plaque with approximately 3.2:1 width-to-height ratio, centered with only a narrow transparent safety margin. Silhouette: thick machined rectangular dog tag with elegant clipped corners, rugged copper-bronze bevels, small industrial rivets, an eyelet at upper left with a very short steel bead chain curled tightly at that corner, broad recessed gunmetal face. The left 28 percent contains an EMPTY dark circular portrait recess with a thick bronze ring, large enough for a monster portrait added later. The right 67 percent is an EMPTY uninterrupted dark charcoal brushed metal number field, perfect for large bright numerical winnings added in code. Low contrast fine brushed texture, restrained edge scratches, precise luminous amber copper rim accents, depth and crisp realistic materials, high contrast edges, warm bronze/copper not yellow gold. All decoration stays at outer edges, no symbol or engraving across the usable empty fields. No characters, no faces, no numbers, NO TEXT, no letters, no currency symbol, no rank badge, no watermark, no backdrop, no extra plates. Alpha-transparent canvas outside the physical plaque and chain. High quality game art, sharp at small HUD sizes. Wide landscape canvas.

### digits

Use case: stylized-concept. Asset type: transparent bitmap font texture atlas for an FPS military reward counter. Create exactly twelve isolated glyphs in a strict regular 4-column by 3-row sprite grid on a transparent canvas. Row one left to right: 0 1 2 3. Row two: 4 5 6 7. Row three: 8 9 , +. Each glyph appears exactly once, centered horizontally inside its own equally sized cell, all rows have the same type baseline and digit cap-height. Nothing overlaps across cells. Substantial transparent padding between glyphs. All glyphs in exactly the same bold condensed italic squared techno military display font, extremely legible numerals, solid substantial strokes, precision chamfered corners, attractive polished pale ivory metal faces with warm gold beveled sides, thin deep brown outline and tight amber edge light. Restrained dimensional extrusion to lower right only. Premium arcade prize typography, dramatic but legible for counting real money values, not handwritten and not segmented digital clock numerals. The comma is a distinct readable comma near the baseline and plus is centered at mid height. Do not use decorations inside counters. No labels, no grid lines, no panel, no plates, no other text, no background, no shadows between cells. EXACT character content: 0123456789,+. Preserve genuinely transparent background. Landscape 4:3 sheet with clean alignment, ready to be described by a BMFont .fnt file.

### silver

Use case: precise-object-edit. Edit target: the provided bronze military reward plaque. Create the SILVER tier variant of this exact game HUD sprite. Preserve the exact silhouette, proportions, frame positions, left circular empty portrait recess, large right empty dark number field, chain, rivets, all geometry, straight-on orientation, transparent background, and overall dimensions. Change the bronze/copper frame and ring to beautifully brushed SILVER steel with bright polished chrome bevel edges and restrained cool ice-blue glints. Keep the interior very dark gunmetal for number contrast. Crisp premium realistic metal. No text, no digits, no images inside either empty area, no symbols, no new objects, no watermark. Actual alpha transparency outside plaque and chain. Only change the metal finish and accent light colors.

### gold

Use case: precise-object-edit. Edit target: the provided bronze military reward plaque. Create the GOLD tier variant of this exact game HUD sprite. Preserve the exact silhouette, proportions, frame positions, left circular empty portrait recess, large right empty dark number field, chain, rivets, all geometry, straight-on orientation, transparent background, and overall dimensions. Change the bronze/copper frame and ring to prestigious rich GOLD titanium, clean polished beveled gold edges and brighter restrained warm amber highlights. Keep the interior very dark charcoal for number contrast. Distinctly yellow gold rather than copper orange. Premium high reward game art with metallic depth. No text, no digits, no images inside either empty area, no symbols, no new objects, no watermark. Actual alpha transparency outside plaque and chain. Only change the metal finish and accent light colors.
