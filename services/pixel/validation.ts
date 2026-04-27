import { BOARD_SIZE } from "./constants";
import { PIXEL_PALETTE, type PixelColor } from "../../types/pixel";

export type ValidationErrorCode = "VALIDATION_COORDINATE" | "VALIDATION_COLOR";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ValidationErrorCode; message: string };

export function validateCoordinates(
  x: unknown,
  y: unknown,
): ValidationResult<{ x: number; y: number }> {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return {
      ok: false,
      code: "VALIDATION_COORDINATE",
      message: "Coordinates must be integers.",
    };
  }

  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
    return {
      ok: false,
      code: "VALIDATION_COORDINATE",
      message: `Coordinates must be between 0 and ${BOARD_SIZE - 1}.`,
    };
  }

  return {
    ok: true,
    value: { x, y },
  };
}

export function validateColor(color: unknown): ValidationResult<PixelColor> {
  if (typeof color !== "string") {
    return {
      ok: false,
      code: "VALIDATION_COLOR",
      message: "Color must be a string.",
    };
  }

  if (!PIXEL_PALETTE.includes(color as PixelColor)) {
    return {
      ok: false,
      code: "VALIDATION_COLOR",
      message: "Color is not supported.",
    };
  }

  return {
    ok: true,
    value: color,
  };
}
