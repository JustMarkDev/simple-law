export default function Loading() {
  return (
    <main id="contenuto" aria-busy="true" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <p role="status" className="sr-only">
        Caricamento delle norme in corso.
      </p>
      <div aria-hidden="true" className="border-b-2 border-regola pb-5 dark:border-notte-deep">
        <div className="scheletro-card h-4 w-32" />
        <div className="scheletro-card mt-3 h-9 w-2/3" />
        <div className="scheletro-card mt-3 h-4 w-1/2" />
      </div>
      <ul aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, index) => (
          <li key={index} className="border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
            <div className="scheletro-card h-4 w-24" />
            <div className="scheletro-card mt-4 h-6 w-full" />
            <div className="scheletro-card mt-2 h-6 w-5/6" />
            <div className="scheletro-card mt-4 h-4 w-full" />
            <div className="scheletro-card mt-2 h-4 w-2/3" />
          </li>
        ))}
      </ul>
    </main>
  )
}
