import Link from 'next/link';
import { PageBand } from '../../components/PageBand';

export default function NoWorkloadPage() {
  return (
    <>
      <PageBand eyebrow="Assigned to you" title="My Work" />
      <div className="order-empty">
        <h2>You Don&apos;t Have Any Tasks Yet</h2>
        <p>Pick up an order from the main queue to get started.</p>
        <Link href="/" className="btn btn-primary">
          Go to staff queue
        </Link>
      </div>
    </>
  );
}
