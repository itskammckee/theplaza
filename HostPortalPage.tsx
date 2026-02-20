//HostPortalPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useAuth } from 'zite-auth-sdk';
import {
  getHostsByEmail,
  GetHostsByEmailOutputType,
  getAccountLedger,
  GetAccountLedgerOutputType,
  getDocumentTemplates,
  GetDocumentTemplatesOutputType,
} from 'zite-endpoints-sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  DollarSign,
  CreditCard,
  FileText,
  ExternalLink,
  Building2,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Package,
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileIcon,
  Download,
} from 'lucide-react';
import { formatCurrency, formatDate, formatPhoneNumber } from '@/lib/formatters';
import { getDisplayFilename } from '@/lib/fileUtils';
import { formatTimeRange } from '@/lib/eventTimeUtils';
import HostPortalHeader from '@/components/HostPortalHeader';
import EditHostProfileDialog from '@/components/EditHostProfileDialog';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { FilloutPopupEmbed } from '@fillout/react';
import { toast } from 'sonner';

type Event = GetHostsByEmailOutputType['hosts'][0];
type LedgerEntry = GetAccountLedgerOutputType['ledger'][0];
type DocumentTemplate = GetDocumentTemplatesOutputType['templates'][0];

export default function HostPortalPage() {
  const { user } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [eventBalances, setEventBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingEventDetails, setLoadingEventDetails] = useState(false);

  const [showContactForm, setShowContactForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showScheduleShowing, setShowScheduleShowing] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const [documents, setDocuments] = useState<DocumentTemplate[]>([]);
  const [activeSection, setActiveSection] = useState('balance-section');
  const [isScrolling, setIsScrolling] = useState(false);
  const [sortColumn, setSortColumn] = useState<'eventType' | 'eventDate' | 'balance' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { refreshKey } = useDataRefresh();

  const sectionRefs = {
    'balance-section': useRef<HTMLDivElement>(null),
    'contact-section': useRef<HTMLDivElement>(null),
    'event-details-section': useRef<HTMLDivElement>(null),
    'contract-section': useRef<HTMLDivElement>(null),
    'documents-section': useRef<HTMLDivElement>(null),
    'ledger-section': useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    if (user?.email) {
      loadHostData();
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshKey]);

  const loadDocuments = async () => {
    try {
      const result = await getDocumentTemplates({});
      const hostPortalDocs = result.templates.filter((doc) => doc.showInHostPortal === true);
      setDocuments(hostPortalDocs);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  useEffect(() => {
    if (!selectedEvent) return;

    const handleScroll = () => {
      if (isScrolling) return;

      const scrollPosition = window.scrollY + window.innerHeight / 3;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const currentScroll = window.scrollY;

      if (currentScroll >= maxScroll - 50) {
        const lastSection = Object.entries(sectionRefs)
          .reverse()
          .find(([_, ref]) => ref.current);
        if (lastSection) {
          setActiveSection(lastSection[0]);
          return;
        }
      }

      let closestSection = '';
      let closestDistance = Infinity;

      for (const [id, ref] of Object.entries(sectionRefs)) {
        if (ref.current) {
          const { offsetTop, offsetHeight } = ref.current;
          const sectionMiddle = offsetTop + offsetHeight / 2;
          const distance = Math.abs(scrollPosition - sectionMiddle);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestSection = id;
          }
        }
      }

      if (closestSection) {
        setActiveSection(closestSection);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [selectedEvent, isScrolling, sectionRefs]);

  const retryWithDelay = async <T,>(
    fn: () => Promise<T>,
    retries: number = 2,
    delay: number = 1000
  ): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return retryWithDelay(fn, retries - 1, delay);
      }
      throw error;
    }
  };

  const loadHostData = async () => {
    if (!user?.email) return;
    try {
      const eventsResult = await getHostsByEmail({ email: user.email });
      const sortedEvents = eventsResult.hosts.sort((a, b) => {
        if (!a.eventDate || !b.eventDate) return 0;
        return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
      });

      setEvents(sortedEvents);

      const balances: Record<string, number> = {};

      for (const event of sortedEvents) {
        if (event.id) {
          try {
            const ledgerResult = await retryWithDelay(
              () =>
                getAccountLedger({
                  hostId: event.id,
                }),
              2,
              1000
            );
            const balance = calculateBalanceFromLedger(ledgerResult.ledger || []);
            balances[event.id] = balance;
          } catch (error) {
            console.error('Error loading ledger for event:', event.id, error);
            balances[event.id] = 0;
          }
        }
      }

      setEventBalances(balances);

      if (sortedEvents.length === 1) {
        selectEvent(sortedEvents[0]);
      }
    } catch (error) {
      console.error('Error loading host data:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectEvent = async (event: Event) => {
    setLoadingEventDetails(true);
    setSelectedEvent(event);

    if (event.id) {
      try {
        const ledgerResult = await retryWithDelay(
          () =>
            getAccountLedger({
              hostId: event.id,
            }),
          2,
          1000
        );
        const sortedLedger = (ledgerResult.ledger || []).sort((a, b) => {
          if (!a.created || !b.created) return 0;
          return new Date(a.created).getTime() - new Date(b.created).getTime();
        });
        setLedger(sortedLedger);
      } catch (error) {
        console.error('Error loading ledger:', error);
      } finally {
        setLoadingEventDetails(false);
      }
    } else {
      setLoadingEventDetails(false);
    }
  };

  const calculateBalanceFromLedger = (ledgerEntries: LedgerEntry[]) => {
    const charges = ledgerEntries
      .filter((e) => e.paymentType === 'Charge' || e.paymentType === 'Cleaning Fee')
      .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);

    const payments = ledgerEntries
      .filter(
        (e) =>
          e.paymentType === 'Rental Payment' ||
          e.paymentType === 'Deposit Applied' ||
          e.paymentType === 'Recorded Payment'
      )
      .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);

    const discounts = ledgerEntries
      .filter((e) => e.paymentType === 'Discount')
      .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0);

    return charges - payments - discounts;
  };

  const calculateTotals = () => {
    const balance = calculateBalanceFromLedger(ledger);
    return {
      totalCharges: ledger
        .filter((e) => e.paymentType === 'Charge' || e.paymentType === 'Cleaning Fee')
        .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0),
      totalPayments: ledger
        .filter(
          (e) =>
            e.paymentType === 'Rental Payment' ||
            e.paymentType === 'Deposit Applied' ||
            e.paymentType === 'Recorded Payment'
        )
        .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0),
      totalDiscounts: ledger
        .filter((e) => e.paymentType === 'Discount')
        .reduce((sum, e) => sum + Math.abs(e.amount || 0), 0),
      balance,
    };
  };

  const getAccountStatus = (balance: number, originalStatus?: string) => {
    if (balance <= 0) return 'Paid';
    return originalStatus || 'Open';
  };

  const getBalanceDueDate = (eventDate?: string) => {
    if (!eventDate) return undefined;
    const event = new Date(eventDate);
    const dueDate = new Date(event);
    dueDate.setDate(dueDate.getDate() - 30);
    return dueDate.toISOString();
  };

  const isBalancePastDue = (eventDate?: string, balance?: number) => {
    if (!eventDate || !balance || balance <= 0) return false;
    const dueDate = getBalanceDueDate(eventDate);
    if (!dueDate) return false;
    const dueDateObj = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDateObj.setHours(0, 0, 0, 0);
    return today > dueDateObj;
  };

  const scrollToSection = (sectionId: string) => {
    const ref = sectionRefs[sectionId as keyof typeof sectionRefs];
    if (ref?.current) {
      setIsScrolling(true);
      setActiveSection(sectionId);
      const headerOffset = 120;
      const elementPosition = ref.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setTimeout(() => {
        setIsScrolling(false);
      }, 1000);
    }
  };

  const handleSort = (column: 'eventType' | 'eventDate' | 'balance') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedEvents = () => {
    if (!sortColumn) return events;
    const sorted = [...events].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'eventType':
          aValue = (a.eventType || '').toLowerCase();
          bValue = (b.eventType || '').toLowerCase();
          break;
        case 'eventDate':
          aValue = a.eventDate ? new Date(a.eventDate).getTime() : 0;
          bValue = b.eventDate ? new Date(b.eventDate).getTime() : 0;
          break;
        case 'balance':
          aValue = eventBalances[a.id || ''] || 0;
          bValue = eventBalances[b.id || ''] || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const getSortIcon = (column: 'eventType' | 'eventDate' | 'balance') => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  if (loading) {
    return (
      <>
        <HostPortalHeader />
        <div className="pt-20 flex min-h-screen">
          <div className="flex-1 p-8 space-y-4">
            <Skeleton className="h-10 w-48" />
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!selectedEvent && events.length > 1) {
    return (
      <>
        <HostPortalHeader />

        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5" />
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] w-[600px] h-[600px]">
            <img
              src="https://images.fillout.com/orgid-307596/flowpublicid-o2ythqaqmm/widgetid-default/2ptBPTBWQrwep8bhsz8VqJ/pasted-image-1764713847054.png"
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <div className="pt-24 sm:pt-32 p-4 sm:p-10 space-y-6 sm:space-y-8 max-w-7xl mx-auto relative">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-8">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-accent flex-shrink-0" />
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    Welcome, {user?.name || 'Host'}
                  </h2>
                </div>
                <p className="text-sm sm:text-base text-muted-foreground pl-8">
                  Select an event to view full details
                </p>
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-accent/50 via-accent/20 to-transparent" />
          </div>

          <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-lg overflow-hidden">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-muted/80 to-muted/50 border-b-2 border-border/40">
                  <tr>
                    <th
                      className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none group"
                      onClick={() => handleSort('eventType')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Event</span>
                        <span
                          className={
                            sortColumn === 'eventType' ? 'text-accent' : 'group-hover:opacity-100'
                          }
                        >
                          {getSortIcon('eventType')}
                        </span>
                      </div>
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider max-lg:hidden">
                      Package
                    </th>
                    <th
                      className="text-right px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none group"
                      onClick={() => handleSort('balance')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Balance</span>
                        <span
                          className={
                            sortColumn === 'balance' ? 'text-accent' : 'group-hover:opacity-100'
                          }
                        >
                          {getSortIcon('balance')}
                        </span>
                      </div>
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider max-lg:hidden">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {getSortedEvents().map((event) => {
                    const balance = eventBalances[event.id || ''] || 0;
                    const accountStatus = getAccountStatus(balance, event.accountStatus);
                    const isPastDue = isBalancePastDue(event.eventDate, balance);

                    return (
                      <tr
                        key={event.id}
                        onClick={() => selectEvent(event)}
                        className="cursor-pointer transition-all duration-200 hover:bg-accent/5 group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center group-hover:from-accent/30 group-hover:to-accent/20 transition-all">
                              <Calendar className="h-5 w-5 text-accent" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm">
                                {event.eventType || 'Event'}
                              </div>
                              {event.eventDate && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {formatDate(event.eventDate)}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 max-lg:hidden">
                          {event.package ? (
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">{event.package}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <DollarSign
                              className={`h-4 w-4 ${
                                isPastDue && balance > 0
                                  ? 'text-destructive'
                                  : balance > 0
                                  ? 'text-muted-foreground'
                                  : 'text-accent'
                              }`}
                            />
                            <span
                              className={`text-base font-bold ${
                                isPastDue && balance > 0
                                  ? 'text-destructive'
                                  : balance > 0
                                  ? 'text-foreground'
                                  : balance < 0
                                  ? 'text-green-600'
                                  : 'text-accent'
                              }`}
                            >
                              {formatCurrency(balance)}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 max-lg:hidden">
                          <div className="flex items-center justify-center gap-2">
                            <Badge
                              variant={accountStatus === 'Paid' ? 'default' : 'outline'}
                              className={`px-2.5 py-1 text-xs font-medium ${
                                accountStatus === 'Paid'
                                  ? 'bg-accent text-accent-foreground shadow-sm'
                                  : 'border-border/60'
                              }`}
                            >
                              {accountStatus === 'Paid' && (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              )}
                              {accountStatus}
                            </Badge>
                            {isPastDue && balance > 0 && (
                              <Badge
                                variant="destructive"
                                className="px-2.5 py-1 text-xs font-medium"
                              >
                                Past Due
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>Click any event to view full details and make payments</span>
          </div>
        </div>
      </>
    );
  }

  if (events.length === 0) {
    return (
      <>
        <HostPortalHeader />
        <div className="pt-20 space-y-6 sm:space-y-8 p-4 sm:p-10 max-w-7xl mx-auto">
          <div>
            <h2 className="text-3xl font-bold">Welcome, {user?.name || 'Host'}</h2>
            <p className="text-muted-foreground mt-2">You don't have any events yet</p>
          </div>

          <Card className="text-center py-16 border-border/40 bg-card/50 backdrop-blur-sm">
            <CardContent>
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Ready to host an event?</h3>
              <p className="text-muted-foreground mb-6">Contact The Plaza to get started</p>
              <Button
                onClick={() => setShowContactForm(true)}
                size="lg"
                className="bg-accent hover:bg-accent/90"
              >
                <Building2 className="h-4 w-4 mr-2" />
                Contact The Plaza
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Contact Form (no events yet) */}
        {showContactForm && (
          <FilloutPopupEmbed
            key="contact-no-events"
            filloutId="owhCPoH5hwus"
            isOpen={showContactForm}
            onClose={() => setShowContactForm(false)}
            parameters={{
              fname: user?.name?.split(' ')[0] || '',
              lname: user?.name?.split(' ').slice(1).join(' ') || '',
              phone: '',
              email: user?.email || '',
            }}
          />
        )}
      </>
    );
  }

  const totals = calculateTotals();
  const balance = totals.balance;
  const accountStatus = getAccountStatus(balance, selectedEvent?.accountStatus);
  const balanceDueDate = getBalanceDueDate(selectedEvent?.eventDate);
  const isPastDue = isBalancePastDue(selectedEvent?.eventDate, balance);

  const navItems = [
    { id: 'balance-section', label: 'Balance' },
    { id: 'contact-section', label: 'Contact' },
    { id: 'event-details-section', label: 'Details' },
    ...(selectedEvent?.contract && selectedEvent.contract.length > 0
      ? [{ id: 'contract-section', label: 'Contract' }]
      : []),
    ...(documents.length > 0 ? [{ id: 'documents-section', label: 'Documents' }] : []),
    { id: 'ledger-section', label: 'Ledger' },
  ];

  // ---------- FILL OUT PARAM OBJECTS (IMPORTANT) ----------

  const paymentParams = {
    balance: (balance ?? 0).toString(),
    email: selectedEvent?.email ?? user?.email ?? '',
    name: selectedEvent?.fullName ?? user?.name ?? '',
    phone: selectedEvent?.phoneNumber ?? '',
    id: selectedEvent?.id ?? '',
  };

  const contactParams = {
    fname: selectedEvent?.fullName?.split(' ')[0] ?? user?.name?.split(' ')[0] ?? '',
    lname:
      selectedEvent?.fullName?.split(' ').slice(1).join(' ') ??
      user?.name?.split(' ').slice(1).join(' ') ??
      '',
    phone: selectedEvent?.phoneNumber ?? '',
    email: selectedEvent?.email ?? user?.email ?? '',
    id: selectedEvent?.id ?? '',
  };

    // ---------- FILL OUT PARAMS FOR "SCHEDULE SHOWING" ----------
  // These keys MUST match the URL parameters you set in Fillout:
  // hostname, hostemail, eventdate

  const scheduleShowingParams =
    selectedEvent || user
      ? {
          hostname: String(selectedEvent?.fullName ?? user?.name ?? ''),
          hostemail: String(selectedEvent?.email ?? user?.email ?? ''),
          // send just YYYY-MM-DD for the date
          eventdate: selectedEvent?.eventDate
            ? new Date(selectedEvent.eventDate).toISOString().slice(0, 10)
            : '',
        }
      : undefined;


  // ---------- CLOSE HANDLERS WITH REFRESH ----------

  const handleClosePaymentForm = () => {
    setShowPaymentForm(false);
    // Refresh host data & ledger for the current event
    loadHostData();
    if (selectedEvent) {
      selectEvent(selectedEvent);
    }
  };

  return (
    <>
      <HostPortalHeader />

      {loadingEventDetails && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/20 border-t-primary mx-auto" />
              <Sparkles className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold">Loading Event Details</p>
              <p className="text-sm text-muted-foreground">
                Please wait while we fetch your information...
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] w-[600px] h-[600px]">
          <img
            src="https://images.fillout.com/orgid-307596/flowpublicid-o2ythqaqmm/widgetid-default/2ptBPTBWQrwep8bhsz8VqJ/pasted-image-1764713847054.png"
            alt=""
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      <div className="pt-28 flex min-h-screen relative">
        <div className="hidden lg:block w-72 p-8 space-y-6 sticky top-24 self-start">
          {events.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start border-border/60 hover:bg-accent/10 hover:text-accent hover:border-accent transition-all"
              onClick={() => setSelectedEvent(null)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              See All Events
            </Button>
          )}

          <div className="space-y-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`w-full text-left px-5 py-3 rounded-lg text-sm font-medium transition-all relative ${
                  activeSection === item.id
                    ? 'text-accent bg-accent/10 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/5'
                }`}
              >
                {activeSection === item.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full" />
                )}
                <span className={activeSection === item.id ? 'ml-2' : ''}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 px-4 sm:px-8 lg:px-12 pb-16 space-y-8 lg:space-y-12 w-full max-w-6xl mx-auto">
          {events.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden mb-4"
              onClick={() => setSelectedEvent(null)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Events
            </Button>
          )}

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-4">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-accent flex-shrink-0" />
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text truncate">
                    {selectedEvent?.fullName || 'Event'}
                  </h1>
                </div>
                {selectedEvent?.eventDate && (
                  <div className="flex items-center gap-2 text-sm sm:text-base text-muted-foreground pl-8">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">
                      {formatDate(selectedEvent.eventDate)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-accent/50 via-accent/20 to-transparent" />
          </div>

          {/* BALANCE SECTION */}
          <div ref={sectionRefs['balance-section']}>
            <Card
              className={`border-2 transition-all duration-300 shadow-lg hover:shadow-xl ${
                balance > 0
                  ? isPastDue
                    ? 'border-destructive/50 bg-gradient-to-br from-destructive/5 to-card'
                    : 'border-border/40 bg-gradient-to-br from-card to-card/50'
                  : 'border-accent/50 bg-gradient-to-br from-accent/10 to-card shadow-accent/10'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                  <CardTitle className="text-sm sm:text-base font-semibold text-muted-foreground uppercase tracking-wider">
                    Event Balance
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={`text-3xl sm:text-4xl font-bold tracking-tight ${
                    isPastDue && balance > 0
                      ? 'text-destructive'
                      : balance > 0
                      ? 'text-foreground'
                      : balance < 0
                      ? 'text-green-600'
                      : 'text-accent'
                  }`}
                >
                  {formatCurrency(balance)}
                </div>
                <div className="space-y-2">
                  {balanceDueDate && balance > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar
                        className={`h-4 w-4 ${
                          isPastDue ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      />
                      <span
                        className={`font-medium ${
                          isPastDue ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        Due: {formatDate(balanceDueDate)}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Badge
                      variant={accountStatus === 'Paid' ? 'default' : 'outline'}
                      className={`px-3 py-1 text-sm font-medium ${
                        accountStatus === 'Paid'
                          ? 'bg-accent text-accent-foreground shadow-sm'
                          : 'border-border/60'
                      }`}
                    >
                      {accountStatus === 'Paid' && (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      )}
                      {accountStatus}
                    </Badge>
                    {isPastDue && balance > 0 && (
                      <Badge
                        variant="destructive"
                        className="px-3 py-1 text-sm font-medium shadow-sm"
                      >
                        Past Due
                      </Badge>
                    )}
                  </div>
                </div>
                {balance > 0 && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg border border-border/40 bg-[#fafafa]">
                      <p className="text-sm font-medium mb-2">Ready to Make a Payment?</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Use our secure payment portal to pay your balance online with credit
                        card or bank transfer.
                      </p>
                      <Button
                        onClick={() => {
                          if (!selectedEvent) {
                            toast.error('Please select an event first.');
                            return;
                          }
                          setShowPaymentForm(true);
                        }}
                        size="lg"
                        className="w-full bg-accent hover:bg-accent/90 shadow-md hover:shadow-lg transition-all text-[#000000]"
                      >
                        <CreditCard className="h-5 w-5 mr-2" />
                        Make a Payment
                      </Button>
                    </div>

                    {selectedEvent?.eventDate &&
                      new Date(selectedEvent.eventDate) > new Date() && (
                        <div className="p-4 rounded-lg border border-border/40 bg-[#ffffff]">
                          <p className="text-sm font-medium mb-2">Schedule a Showing</p>
                          <p className="text-xs text-muted-foreground mb-3">
                            Need a second walkthrough or want to show the space to your
                            vendors?
                          </p>
                          <Button
                            onClick={() => setShowScheduleShowing(true)}
                            variant="outline"
                            size="lg"
                            className="w-full border-accent/40 hover:bg-accent/10 hover:text-accent hover:border-accent"
                          >
                            <Calendar className="h-5 w-5 mr-2" />
                            Schedule Showing
                          </Button>
                        </div>
                      )}

                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground text-center">
                        Need help?{' '}
                        <button
                          onClick={() => setShowContactForm(true)}
                          className="text-accent hover:underline font-medium"
                        >
                          Contact us
                        </button>
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-4 py-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <Sparkles className="h-4 w-4 text-muted-foreground/50" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* CONTACT SECTION */}
          <Card
            ref={sectionRefs['contact-section']}
            className="border-border/40 bg-card/50 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
          >
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                  <CardTitle className="text-sm sm:text-base font-semibold text-muted-foreground uppercase tracking-wider">
                    Contact Information
                  </CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEditProfile(true)}
                  className="border-accent/40 hover:bg-accent/10 hover:text-accent hover:border-accent transition-all w-full sm:w-auto"
                >
                  Edit Profile
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </p>
                  <p className="text-base font-medium">
                    {selectedEvent?.email || 'Not provided'}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    Phone
                  </p>
                  <p className="text-base font-medium">
                    {selectedEvent?.phoneNumber
                      ? formatPhoneNumber(selectedEvent.phoneNumber)
                      : 'Not provided'}
                  </p>
                </div>
                {selectedEvent?.companyName && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      Company
                    </p>
                    <p className="text-base font-medium">{selectedEvent.companyName}</p>
                  </div>
                )}
                {selectedEvent?.mailingAddress && (
                  <div className="md:col-span-2 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      Mailing Address
                    </p>
                    <p className="text-base font-medium whitespace-pre-line">
                      {selectedEvent.mailingAddress}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 py-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <Sparkles className="h-4 w-4 text-muted-foreground/50" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* EVENT DETAILS */}
          <Card
            ref={sectionRefs['event-details-section']}
            className="border-border/40 bg-card/50 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                <CardTitle className="text-sm sm:text-base font-semibold text-muted-foreground uppercase tracking-wider">
                  Event Details
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Event Date
                  </p>
                  <p className="text-lg font-bold">
                    {selectedEvent?.eventDate
                      ? formatDate(selectedEvent.eventDate)
                      : 'Not set'}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Event Time
                  </p>
                  <p className="text-lg font-bold">
                    {formatTimeRange(
                      selectedEvent?.eventDate,
                      selectedEvent?.package,
                      selectedEvent?.eventHours,
                      selectedEvent?.extraHours
                    )}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Event Type
                  </p>
                  <p className="text-base font-medium">
                    {selectedEvent?.eventType || 'Not specified'}
                  </p>
                </div>
                {selectedEvent?.package && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" />
                      Package
                    </p>
                    <p className="text-base font-medium">{selectedEvent.package}</p>
                  </div>
                )}
                {selectedEvent?.rentalFee && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Rental Fee
                    </p>
                    <p className="text-lg font-bold">
                      {formatCurrency(selectedEvent.rentalFee)}
                    </p>
                  </div>
                )}
                <div className="md:col-span-2 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Amenities
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-4 p-5 border border-border/40 rounded-lg bg-background/50 hover:bg-background/80 transition-all shadow-sm">
                      {selectedEvent?.dressingRoom === 'Yes' ? (
                        <CheckCircle className="h-6 w-6 text-accent flex-shrink-0" />
                      ) : (
                        <XCircle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-semibold">Dressing Room</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEvent?.dressingRoom || 'Not specified'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-5 border border-border/40 rounded-lg bg-background/50 hover:bg-background/80 transition-all shadow-sm">
                      {selectedEvent?.soundSystem === 'Yes' ? (
                        <CheckCircle className="h-6 w-6 text-accent flex-shrink-0" />
                      ) : (
                        <XCircle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-semibold">Sound System</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEvent?.soundSystem || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 py-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <Sparkles className="h-4 w-4 text-muted-foreground/50" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* CONTRACT SECTION */}
          {selectedEvent?.contract && selectedEvent.contract.length > 0 && (
            <Card
              ref={sectionRefs['contract-section']}
              className="border-border/40 bg-card/50 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                  <CardTitle className="text-sm sm:text-base font-semibold text-muted-foreground uppercase tracking-wider">
                    Event Contract
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedEvent.contract.map((file, index) => (
                    <a
                      key={index}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-5 rounded-lg border border-border/40 hover:bg-accent/5 hover:border-accent/50 transition-all group shadow-sm hover:shadow-md"
                    >
                      <FileText className="h-6 w-6 text-accent" />
                      <span className="flex-1 font-semibold group-hover:text-accent transition-colors truncate">
                        {getDisplayFilename(file)}
                      </span>
                      <ExternalLink className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* DOCUMENTS SECTION */}
          {documents.length > 0 && (
            <Card
              ref={sectionRefs['documents-section']}
              className="border-border/40 bg-card/50 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileIcon className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                  <CardTitle className="text-sm sm:text-base font-semibold text-muted-foreground uppercase tracking-wider">
                    Documents
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="space-y-3 p-4 rounded-lg border border-border/40 bg-background/30"
                    >
                      <div>
                        <p className="font-semibold text-base">{doc.documentName}</p>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {doc.description}
                          </p>
                        )}
                      </div>
                      {doc.document && doc.document.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {doc.document.map((file, index) => (
                            <a
                              key={index}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/40 hover:bg-accent/5 hover:border-accent/50 transition-all group shadow-sm hover:shadow-md text-sm"
                            >
                              <Download className="h-4 w-4 text-accent" />
                              <span className="font-medium group-hover:text-accent transition-colors">
                                Download
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-4 py-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <Sparkles className="h-4 w-4 text-muted-foreground/50" />
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* LEDGER SECTION */}
          <Card
            ref={sectionRefs['ledger-section']}
            className="border-border/40 bg-card/50 backdrop-blur-sm shadow-md hover:shadow-lg transition-all"
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                <CardTitle className="text-sm sm:text-base font-semibold text-muted-foreground uppercase tracking-wider">
                  Account Ledger
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto px-2 sm:px-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border/40">
                    <tr>
                      <th className="text-left p-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left p-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left p-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-right p-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {ledger.map((entry) => {
                      const isCharge =
                        entry.paymentType === 'Charge' ||
                        entry.paymentType === 'Cleaning Fee';
                      const isPayment =
                        entry.paymentType === 'Rental Payment' ||
                        entry.paymentType === 'Deposit Applied' ||
                        entry.paymentType === 'Recorded Payment';
                      const isDiscount = entry.paymentType === 'Discount';
                      const isDeposit = entry.paymentType === 'Deposit';
                      const displayAmount = Math.abs(entry.amount || 0);

                      return (
                        <tr key={entry.id} className="hover:bg-accent/5 transition-colors">
                          <td className="p-5 text-sm font-medium">
                            {entry.created ? formatDate(entry.created) : '-'}
                          </td>
                          <td className="p-5 text-sm font-medium">
                            {entry.paymentType || '-'}
                          </td>
                          <td className="p-5 text-sm text-muted-foreground">
                            {entry.memo || '-'}
                          </td>
                          <td
                            className={`p-5 text-sm text-right font-bold ${
                              isCharge
                                ? 'text-destructive'
                                : isPayment || isDiscount
                                ? 'text-accent'
                                : isDeposit
                                ? 'text-muted-foreground'
                                : ''
                            }`}
                          >
                            {formatCurrency(displayAmount)}
                          </td>
                        </tr>
                      );
                    })}
                    {ledger.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-12 text-center text-muted-foreground"
                        >
                          No ledger entries found
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {ledger.length > 0 && (
                    <tfoot className="bg-muted/50 border-t-2 border-border/40">
                      <tr>
                        <td
                          colSpan={3}
                          className="p-5 text-base text-left sm:text-right font-bold"
                        >
                          Total Balance:
                        </td>
                        <td
                          className={`p-5 text-lg text-right font-bold ${
                            isPastDue && balance > 0
                              ? 'text-destructive'
                              : balance > 0
                              ? 'text-foreground'
                              : balance < 0
                              ? 'text-green-600'
                              : 'text-accent'
                          }`}
                        >
                          {formatCurrency(balance)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {selectedEvent && (
            <EditHostProfileDialog
              open={showEditProfile}
              onOpenChange={setShowEditProfile}
              hostId={selectedEvent.id || ''}
              currentData={{
                fullName: selectedEvent.fullName,
                email: selectedEvent.email,
                phoneNumber: selectedEvent.phoneNumber,
                companyName: selectedEvent.companyName,
                mailingAddress: selectedEvent.mailingAddress,
              }}
              onUpdate={() => {
                if (selectedEvent) {
                  selectEvent(selectedEvent);
                }
                loadHostData();
              }}
            />
          )}
        </div>
      </div>

      {/* Payment Form */}
      {showPaymentForm && (
        <FilloutPopupEmbed
          key={`payment-${selectedEvent?.id ?? 'none'}-${balance}`}
          filloutId="hMonxz3fZxus"
          isOpen={showPaymentForm}
          onClose={handleClosePaymentForm}
          parameters={paymentParams}
        />
      )}

      {/* Contact Form */}
      {showContactForm && (
        <FilloutPopupEmbed
          key={`contact-${selectedEvent?.id ?? 'none'}`}
          filloutId="owhCPoH5hwus"
          isOpen={showContactForm}
          onClose={() => setShowContactForm(false)}
          parameters={contactParams}
        />
      )}

      {/* Schedule Showing Form */}
      {showScheduleShowing && (
        <FilloutPopupEmbed
          key={`showing-${selectedEvent?.id ?? 'none'}`}
          filloutId="bBwowVT2D2us"
          isOpen={showScheduleShowing}
          onClose={() => setShowScheduleShowing(false)}
          parameters={scheduleShowingParams}
        />
      )}
    </>
  );
}
