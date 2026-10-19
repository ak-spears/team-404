interface PhotoCreditProps {
  /** What's pictured and who took it. */
  subject: string;
  /** Original image address (the copy we serve lives in /public/images). */
  source: string;
}

/** Credit for a band photo, rendered as the page's bottom brand stripe. Render last on the page. */
export function PhotoCredit({ subject, source }: PhotoCreditProps) {
  return (
    <footer className="photo-credit">
      <span>Photo: {subject} &middot;</span>
      <a href={source} target="_blank" rel="noreferrer">
        {decodeURI(source.replace(/^https?:\/\//, ''))}
      </a>
    </footer>
  );
}
