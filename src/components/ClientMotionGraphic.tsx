import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

export const ClientMotionGraphic: React.FC = () => {
    const { t, i18n } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const isAr = i18n.language === 'ar';

    useGSAP(() => {
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });

        // Step 1: RFQ Post
        tl.fromTo('.client-rfq-doc', { y: 30, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.5)' })
            .to('.client-rfq-line', { width: '100%', duration: 0.4, stagger: 0.1, ease: 'power2.out' }, '+=0.2');

        // Step 2: Receiving Quotes
        tl.fromTo('.client-quote-1', { x: -40, opacity: 0, scale: 0.8 }, { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.2)' }, '+=0.3')
            .fromTo('.client-quote-3', { x: 40, opacity: 0, scale: 0.8 }, { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.2)' }, '-=0.3')
            .fromTo('.client-quote-2', { y: 40, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.4)' }, '-=0.2');

        // Step 3: Analytical comparison glow
        tl.to('.client-quote-1, .client-quote-2, .client-quote-3', { y: -5, duration: 0.3, yoyo: true, repeat: 1, stagger: 0.1 }, '+=0.2');

        // Step 4: Selecting Best Quote (#2)
        tl.to('.client-quote-1, .client-quote-3', { opacity: 0, scale: 0.8, y: 20, duration: 0.4 }, '+=0.2')
            .to('.client-quote-2', {
                scale: 1.2,
                backgroundColor: '#00C49A',
                color: 'white',
                borderColor: '#00C49A',
                duration: 0.4,
                ease: 'power2.out'
            }, '<')
            .to('.client-quote-2 .icon', { color: 'white', duration: 0.4 }, '<')
            .to('.client-quote-2 .quote-price', { color: 'white', duration: 0.4 }, '<');

        // Step 5: Converging to final order
        tl.to('.client-rfq-doc', { opacity: 0, scale: 0.8, duration: 0.3 }, '+=0.4')
            .to('.client-quote-2', { opacity: 0, scale: 0.5, y: -40, duration: 0.4, ease: 'power2.in' }, '<')
            .fromTo('.client-package', { scale: 0, opacity: 0, rotation: -10 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.7, ease: 'elastic.out(1, 0.6)' }, '-=0.1')
            .to('.client-package-check', { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, '-=0.2');

        // Fade out everything to restart
        tl.to('.client-package', { opacity: 0, y: -20, duration: 0.5, delay: 1.5 });

    }, { scope: containerRef });

    return (
        <div ref={containerRef} className="bg-gradient-to-br from-[#00C49A]/15 to-[#0A2540]/10 rounded-3xl p-8 h-full min-h-[400px] w-full flex items-center justify-center relative overflow-hidden shadow-inner border border-white/40">

            {/* Decorative background circles */}
            <div className="absolute top-10 right-10 w-32 h-32 bg-white/20 rounded-full blur-2xl"></div>
            <div className="absolute bottom-10 left-10 w-40 h-40 bg-[#00C49A]/10 rounded-full blur-2xl"></div>

            {/* State 1: RFQ Document */}
            <div className="client-rfq-doc absolute flex flex-col bg-white/90 backdrop-blur p-5 rounded-2xl shadow-xl border border-white z-10 w-48">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#0A2540]/10 flex items-center justify-center text-[#0A2540]">
                        <span className="material-symbols-outlined">edit_document</span>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-[#0A2540]">{isAr ? 'طلب تسعير جديد' : 'New RFQ'}</div>
                        <div className="text-[10px] text-gray-500">{isAr ? 'رقم:' : 'ID:'} #4092</div>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="client-rfq-line h-1.5 w-0 bg-gray-200 rounded-full"></div>
                    <div className="client-rfq-line h-1.5 w-0 bg-gray-200 rounded-full"></div>
                    <div className="client-rfq-line h-1.5 w-0 bg-gray-200 rounded-full"></div>
                </div>
            </div>

            {/* State 2: Incoming Quotes */}
            <div className="client-quote-1 absolute top-[20%] left-[8%] flex items-center gap-3 bg-white p-3 py-2 rounded-xl shadow-lg border border-gray-100 opacity-0 z-20">
                <span className="icon material-symbols-outlined text-gray-400 text-lg">storefront</span>
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">{isAr ? 'المورد أ' : 'Supplier A'}</span>
                    <span className="quote-price font-bold text-[#0A2540] text-sm flex gap-1 items-baseline" dir={isAr ? 'rtl' : 'ltr'}>
                        <span className="text-xs">{t('common.currencySymbol', 'SAR')}</span>
                        <span>2,450</span>
                    </span>
                </div>
            </div>

            <div className="client-quote-3 absolute top-[25%] right-[8%] flex items-center gap-3 bg-white p-3 py-2 rounded-xl shadow-lg border border-gray-100 opacity-0 z-20 relative top-10">
                <span className="icon material-symbols-outlined text-gray-400 text-lg">storefront</span>
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">{isAr ? 'المورد ج' : 'Supplier C'}</span>
                    <span className="quote-price font-bold text-[#0A2540] text-sm flex gap-1 items-baseline" dir={isAr ? 'rtl' : 'ltr'}>
                        <span className="text-xs">{t('common.currencySymbol', 'SAR')}</span>
                        <span>2,600</span>
                    </span>
                </div>
            </div>

            <div className="client-quote-2 absolute bottom-[20%] left-[50%] -translate-x-[50%] flex items-center gap-3 bg-white p-4 py-3 rounded-2xl shadow-2xl border border-[#00C49A]/30 opacity-0 z-30">
                <div className="w-8 h-8 rounded-full bg-[#00C49A]/10 flex items-center justify-center">
                    <span className="icon material-symbols-outlined text-[#00C49A] text-lg">verified</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 font-medium">{isAr ? 'المورد ب' : 'Supplier B'}</span>
                    <span className="quote-price font-black text-[#0A2540] text-base flex gap-1 items-baseline" dir={isAr ? 'rtl' : 'ltr'}>
                        <span className="text-xs font-bold">{t('common.currencySymbol', 'SAR')}</span>
                        <span>2,100</span>
                    </span>
                </div>
            </div>

            {/* State 3: Final Package */}
            <div className="client-package absolute flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#0A2540] to-[#0d3157] rounded-3xl shadow-2xl z-40 opacity-0 border border-white/10">
                <div className="relative">
                    <span className="material-symbols-outlined text-white text-6xl mb-3 drop-shadow-lg">inventory_2</span>
                    <div className="client-package-check absolute -top-2 -right-2 w-8 h-8 bg-[#00C49A] rounded-full flex items-center justify-center shadow-lg opacity-0 scale-0 border-2 border-[#0A2540]">
                        <span className="material-symbols-outlined text-white text-sm font-bold">check</span>
                    </div>
                </div>
                <span className="text-white font-bold text-base tracking-wide mt-2">{isAr ? 'جاهز للشحن' : 'Ready to Ship'}</span>
            </div>

            <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
                <span className="bg-white/60 backdrop-blur-sm px-4 py-1.5 rounded-full text-[#0A2540] text-sm font-bold shadow-sm inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#00C49A] text-sm">auto_awesome</span>
                    {t('about.clients.imageCaption')}
                </span>
            </div>
        </div>
    );
};
