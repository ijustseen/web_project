export function createBoardState(size: number, defaultColor: string): string[] {
  return Array.from({ length: size * size }, () => defaultColor);
}

export function getCellIndex(x: number, y: number, size: number): number {
  return y * size + x;
}

export function isPlaceActionDisabled(
  cooldownRemaining: number,
  hasSelectedCell: boolean,
  isPending: boolean,
): boolean {
  if (cooldownRemaining > 0) {
    return true;
  }

  if (!hasSelectedCell) {
    return true;
  }

  return isPending;
}
