import type { HostToWebview, LangCompletion, LangDiagnostic, TextPosition, WebviewToHost } from '../shared/protocol';

type Pending =
  | { op: 'complete'; resolve: (items: LangCompletion[]) => void }
  | { op: 'lint'; resolve: (items: LangDiagnostic[]) => void }
  | { op: 'hover'; resolve: (text: string | undefined) => void };

/** Sends intents to the host and correlates language requests with their replies. Pure: takes the `post` function. */
export class Bridge {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly post: (msg: WebviewToHost) => void) {}

  send(msg: WebviewToHost): void {
    this.post(msg);
  }

  complete(text: string, pos: TextPosition): Promise<LangCompletion[]> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { op: 'complete', resolve });
      this.post({ type: 'lang', id, op: 'complete', text, pos });
    });
  }

  lint(text: string): Promise<LangDiagnostic[]> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { op: 'lint', resolve });
      this.post({ type: 'lang', id, op: 'lint', text });
    });
  }

  hover(text: string, pos: TextPosition): Promise<string | undefined> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { op: 'hover', resolve });
      this.post({ type: 'lang', id, op: 'hover', text, pos });
    });
  }

  /** Feed every host message here; true means it was a reply this bridge consumed. */
  receive(msg: HostToWebview): boolean {
    if (msg.type !== 'langResult') return false;
    const p = this.pending.get(msg.id);
    if (!p) return true;
    this.pending.delete(msg.id);
    if (p.op === 'complete' && msg.op === 'complete') p.resolve(msg.items);
    else if (p.op === 'lint' && msg.op === 'lint') p.resolve(msg.items);
    else if (p.op === 'hover' && msg.op === 'hover') p.resolve(msg.text);
    // A mismatched op is a host bug; resolve empty so the editor never hangs on it.
    else if (p.op === 'hover') p.resolve(undefined);
    else p.resolve([]);
    return true;
  }
}
