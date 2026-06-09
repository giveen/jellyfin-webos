/**
 * Navigation — WebOS remote control focus management for the shell UI.
 * Minimal implementation using data-focusable attributes.
 */

function isVisible(element: HTMLElement | null): boolean {
    return !!(element && element.offsetWidth > 0 && element.offsetHeight > 0);
}

function getFocusableElements(): HTMLElement[] {
    return Array.from(
        document.querySelectorAll<HTMLElement>('[data-focusable]')
    );
}

function findIndex(elements: HTMLElement[], current: HTMLElement): number {
    return elements.findIndex(el => el.isEqualNode(current));
}

/**
 * Move focus in a direction (-1 = previous, 1 = next).
 * Wraps around at the ends.
 */
export function navigate(direction: -1 | 1): void {
    const elements = getFocusableElements();
    if (elements.length === 0) return;

    const active = document.activeElement as HTMLElement;
    let nextIndex = 0;

    if (active && isVisible(active)) {
        const currentIndex = findIndex(elements, active);
        if (currentIndex !== -1) {
            nextIndex = currentIndex + direction;
            // Wrap around
            if (nextIndex < 0) nextIndex = elements.length - 1;
            if (nextIndex >= elements.length) nextIndex = 0;
        }
    }

    elements[nextIndex]?.focus();
}

/**
 * Initialize focus to the first visible focusable element.
 */
export function initNavigation(): void {
    const elements = getFocusableElements();
    const first = elements.find(isVisible);
    if (first) {
        first.focus();
    }
}

/**
 * Register a keyboard shortcut handler.
 * Returns the event handler so it can be removed later.
 */
export function createKeyHandler(): (evt: KeyboardEvent) => void {
    return (evt: KeyboardEvent) => {
        switch (evt.keyCode) {
            case 38: // Up
            case 37: // Left
                navigate(-1);
                evt.preventDefault();
                break;
            case 40: // Down
            case 39: // Right
                navigate(1);
                evt.preventDefault();
                break;
            case 461: // WebOS Back key
                // Back is handled by main.ts — no action here
                break;
        }
    };
}
