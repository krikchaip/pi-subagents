import { type Component, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Text component for tool renderers. Unlike TUI Text, it does not pad lines. */
export class ToolResultText implements Component {
  private cachedText: string | undefined;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(private text = "") {}

  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    this.invalidate();
  }

  invalidate(): void {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) {
      return this.cachedLines;
    }

    if (!this.text || this.text.trim() === "") {
      this.cachedText = this.text;
      this.cachedWidth = width;
      this.cachedLines = [];
      return this.cachedLines;
    }

    const contentWidth = Math.max(1, Math.floor(Number.isFinite(width) ? width : 1));
    const lines = wrapTextWithAnsi(this.text.replace(/\t/g, "   "), contentWidth)
      .map((line: string) => trimAnsiRight(line));

    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

function trimAnsiRight(text: string): string {
  let trimmed = text;
  while (true) {
    const next = trimmed.replace(/[ \t]+((?:\x1b\[[0-9;]*m)*)$/, "$1");
    if (next === trimmed) return trimmed;
    trimmed = next;
  }
}

export function rendersWithoutRightPadding(component: Component, width: number): boolean {
  return component.render(width).every((line: string) => visibleWidth(line) < width || !/[ \t]+(?:\x1b\[[0-9;]*m)*$/.test(line));
}
