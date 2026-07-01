/**
 * polished-settings-list.ts — styled `/agents` settings/select list.
 *
 * Mirrors pi's SettingsList behavior for row layout and value cycling, then adds
 * extension-specific chrome: accent borders, a title block, fixed-height selected
 * description viewport, and left/right description scrolling.
 */

import type { SettingItem, SettingsListTheme } from "@earendil-works/pi-tui";
import { type Component, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Theme } from "./agent-widget.js";

const DESCRIPTION_ROWS = 3;
const DESCRIPTION_INSET = 4;
const DESCRIPTION_INDENT = "  ";
const MAX_LABEL_WIDTH = 30;
const ROW_SEPARATOR = "  ";

export type PolishedSettingsListOptions = {
  title: string;
  items: SettingItem[];
  maxVisible: number;
  theme: Theme;
  listTheme: SettingsListTheme;
  legend?: string;
  activationHint: string;
  onChange?: (id: string, newValue: string) => void;
  /** Return true to consume activation without cycling item values. */
  onActivate?: (id: string, item: SettingItem) => boolean | undefined;
  onCancel: () => void;
};

function padToWidth(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function fitLine(text: string, width: number): string {
  return truncateToWidth(padToWidth(text, width), width);
}

function renderBorder(theme: Theme, width: number): string {
  return theme.fg("accent", "─".repeat(Math.max(1, width)));
}

function addEllipsis(text: string, width: number): string {
  if (width <= 0) return "";
  if (width === 1) return "…";
  return truncateToWidth(text, width - 1, "") + "…";
}

export class PolishedSettingsList implements Component {
  private selectedIndex = 0;
  private descriptionOffset = 0;
  private lastMaxDescriptionOffset = 0;

  constructor(private opts: PolishedSettingsListOptions) {}

  invalidate(): void {}

  render(width: number): string[] {
    if (width <= 0) return [];
    this.clampSelection();

    const lines: string[] = [];
    lines.push(renderBorder(this.opts.theme, width));
    lines.push("");
    lines.push(this.renderTitle(width));
    if (this.opts.legend) lines.push(this.renderLegend(width));
    lines.push("");

    lines.push(...this.renderRows(width));
    lines.push("");
    lines.push(...this.renderDescription(width));
    lines.push("");
    lines.push(this.renderHint(width));
    lines.push(renderBorder(this.opts.theme, width));

    return lines.map(line => fitLine(line, width));
  }

  handleInput(data: string): void {
    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }
    if (matchesKey(data, "left")) {
      this.scrollDescription(-1);
      return;
    }
    if (matchesKey(data, "right")) {
      this.scrollDescription(1);
      return;
    }
    if (matchesKey(data, "enter") || data === " ") {
      this.activateSelected();
      return;
    }
    if (matchesKey(data, "escape")) {
      this.opts.onCancel();
    }
  }

  private renderTitle(width: number): string {
    const { theme, title } = this.opts;
    return truncateToWidth(` ${theme.fg("accent", theme.bold(title))}`, width);
  }

  private renderLegend(width: number): string {
    return truncateToWidth(` ${this.opts.listTheme.hint(this.opts.legend ?? "")}`, width);
  }

  private renderRows(width: number): string[] {
    const { items } = this.opts;
    if (items.length === 0) return [this.opts.listTheme.hint("  No items")];

    const visibleCount = Math.min(this.opts.maxVisible, items.length);
    const start = this.visibleStart(visibleCount);
    const end = Math.min(start + visibleCount, items.length);
    const labelWidth = Math.min(MAX_LABEL_WIDTH, Math.max(...items.map(item => visibleWidth(item.label))));
    const lines: string[] = [];

    for (let i = start; i < end; i++) {
      lines.push(this.renderRow(items[i], i === this.selectedIndex, labelWidth, width));
    }
    for (let i = end - start; i < visibleCount; i++) lines.push("");

    if (start > 0 || end < items.length) {
      lines.push(this.renderScrollIndicator(width));
    }

    return lines;
  }

  private renderRow(item: SettingItem, selected: boolean, labelWidth: number, width: number): string {
    const { listTheme } = this.opts;
    const prefix = selected ? listTheme.cursor : "  ";
    const label = padToWidth(item.label, labelWidth);
    const usedWidth = visibleWidth(prefix) + labelWidth + visibleWidth(ROW_SEPARATOR);
    const valueWidth = Math.max(0, width - usedWidth - 2);
    const value = truncateToWidth(item.currentValue, valueWidth, "");

    return truncateToWidth(
      prefix + listTheme.label(label, selected) + ROW_SEPARATOR + listTheme.value(value, selected),
      width,
    );
  }

  private renderScrollIndicator(width: number): string {
    const text = `  (${this.selectedIndex + 1}/${this.opts.items.length})`;
    return this.opts.listTheme.hint(truncateToWidth(text, width - 2, ""));
  }

  private renderDescription(width: number): string[] {
    const item = this.opts.items[this.selectedIndex];
    const descriptionWidth = Math.max(1, width - DESCRIPTION_INSET);
    const wrapped = item?.description ? wrapTextWithAnsi(item.description, descriptionWidth) : [];

    this.lastMaxDescriptionOffset = Math.max(0, wrapped.length - DESCRIPTION_ROWS);
    this.descriptionOffset = Math.min(this.descriptionOffset, this.lastMaxDescriptionOffset);

    const canScrollDown = this.descriptionOffset < this.lastMaxDescriptionOffset;
    const visible = wrapped.slice(this.descriptionOffset, this.descriptionOffset + DESCRIPTION_ROWS);
    const lines: string[] = [];

    for (let i = 0; i < DESCRIPTION_ROWS; i++) {
      const text = visible[i] ?? "";
      const visibleText = canScrollDown && i === DESCRIPTION_ROWS - 1
        ? addEllipsis(text, descriptionWidth)
        : text;
      lines.push(this.opts.listTheme.description(truncateToWidth(DESCRIPTION_INDENT + visibleText, width)));
    }

    return lines;
  }

  private renderHint(width: number): string {
    const text = `  ↑↓ select · ←/→ description · ${this.opts.activationHint} · Esc back`;
    return truncateToWidth(this.opts.listTheme.hint(text), width);
  }

  private visibleStart(visibleCount: number): number {
    return Math.max(
      0,
      Math.min(this.selectedIndex - Math.floor(visibleCount / 2), this.opts.items.length - visibleCount),
    );
  }

  private scrollDescription(delta: number): void {
    this.descriptionOffset = Math.max(
      0,
      Math.min(this.lastMaxDescriptionOffset, this.descriptionOffset + delta),
    );
  }

  private moveSelection(delta: number): void {
    const count = this.opts.items.length;
    if (count === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.descriptionOffset = 0;
  }

  private activateSelected(): void {
    const item = this.opts.items[this.selectedIndex];
    if (!item) return;
    if (this.opts.onActivate?.(item.id, item)) return;

    if (!item.values || item.values.length === 0) return;
    const currentIndex = item.values.indexOf(item.currentValue);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % item.values.length : 0;
    const newValue = item.values[nextIndex];
    item.currentValue = newValue;
    this.opts.onChange?.(item.id, newValue);
  }

  private clampSelection(): void {
    const max = this.opts.items.length - 1;
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, max));
  }
}
