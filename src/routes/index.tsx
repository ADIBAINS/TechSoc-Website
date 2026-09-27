import { createElement, useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  Github,
  HandHeart,
  Heart,
  Images,
  Lightbulb,
  Link2,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Rocket,
  ArrowUpRight,
  UsersRound,
  Video,
  X,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { EVENT_KINDS, eventCategory, eventKind, type EventCategory } from '../lib/eventKinds'
import { collectMedia, type MediaItem } from '../lib/media'
import { MediaSurface } from '../components/MediaSurface'
import { Carousel, usePerView } from '../components/Carousel'
import { MediaViewer } from '../components/MediaViewer'

export const Route = createFileRoute('/')({ component: HomePage })

type Member = {
  id: number
  name: string
  role?: string
  bio?: string
  image_path?: string
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
}

type EventItem = {
  id: number
  title: string
  kind?: string
  description?: string
  starts_at?: string
  location?: string
  registration_url?: string
  cover_image_path?: string
}

type Memory = { id: number; title: string; caption?: string; image_path?: string; media?: MediaItem[] }
type Sponsor = { id: number; name: string; logo_path?: string; url?: string; tier?: string }
type Content = { members: Member[]; events: EventItem[]; memories: Memory[]; sponsors?: Sponsor[]; settings?: Record<string, string> }
type DisplayEvent = EventItem & { category: EventCategory; kindLabel: string; meta: string; cta: string; mode: 'map' | 'video' | 'users' }
type Viewer = { title: string; items: MediaItem[]; index: number }

const heroImage = 'https://lh3.googleusercontent.com/aida/AEtjO1XQxR5_Zh6XpU9ty1F32yvVgpGLwmsTAPD0s9mgEYjQenN1-fHLx7Ax6yDb6vT94DYD3AnDYfkQ4QqkuvIqFGn6QuZI2u6KD1tTCQLq5Xkv541e7kIMJ0cxUJZ9V4ugFkzA0OinPslBf0hfW19I6j_NkfEABt1CYLnNjVxZtOlcvDf1e5HZNqIA47ndzQ4VJCyN9rg8mB5I6oJRRJ1HiGK_1SVdHAyaMq-axG0Md-K1WrQIWuTlbFIOCko'
const galleryImages = [
  heroImage,
  'https://lh3.googleusercontent.com/aida/AEtjO1XUDGMkuPzwCN4UyPzuOgNnC08WjB-pB5ie5uXSQHCtfXCRndmvtA3XtuyLHTUtKoigRHVR3k2hfQWohlJICUYTVtQXiji01h55AXmyCOYmjJwqvn7m_Df2VMzUMRPDnrFXsFfalP-RhMX_9ATH8HGgpZfbw1hik1BhSOIkLI6FontelEbOUJ1FWGxtmBxm24BtOVxKQvpbN5dhEp-DQFBe2kICB93xUL2V0X12DmqB1Gj9-wYlaUz8g7E',
]
const fallbackMembers: Member[] = [
  { id: -1, name: 'Maya Lin', role: 'Community Lead & Product Designer', bio: 'Passionate about accessible UI systems and fostering welcoming spaces for newcomers in design engineering.', image_path: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=85' },
  { id: -2, name: 'Marcus Adebayo', role: 'Tech Lead & Full-Stack Builder', bio: 'Building open-source infrastructure tools and mentoring young programmers stepping into web and cloud systems.', image_path: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=85' },
  { id: -3, name: 'Carlos Mendez', role: 'Events & Hackathon Director', bio: 'Curating high-energy hackathons, demo days, and weekend build sprints that bring people together IRL.', image_path: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=85' },
  { id: -4, name: 'Elena Rostova', role: 'Hardware & Robotics Mentor', bio: 'Researcher passionate about embedded sensors, maker culture, and demystifying robotics for creators of all backgrounds.', image_path: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=85' },
]
const fallbackEvents: EventItem[] = [
  { id: -11, kind: 'Workshop', title: 'Building AI-Powered Side Projects in a Weekend', description: 'A friendly walkthrough of connecting modern AI APIs to clean web interfaces, from concept to live deployment.', starts_at: '2025-04-19T14:00:00', location: 'Tech Hub & Live Zoom Stream' },
  { id: -12, kind: 'Speaker Talk', title: 'Design Engineering: Bridging Figma to React', description: 'Learn practical tips on design tokens, responsive layouts, micro-interactions, and creating cohesive user experiences.', starts_at: '2025-04-24T18:30:00', location: 'Online Discord Stage' },
  { id: -13, kind: 'Hackathon', title: 'Summer Buildathon 2025: Tech for Good', description: '48 hours of collaborative hacking focused on education, sustainability, and open-source civic tools. Mentors on-site.', starts_at: '2025-05-10T10:00:00', location: 'Downtown Innovation Loft' },
  { id: -14, kind: 'Webinar', title: 'Intro to Robotics: Sensors, Circuits, and Soldering', description: 'A streamed deep-dive into embedded sensors and maker tooling, with a live Q&A to close.', starts_at: '2025-05-22T17:00:00', location: 'Online' },
]
const fallbackMemories: Memory[] = [
  { id: -21, title: 'Spring Hackathon 2024', caption: '36 hours of non-stop building, coffee, and collaboration.', image_path: galleryImages[0] },
  { id: -22, title: 'Annual Demo Day & Showcase', caption: 'Twelve teams showcasing functional prototypes to a room full of peers.', image_path: galleryImages[1] },
].map((memory) => ({ ...memory, media: collectMedia([{ path: memory.image_path, caption: memory.caption }]) }))
const transition = { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const }

function toDisplayEvent(event: EventItem): DisplayEvent {
  const category = eventCategory(event.kind)
  const online = (event.location ?? '').toLowerCase().includes('online')
  return {
    ...event,
    category,
    kindLabel: eventKind(event.kind).label,
    meta: event.registration_url ? 'Registration open' : 'Community stage',
    cta: event.registration_url ? 'View event details' : 'Save My Seat',
    mode: category === 'webinar' || online ? 'video' : category === 'hackathon' ? 'users' : 'map',
  }
}

function HomePage() {
  const [content, setContent] = useState<Content>({ members: [], events: [], memories: [] })
  const [menuOpen, setMenuOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | EventCategory>('all')
  const [reserved, setReserved] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const reducedMotion = useReducedMotion()
  const teamPerView = usePerView(4, 2, 1)
  const eventPerView = usePerView(3, 2, 1)
  const galleryPerView = usePerView(3, 2, 1)

  useEffect(() => {
    let active = true
    fetch('/api/content')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: Content) => { if (active) setContent(data) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const members = content.members.length ? content.members : fallbackMembers
  const sponsors = content.sponsors ?? []
  const events = (content.events.length ? content.events : fallbackEvents).map(toDisplayEvent)
  const visibleEvents = filter === 'all' ? events : events.filter((event) => event.category === filter)
  const activeFilter = filter === 'all' ? null : EVENT_KINDS.find((kind) => kind.value === filter) ?? null
  const memories = (content.memories.length ? content.memories : fallbackMemories).map((memory) => ({ ...memory, media: memory.media?.length ? memory.media : collectMedia([{ path: memory.image_path, caption: memory.caption }]) }))
  const totalMedia = memories.reduce((total, memory) => total + (memory.media?.length ?? 0), 0)
  const heroAsset = content.settings?.hero_asset || heroImage
  const announcement = content.settings?.announcement as unknown as { enabled?: boolean; text?: string; link?: string } | undefined
  const [announceDismissed, setAnnounceDismissed] = useState(() => {
    try { return window.localStorage.getItem('techsoc-announcement-dismissed') || '' } catch { return '' }
  })
  const showAnnouncement = !!announcement?.enabled && !!announcement?.text && announceDismissed !== announcement.text
  const dismissAnnouncement = () => {
    if (!announcement?.text) return
    try { window.localStorage.setItem('techsoc-announcement-dismissed', announcement.text) } catch {}
    setAnnounceDismissed(announcement.text)
  }
  const heroIsVideo = /\.(mp4|webm|ogg)(\?.*)?$/i.test(heroAsset)
  const heroIsModel = /\.(glb|gltf)(\?.*)?$/i.test(heroAsset)
  useEffect(() => {
    if (!heroIsModel || customElements.get('model-viewer')) return
    const script = document.createElement('script')
    script.type = 'module'
    script.src = 'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js'
    document.head.appendChild(script)
    return () => { script.remove() }
  }, [heroIsModel])

  const showToast = (message: string) => setToast(message)
  const openViewer = (memory: Memory) => {
    const items = memory.media ?? []
    if (!items.length) { showToast('No media has been added to this moment yet.'); return }
    setViewer({ title: memory.title, items, index: 0 })
  }
  const reserve = (event: DisplayEvent) => {
    setReserved(event.id)
    showToast(`You have RSVP’d for “${event.title}”. Confirmation sent!`)
    window.setTimeout(() => setReserved((current) => current === event.id ? null : current), 3000)
  }

  return (
    <div className="reference-site">
      <div className={toast ? 'reference-toast is-visible' : 'reference-toast'} role="status" aria-live="polite"><span><Check size={16} /></span>{toast}</div>
      {showAnnouncement && <div className="announce-bar" role="status"><span>{announcement!.text}</span>{announcement!.link && <a href={announcement!.link}>Learn more</a>}<button onClick={dismissAnnouncement} aria-label="Dismiss announcement"><X size={15} /></button></div>}

      <header className="reference-header">
        <div className="reference-nav-shell">
          <a className="reference-brand" href="#home" aria-label="techsoc home"><span className="reference-mark" /><span><strong>techsoc</strong><small>community club</small></span></a>
          <div className="season-status"><i /> Season 2025 · Open to all</div>
          <nav className="reference-nav" aria-label="Main navigation">
            {['Home', 'About', 'Team', 'Events', 'Past Glimpses', 'Community'].map((item) => <a href={`#${item === 'Home' ? 'home' : item === 'Past Glimpses' ? 'glimpses' : item.toLowerCase()}`} key={item}>{item}</a>)}
          </nav>
          <div className="reference-actions"><a className="meetups-link" href="#events"><CalendarDays size={17} /> Meetups</a><a className="notched-button compact" href="#contact">Join techsoc <ArrowRight size={16} /></a></div>
          <button className="reference-menu" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
        <nav className={menuOpen ? 'reference-mobile-nav is-open' : 'reference-mobile-nav'} aria-label="Mobile navigation">
          {['Home', 'About', 'Team', 'Events', 'Past Glimpses', 'Community'].map((item) => <a href={`#${item === 'Home' ? 'home' : item === 'Past Glimpses' ? 'glimpses' : item.toLowerCase()}`} key={item} onClick={() => setMenuOpen(false)}>{item}</a>)}
        </nav>
      </header>

      <main>
        <section className="reference-hero shell" id="home">
          <motion.div className="reference-hero-copy" initial={reducedMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
            <div className="reference-kicker"><i /> A warm, friendly tech community</div>
            <h1>A vibrant community for <em>builders</em>, <b>designers</b> &amp; technologists.</h1>
            <p>techsoc brings curious minds together to craft real software, tinker with hardware, and learn new skills. No gatekeeping, no intimidating barriers—just genuine people building things that matter.</p>
            <div className="reference-hero-buttons"><a className="notched-button" href="#contact"><UsersRound size={19} /> Join Discord Community <ArrowRight size={18} /></a><a className="reference-secondary-button" href="#events"><CalendarDays size={19} /> Explore Upcoming Events</a></div>
            <div className="reference-metrics"><Metric value="1,500+" label="Active Builders" /><Metric value="24+" label="Workshops Held" accent /><Metric value="100%" label="Community-Driven" accent /></div>
          </motion.div>
          <motion.div className="reference-hero-visual" initial={reducedMotion ? false : { opacity: 0, y: 28, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...transition, delay: .16 }}>
            <div className="hero-photo-card">{heroIsModel ? createElement('model-viewer', { src: heroAsset, 'camera-controls': true, 'auto-rotate': true, 'interaction-prompt': 'none', 'aria-label': 'techsoc Blender hero animation' }) : heroIsVideo ? <video src={heroAsset} autoPlay loop muted playsInline aria-label="techsoc Blender hero animation" /> : <img src={heroAsset} alt="Community builders collaborating together at a techsoc hackathon" />}<div className="photo-shade" /><div className="hero-photo-note"><span className="note-icon"><UsersRound size={20} /></span><span><strong>Spring Community Hackathon</strong><small>180+ creators shipped prototypes in 36 hours</small></span><b><i /> In-person &amp; Hybrid</b></div></div>
          </motion.div>
        </section>

        <section className="reference-about band" id="about"><div className="shell"><SectionHeading eyebrow="What we are about" title="Learning, building, and growing side-by-side." copy="techsoc was founded on a simple belief: modern technology is exciting, and learning it is far more fun when done collaboratively. Whether you wrote your first line of code yesterday or lead engineering teams, you belong here." /><div className="pillar-grid"><Pillar icon={<Lightbulb />} title="Hands-on Workshops" copy="Bi-weekly interactive labs led by community mentors covering AI fundamentals, web design craft, cloud architecture, and embedded systems." foot="Beginner & advanced tracks" /><Pillar icon={<Rocket />} title="Demo Nights" copy="A judgment-free stage to show off side projects, early MVPs, design redesigns, or robotics experiments. Instant constructive feedback from peers." foot="Monthly community showcases" /><Pillar icon={<Code2 />} title="Collaborative Projects" copy="Team up with designers, developers, and writers to build open-source tools, hackathon entries, and civic tech that benefits the broader community." foot="Open source & public bounties" /></div></div></section>

        <section className="reference-team shell section-padding" id="team"><div className="reference-rule" /><div className="reference-section-row"><SectionHeading eyebrow="The people behind techsoc" title="Meet the Core Team" copy="The builders behind techsoc's events, programs, and community initiatives. Dedicated to creating an inclusive, empowering space." /><span className="volunteer-note"><HandHeart size={18} /> {members.length} {members.length === 1 ? 'member' : 'members'} · volunteer organized</span></div><Carousel label="Core team members" perView={teamPerView} className="carousel-team">{members.map((member) => <TeamCard member={member} delay={0} key={member.id} />)}</Carousel></section>

        <section className="reference-events band" id="events"><div className="shell"><div className="reference-section-row"><SectionHeading eyebrow="Gatherings & meetups" title="Upcoming Events" copy="Join us in person or tune in online. All sessions are free and open to everyone in the tech community." /><div className="reference-filter" aria-label="Event filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All events</button>{EVENT_KINDS.map((kind) => <button key={kind.value} className={filter === kind.value ? 'active' : ''} onClick={() => setFilter(kind.value)}>{kind.filter}</button>)}</div></div><Carousel label="Upcoming events" perView={eventPerView} className="carousel-events">{visibleEvents.map((event) => <EventCard event={event} reserved={reserved === event.id} onReserve={reserve} key={event.id} />)}</Carousel>{!visibleEvents.length && <div className="event-empty"><p>No {activeFilter ? activeFilter.filter.toLowerCase() : 'events'} scheduled right now.</p><button onClick={() => setFilter('all')}>Show all events</button></div>}</div></section>

        {sponsors.length > 0 && <section className="reference-sponsors shell section-padding" id="sponsors"><div className="reference-rule" /><SectionHeading eyebrow="Backed by" title="Our Sponsors" copy="The teams whose support keeps meetups free, food warm, and hackathons loud." /><div className="sponsor-grid">{sponsors.map((sponsor) => <a className="sponsor-card" href={sponsor.url || '#sponsors'} key={sponsor.id} target={sponsor.url ? '_blank' : undefined} rel="noreferrer">{sponsor.logo_path ? <img src={sponsor.logo_path} alt={`${sponsor.name} logo`} loading="lazy" /> : <span>{sponsor.name.slice(0, 1)}</span>}<strong>{sponsor.name}</strong><small>{sponsor.tier || 'Community'}</small></a>)}</div></section>}

        <section className="reference-archive shell section-padding" id="glimpses">
          <div className="reference-rule" />
          <div className="reference-section-row">
            <SectionHeading
              eyebrow="The archive"
              title="Moments worth keeping."
              copy="Every gathering leaves something behind — a prototype that shipped, a whiteboard full of sketches, a room that stayed loud until midnight. Open any card to see the full set of photos, clips, and 3D files from that day."
            />
            <span className="archive-stats">
              <b>{memories.length}</b>
              <small>{memories.length === 1 ? 'moment' : 'moments'}</small>
              <i />
              <b>{totalMedia}</b>
              <small>{totalMedia === 1 ? 'media file' : 'media files'}</small>
            </span>
          </div>
          <Carousel label="The archive" perView={galleryPerView} className="carousel-gallery">
            {memories.map((memory) => <GalleryCard memory={memory} onOpen={() => openViewer(memory)} key={memory.id} />)}
          </Carousel>
          {viewer && <MediaViewer title={viewer.title} items={viewer.items} index={viewer.index} onIndexChange={(next) => setViewer({ ...viewer, index: next })} onClose={() => setViewer(null)} />}
        </section>

        <section className="reference-contact band" id="community"><div className="shell contact-grid"><div className="contact-copy"><SectionHeading eyebrow="Get involved" title="Enter the community." copy="Whether you want to showcase a project, give a 10-minute lightning talk, suggest a workshop topic, or just hang out with fellow makers, we’d love to welcome you." /><div className="community-links"><CommunityLink icon={<MessageCircle />} title="Discord Community" sub="Daily chat, project help & channels" /><CommunityLink icon={<Github />} title="GitHub Organization" sub="github.com/techsoc — Open repos" /><CommunityLink icon={<Mail />} title="Email the Organizers" sub="hello@techsoc.org" href="mailto:hello@techsoc.org" /></div><div className="inclusive-note"><Heart size={19} /> techsoc is open to all skill levels. Everyone is welcome to learn, share, and collaborate in a kind and inclusive environment.</div></div><ContactForm notify={showToast} /></div></section>
      </main>

      <footer className="reference-footer"><div className="shell"><div className="footer-top"><div><a className="footer-brand" href="#home"><span className="reference-mark" /> techsoc</a><p>A welcoming grassroots collective for builders, designers, and curious technologists. Learning together and shipping side projects in the open.</p></div><FooterLinks heading="Community links" links={['Discord', 'GitHub', 'X / Twitter', 'LinkedIn', 'Newsletter']} /><FooterLinks heading="Principles" links={['Community Code of Conduct', 'Open Source Guidelines', 'FAQ & Resources']} /></div><div className="footer-bottom"><span>© {new Date().getFullYear()} techsoc community. Built with warmth for curious minds everywhere.</span><span><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href="#contact">Join Us</a></span></div></div></footer>
    </div>
  )
}

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) { return <div><strong className={accent ? 'accent' : ''}>{value}</strong><span>{label}</span></div> }

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="reference-heading"><span>{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>
}

function Pillar({ icon, title, copy, foot }: { icon: React.ReactNode; title: string; copy: string; foot: string }) {
  return <motion.article className="pillar-card" whileHover={{ y: -7 }} transition={transition}><span className="pillar-icon">{icon}</span><h3>{title}</h3><p>{copy}</p><small><CheckCircle2 size={15} /> {foot}</small></motion.article>
}

function TeamCard({ member, delay }: { member: Member; delay: number }) {
  const reducedMotion = useReducedMotion()
  return <motion.article className="team-card" initial={reducedMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ ...transition, delay }} whileHover={{ y: -8 }}><div className="team-photo">{member.image_path ? <img src={member.image_path} alt={`${member.name} — ${member.role || 'community member'}`} loading="lazy" /> : <span>{member.name.slice(0, 1)}</span>}</div><div className="team-copy"><h3 title={member.name}>{member.name}</h3><strong title={member.role || 'Community member'}>{member.role || 'Community member'}</strong><p className="team-bio" title={member.bio}>{member.bio || 'Part of the friendly group of people that makes techsoc happen.'}</p></div><div className="team-socials"><a href={member.github_url || '#team'} aria-label={`${member.name}'s GitHub`}><Github size={17} /></a><a href={member.linkedin_url || '#team'} aria-label={`${member.name}'s LinkedIn`}><Link2 size={17} /></a><a href={member.portfolio_url || '#team'} aria-label={`${member.name}'s portfolio`}><ExternalLink size={17} /></a></div></motion.article>
}

function EventCard({ event, reserved, onReserve }: { event: DisplayEvent; reserved: boolean; onReserve: (event: DisplayEvent) => void }) {
  const date = event.starts_at ? new Date(event.starts_at) : null
  const ModeIcon = event.mode === 'video' ? Video : event.mode === 'users' ? UsersRound : MapPin
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const submitRsvp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setFormError('')
    const response = await fetch('/api/rsvp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_id: event.id, name, email }) })
    const result = await response.json().catch(() => ({})) as { error?: string; registered?: boolean }
    setBusy(false)
    if (!response.ok && !result.registered) { setFormError(result.error ?? 'Could not save your RSVP'); return }
    setFormOpen(false); onReserve(event)
  }
  return <motion.article className="event-card" whileHover={{ y: -8 }} transition={transition}><div><div className="event-card-top"><span>{event.kindLabel}</span><small>{event.meta}</small></div><h3>{event.title}</h3><p>{event.description}</p><ul><li><CalendarDays size={16} />{date ? date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date to be announced'}</li><li><ModeIcon size={16} />{event.location || 'Location to be announced'}</li><li><UsersRound size={16} />Open access for everyone</li></ul></div>{reserved ? <button className="event-rsvp is-reserved">Spot Confirmed! <Check size={16} /></button> : formOpen ? <form className="rsvp-form" onSubmit={submitRsvp}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required maxLength={200} aria-label="Your name" /><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required type="email" aria-label="Email" />{formError && <small className="rsvp-error">{formError}</small>}<div className="rsvp-actions"><button className="event-rsvp" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm RSVP'}</button><button className="rsvp-cancel" type="button" onClick={() => setFormOpen(false)}>Cancel</button></div></form> : <button className="event-rsvp" onClick={() => { setFormOpen(true); setFormError('') }}>{event.cta}{event.kind === 'Speaker Talk' ? <Bookmark size={16} /> : <ArrowRight size={16} />}</button>}</motion.article>
}

function GalleryCard({ memory, onOpen }: { memory: Memory; onOpen: () => void }) {
  const items = memory.media ?? []
  const [cover, ...rest] = items
  return (
    <motion.figure className="gallery-card" whileHover={{ y: -5 }} transition={transition}>
      <button className="gallery-open" onClick={onOpen} aria-label={`View ${items.length} ${items.length === 1 ? 'item' : 'items'} from ${memory.title}`}>
        <div className="gallery-frame">
          {cover ? <MediaSurface item={cover} alt={memory.title} className="gallery-media" /> : <div className="gallery-placeholder" />}
          <span className="gallery-overlay" />
          {items.length > 1 && <span className="gallery-count"><Images size={13} /> {items.length}</span>}
          <span className="gallery-cta">View gallery<ArrowUpRight size={15} /></span>
          <figcaption><strong>{memory.title}</strong><p>{memory.caption || 'A moment with the community.'}</p></figcaption>
        </div>
      </button>
      {rest.length > 0 ? (
        <ul className="gallery-thumbs" aria-label={`${items.length} items in this gallery`}>
          {rest.slice(0, 5).map((item) => <li key={item.path}><MediaSurface item={item} alt="" className="gallery-thumb" /></li>)}
          {rest.length > 5 && <li className="gallery-thumb-more">+{rest.length - 5}</li>}
        </ul>
      ) : (
        <p className="gallery-meta"><Images size={13} /> {items.length} {items.length === 1 ? 'item' : 'items'} in this gallery</p>
      )}
    </motion.figure>
  )
}

function CommunityLink({ icon, title, sub, href = '#contact' }: { icon: React.ReactNode; title: string; sub: string; href?: string }) { return <a className="community-link" href={href}><span>{icon}</span><p><strong>{title}</strong><small>{sub}</small></p><ArrowRight size={18} /></a> }

function ContactForm({ notify }: { notify: (message: string) => void }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const payload = Object.fromEntries(new FormData(form).entries()); const response = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const name = String(payload.name || 'there'); if (!response.ok) { notify('Please complete the form and try again.'); return } form.reset(); notify(`Thanks ${name}! One of our organizers will reply within 48 hours.`) }
  return <motion.div className="reference-form-panel" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={transition}><h3>Say Hello or Propose an Idea</h3><p>Fill out this quick note and one of our core team members will reply within 48 hours.</p><form onSubmit={submit}><div className="form-pair"><label>Your name<input name="name" required placeholder="e.g. Alex Turing" /></label><label>Email address<input name="email" required type="email" placeholder="alex@example.com" /></label></div><label>How would you like to get involved?<select name="involvement"><option>Join as an active community member</option><option>Propose a workshop or technical talk</option><option>Showcase a project at next Demo Night</option><option>Sponsor an event or provide food/space</option><option>Other / General inquiry</option></select></label><label>Your message<textarea name="message" required rows={4} placeholder="Tell us a little bit about yourself, what you are building, or what questions you have…" /></label><button className="notched-button" type="submit">Send Message <ArrowRight size={16} /></button></form></motion.div>
}

function FooterLinks({ heading, links }: { heading: string; links: string[] }) { return <div className="footer-links"><h4>{heading}</h4>{links.map((link) => <a href="#contact" key={link}>{link}</a>)}</div> }
