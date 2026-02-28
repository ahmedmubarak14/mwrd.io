import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LanguageToggle } from '../components/LanguageToggle';

gsap.registerPlugin(ScrollTrigger);

interface LandingProps {
  onNavigateToLogin: () => void;
  onNavigateToGetStarted: () => void;
  onNavigateToAboutClients: () => void;
  onNavigateToAboutSuppliers: () => void;
}

/* ─── 3D Floating Shapes (pure CSS + GSAP) ─── */
const FloatingShapes: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    {/* Cube 1 */}
    <div className="floating-shape floating-shape-1" style={{ top: '10%', left: '8%' }}>
      <div className="shape-3d cube">
        <div className="cube-face cube-front" />
        <div className="cube-face cube-back" />
        <div className="cube-face cube-right" />
        <div className="cube-face cube-left" />
        <div className="cube-face cube-top" />
        <div className="cube-face cube-bottom" />
      </div>
    </div>
    {/* Cube 2 */}
    <div className="floating-shape floating-shape-2" style={{ top: '60%', right: '10%' }}>
      <div className="shape-3d cube cube-accent">
        <div className="cube-face cube-front" />
        <div className="cube-face cube-back" />
        <div className="cube-face cube-right" />
        <div className="cube-face cube-left" />
        <div className="cube-face cube-top" />
        <div className="cube-face cube-bottom" />
      </div>
    </div>
    {/* Prism */}
    <div className="floating-shape floating-shape-3" style={{ top: '25%', right: '20%' }}>
      <div className="shape-3d prism">
        <div className="prism-face prism-front" />
        <div className="prism-face prism-left" />
        <div className="prism-face prism-right" />
        <div className="prism-face prism-bottom" />
      </div>
    </div>
    {/* Sphere glow */}
    <div className="floating-shape floating-shape-4" style={{ bottom: '15%', left: '15%' }}>
      <div className="shape-sphere" />
    </div>
    {/* Small accent dots */}
    <div className="floating-shape floating-shape-5" style={{ top: '40%', left: '45%' }}>
      <div className="shape-dot" />
    </div>
    <div className="floating-shape floating-shape-6" style={{ top: '70%', left: '60%' }}>
      <div className="shape-dot shape-dot-sm" />
    </div>
  </div>
);

/* ─── Animated Counter Component ─── */
const AnimatedCounter: React.FC<{ end: number; suffix?: string; duration?: number }> = ({ end, suffix = '', duration = 2 }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !counted.current) {
          counted.current = true;
          gsap.fromTo(el, { innerText: '0' }, {
            innerText: end,
            duration,
            ease: 'power2.out',
            snap: { innerText: 1 },
            onUpdate() { el.textContent = Math.ceil(Number(el.textContent || '0')) + suffix; }
          });
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, suffix, duration]);

  return <span ref={ref}>0{suffix}</span>;
};

/* ─── Main Landing Component ─── */
export const Landing: React.FC<LandingProps> = ({
  onNavigateToLogin,
  onNavigateToGetStarted,
  onNavigateToAboutClients,
  onNavigateToAboutSuppliers,
}) => {
  const { t } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    /* ── Hero entrance ── */
    const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    heroTl
      .fromTo('.hero-badge', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 })
      .fromTo('.hero-title', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1 }, '-=0.3')
      .fromTo('.hero-subtitle', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.6')
      .fromTo('.hero-cta', { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12 }, '-=0.4');

    /* ── Floating shapes continuous rotation ── */
    gsap.to('.floating-shape-1', { y: -20, rotation: 5, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.floating-shape-2', { y: 15, rotation: -3, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.floating-shape-3', { y: -12, rotation: 8, duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.floating-shape-4', { y: 10, scale: 1.1, duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.floating-shape-5', { y: -8, x: 5, duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.floating-shape-6', { y: 6, x: -4, duration: 3.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });

    /* ── Trusted-by section ── */
    gsap.fromTo('.trusted-section', { opacity: 0, y: 30 }, {
      opacity: 1, y: 0, duration: 0.8, ease: 'power2.out',
      scrollTrigger: { trigger: '.trusted-section', start: 'top 85%' }
    });

    /* ── How It Works stagger ── */
    gsap.fromTo('.step-card', { opacity: 0, y: 40 }, {
      opacity: 1, y: 0, duration: 0.7, stagger: 0.2, ease: 'power2.out',
      scrollTrigger: { trigger: '.how-section', start: 'top 75%' }
    });
    gsap.fromTo('.step-connector', { scaleX: 0 }, {
      scaleX: 1, duration: 0.6, stagger: 0.25, ease: 'power2.out',
      scrollTrigger: { trigger: '.how-section', start: 'top 70%' }
    });

    /* ── Audience cards ── */
    gsap.fromTo('.audience-card', { opacity: 0, y: 50 }, {
      opacity: 1, y: 0, duration: 0.8, stagger: 0.2, ease: 'power2.out',
      scrollTrigger: { trigger: '.audience-section', start: 'top 75%' }
    });

    /* ── Feature cards ── */
    gsap.fromTo('.feature-card', { opacity: 0, y: 30 }, {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out',
      scrollTrigger: { trigger: '.features-section', start: 'top 75%' }
    });

    /* ── Stats ── */
    gsap.fromTo('.stat-item', { opacity: 0, y: 30 }, {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: 'power2.out',
      scrollTrigger: { trigger: '.stats-section', start: 'top 80%' }
    });

    /* ── CTA ── */
    gsap.fromTo('.cta-section-inner', { opacity: 0, scale: 0.95 }, {
      opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out',
      scrollTrigger: { trigger: '.cta-section', start: 'top 80%' }
    });

  }, { scope: containerRef });

  return (
    <div ref={containerRef} className="relative flex min-h-screen w-full flex-col overflow-x-hidden font-sans bg-[#F6F9FC] text-[#4A4A4A]">

      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <header className="sticky top-0 z-50 bg-[#F6F9FC]/80 backdrop-blur-lg border-b border-white/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-3 md:py-4">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="size-7 text-[#0A2540]">
                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor" />
                </svg>
              </div>
              <h2 className="text-[#0A2540] text-lg md:text-xl font-bold leading-tight tracking-[-0.015em]">{t('brand.name')}</h2>
            </div>

            <nav className="hidden md:flex flex-1 justify-center items-center gap-8">
              <button onClick={onNavigateToAboutClients} className="text-[#4A4A4A] text-sm font-medium hover:text-[#0A2540] transition-colors">{t('landing.forClients')}</button>
              <button onClick={onNavigateToAboutSuppliers} className="text-[#4A4A4A] text-sm font-medium hover:text-[#0A2540] transition-colors">{t('landing.forSuppliers')}</button>
            </nav>

            <div className="flex gap-1.5 md:gap-2 items-center">
              <LanguageToggle variant="minimal" />
              <button
                data-testid="landing-login-button"
                onClick={onNavigateToLogin}
                className="hidden sm:flex min-w-[60px] md:min-w-[84px] cursor-pointer items-center justify-center rounded-xl h-9 md:h-10 px-3 md:px-5 bg-white/70 backdrop-blur text-[#0A2540] text-xs md:text-sm font-bold border border-[#0A2540]/10 hover:bg-white hover:border-[#0A2540]/30 transition-all duration-300"
              >
                <span className="truncate">{t('common.login')}</span>
              </button>
              <button
                onClick={onNavigateToGetStarted}
                className="hidden sm:flex min-w-[70px] md:min-w-[84px] cursor-pointer items-center justify-center rounded-xl h-9 md:h-10 px-3 md:px-5 bg-[#0A2540] text-white text-xs md:text-sm font-bold hover:bg-[#0d3157] transition-all duration-300 hover:shadow-lg hover:shadow-[#0A2540]/20"
              >
                <span className="truncate">{t('landing.getStarted')}</span>
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex md:hidden items-center justify-center size-11 rounded-lg hover:bg-gray-200 transition-colors"
                aria-label={t('common.toggleMenu')}
              >
                <span className="material-symbols-outlined text-[#0A2540]">
                  {mobileMenuOpen ? 'close' : 'menu'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white/95 backdrop-blur-lg border-b border-gray-200 shadow-lg">
            <div className="container mx-auto px-4 py-4">
              <nav className="flex flex-col gap-1 mb-4">
                <button onClick={() => { onNavigateToAboutClients(); setMobileMenuOpen(false); }} className="text-[#4A4A4A] text-base font-medium py-3 px-3 rounded-lg hover:bg-gray-100 text-start min-h-[44px]">{t('landing.forClients')}</button>
                <button onClick={() => { onNavigateToAboutSuppliers(); setMobileMenuOpen(false); }} className="text-[#4A4A4A] text-base font-medium py-3 px-3 rounded-lg hover:bg-gray-100 text-start min-h-[44px]">{t('landing.forSuppliers')}</button>
              </nav>
              <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => { onNavigateToLogin(); setMobileMenuOpen(false); }} className="w-full flex items-center justify-center rounded-lg h-11 px-4 bg-gray-200 text-[#4A4A4A] text-sm font-bold">{t('common.login')}</button>
                <button onClick={() => { onNavigateToGetStarted(); setMobileMenuOpen(false); }} className="w-full flex items-center justify-center rounded-lg h-11 px-4 bg-[#0A2540] text-white text-sm font-bold">{t('landing.getStarted')}</button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex flex-col">

        {/* ═══════════════════════ SECTION 1: HERO ═══════════════════════ */}
        <section className="relative min-h-[90vh] flex items-center overflow-hidden">
          {/* Gradient backdrop */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#F6F9FC] via-[#e8f0fe] to-[#d5f0ea]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(0,196,154,0.08),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(10,37,64,0.06),transparent_60%)]" />

          <FloatingShapes />

          <div className="relative container mx-auto px-4 py-20 md:py-28 text-center">
            {/* Badge */}
            <div className="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 backdrop-blur-sm border border-[#00C49A]/20 text-sm font-medium text-[#0A2540] mb-8 opacity-0">
              <span className="w-2 h-2 rounded-full bg-[#00C49A] animate-pulse" />
              {t('landing.heroBadge')}
            </div>

            {/* Title */}
            <h1 className="hero-title text-[#0A2540] text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[1.05] tracking-tighter max-w-5xl mx-auto mb-6 opacity-0">
              {t('landing.heroTitle')}
            </h1>

            {/* Subtitle */}
            <p className="hero-subtitle text-[#6b7280] text-lg md:text-xl lg:text-2xl max-w-2xl mx-auto mb-12 leading-relaxed opacity-0">
              {t('landing.heroSubtitle')}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={onNavigateToGetStarted}
                className="hero-cta group relative flex items-center justify-center rounded-2xl h-14 px-8 bg-[#0A2540] text-white text-base font-bold overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-[#0A2540]/30 hover:scale-[1.02] opacity-0"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-[#00C49A]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="relative">{t('landing.getStarted')}</span>
                <span className="relative material-symbols-outlined text-lg ms-2 transform group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
              <button
                data-testid="landing-hero-login-button"
                onClick={onNavigateToLogin}
                className="hero-cta flex items-center justify-center rounded-2xl h-14 px-8 bg-white/80 backdrop-blur-sm text-[#0A2540] text-base font-bold border border-[#0A2540]/10 hover:bg-white hover:border-[#0A2540]/25 hover:shadow-lg transition-all duration-500 hover:scale-[1.02] opacity-0"
              >
                {t('common.login')}
              </button>
            </div>
          </div>

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#F6F9FC] to-transparent" />
        </section>


        {/* ═══════════════════════ SECTION 2: TRUSTED BY ═══════════════════════ */}
        <section className="trusted-section py-12 md:py-16 bg-white/50 backdrop-blur-sm border-y border-gray-100">
          <div className="container mx-auto px-4">
            <p className="text-center text-sm font-medium text-[#6b7280] uppercase tracking-widest mb-8">{t('landing.trustedBy')}</p>
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-40">
              {['Enterprise A', 'Corp B', 'Group C', 'Holdings D', 'Industrial E'].map((name, i) => (
                <div key={i} className="flex items-center gap-2 text-[#0A2540]/60 font-bold text-lg md:text-xl tracking-tight">
                  <div className="w-8 h-8 rounded-lg bg-[#0A2540]/10 flex items-center justify-center text-xs font-black">{name[0]}</div>
                  {name}
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* ═══════════════════════ SECTION 3: HOW IT WORKS ═══════════════════════ */}
        <section className="how-section py-20 md:py-28 bg-[#F6F9FC]">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-[#0A2540] text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{t('landing.howItWorks.title')}</h2>
              <p className="text-[#6b7280] text-lg max-w-xl mx-auto">{t('landing.howItWorks.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 max-w-5xl mx-auto relative">
              {[
                { icon: 'edit_note', title: t('landing.howItWorks.step1Title'), desc: t('landing.howItWorks.step1Desc'), num: '01' },
                { icon: 'compare_arrows', title: t('landing.howItWorks.step2Title'), desc: t('landing.howItWorks.step2Desc'), num: '02' },
                { icon: 'inventory_2', title: t('landing.howItWorks.step3Title'), desc: t('landing.howItWorks.step3Desc'), num: '03' },
              ].map((step, i) => (
                <React.Fragment key={i}>
                  <div className="step-card relative flex flex-col items-center text-center px-6 md:px-8">
                    {/* Step number */}
                    <div className="text-6xl font-black text-[#00C49A]/10 absolute -top-4 select-none">{step.num}</div>
                    {/* Icon */}
                    <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0A2540] to-[#0d3157] flex items-center justify-center mb-6 shadow-lg shadow-[#0A2540]/20">
                      <span className="material-symbols-outlined text-white text-2xl">{step.icon}</span>
                    </div>
                    <h3 className="text-[#0A2540] text-xl font-bold mb-3">{step.title}</h3>
                    <p className="text-[#6b7280] text-sm leading-relaxed">{step.desc}</p>
                  </div>
                  {/* Connector */}
                  {i < 2 && (
                    <div className="step-connector hidden md:block absolute top-[52px] h-[2px] bg-gradient-to-r from-[#00C49A]/50 to-[#0A2540]/30 origin-left" style={{ left: `${(i + 1) * 33.33 - 5}%`, width: '10%' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>


        {/* ═══════════════════════ SECTION 4: FOR CLIENTS / SUPPLIERS ═══════════════════════ */}
        <section className="audience-section py-20 md:py-28 bg-white">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Clients Card */}
              <div
                className="audience-card group relative rounded-3xl p-8 md:p-10 bg-gradient-to-br from-[#f0f9ff] to-[#e0f2fe] border border-[#0A2540]/5 overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-[#0A2540]/10 hover:-translate-y-1 cursor-pointer"
                onClick={onNavigateToAboutClients}
                style={{ perspective: '1000px' }}
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#0A2540]/5 to-transparent rounded-bl-[100px]" />
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-[#0A2540] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-symbols-outlined text-white text-xl">shopping_bag</span>
                  </div>
                  <h3 className="text-[#0A2540] text-2xl md:text-3xl font-bold mb-4">{t('landing.forClients')}</h3>
                  <p className="text-[#6b7280] text-base leading-relaxed mb-6">{t('landing.forClientsDesc')}</p>
                  <span className="inline-flex items-center text-[#0A2540] font-bold text-sm group-hover:gap-3 gap-1 transition-all duration-300">
                    {t('landing.learnMore')} <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </span>
                </div>
              </div>

              {/* Suppliers Card */}
              <div
                className="audience-card group relative rounded-3xl p-8 md:p-10 bg-gradient-to-br from-[#ecfdf5] to-[#d1fae5] border border-[#00C49A]/10 overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-[#00C49A]/10 hover:-translate-y-1 cursor-pointer"
                onClick={onNavigateToAboutSuppliers}
                style={{ perspective: '1000px' }}
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#00C49A]/5 to-transparent rounded-bl-[100px]" />
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-[#00C49A] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                    <span className="material-symbols-outlined text-white text-xl">storefront</span>
                  </div>
                  <h3 className="text-[#0A2540] text-2xl md:text-3xl font-bold mb-4">{t('landing.forSuppliers')}</h3>
                  <p className="text-[#6b7280] text-base leading-relaxed mb-6">{t('landing.forSuppliersDesc')}</p>
                  <span className="inline-flex items-center text-[#00C49A] font-bold text-sm group-hover:gap-3 gap-1 transition-all duration-300">
                    {t('landing.learnMore')} <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* ═══════════════════════ SECTION 5: FEATURES GRID ═══════════════════════ */}
        <section className="features-section py-20 md:py-28 bg-gradient-to-b from-[#F6F9FC] to-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-[#0A2540] text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{t('landing.features.title', { brandName: t('brand.name') })}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                { icon: 'verified_user', title: t('landing.features.verified'), desc: t('landing.features.verifiedDesc'), color: '#00C49A' },
                { icon: 'price_check', title: t('landing.features.competitive'), desc: t('landing.features.competitiveDesc'), color: '#0A2540' },
                { icon: 'bolt', title: t('landing.features.streamlined'), desc: t('landing.features.streamlinedDesc'), color: '#6366f1' },
                { icon: 'visibility_off', title: t('landing.features.anonymous'), desc: t('landing.features.anonymousDesc'), color: '#f59e0b' },
                { icon: 'analytics', title: t('landing.features.analytics'), desc: t('landing.features.analyticsDesc'), color: '#3b82f6' },
                { icon: 'lock', title: t('landing.features.secure'), desc: t('landing.features.secureDesc'), color: '#10b981' },
              ].map((feat, i) => (
                <div
                  key={i}
                  className="feature-card group relative rounded-2xl p-6 md:p-8 bg-white/70 backdrop-blur-sm border border-gray-200/50 transition-all duration-500 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1 hover:bg-white"
                >
                  {/* Glassmorphism overlay on hover */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-500 group-hover:scale-110"
                      style={{ backgroundColor: `${feat.color}15` }}
                    >
                      <span className="material-symbols-outlined text-xl" style={{ color: feat.color }}>{feat.icon}</span>
                    </div>
                    <h3 className="text-[#0A2540] text-lg font-bold mb-2">{feat.title}</h3>
                    <p className="text-[#6b7280] text-sm leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* ═══════════════════════ SECTION 6: STATS ═══════════════════════ */}
        <section className="stats-section py-20 md:py-24 bg-[#0A2540] relative overflow-hidden">
          {/* BG pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '40px 40px'
            }} />
          </div>
          <div className="absolute top-0 left-0 w-96 h-96 bg-[#00C49A]/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#3b82f6]/10 rounded-full blur-[120px]" />

          <div className="container mx-auto px-4 relative">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 max-w-5xl mx-auto">
              {[
                { value: 250, suffix: '+', label: t('landing.stats.suppliers') },
                { value: 10000, suffix: '+', label: t('landing.stats.transactions') },
                { value: 98, suffix: '%', label: t('landing.stats.satisfaction') },
                { value: 150, suffix: '+', label: t('landing.stats.categories') },
              ].map((stat, i) => (
                <div key={i} className="stat-item text-center">
                  <div className="text-3xl md:text-5xl font-black text-white mb-2">
                    <AnimatedCounter end={stat.value} suffix={stat.suffix} />
                  </div>
                  <p className="text-white/60 text-sm md:text-base font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* ═══════════════════════ SECTION 7: CTA ═══════════════════════ */}
        <section className="cta-section py-20 md:py-28 bg-white">
          <div className="container mx-auto px-4">
            <div className="cta-section-inner max-w-4xl mx-auto rounded-3xl bg-gradient-to-br from-[#0A2540] via-[#0d3157] to-[#0A2540] p-10 md:p-16 text-center relative overflow-hidden">
              {/* Decorative */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#00C49A]/10 rounded-full blur-[80px]" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full blur-[60px]" />

              <div className="relative">
                <h2 className="text-white text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">{t('landing.cta.title')}</h2>
                <p className="text-white/70 text-lg md:text-xl mb-10 max-w-xl mx-auto">{t('landing.cta.subtitle')}</p>
                <button
                  onClick={onNavigateToGetStarted}
                  className="group relative inline-flex items-center justify-center rounded-2xl h-14 px-10 bg-[#00C49A] text-[#0A2540] text-base font-bold overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-[#00C49A]/30 hover:scale-[1.03]"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span className="relative">{t('landing.cta.button')}</span>
                  <span className="relative material-symbols-outlined text-lg ms-2 transform group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </section>


        {/* ═══════════════════════ FOOTER ═══════════════════════ */}
        <footer className="bg-[#0A2540] text-white">
          <div className="container mx-auto px-4 py-16">
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-12">
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="size-7 text-white">
                    <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M44 4H30.6666V17.3334H17.3334V30.6666H4V44H44V4Z" fill="currentColor" /></svg>
                  </div>
                  <h2 className="text-white text-xl font-bold">{t('brand.name')}</h2>
                </div>
                <p className="text-sm text-gray-400 max-w-sm">{t('landing.heroSubtitle')}</p>
              </div>
              <div className="flex flex-col gap-4">
                <h4 className="font-bold text-white">{t('footer.platform')}</h4>
                <button onClick={onNavigateToAboutClients} className="text-sm text-gray-400 hover:text-white transition-colors text-start">{t('landing.forClients')}</button>
                <button onClick={onNavigateToAboutSuppliers} className="text-sm text-gray-400 hover:text-white transition-colors text-start">{t('landing.forSuppliers')}</button>
              </div>
            </div>
            <div className="mt-12 border-t border-gray-100/10 pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
              <p>{t('footer.copyright', { brandName: t('brand.name') })}</p>
            </div>
          </div>
        </footer>

      </main>

      {/* ═══════════════════════ 3D SHAPE STYLES ═══════════════════════ */}
      <style>{`
        /* ── Floating Shapes ── */
        .floating-shape {
          position: absolute;
          z-index: 1;
        }

        .shape-3d {
          width: 60px;
          height: 60px;
          transform-style: preserve-3d;
          animation: shape-rotate 20s linear infinite;
        }

        .shape-3d.cube-accent { width: 45px; height: 45px; animation-duration: 25s; animation-direction: reverse; }

        @keyframes shape-rotate {
          from { transform: rotateX(0deg) rotateY(0deg); }
          to { transform: rotateX(360deg) rotateY(360deg); }
        }

        /* Cube faces */
        .cube { position: relative; }
        .cube-face {
          position: absolute;
          width: 100%;
          height: 100%;
          border: 1.5px solid rgba(10, 37, 64, 0.12);
          background: rgba(10, 37, 64, 0.03);
          border-radius: 4px;
        }
        .cube-accent .cube-face {
          border-color: rgba(0, 196, 154, 0.15);
          background: rgba(0, 196, 154, 0.04);
        }
        .cube-front  { transform: translateZ(30px); }
        .cube-back   { transform: rotateY(180deg) translateZ(30px); }
        .cube-right  { transform: rotateY(90deg) translateZ(30px); }
        .cube-left   { transform: rotateY(-90deg) translateZ(30px); }
        .cube-top    { transform: rotateX(90deg) translateZ(30px); }
        .cube-bottom { transform: rotateX(-90deg) translateZ(30px); }

        .cube-accent .cube-front  { transform: translateZ(22.5px); }
        .cube-accent .cube-back   { transform: rotateY(180deg) translateZ(22.5px); }
        .cube-accent .cube-right  { transform: rotateY(90deg) translateZ(22.5px); }
        .cube-accent .cube-left   { transform: rotateY(-90deg) translateZ(22.5px); }
        .cube-accent .cube-top    { transform: rotateX(90deg) translateZ(22.5px); }
        .cube-accent .cube-bottom { transform: rotateX(-90deg) translateZ(22.5px); }

        /* Prism / tetrahedron */
        .prism {
          width: 50px; height: 50px;
          animation-duration: 30s;
        }
        .prism-face {
          position: absolute;
          width: 0; height: 0;
          border-left: 25px solid transparent;
          border-right: 25px solid transparent;
          border-bottom: 43px solid rgba(99, 102, 241, 0.08);
        }
        .prism-front  { transform: rotateX(19.5deg) translateZ(10px); }
        .prism-left   { transform: rotateY(-120deg) rotateX(19.5deg) translateZ(10px); }
        .prism-right  { transform: rotateY(120deg) rotateX(19.5deg) translateZ(10px); }
        .prism-bottom { transform: rotateX(90deg) translateZ(20px); border-bottom-color: rgba(99, 102, 241, 0.04); }

        /* Sphere */
        .shape-sphere {
          width: 40px; height: 40px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(0, 196, 154, 0.15), rgba(0, 196, 154, 0.03));
          border: 1px solid rgba(0, 196, 154, 0.1);
        }

        /* Dots */
        .shape-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: rgba(10, 37, 64, 0.15);
        }
        .shape-dot-sm {
          width: 5px; height: 5px;
          background: rgba(0, 196, 154, 0.2);
        }

        /* ── Mobile adjustments ── */
        @media (max-width: 768px) {
          .floating-shape { opacity: 0.5; }
          .shape-3d { width: 40px; height: 40px; }
          .cube-front  { transform: translateZ(20px); }
          .cube-back   { transform: rotateY(180deg) translateZ(20px); }
          .cube-right  { transform: rotateY(90deg) translateZ(20px); }
          .cube-left   { transform: rotateY(-90deg) translateZ(20px); }
          .cube-top    { transform: rotateX(90deg) translateZ(20px); }
          .cube-bottom { transform: rotateX(-90deg) translateZ(20px); }
        }
      `}</style>
    </div>
  );
};
