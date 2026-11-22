/*
# Create WATSAN customer backend

1. New Tables
- `service_accounts`
  - `id` identifies a WATSAN service account.
  - `user_id` links the account to the signed-in customer.
  - `account_number` is the customer-facing service account number.
  - `service_address` stores the service location.
  - `balance` stores the current amount due and is not client-writable.
  - `due_date` stores the current bill due date.
  - `status` stores the service status and is not client-writable.
- `payments`
  - `id` identifies a payment.
  - `user_id` links the payment to the signed-in customer.
  - `service_account_id` identifies the paid account.
  - `amount`, `method`, `status`, and `receipt_number` record the transaction.
- `support_requests`
  - `id` identifies a support request.
  - `user_id` links the request to the signed-in customer.
  - `service_account_id`, `request_type`, `description`, and `status` record the issue.

2. Security
- Row level security is enabled on every new table.
- Authenticated customers can only read rows belonging to their own user id.
- Customers can add service accounts and support requests only for themselves.
- Payment creation is handled by a server-side function that checks account ownership and calculates the amount from the database balance.
- Anonymous users cannot access customer records or call the payment function.

3. Important Notes
- The frontend must use Supabase email/password authentication before reading customer data.
- The payment function atomically records the payment and clears the paid account balance.
- Customer-controlled columns are explicitly separated from balance, status, and payment audit fields.
*/

CREATE TABLE IF NOT EXISTS public.service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number text NOT NULL UNIQUE,
  service_address text NOT NULL,
  balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  due_date date NOT NULL DEFAULT (CURRENT_DATE + 15),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  service_account_id uuid NOT NULL REFERENCES public.service_accounts(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('mobile_money', 'card')),
  status text NOT NULL DEFAULT 'successful' CHECK (status IN ('successful', 'failed')),
  receipt_number text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  service_account_id uuid REFERENCES public.service_accounts(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('water_issue', 'billing', 'statement', 'other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.service_accounts TO authenticated;
GRANT INSERT (account_number, service_address) ON public.service_accounts TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT, INSERT (service_account_id, request_type, description) ON public.support_requests TO authenticated;

DROP POLICY IF EXISTS "customers_select_own_service_accounts" ON public.service_accounts;
CREATE POLICY "customers_select_own_service_accounts" ON public.service_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customers_insert_own_service_accounts" ON public.service_accounts;
CREATE POLICY "customers_insert_own_service_accounts" ON public.service_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "customers_select_own_payments" ON public.payments;
CREATE POLICY "customers_select_own_payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "customers_select_own_support_requests" ON public.support_requests;
CREATE POLICY "customers_select_own_support_requests" ON public.support_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "customers_insert_own_support_requests" ON public.support_requests;
CREATE POLICY "customers_insert_own_support_requests" ON public.support_requests FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (service_account_id IS NULL OR EXISTS (
    SELECT 1 FROM public.service_accounts
    WHERE service_accounts.id = support_requests.service_account_id
      AND service_accounts.user_id = auth.uid()
  ))
);

CREATE OR REPLACE FUNCTION public.pay_service_account(p_service_account_id uuid, p_method text)
RETURNS TABLE (payment_id uuid, receipt_number text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric(12,2);
  v_payment_id uuid;
  v_receipt_number text;
BEGIN
  IF p_method NOT IN ('mobile_money', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  SELECT balance INTO v_balance
  FROM public.service_accounts
  WHERE id = p_service_account_id
    AND user_id = auth.uid()
    AND status = 'active'
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance <= 0 THEN
    RAISE EXCEPTION 'No payable balance found';
  END IF;

  v_receipt_number := 'WTS-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);

  INSERT INTO public.payments (user_id, service_account_id, amount, method, status, receipt_number)
  VALUES (auth.uid(), p_service_account_id, v_balance, p_method, 'successful', v_receipt_number)
  RETURNING id INTO v_payment_id;

  UPDATE public.service_accounts
  SET balance = 0, due_date = CURRENT_DATE + 30
  WHERE id = p_service_account_id AND user_id = auth.uid();

  RETURN QUERY SELECT v_payment_id, v_receipt_number, v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_service_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_service_account(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS service_accounts_user_id_idx ON public.service_accounts(user_id);
CREATE INDEX IF NOT EXISTS payments_user_id_created_at_idx ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_user_id_created_at_idx ON public.support_requests(user_id, created_at DESC);
