import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { sendCustomerOtp, verifyCustomerOtp, getCustomerPortalData, logoutCustomerPortal, initializeCustomerPayment, verifyCustomerPayment, initializeDemoPayment, verifyDemoPayment } from '@/lib/zite';
import {
  ArrowRight,
  Bell,
  Camera,
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
  Mail,
  MapPin,
  Menu,
  Moon,
  Sun,
  MessageSquare,
  Plus,
  PhoneCall,
  Phone,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';


type Screen = 'home' | 'help' | 'statements' | 'account' | 'about' | 'notifications' | 'personal' | 'security';
type Modal = 'signin' | 'pay' | 'success' | null;
type ServiceAccount = { id: string; account_number: string; service_address: string; balance: number; due_date: string; status: string };
type Payment = { id: string; amount: number; method: string; status: string; receipt_number: string; created_at: string };
type Bill = { id: string; billing_period: string; amount: number; water_charge: number; meter_fee: number; amount_paid: number; balance: number; previous_reading: number; current_reading: number; units_consumed: number; rate_per_unit: number; status: string; notes: string };
type ZiteField = Record<string, unknown>;
type ZiteCustomerData = {
  customer: ZiteField | null;
  water_readings: ZiteField[];
  payments: ZiteField[];
  error: string | null;
};
const CediIcon = (({ size = 19, color = 'currentColor' }: { size?: number; color?: string }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><text x="12" y="18" textAnchor="middle" fontSize="19" fontWeight="700" fontFamily="Arial, sans-serif" fill={color}>₵</text></svg>) as LucideIcon;

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
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('watsan_theme') === 'dark'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('watsan_theme', darkMode ? 'dark' : 'light'); } catch { /* Theme still works for this session. */ } }, [darkMode]);
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
      setAccount({ id: 'DEMO-001', account_number: 'DEMO-001', service_address: 'Tsrukpe-Tota (Demo Account)', balance: 27, due_date: '2026-11-30', status: 'Demo' });
      setBills([{ id: 'demo-bill-1', billing_period: '2026-11', amount: 127, water_charge: 125, meter_fee: 2, amount_paid: 100, balance: 27, previous_reading: 120, current_reading: 145, units_consumed: 25, rate_per_unit: 5, due_date: '2026-11-30', status: 'part-paid', notes: 'Demo data only — not a real customer bill.' }]);
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
        if (session.isDemo) {
          const result = await verifyDemoPayment({ meterNumber: session.meterNumber, reference });
          if (result.verified) {
            const paidAmount = Number(result.amount ?? 0);
            setBills(current => current.map(bill => bill.id === 'demo-bill-1'
              ? { ...bill, amount_paid: Math.min(bill.amount, bill.amount_paid + paidAmount), balance: Math.max(0, bill.balance - paidAmount), status: bill.balance <= paidAmount ? 'paid' : 'part-paid' }
              : bill));
            setPayments(current => [{ id: reference, amount: paidAmount, method: 'mobile_money', status: 'Test payment successful', receipt_number: result.receiptNumber ?? 'DEMO-RECEIPT', created_at: new Date().toISOString() }, ...current]);
            showToast('Test payment verified — demo account only');
          } else {
            showToast('Test payment not confirmed. No account records were changed.');
          }
        } else {
          const result = await verifyCustomerPayment({ meterNumber: session.meterNumber, sessionToken: session.token, reference });
          if (result.verified) {
            showToast(result.status === 'already_recorded' ? 'Payment already recorded' : 'Payment confirmed successfully');
            await loadCustomerData(session);
          } else {
            showToast('Payment is not yet confirmed. Please refresh in a moment.');
          }
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
      const field = (record: ZiteField, keys: string[], fallback: unknown = null) =>
        toFieldValue(record, keys, 'string') ?? toFieldValue(record, keys, 'number') ?? fallback;
      const numberField = (record: ZiteField, keys: string[], fallback = 0) => {
        const value = toFieldValue(record, keys, 'number');
        return value == null ? fallback : Number(value);
      };
      const outstanding = readings.reduce((sum, item) => {
        const previous = numberField(item, ['Previous Reading', 'previousReading', 'Previous Meter Reading']);
        const current = numberField(item, ['Current Reading', 'currentReading', 'Current Meter Reading']);
        const units = Math.max(0, numberField(item, ['Units Consumed', 'unitsConsumed'], current - previous));
        const rate = numberField(item, ['Rate Per Unit', 'ratePerUnit'], 5);
        const totalValue = field(item, ['Amount Due', 'amountDue', 'Total Amount', 'Bill Amount']);
        const storedTotal = totalValue == null ? units * rate + 2 : Number(totalValue);
        const paid = numberField(item, ['Amount Paid', 'amountPaid', 'Total Paid']);
        return sum + Math.max(0, storedTotal - paid);
      }, 0);
      const latestReading = [...readings].sort((a, b) =>
        String(field(b, ['Reading Month', 'readingMonth', 'Billing Period'], '')).localeCompare(String(field(a, ['Reading Month', 'readingMonth', 'Billing Period'], ''))))[0];
      setAccount({
        id: activeSession.meterNumber,
        account_number: activeSession.meterNumber,
        service_address: String(field(data.customer as ZiteField, ['Location', 'location', 'Service Address'], 'Tsrukpe-Tota')),
        balance: Math.round(outstanding * 100) / 100,
        due_date: String(latestReading ? field(latestReading, ['Reading Month', 'readingMonth', 'Billing Period'], '') : ''),
        status: String(field(data.customer as ZiteField, ['Status', 'status', 'Account Status'], 'Active')),
      });
      setBills(readings.map((item, index) => {
        const previous = numberField(item, ['Previous Reading', 'previousReading', 'Previous Meter Reading']);
        const current = numberField(item, ['Current Reading', 'currentReading', 'Current Meter Reading']);
        const units = Math.max(0, numberField(item, ['Units Consumed', 'unitsConsumed'], current - previous));
        const rate = numberField(item, ['Rate Per Unit', 'ratePerUnit'], 5);
        const waterCharge = units * rate;
        const calculatedTotal = waterCharge + 2;
        const totalValue = field(item, ['Amount Due', 'amountDue', 'Total Amount', 'Bill Amount']);
        const total = totalValue == null ? calculatedTotal : Number(totalValue);
        const meterFee = Math.max(0, total - waterCharge);
        const paid = numberField(item, ['Amount Paid', 'amountPaid', 'Total Paid']);
        const rawStatus = String(field(item, ['Bill Status', 'billStatus', 'Payment Status', 'Status'], 'Unpaid')).trim().toLowerCase();
        return {
          id: String(field(item, ['id', 'ID', 'Record ID'], index)),
          billing_period: String(field(item, ['Reading Month', 'readingMonth', 'Billing Period'], '')),
          amount: total,
          water_charge: waterCharge,
          meter_fee: meterFee,
          due_date: '',
          amount_paid: paid,
          balance: Math.max(0, total - paid),
          previous_reading: previous,
          current_reading: current,
          units_consumed: units,
          rate_per_unit: rate,
          status: rawStatus,
          notes: String(field(item, ['Notes', 'notes'], '')),
        };
      }).sort((a, b) => b.billing_period.localeCompare(a.billing_period)));
      setPayments((data.payments ?? []).map((item, index) => ({
        id: String(field(item, ['id', 'ID', 'Record ID'], index)),
        amount: numberField(item, ['Amount Paid', 'amountPaid', 'Amount', 'Payment Amount']),
        method: (() => { const method = String(field(item, ['Payment Method', 'paymentMethod'], 'Mobile Money')).toLowerCase(); return method.includes('mobile') ? 'mobile_money' : method.includes('cash') ? 'cash' : 'card'; })(),
        status: String(field(item, ['Status', 'status', 'Payment Status'], 'Confirmed')),
        receipt_number: String(field(item, ['Receipt Number', 'receiptNumber'], '')),
        created_at: String(field(item, ['Payment Timestamp', 'paymentTimestamp', 'Payment Date', 'paymentDate'], '')),
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
    { label: 'Transaction history', icon: CediIcon, screen: 'statements' },
    { label: 'My complaints', icon: MessageSquare, screen: 'help' },
    { label: 'About WATSAN', icon: Info, screen: 'about' },
    { label: 'Notifications', icon: Bell, screen: 'notifications' },
  ];
  const displayName = session.customer.fullName || 'WATSAN Customer';

  return <div className={`app-shell portal-shell${darkMode ? " theme-dark" : ""}`}>
    <header className="topbar"><button className="icon-button icon-button--top" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Menu size={22} /></button><WatsanMark compact /><div className="topbar-actions"><button className="theme-toggle" type="button" onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Switch to light mode" : "Switch to dark mode"}><span className="theme-toggle-icon">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</span><span className="theme-toggle-label">{darkMode ? "Light" : "Dark"}</span></button><button className="icon-button icon-button--top" onClick={() => navigate('notifications')} aria-label="Open notifications"><Bell size={19} /><span className="notification-dot" /></button></div></header>
    <main className="portal-content">
      {appError && <div className="error-banner"><Info size={17} /><span>{appError}</span><button onClick={() => void loadCustomerData(session)}>Retry</button></div>}
      {dataLoading && !account ? <div className="loading-card"><LoaderCircle className="spin" size={22} /> Loading your account</div> : <>
        {screen === 'home' && <HomeScreen account={account} payments={payments} bills={bills} ziteData={ziteData} ziteSyncing={ziteSyncing} displayName={displayName} setModal={setModal} showBalance={showBalance} setShowBalance={setShowBalance} navigate={navigate} onRefresh={() => void loadCustomerData(session)} />}
        {screen === 'help' && <HelpScreen account={account} showToast={showToast} session={session} />}
        {screen === 'statements' && <StatementsScreen bills={bills} payments={payments} zitePayments={ziteData?.payments ?? []} showToast={showToast} />}
        {screen === 'account' && <AccountScreen displayName={displayName} email={session.meterNumber} showToast={showToast} signOut={signOut} navigate={navigate} />}
        {screen === 'about' && <AboutScreen />}
        {screen === 'notifications' && <NotificationsScreen navigate={navigate} />}
        {screen === 'personal' && <PersonalDetailsScreen session={session} customer={ziteData?.customer ?? null} />}
        {screen === 'security' && <SecurityScreen session={session} customer={ziteData?.customer ?? null} signOut={signOut} />}
      </>}
    </main>
    <nav className="bottom-nav" aria-label="Main navigation"><NavButton icon={Home} label="Home" active={screen === 'home'} onClick={() => navigate('home')} /><NavButton icon={MessageSquare} label="Help" active={screen === 'help'} onClick={() => navigate('help')} /><NavButton icon={Settings} label="Settings" active={screen === 'account' || screen === 'personal' || screen === 'notifications' || screen === 'security'} onClick={() => navigate('account')} /></nav>
    {drawerOpen && <Drawer close={() => setDrawerOpen(false)} items={menuItems} navigate={navigate} displayName={displayName} email={session.meterNumber} signOut={signOut} />}
    {modal && <ModalContent modal={modal} close={() => setModal(null)} setModal={setModal} navigate={navigate} onLogin={handleLogin} onPayment={async () => {
      if (!session || !account) return false;
      if (session.isDemo) {
        const demoOutstanding = bills.reduce((sum, bill) => sum + Math.max(0, bill.balance), 0);
        if (demoOutstanding <= 0) { showToast('The demo bill has already been paid.'); return false; }
        const result = await initializeDemoPayment({ meterNumber: session.meterNumber, amount: demoOutstanding });
        if (!result.success || !result.authorizationUrl) { showToast(result.error || 'Test payment could not be started'); return false; }
        window.location.assign(result.authorizationUrl);
        return true;
      }
      if (account.balance <= 0) return false;
      const result = await initializeCustomerPayment({ meterNumber: session.meterNumber, sessionToken: session.token, amount: account.balance });
      if (!result.success || !result.authorizationUrl) { showToast(result.error || 'Payment could not be started'); return false; }
      window.location.assign(result.authorizationUrl);
      return true;
    }} />}
    {toast && <div className="toast"><Check size={17} /> {toast}</div>}
  </div>;
}

function Welcome({ modal, setModal, navigate, showToast, onLogin, onDemo }: { modal: Modal; setModal: (modal: Modal) => void; navigate: (screen: Screen) => void; showToast: (message: string) => void; onLogin: (session: PortalSession) => void; onDemo: () => void }) {
  return <div className="app-shell welcome-shell watsan-login-reference watsan-login-professional">
    <div className="watsan-login-glow watsan-login-glow--one" />
    <div className="watsan-login-glow watsan-login-glow--two" />
    <header className="watsan-professional-brand">
      <div className="watsan-professional-logo"><img src={logoPath} alt="Tsrukpe-Tota WATSAN logo" /></div>
      <div className="watsan-brand-caption"><span>TSRUKPE TOTA WATSAN</span></div>
    </header>
    <main className="watsan-professional-main">
      <div className="watsan-customer-access-copy"><h1>CUSTOMER ACCESS</h1><p>Access all WATSAN services</p></div>
      <div className="watsan-professional-actions">
        <button type="button" className="watsan-access-button" onClick={() => setModal('signin')}>Access my account <ArrowRight size={19} /></button>
        <button type="button" className="watsan-demo-button" onClick={onDemo}>Enter demo portal <span>(testing only)</span></button>
      </div>
      <div className="watsan-professional-trust">
        <span><ShieldCheck size={17} /> Meter number + OTP verification</span>
        <i />
        <span><Zap size={17} /> Always available</span>
      </div>
    </main>
    <footer className="watsan-professional-footer">
      <span>Serving Tsrukpe-Tota and surrounding communities</span>
      <a href="tel:+233591189163">WATSAN Office · +233 59 118 9163</a>
    </footer>
    {modal && <ModalContent modal={modal} close={() => setModal(null)} setModal={setModal} navigate={navigate} onLogin={onLogin} onPayment={async () => false} showToast={showToast} />}
  </div>;
}

function HomeScreen({ account, payments, bills, ziteData, ziteSyncing, displayName, setModal, showBalance, setShowBalance, navigate, onRefresh }: { account: ServiceAccount | null; payments: Payment[]; bills: Bill[]; ziteData: ZiteCustomerData | null; ziteSyncing: boolean; displayName: string; setModal: (modal: Modal) => void; showBalance: boolean; setShowBalance: (show: boolean) => void; navigate: (screen: Screen) => void; onRefresh: () => void }) {
  const firstName = displayName.split(' ')[0];
  const latestBill = [...bills].sort((a, b) => b.billing_period.localeCompare(a.billing_period))[0];
  const periodLabel = latestBill ? new Date(`${latestBill.billing_period}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) : '';
  const ziteCustomer = ziteData?.customer;
  const holderName = String(ziteCustomer ? toFieldValue(ziteCustomer, ['Full Name', 'Customer Name', 'Name'], 'string') ?? displayName : displayName);
  const holderPhone = String(ziteCustomer ? toFieldValue(ziteCustomer, ['Phone Number', 'Phone', 'Mobile Number'], 'string') ?? '' : '');
  const holderLocation = String(ziteCustomer ? toFieldValue(ziteCustomer, ['Location', 'Service Address', 'Community'], 'string') ?? account?.service_address ?? 'Tsrukpe-Tota' : account?.service_address ?? 'Tsrukpe-Tota');
  const holderMeter = String(ziteCustomer ? toFieldValue(ziteCustomer, ['Meter Number', 'meterNumber'], 'string') ?? account?.account_number ?? '' : account?.account_number ?? '');
  const latestPayment = [...payments].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const latestPaymentYear = latestPayment?.created_at ? new Date(latestPayment.created_at).getFullYear() : new Date().getFullYear();
  const latestPaymentMethod = latestPayment?.method === 'cash' ? 'Cash Paid' : latestPayment?.method === 'mobile_money' ? 'Mobile Money Paid' : latestPayment ? 'Card Paid' : 'No payment recorded';
  const liveBalance: number = ziteCustomer ? (toFieldValue(ziteCustomer, ['Balance', 'Amount Due', 'Outstanding', 'Current Balance'], 'number') as number | null) ?? (account ? Number(account.balance) : 0) : (account ? Number(account.balance) : 0);
  const liveDueDate = ''; // A reading month is not a confirmed payment deadline.
  const liveStatus = ziteCustomer ? (toFieldValue(ziteCustomer, ['Status', 'Account Status'], 'string') as string ?? account?.status ?? 'active') : account?.status ?? 'active';
  const latestBillPaid = Number(latestBill?.amount_paid ?? 0);
  const latestBillBalance = Number(latestBill?.balance ?? liveBalance);
  const paymentLabel = latestBillBalance <= 0.009 ? 'Fully paid' : latestBillPaid > 0 ? 'Partially paid' : 'Unpaid';
  const paymentClass = latestBillBalance <= 0.009 ? 'account-billing-status--clear' : latestBillPaid > 0 ? 'account-billing-status--partial' : 'account-billing-status--owing';
  const ziteReadings = ziteData?.water_readings ?? [];
  return <div className="screen-stack overview-screen"><section className="greeting-row"><div><h1>Good morning, {firstName}</h1><p className="muted">What would you like to do?</p></div><div className="avatar"><UserRound size={19} /></div></section>{account ? <><section className="balance-card account-holder-card"><div className="account-holder-heading"><span>ACCOUNT HOLDER</span></div><h2>{holderName.toUpperCase()}</h2><div className="account-holder-details"><span><Phone size={14} aria-hidden="true" />{holderPhone || 'Phone number not available'}</span><span><MapPin size={14} aria-hidden="true" />{holderLocation}</span><span><Gauge size={14} aria-hidden="true" />{holderMeter}</span></div><div className="account-holder-payment"><div><small>{latestBillBalance > 0.009 ? 'YOU OWE AN AMOUNT OF' : 'NO OUTSTANDING AMOUNT'}</small><strong>{showBalance ? `GH₵ ${Math.max(0, latestBillBalance).toFixed(2)}` : 'GH₵ ••••'}</strong></div><button className="balance-refresh" onClick={onRefresh} disabled={ziteSyncing} aria-label="Refresh account details" title="Refresh account details">{ziteSyncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}</button></div><div className="account-holder-footer"><span><span className="status-pip" /> Account: {liveStatus}</span><span className={`account-billing-status ${paymentClass}`}>{paymentLabel}</span></div>{ziteData && <div className="zite-sync">{ziteSyncing ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />} {ziteSyncing ? 'Syncing with billing office…' : 'Account synced from WATSAN office'}</div>}</section><section className="account-strip"><div><span className="eyebrow">SERVICE ACCOUNT</span><strong>{account.account_number}</strong><p>{account.service_address}</p></div></section></> : <EmptyAccount />}{account && latestBill && <section className="bill-card"><div className="bill-top"><span className="eyebrow">LATEST OUTSTANDING BILL</span><strong>{periodLabel}</strong></div><div className="bill-amount"><span>Outstanding on this bill</span><strong>GH₵ {Number(latestBill.balance).toFixed(2)}</strong></div><p className="bill-due">Bill amount: GH₵ {Number(latestBill.amount).toFixed(2)} · Paid: GH₵ {Number(latestBill.amount_paid).toFixed(2)}</p><button className="button button--primary" onClick={() => setModal('pay')}>Pay outstanding balance <ArrowRight size={16} /></button></section>}{account && latestBill && <section className="reading-card"><div className="reading-top"><SectionHeading title="Your water consumption" /></div><p className="usage-period">{periodLabel || new Date(`${latestBill.billing_period}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })}</p><div className="usage-highlight"><strong>{latestBill.units_consumed.toLocaleString('en-GH')}</strong><span>units of water consumed</span></div><div className="usage-reading-grid"><div><small>Previous meter reading</small><b>{String(Math.round(latestBill.previous_reading)).padStart(4, '0')}</b></div><div><small>Current meter reading</small><b>{String(Math.round(latestBill.current_reading)).padStart(4, '0')}</b></div><div><small>Rate per unit</small><b>GH₵ {latestBill.rate_per_unit.toFixed(2)}</b></div></div><div className="usage-cost"><span>Water charge ({latestBill.units_consumed} × GH₵ {latestBill.rate_per_unit.toFixed(2)})</span><strong>GH₵ {latestBill.water_charge.toFixed(2)}</strong></div><div className="usage-cost"><span>Monthly meter fee</span><strong>GH₵ {latestBill.meter_fee.toFixed(2)}</strong></div><div className="usage-cost usage-cost--total"><span>Total bill</span><strong>GH₵ {latestBill.amount.toFixed(2)}</strong></div></section>}{account && !latestBill && ziteReadings.length > 0 && <section className="reading-card"><SectionHeading title="Water meter readings" /><div className="reading-list">{ziteReadings.slice(0,3).map((reading,i)=><div className="reading-row" key={i}><GaugeIcon/><span>{String(reading.readingMonth ?? 'Meter reading')}</span><strong>{String(reading.unitsConsumed ?? 0)} units</strong></div>)}</div></section>}{account && <><section><SectionHeading title="Quick access" /><div className="quick-grid"><QuickAction icon={CreditCard} label="Pay bill" onClick={() => setModal('pay')} /><QuickAction icon={FileText} label="Statements" onClick={() => navigate('statements')} /><QuickAction icon={MessageSquare} label="Report an issue" onClick={() => navigate('help')} /><QuickAction icon={Headphones} label="Contact us" onClick={() => navigate('help')} /></div></section><section><SectionHeading title="Recent activity" action="View all" onClick={() => navigate('statements')} /><div className="activity-card">{payments.length ? payments.slice(0, 3).map((payment) => <ActivityRow key={payment.id} icon={CediIcon} title="Bill payment successful" subtitle={`${new Date(payment.created_at).toLocaleDateString('en-GH')} · ${payment.method === 'mobile_money' ? 'Mobile Money' : 'Card'}`} amount={`GH₵ ${Number(payment.amount).toFixed(2)}`} />) : <div className="activity-empty"><CediIcon size={20} /><span>Your payment activity will appear here.</span></div>}</div></section><div className="info-banner"><Lightbulb size={19} /><div><strong>Need help?</strong><p>Our support team is ready to assist you.</p></div><button onClick={() => navigate('help')} aria-label="Open help"><ChevronRight size={18} /></button></div></>}</div>;
}


function AboutScreen() {
  const [selectedAboutCard, setSelectedAboutCard] = useState<{ eyebrow: string; title: string; body: string; detail: string } | null>(null);
  const openAboutCard = (eyebrow: string, title: string, body: string, detail: string) => setSelectedAboutCard({ eyebrow, title, body, detail });
  const closeAboutCard = () => setSelectedAboutCard(null);
  const services = [
    ['Monthly water billing', 'Meter reading, bill preparation and clear account records.'],
    ['New water connections', 'Guidance and support for residents applying for a water connection.'],
    ['Reconnection services', 'Support with restoring service after outstanding bills are settled.'],
    ['Water quality monitoring', 'Community-focused monitoring to help protect safe water supply.'],
    ['Pipe repairs and maintenance', 'Reporting and coordination of repairs to the community water network.'],
    ['Sanitation programmes', 'Promoting cleaner surroundings and responsible sanitation practices.'],
    ['Revenue accountability', 'Transparent collection and record-keeping for community water services.'],
    ['Sanitation levy collection', 'Supporting local sanitation activities through community contributions.'],
  ];
  const team = [
    ['AmeWotse Edwin', 'Committee Chairman'],
    ['Setordzi GodSway', 'Committee Secretary'],
    ['Agbele Faustine', 'Treasurer'],
    ['Agbele Eric', 'Operations Officer'],
    ['Bete Lawrence', 'Operations Officer'],
    ['Anku Laud Ernest', 'Meter Reader'],
    ['Atubra Barnabas', 'Meter Reader'],
    ['Ametonu Rhea', 'Revenue Collector'],
    ['Kpoh Mary', 'Revenue Collector'],
  ];
  return <div className="screen-stack about-screen about-redesign">
    <section className="about-hero">
      <div className="about-hero-copy">
        <span className="about-kicker"><span /> COMMUNITY WATER &amp; SANITATION</span>
        <h1>Serving our community.<br /><em>Protecting every drop.</em></h1>
        <p>Working together to manage reliable water services and promote a cleaner, healthier Tsrukpe-Tota.</p>
        <div className="about-hero-meta"><span><ShieldCheck size={16} /> Community-led service</span><span><Info size={16} /> Local accountability</span></div>
      </div>
      <div className="about-hero-mark"><img src={logoPath} alt="Tsrukpe-Tota WATSAN emblem" /><span>TSRUKPE-TOTA<br />WATER &amp; SANITATION</span></div>
      <div className="about-hero-wave" />
    </section>

    <section className="about-intro-grid about-who-card about-interactive-card" role="button" tabIndex={0} aria-label="Open Who We Are details" onClick={() => openAboutCard('WHO WE ARE','Water services, managed with community at heart.','Tsrukpe-Tota Water and Sanitation (WATSAN) is a community-based organization responsible for managing and delivering water supply and sanitation services to residents of Tsrukpe-Tota.','Our work is rooted in service, responsible management and the belief that access to safe water and a clean environment supports the wellbeing and development of our whole community.')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAboutCard('WHO WE ARE','Water services, managed with community at heart.','Tsrukpe-Tota Water and Sanitation (WATSAN) is a community-based organization responsible for managing and delivering water supply and sanitation services to residents of Tsrukpe-Tota.','Our work is rooted in service, responsible management and the belief that access to safe water and a clean environment supports the wellbeing and development of our whole community.'); } }}>
      <div className="about-section-label"><span>01</span><div><small>WHO WE ARE</small><h2>Water services, managed with community at heart.</h2></div></div>
      <div className="about-intro-copy"><p>Tsrukpe-Tota Water and Sanitation (WATSAN) is a community-based organization responsible for managing and delivering water supply and sanitation services to residents of Tsrukpe-Tota.</p><p>Our work is rooted in service, responsible management and the belief that access to safe water and a clean environment supports the wellbeing and development of our whole community.</p><small className="about-card-hint">Tap to explore <ArrowRight size={13}/></small></div>
    </section>

    <section className="about-purpose-grid">
      <article className="about-purpose-card about-purpose-card--mission about-interactive-card" role="button" tabIndex={0} onClick={() => openAboutCard('OUR MISSION','Reliable services for everyone.','To provide affordable, reliable and sustainable water and sanitation services to the people of Tsrukpe-Tota, contributing to better health and quality of life.','We work towards dependable water delivery, responsible billing and proper sanitation through community participation and accountable management.')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAboutCard('OUR MISSION','Reliable services for everyone.','To provide affordable, reliable and sustainable water and sanitation services to the people of Tsrukpe-Tota, contributing to better health and quality of life.','We work towards dependable water delivery, responsible billing and proper sanitation through community participation and accountable management.'); } }}><div className="about-card-icon"><Zap size={20} /></div><span>OUR MISSION</span><h3>Reliable services for everyone.</h3><p>To provide affordable, reliable and sustainable water and sanitation services to the people of Tsrukpe-Tota, contributing to better health and quality of life.</p><small className="about-card-hint">Tap to explore <ArrowRight size={13}/></small></article>
      <article className="about-purpose-card about-purpose-card--vision about-interactive-card" role="button" tabIndex={0} onClick={() => openAboutCard('OUR VISION','A cleaner, healthier Tsrukpe-Tota.','A community where every resident has consistent access to clean, safe water and proper sanitation, supported by a healthy environment.','Our vision is built on sustainable water infrastructure, good hygiene practices and shared responsibility for protecting community resources.')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAboutCard('OUR VISION','A cleaner, healthier Tsrukpe-Tota.','A community where every resident has consistent access to clean, safe water and proper sanitation, supported by a healthy environment.','Our vision is built on sustainable water infrastructure, good hygiene practices and shared responsibility for protecting community resources.'); } }}><div className="about-card-icon"><ShieldCheck size={20} /></div><span>OUR VISION</span><h3>A cleaner, healthier Tsrukpe-Tota.</h3><p>A community where every resident has consistent access to clean, safe water and proper sanitation, supported by a healthy environment.</p><small className="about-card-hint">Tap to explore <ArrowRight size={13}/></small></article>
    </section>

    <section className="about-services-section">
      <div className="about-section-heading"><div><small>WHAT WE DO</small><h2>Our services</h2></div><p>Organised services covering customer accounts, reliable water supply, community sanitation and responsible management.</p></div>
      <div className="about-service-groups">
        {[
          { title: 'CUSTOMER & CONNECTION SERVICES', copy: 'Helping residents access and manage their water accounts.', items: [0, 1] },
          { title: 'WATER SUPPLY & NETWORK CARE', copy: 'Supporting reliable supply, maintenance and service restoration.', items: [2, 3, 4] },
          { title: 'SANITATION & PUBLIC HEALTH', copy: 'Encouraging a cleaner and healthier community.', items: [5, 7] },
          { title: 'REVENUE & ACCOUNTABILITY', copy: 'Promoting transparent collection and proper records.', items: [6] },
        ].map((group) => <div className="about-service-group" key={group.title}>
          <div className="about-service-group-heading"><span className="about-service-group-mark" /><div><small>{group.title}</small><p>{group.copy}</p></div><span className="about-service-count">{group.items.length} {group.items.length === 1 ? 'SERVICE' : 'SERVICES'}</span></div>
          <div className="about-services-grid">{group.items.map((index) => {
            const [title, copy] = services[index];
            const detail = "This service forms part of the community's water and sanitation management. For current procedures, eligibility or service requests, contact the WATSAN office.";
            return <article className="about-service-item about-interactive-card" key={title} role="button" tabIndex={0} onClick={() => openAboutCard('WATSAN SERVICE', title, copy, detail)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAboutCard('WATSAN SERVICE', title, copy, detail); } }}><span className="about-service-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{copy}</p><small className="about-card-hint">View details <ArrowRight size={13} /></small></div><ArrowRight className="about-service-arrow" size={17} /></article>;
          })}</div>
        </div>)}
      </div>
    </section>

    <section className="about-team-section">
      <div className="about-section-heading"><div><small>PEOPLE BEHIND THE SERVICE</small><h2>Our committee</h2></div><p>Meet the community representatives entrusted with WATSAN leadership, administration and field operations.</p></div>
      <div className="about-team-group">
        <div className="about-team-group-heading"><span className="about-team-group-line" /><div><small>LEADERSHIP &amp; ADMINISTRATION</small><p>Committee leadership</p></div><span className="about-team-count">03 MEMBERS</span></div>
        <div className="about-team-grid about-team-grid--leadership">{team.slice(0,3).map(([name,role],index)=><article className="about-team-member about-team-member--leader about-interactive-card" key={name} role="button" tabIndex={0} onClick={() => openAboutCard('WATSAN COMMITTEE',name,role,'This leadership role supports the oversight, administration and accountable management of community water and sanitation services. Contact the WATSAN office for official enquiries.')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAboutCard('WATSAN COMMITTEE',name,role,'This leadership role supports the oversight, administration and accountable management of community water and sanitation services. Contact the WATSAN office for official enquiries.'); } }}><span className="about-team-initial">{name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase()}</span><div><strong>{name}</strong><small>{role}</small></div><span className="about-team-index">{String(index+1).padStart(2,'0')}</span></article>)}</div>
      </div>
      <div className="about-team-group about-team-group--operations">
        <div className="about-team-group-heading"><span className="about-team-group-line" /><div><small>OPERATIONS &amp; FIELD TEAM</small><p>Service delivery team</p></div><span className="about-team-count">06 MEMBERS</span></div>
        <div className="about-team-grid about-team-grid--operations">{team.slice(3).map(([name,role],index)=><article className="about-team-member about-interactive-card" key={name} role="button" tabIndex={0} onClick={() => openAboutCard('WATSAN COMMITTEE',name,role,'This team role supports the day-to-day delivery and coordination of community water and sanitation services. Contact the WATSAN office for official enquiries.')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAboutCard('WATSAN COMMITTEE',name,role,'This team role supports the day-to-day delivery and coordination of community water and sanitation services. Contact the WATSAN office for official enquiries.'); } }}><span className="about-team-initial">{name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase()}</span><div><strong>{name}</strong><small>{role}</small></div><span className="about-team-index">{String(index+4).padStart(2,'0')}</span></article>)}</div>
      </div>
    </section>

    <section className="about-contact-panel"><div className="about-contact-icon"><Headphones size={23} /></div><div className="about-contact-copy"><small>WE ARE HERE TO HELP</small><h2>Need assistance with your water service?</h2><p>Contact the WATSAN office for account enquiries, service information and support.</p></div><div className="about-contact-actions"><a href="tel:+233591189163"><PhoneCall size={16} /> +233 59 118 9163</a><a href="mailto:watsancommitteetsrukpetota@gmail.com"><Mail size={16} /> Email WATSAN</a></div></section>
    <p className="about-location-note">TSRUKPE-TOTA <span>•</span> NORTH DAYI DISTRICT <span>•</span> VOLTA REGION, GHANA</p>
    {selectedAboutCard && <div className="about-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAboutCard(); }}><section className="about-detail-modal" role="dialog" aria-modal="true" aria-labelledby="about-detail-title"><button className="about-detail-close" type="button" onClick={closeAboutCard} aria-label="Close details"><X size={19}/></button><div className="about-detail-symbol"><ShieldCheck size={25}/></div><small className="about-detail-eyebrow">{selectedAboutCard.eyebrow}</small><h2 id="about-detail-title">{selectedAboutCard.title}</h2><p className="about-detail-body">{selectedAboutCard.body}</p><div className="about-detail-divider"/><p className="about-detail-extra">{selectedAboutCard.detail}</p><button className="about-detail-done" type="button" onClick={closeAboutCard}>Got it <ArrowRight size={16}/></button></section></div>}
  </div>;
}
function EmptyAccount() { return <section className="empty-account"><div className="empty-account-icon"><Info size={23} /></div><div><strong>No billing records found</strong><p>We could not find billing records for this meter. Please contact the WATSAN office to confirm your account details.</p></div></section>; }

function HelpScreen({ account, showToast, session }: { account: ServiceAccount | null; showToast: (message: string) => void; session: PortalSession }) {
  const [formOpen, setFormOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState('water_issue');
  const [submitting, setSubmitting] = useState(false);
  const submitRequest = async (event: FormEvent) => { event.preventDefault(); setSubmitting(true); await new Promise((resolve) => window.setTimeout(resolve, 250)); setSubmitting(false); setFormOpen(false); setDescription(''); showToast('Please call the WATSAN office to submit this request. Online support requests are not connected yet.'); };
  return <div className="screen-stack"><PageIntro eyebrow="SUPPORT" title="How can we help?" copy="Our team is ready to help with your account, payments and water service." /><div className="support-card"><div className="support-icon"><Headphones size={26} /></div><div><strong>Speak to our team</strong><p>Monday — Friday, 8:00 AM to 5:00 PM</p></div><button className="circle-arrow" onClick={() => showToast('Call +233 59 118 9163 for support')}><ArrowRight size={17} /></button></div><div className="support-list"><HelpItem icon={MessageSquare} title="Report a water issue" copy="Tell us about a leak, low pressure or service interruption." onClick={() => setFormOpen(true)} /><HelpItem icon={FileText} title="Request a statement" copy="Get a clear record of your recent water payments." onClick={() => setStatementOpen(true)} /><HelpItem icon={CircleHelp} title="Frequently asked questions" copy="Find quick answers about bills, meters and payments." onClick={() => setFaqOpen((open) => !open)} /></div>{faqOpen && <section className="issue-form faq-panel faq-chat-panel"><div className="section-heading"><div><span className="faq-chat-eyebrow">WATSAN CUSTOMER SUPPORT</span><h2>How can we help?</h2></div><button type="button" onClick={() => setFaqOpen(false)} aria-label="Close frequently asked questions"><X size={18} /></button></div><div className="faq-chat-welcome"><span className="faq-chat-avatar"><Headphones size={18} /></span><div><strong>WATSAN Help Desk</strong><p>Hello! Select a question below and I'll show you the answer.</p></div></div><div className="faq-chat-messages">{[
    ['How is my water bill calculated?', 'Your water charge is calculated using the units consumed multiplied by the tariff of GH₵5 per unit. A monthly meter fee of GH₵2 is added. For example, 5 units cost GH₵25, plus GH₵2 meter fee, giving a total of GH₵27.'],
    ['When is my meter read?', 'Meter readings are normally taken on the 25th of each month. Your bill is prepared using the difference between the previous and current meter readings.'],
    ['When should I pay my water bill?', 'Please pay your bill within 30 days of its issue date to avoid overdue payment and possible service disconnection in line with WATSAN procedures.'],
    ['What do unpaid, partially paid and fully paid mean?', 'Unpaid means no payment has been recorded against the bill. Partially paid means some money has been received but a balance remains. Fully paid means the bill balance has been cleared.'],
    ['How can I check whether my payment was recorded?', 'Open Bills & Payments and check Payment History. A recorded payment should appear there with its date, status and amount. If it does not appear, contact the WATSAN office and keep your payment confirmation.'],
    ['What should I do if my meter reading or bill looks wrong?', 'Contact the WATSAN office and provide your meter number, billing month and the reading or amount you believe is incorrect. Do not alter the meter yourself.'],
    ['How do I apply for a new water connection?', 'Contact the WATSAN office to begin the application. The connection registration fee is GH₵100, and the applicant is responsible for purchasing the required connection materials. Confirm current requirements with the office before making payment.'],
    ['What if I have a leak or no water supply?', 'Call the emergency water line at +233 59 118 9163. Give your location and describe the problem, such as a burst pipe, leak or interruption in supply.']
  ].map(([question, answer], index) => <div className="faq-chat-thread" key={question}><button type="button" className={`faq-question-bubble ${activeFaq === index ? 'is-active' : ''}`} onClick={() => setActiveFaq(activeFaq === index ? null : index)}><span>{question}</span><ChevronRight size={17} /></button>{activeFaq === index && <div className="faq-answer-row"><span className="faq-chat-avatar faq-chat-avatar--small"><Headphones size={14} /></span><div className="faq-answer-bubble"><span className="faq-answer-label">WATSAN HELP DESK</span><p>{answer}</p></div></div>}</div>)}</div><a className="faq-contact-link" href="tel:+233591189163">Still need help? Call +233 59 118 9163</a></section>}{statementOpen && <div className="issue-form statement-request-panel"><div className="section-heading"><h2>Request a statement</h2><button type="button" onClick={() => setStatementOpen(false)} aria-label="Close statement request"><X size={18} /></button></div><p>Request a record of your recent water payments from the WATSAN office. Include your meter number so the team can identify your account.</p><div className="statement-request-account"><small>ACCOUNT METER NUMBER</small><strong>{account?.meter_number || session.meterNumber}</strong></div><a className="button button--primary" href={`mailto:watsancommitteetsrukpetota@gmail.com?subject=${encodeURIComponent("Water payment statement request")}&body=${encodeURIComponent(`Please provide my recent water payment statement.\nMeter number: ${account?.meter_number || session.meterNumber}\nAccount holder: ${account?.customer_name || "Customer"}`)}`}><SendIcon /> Email WATSAN office</a><p className="muted">This opens your email app to send the request. The portal does not submit statement requests directly yet.</p></div>}{formOpen && <form className="issue-form" onSubmit={submitRequest}><div className="section-heading"><h2>Send a request</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={18} /></button></div><label>Request type<select value={requestType} onChange={(event) => setRequestType(event.target.value)}><option value="water_issue">Water issue</option><option value="billing">Billing question</option><option value="other">Other</option></select></label><label>How can we help?<textarea required minLength={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the issue or question" /></label><button className="button button--primary" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <SendIcon />} {submitting ? 'Sending…' : 'Send request'}</button></form>}<div className="contact-panel"><p className="eyebrow">EMERGENCY WATER LINE</p><a className="emergency-phone-link" href="tel:+233591189163" aria-label="Call WATSAN emergency water line at +233 59 118 9163">+233 59 118 9163</a><p>Tap the number to call for urgent leaks and supply concerns.</p></div><span className="sr-only">Signed in as {session.meterNumber}</span></div>;
}

function getBillPaymentState(bill: Pick<Bill, 'amount' | 'amount_paid' | 'balance' | 'status'>): 'paid' | 'partial' | 'unpaid' {
  const total = Math.max(0, Number(bill.amount) || 0);
  const paid = Math.max(0, Number(bill.amount_paid) || 0);
  const balance = Math.max(0, Number(bill.balance) || 0);
  // Use the actual amounts first; fall back to the WATSAN bill-status field
  // when older records do not contain an amount-paid value.
  if (total > 0 && balance <= 0.009) return 'paid';
  if (paid > 0.009 && balance > 0.009) return 'partial';
  const status = String(bill.status || '').trim().toLowerCase();
  if (status.includes('partial')) return 'partial';
  if (status.includes('paid') || status.includes('complete')) return 'paid';
  return 'unpaid';
}

function StatementsScreen({ bills, payments, zitePayments, showToast }: { bills: Bill[]; payments: Payment[]; zitePayments: ZiteField[]; showToast: (message: string) => void }) {
  const hasZitePayments = zitePayments.length > 0;
  const formatPeriod = (value: string) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) : 'Billing period unavailable';
  return <div className="screen-stack"><div className="page-title-row"><PageIntro eyebrow="YOUR RECORDS" title="Bills & Payments" copy="View every monthly water bill, meter reading, outstanding amount and payment." /><button className="mini-icon mini-icon--gold" onClick={() => showToast('Statement request received')} aria-label="Request statement"><Plus size={20} /></button></div><section><SectionHeading title="Monthly bills" /><div className="bill-history-list">{bills.length ? bills.map((bill) => <article className="bill-history-card" key={bill.id}><div className="bill-history-top"><div><strong>{formatPeriod(bill.billing_period)}</strong><span>Monthly water bill</span></div><span className={`bill-status bill-status--${getBillPaymentState(bill) === 'paid' ? 'paid' : getBillPaymentState(bill) === 'partial' ? 'partial' : 'owing'}`}>{getBillPaymentState(bill) === 'paid' ? 'Fully paid' : getBillPaymentState(bill) === 'partial' ? 'Partially paid' : 'Unpaid'}</span></div><div className="bill-reading-grid"><div><small>Previous reading</small><b>{String(Math.round(bill.previous_reading)).padStart(4, '0')}</b></div><div><small>Current reading</small><b>{String(Math.round(bill.current_reading)).padStart(4, '0')}</b></div><div><small>Units used</small><b>{bill.units_consumed}</b></div></div><div className="bill-history-total bill-history-breakdown"><span>Water: GH₵ {bill.water_charge.toFixed(2)} · Meter fee: GH₵ {bill.meter_fee.toFixed(2)}</span><span>Total: GH₵ {bill.amount.toFixed(2)} · Paid: GH₵ {bill.amount_paid.toFixed(2)}</span><strong>Balance: GH₵ {bill.balance.toFixed(2)}</strong></div>{bill.notes && <p className="bill-history-note">{bill.notes}</p>}</article>) : <div className="activity-empty"><Receipt size={20} /><span>No bills have been issued to this account yet. Your next bill will appear here after the WATSAN meter-reading and billing process.</span></div>}</div></section><section><SectionHeading title="Payment history" /><div className="statement-list">{payments.length ? payments.map((payment) => <div className="statement-card" key={payment.id}><div className="statement-icon"><FileText size={20} /></div><div className="statement-details"><strong>Payment receipt</strong><span>{new Date(payment.created_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })} · {payment.receipt_number}</span><small><span className="paid-dot" /> {payment.status} · GH₵ {Number(payment.amount).toFixed(2)}</small></div><button className="download-button" onClick={() => showToast('Receipt download is being prepared')}><Download size={16} /></button></div>) : <div className="activity-empty"><CediIcon size={20} /><span>No payments yet. Your receipts will appear here.</span></div>}</div></section>{hasZitePayments && <><SectionHeading title="Additional payment records" /><div className="statement-list">{zitePayments.map((payment, i) => <div className="statement-card" key={`zite-${i}`}><div className="statement-icon"><FileText size={20} /></div><div className="statement-details"><strong>{toFieldValue(payment, ['Description', 'Type', 'Payment Type'], 'string') as string ?? 'Payment'}</strong><span>{toFieldValue(payment, ['Date', 'Payment Date'], 'string') as string ?? '—'}</span><small><span className="paid-dot" /> {toFieldValue(payment, ['Status', 'Payment Status'], 'string') as string ?? 'completed'} · GH₵ {Number(toFieldValue(payment, ['Amount', 'Payment Amount'], 'number') ?? 0).toFixed(2)}</small></div></div>)}</div></>}</div>; }

function NotificationsScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  return <div className="screen-stack">
    <PageIntro eyebrow="ACCOUNT UPDATES" title="Notifications" copy="Important updates about your water service, bills and payments will appear here." />
    <section className="activity-card notifications-empty">
      <div className="notifications-empty-icon"><Bell size={25} /></div>
      <h2>No notifications yet</h2>
      <p>You are all caught up. New billing reminders, payment confirmations and service announcements will appear here when they are issued.</p>
      <button className="button button--primary" onClick={() => navigate('home')}>Back to overview <ArrowRight size={16} /></button>
    </section>
  </div>;
}


function customerValue(customer: ZiteField | null, keys: string[], fallback = 'Not available') {
  if (!customer) return fallback;
  for (const key of keys) {
    const value = customer[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return fallback;
}

function PersonalDetailsScreen({ session, customer }: { session: PortalSession; customer: ZiteField | null }) {
  const name = session.customer.fullName || customerValue(customer, ['Full Name','fullName','Customer Name','name'], 'WATSAN Customer');
  const phone = customerValue(customer, ['Phone Number','phoneNumber','Phone','phone','Mobile Number','mobileNumber']);
  const address = customerValue(customer, ['Location','location','Address','address','Service Address','serviceAddress'], 'Tsrukpe-Tota');
  const requestBody = encodeURIComponent(`Hello WATSAN Office, I would like to request an update to my customer personal details.\nMeter number: ${session.meterNumber}\nName: ${name}\nRegistered phone: ${phone}\nPlease contact me to verify this request.`);
  return <div className="screen-stack">
    <PageIntro eyebrow="MY PROFILE" title="Personal details" copy="Review the customer information linked to your WATSAN meter account." />
    <section className="profile-details-card">
      <div className="profile-detail-row"><span>Full name</span><strong>{name}</strong></div>
      <div className="profile-detail-row"><span>Meter number</span><strong>{session.meterNumber}</strong></div>
      <div className="profile-detail-row"><span>Registered phone number</span><strong>{phone}</strong></div>
      <div className="profile-detail-row"><span>Service address</span><strong>{address}</strong></div>
      <p className="settings-note">For your protection, these details are read-only. WATSAN must verify and approve changes to your registered information. Your meter number cannot be changed through the customer portal.</p>
    </section>
    <a className="button button--primary settings-contact-button" href={`mailto:watsancommitteetsrukpetota@gmail.com?subject=Request%20to%20update%20customer%20details&body=${requestBody}`}> <Mail size={17}/> Request a details update</a>
  </div>;
}

function SecurityScreen({ session, customer, signOut }: { session: PortalSession; customer: ZiteField | null; signOut: () => void }) {
  const phone = customerValue(customer, ['Phone Number','phoneNumber','Phone','phone','Mobile Number','mobileNumber']);
  const expiry = new Date(session.expiresAt);
  const exportAccountData = () => {
    const payload = { exportedAt: new Date().toISOString(), customerName: session.customer.fullName, meterNumber: session.meterNumber, registeredPhone: phone, sessionExpiresAt: session.expiresAt, note: 'This export contains the profile/session details currently available in this browser. Request official billing records from WATSAN.' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `watsan-account-information-${session.meterNumber}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const reportHref = `mailto:watsancommitteetsrukpetota@gmail.com?subject=Suspicious%20account%20activity&body=${encodeURIComponent(`Hello WATSAN, I want to report suspicious activity on my customer account. Meter number: ${session.meterNumber}. Please contact me to verify my identity.`)}`;
  return <div className="screen-stack">
    <PageIntro eyebrow="ACCOUNT PROTECTION" title="Security & privacy" copy="Understand how your account is protected and manage access on this device." />
    <section className="security-status-card"><div className="security-status-icon"><ShieldCheck size={23}/></div><div><strong>OTP-protected access</strong><p>Your account is accessed using a one-time verification code sent to your registered phone.</p></div></section>
    <section className="profile-details-card">
      <div className="profile-detail-row"><span>Verification phone</span><strong>{phone}</strong></div>
      <div className="profile-detail-row"><span>Current session</span><strong>Signed in on this device</strong></div>
      <div className="profile-detail-row"><span>Session expiry</span><strong>{Number.isNaN(expiry.getTime()) ? 'Not available' : expiry.toLocaleString('en-GH')}</strong></div>
      <div className="profile-detail-row"><span>Password</span><strong>Not used — OTP login</strong></div>
      <p className="settings-note">This portal currently shows the session active in this browser only. It does not yet provide a list of other devices or a remote “sign out all devices” control.</p>
    </section>
    <div className="security-actions">
      <button className="setting-row" onClick={exportAccountData}><span><Download size={18}/></span><strong>Download available account information</strong><ChevronRight size={17}/></button>
      <a className="setting-row security-link" href={reportHref}><span><ShieldCheck size={18}/></span><strong>Report suspicious activity</strong><ChevronRight size={17}/></a>
      <button className="setting-row security-signout" onClick={signOut}><span><LogOut size={18}/></span><strong>Sign out of this device</strong><ChevronRight size={17}/></button>
    </div>
  </div>;
}

function AccountScreen({ displayName, email, showToast, signOut, navigate }: { displayName: string; email: string; showToast: (message: string) => void; signOut: () => void; navigate: (screen: Screen) => void }) {
  const photoKey = `watsan_profile_photo_${email}`;
  const [photo, setPhoto] = useState(() => {
    try { return localStorage.getItem(photoKey) || ''; } catch { return ''; }
  });
  const [photoError, setPhotoError] = useState('');
  const handlePhoto = (event: { target: HTMLInputElement }) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoError('Please select an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoError('Please choose an image smaller than 8 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 360 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) { setPhotoError('Could not process this image.'); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.76);
        try {
          localStorage.setItem(photoKey, compressed);
          setPhoto(compressed);
          setPhotoError('');
          showToast('Profile picture saved on this device');
        } catch {
          setPhotoError('Browser storage is full. Try a smaller picture.');
        }
      };
      image.onerror = () => setPhotoError('Could not open this image.');
      image.src = String(reader.result);
    };
    reader.onerror = () => setPhotoError('Could not read this image.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  const removePhoto = () => {
    try { localStorage.removeItem(photoKey); setPhoto(''); setPhotoError(''); showToast('Profile picture removed'); }
    catch { setPhotoError('Could not remove the picture.'); }
  };
  return <div className="screen-stack">
    <PageIntro eyebrow="CUSTOMER PROFILE" title="Profile management" copy="Manage your profile picture and account preferences." />
    <section className="profile-card profile-card--managed">
      <div className="managed-avatar-wrap">
        <div className="managed-avatar">{photo ? <img src={photo} alt="Your profile" /> : <UserRound size={34} />}</div>
        <label className="managed-avatar-upload" htmlFor="watsan-customer-photo" aria-label="Upload profile picture"><Camera size={16} /></label>
        <input id="watsan-customer-photo" type="file" accept="image/*" onChange={handlePhoto} hidden />
      </div>
      <div className="managed-profile-copy"><strong>{displayName}</strong><p>Meter number: {email}</p><label className="managed-upload-link" htmlFor="watsan-customer-photo">Upload or change picture</label>{photo && <button className="managed-remove-link" type="button" onClick={removePhoto}>Remove picture</button>}</div>
      <ChevronRight size={18} />
    </section>
    {photoError && <p className="form-error" role="alert">{photoError}</p>}
    <p className="settings-note">Your picture is currently saved in this browser on this device. It is not yet synchronised with the WATSAN management database.</p>
    <div className="settings-list"><SettingRow icon={UserRound} title="Personal details" onClick={() => navigate('personal')} /><SettingRow icon={Bell} title="Notifications" onClick={() => navigate('notifications')} /><SettingRow icon={ShieldCheck} title="Security and privacy" onClick={() => navigate('security')} /><SettingRow icon={Info} title="About WATSAN" onClick={() => navigate('about')} /></div>
    <button className="signout-button" onClick={signOut}><LogOut size={18} /> Sign out</button>
  </div>;
}

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

  return <div className={`modal-backdrop ${isPay ? 'modal-backdrop--payment' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className={`modal-card ${success ? 'modal-card--success' : ''} ${isPay ? 'modal-card--payment' : ''} ${!isPay && !success ? 'modal-card--auth' : ''}`}><div className="modal-brand"><WatsanMark compact /></div><button className="modal-close" onClick={close} aria-label="Close"><X size={20} /></button>{success ? <><div className="success-check"><Check size={29} /></div><p className="eyebrow">PAYMENT</p><h2>Continue to payment</h2><p className="modal-copy">You are being redirected to Paystack to complete your Mobile Money payment. Your bill will update only after Paystack confirms the transaction.</p><button className="button button--primary" onClick={close}>Close</button></> : <>{isPay ? <><p className="eyebrow">SECURE PAYMENT</p><h2>Pay your bill</h2><p className="modal-copy">Continue to Paystack to pay your outstanding WATSAN water bill using Mobile Money.</p><div className="payment-summary"><span>Payment method</span><strong>Mobile Money</strong><small>Your current outstanding balance will be checked by WATSAN before checkout.</small></div>{error && <div className="form-error">{error}</div>}<button className="button button--primary" onClick={submitPayment} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} {busy ? 'Connecting to Paystack…' : 'Continue to payment'}</button><p className="secure-note"><ShieldCheck size={15} /> Payment is confirmed by Paystack, not by this page</p></> : <form onSubmit={submitAuth}><p className="eyebrow">{otpSent ? 'VERIFY YOUR PHONE' : 'CUSTOMER ACCESS'}</p><h2>{otpSent ? 'Enter your verification code' : 'Access all WATSAN services'}</h2><p className="modal-copy">{otpSent ? `We sent a 6-digit code to ${maskedPhone}. The code expires in 5 minutes.` : 'Sign in to view your water bills, make payments and contact the Tsrukpe-Tota WATSAN team.'}</p><label>Meter number<input required autoComplete="off" value={form.meterNumber} disabled={otpSent} onChange={(event) => setForm({ ...form, meterNumber: event.target.value })} placeholder="Enter your meter number" /></label>{otpSent && <label>6-digit verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="000000" /></label>}{error && <div className="form-error">{error}</div>}<button className="button button--primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} {busy ? 'Please wait…' : otpSent ? 'Verify and continue' : 'Send verification code'}</button>{otpSent && <button className="text-button" type="button" onClick={() => { setOtpSent(false); setForm({ meterNumber: form.meterNumber, code: '' }); setError(''); }}>Change meter number</button>}</form>}</>}</div></div>;
}

function Drawer({ close, items, navigate, displayName, email, signOut }: { close: () => void; items: MenuItem[]; navigate: (screen: Screen) => void; displayName: string; email: string; signOut: () => void }) { const photo = (() => { try { return localStorage.getItem(`watsan_profile_photo_${email}`) || ''; } catch { return ''; } })(); return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="drawer"><div className="drawer-head"><WatsanMark compact /><button className="icon-button" onClick={close} aria-label="Close menu"><X size={20} /></button></div><div className="drawer-profile"><div className="avatar avatar--large">{photo ? <img className="drawer-avatar-image" src={photo} alt="Customer profile" /> : <UserRound size={22} />}</div><div><strong>{displayName}</strong><span>Signed-in WATSAN customer</span></div></div><div className="drawer-items">{items.map((item) => <button className="drawer-item" key={item.label} onClick={() => { if (item.screen) navigate(item.screen); else item.action?.(); close(); }}><item.icon size={19} /><span>{item.label}</span><ChevronRight size={16} /></button>)}</div><div className="drawer-bottom"><button className="drawer-item" onClick={() => { navigate('account'); close(); }}><Settings size={19} /><span>Settings</span><ChevronRight size={16} /></button><button className="drawer-item drawer-item--muted" onClick={signOut}><LogOut size={19} /><span>Sign out</span></button></div></aside></div>; }

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
