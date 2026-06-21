/**
 * Shared geometry helpers for the routing workers.
 *
 * Extracted verbatim from route-calculation.worker.ts so both the A* depth
 * router and the weather-routing optimizer can share them. No behaviour change.
 */

export const DEG_TO_RAD = Math.PI / 180;
export const DIAGONAL_MULT = Math.SQRT2;

/**
 * Distance between two points in nautical miles (Haversine formula).
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fast approximate distance (nautical miles) for the A* heuristic / hot loops.
 * Equirectangular approximation — cheap and good enough at routing scales.
 */
export function fastDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * 60;
  const dLon = (lon2 - lon1) * 60 * Math.cos(((lat1 + lat2) / 2) * DEG_TO_RAD);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Integer-based grid key for fast Map operations.
 */
export function getIntKey(lat: number, lon: number, invGridSize: number): number {
  const latGrid = Math.round(lat * invGridSize) | 0;
  const lonGrid = Math.round(lon * invGridSize) | 0;
  return (latGrid + 0x7fffffff) * 0x100000 + (lonGrid + 0x7fffffff);
}

/**
 * Binary Min-Heap Priority Queue for O(log n) insert/extract operations.
 */
export class PriorityQueue<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const result = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return result;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break;
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChild = (index << 1) + 1;
      const rightChild = leftChild + 1;
      let smallest = index;

      if (leftChild < length && this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }
      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}
