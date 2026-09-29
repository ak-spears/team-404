export default function NoWorkloadPage() {
  return (
    <div style={{ textAlign: 'center', marginTop: '2em' }}>
      <h1>You don’t have any tasks yet</h1>
      <p className="muted">Pick up an order from the main queue to get started!</p>
      <p>
        <a href="http://localhost:3001/staff">Go to staff queue</a>
      </p>
    </div>
  );
}
