/**
 * Signals from the page to the star field, kept free of the scene's code so
 * that sending one costs the main bundle nothing.
 */

/** A link to another page has been followed; `detail.to` is where to. */
export const DEPART_EVENT = "starfield:depart";

export function announceDeparture(to: string) {
  window.dispatchEvent(new CustomEvent(DEPART_EVENT, { detail: { to } }));
}

/**
 * Set on the root while something covers the whole viewport (the reading
 * assistant's sheet on a phone): the sky stops drawing until it is gone.
 */
export const COVERED_ATTRIBUTE = "data-sky-covered";
