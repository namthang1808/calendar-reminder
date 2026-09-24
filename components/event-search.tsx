export function EventSearch({ defaultQuery, month }: { defaultQuery: string; month: string }) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface/60 p-4"
    >
      <input type="hidden" name="month" value={month} />
      <label className="flex flex-1 min-w-[10rem] flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Search this month</span>
        <input
          type="text"
          name="q"
          defaultValue={defaultQuery}
          maxLength={100}
          placeholder="Title or description"
          className="rounded-[calc(var(--radius-card)-0.25rem)] border border-border bg-surface px-3.5 py-2 text-foreground transition-colors placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </label>
      <button
        type="submit"
        className="rounded-[calc(var(--radius-card)-0.25rem)] border border-border-strong px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
      >
        Search
      </button>
    </form>
  );
}
