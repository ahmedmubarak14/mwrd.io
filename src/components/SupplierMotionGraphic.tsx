import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

export const SupplierMotionGraphic: React.FC = () => {
    const { t, i18n } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const isAr = i18n.language === 'ar';

    useGSAP(() => {
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });

        // Step 1: Getting Notified
        tl.fromTo('.supp-pulse', { scale: 0.5, opacity: 1 }, { scale: 2.5, opacity: 0, duration: 1.5, ease: 'power2.out', repeat: 1 })
            .fromTo('.supp-bell', { rotation: -15 }, { rotation: 15, duration: 0.1, yoyo: true, repeat: 5 }, 0)
            .fromTo('.supp-badge', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, 0.2);

        // Step 2: Reviewing RFQ
        tl.fromTo('.supp-rfq', { y: 40, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }, '+=0.2')
            .to('.supp-badge', { opacity: 0, scale: 0, duration: 0.2 }, '<')
            .to('.supp-bell', { opacity: 0, y: -10, duration: 0.3 }, '<')
            .to('.supp-rfq-item', { opacity: 1, x: 0, duration: 0.3, stagger: 0.1, ease: 'power2.out' }, '+=0.2');

        // Step 3: Compiling & Sending Quote
        tl.fromTo('.supp-quote-btn', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.5)' }, '+=0.3')
            .to('.supp-quote-btn', { backgroundColor: '#00C49A', color: 'white', duration: 0.2 }, '+=0.2')
            .to('.supp-rfq', { scale: 0.8, x: -100, opacity: 0, duration: 0.5, ease: 'power2.in' }, '+=0.2')
            .to('.supp-quote-btn', { scale: 1.5, x: 50, y: -80, opacity: 0, duration: 0.6, ease: 'power2.in' }, '<');

        // Step 4: Deal Won Animation
        tl.fromTo('.supp-win', { scale: 0.5, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.7)' }, '-=0.1')
            .to('.supp-confetti', { y: 'random(-50, 50)', x: 'random(-50, 50)', opacity: 1, scale: 'random(0.5, 1.5)', duration: 0.5, stagger: 0.05, ease: 'power2.out' }, '<')
            .to('.supp-win-amt', { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.5)' }, '+=0.2');

        // Fade out
        tl.to(['.supp-win', '.supp-confetti', '.supp-win-amt'], { opacity: 0, y: -20, duration: 0.5, stagger: 0.1 }, '+=1.5');

    }, { scope: containerRef });

    return (
        <div ref={containerRef} className="bg-gradient-to-br from-[#0A2540]/10 to-[#00C49A]/15 rounded-3xl p-8 h-full min-h-[400px] w-full flex items-center justify-center relative overflow-hidden shadow-inner border border-white/40">

            {/* Decorative background grid */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #0A2540 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

            {/* Notification State */}
            <div className="absolute flex flex-col items-center justify-center z-10">
                <div className="supp-pulse absolute w-16 h-16 bg-[#00C49A]/30 rounded-full"></div>
                <div className="supp-bell w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center text-[#0A2540] relative z-20">
                    <span className="material-symbols-outlined text-3xl">notifications_active</span>
                    <div className="supp-badge absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-md border-2 border-white">
                        1
                    </div>
                </div>
            </div>

            {/* RFQ Review State */}
            <div className="supp-rfq absolute bg-white/95 backdrop-blur-sm p-5 rounded-2xl shadow-xl border border-white z-20 w-56 opacity-0 flex flex-col items-center">
                <div className="w-full flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#0A2540]/10 flex items-center justify-center text-[#0A2540]">
                            <span className="material-symbols-outlined text-sm">business_center</span>
                        </div>
                        <div className="text-xs font-bold text-[#0A2540] m-0 leading-none">{isAr ? 'احتياجات العميل' : 'Client Needs'}</div>
                    </div>
                    <span className="bg-[#00C49A]/20 text-[#00C49A] text-[9px] font-bold px-2 py-1 rounded-md">{isAr ? 'عاجل' : 'Urgent'}</span>
                </div>

                <div className="w-full space-y-2 mb-4">
                    <div className="supp-rfq-item opacity-0 -translate-x-4 flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <div className="w-6 h-6 rounded bg-gray-200"></div>
                        <div className="h-1.5 w-16 bg-gray-300 rounded-full"></div>
                        <div className="h-1.5 w-6 bg-gray-200 rounded-full ml-auto"></div>
                    </div>
                    <div className="supp-rfq-item opacity-0 -translate-x-4 flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <div className="w-6 h-6 rounded bg-gray-200"></div>
                        <div className="h-1.5 w-12 bg-gray-300 rounded-full"></div>
                        <div className="h-1.5 w-8 bg-gray-200 rounded-full ml-auto"></div>
                    </div>
                </div>

                <div className="supp-quote-btn w-full py-2 bg-[#0A2540] text-white rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-default flex-row-reverse" dir="ltr">
                    <span className="material-symbols-outlined text-sm" style={{ transform: isAr ? 'scaleX(-1)' : 'none' }}>send</span>
                    <span>{isAr ? 'إرسال عرض السعر' : 'Send Quote'}</span>
                </div>
            </div>

            {/* Win State */}
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                {/* Confetti particles */}
                {[...Array(6)].map((_, i) => (
                    <div key={i} className={`supp-confetti absolute w-3 h-3 rounded-full opacity-0 ${['bg-[#00C49A]', 'bg-[#0A2540]', 'bg-yellow-400', 'bg-blue-400'][i % 4]}`}></div>
                ))}

                <div className="supp-win flex flex-col items-center justify-center w-36 h-36 bg-gradient-to-tr from-[#00C49A] to-[#0fdcba] rounded-full shadow-2xl border-4 border-white opacity-0 relative">
                    <div className="absolute inset-0 rounded-full bg-white/20 blur-md"></div>
                    <span className="material-symbols-outlined text-white text-6xl relative z-10 drop-shadow-md">handshake</span>

                    <div className="supp-win-amt absolute -bottom-4 bg-white px-4 py-1.5 rounded-full shadow-lg border border-gray-100 opacity-0 translate-y-4 flex items-center gap-1 min-w-max flex-row-reverse">
                        <span className="material-symbols-outlined text-[#00C49A] text-sm" style={{ transform: isAr ? 'scaleX(-1)' : 'none' }}>trending_up</span>
                        <span className="text-[#0A2540] font-bold text-sm">{isAr ? 'تمت البيعة' : 'Sale Closed'}</span>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none z-40">
                <span className="bg-white/60 backdrop-blur-sm px-4 py-1.5 rounded-full text-[#0A2540] text-sm font-bold shadow-sm inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#0A2540] text-sm">monitoring</span>
                    {t('about.suppliers.imageCaption')}
                </span>
            </div>
        </div>
    );
};
