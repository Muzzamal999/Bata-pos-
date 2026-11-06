/**
 * Neither Product & Inventory nor the Sales & POS catalog cache stores real
 * product photography (no image pipeline exists yet) - this is an honest
 * placeholder, not a stand-in for a real photo that was skipped.
 */
export function ShoePlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 44c0-4 3-6 7-8l14-7c2-1 3-3 3-5V16c0-2 2-3 4-2l6 4c3 2 6 3 9 3h9c3 0 5 2 5 5v6c0 6-5 11-11 11H10c-2 0-4-2-4-3Z" />
      <path d="M6 44h46" />
      <path d="M23 24v9" />
    </svg>
  );
}
