import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { sendCustomerOtp, verifyCustomerOtp, getCustomerPortalData, logoutCustomerPortal, initializeCustomerPayment, verifyCustomerPayment } from '@/lib/zite';
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


type Screen = 'home' | 'help' | 'statements' | 'account';
type Modal = 'signin' | 'pay' | 'success' | null;
type ServiceAccount = { id: string; account_number: string; service_address: string; balance: number; due_date: string; status: string };
type Payment = { id: string; amount: number; method: string; status: string; receipt_number: string; created_at: string };
type Bill = { id: string; billing_period: string; amount: number; amount_paid: number; balance: number; previous_reading: number; current_reading: number; units_consumed: number; rate_per_unit: number; status: string; notes: string };
type ZiteField = Record<string, unknown>;
type ZiteCustomerData = {
  customer: ZiteField | null;
  water_readings: ZiteField[];
  payments: ZiteField[];
  error: string | null;
};
type MenuItem = { label: string; icon: LucideIcon; screen?: Screen; action?: () => void };

type AuthForm = { meterNumber: string; code: string };

const logoPath = `${import.meta.env.BASE_URL}watsan-logo.png`;
const initialAuthForm: AuthForm = { meterNumber: '', code: '' };
type PortalSession = { meterNumber: string; token: string; expiresAt: string; isDemo?: boolean; customer: { fullName: string; meterNumber: string } };

function WatsanMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`} aria-label="Tsrukpe Tota Water and Sanitation"><img src={logoPath} alt="Tsrukpe Tota Water and Sanitation logo" /><div><strong>TSRUKPE TOTA</strong><small>WATER &amp; SANITATION</small></div></div>;
}

function App() {
  const [session, setSession] = useState<PortalSession | null>(() => {
    try {
      const saved = sessionStorage.getItem('watsan_customer_session');
      if (!saved) return null;
      const parsed = JSON.parse(saved) as PortalSession;
      return new Date(parsed.expiresAt).getTime() > Date.now() ? parsed : null;
    } catch { return null; }
  });
  const [authLoading, setAuthLoading] = useState(false);
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
    if (!session) return;
    if (session.isDemo) {
      setAccount({ id: 'DEMO-001', account_number: 'DEMO-001', service_address: 'Tsrukpe-Tota (Demo Account)', balance: 25, due_date: '2026-11-30', status: 'Demo' });
      setBills([{ id: 'demo-bill-1', billing_period: '2026-11', amount: 25, due_date: '2026-11-30', status: 'pending' }]);
      setPayments([]);
      setZiteData(null);
      setAppError('');
      return;
    }
    void loadCustomerData(session);
  }, [session?.meterNumber, session?.token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference || !session) return;
    void (async () => {
      try {
        const result = await verifyCustomerPayment({ meterNumber: session.meterNumber, sessionToken: session.token, reference });
        if (result.verified) {
          showToast(result.status === 'already_recorded' ? 'Payment already recorded' : 'Payment confirmed successfully');
          await loadCustomerData(session);
        } else {
          showToast('Payment is not yet confirmed. Please refresh in a moment.');
        }
      } catch {
        showToast('We could not verify the payment yet. Please contact WATSAN before paying again.');
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    })();
  }, [session?.meterNumber, session?.token]);

  const loadCustomerData = async (activeSession: PortalSession) => {
    setDataLoading(true);
    setZiteSyncing(true);
    setAppError('');
    try {
      const data = await getCustomerPortalData({ meterNumber: activeSession.meterNumber, sessionToken: activeSession.token });
      const readings = data.water_readings ?? [];
      const outstanding = readings.reduce((sum, item) =>
        sum + Math.max(0, Number(item.amountDue ?? 0) - Number(item.amountPaid ?? 0)), 0);
      const latestReading = [...readings].sort((a, b) =>
        String(b.readingMonth ?? '').localeCompare(String(a.readingMonth ?? '')))[0];
      setAccount({
        id: activeSession.meterNumber,
        account_number: activeSession.meterNumber,
        service_address: String(data.customer.location ?? 'Tsrukpe-Tota'),
        balance: Math.round(outstanding * 100) / 100,
        due_date: String(latestReading?.readingMonth ?? ''),
        status: String(data.customer.status ?? 'Active'),
      });
      setBills(readings.map((item, index) => ({
        id: String(item.id ?? index),
        billing_period: String(item.readingMonth ?? ''),
        amount: Number(item.amountDue ?? 0),
        due_date: '',
        amount_paid: Number(item.amountPaid ?? 0),
        balance: Math.max(0, Number(item.amountDue ?? 0) - Number(item.amountPaid ?? 0)),
        previous_reading: Number(item.previousReading ?? 0),
        current_reading: Number(item.currentReading ?? 0),
        units_consumed: Number(item.unitsConsumed ?? (Number(item.currentReading ?? 0) - Number(item.previousReading ?? 0))),
        rate_per_unit: Number(item.ratePerUnit ?? 5),
        status: String(item.billStatus ?? 'Unpaid').trim().toLowerCase(),
        notes: String(item.notes ?? ''),
      })).sort((a, b) => b.billing_period.localeCompare(a.billing_period)));
      setPayments((data.payments ?? []).map((item, index) => ({
        id: String(item.id ?? index),
        amount: Number(item.amountPaid ?? 0),
        method: String(item.paymentMethod ?? 'Mobile Money').toLowerCase().includes('mobile') ? 'mobile_money' : 'card',
        status: String(item.status ?? 'Confirmed'),
        receipt_number: String(item.receiptNumber ?? ''),
        created_at: String(item.paymentTimestamp ?? item.paymentDate ?? ''),
      })));
      setZiteData({
        customer: data.customer as unknown as ZiteField,
        water_readings: readings as ZiteField[],
        payments: (data.payments ?? []) as ZiteField[],
        error: null,
      });
    } catch (error) {
      console.error('Zite customer data load failed', error);
      setAppError(error instanceof Error ? error.message : 'We could not load your WATSAN account. Please try again.');
    } finally {
      setDataLoading(false);
      setZiteSyncing(false);
    }
  };

  const navigate = (next: Screen) => { setScreen(next); setDrawerOpen(false); };
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const handleLogin = (nextSession: PortalSession) => {
    sessionStorage.setItem('watsan_customer_session', JSON.stringify(nextSession));
    setSession(nextSession);
    setModal(null);
    setScreen('home');
  };
  const signOut = async () => {
    if (session && !session.isDemo) {
      try { await logoutCustomerPortal({ meterNumber: session.meterNumber, sessionToken: session.token }); } catch (error) { console.warn('Session revocation failed', error); }
    }
    sessionStorage.removeItem('watsan_customer_session');
    setSession(null); setAccount(null); setPayments([]); setBills([]); setZiteData(null); setScreen('home');
    showToast('You have been signed out');
  };

  if (authLoading) return <div className="loading-shell"><LoaderCircle className="spin" size={30} /><span>Opening your WATSAN account…</span></div>;
  if (!session) return <Welcome modal={modal} setModal={setModal} navigate={navigate} showToast={showToast} onLogin={handleLogin} onDemo={() => handleLogin({ meterNumber: 'DEMO-001', token: 'DEMO-ONLY', expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), isDemo: true, customer: { fullName: 'Demo Customer', meterNumber: 'DEMO-001' } })} />;

  const menuItems: MenuItem[] = [
    { label: 'Home', icon: Home, screen: 'home' },
    { label: 'Pay my bill', icon: WalletCards, action: () => setModal('pay') },
    { label: 'Transaction history', icon: Receipt, screen: 'statements' },
    { label: 'My complaints', icon: MessageSquare, screen: 'help' },
    { label: 'Notifications', icon: Bell, action: () => showToast('You are all caught up') },
  ];
  const displayName = session.customer.fullName || 'WATSAN Customer';

  return <div className="app-shell portal-shell">
    <header className="topbar"><button className="icon-button icon-button--top" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Menu size={22} /></button><WatsanMark compact /><button className="icon-button icon-button--top" onClick={() => showToast('No new notifications')} aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button></header>
    <main className="portal-content">
      {appError && <div className="error-banner"><Info size={17} /><span>{appError}</span><button onClick={() => void loadCustomerData(session)}>Retry</button></div>}
      {dataLoading && !account ? <div className="loading-card"><LoaderCircle className="spin" size={22} /> Loading your account</div> : <>
        {screen === 'home' && <HomeScreen account={account} payments={payments} bills={bills} ziteData={ziteData} ziteSyncing={ziteSyncing} displayName={displayName} setModal={setModal} showBalance={showBalance} setShowBalance={setShowBalance} navigate={navigate} />}
        {screen === 'help' && <HelpScreen account={account} showToast={showToast} session={session} />}
        {screen === 'statements' && <StatementsScreen bills={bills} payments={payments} zitePayments={ziteData?.payments ?? []} showToast={showToast} />}
        {screen === 'account' && <AccountScreen displayName={displayName} email={session.meterNumber} showToast={showToast} signOut={signOut} />}
      </>}
    </main>
    <nav className="bottom-nav"><NavButton icon={Home} label="Home" active={screen === 'home'} onClick={() => navigate('home')} /><NavButton icon={MessageSquare} label="Help" active={screen === 'help'} onClick={() => navigate('help')} /><NavButton icon={Settings} label="Settings" active={screen === 'account'} onClick={() => navigate('account')} /></nav>
    {drawerOpen && <Drawer close={() => setDrawerOpen(false)} items={menuItems} navigate={navigate} displayName={displayName} signOut={signOut} />}
    {modal && <ModalContent modal={modal} close={() => setModal(null)} setModal={setModal} navigate={navigate} onLogin={handleLogin} onPayment={async () => {
      if (!session || session.isDemo || !account || account.balance <= 0) { showToast('Payments are disabled in demo mode'); return false; }
      const result = await initializeCustomerPayment({ meterNumber: session.meterNumber, sessionToken: session.token, amount: account.balance });
      if (!result.success || !result.authorizationUrl) { showToast(result.error || 'Payment could not be started'); return false; }
      window.location.assign(result.authorizationUrl);
      return true;
    }} />}
    {toast && <div className="toast"><Check size={17} /> {toast}</div>}
  </div>;
}

function Welcome({ modal, setModal, navigate, showToast, onLogin, onDemo }: { modal: Modal; setModal: (modal: Modal) => void; navigate: (screen: Screen) => void; showToast: (message: string) => void; onLogin: (session: PortalSession) => void; onDemo: () => void }) {
  return <div className="app-shell welcome-shell"><div className="welcome-orb welcome-orb--one" /><div className="welcome-orb welcome-orb--two" /><header className="welcome-header"><WatsanMark /></header><main className="welcome-main"><div className="logo-hero"><img src={logoPath} alt="Tsrukpe Tota WATSAN" /></div><p className="eyebrow eyebrow--light">TSRUKPE TOTA WATSAN</p><h1>Reliable water services, right at your fingertips.</h1><p className="welcome-copy">Check your bill, make secure payments and reach our team without a trip to the office.</p><div className="welcome-actions"><button className="button button--light" onClick={() => setModal('signin')}>Access my account <ArrowRight size={18} /></button><button className="text-button" type="button" onClick={onDemo}>Enter demo portal (testing only)</button></div><div className="trust-row"><ShieldCheck size={16} /> Meter number + OTP verification <span /> <Zap size={16} /> Always available</div></main><footer className="welcome-footer"><span>Serving Tsrukpe Tota and surrounding communities</span><span className="footer-dot" /><span className="welcome-contact">WATSAN Office: <a href="tel:+233591189163">+233 59 118 9163</a></span></footer>{modal && <ModalContent modal={modal} close={() => setModal(null)} setModal={setModal} navigate={navigate} onLogin={onLogin} onPayment={async () => false} showToast={showToast} />}</div>;
}

function HomeScreen({ account, payments, bills, ziteData, ziteSyncing, displayName, setModal, showBalance, setShowBalance, navigate }: { account: ServiceAccount | null; payments: Payment[]; bills: Bill[]; ziteData: ZiteCustomerData | null; ziteSyncing: boolean; displayName: string; setModal: (modal: Modal) => void; showBalance: boolean; setShowBalance: (show: boolean) => void; navigate: (screen: Screen) => void }) {
  const firstName = displayName.split(' ')[0];
  const latestBill = [...bills].sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0];
  const periodLabel = latestBill ? new Date(`${latestBill.billing_period}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) : '';
  const ziteCustomer = ziteData?.customer;
  const liveBalance: number = ziteCustomer ? (toFieldValue(ziteCustomer, ['Balance', 'Amount Due', 'Outstanding', 'Current Balance'], 'number') as number | null) ?? (account ? Number(account.balance) : 0) : (account ? Number(account.balance) : 0);
  const liveDueDate = ''; // A reading month is not a confirmed payment deadline.
  const liveStatus = ziteCustomer ? (toFieldValue(ziteCustomer, ['Status', 'Account Status'], 'string') as string ?? account?.status ?? 'active') : account?.status ?? 'active';
  const ziteReadings = ziteData?.water_readings ?? [];
  return <div className="screen-stack"><section className="greeting-row"><div><p className="eyebrow">OVERVIEW</p><h1>Good morning, {firstName}</h1><p className="muted">What would you like to do?</p></div><div className="avatar"><UserRound size={19} /></div></section>{account ? <><section className="balance-card"><div className="balance-top"><span>YOUR CURRENT BALANCE</span><button className="balance-refresh" onClick={() => setShowBalance(!showBalance)} aria-label="Show or hide balance"><RefreshCw size={16} /></button></div><strong>{showBalance ? `GHS ${liveBalance.toFixed(2)}` : 'GHS ••••'}</strong><p>{liveBalance > 0 ? 'You have an outstanding balance' : 'No payment due'}</p><div className="balance-bottom"><span><span className="status-pip" /> Account status: {liveStatus}</span><span className={`account-billing-status ${liveBalance > 0 ? 'account-billing-status--owing' : 'account-billing-status--clear'}`}>{liveBalance > 0 ? 'Owing' : 'Paid up'}</span><button onClick={() => setModal('pay')} disabled={liveBalance <= 0}>Pay bill <ArrowRight size={15} /></button></div>{ziteData && <div className="zite-sync">{ziteSyncing ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />} {ziteSyncing ? 'Syncing with billing office…' : 'Bill synced from WATSAN office'}</div>}</section><section className="account-strip"><div><span className="eyebrow">SERVICE ACCOUNT</span><strong>{account.account_number}</strong><p>{account.service_address}</p></div></section></> : <EmptyAccount />}{account && latestBill && <section className="bill-card"><div className="bill-top"><span className="eyebrow">LATEST OUTSTANDING BILL</span><strong>{periodLabel}</strong></div><div className="bill-amount"><span>Outstanding on this bill</span><strong>GHS {Number(latestBill.balance).toFixed(2)}</strong></div><p className="bill-due">Bill amount: GHS {Number(latestBill.amount).toFixed(2)} · Paid: GHS {Number(latestBill.amount_paid).toFixed(2)}</p><button className="button button--primary" onClick={() => setModal('pay')}>Pay outstanding balance <ArrowRight size={16} /></button></section>}{account && latestBill && <section className="reading-card"><div className="reading-top"><SectionHeading title="Your water consumption" /></div><p className="usage-period">{periodLabel || new Date(`${latestBill.billing_period}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })}</p><div className="usage-highlight"><strong>{latestBill.units_consumed.toLocaleString('en-GH')}</strong><span>units of water consumed</span></div><div className="usage-reading-grid"><div><small>Previous meter reading</small><b>{latestBill.previous_reading.toLocaleString('en-GH')}</b></div><div><small>Current meter reading</small><b>{latestBill.current_reading.toLocaleString('en-GH')}</b></div><div><small>Rate per unit</small><b>GH₵ {latestBill.rate_per_unit.toFixed(2)}</b></div></div><div className="usage-cost"><span>Water charge for this period</span><strong>GH₵ {latestBill.amount.toFixed(2)}</strong></div></section>}{account && !latestBill && ziteReadings.length > 0 && <section className="reading-card"><SectionHeading title="Water meter readings" /><div className="reading-list">{ziteReadings.slice(0,3).map((reading,i)=><div className="reading-row" key={i}><GaugeIcon/><span>{String(reading.readingMonth ?? 'Meter reading')}</span><strong>{String(reading.unitsConsumed ?? 0)} units</strong></div>)}</div></section>}{account && <><section><SectionHeading title="Quick access" /><div className="quick-grid"><QuickAction icon={CreditCard} label="Pay bill" onClick={() => setModal('pay')} /><QuickAction icon={FileText} label="Statements" onClick={() => navigate('statements')} /><QuickAction icon={MessageSquare} label="Report an issue" onClick={() => navigate('help')} /><QuickAction icon={Headphones} label="Contact us" onClick={() => navigate('help')} /></div></section><section><SectionHeading title="Recent activity" action="View all" onClick={() => navigate('statements')} /><div className="activity-card">{payments.length ? payments.slice(0, 3).map((payment) => <ActivityRow key={payment.id} icon={Check} title="Bill payment successful" subtitle={`${new Date(payment.created_at).toLocaleDateString('en-GH')} · ${payment.method === 'mobile_money' ? 'Mobile Money' : 'Card'}`} amount={`GHS ${Number(payment.amount).toFixed(2)}`} />) : <div className="activity-empty"><Receipt size={20} /><span>Your payment activity will appear here.</span></div>}</div></section><div className="info-banner"><Lightbulb size={19} /><div><strong>Need help?</strong><p>Our support team is ready to assist you.</p></div><button onClick={() => navigate('help')} aria-label="Open help"><ChevronRight size={18} /></button></div></>}</div>;
}

function EmptyAccount() { return <section className="empty-account"><div className="empty-account-icon"><Info size={23} /></div><div><strong>No billing records found</strong><p>We could not find billing records for this meter. Please contact the WATSAN office to confirm your account details.</p></div></section>; }

function HelpScreen({ account, showToast, session }: { account: ServiceAccount | null; showToast: (message: string) => void; session: PortalSession }) {
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState('water_issue');
  const [submitting, setSubmitting] = useState(false);
  const submitRequest = async (event: FormEvent) => { event.preventDefault(); setSubmitting(true); await new Promise((resolve) => window.setTimeout(resolve, 250)); setSubmitting(false); setFormOpen(false); setDescription(''); showToast('Please call the WATSAN office to submit this request. Online support requests are not connected yet.'); };
  return <div className="screen-stack"><PageIntro eyebrow="SUPPORT" title="How can we help?" copy="Our team is ready to help with your account, payments and water service." /><div className="support-card"><div className="support-icon"><Headphones size={26} /></div><div><strong>Speak to our team</strong><p>Monday — Friday, 8:00 AM to 5:00 PM</p></div><button className="circle-arrow" onClick={() => showToast('Call +233 59 118 9163 for support')}><ArrowRight size={17} /></button></div><div className="support-list"><HelpItem icon={MessageSquare} title="Report a water issue" copy="Tell us about a leak, low pressure or service interruption." onClick={() => setFormOpen(true)} /><HelpItem icon={FileText} title="Request a statement" copy="Get a clear record of your recent water payments." onClick={() => showToast('Statement request received')} /><HelpItem icon={CircleHelp} title="Frequently asked questions" copy="Find quick answers about bills, meters and payments." onClick={() => showToast('FAQ section coming soon')} /></div>{formOpen && <form className="issue-form" onSubmit={submitRequest}><div className="section-heading"><h2>Send a request</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={18} /></button></div><label>Request type<select value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="water_issue">Water issue</option><option value="billing">Billing question</option><option value="other">Other</option></select></label><label>How can we help?<textarea required minLength={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the issue or question" /></label><button className="button button--primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <SendIcon />} {submitting ? 'Sending…' : 'Send request'}</button></form>}<div className="contact-panel"><p className="eyebrow">EMERGENCY WATER LINE</p><strong>+233 59 118 9163</strong><p>For urgent leaks and supply concerns.</p></div><span className="sr-only">Signed in as {session.meterNumber}</span></div>;
}

function StatementsScreen({ bills, payments, zitePayments, showToast }: { bills: Bill[]; payments: Payment[]; zitePayments: ZiteField[]; showToast: (message: string) => void }) {
  const hasZitePayments = zitePayments.length > 0;
  const formatPeriod = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) : 'Billing period unavailable';
  return <div className="screen-stack"><div className="page-title-row"><PageIntro eyebrow="YOUR RECORDS" title="Bills & Payments" copy="View every monthly water bill, meter reading, outstanding amount and payment." /><button className="mini-icon mini-icon--gold" onClick={() => showToast('Statement request received')} aria-label="Request statement"><Plus size={20} /></button></div><section><SectionHeading title="Monthly bills" /><div className="bill-history-list">{bills.length ? bills.map((bill) => <article className="bill-history-card" key={bill.id}><div className="bill-history-top"><div><strong>{formatPeriod(bill.billing_period)}</strong><span>Monthly water bill</span></div><span className={`bill-status bill-status--${bill.balance > 0 ? 'owing' : 'paid'}`}>{bill.balance > 0 ? (bill.amount_paid > 0 ? 'Part-paid' : 'Unpaid') : 'Paid'}</span></div><div className="bill-reading-grid"><div><small>Previous reading</small><b>{bill.previous_reading}</b></div><div><small>Current reading</small><b>{bill.current_reading}</b></div><div><small>Units used</small><b>{bill.units_consumed}</b></div></div><div className="bill-history-total"><span>Bill: GH₵ {bill.amount.toFixed(2)} · Paid: GH₵ {bill.amount_paid.toFixed(2)}</span><strong>Balance: GH₵ {bill.balance.toFixed(2)}</strong></div>{bill.notes && <p className="bill-history-note">{bill.notes}</p>}</article>) : <div className="activity-empty"><Receipt size={20} /><span>No bills have been issued to this account yet. Your next bill will appear here after the WATSAN meter-reading and billing process.</span></div>}</div></section><section><SectionHeading title="Payment history" /><div className="statement-list">{payments.length ? payments.map((payment) => <div className="statement-card" key={payment.id}><div className="statement-icon"><FileText size={20} /></div><div className="statement-details"><strong>Payment receipt</strong><span>{new Date(payment.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })} · {payment.receipt_number}</span><small><span className="paid-dot" /> {payment.status} · GHS {Number(payment.amount).toFixed(2)}</small></div><button className="download-button" onClick={() => showToast('Receipt download is being prepared')}><Download size={16} /></button></div>) : <div className="activity-empty"><Receipt size={20} /><span>No payments yet. Your receipts will appear here.</span></div>}</div></section>{hasZitePayments && <><SectionHeading title="Additional payment records" /><div className="statement-list">{zitePayments.map((payment, i) => <div className="statement-card" key={`zite-${i}`}><div className="statement-icon"><FileText size={20} /></div><div className="statement-details"><strong>{toFieldValue(payment, ['Description', 'Type', 'Payment Type'], 'string') as string ?? 'Payment'}</strong><span>{toFieldValue(payment, ['Date', 'Payment Date'], 'string') as string ?? '—'}</span><small><span className="paid-dot" /> {toFieldValue(payment, ['Status', 'Payment Status'], 'string') as string ?? 'completed'} · GHS {Number(toFieldValue(payment, ['Amount', 'Payment Amount'], 'number') ?? 0).toFixed(2)}</small></div></div>)}</div></>}</div>; }

function AccountScreen({ displayName, email, showToast, signOut }: { displayName: string; email: string; showToast: (message: string) => void; signOut: () => void }) { return <div className="screen-stack"><PageIntro eyebrow="PREFERENCES" title="Settings" copy="Manage your profile and service preferences." /><div className="profile-card"><div className="profile-avatar"><UserRound size={26} /></div><div><strong>{displayName}</strong><p>{email}</p></div><ChevronRight size={18} /></div><div className="settings-list"><SettingRow icon={UserRound} title="Personal details" onClick={() => showToast('Personal details are managed from your account')} /><SettingRow icon={Bell} title="Notifications" onClick={() => showToast('Notifications are on')} /><SettingRow icon={ShieldCheck} title="Security and privacy" onClick={() => showToast('Your account is secure')} /><SettingRow icon={Info} title="About WATSAN" onClick={() => showToast('Tsrukpe Tota WATSAN customer portal')} /></div><button className="signout-button" onClick={signOut}><LogOut size={18} /> Sign out</button></div>; }

function ModalContent({ modal, close, setModal, navigate, onPayment, onLogin, showToast }: { modal: Modal; close: () => void; setModal?: (modal: Modal) => void; navigate?: (screen: Screen) => void; onPayment: () => Promise<boolean>; onLogin: (session: PortalSession) => void; showToast?: (message: string) => void }) {
  const [form, setForm] = useState(initialAuthForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [success, setSuccess] = useState(false);
  const isPay = modal === 'pay';

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!otpSent) {
        const result = await sendCustomerOtp({ meterNumber: form.meterNumber.trim() });
        if (!result.success) throw new Error(result.message || 'We could not send an OTP. Check your meter number.');
        setMaskedPhone(result.maskedPhone ?? 'your registered phone');
        setOtpSent(true);
      } else {
        const result = await verifyCustomerOtp({ meterNumber: form.meterNumber.trim(), code: form.code.trim() });
        if (!result.valid || !result.sessionToken || !result.expiresAt || !result.customer) {
          throw new Error(result.message || 'Invalid or expired code. Please try again.');
        }
        onLogin({
          meterNumber: form.meterNumber.trim(),
          token: result.sessionToken,
          expiresAt: result.expiresAt,
          customer: result.customer,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not complete verification. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async () => {
    setBusy(true);
    setError('');
    try {
      const paid = await onPayment();
      if (!paid) setError('We could not start the payment. Please try again.');
      else setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not start the payment.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className={`modal-card ${success ? 'modal-card--success' : ''}`}><div className="modal-brand"><WatsanMark compact /></div><button className="modal-close" onClick={close} aria-label="Close"><X size={20} /></button>{success ? <><div className="success-check"><Check size={29} /></div><p className="eyebrow">PAYMENT</p><h2>Continue to payment</h2><p className="modal-copy">You are being redirected to Paystack to complete your Mobile Money payment. Your bill will update only after Paystack confirms the transaction.</p><button className="button button--primary" onClick={close}>Close</button></> : <>{isPay ? <><p className="eyebrow">SECURE PAYMENT</p><h2>Pay your bill</h2><p className="modal-copy">Continue to Paystack to pay your outstanding WATSAN water bill using Mobile Money.</p><div className="payment-summary"><span>Payment method</span><strong>Mobile Money</strong><small>Your current outstanding balance will be checked by WATSAN before checkout.</small></div>{error && <div className="form-error">{error}</div>}<button className="button button--primary" onClick={submitPayment} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} {busy ? 'Connecting to Paystack…' : 'Continue to payment'}</button><p className="secure-note"><ShieldCheck size={15} /> Payment is confirmed by Paystack, not by this page</p></> : <form onSubmit={submitAuth}><p className="eyebrow">{otpSent ? 'VERIFY YOUR PHONE' : 'CUSTOMER ACCESS'}</p><h2>{otpSent ? 'Enter your verification code' : 'Access your WATSAN account'}</h2><p className="modal-copy">{otpSent ? `We sent a 6-digit code to ${maskedPhone}. The code expires in 5 minutes.` : 'Enter the meter number already registered with the WATSAN office. You do not need to create a password.'}</p><label>Meter number<input required autoComplete="off" value={form.meterNumber} disabled={otpSent} onChange={(event) => setForm({ ...form, meterNumber: event.target.value })} placeholder="Enter your meter number" /></label>{otpSent && <label>6-digit verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="000000" /></label>}{error && <div className="form-error">{error}</div>}<button className="button button--primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} {busy ? 'Please wait…' : otpSent ? 'Verify and continue' : 'Send verification code'}</button>{otpSent && <button className="text-button" type="button" onClick={() => { setOtpSent(false); setForm({ meterNumber: form.meterNumber, code: '' }); setError(''); }}>Change meter number</button>}</form>}</>}</div></div>;
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
