"use client";

import { useId, type KeyboardEvent } from "react";
import { LIMA_DISTRICTS, LIMA_GRID_COLS, LIMA_GRID_ROWS } from "@/domains/orders/lima-districts";
import styles from "./district-map.module.css";

const TILE_W = 44;
const TILE_H = 40;
const GAP = 2;
const STEP_X = TILE_W + GAP;
const STEP_Y = TILE_H + GAP;

export type DistrictTileState = {
  /** Shalom agencies in the district (shown as a small number). */
  count?: number;
  /** Motorizado access is restricted here (red hatch + text, never colour alone). */
  restricted?: boolean;
  disabled?: boolean;
};

/**
 * Schematic SVG of Lima's districts (a tile grid, north up). Every tile is a
 * keyboard-operable toggle; the list or select next to it stays the accessible
 * primary control, the map is a faster way to the same choice.
 */
export function DistrictMap({
  label,
  selected,
  onSelect,
  tileState,
  describe,
}: {
  label: string;
  selected: string | null;
  onSelect: (district: string) => void;
  tileState: (district: string) => DistrictTileState;
  /** Spoken description of a tile, e.g. "San Isidro, 3 agencias". */
  describe: (district: string, state: DistrictTileState) => string;
}) {
  const hatchId = useId();
  const width = LIMA_GRID_COLS * STEP_X - GAP;
  const height = LIMA_GRID_ROWS * STEP_Y - GAP;

  function onKeyDown(event: KeyboardEvent<SVGGElement>, district: string, disabled: boolean) {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(district);
    }
  }

  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={label}
      data-district-map
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f4dedb" />
          <rect width="2.4" height="6" fill="#c2564d" opacity="0.55" />
        </pattern>
      </defs>
      {LIMA_DISTRICTS.map((district) => {
        const state = tileState(district.name);
        const isSelected = selected === district.name;
        const x = district.col * STEP_X;
        const y = district.row * STEP_Y;
        const lines = district.short.split("|");
        const cls = [
          styles.tile,
          isSelected ? styles.tileSelected : "",
          state.restricted ? styles.tileRestricted : "",
          state.disabled ? styles.tileDisabled : "",
          state.count ? styles.tileHas : "",
        ].filter(Boolean).join(" ");
        return (
          <g
            key={district.name}
            className={cls}
            role="button"
            tabIndex={state.disabled ? -1 : 0}
            aria-pressed={isSelected}
            aria-disabled={state.disabled || undefined}
            aria-label={describe(district.name, state)}
            data-district={district.name}
            onClick={() => (state.disabled ? undefined : onSelect(district.name))}
            onKeyDown={(event) => onKeyDown(event, district.name, Boolean(state.disabled))}
          >
            <title>{describe(district.name, state)}</title>
            <rect x={x} y={y} width={TILE_W} height={TILE_H} rx={5} className={styles.tileBase} />
            {state.restricted && !isSelected ? (
              <rect x={x} y={y} width={TILE_W} height={TILE_H} rx={5} fill={`url(#${hatchId})`} className={styles.tileHatch} />
            ) : null}
            <text className={styles.tileLabel} x={x + TILE_W / 2} y={y + TILE_H / 2 + (lines.length > 1 ? -2 : 3.5)} textAnchor="middle">
              {lines.map((line, index) => (
                <tspan key={line} x={x + TILE_W / 2} dy={index === 0 ? 0 : 10.5}>{line}</tspan>
              ))}
            </text>
            {state.count ? (
              <text className={styles.tileCount} x={x + TILE_W - 4} y={y + 9} textAnchor="end">{state.count}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
