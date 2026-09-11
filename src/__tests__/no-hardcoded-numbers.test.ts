/**
 * Components render numbers; they never hold them.
 *
 * A figure typed into JSX is a figure nothing can check: it does not move when
 * the fund moves, it is not true in the other two states, and no invariant can
 * reach it. This test reads every file under src/components and src/pages and
 * fails on a user-facing string literal carrying a rupee sign, a crore, a lakh,
 * a percentage or a number of three digits or more.
 *
 * Style and layout values do not count. A width, a radius or a font size is not
 * a claim about the fund.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components', 'src/pages'];

/**
 * Files allowed to hold a number, each with the reason. Anything not on this
 * list must get its numbers from derive().
 */
const ALLOWED: Record<string, string> = {
  'src/components/ui/Icon.tsx':
    'SVG path data. Coordinates in a 24x24 box, not figures about the fund.',
  'src/components/shell/Shell.tsx':
    'One breakpoint constant (RAIL_BELOW = 1440), which is a layout width.',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full.split('\\').join('/'));
  }
  return out;
}

/** Strip what is not a user-facing number: styles, classes and imports. */
function stripNonText(src: string): string {
  return (
    src
      // Style objects and inline style props.
      .replace(/style=\{\{[^}]*\}\}/g, '')
      .replace(/\bstyle:\s*\{[^}]*\}/g, '')
      // Class names and CSS custom properties.
      .replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})/g, '')
      .replace(/var\(--[\w-]+\)/g, '')
      // Imports, which name modules rather than say anything.
      .replace(/^import[\s\S]*?from\s+'[^']+';$/gm, '')
      // A percentage is carried as 0-100, so turning a fraction into one needs
      // the literal 100. That is a unit, not a figure about the fund. So is a
      // clamp that keeps a bar inside its track.
      .replace(/[*/]\s*100\b/g, '')
      .replace(/\b100\s*-/g, '')
      .replace(/Math\.(min|max)\([^;]*?\)\)/g, '')
      // Geometry props on icons and bars.
      .replace(/\b(width|height|size|viewBox|strokeWidth|x|y|cx|cy|r|dx|dy|offset|outlineOffset|marginRight|marginTop|marginBottom|flex|gap|top|left|right|bottom|minWidth|maxWidth|lineHeight|fontWeight|zIndex|tabIndex|colSpan)=\{?-?[\d.]+\}?/g, '')
  );
}

/** Numbers that read as claims about money or size rather than layout. */
const CLAIMS = [
  { name: 'a rupee figure', re: /₹\s?[\d,]/ },
  { name: 'a crore or lakh figure', re: /\b[\d,.]+\s?(cr|lakh)\b/ },
  { name: 'a percentage', re: /\b[\d,.]+\s?%/ },
  { name: 'a number of three digits or more', re: /(?<![\w.#-])\d{3,}(?![\w.%])/ },
];

describe('components hold no numbers', () => {
  const files = ROOTS.flatMap(walk);

  it('finds the component files at all', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    it(`${file} quotes no figure of its own`, () => {
      const src = readFileSync(file, 'utf8');
      if (ALLOWED[file]) {
        // A whitelisted file still has to carry its reason here.
        expect(ALLOWED[file].length).toBeGreaterThan(20);
        return;
      }
      const text = stripNonText(src);
      const found: string[] = [];
      for (const line of text.split('\n')) {
        // Comments explain; they do not render.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        for (const c of CLAIMS) {
          const m = line.match(c.re);
          if (m) found.push(`${c.name}: ${line.trim()}`);
        }
      }
      expect(found, `${file} must take these from derive()`).toEqual([]);
    });
  }

  it('every whitelisted file still exists', () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(files, `${file} is whitelisted but gone`).toContain(file);
    }
  });
});
