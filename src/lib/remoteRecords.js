// Read every page before replacing local data; a failed page must never look
// like a successful partial snapshot. A growing revision history can exceed
// PostgREST's default per-request row limit.
export async function fetchAllRemoteRecords(client, userId, pageSize = 500) {
  const rows = new Map();
  let offset = 0;
  while (true) {
    const { data, error, count } = await client.from("kaizen_records")
      .select("collection,id,data,created_at,updated_at,deleted_at,version", { count: "exact" })
      .eq("user_id", userId)
      .order("collection", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Risposta sincronizzazione non valida.");
    if (!data.length) return [...rows.values()];
    for (const row of data) rows.set(`${row.collection}:${row.id}`, row);
    offset += data.length;
    // Do not request an offset equal to the total: PostgREST may return 416
    // instead of an empty page. Using count also supports smaller server caps.
    if (Number.isInteger(count) && offset >= count) return [...rows.values()];
  }
}
