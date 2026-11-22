/*
# Tighten WATSAN customer table privileges

1. Modified Tables
- `service_accounts`: removes inherited anonymous and broad authenticated table privileges, then grants only customer account reads and the two fields needed to add an account.
- `payments`: removes inherited anonymous and broad authenticated table privileges, then grants authenticated read-only access.
- `support_requests`: removes inherited anonymous and broad authenticated table privileges, then grants authenticated read access and insert access only to request fields.

2. Security
- Anonymous users cannot reach any customer table through the Data API.
- Customers cannot directly update balances, payment audit fields, service status, ownership fields, or support status.
- Payment creation remains available only through the ownership-checked server-side payment function.

3. Important Notes
- Existing row-level policies remain in place and continue to restrict rows to the signed-in customer.
- This change only narrows privileges and does not remove customer data.
*/

REVOKE ALL ON TABLE public.service_accounts FROM anon, authenticated;
GRANT SELECT ON TABLE public.service_accounts TO authenticated;
GRANT INSERT (account_number, service_address) ON TABLE public.service_accounts TO authenticated;

REVOKE ALL ON TABLE public.payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;

REVOKE ALL ON TABLE public.support_requests FROM anon, authenticated;
GRANT SELECT ON TABLE public.support_requests TO authenticated;
GRANT INSERT (service_account_id, request_type, description) ON TABLE public.support_requests TO authenticated;
