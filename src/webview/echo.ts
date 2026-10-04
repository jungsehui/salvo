/**
 * Values this field sent to the host, oldest first. When the host's snapshot
 * brings one of them back, it is our own commit echoing: the field keeps its
 * draft, because the user may have typed on since. Anything else is a foreign
 * change, and the field adopts it.
 *
 * Returns true when `incoming` echoes a pending commit. That entry and every
 * older one are consumed. Returns false for a foreign value and clears the list.
 */
export function consumeEcho(
  pending: string[],
  incoming: string,
  isEcho: (sent: string, incoming: string) => boolean = (sent, got) => sent === got
): boolean {
  const i = pending.findIndex((sent) => isEcho(sent, incoming));
  if (i === -1) {
    pending.length = 0;
    return false;
  }
  pending.splice(0, i + 1);
  return true;
}
