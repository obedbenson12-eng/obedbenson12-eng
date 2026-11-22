/*
# Create bills table and bill-recording function

1. New Tables
- `bills`
  - `id` identifies a bill.
  - `service_account_id` links the bill to a WATSAN service account.
  - `billing_period` stores the month the bill covers (e.g. 2026-11-01).
  - `amount` is the billed amount in GHS, positive and not client-writable.
  - `due_date` is when payment is due.
  - `status` tracks whether the bill is pending or paid; not client-writable.
  - `created_at` records when the bill was created.

2. New Functions
- `record_bill(p_account_number text, p_amount numeric, p_billing_period date, p_due_date date)`
  - SECURITY DEFINER, callable only by the service role (edge function webhook).
  - Looks up the service account by account number.
  - Inserts a bills row and adds the amount to the account balance.
  - Idempotent per (service_account_id, billing_period): re-sending the same
    bill for the same period does not double-charge.
  - Returns the new balance so the webhook can echo it back.

3. Security
- `bills` is RLS-enabled; customers can SELECT only their own bills.
- Customers cannot insert, update, or delete bills.
- `record_bill` is revoked from PUBLIC and anon so only the service role
  (the edge function) can call it.

4. Important Notes
- This migration supports the staff-to-customer billing flow: staff record a
  bill on the Zite staff site, Zite sends it to the record-bill webhook, and
  the webhook calls this function. The customer sees the updated balance and
  bill on login.
- Existing service_accounts, payments, and support_requests tables are unchanged.
*/

CREATE TABLE IF NOT EXISTS public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_account_id uuid NOT NULL REFERENCES public.service_accounts(id) ON DELETE CASCADE,
  billing_period date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL DEFAULT (CURRENT_DATE + 15),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_account_id, billing_period)
);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bills TO authenticated;

DROP POLICY IF EXISTS "customers_select_own_bills" ON public.bills;
CREATE POLICY "customers_select_own_bills" ON public.bills
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.service_accounts
    WHERE service_accounts.id = bills.service_account_id
      AND service_accounts.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS bills_service_account_id_created_at_idx
  ON public.bills(service_account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_bill(
  p_account_number text,
  p_amount numeric,
  p_billing_period date DEFAULT NULL,
  p_due_date date DEFAULT NULL
)
RETURNS TABLE (out_service_account_id uuid, out_account_number text, out_new_balance numeric, out_bill_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_acc_no text;
  v_balance numeric(12,2);
  v_period date := COALESCE(p_billing_period, date_trunc('month', CURRENT_DATE)::date);
  v_due date := COALESCE(p_due_date, CURRENT_DATE + 15);
  v_bill_id uuid;
  v_existing_id uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Bill amount must be positive';
  END IF;

  SELECT sa.id, sa.account_number, sa.balance INTO v_id, v_acc_no, v_balance
  FROM public.service_accounts sa
  WHERE sa.account_number = p_account_number
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Service account not found: %', p_account_number;
  END IF;

  SELECT b.id INTO v_existing_id
  FROM public.bills b
  WHERE b.service_account_id = v_id AND b.billing_period = v_period;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, v_acc_no, v_balance, v_existing_id;
    RETURN;
  END IF;

  INSERT INTO public.bills (service_account_id, billing_period, amount, due_date, status)
  VALUES (v_id, v_period, p_amount, v_due, 'pending')
  RETURNING id INTO v_bill_id;

  UPDATE public.service_accounts
  SET balance = balance + p_amount, due_date = v_due
  WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_acc_no, v_balance + p_amount, v_bill_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_bill(text, numeric, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bill(text, numeric, date, date) TO service_role;
