export default function Loading() {
  return (
    <main
      id="contenuto"
      aria-busy="true"
      className="mx-auto w-full max-w-editoriale space-y-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
    >
      <p role="status" className="sr-only">
        Sto caricando le norme, un attimo.
      </p>
      <div aria-hidden="true" className="rounded-2xl border border-regola bg-carta-soft p-6 dark:border-notte-deep dark:bg-notte-soft sm:p-8">
        <div className="scheletro-card h-5 w-36 rounded-xl" />
        <div className="scheletro-card mt-4 h-9 w-2/3 rounded-xl" />
        <div className="scheletro-card mt-3 h-4 w-1/2 rounded-xl" />
        <div className="scheletro-card mt-6 h-14 w-full rounded-xl" />
      </div>
      <ul aria-hidden="true" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <li
            key={index}
            className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <div className="scheletro-card h-4 w-24 rounded-lg" />
            <div className="scheletro-card mt-4 h-6 w-full rounded-xl" />
            <div className="scheletro-card mt-2 h-6 w-5/6 rounded-xl" />
            <div className="scheletro-card mt-4 h-4 w-full rounded-xl" />
            <div className="scheletro-card mt-2 h-4 w-2/3 rounded-xl" />
          </li>
        ))}
      </ul>
    </main>
  )
}
