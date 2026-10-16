/** Append-only Uint32Array that grows as needed. */
export class U32Builder {
  private buf: Uint32Array;
  length = 0;

  constructor(initialCapacity = 1024) {
    this.buf = new Uint32Array(Math.max(16, initialCapacity));
  }

  push(value: number): void {
    if (this.length === this.buf.length) {
      const next = new Uint32Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.length++] = value;
  }

  pop(): void {
    if (this.length > 0) this.length--;
  }

  at(index: number): number {
    return this.buf[index]!;
  }

  finish(): Uint32Array {
    return this.buf.slice(0, this.length);
  }
}
