'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  PAYMENT_METHODS,
  SERVICE_TYPES,
  type PaymentMethod,
  type ServiceType,
  type UploadInstructions,
} from '@crimson-copies/shared';
import {
  ACCEPTED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  uploadErrorMessage,
  uploadOrderFile,
} from '../lib/order-files';
import { OrderFileUpload } from './OrderFileUpload';

interface OrderCreateResponse {
  orderId: number;
  uploadInstructions: UploadInstructions;
}

function isOrderCreateResponse(value: unknown): value is OrderCreateResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'orderId' in value &&
    'uploadInstructions' in value
  );
}

/** The order form. Submits to the storefront's own BFF route. */
export function OrderForm() {
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [quantity, setQuantity] = useState(1);
  const [specNotes, setSpecNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<OrderCreateResponse | null>(null);
  // The file is chosen here but can only be uploaded once the order exists -- order_files rows
  // reference an order id -- so it is held until POST /api/orders returns one.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    // Checked here as well as server-side so an oversized file is rejected while the customer
    // is still filling the form, not after the order is already placed.
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setFileError(uploadErrorMessage(413));
      setPendingFile(null);
      event.target.value = '';
      return;
    }
    setFileError(null);
    setPendingFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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

      const body: unknown = await response.json();
      if (!response.ok) {
        setError('Could not submit your order. Please check the form and try again.');
        return;
      }
      if (!isOrderCreateResponse(body)) {
        setError('Unexpected response from the server.');
        return;
      }
      setRes(body);

      // One action for the customer, two requests underneath. A failure here is reported as
      // "the order was placed, the file wasn't" -- never as a failed order, which would leave
      // someone unsure whether they had ordered anything at all.
      if (pendingFile) {
        setUploadPercent(0);
        const outcome = await uploadOrderFile(
          body.orderId,
          pendingFile,
          setUploadPercent,
          body.uploadInstructions.password,
        );
        setUploadPercent(null);
        if (outcome.ok) {
          setReloadKey((key) => key + 1);
        } else {
          setUploadError(uploadErrorMessage(outcome.status));
        }
      }
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (res) {
    return (
      <div>
        <h2>Order #{res.orderId} submitted</h2>
        <p>
          A confirmation email is on its way. See your order at{' '}
          <a href={`/orders/${res.orderId}`}>order status</a>.
        </p>
        {uploadPercent !== null && (
          <p className="upload-progress" role="status">
            <progress value={uploadPercent} max={100} /> Uploading {pendingFile?.name}...{' '}
            {uploadPercent}%
          </p>
        )}
        {uploadError && (
          <p className="error">
            Your order was placed, but the file didn&apos;t upload: {uploadError} Add it below --
            the order itself is fine.
          </p>
        )}
        <OrderFileUpload
          orderId={res.orderId}
          reloadKey={reloadKey}
          uploadToken={res.uploadInstructions.password}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name
        <input
          type="text"
          required
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </label>
      <label>
        Email
        <input
          type="email"
          required
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
        />
      </label>
      <label>
        Phone (optional)
        <input
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
        />
      </label>
      <label>
        Service type
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as ServiceType)}
        >
          {SERVICE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantity
        <input
          type="number"
          min={1}
          required
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <label>
        Spec notes (optional)
        <textarea value={specNotes} onChange={(e) => setSpecNotes(e.target.value)} rows={4} />
      </label>
      <label className="file-picker">
        File to print (optional)
        <input type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileChosen} />
        <span className="muted">
          Documents or images, up to 50 MB. You can add more files after ordering.
        </span>
      </label>
      {fileError && <p className="error">{fileError}</p>}
      <label>
        Payment method
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit order'}
      </button>
    </form>
  );
}
