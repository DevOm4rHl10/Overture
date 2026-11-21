// Draws pixel art as crisp SVG: one <path> per colour, every pixel a 1×1 square.

const SVG_NS = "http://www.w3.org/2000/svg";

function sizeOf(rows) {
    return { width: rows[0].length, height: rows.length };
}

// One sprite → an <svg> sized `scale` screen pixels per art pixel
export function drawSprite(rows, palette, scale = 4, className = "") {
    const { width, height } = sizeOf(rows);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width * scale);
    svg.setAttribute("height", height * scale);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);
    svg.appendChild(spriteGroup(rows, palette));
    return svg;
}

// The pixels of one sprite as a <g> (used for animation frames)
export function spriteGroup(rows, palette) {
    const byColour = new Map();
    rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
            if (ch === "." || !palette[ch]) return;
            const d = byColour.get(ch) ?? [];
            d.push(`M${x} ${y}h1v1h-1z`);
            byColour.set(ch, d);
        });
    });
    const g = document.createElementNS(SVG_NS, "g");
    for (const [ch, parts] of byColour) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", parts.join(""));
        path.setAttribute("fill", palette[ch]);
        g.appendChild(path);
    }
    return g;
}

// Several frames in one <svg>; returns { svg, start(), stop() }.
// With reduced motion, only the first frame is ever shown.
export function animatedSprite(frames, palette, scale, fps, className = "") {
    const { width, height } = sizeOf(frames[0]);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width * scale);
    svg.setAttribute("height", height * scale);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);

    const groups = frames.map((rows, i) => {
        const g = spriteGroup(rows, palette);
        if (i > 0) g.setAttribute("visibility", "hidden");
        svg.appendChild(g);
        return g;
    });

    let timer = null;
    let index = 0;
    const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    return {
        svg,
        start() {
            if (timer || reduced() || groups.length < 2) return;
            timer = setInterval(() => {
                groups[index].setAttribute("visibility", "hidden");
                index = (index + 1) % groups.length;
                groups[index].setAttribute("visibility", "visible");
            }, 1000 / fps);
        },
        stop() {
            clearInterval(timer);
            timer = null;
        },
    };
}


// ── A tiny 5×7 bitmap font, for the title only ─────────────────────────────

const GLYPHS = {
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
};

// Pixel text with a one-pixel drop shadow
export function drawPixelText(text, colour, shadow, scale = 4) {
    const letters = [...text.toUpperCase()].map((c) => GLYPHS[c]);
    if (letters.some((g) => !g)) throw new Error(`no glyph for "${text}"`);

    const width = letters.length * 6 - 1 + 1;   // 1 px gap, +1 for the shadow
    const height = 7 + 1;
    const rows = Array.from({ length: height }, () => Array(width).fill("."));

    letters.forEach((glyph, i) => {
        glyph.forEach((line, y) => {
            [...line].forEach((px, x) => {
                if (px !== "#") return;
                const gx = i * 6 + x;
                if (rows[y + 1][gx + 1] === ".") rows[y + 1][gx + 1] = "s";
                rows[y][gx] = "t";
            });
        });
    });

    const svg = drawSprite(rows.map((r) => r.join("")), { t: colour, s: shadow }, scale, "pixel-title");
    svg.removeAttribute("aria-hidden");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", text);
    return svg;
}
