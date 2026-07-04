import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Filter,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ParceiroTableColumn<T> = {
  id: string;
  header: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type ParceiroTableFilter<T> = {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

type ParceiroDataTableProps<T> = {
  columns: ParceiroTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchMatch?: (row: T, query: string) => boolean;
  filters?: ParceiroTableFilter<T>[];
  pageSize?: number;
  emptyMessage?: string;
  isLoading?: boolean;
};

export function ParceiroDataTable<T>({
  columns,
  data,
  rowKey,
  searchPlaceholder = "Pesquisa rápida…",
  searchMatch,
  filters = [],
  pageSize = 10,
  emptyMessage = "Nenhum registro encontrado.",
  isLoading,
}: ParceiroDataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = [...data];
    const q = query.trim().toLowerCase();
    if (q && searchMatch) {
      rows = rows.filter((row) => searchMatch(row, q));
    }
    for (const filter of filters) {
      const val = filterValues[filter.id];
      if (val && val !== "all") {
        rows = rows.filter((row) => filter.match(row, val));
      }
    }
    if (sortId) {
      const col = columns.find((c) => c.id === sortId);
      if (col?.sortValue) {
        rows.sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return rows;
  }, [data, query, searchMatch, filters, filterValues, sortId, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(id: string) {
    if (sortId === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortId(id);
      setSortDir("asc");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E8EAED] bg-white shadow-[0_2px_8px_rgba(17,17,17,0.06)]">
      <div className="flex flex-col gap-3 border-b border-[#F0F1F3] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-[#E5E7EB] py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
        {filters.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm font-medium text-[#374151] hover:bg-[#F9FAFB]"
            >
              <Filter className="size-4" />
              Filtros
              <ChevronDown className={cn("size-4 transition", filtersOpen && "rotate-180")} />
            </button>
            {filtersOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[#E8EAED] bg-white p-3 shadow-lg">
                {filters.map((f) => (
                  <label key={f.id} className="mb-2 block last:mb-0">
                    <span className="mb-1 block text-xs font-semibold text-[#6B7280]">{f.label}</span>
                    <select
                      className="w-full rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-sm"
                      value={filterValues[f.id] ?? "all"}
                      onChange={(e) => {
                        setFilterValues((prev) => ({ ...prev, [f.id]: e.target.value }));
                        setPage(1);
                      }}
                    >
                      <option value="all">Todos</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-[#374151] text-left text-xs font-semibold uppercase tracking-wide text-white">
              {columns.map((col) => (
                <th key={col.id} className={cn("px-4 py-3", col.className)}>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className="inline-flex items-center gap-1 hover:text-white/90"
                    >
                      {col.header}
                      {sortId === col.id ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[#6B7280]">
                  Carregando…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[#6B7280]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    "border-t border-[#F0F1F3]",
                    i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white",
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.id} className={cn("px-4 py-3 align-middle", col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize ? (
        <ParceiroTablePagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          onPage={setPage}
        />
      ) : null}
    </div>
  );
}

function ParceiroTablePagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Array.from({ length: Math.min(totalPages, 6) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-[#F0F1F3] px-4 py-3 sm:flex-row">
      <p className="text-xs text-[#6B7280]">
        {total} registro{total !== 1 ? "s" : ""}
      </p>
      <div className="flex items-center gap-1">
        <PaginationBtn disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Anterior">
          <ChevronLeft className="size-4" />
        </PaginationBtn>
        {pages.map((p) => (
          <PaginationBtn
            key={p}
            active={p === page}
            onClick={() => onPage(p)}
            aria-label={`Página ${p}`}
          >
            {p}
          </PaginationBtn>
        ))}
        <PaginationBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Próximo">
          <ChevronRight className="size-4" />
        </PaginationBtn>
      </div>
    </div>
  );
}

function PaginationBtn({
  children,
  active,
  disabled,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid min-w-8 place-items-center rounded-md px-2 py-1 text-sm transition",
        active && "bg-primary text-white",
        !active && !disabled && "text-[#374151] hover:bg-[#F3F4F6]",
        disabled && "cursor-not-allowed opacity-40",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
