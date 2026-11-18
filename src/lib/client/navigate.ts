/**
 * Full page load to an internal path. Used after the session changes (sign-in,
 * sign-out, account deletion) so every server-rendered part of the page is
 * fetched again with the new session and no cached view of the old one survives.
 */
export function reloadTo(path: string): void {
  window.location.assign(path);
}
