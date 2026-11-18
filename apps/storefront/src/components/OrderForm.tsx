'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  calculatePriceCents,
  PAYMENT_METHODS,
  PRICING_TABLE_CENTS,
  SERVICE_TYPES,
  type PaymentMethod,
  type ServiceType,
} from '@crimson-copies/shared';
import { MAX_UPLOAD_BYTES, uploadErrorMessage, uploadOrderFile } from '../lib/order-files';
import { orderNumber } from '../lib/orders';
import { formatPrice, PAYMENT_LABELS, SERVICE_DETAILS } from '../lib/services';
import { ChoiceGroup } from './ChoiceGroup';
import { FileDrop } from './FileDrop';
import { FormStep } from './FormStep';
import { QuantityStepper } from './QuantityStepper';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

interface OrderCreateResponse {
  orderId: number;
  customerOrderNumber?: number | null;
}

function isOrderCreateResponse(value: unknown): value is OrderCreateResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { orderId?: unknown }).orderId === 'number'
  );
}

interface SavedCardSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function isSavedCardResponse(value: unknown): value is { saved: true } & SavedCardSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.saved === true &&
    typeof v.brand === 'string' &&
    typeof v.last4 === 'string' &&
    typeof v.expMonth === 'number' &&
    typeof v.expYear === 'number'
  );
}

function describeCard(card: SavedCardSummary): string {
  const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
  const month = String(card.expMonth).padStart(2, '0');
  const year = String(card.expYear).slice(-2);
  return `${brand} •••• ${card.last4} (expires ${month}/${year})`;
}

// Fixed-price services first; quoted ones (department jobs) last.
const SERVICE_CHOICES = [...SERVICE_TYPES]
  .sort((a, b) => Number(PRICING_TABLE_CENTS[a] === null) - Number(PRICING_TABLE_CENTS[b] === null))
  .map((type) => {
    const cents = PRICING_TABLE_CENTS[type];
    return {
      value: type,
      title: SERVICE_DETAILS[type].title,
      meta:
        cents === null ? 'Quoted per job' : `${formatPrice(cents)} ${SERVICE_DETAILS[type].unit}`,
    };
  });

const PAYMENT_CHOICES = PAYMENT_METHODS.map((method) => ({
  value: method,
  title: PAYMENT_LABELS[method],
}));

interface OrderFormProps {
  initialService?: ServiceType;
  defaultName?: string;
  defaultEmail?: string;
}

/** The order form. Submits to the storefront's own BFF route. */
export function OrderForm({ initialService, defaultName = '', defaultEmail = '' }: OrderFormProps) {
  return (
    <OrderFormInner
      initialService={initialService}
      defaultName={defaultName}
      defaultEmail={defaultEmail}
    />
  );
}

function OrderFormInner({ initialService, defaultName = '', defaultEmail = '' }: OrderFormProps) {
  const router = useRouter();

  const [serviceType, setServiceType] = useState<ServiceType>(initialService ?? SERVICE_TYPES[0]);
  const [quantity, setQuantity] = useState(1);
  const [specNotes, setSpecNotes] = useState('');
  const [customerName, setCustomerName] = useState(defaultName);
  const [customerEmail, setCustomerEmail] = useState(defaultEmail);
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrderNumber, setPlacedOrderNumber] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [savedCard, setSavedCard] = useState<SavedCardSummary | null>(null);
  const [savedCardChecked, setSavedCardChecked] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSetupClientSecret, setCardSetupClientSecret] = useState<string | null>(null);
  const [saveCardForFuture, setSaveCardForFuture] = useState(false);
  const [cardStripe, setCardStripe] = useState<Stripe | null>(null);
  const [cardElements, setCardElements] = useState<StripeElements | null>(null);
  const handleCardReady = useCallback((stripe: Stripe | null, elements: StripeElements | null) => {
    setCardStripe(stripe);
    setCardElements(elements);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/saved-card');
        const data: unknown = await res.json().catch(() => null);
        if (!cancelled && res.ok && isSavedCardResponse(data)) {
          setSavedCard({
            brand: data.brand,
            last4: data.last4,
            expMonth: data.expMonth,
            expYear: data.expYear,
          });
        }
      } catch {
        // Lookup failed: show the card form. Worst case the customer enters a card again.
      } finally {
        if (!cancelled) setSavedCardChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (paymentMethod !== 'card' || savedCard || !savedCardChecked) {
      setCardSetupClientSecret(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/saved-card/setup-intent', { method: 'POST' });
        const data: unknown = await res.json().catch(() => null);
        const clientSecret =
          typeof data === 'object' && data !== null
            ? (data as { clientSecret?: unknown }).clientSecret
            : undefined;

        if (!cancelled && res.ok && typeof clientSecret === 'string') {
          setCardSetupClientSecret(clientSecret);
          return;
        }

        if (!cancelled) {
          setCardSetupClientSecret(null);
          setCardError('Could not load the card form. Please try again.');
        }
      } catch {
        if (!cancelled) {
          setCardSetupClientSecret(null);
          setCardError('Could not load the card form. Please try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentMethod, savedCard, savedCardChecked]);

  const service = SERVICE_DETAILS[serviceType];
  const unitCents = PRICING_TABLE_CENTS[serviceType];
  const totalCents = calculatePriceCents(serviceType, quantity);

  function handleFileChosen(file: File | null): void {
    // Checked here as well as server-side so an oversized file is rejected while the customer
    // is still filling the form, not after the order is already placed.
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setFileError(uploadErrorMessage(413));
      setPendingFile(null);
      return;
    }
    setFileError(null);
    setPendingFile(file);
  }

  async function saveCardWithStripe(): Promise<boolean> {
    if (!cardStripe || !cardElements) {
      setCardError('The card form is still loading. Try again in a moment.');
      return false;
    }

    const { error: submitError } = await cardElements.submit();
    if (submitError) {
      setCardError(submitError.message ?? 'Check your card details and try again.');
      return false;
    }

    const res = await fetch('/api/saved-card/setup-intent', { method: 'POST' });
    const data: unknown = await res.json().catch(() => null);
    const clientSecret =
      typeof data === 'object' && data !== null
        ? (data as { clientSecret?: unknown }).clientSecret
        : undefined;
    if (!res.ok || typeof clientSecret !== 'string') {
      setCardError('Could not start saving your card. Please try again.');
      return false;
    }

    const { error: confirmError } = await cardStripe.confirmSetup({
      elements: cardElements,
      clientSecret,
      redirect: 'if_required',
    });
    if (confirmError) {
      setCardError(confirmError.message ?? 'Could not save your card. Please try again.');
      return false;
    }
    return true;
  }

  async function placeOrder(): Promise<void> {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          serviceType,
          quantity,
          specNotes: specNotes || undefined,
          paymentMethod,
        }),
      });

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverError =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof body.error === 'string'
            ? body.error.replaceAll('_', ' ')
            : null;
        setError(
          serverError
            ? `Order failed: ${serverError}. Please try again.`
            : 'Could not submit your order. Please check the form and try again.',
        );
        return;
      }
      if (!isOrderCreateResponse(body)) {
        setError('Unexpected response from the server.');
        return;
      }
      setPlacedOrderNumber(
        orderNumber({ id: body.orderId, customerOrderNumber: body.customerOrderNumber ?? null }),
      );

      const outcomeQuery = new URLSearchParams();
      if (pendingFile) {
        setUploadPercent(0);
        const outcome = await uploadOrderFile(body.orderId, pendingFile, setUploadPercent);
        setUploadPercent(null);
        if (outcome.ok) {
          outcomeQuery.set('uploaded', pendingFile.name);
        } else {
          outcomeQuery.set('uploadError', String(outcome.status));
        }
      }
      const query = outcomeQuery.toString();
      router.replace(`/orders/${body.orderId}${query ? `?${query}` : ''}`);
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCardError(null);

    if (paymentMethod === 'card' && !savedCard) {
      if (!savedCardChecked) {
        setCardError('Still loading your payment info. Try again in a moment.');
        return;
      }
      setSubmitting(true);
      try {
        if (saveCardForFuture) {
          const saved = await saveCardWithStripe();
          if (!saved) return;
        }
      } catch {
        setCardError('Network error -- please try again.');
        return;
      } finally {
        setSubmitting(false);
      }
    }

    await placeOrder();
  }

  if (placedOrderNumber !== null) {
    return (
      <section className="order-placed" role="status">
        <span className="order-placed-check" aria-hidden>
          &#10003;
        </span>
        <h2>Order #{placedOrderNumber} Placed</h2>
        {uploadPercent !== null ? (
          <div className="upload-progress">
            <progress value={uploadPercent} max={100} />
            Uploading {pendingFile?.name}&hellip; {uploadPercent}%
          </div>
        ) : (
          <p className="muted">Opening your order&hellip;</p>
        )}
      </section>
    );
  }

  const cardElementsOptions = cardSetupClientSecret
    ? {
        clientSecret: cardSetupClientSecret,
        appearance: {
          theme: 'stripe' as const,
        },
      }
    : undefined;

  return (
    <section className="order-builder">
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="order-steps">
          <FormStep step={1} title="What Are We Printing?">
            <ChoiceGroup
              name="serviceType"
              choices={SERVICE_CHOICES}
              value={serviceType}
              onChange={setServiceType}
            />
          </FormStep>

          <FormStep step={2} title="Details">
            <QuantityStepper
              label={service.quantityLabel}
              value={quantity}
              onChange={setQuantity}
            />
            <label>
              <span>
                Notes for staff <span className="optional">optional</span>
              </span>
              <textarea
                value={specNotes}
                onChange={(e) => setSpecNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder={service.notesHint}
              />
            </label>
            <div className="field">
              <span className="field-label">
                File to print <span className="optional">optional</span>
              </span>
              <FileDrop
                file={pendingFile}
                error={fileError}
                onFile={handleFileChosen}
                onRejected={setFileError}
              />
            </div>
          </FormStep>

          <FormStep step={3} title="Contact" hint="We'll email you when it's ready for pickup.">
            <div className="field-grid">
              <label>
                Name
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </label>
              <label>
                <span>
                  Phone <span className="optional">optional</span>
                </span>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </label>
            </div>
          </FormStep>

          <FormStep step={4} title="Payment">
            <ChoiceGroup
              name="paymentMethod"
              variant="pills"
              choices={PAYMENT_CHOICES}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />

            {paymentMethod === 'card' && savedCard && (
              <div className="saved-card">
                <p>
                  Using your saved card: <strong>{describeCard(savedCard)}</strong>
                </p>
                <button type="button" className="btn-secondary" onClick={() => setSavedCard(null)}>
                  Use a different card
                </button>
              </div>
            )}

            {paymentMethod === 'card' && !savedCard && savedCardChecked && (
              <div className="card-fields">
                {cardSetupClientSecret ? (
                  <>
                    <Elements stripe={stripePromise} options={cardElementsOptions}>
                      <SetupCardFields onReady={handleCardReady} />
                    </Elements>
                    <label className="save-card-toggle">
                      <input
                        type="checkbox"
                        checked={saveCardForFuture}
                        onChange={(event) => setSaveCardForFuture(event.target.checked)}
                      />
                      Save this card for future orders
                    </label>
                  </>
                ) : (
                  <div className="summary-note">{cardError ?? 'Loading payment details…'}</div>
                )}
                {cardSetupClientSecret && (
                  <p className="summary-note">
                    Your card is stored securely by Stripe only if you choose to save it.
                  </p>
                )}
              </div>
            )}

            {paymentMethod === 'card' && cardError && (
              <p className="error" role="alert">
                {cardError}
              </p>
            )}
          </FormStep>
        </div>

        <aside className="order-summary">
          <h2>Your Order</h2>
          <SummaryLine label="Service" value={service.title} />
          <SummaryLine
            label={service.quantityLabel}
            value={unitCents === null ? quantity : `${quantity} × ${formatPrice(unitCents)}`}
          />
          <SummaryLine label="File" value={pendingFile?.name ?? 'Add later'} />
          <SummaryLine label="Payment" value={PAYMENT_LABELS[paymentMethod]} />
          <div className="summary-total">
            <span>{totalCents === null ? 'Price' : 'Estimated total'}</span>
            <strong>{totalCents === null ? 'Quoted' : formatPrice(totalCents)}</strong>
          </div>
          {totalCents === null && (
            <p className="summary-note">Staff will price this job individually.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
          <p className="summary-note">You can add more files after ordering.</p>
        </aside>
      </form>
    </section>
  );
}

function SetupCardFields({
  onReady,
}: {
  onReady: (stripe: Stripe | null, elements: StripeElements | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    onReady(stripe, elements);
  }, [stripe, elements, onReady]);

  return <PaymentElement options={{ layout: 'tabs' }} />;
}

function SummaryLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
