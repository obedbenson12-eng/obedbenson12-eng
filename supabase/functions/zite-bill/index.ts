// Read-only Zite connection test + live data proxy.
// Fetches database/table schemas and customer data from Zite. Read-only — never
// inserts, updates, or deletes Zite records. Results are stored in the
// zite_test_results table so they can be inspected from SQL.

import { createClient } from 'npm:@supabase/supabase-js@2';

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
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'test';

  if (action === 'test') {
    return await runConnectionTest();
  }

  if (action === 'customer') {
    const accountNumber = (url.searchParams.get('account_number') ?? '').trim();
    if (!accountNumber) return json({ error: 'account_number is required' }, 400);
    return await fetchCustomerData(accountNumber);
  }

  return json({ error: 'Unknown action' }, 400);
});

// --- Connection test: verifies auth + reads schema of all 3 databases ---

async function runConnectionTest() {
  if (!ZITE_KEY) {
    return json({ error: 'ZITE_API_KEY secret is not configured' }, 500);
  }

  const results: Array<DbTestResult> = [];
  for (const db of DATABASES) {
    results.push(await testDatabase(db));
  }

  // Store results in Supabase so they can be read from SQL
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  await supabase.from('zite_test_results').insert({ payload: { authenticated: results.every((r) => r.accessible), databases: results } });

  const allOk = results.every((r) => r.accessible);
  return json({ authenticated: allOk, databases: results }, allOk ? 200 : 502);
}

type DbTestResult = {
  label: string;
  databaseId: string;
  tableId: string;
  accessible: boolean;
  databaseName: string | null;
  tableName: string | null;
  fields: Array<{ id: string; name: string; type: string }> | null;
  recordCount: number | null;
  sampleFields: Record<string, unknown> | null;
  error: string | null;
};

async function testDatabase(db: { label: string; id: string; tableId: string }): Promise<DbTestResult> {
  const base: DbTestResult = {
    label: db.label, databaseId: db.id, tableId: db.tableId,
    accessible: false, databaseName: null, tableName: null,
    fields: null, recordCount: null, sampleFields: null, error: null,
  };

  try {
    const dbDetail = await ziteFetch(`/bases/${db.id}`) as {
      name?: string;
      tables?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }>;
    };

    base.databaseName = dbDetail.name ?? null;
    const table = dbDetail.tables?.find((t) => t.id === db.tableId);

    if (!table) {
      base.error = `Table ${db.tableId} not found in database. Available: ${(dbDetail.tables ?? []).map((t) => `${t.id}(${t.name})`).join(', ') || 'none'}`;
      return base;
    }

    base.tableName = table.name;
    base.fields = (table.fields ?? []).map((f) => ({ id: f.id, name: f.name, type: f.type }));

    const sampleRes = await ziteFetch(
      `/bases/${db.id}/tables/${db.tableId}/records/list`,
      { method: 'POST', body: JSON.stringify({ limit: 1 }) },
    ) as { records?: Array<{ id: string; fields: Record<string, unknown> }>; total?: number };

    base.recordCount = sampleRes.total ?? sampleRes.records?.length ?? 0;
    base.sampleFields = sampleRes.records?.[0]?.fields ?? null;
    base.accessible = true;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
  }

  return base;
}

// --- Live customer data: fetches customer + readings + payments from Zite ---

type CustomerData = {
  customer: Record<string, unknown> | null;
  water_readings: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  error: string | null;
};

async function fetchCustomerData(accountNumber: string): Promise<Response> {
  if (!ZITE_KEY) {
    return json({ error: 'ZITE_API_KEY secret is not configured' }, 500);
  }

  const result: CustomerData = { customer: null, water_readings: [], payments: [], error: null };

  try {
    // 1. Find the customer record by account number
    const customersDb = DATABASES[0];
    const dbDetail = await ziteFetch(`/bases/${customersDb.id}`) as {
      tables?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }>;
    };
    const table = dbDetail.tables?.find((t) => t.id === customersDb.tableId);
    const accountField = table?.fields?.find((f) =>
      f.name.toLowerCase().includes('account') || f.name.toLowerCase().includes('customer')
    );

    if (!accountField) {
      result.error = 'Could not find an account number field in the Customers table';
      return json(result, 400);
    }

    const filteredRes = await ziteFetch(
      `/bases/${customersDb.id}/tables/${customersDb.tableId}/records/list`,
      { method: 'POST', body: JSON.stringify({ limit: 1, filter: { field: accountField.name, equals: accountNumber, mode: 'insensitive' } }) },
    ) as { records?: Array<{ id: string; fields: Record<string, unknown> }>; total?: number };

    if (!filteredRes.records?.[0]) {
      result.error = 'No customer found for that account number';
      return json(result, 404);
    }

    result.customer = filteredRes.records[0].fields;

    // 2. Fetch water readings — find the link field
    const readingsDb = DATABASES[1];
    const readingsDetail = await ziteFetch(`/bases/${readingsDb.id}`) as {
      tables?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }>;
    };
    const readingsTable = readingsDetail.tables?.find((t) => t.id === readingsDb.tableId);
    const readingsLinkField = readingsTable?.fields?.find((f) =>
      f.name.toLowerCase().includes('account') || f.name.toLowerCase().includes('customer') || f.name.toLowerCase().includes('link')
    );

    if (readingsLinkField) {
      const readingsRes = await ziteFetch(
        `/bases/${readingsDb.id}/tables/${readingsDb.tableId}/records/list`,
        { method: 'POST', body: JSON.stringify({ limit: 50, filter: { field: readingsLinkField.name, equals: accountNumber, mode: 'insensitive' } }) },
      ) as { records?: Array<{ id: string; fields: Record<string, unknown> }>; total?: number };
      result.water_readings = (readingsRes.records ?? []).map((r) => r.fields);
    }

    // 3. Fetch payments — find the link field
    const paymentsDb = DATABASES[2];
    const paymentsDetail = await ziteFetch(`/bases/${paymentsDb.id}`) as {
      tables?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }> }>;
    };
    const paymentsTable = paymentsDetail.tables?.find((t) => t.id === paymentsDb.tableId);
    const paymentsLinkField = paymentsTable?.fields?.find((f) =>
      f.name.toLowerCase().includes('account') || f.name.toLowerCase().includes('customer') || f.name.toLowerCase().includes('link')
    );

    if (paymentsLinkField) {
      const paymentsRes = await ziteFetch(
        `/bases/${paymentsDb.id}/tables/${paymentsDb.tableId}/records/list`,
        { method: 'POST', body: JSON.stringify({ limit: 50, filter: { field: paymentsLinkField.name, equals: accountNumber, mode: 'insensitive' } }) },
      ) as { records?: Array<{ id: string; fields: Record<string, unknown> }>; total?: number };
      result.payments = (paymentsRes.records ?? []).map((r) => r.fields);
    }

    return json(result);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return json(result, 500);
  }
}

// --- Helpers ---

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
