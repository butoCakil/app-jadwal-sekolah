/** Riwayat undo/redo berbasis potret JSON. Sederhana dan tahan salah: tiap potret berdiri sendiri. */
export class Riwayat<T> {
  private mundur: string[] = [];
  private maju: string[] = [];
  constructor(private batas = 100) {}

  /** Dipanggil SEBELUM perubahan, dengan kondisi sekarang. Perubahan baru menghapus jalur redo. */
  catat(sekarang: T): void {
    this.mundur.push(JSON.stringify(sekarang));
    if (this.mundur.length > this.batas) this.mundur.shift();
    this.maju = [];
  }

  bisaUndo(): boolean {
    return this.mundur.length > 0;
  }
  bisaRedo(): boolean {
    return this.maju.length > 0;
  }

  undo(sekarang: T): T | null {
    const s = this.mundur.pop();
    if (s === undefined) return null;
    this.maju.push(JSON.stringify(sekarang));
    return JSON.parse(s) as T;
  }

  redo(sekarang: T): T | null {
    const s = this.maju.pop();
    if (s === undefined) return null;
    this.mundur.push(JSON.stringify(sekarang));
    return JSON.parse(s) as T;
  }

  kosongkan(): void {
    this.mundur = [];
    this.maju = [];
  }
}
