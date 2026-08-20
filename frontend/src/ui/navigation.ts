/**
 * Navigation — WebOS remote control focus management for the shell UI.
 *
 * Spatial model: arrow keys move focus to the nearest visible
 * [data-focusable] element in the pressed direction, judged by the
 * geometry of the elements' bounding rects (projected center distance).
 * Falls back to the DOM order when no geometric candidate exists.
 */

interface Candidate {
    el: HTMLElement;
    x: number; // center x
    y: number; // center y
}

function isVisible(element: HTMLElement): boolean {
    return !!(element.offsetWidth > 0 && element.offsetHeight > 0);
}

function getCandidates(): Candidate[] {
    return Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable]')
    )
        .filter(isVisible)
        .map((el) => {
            const r = el.getBoundingClientRect();
            return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
}

function currentCandidate(candidates: Candidate[]): Candidate | null {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return null;
    return candidates.find((c) => c.el === active) ?? null;
}

/**
 * Pick the best element in direction (dx, dy) from `from`.
 * Elements must be mostly in the requested direction (dot product > 0);
 * among those, prefer alignment on the perpendicular axis and short distance.
 */
function pickDirectional(
    candidates: Candidate[],
    from: Candidate,
    dx: number,
    dy: number
): Candidate | null {
    let best: Candidate | null = null;
    let bestScore = Infinity;

    for (const c of candidates) {
        if (c === from) continue;
        const vx = c.x - from.x;
        const vy = c.y - from.y;

        // Primary-direction component must dominate
        const forward = vx * dx + vy * dy;
        if (forward <= 0) continue;

        // Perpendicular offset — heavily penalized so "mostly right" beats
        // "slightly right but far down"
        const perp = Math.abs(vx * dy - vy * dx);
        const score = forward + perp * perp / (forward + 1);

        if (score < bestScore) {
            bestScore = score;
            best = c;
        }
    }
    return best;
}

/** Move focus one step in DOM order (-1 = previous, 1 = next), wrapping. */
export function navigate(direction: -1 | 1): void {
    const elements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable]')
    ).filter(isVisible);
    if (elements.length === 0) return;

    const active = document.activeElement as HTMLElement;
    let nextIndex = 0;

    if (active && isVisible(active)) {
        const currentIndex = elements.indexOf(active);
        if (currentIndex !== -1) {
            nextIndex = currentIndex + direction;
            if (nextIndex < 0) nextIndex = elements.length - 1;
            if (nextIndex >= elements.length) nextIndex = 0;
        }
    }

    elements[nextIndex]?.focus();
}

/** Move focus spatially in the given unit direction. */
export function navigateSpatial(dx: number, dy: number): void {
    const candidates = getCandidates();
    if (candidates.length === 0) return;

    const from = currentCandidate(candidates);
    if (!from) {
        candidates[0].el.focus();
        return;
    }

    const target = pickDirectional(candidates, from, dx, dy);
    if (target) {
        target.el.focus();
    } else {
        // Nothing in that direction — wrap via linear order
        navigate(dy < 0 || dx < 0 ? -1 : 1);
    }
}

/** Initialize focus to the first visible focusable element. */
export function initNavigation(): void {
    const elements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable]')
    );
    const first = elements.find(isVisible);
    if (first) {
        first.focus();
    }
}

/**
 * Register a keyboard shortcut handler for remote-control keys.
 * Returns the event handler so it can be removed later.
 */
export function createKeyHandler(): (evt: KeyboardEvent) => void {
    return (evt: KeyboardEvent) => {
        switch (evt.keyCode) {
            case 38: // Up
                navigateSpatial(0, -1);
                evt.preventDefault();
                break;
            case 40: // Down
                navigateSpatial(0, 1);
                evt.preventDefault();
                break;
            case 37: // Left
                navigateSpatial(-1, 0);
                evt.preventDefault();
                break;
            case 39: // Right
                navigateSpatial(1, 0);
                evt.preventDefault();
                break;
            case 461: // WebOS Back key
                // Back is handled by main.ts — no action here
                break;
        }
    };
}
