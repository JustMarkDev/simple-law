import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import Comparsa from '@/components/Comparsa'

export const metadata: Metadata = {
  title: 'Fonti ufficiali - Stato della Repubblica',
  description: 'Da dove prendiamo i testi delle norme: Normattiva, Gazzetta Ufficiale, Parlamento e Governo.',
}

interface Fonte {
  nome: string
  url: string
  cosa: string
  descrizione: string
}

const FONTI: Fonte[] = [
  {
    nome: 'Normattiva',
    url: 'https://www.normattiva.it/',
    cosa: 'Testo consolidato',
    descrizione:
      'La banca dati ufficiale dello Stato con i testi vigenti e coordinati delle norme italiane. È il punto di riferimento per il testo aggiornato.',
  },
  {
    nome: 'Gazzetta Ufficiale',
    url: 'https://www.gazzettaufficiale.it/',
    cosa: 'Pubblicazione ufficiale',
    descrizione:
      'Il quotidiano ufficiale su cui vengono pubblicate le leggi. Dalla pubblicazione decorrono gli effetti e i termini di attuazione.',
  },
  {
    nome: 'Governo - Consiglio dei ministri',
    url: 'https://www.governo.it/it/archivio-consiglio-dei-ministri',
    cosa: 'Comunicati e delibere',
    descrizione:
      'I comunicati del Consiglio dei ministri raccontano cosa è stato approvato e spesso anticipano attuativi e stanziamenti.',
  },
  {
    nome: 'Camera dei deputati',
    url: 'https://www.camera.it/',
    cosa: 'Lavori e dossier',
    descrizione:
      'Documenti parlamentari, dossier e iter dei disegni di legge: utili per capire emendamenti e modifiche durante l’esame.',
  },
  {
    nome: 'Senato della Repubblica',
    url: 'https://www.senato.it/',
    cosa: 'Lavori e dossier',
    descrizione:
      'Lavori dell’altra camera e dossier di documentazione. I dossier spiegano in modo sintetico contenuti ed effetti delle proposte.',
  },
]

export default function FontiPage() {
  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Trasparenza
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Fonti ufficiali
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Ogni scheda rimanda alle fonti primarie. Usiamo solo fonti pubbliche e gratuite, senza raccolte proprietarie.
          </p>
        </header>

        <ol className="mt-8 grid gap-px border border-regola bg-regola dark:border-notte-deep dark:bg-notte-deep sm:grid-cols-2">
          {FONTI.map((fonte, index) => (
            <li key={fonte.nome} className="flex bg-carta dark:bg-notte">
              <Comparsa className="flex w-full" delay={Math.min(index * 0.05, 0.25)}>
                <article className="flex w-full flex-col p-5">
                  <span className="flex items-baseline gap-3">
                    <span aria-hidden="true" className="font-serif text-2xl font-bold text-accento dark:text-accento-chiara">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-inchiostro-faint dark:text-nebbia-faint">
                      {fonte.cosa}
                    </span>
                  </span>
                  <h2 className="mt-3 font-serif text-lg font-bold text-inchiostro dark:text-nebbia">
                    <a
                      href={fonte.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:text-accento hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:hover:text-accento-chiara dark:focus-visible:outline-nebbia"
                    >
                      {fonte.nome}
                    </a>
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {fonte.descrizione}
                  </p>
                </article>
              </Comparsa>
            </li>
          ))}
        </ol>
      </main>
      <Footer />
    </>
  )
}
