const APP_ID = '6zxgdaf1kb';
const API_ROOT = `https://workflows.zite.com/public/${APP_ID}/api`;

async function callZite<T>(name: string, inputs: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_ROOT}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.message === 'string'
      ? body.message
      : typeof body.error === 'string' ? body.error : `WATSAN service returned ${response.status}`;
    throw new Error(message);
  }
  if (body.error && typeof body.error === 'string') throw new Error(body.error);
  return body as T;
}

export type PortalSession = {
  meterNumber: string;
  token: string;
  expiresAt: string;
  customer: { fullName: string; meterNumber: string };
};

export type PortalCustomer = {
  fullName: string;
  meterNumber: string;
  location?: string;
  phoneNumber?: string;
  status?: string;
  creditBalance?: number;
};

export type PortalReading = Record<string, unknown> & {
  id?: string;
  meterNumber?: string;
  readingMonth?: string;
  amountDue?: number;
  amountPaid?: number;
  billStatus?: string;
};

export type PortalPayment = Record<string, unknown> & {
  id?: string;
  amountPaid?: number;
  paymentMethod?: string;
  paymentDate?: string;
  paymentTimestamp?: string;
  receiptNumber?: string;
  status?: string;
};

export type PortalData = {
  customer: PortalCustomer;
  water_readings: PortalReading[];
  payments: PortalPayment[];
};

export async function sendCustomerOtp(input: { meterNumber: string }) {
  return callZite<{ success: boolean; message: string; maskedPhone?: string }>('sendCustomerOtp', input);
}

export async function verifyCustomerOtp(input: { meterNumber: string; code: string }) {
  return callZite<{ valid: boolean; message: string; sessionToken?: string; expiresAt?: string; customer?: PortalSession['customer'] }>('verifyCustomerOtp', input);
}

export async function getCustomerPortalData(input: { meterNumber: string; sessionToken: string }) {
  return callZite<PortalData>('getCustomerPortalData', input);
}

export async function logoutCustomerPortal(input: { meterNumber: string; sessionToken: string }) {
  return callZite<{ success: boolean }>('logoutCustomerPortal', input);
}

export async function initializeCustomerPayment(input: { meterNumber: string; sessionToken: string; amount: number }) {
  return callZite<{ success: boolean; authorizationUrl?: string; reference?: string; error?: string }>('initializeCustomerPayment', input);
}

export async function initializeDemoPayment(input: { meterNumber: string; amount: number }) {
  return callZite<{ success: boolean; authorizationUrl?: string; reference?: string; error?: string }>('initializeDemoPayment', input);
}

export async function verifyDemoPayment(input: { meterNumber: string; reference: string }) {
  return callZite<{ verified: boolean; status: string; amount?: number; receiptNumber?: string }>('verifyDemoPayment', input);
}

export async function verifyCustomerPayment(input: { meterNumber: string; sessionToken: string; reference: string }) {
  return callZite<{ verified: boolean; status: string; amount?: number; receiptNumber?: string; billBalance?: number }>('verifyCustomerPayment', input);
}
