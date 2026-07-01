import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export interface TableColumn<Row> {
  /** Stable key, also used to read `row[key]` when `cell` is omitted. */
  key: keyof Row & string;
  /** Column header label. */
  header: ReactNode;
  /** Custom cell renderer. */
  cell?: (row: Row, index: number) => ReactNode;
  /** Horizontal alignment. */
  align?: "left" | "center" | "right";
  /** Extra classes applied to header + cells of this column. */
  className?: string;
  /** Hide on small screens (collapses to `hidden sm:table-cell`). */
  hideOnMobile?: boolean;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** Unique key per row. Defaults to the array index. */
  rowKey?: (row: Row, index: number) => string | number;
  /** Show shimmering skeleton rows. */
  loading?: boolean;
  /** Number of skeleton rows to show while loading. */
  loadingRows?: number;
  /** Rendered when `rows` is empty and not loading. */
  empty?: ReactNode;
  /** Per-row click handler (makes rows interactive). */
  onRowClick?: (row: Row, index: number) => void;
  className?: string;
}

const alignClass: Record<NonNullable<TableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * Responsive glass data table with header, body, and built-in loading
 * (shimmer) and empty states. Generic over the row type for type-safe columns.
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingRows = 5,
  empty,
  onRowClick,
  className,
}: TableProps<Row>): JSX.Element {
  const showEmpty = !loading && rows.length === 0;

  return (
    <div
      className={cn(
        "glass rounded-[1.75rem] overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline/80">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3.5 font-semibold text-[11px] uppercase tracking-wider text-muted-soft whitespace-nowrap",
                    alignClass[col.align ?? "left"],
                    col.hideOnMobile && "hidden sm:table-cell",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: loadingRows }).map((_, r) => (
                <tr key={`sk-${r}`} className="border-b border-hairline/50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3.5",
                        col.hideOnMobile && "hidden sm:table-cell",
                      )}
                    >
                      <Skeleton height={12} width={`${60 + ((r + 1) * 13) % 35}%`} />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading &&
              rows.map((row, index) => (
                <tr
                  key={rowKey ? rowKey(row, index) : index}
                  onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  className={cn(
                    "border-b border-hairline/50 last:border-0 transition-colors",
                    onRowClick &&
                      "cursor-pointer hover:bg-white/50 focus-within:bg-white/50 dark:hover:bg-white/5 dark:focus-within:bg-white/5",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3.5 text-ink-soft align-middle",
                        alignClass[col.align ?? "left"],
                        col.hideOnMobile && "hidden sm:table-cell",
                        col.className,
                      )}
                    >
                      {col.cell
                        ? col.cell(row, index)
                        : (row[col.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showEmpty &&
        (empty ?? (
          <EmptyState
            title="Aucune donnée"
            description="Il n'y a rien à afficher pour le moment."
          />
        ))}
    </div>
  );
}
