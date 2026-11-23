import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Headphones,
  Home,
  Info,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Screen = 'home' | 'help' | 'statements' | 'account';
type Modal = 'signin' | 'register' | 'pay' | 'success' | 'addAccount' | null;
type ServiceAccount = { id: string; account_number: string; service_address: string; balance: number; due_date: string; status: string };
type Payment = { id: string; amount: number; method: string; status: string; receipt_number: string; created_at: string };
type Bill = { id: string; billing_period: string; amount: number; due_date: string; status: string };
type ZiteField = Record<string, unknown>;
type ZiteCustomerData = {
  customer: ZiteField | null;
  water_readings: ZiteField[];
  payments: ZiteField[];
  error: string | null;
};
type MenuItem = { label: string; icon: LucideIcon; screen?: Screen; action?: () => void };

type AuthForm = { name: string; email: string; password: string; accountNumber: string; address: string };

const logoPath = '/watsan-logo.png';
const initialAuthForm: AuthForm = { name: '', email: '', password: '', accountNumber: '', address: '' };

function WatsanMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-label="Tsrukpe Tota Water and Sanitation"><img src={logoPath} alt="Tsrukpe Tota Water and Sanitation logo" /><div><strong>TSRUKPE TOTA</strong><small>WATER &amp; SANITATION</small></div></div>;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');
  const [modal, setModal] = useState<Modal>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [toast, setToast] = useState('');
  const [account, setAccount] = useState<ServiceAccount | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [ziteData, setZiteData] = useState<ZiteCustomerData | null>(null);
  const [ziteSyncing, setZiteSyncing] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [appError, setAppError] = useState('');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setAuthLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      (async () => { if (nextSession) await loadCustomerData(nextSession.user.id); })();
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session) loadCustomerData(session.user.id);
  }, [session]);

  const loadCustomerData = async (userId: string) => {
    setDataLoading(true);
    setAppError('');
    const [accountResult, paymentsResult, billsResult] = await Promise.all([
      supabase.from('service_accounts').select('id, account_number, service_address, balance, due_date, status').eq('user_id', userId).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('payments').select('id, amount, method, status, receipt_number, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('bills').select('id, billing_period, amount, due_date, status').order('created_at', { ascending: false }).limit(12),
    ]);
    if (accountResult.error || paymentsResult.error) {
      console.error('customer data load failed', accountResult.error ?? paymentsResult.error);
      setAppError('We could not load your account right now. Please try again.');
    } else {
      setAccount(accountResult.data);
      setPayments(paymentsResult.data ?? []);
      setBills(billsResult.data ?? []);
      if (accountResult.data?.account_number) {
        syncZiteData(accountResult.data.account_number);
      }
    }
    setDataLoading(false);
  };

  const syncZiteData = async (accountNumber: string) => {
    setZiteSyncing(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zite-bill?action=customer&account_number=${encodeURIComponent(accountNumber)}`;
      const res = await fetch(apiUrl, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const body = await res.json() as ZiteCustomerData;
        if (body && !body.error) setZiteData(body);
      }
    } catch (err) {
      console.error('zite data sync failed', err);
    }
    setZiteSyncing(false);
  };

  const navigate = (next: Screen) => { setScreen(next); setDrawerOpen(false); };
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const signOut = async () => { await supabase.auth.signOut(); setAccount(null); setPayments([]); setScreen('home'); showToast('You have been signed out'); };

  if (authLoading) return <div className="loading-shell"><LoaderCircle className="spin" size={30} /><span>Opening your WATSAN account…</span></div>;
  if (!session) return <Welcome modal={modal} setModal={setModal} navigate={navigate} showToast={showToast} />;

  const menuItems: MenuItem[] = [
    { label: 'Home', icon: Home, screen: 'home' },
    { label: 'Pay my bill', icon: WalletCards, action: () => setModal('pay') },
    { label: 'Transaction history', icon: Receipt, screen: 'statements' },
    { label: 'My complaints', icon: MessageSquare, screen: 'help' },
    { label: 'Notifications', icon: Bell, action: () => showToast('You are all caught up') },
  ];
  const displayName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Customer';

  return <div className="app-shell portal-shell">
    <header className="topbar"><button className="icon-button icon-button--top" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Menu size={22} /></button><WatsanMark compact /><button className="icon-button icon-button--top" onClick={() => showToast('No new notifications')} aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button></header>
    <main className="portal-content">
      {appError && <div className="error-banner"><Info size={17} /><span>{appError}</span><button onClick={() => loadCustomerData(session.user.id)}>Retry</button></div>}
      {dataLoading && !account ? <div className="loading-card"><LoaderCircle className="spin" size={22} /> Loading your account</div> : <>
        {screen === 'home' && <HomeScreen account={account} payments={payments} bills={bills} ziteData={ziteData} ziteSyncing={ziteSyncing} displayName={displayName} setModal={setModal} showBalance={showBalance} setShowBalance={setShowBalance} navigate={navigate} />}
        {screen === 'help' && <HelpScreen account={account} showToast={showToast} session={session} />}
        {screen === 'statements' && <StatementsScreen payments={payments} zitePayments={ziteData?.payments ?? []} showToast={showToast} />}
        {screen === 'account' && <AccountScreen displayName={displayName} email={session.user.email ?? ''} showToast={showToast} signOut={signOut} />}
      </>}
    </main>
    <nav className="bottom-nav"><NavButton icon={Home} label="Home" active={screen === 'home'} onClick={() => navigate('home')} /><NavButton icon={MessageSquare} label="Help" active={screen === 'help'} onClick={() => navigate('help')} /><NavButton icon={Settings} label="Settings" active={screen === 'account'} onClick={() => navigate('account')} /></nav>
    {drawerOpen && <Drawer close={() => setDrawerOpen(false)} items={menuItems} navigate={navigate} displayName={displayName} signOut={signOut} />}
    {modal && <ModalContent modal={modal} close={() => setModal(null)} setModal={setModal} onPayment={async (method) => { if (!account) return false; const { data, error } = await supabase.rpc('pay_service_account', { p_service_account_id: account.id, p_method: method }); if (error || !data?.[0]) { console.error('payment failed', error); return false; } await loadCustomerData(session.user.id); return true; }} addAccount={async (accountNumber, address) => { const { data, error } = await supabase.from('service_accounts').insert({ account_number: accountNumber, service_address: address }).select('id, account_number, service_address, balance, due_date, status').maybeSingle(); if (error || !data) { console.error('account add failed', error); return false; } setAccount(data); return true; }} />}
    {toast && <div className="toast"><Check size={17} /> {toast}</div>}
  </div>;
}

function Welcome({ modal, setModal, navigate, showToast }: { modal: Modal; setModal: (modal: Modal) => void; navigate: (screen: Screen) => void; showToast: (message: string) => void }) {
  return <div className="app-shell welcome-shell"><div className="welcome-orb welcome-orb--one" /><div className="welcome-orb welcome-orb--two" /><header className="welcome-header"><WatsanMark /></header><main className="welcome-main"><div className="logo-hero"><img src={logoPath} alt="Tsrukpe Tota WATSAN" /></div><p className="eyebrow eyebrow--light">TSRUKPE TOTA WATSAN</p><h1>Reliable water services, right at your fingertips.</h1><p className="welcome-copy">Check your bill, make secure payments and reach our team without a trip to the office.</p><div className="welcome-actions"><button className="button button--light" onClick={() => setModal('register')}>Create an account <ArrowRight size={18} /></button><button className="button button--outline-light" onClick={() => setModal('signin')}>Sign in</button></div><div className="trust-row"><ShieldCheck size={16} /> Secure account access <span /> <Zap size={16} /> Always available</div></main><footer className="welcome-footer"><span>Serving Tsrukpe Tota and surrounding communities</span><span className="footer-dot" /></footer>{modal && <ModalContent modal={modal} close={() => setModal(null)} setModal={setModal} navigate={navigate} onPayment={async () => false} addAccount={async (accountNumber, address) => { const { error } = await supabase.from('service_accounts').insert({ account_number: accountNumber, service_address: address }); return !error; }} showToast={showToast} />} </div>;
}

function HomeScreen({ account, payments, bills, ziteData, ziteSyncing, displayName, setModal, showBalance, setShowBalance, navigate }: { account: ServiceAccount | null; payments: Payment[]; bills: Bill[]; ziteData: ZiteCustomerData | null; ziteSyncing: boolean; displayName: string; setModal: (modal: Modal) => void; showBalance: boolean; setShowBalance: (show: boolean) => void; navigate: (screen: Screen) => void }) {
  const firstName = displayName.split(' ')[0];
  const latestBill = bills.find((bill) => bill.status === 'pending');
  const periodLabel = latestBill ? new Date(`${latestBill.billing_period}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) : '';
  const ziteCustomer = ziteData?.customer;
  const liveBalance: number = ziteCustomer ? (toFieldValue(ziteCustomer, ['Balance', 'Amount Due', 'Outstanding', 'Current Balance'], 'number') as number | null) ?? (account ? Number(account.balance) : 0) : (account ? Number(account.balance) : 0);
  const liveDueDate = ziteCustomer ? toFieldValue(ziteCustomer, ['Due Date', 'Payment Due', 'Due'], 'string') as string ?? account?.due_date ?? '' : account?.due_date ?? '';
  const liveStatus = ziteCustomer ? (toFieldValue(ziteCustomer, ['Status', 'Account Status'], 'string') as string ?? account?.status ?? 'active') : account?.status ?? 'active';
  const ziteReadings = ziteData?.water_readings ?? [];
  return <div className="screen-stack"><section className="greeting-row"><div><p className="eyebrow">OVERVIEW</p><h1>Good morning, {firstName}</h1><p className="muted">What would you like to do?</p></div><div className="avatar"><UserRound size={19} /></div></section>{account ? <><section className="balance-card"><div className="balance-top"><span>YOUR CURRENT BALANCE</span><button className="balance-refresh" onClick={() => setShowBalance(!showBalance)} aria-label="Show or hide balance"><RefreshCw size={16} /></button></div><strong>{showBalance ? `GHS ${liveBalance.toFixed(2)}` : 'GHS ••••'}</strong><p>{liveBalance > 0 && liveDueDate ? `Due ${new Date(`${liveDueDate}T12:00:00`).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'No payment due'}</p><div className="balance-bottom"><span><span className="status-pip" /> Account {liveStatus}</span><button onClick={() => setModal('pay')} disabled={liveBalance <= 0}>Pay bill <ArrowRight size={15} /></button></div>{ziteData && <div className="zite-sync">{ziteSyncing ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />} {ziteSyncing ? 'Syncing with billing office…' : 'Bill synced from WATSAN office'}</div>}</section><section className="account-strip"><div><span className="eyebrow">SERVICE ACCOUNT</span><strong>{account.account_number}</strong><p>{account.service_address}</p></div><button className="mini-icon" onClick={() => setModal('addAccount')} aria-label="Add account"><Plus size={19} /></button></section></> : <EmptyAccount onClick={() => setModal('addAccount')} />}{account && latestBill && <section className="bill-card"><div className="bill-top"><span className="eyebrow">CURRENT BILL</span><strong>{periodLabel}</strong></div><div className="bill-amount"><span>Billed this month</span><strong>GHS {Number(latestBill.amount).toFixed(2)}</strong></div><p className="bill-due">Due {new Date(`${latestBill.due_date}T12:00:00`).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}</p><button className="button button--primary" onClick={() => setModal('pay')}>Pay this bill <ArrowRight size={16} /></button></section>}{account && ziteReadings.length > 0 && <section className="reading-card"><div className="reading-top"><SectionHeading title="Water readings" /></div><div className="reading-list">{ziteReadings.slice(0, 3).map((reading, i) => <div className="reading-row" key={i}><GaugeIcon /> <span>{toFieldValue(reading, ['Reading Date', 'Date', 'Meter Reading Date'], 'string') as string ?? '—'}</span><strong>{toFieldValue(reading, ['Reading', 'Meter Reading', 'Consumption', 'Usage'], 'string') as string ?? '—'}</strong></div>)}</div></section>}{account && <><section><SectionHeading title="Quick access" /><div className="quick-grid"><QuickAction icon={CreditCard} label="Pay bill" onClick={() => setModal('pay')} /><QuickAction icon={FileText} label="Statements" onClick={() => navigate('statements')} /><QuickAction icon={MessageSquare} label="Report an issue" onClick={() => navigate('help')} /><QuickAction icon={Headphones} label="Contact us" onClick={() => navigate('help')} /></div></section><section><SectionHeading title="Recent activity" action="View all" onClick={() => navigate('statements')} /><div className="activity-card">{payments.length ? payments.slice(0, 3).map((payment) => <ActivityRow key={payment.id} icon={Check} title="Bill payment successful" subtitle={`${new Date(payment.created_at).toLocaleDateString('en-GH')} · ${payment.method === 'mobile_money' ? 'Mobile Money' : 'Card'}`} amount={`GHS ${Number(payment.amount).toFixed(2)}`} />) : <div className="activity-empty"><Receipt size={20} /><span>Your payment activity will appear here.</span></div>}</div></section><div className="info-banner"><Lightbulb size={19} /><div><strong>Need help?</strong><p>Our support team is ready to assist you.</p></div><button onClick={() => navigate('help')} aria-label="Open help"><ChevronRight size={18} /></button></div></>}</div>;
}

function EmptyAccount({ onClick }: { onClick: () => void }) { return <section className="empty-account"><div className="empty-account-icon"><Plus size={23} /></div><div><strong>Add your service account</strong><p>Link your WATSAN account to view your bill and make payments.</p></div><button className="button button--primary" onClick={onClick}>Add account</button></section>; }

function HelpScreen({ account, showToast, session }: { account: ServiceAccount | null; showToast: (message: string) => void; session: Session }) {
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState('water_issue');
  const [submitting, setSubmitting] = useState(false);
  const submitRequest = async (event: FormEvent) => { event.preventDefault(); setSubmitting(true); const { error } = await supabase.from('support_requests').insert({ service_account_id: account?.id ?? null, request_type: requestType, description }); setSubmitting(false); if (error) { console.error('support request failed', error); showToast('We could not send your request'); return; } setDescription(''); setFormOpen(false); showToast('Your request has been sent'); };
  return <div className="screen-stack"><PageIntro eyebrow="SUPPORT" title="How can we help?" copy="Our team is ready to help with your account, payments and water service." /><div className="support-card"><div className="support-icon"><Headphones size={26} /></div><div><strong>Speak to our team</strong><p>Monday — Friday, 8:00 AM to 5:00 PM</p></div><button className="circle-arrow" onClick={() => showToast('Call 055 000 1422 for support')}><ArrowRight size={17} /></button></div><div className="support-list"><HelpItem icon={MessageSquare} title="Report a water issue" copy="Tell us about a leak, low pressure or service interruption." onClick={() => setFormOpen(true)} /><HelpItem icon={FileText} title="Request a statement" copy="Get a clear record of your recent water payments." onClick={() => showToast('Statement request received')} /><HelpItem icon={CircleHelp} title="Frequently asked questions" copy="Find quick answers about bills, meters and payments." onClick={() => showToast('FAQ section coming soon')} /></div>{formOpen && <form className="issue-form" onSubmit={submitRequest}><div className="section-heading"><h2>Send a request</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={18} /></button></div><label>Request type<select value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="water_issue">Water issue</option><option value="billing">Billing question</option><option value="other">Other</option></select></label><label>How can we help?<textarea required minLength={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the issue or question" /></label><button className="button button--primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <SendIcon />} {submitting ? 'Sending…' : 'Send request'}</button></form>}<div className="contact-panel"><p className="eyebrow">EMERGENCY WATER LINE</p><strong>055 000 1422</strong><p>For urgent leaks and supply concerns.</p></div><span className="sr-only">Signed in as {session.user.email}</span></div>;
}

function StatementsScreen({ payments, zitePayments, showToast }: { payments: Payment[]; zitePayments: ZiteField[]; showToast: (message: string) => void }) {
  const hasZitePayments = zitePayments.length > 0;
  return <div className="screen-stack"><div className="page-title-row"><PageIntro eyebrow="YOUR RECORDS" title="Statements" copy="Keep track of your bills and payments." /><button className="mini-icon mini-icon--gold" onClick={() => showToast('Statement request received')} aria-label="Request statement"><Plus size={20} /></button></div><div className="filter-row"><button className="filter-chip filter-chip--active">All payments</button><button className="filter-chip">Recent <ChevronDown size={14} /></button></div><div className="statement-list">{payments.length ? payments.map((payment) => <div className="statement-card" key={payment.id}><div className="statement-icon"><FileText size={20} /></div><div className="statement-details"><strong>Payment receipt</strong><span>{new Date(payment.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })} · {payment.receipt_number}</span><small><span className="paid-dot" /> {payment.status} · GHS {Number(payment.amount).toFixed(2)}</small></div><button className="download-button" onClick={() => showToast('Receipt download is being prepared')}><Download size={16} /></button></div>) : <div className="activity-empty"><Receipt size={20} /><span>No payments yet. Your receipts will appear here.</span></div>}</div>{hasZitePayments && <><SectionHeading title="From billing office" /><div className="statement-list">{zitePayments.map((payment, i) => <div className="statement-card" key={`zite-${i}`}><div className="statement-icon"><FileText size={20} /></div><div className="statement-details"><strong>{toFieldValue(payment, ['Description', 'Type', 'Payment Type'], 'string') as string ?? 'Payment'}</strong><span>{toFieldValue(payment, ['Date', 'Payment Date'], 'string') as string ?? '—'}</span><small><span className="paid-dot" /> {toFieldValue(payment, ['Status', 'Payment Status'], 'string') as string ?? 'completed'} · GHS {Number(toFieldValue(payment, ['Amount', 'Payment Amount'], 'number') ?? 0).toFixed(2)}</small></div></div>)}</div></>}</div>; }

function AccountScreen({ displayName, email, showToast, signOut }: { displayName: string; email: string; showToast: (message: string) => void; signOut: () => void }) { return <div className="screen-stack"><PageIntro eyebrow="PREFERENCES" title="Settings" copy="Manage your profile and service preferences." /><div className="profile-card"><div className="profile-avatar"><UserRound size={26} /></div><div><strong>{displayName}</strong><p>{email}</p></div><ChevronRight size={18} /></div><div className="settings-list"><SettingRow icon={UserRound} title="Personal details" onClick={() => showToast('Personal details are managed from your account')} /><SettingRow icon={Bell} title="Notifications" onClick={() => showToast('Notifications are on')} /><SettingRow icon={ShieldCheck} title="Security and privacy" onClick={() => showToast('Your account is secure')} /><SettingRow icon={Info} title="About WATSAN" onClick={() => showToast('Tsrukpe Tota WATSAN customer portal')} /></div><button className="signout-button" onClick={signOut}><LogOut size={18} /> Sign out</button></div>; }

function ModalContent({ modal, close, setModal, navigate, onPayment, addAccount, showToast }: { modal: Modal; close: () => void; setModal?: (modal: Modal) => void; navigate?: (screen: Screen) => void; onPayment: (method: string) => Promise<boolean>; addAccount: (accountNumber: string, address: string) => Promise<boolean>; showToast?: (message: string) => void }) {
  const [form, setForm] = useState(initialAuthForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [success, setSuccess] = useState(false);
  const isRegister = modal === 'register';
  const isPay = modal === 'pay';
  const isAddAccount = modal === 'addAccount';
  const submitAuth = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); const result = isRegister ? await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { full_name: form.name } } }) : await supabase.auth.signInWithPassword({ email: form.email, password: form.password }); if (result.error) { console.error('authentication failed', result.error); setError('We could not complete that request. Check your details and try again.'); setBusy(false); return; } if (isRegister && result.data.user && result.data.session && form.accountNumber) { const accountAdded = await addAccount(form.accountNumber, form.address || 'Tsrukpe Tota'); if (!accountAdded) console.error('initial account creation failed'); } if (isRegister && !result.data.session) { setError('Your account was created. Check your email to finish signing in.'); setBusy(false); return; } close(); setBusy(false); };
  const submitPayment = async () => { setBusy(true); setError(''); const paid = await onPayment(paymentMethod); setBusy(false); if (!paid) { setError('We could not complete the payment. Please try again.'); return; } setSuccess(true); };
  const submitAccount = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); const added = await addAccount(form.accountNumber, form.address); setBusy(false); if (!added) { setError('We could not add that account. Check the details and try again.'); return; } close(); showToast?.('Service account added'); };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className={`modal-card ${success ? 'modal-card--success' : ''}`}><div className="modal-brand"><WatsanMark compact /></div><button className="modal-close" onClick={close} aria-label="Close"><X size={20} /></button>{success ? <><div className="success-check"><Check size={29} /></div><p className="eyebrow">PAYMENT CONFIRMED</p><h2>Payment successful</h2><p className="modal-copy">Your WATSAN payment has been recorded and your balance is now up to date.</p><button className="button button--primary" onClick={() => { close(); navigate?.('statements'); }}>View payment history</button></> : <>{isPay ? <><p className="eyebrow">SECURE PAYMENT</p><h2>Pay your bill</h2><p className="modal-copy">Choose how you would like to settle your current WATSAN balance.</p><div className="payment-summary"><span>Current amount due</span><strong>Secure balance</strong><small>Your exact balance is confirmed securely when you submit.</small></div><label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="mobile_money">Mobile Money</option><option value="card">Bank card</option></select></label>{error && <div className="form-error">{error}</div>}<button className="button button--primary" onClick={submitPayment} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} {busy ? 'Processing…' : 'Pay securely'}</button><p className="secure-note"><ShieldCheck size={15} /> Payment amount is verified securely</p></> : isAddAccount ? <form onSubmit={submitAccount}><p className="eyebrow">SERVICE ACCOUNT</p><h2>Add an account</h2><p className="modal-copy">Link another WATSAN service account to your profile.</p><label>Service account number<input required value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} placeholder="TT-0014-8832" /></label><label>Service address<input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="House or location description" /></label>{error && <div className="form-error">{error}</div>}<button className="button button--primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />} {busy ? 'Adding…' : 'Add account'}</button></form> : <form onSubmit={submitAuth}><p className="eyebrow">{isRegister ? 'GET STARTED' : 'WELCOME BACK'}</p><h2>{isRegister ? 'Create your account' : 'Sign in to WATSAN'}</h2><p className="modal-copy">{isRegister ? 'Get easy access to your water account anytime.' : 'Use your email and password to continue.'}</p>{isRegister && <><label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ama Mensah" /></label><label>Service account number<input required value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} placeholder="TT-0014-8832" /></label><label>Service address<input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="House or location description" /></label></>}<label>Email address<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label><label>Password<input required minLength={6} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 6 characters" /></label>{error && <div className="form-error">{error}</div>}<button className="button button--primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}</button><button className="text-button" type="button" onClick={() => setModal?.(isRegister ? 'signin' : 'register')}>{isRegister ? 'Already have an account? Sign in' : 'New to WATSAN? Create an account'}</button></form>}</>}</div></div>;
}

function Drawer({ close, items, navigate, displayName, signOut }: { close: () => void; items: MenuItem[]; navigate: (screen: Screen) => void; displayName: string; signOut: () => void }) { return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="drawer"><div className="drawer-head"><WatsanMark compact /><button className="icon-button" onClick={close} aria-label="Close menu"><X size={20} /></button></div><div className="drawer-profile"><div className="avatar avatar--large"><UserRound size={22} /></div><div><strong>{displayName}</strong><span>Signed-in WATSAN customer</span></div></div><div className="drawer-items">{items.map((item) => <button className="drawer-item" key={item.label} onClick={() => { if (item.screen) navigate(item.screen); else item.action?.(); close(); }}><item.icon size={19} /><span>{item.label}</span><ChevronRight size={16} /></button>)}</div><div className="drawer-bottom"><button className="drawer-item" onClick={() => { navigate('account'); close(); }}><Settings size={19} /><span>Settings</span><ChevronRight size={16} /></button><button className="drawer-item drawer-item--muted" onClick={signOut}><LogOut size={19} /><span>Sign out</span></button></div></aside></div>; }

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div className="page-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{copy}</p></div>; }
function SectionHeading({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) { return <div className="section-heading"><h2>{title}</h2>{action && <button onClick={onClick}>{action} <ChevronRight size={14} /></button>}</div>; }
function NavButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-button ${active ? 'nav-button--active' : ''}`} onClick={onClick}><Icon size={20} /><span>{label}</span></button>; }
function QuickAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) { return <button className="quick-action" onClick={onClick}><span><Icon size={19} /></span><strong>{label}</strong></button>; }
function ActivityRow({ icon: Icon, title, subtitle, amount }: { icon: LucideIcon; title: string; subtitle: string; amount: string }) { return <div className="activity-row"><span className="activity-icon"><Icon size={16} /></span><div><strong>{title}</strong><small>{subtitle}</small></div><b>{amount}</b></div>; }
function HelpItem({ icon: Icon, title, copy, onClick }: { icon: LucideIcon; title: string; copy: string; onClick: () => void }) { return <button className="help-item" onClick={onClick}><span className="help-item-icon"><Icon size={19} /></span><span><strong>{title}</strong><small>{copy}</small></span><ChevronRight size={18} /></button>; }
function SettingRow({ icon: Icon, title, onClick }: { icon: LucideIcon; title: string; onClick: () => void }) { return <button className="setting-row" onClick={onClick}><span><Icon size={18} /></span><strong>{title}</strong><ChevronRight size={17} /></button>; }
function SendIcon() { return <ArrowRight size={18} />; }
function GaugeIcon() { return <Gauge size={16} />; }

function toFieldValue(record: ZiteField, candidates: string[], kind: 'string' | 'number'): string | number | null {
  const keys = Object.keys(record);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (match) {
      const val = record[match];
      if (val == null || val === '') continue;
      if (kind === 'number') { const n = Number(val); if (Number.isFinite(n)) return n; }
      else { return String(val); }
    }
  }
  return null;
}

export default App;
