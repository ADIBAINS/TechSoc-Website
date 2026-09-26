import type { ReactNode } from 'react'
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'techsoc — community club' },
      { name: 'description', content: 'A welcoming grassroots collective for builders, designers, and curious technologists.' },
    ],
    links: [
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%2300c8f5' d='M2 2h28l-5 9h5l-5 19H2l5-13H2z'/%3E%3C/svg%3E",
      },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="reference-site">
      <main>
        <section className="reference-hero shell">
          <div className="reference-hero-copy">
            <div className="reference-kicker"><i /> Error 404</div>
            <h1>This page wandered <em>off the map</em>.</h1>
            <p>The page you were looking for doesn't exist, was moved, or never made it out of the workshop. The good news: the rest of the community is still here.</p>
            <div className="reference-hero-buttons">
              <Link to="/" className="notched-button">Back to homepage</Link>
              <Link to="/admin" className="reference-secondary-button">Open control room</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function RootDocument() {
  return <Document><Outlet /></Document>
}

function Document({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
