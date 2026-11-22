// Read-only Zite connection test. Fetches database metadata and table schemas
// for all three WATSAN databases. No inserts, updates, or deletes — ever.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apikey, X-Client-Info',
};

const ZITE_BASE = 'https://tables.zite.com/api/v1';
const ZITE_KEY = Deno.env.get('ZITE_API_KEY') ?? '';

const DATABASES = [
  { label: 'CUSTOMERS', id: 'thZZWHkgM6C', tableId: 'vhP6LhHKbH4' },
  { label: 'WATER_READINGS', id: 'tcnjc3ukuLz', tableId: 'vb4zowQCMK4' },
  { label: 'PAYMENTS', id: 'tbywv2Sp1Gk', tableId: 'vjzk8ujCxDd' },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed — this endpoint is read-only' }, 405);
  }

  if (!ZITE_KEY) {
    return json({ error: 'ZITE_API_KEY secret is not configured' }, 500);
  }

  const results: Array<DbTestResult> = [];
  for (const db of DATABASES) {
    results.push(await testDatabase(db));
  }

  const allOk = results.every((r) => r.accessible);
  return json({
    authenticated: allOk,
    api_base: ZITE_BASE,
    databases: results,
  }, allOk ? 200 : 502);
});

type DbTestResult = {
  label: string;
  databaseId: string;
  tableId: string;
  accessible: boolean;
  databaseName: string | null;
  tableName: string | null;
  fields: Array<{ id: string; name: string; type: string }> | null;
  recordCount: number | null;
  sampleRecord: Record<string, unknown> | null;
  error: string | null;
};

async function testDatabase(db: { label: string; id: string; tableId: string }): Promise<DbTestResult> {
  const base: DbTestResult = {
    label: db.label,
    databaseId: db.id,
    tableId: db.tableId,
    accessible: false,
    databaseName: null,
    tableName: null,
    fields: null,
    recordCount: null,
    sampleRecord: null,
    error: null,
  };

  try {
    // 1. Fetch database metadata (includes tables and their fields)
    const dbDetail = await ziteFetch(`/bases/${db.id}`) as {
      name?: string;
      tables?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }>;
    };

    base.databaseName = dbDetail.name ?? null;
    const table = dbDetail.tables?.find((t) => t.id === db.tableId);

    if (!table) {
      base.error = `Table ${db.tableId} not found in database. Tables present: ${(dbDetail.tables ?? []).map((t) => t.id).join(', ') || 'none'}`;
      return base;
    }

    base.tableName = table.name;
    base.fields = (table.fields ?? []).map((f) => ({ id: f.id, name: f.name, type: f.type }));

    // 2. Fetch a single sample record (read-only) to confirm record access
    //    and see the actual data shape. limit=1, no filters, no writes.
    const sampleRes = await ziteFetch(
      `/bases/${db.id}/tables/${db.tableId}/records/list`,
      { method: 'POST', body: JSON.stringify({ limit: 1 }) },
    ) as { records?: Array<{ id: string; fields: Record<string, unknown> }>; total?: number };

    base.recordCount = sampleRes.total ?? sampleRes.records?.length ?? 0;
    base.sampleRecord = sampleRes.records?.[0]
      ? { id: sampleRes.records[0].id, fields: sampleRes.records[0].fields }
      : null;

    base.accessible = true;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
  }

  return base;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function ziteFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${ZITE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ZITE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zite API ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json();
}
