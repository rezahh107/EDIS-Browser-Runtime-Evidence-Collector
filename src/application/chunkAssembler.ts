export class ChunkAssembler {
  readonly #total: number;
  readonly #chunks = new Map<number, string>();

  constructor(total: number) {
    if (!Number.isInteger(total) || total <= 0 || total > 10_000)
      throw new Error("Invalid chunk total.");
    this.#total = total;
  }

  add(index: number, data: string): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#total)
      throw new Error("Invalid chunk index.");
    if (data.length > 524_288) throw new Error("Chunk exceeds the message limit.");
    const existing = this.#chunks.get(index);
    if (existing !== undefined && existing !== data)
      throw new Error("Conflicting duplicate chunk.");
    this.#chunks.set(index, data);
  }

  get complete(): boolean {
    return this.#chunks.size === this.#total;
  }

  assemble(): string {
    if (!this.complete) throw new Error("Chunks are incomplete.");
    return Array.from({ length: this.#total }, (_, index) => this.#chunks.get(index) ?? "").join(
      "",
    );
  }
}
